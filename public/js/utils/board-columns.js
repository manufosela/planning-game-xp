/**
 * Board columns — config + helpers for the per-project Kanban board.
 *
 * Single source of truth for the column schema, default generation and
 * mutation helpers used by both the frontend and any future MCP tool.
 * Mirror at public/js/utils/board-columns.js (Astro does not serve
 * /shared/ to the browser); tests/shared/board-columns-mirror.test.js
 * enforces both copies stay byte-identical.
 *
 * Data layout in RTDB:
 *   /projects/{projectId}/board/columns/{colId} = {
 *     id, name, order, wipLimit, statusKey
 *   }
 *
 * Notes:
 *  - `id` is a stable string (defaults match the statusKey but can drift).
 *  - `wipLimit` is null when there is no cap.
 *  - `statusKey` maps the column to a real task status of the PG; if a
 *    status has no column, its cards land in a synthetic "Backlog" or
 *    fall back to the first column with the same statusKey.
 */

export const DEFAULT_TASK_STATUSES = [
  'To Do',
  'In Progress',
  'To Validate',
  'Done&Validated',
  'Blocked'
];

export function slugifyStatus(status) {
  return String(status || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build the canonical column object.
 * @param {Object} input
 * @returns {{id:string,name:string,order:number,wipLimit:(number|null),statusKey:string}}
 */
export function buildColumn({ id, name, order, wipLimit, statusKey }) {
  const statusKeyClean = String(statusKey || '').trim();
  if (!statusKeyClean) throw new Error('Column requires a non-empty statusKey.');
  const cleanName = String(name || statusKeyClean).trim();
  if (!cleanName) throw new Error('Column requires a non-empty name.');
  const cleanId = String(id || slugifyStatus(statusKeyClean)).trim();
  if (!cleanId) throw new Error('Column requires a non-empty id.');
  const wip = wipLimit === undefined || wipLimit === null || wipLimit === '' ? null : Number(wipLimit);
  if (wip !== null && (!Number.isFinite(wip) || wip < 0)) {
    throw new Error('wipLimit must be null or a non-negative number.');
  }
  const ord = Number.isFinite(Number(order)) ? Number(order) : 0;
  return { id: cleanId, name: cleanName, order: ord, wipLimit: wip, statusKey: statusKeyClean };
}

/**
 * Generate the default column set for a project from a list of task statuses.
 * Falls back to DEFAULT_TASK_STATUSES when no input is provided.
 *
 * @param {string[]} [statuses=DEFAULT_TASK_STATUSES]
 * @returns {Object[]}
 */
export function generateDefaultColumns(statuses) {
  const source = Array.isArray(statuses) && statuses.length > 0 ? statuses : DEFAULT_TASK_STATUSES;
  return source
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .map((status, index) => buildColumn({
      id: slugifyStatus(status),
      name: status,
      order: index,
      wipLimit: null,
      statusKey: status
    }));
}

/**
 * Normalize a raw columns map/array coming from RTDB into a sorted array
 * of column objects. Invalid entries are dropped silently.
 *
 * @param {Object|Array|null} raw
 * @returns {Object[]}
 */
export function normalizeColumns(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : Object.values(raw);
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    try {
      out.push(buildColumn(item));
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * Reorder a set of columns so they expose a contiguous 0..N-1 `order`,
 * after a logical move (move column with id `id` to index `targetIndex`).
 * Does not mutate the input; returns a fresh array.
 *
 * @param {Object[]} columns
 * @param {string} id
 * @param {number} targetIndex
 * @returns {Object[]}
 */
export function moveColumn(columns, id, targetIndex) {
  const sorted = normalizeColumns(columns);
  const fromIndex = sorted.findIndex((c) => c.id === id);
  if (fromIndex === -1) return sorted;
  const safeTarget = Math.max(0, Math.min(targetIndex, sorted.length - 1));
  if (safeTarget === fromIndex) return sorted;
  const [moved] = sorted.splice(fromIndex, 1);
  sorted.splice(safeTarget, 0, moved);
  return sorted.map((c, idx) => ({ ...c, order: idx }));
}

/**
 * Validate that two columns do not map to the same statusKey unless
 * `allowDuplicates` is true. Returns an array of duplicate statusKeys.
 *
 * @param {Object[]} columns
 * @returns {string[]}
 */
export function findDuplicateStatusKeys(columns) {
  const seen = new Map();
  for (const col of columns) {
    const key = col.statusKey;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k);
}

/**
 * Card flags considered "expedite" (urgent items that bypass WIP enforcement).
 * Matches the spec at docs/prompts/kanban-real-boards.md.
 *
 * @param {Object} card
 * @returns {boolean}
 */
export function isExpediteCard(card) {
  if (!card) return false;
  if (card.expedite === true) return true;
  if (card.expedited === true) return true;
  if (typeof card.priorityClass === 'string' && /expedite|urgent/i.test(card.priorityClass)) return true;
  if (typeof card.priority === 'string' && /expedite|urgent|hotfix/i.test(card.priority)) return true;
  return false;
}

/**
 * WIP status for a column given the current card count.
 *  - `none`      → column has no limit configured
 *  - `under`     → count below the limit
 *  - `at-limit`  → count equals the limit
 *  - `over-limit`→ count strictly greater than the limit
 *
 * @param {{wipLimit: (number|null)}} column
 * @param {number} count
 * @returns {'none'|'under'|'at-limit'|'over-limit'}
 */
export function computeWipStatus(column, count) {
  const limit = column?.wipLimit;
  if (limit === null || limit === undefined) return 'none';
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) return 'none';
  const n = Number(count) || 0;
  if (n < limit) return 'under';
  if (n === limit) return 'at-limit';
  return 'over-limit';
}

/**
 * Decide whether a card drop on a column must be blocked.
 *
 * Honors the project-level `enforceWip` flag and bypasses the block
 * when the card is marked expedite. A card already in the column does
 * NOT count for its own move when `card.currentColumnId` matches.
 *
 * @param {Object} params
 * @param {Object} params.column
 * @param {number} params.currentCount - Cards currently in the column (before move).
 * @param {Object} params.card - Card being dropped.
 * @param {boolean} [params.enforceWip=false]
 * @returns {{ blocked: boolean, reason: string|null }}
 */
export function shouldBlockDrop({ column, currentCount, card, enforceWip = false }) {
  if (!enforceWip) return { blocked: false, reason: null };
  const status = computeWipStatus(column, Number(currentCount) || 0);
  if (status !== 'at-limit' && status !== 'over-limit') return { blocked: false, reason: null };
  if (isExpediteCard(card)) {
    return { blocked: false, reason: 'expedite-bypass' };
  }
  return {
    blocked: true,
    reason: `Columna "${column?.name || column?.id || 'destino'}" al límite WIP (${column?.wipLimit}). enforceWip activo.`
  };
}

/**
 * Count cards already bucketed by column id. Convenience wrapper around
 * bucketCardsByColumn for UI consumers that only need the counts.
 *
 * @param {Object[]} columns
 * @param {Object[]} cards
 * @returns {Object<string, number>}
 */
export function countCardsPerColumn(columns, cards) {
  const { byColumn } = bucketCardsByColumn(columns, cards);
  const counts = {};
  for (const [colId, list] of Object.entries(byColumn)) counts[colId] = list.length;
  return counts;
}

/**
 * Bucket a list of cards by column. Cards whose status maps to a column's
 * statusKey land there. Cards whose status doesn't match any column land
 * in the returned `unbucketed` array.
 *
 * @param {Object[]} columns
 * @param {Object[]} cards
 * @returns {{byColumn: Object<string, Object[]>, unbucketed: Object[]}}
 */
export function bucketCardsByColumn(columns, cards) {
  const byColumn = {};
  for (const col of columns) byColumn[col.id] = [];
  const unbucketed = [];
  const statusToColumnId = new Map();
  for (const col of columns) {
    if (!statusToColumnId.has(col.statusKey)) {
      statusToColumnId.set(col.statusKey, col.id);
    }
  }
  for (const card of cards || []) {
    if (!card || card.deletedAt) continue;
    const colId = statusToColumnId.get(card.status);
    if (colId) byColumn[colId].push(card);
    else unbucketed.push(card);
  }
  return { byColumn, unbucketed };
}

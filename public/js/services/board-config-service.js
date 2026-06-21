/**
 * Board config service — reads and writes the per-project Kanban board
 * column configuration in RTDB.
 *
 * Path: /projects/{projectId}/board/columns
 *
 * Source of truth for the column schema is /shared/board-columns.js
 * (mirrored at /js/utils/board-columns.js for the browser). This service
 * is the thin Firebase wrapper around it.
 */

import { database, ref, get, set, update, remove } from '../../firebase-config.js';
import {
  DEFAULT_TASK_STATUSES,
  buildColumn,
  generateDefaultColumns,
  normalizeColumns,
  moveColumn
} from '/js/utils/board-columns.js';

const COLUMNS_PATH = (projectId) => `/projects/${projectId}/board/columns`;
const ENFORCE_WIP_PATH = (projectId) => `/projects/${projectId}/board/enforceWip`;

/**
 * Read the project-level enforceWip flag.
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
export async function getEnforceWip(projectId) {
  if (!projectId) return false;
  try {
    const snap = await get(ref(database, ENFORCE_WIP_PATH(projectId)));
    return Boolean(snap.val());
  } catch {
    return false;
  }
}

/**
 * Write the project-level enforceWip flag.
 * @param {string} projectId
 * @param {boolean} enabled
 * @returns {Promise<boolean>}
 */
export async function setEnforceWip(projectId, enabled) {
  if (!projectId) throw new Error('projectId is required');
  const value = Boolean(enabled);
  await set(ref(database, ENFORCE_WIP_PATH(projectId)), value);
  return value;
}

/**
 * Load the column configuration for a project. If none exists, generate
 * the defaults from DEFAULT_TASK_STATUSES and persist them so subsequent
 * reads are stable across users.
 *
 * @param {string} projectId
 * @returns {Promise<Object[]>}
 */
export async function loadColumnsForProject(projectId) {
  if (!projectId) throw new Error('projectId is required');
  const snap = await get(ref(database, COLUMNS_PATH(projectId)));
  if (snap.exists()) {
    const columns = normalizeColumns(snap.val());
    if (columns.length > 0) return columns;
    // Snapshot existed but every entry was malformed/invalid → regenerate
    // the defaults so the board is usable instead of a silent zero-cols
    // state.
  }
  const defaults = generateDefaultColumns(DEFAULT_TASK_STATUSES);
  await saveColumns(projectId, defaults);
  return defaults;
}

/**
 * Replace the whole column configuration for a project (overwrites).
 * Useful after a bulk reorder or rename.
 *
 * @param {string} projectId
 * @param {Object[]} columns
 * @returns {Promise<Object[]>}
 */
export async function saveColumns(projectId, columns) {
  if (!projectId) throw new Error('projectId is required');
  const normalized = normalizeColumns(columns);
  const map = {};
  for (const col of normalized) map[col.id] = col;
  await set(ref(database, COLUMNS_PATH(projectId)), map);
  return normalized;
}

/**
 * Add or update a single column (upsert by id).
 * @param {string} projectId
 * @param {Object} column
 * @returns {Promise<Object>}
 */
export async function upsertColumn(projectId, column) {
  const col = buildColumn(column);
  await set(ref(database, `${COLUMNS_PATH(projectId)}/${col.id}`), col);
  return col;
}

/**
 * Remove a column by id. The caller is responsible for migrating any
 * cards that pointed at it (out of scope for Phase 1).
 *
 * @param {string} projectId
 * @param {string} columnId
 * @returns {Promise<void>}
 */
export async function removeColumn(projectId, columnId) {
  await remove(ref(database, `${COLUMNS_PATH(projectId)}/${columnId}`));
}

/**
 * Move a column to a new index and persist the resulting order set.
 * @param {string} projectId
 * @param {Object[]} currentColumns
 * @param {string} columnId
 * @param {number} targetIndex
 * @returns {Promise<Object[]>}
 */
export async function moveColumnAndPersist(projectId, currentColumns, columnId, targetIndex) {
  const reordered = moveColumn(currentColumns, columnId, targetIndex);
  const updates = {};
  for (const col of reordered) updates[`${COLUMNS_PATH(projectId)}/${col.id}/order`] = col.order;
  await update(ref(database), updates);
  return reordered;
}

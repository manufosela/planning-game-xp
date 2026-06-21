/**
 * Board move service — helpers to compute board rank values for cards
 * and to persist a board move (status change + rank + column) atomically.
 *
 * The rank scheme is an integer with `RANK_STEP` gaps so that inserting
 * between two cards is a simple midpoint. When two consecutive ranks
 * become too close to fit a new one, a project-wide respread is required.
 */

import { database, ref, update, runTransaction, push, set } from '../../firebase-config.js';

export const RANK_STEP = 1000;

/**
 * Return a rank for placing an item at `index` in a list whose other
 * items have the sorted ranks given. Pure function; throws when the
 * neighbors are too close and a respread is required.
 *
 * @param {number[]} sortedRanks - existing ranks, in display order.
 * @param {number} index - target index in the resulting list (0..N).
 * @returns {number}
 */
export function assignRankAtIndex(sortedRanks, index) {
  const arr = Array.isArray(sortedRanks) ? sortedRanks.slice().sort((a, b) => a - b) : [];
  if (arr.length === 0) return RANK_STEP;
  if (index <= 0) return arr[0] - RANK_STEP;
  if (index >= arr.length) return arr[arr.length - 1] + RANK_STEP;
  const prev = arr[index - 1];
  const next = arr[index];
  const mid = Math.floor((prev + next) / 2);
  if (mid <= prev || mid >= next) {
    throw new Error('rank-respread-required');
  }
  return mid;
}

/**
 * Whether the given sorted ranks need a respread (any two consecutive
 * items closer than 2 units).
 *
 * @param {number[]} sortedRanks
 * @returns {boolean}
 */
export function ranksNeedRespread(sortedRanks) {
  const arr = Array.isArray(sortedRanks) ? sortedRanks.slice().sort((a, b) => a - b) : [];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] - arr[i - 1] < 2) return true;
  }
  return false;
}

/**
 * Compute a respread map: assign RANK_STEP, 2*RANK_STEP, ... to the
 * given list in order. Returns { [itemId]: newRank }.
 *
 * @param {{id: string}[]} items - In the desired final order.
 * @returns {Object<string, number>}
 */
export function computeRespread(items) {
  const result = {};
  (items || []).forEach((item, i) => {
    if (item && item.id) result[item.id] = (i + 1) * RANK_STEP;
  });
  return result;
}

/**
 * Comparator for board cards: rank ascending, then by card identifier.
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
export function compareByRank(a, b) {
  const ra = typeof a?.boardRank === 'number' ? a.boardRank : Number.MAX_SAFE_INTEGER;
  const rb = typeof b?.boardRank === 'number' ? b.boardRank : Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;
  return String(a?.cardId || '').localeCompare(String(b?.cardId || ''));
}

/**
 * Persist a board move on a card: update its status + boardColId + boardRank
 * in a single multi-path update.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.cardType - 'tasks' | 'bugs' (the section the card lives in)
 * @param {string} params.cardFirebaseId
 * @param {string} params.newStatus
 * @param {string} params.newColumnId
 * @param {number} params.newRank
 * @returns {Promise<void>}
 */
export async function persistCardMove({ projectId, cardType, cardFirebaseId, newStatus, newColumnId, newRank }) {
  if (!projectId || !cardType || !cardFirebaseId) {
    throw new Error('projectId, cardType and cardFirebaseId are required');
  }
  const section = cardType.toUpperCase();
  const basePath = `/cards/${projectId}/${section}_${projectId}/${cardFirebaseId}`;
  const updates = {
    [`${basePath}/status`]: newStatus,
    [`${basePath}/boardColId`]: newColumnId,
    [`${basePath}/boardRank`]: newRank
  };
  await update(ref(database), updates);
}

/**
 * Apply a respread to a whole column (rewrite boardRank of every card to
 * `RANK_STEP * (i+1)` in the desired final order). Uses a single multi-path
 * update for atomicity.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.cardType - 'tasks' | 'bugs'
 * @param {{firebaseId: string}[]} params.orderedCards
 * @returns {Promise<Object<string, number>>} - map of new ranks by firebaseId
 */
export async function persistColumnRespread({ projectId, cardType, orderedCards }) {
  if (!projectId || !cardType) throw new Error('projectId and cardType are required');
  const section = cardType.toUpperCase();
  const newRanks = {};
  const updates = {};
  (orderedCards || []).forEach((card, i) => {
    if (!card?.firebaseId) return;
    const rank = (i + 1) * RANK_STEP;
    newRanks[card.firebaseId] = rank;
    updates[`/cards/${projectId}/${section}_${projectId}/${card.firebaseId}/boardRank`] = rank;
  });
  if (Object.keys(updates).length > 0) await update(ref(database), updates);
  return newRanks;
}

/**
 * Write a single board snapshot under
 * /projects/{projectId}/board/snapshots/{pushKey}. Skips redundant writes
 * when the previous snapshot has the same `perColumn` map and `done`
 * value.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Object<string, number>} params.perColumn
 * @param {number} params.done
 * @param {Object} [params.lastSnapshot] - Optional previous snapshot used to
 *   short-circuit redundant writes.
 * @returns {Promise<{ written: boolean, key?: string, snapshot?: Object }>}
 */
export async function writeBoardSnapshot({ projectId, perColumn, done, lastSnapshot }) {
  if (!projectId) throw new Error('projectId is required');
  const safePerColumn = { ...(perColumn || {}) };
  const safeDone = Number(done) || 0;
  if (lastSnapshot) {
    const prevPerColumn = lastSnapshot.perColumn || {};
    const sameDone = (Number(lastSnapshot.done) || 0) === safeDone;
    const sameKeys = Object.keys(prevPerColumn).length === Object.keys(safePerColumn).length;
    if (sameDone && sameKeys && Object.keys(safePerColumn).every((k) => prevPerColumn[k] === safePerColumn[k])) {
      return { written: false };
    }
  }
  const snapshot = { at: new Date().toISOString(), perColumn: safePerColumn, done: safeDone };
  const snapsRef = ref(database, `/projects/${projectId}/board/snapshots`);
  const childRef = push(snapsRef);
  await set(childRef, snapshot);
  return { written: true, key: childRef.key, snapshot };
}

// Re-export for testability without requiring Firebase in tests.
export const _internals = { runTransaction };

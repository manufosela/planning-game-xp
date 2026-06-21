/**
 * Flow metrics — Kanban CFD / throughput / cycle time / WIP / bottleneck.
 *
 * Pure module, zero dependencies. Single source of truth ported from the
 * Kanban Game flow-metrics engine, with a byte-identical mirror at
 * public/js/utils/flow-metrics.js because Astro does not serve /shared/
 * to the browser. tests/shared/flow-metrics-mirror.test.js enforces both
 * files match byte for byte.
 *
 * Snapshot shape (one per board tick):
 *   {
 *     at: <ISO string or millis>,
 *     perColumn: { [colId]: n },
 *     done: <cumulative done count at this tick>
 *   }
 *
 * Exclusions: caller passes the set of column ids to exclude from "active
 * WIP" / bottleneck (typically the backlog/entry column, any buffer
 * column, and the done/exit column).
 */

function arr(snapshots) {
  return Array.isArray(snapshots) ? snapshots.filter(Boolean) : Object.values(snapshots || {}).filter(Boolean);
}

function toSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  return new Set();
}

/**
 * Average number of cards across active columns over the given snapshots.
 * @param {Array|Object} snapshots
 * @param {Set|Array|null} excludeColIds
 * @returns {number|null}
 */
export function avgActiveWip(snapshots, excludeColIds = new Set()) {
  const a = arr(snapshots);
  if (!a.length) return null;
  const excl = toSet(excludeColIds);
  let total = 0;
  for (const s of a) {
    for (const [c, n] of Object.entries(s.perColumn || {})) {
      if (!excl.has(c)) total += Number(n) || 0;
    }
  }
  return total / a.length;
}

/**
 * Peak number of cards across active columns within a single tick.
 * @param {Array|Object} snapshots
 * @param {Set|Array|null} excludeColIds
 * @returns {number|null}
 */
export function peakActiveWip(snapshots, excludeColIds = new Set()) {
  const a = arr(snapshots);
  if (!a.length) return null;
  const excl = toSet(excludeColIds);
  let peak = 0;
  for (const s of a) {
    let sum = 0;
    for (const [c, n] of Object.entries(s.perColumn || {})) {
      if (!excl.has(c)) sum += Number(n) || 0;
    }
    if (sum > peak) peak = sum;
  }
  return peak;
}

/**
 * Throughput per period: cards finished divided by number of snapshots.
 * Assumes equidistant snapshots; for irregular cadence normalize by real
 * elapsed time upstream.
 * @param {Array|Object} snapshots
 * @returns {number|null}
 */
export function throughputPerPeriod(snapshots) {
  const a = arr(snapshots);
  if (!a.length) return null;
  const dones = a.map((s) => Number(s.done) || 0);
  const done = Math.max(0, ...dones);
  return done / a.length;
}

/**
 * Average cycle time via Little's Law: WIP / throughput.
 * @param {Array|Object} snapshots
 * @param {Set|Array|null} excludeColIds
 * @returns {number|null}
 */
export function avgCycleTimeLittle(snapshots, excludeColIds = new Set()) {
  const L = avgActiveWip(snapshots, excludeColIds);
  const lambda = throughputPerPeriod(snapshots);
  if (L == null || !lambda) return null;
  return L / lambda;
}

/**
 * Bottleneck: column with the highest average count across snapshots
 * (after excluding backlog/buffer/done columns).
 * @param {Array|Object} snapshots
 * @param {Set|Array|null} excludeColIds
 * @returns {{colId: string, avg: number}|null}
 */
export function bottleneck(snapshots, excludeColIds = new Set()) {
  const a = arr(snapshots);
  if (!a.length) return null;
  const excl = toSet(excludeColIds);
  const totals = {};
  for (const s of a) {
    for (const [c, n] of Object.entries(s.perColumn || {})) {
      if (excl.has(c)) continue;
      totals[c] = (totals[c] || 0) + (Number(n) || 0);
    }
  }
  let best = null;
  for (const [c, t] of Object.entries(totals)) {
    const avg = t / a.length;
    if (!best || avg > best.avg) best = { colId: c, avg };
  }
  return best;
}

/**
 * Priority of a card: Valor / Esfuerzo * 100, the same shape Karajan
 * Code and the PG already use. Returns 0 for incomplete inputs.
 * @param {{business?:number, dev?:number, businessPoints?:number, devPoints?:number}} card
 * @returns {number}
 */
export function priorityOf(card) {
  if (!card) return 0;
  const business = card.businessPoints ?? card.business;
  const dev = card.devPoints ?? card.dev;
  if (!business || !dev) return 0;
  return Math.round((business / dev) * 100);
}

/**
 * Average cycle time (ms or whatever unit the timestamps use) computed
 * from individual cards' enteredInProgressAt / doneAt pairs.
 * @param {Array} cards
 * @returns {number|null}
 */
export function avgRealCycleTime(cards) {
  const done = (cards || []).filter((c) => c && c.enteredInProgressAt && c.doneAt);
  if (!done.length) return null;
  return done.reduce((s, c) => s + (Number(c.doneAt) - Number(c.enteredInProgressAt)), 0) / done.length;
}

/**
 * Cumulative flow series suitable for stacked area rendering.
 * Returns the snapshots sorted by `at`, with `perColumn` projected onto
 * the requested column ids (in display order). Missing columns are 0.
 *
 * @param {Array|Object} snapshots
 * @param {string[]} columnIdsInOrder
 * @returns {Array<{at: any, values: number[], done: number}>}
 */
export function cumulativeFlowSeries(snapshots, columnIdsInOrder) {
  const a = arr(snapshots).slice().sort((x, y) => {
    const tx = new Date(x.at).getTime();
    const ty = new Date(y.at).getTime();
    if (Number.isFinite(tx) && Number.isFinite(ty)) return tx - ty;
    return 0;
  });
  return a.map((s) => ({
    at: s.at,
    values: (columnIdsInOrder || []).map((c) => Number(s.perColumn?.[c]) || 0),
    done: Number(s.done) || 0
  }));
}

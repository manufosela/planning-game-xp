/**
 * Project time metrics — aggregates the "time dedicated to a project" from
 * the task ledger. Used by the dashboard's "Evolución temporal" tab.
 *
 * Two metrics per task:
 *
 *   - **netMs** (workCycles + totalWorkDurationMs): summed durations of
 *     every In Progress cycle. Only filled when the task lifecycle was
 *     driven via the MCP (the UI-only flow does not write workCycles), so
 *     callers should display this with the disclaimer that it covers the
 *     subset of tasks managed via MCP.
 *
 *   - **elapsedMs** (endDate - startDate): plain wall-clock between the
 *     start of work and the move to "To Validate". Includes nights,
 *     weekends and pauses, but is always available when both dates are set.
 *
 * Aggregation produces totals, breakdown by developer (with a "human vs
 * AI" rollup using the IA developer id), and a per-month bucket suitable
 * for line/bar charts.
 *
 * The module has zero side effects — pass in plain task objects from
 * Firebase and it returns a plain summary. No DOM, no Firebase, no I/O.
 */

import { calculateWorkdays } from '../utils/workday-utils.js';

/** Developer id reserved for the AI agent ("BecarIA"). */
export const AI_DEVELOPER_ID = 'dev_016';

/**
 * Sum of the closed work-cycle durations for a task. Open cycles
 * (endDate === null) are ignored so the metric never inflates while a
 * task is in flight.
 *
 * @param {Object} task
 * @returns {number} milliseconds
 */
export function taskNetMs(task) {
  if (!task || typeof task !== 'object') return 0;
  if (typeof task.totalWorkDurationMs === 'number' && task.totalWorkDurationMs > 0) {
    return task.totalWorkDurationMs;
  }
  if (!Array.isArray(task.workCycles)) return 0;
  return task.workCycles.reduce((sum, cycle) => {
    if (!cycle || typeof cycle !== 'object') return sum;
    if (!cycle.endDate) return sum; // skip open cycles
    if (typeof cycle.durationMs === 'number' && cycle.durationMs > 0) {
      return sum + cycle.durationMs;
    }
    const start = cycle.startDate ? new Date(cycle.startDate).getTime() : NaN;
    const end = new Date(cycle.endDate).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return sum + (end - start);
    }
    return sum;
  }, 0);
}

/**
 * Wall-clock elapsed between startDate and endDate of a task, in
 * milliseconds. Returns 0 when either date is missing or invalid.
 *
 * @param {Object} task
 * @returns {number}
 */
export function taskElapsedMs(task) {
  if (!task || !task.startDate || !task.endDate) return 0;
  const start = new Date(task.startDate).getTime();
  const end = new Date(task.endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

/**
 * Same as taskElapsedMs but expressed in business workdays
 * (8h/day, weekends and Spanish holidays excluded).
 *
 * @param {Object} task
 * @returns {number} workdays (decimal)
 */
export function taskElapsedWorkdays(task) {
  if (!task || !task.startDate || !task.endDate) return 0;
  return calculateWorkdays(task.startDate, task.endDate);
}

/**
 * Returns a YYYY-MM bucket for a task's endDate (the "completed in" month).
 * @param {Object} task
 * @returns {string|null}
 */
export function taskMonthBucket(task) {
  if (!task || !task.endDate) return null;
  const date = new Date(task.endDate);
  if (!Number.isFinite(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Iterate a tasks map/array and keep only the ones that count as
 * "completed work" for the metrics (have an endDate and are not soft-deleted).
 * @param {Object|Array} tasks
 * @returns {Object[]}
 */
function listCompletedTasks(tasks) {
  if (!tasks) return [];
  const arr = Array.isArray(tasks) ? tasks : Object.values(tasks);
  return arr.filter((t) => t && typeof t === 'object' && t.endDate && !t.deletedAt);
}

/**
 * Aggregate time metrics for a project's tasks.
 *
 * @param {Object|Array} tasks - Map firebaseId→task or array of tasks.
 * @param {Object} [options]
 * @param {string} [options.aiDeveloperId=AI_DEVELOPER_ID] - Id used to bucket
 *   "AI" work apart from human work.
 * @returns {{
 *   totals: {
 *     completedCount: number,
 *     netMs: number,
 *     elapsedMs: number,
 *     elapsedWorkdays: number,
 *     netCoverage: number,
 *     netCoveredCount: number
 *   },
 *   byKind: {
 *     human: { netMs: number, elapsedMs: number, elapsedWorkdays: number, completedCount: number },
 *     ai:    { netMs: number, elapsedMs: number, elapsedWorkdays: number, completedCount: number },
 *     unknown: { netMs: number, elapsedMs: number, elapsedWorkdays: number, completedCount: number }
 *   },
 *   byDeveloper: Array<{
 *     developer: string,
 *     completedCount: number,
 *     netMs: number,
 *     elapsedMs: number,
 *     elapsedWorkdays: number,
 *     kind: 'human'|'ai'|'unknown'
 *   }>,
 *   byMonth: Array<{
 *     month: string,
 *     completedCount: number,
 *     netMs: number,
 *     elapsedMs: number,
 *     elapsedWorkdays: number,
 *     avgElapsedWorkdays: number
 *   }>
 * }}
 */
export function aggregateProjectTimeMetrics(tasks, options = {}) {
  const aiId = options.aiDeveloperId || AI_DEVELOPER_ID;
  const items = listCompletedTasks(tasks);

  const totals = {
    completedCount: 0,
    netMs: 0,
    elapsedMs: 0,
    elapsedWorkdays: 0,
    netCoverage: 0,
    netCoveredCount: 0
  };

  const byKind = {
    human:   { netMs: 0, elapsedMs: 0, elapsedWorkdays: 0, completedCount: 0 },
    ai:      { netMs: 0, elapsedMs: 0, elapsedWorkdays: 0, completedCount: 0 },
    unknown: { netMs: 0, elapsedMs: 0, elapsedWorkdays: 0, completedCount: 0 }
  };

  const devMap = new Map();
  const monthMap = new Map();

  for (const task of items) {
    const net = taskNetMs(task);
    const elapsed = taskElapsedMs(task);
    const workdays = taskElapsedWorkdays(task);

    totals.completedCount += 1;
    totals.netMs += net;
    totals.elapsedMs += elapsed;
    totals.elapsedWorkdays += workdays;
    if (net > 0) totals.netCoveredCount += 1;

    const devId = task.developer || '';
    let kind;
    if (!devId) kind = 'unknown';
    else if (devId === aiId) kind = 'ai';
    else kind = 'human';

    byKind[kind].netMs += net;
    byKind[kind].elapsedMs += elapsed;
    byKind[kind].elapsedWorkdays += workdays;
    byKind[kind].completedCount += 1;

    const devKey = devId || '(sin developer)';
    if (!devMap.has(devKey)) {
      devMap.set(devKey, {
        developer: devKey,
        completedCount: 0,
        netMs: 0,
        elapsedMs: 0,
        elapsedWorkdays: 0,
        kind
      });
    }
    const devEntry = devMap.get(devKey);
    devEntry.completedCount += 1;
    devEntry.netMs += net;
    devEntry.elapsedMs += elapsed;
    devEntry.elapsedWorkdays += workdays;

    const monthKey = taskMonthBucket(task);
    if (monthKey) {
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          month: monthKey,
          completedCount: 0,
          netMs: 0,
          elapsedMs: 0,
          elapsedWorkdays: 0,
          avgElapsedWorkdays: 0
        });
      }
      const monthEntry = monthMap.get(monthKey);
      monthEntry.completedCount += 1;
      monthEntry.netMs += net;
      monthEntry.elapsedMs += elapsed;
      monthEntry.elapsedWorkdays += workdays;
    }
  }

  totals.netCoverage = totals.completedCount === 0
    ? 0
    : totals.netCoveredCount / totals.completedCount;

  const byMonth = Array.from(monthMap.values())
    .map((m) => ({
      ...m,
      avgElapsedWorkdays: m.completedCount === 0 ? 0 : m.elapsedWorkdays / m.completedCount
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byDeveloper = Array.from(devMap.values())
    .sort((a, b) => b.netMs - a.netMs);

  return { totals, byKind, byDeveloper, byMonth };
}

/**
 * Pretty-print a millisecond duration as a short human string ("2h 15m",
 * "45m", "3d 4h"). Best-effort, intended for UI labels.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatDurationShort(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes === 0 ? `${totalHours}h` : `${totalHours}h ${minutes}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

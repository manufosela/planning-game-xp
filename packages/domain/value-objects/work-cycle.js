/**
 * WorkCycle value object — track work cycles for reopened task tracking.
 */

/**
 * Start a new work cycle.
 * @param {string} date - ISO date string
 * @param {number} cycleNumber
 * @returns {{ startDate: string, cycleNumber: number, durationMs: number }}
 */
export function startCycle(date, cycleNumber) {
  if (!date) {
    throw new Error('startDate is required to start a work cycle');
  }
  return { startDate: date, cycleNumber, durationMs: 0 };
}

/**
 * End a work cycle, computing its duration.
 * @param {{ startDate: string }} cycle
 * @param {string} endDate - ISO date string
 * @returns {{ startDate: string, endDate: string, durationMs: number, cycleNumber?: number }}
 */
export function endCycle(cycle, endDate) {
  if (!cycle || !cycle.startDate) {
    throw new Error('cycle must have a startDate');
  }
  const durationMs = calculateDuration(cycle.startDate, endDate);
  return { ...cycle, endDate, durationMs };
}

/**
 * Calculate duration between two ISO date strings.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {number} Duration in milliseconds
 */
export function calculateDuration(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const diff = end - start;
  if (diff < 0) {
    throw new Error(`endDate (${endDate}) is before startDate (${startDate})`);
  }
  return diff;
}

/**
 * Accumulate total duration across multiple cycles.
 * @param {Array<{ durationMs: number }>} cycles
 * @returns {number} Total milliseconds
 */
export function accumulateDuration(cycles) {
  return cycles.reduce((total, cycle) => total + (cycle.durationMs || 0), 0);
}

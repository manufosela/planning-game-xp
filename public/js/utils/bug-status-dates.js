import { generateTimestamp } from './timestamp-utils.js';

const WORK_STARTED_STATUSES = ['In Progress', 'Fixed', 'Done&Validated'];
const FINAL_STATUSES = ['Fixed', 'Done&Validated'];

/**
 * Dates a bug status change must auto-fill. Existing dates are never
 * overwritten: startDate once work has started, endDate on entering a
 * final status.
 *
 * @param {Object} params
 * @param {string} params.previousStatus
 * @param {string} params.newStatus
 * @param {string} params.startDate - Current startDate ('' if unset)
 * @param {string} params.endDate - Current endDate ('' if unset)
 * @param {Date} [params.now]
 * @returns {{startDate?: string, endDate?: string}}
 */
export function getAutoBugDates({ previousStatus, newStatus, startDate, endDate, now = new Date() }) {
  const dates = {};
  if (WORK_STARTED_STATUSES.includes(newStatus) && !startDate) {
    dates.startDate = generateTimestamp(now);
  }
  if (FINAL_STATUSES.includes(newStatus) && !FINAL_STATUSES.includes(previousStatus) && !endDate) {
    dates.endDate = generateTimestamp(now);
  }
  return dates;
}

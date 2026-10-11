const FINAL_STATUSES = ['Fixed', 'Done&Validated'];
const FINAL_REQUIRED_FIELDS = ['startDate', 'endDate', 'developer', 'priority', 'description'];

/**
 * Fields a bug needs to enter a status:
 * - In Progress: who works on it and since when
 * - Fixed / Done&Validated: dates, developer, priority and description
 *   (only when entering the final statuses, not when moving between them)
 * - Rejected: the reason why it is not a bug
 *
 * @param {Object} params
 * @param {string} params.previousStatus
 * @param {string} params.newStatus
 * @param {Object} params.card - Current field values (auto-filled dates included)
 * @returns {string[]} Missing field names, in display order
 */
export function getMissingBugFields({ previousStatus, newStatus, card }) {
  let required = [];
  if (newStatus === 'In Progress') {
    required = ['developer', 'startDate'];
  } else if (newStatus === 'Rejected') {
    required = ['rejectionReason'];
  } else if (FINAL_STATUSES.includes(newStatus) && !FINAL_STATUSES.includes(previousStatus)) {
    required = FINAL_REQUIRED_FIELDS;
  }
  return required.filter(field => {
    const value = card[field];
    return !value || (typeof value === 'string' && value.trim() === '');
  });
}

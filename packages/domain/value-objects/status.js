/**
 * Status value object — card type lifecycles and valid transitions.
 */

export const TaskStatus = Object.freeze({
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  TO_VALIDATE: 'To Validate',
  DONE: 'Done',
  DONE_VALIDATED: 'Done&Validated',
  BLOCKED: 'Blocked',
  REOPENED: 'Reopened',
});

export const BugStatus = Object.freeze({
  CREATED: 'Created',
  ASSIGNED: 'Assigned',
  FIXED: 'Fixed',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
});

export const ProposalStatus = Object.freeze({
  PENDING: 'Pending',
  PLANNED: 'Planned',
  REJECTED: 'Rejected',
});

/**
 * Valid status transitions per card type.
 * Key = from status, Value = array of allowed target statuses.
 */
export const LIFECYCLES = Object.freeze({
  'task-card': {
    [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.TO_VALIDATE, TaskStatus.BLOCKED, TaskStatus.TODO],
    [TaskStatus.TO_VALIDATE]: [TaskStatus.DONE, TaskStatus.DONE_VALIDATED, TaskStatus.REOPENED],
    [TaskStatus.DONE]: [TaskStatus.DONE_VALIDATED, TaskStatus.REOPENED],
    [TaskStatus.DONE_VALIDATED]: [],
    [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.TODO],
    [TaskStatus.REOPENED]: [TaskStatus.IN_PROGRESS, TaskStatus.TO_VALIDATE],
  },
  'bug-card': {
    [BugStatus.CREATED]: [BugStatus.ASSIGNED],
    [BugStatus.ASSIGNED]: [BugStatus.FIXED, BugStatus.CREATED],
    [BugStatus.FIXED]: [BugStatus.VERIFIED, BugStatus.ASSIGNED],
    [BugStatus.VERIFIED]: [BugStatus.CLOSED, BugStatus.ASSIGNED],
    [BugStatus.CLOSED]: [],
  },
  'proposal-card': {
    [ProposalStatus.PENDING]: [ProposalStatus.PLANNED, ProposalStatus.REJECTED],
    [ProposalStatus.PLANNED]: [ProposalStatus.PENDING],
    [ProposalStatus.REJECTED]: [],
  },
});

/**
 * Get all valid statuses for a card type.
 * @param {string} cardType
 * @returns {string[]}
 */
export function getStatuses(cardType) {
  const lifecycle = LIFECYCLES[cardType];
  if (!lifecycle) {
    throw new Error(`Unknown card type: "${cardType}"`);
  }
  return Object.keys(lifecycle);
}

/**
 * Check if a status is valid for a given card type.
 * @param {string} cardType
 * @param {string} status
 * @returns {boolean}
 */
export function isValidStatus(cardType, status) {
  const lifecycle = LIFECYCLES[cardType];
  if (!lifecycle) return false;
  return status in lifecycle;
}

/**
 * Get allowed next statuses from the current status.
 * @param {string} cardType
 * @param {string} currentStatus
 * @returns {string[]}
 */
export function getNextStatuses(cardType, currentStatus) {
  const lifecycle = LIFECYCLES[cardType];
  if (!lifecycle) {
    throw new Error(`Unknown card type: "${cardType}"`);
  }
  return lifecycle[currentStatus] || [];
}

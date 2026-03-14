/**
 * TransitionService — validates card status transitions and required fields.
 */

import { getNextStatuses, isValidStatus } from '../value-objects/status.js';

/**
 * Required fields for each transition, keyed by "cardType:fromStatus→toStatus".
 */
const REQUIRED_FIELDS = Object.freeze({
  'task-card:To Do→In Progress': [
    'developer', 'validator', 'epic', 'sprint',
    'devPoints', 'businessPoints', 'acceptanceCriteria', 'startDate',
  ],
  'task-card:In Progress→To Validate': [
    'startDate', 'endDate', 'commits', 'pipelineStatus.prCreated',
  ],
  'bug-card:Created→Assigned': ['developer'],
  'bug-card:Assigned→Fixed': ['commits'],
  'bug-card:Verified→Closed': ['rootCause', 'resolution'],
});

/**
 * Check whether a status transition is allowed.
 * @param {string} cardType
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function canTransition(cardType, fromStatus, toStatus) {
  try {
    const allowed = getNextStatuses(cardType, fromStatus);
    return allowed.includes(toStatus);
  } catch {
    return false;
  }
}

/**
 * Get the list of required fields for a specific transition.
 * @param {string} cardType
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {string[]}
 */
export function getRequiredFields(cardType, fromStatus, toStatus) {
  const key = `${cardType}:${fromStatus}→${toStatus}`;
  return REQUIRED_FIELDS[key] || [];
}

/**
 * Resolve a potentially dotted field path on an object.
 * @param {object} obj
 * @param {string} path
 * @returns {unknown}
 */
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Check if a field value counts as "present" (not null/undefined/empty).
 * @param {unknown} value
 * @returns {boolean}
 */
function isPresent(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Validate whether a card can transition to a new status.
 * @param {object} card - Card data with at least cardType and status
 * @param {string} toStatus
 * @returns {{ valid: boolean, missing: string[], reason?: string }}
 */
export function validateTransition(card, toStatus) {
  const { cardType, status: fromStatus } = card;

  if (!canTransition(cardType, fromStatus, toStatus)) {
    return {
      valid: false,
      missing: [],
      reason: `Transition from "${fromStatus}" to "${toStatus}" is not allowed for ${cardType}.`,
    };
  }

  const requiredFields = getRequiredFields(cardType, fromStatus, toStatus);
  const missing = [];

  for (const field of requiredFields) {
    if (field === 'acceptanceCriteria') {
      const hasPlain = isPresent(card.acceptanceCriteria);
      const hasStructured = isPresent(card.acceptanceCriteriaStructured);
      if (!hasPlain && !hasStructured) {
        missing.push(field);
      }
      continue;
    }

    const value = getNestedValue(card, field);
    if (!isPresent(value)) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get the available transitions for a card type from a given status.
 * @param {string} cardType
 * @param {string} currentStatus
 * @returns {string[]}
 */
export function getAvailableTransitions(cardType, currentStatus) {
  return getNextStatuses(cardType, currentStatus);
}

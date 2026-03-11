/**
 * Status transition engine — pure functions for validating card state transitions.
 *
 * Encodes all Planning Game XP workflow rules: which transitions are valid,
 * what fields are required, and which transitions need validator permissions.
 *
 * @module lib/transitions
 */

// ---------------------------------------------------------------------------
// Task transition rules
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TransitionRule
 * @property {string[]} requiredFields - Fields that must be present on the card
 * @property {boolean} validatorOnly - Whether only the assigned validator can perform this
 * @property {string} [blockedReasonField] - Special field name for blocked reason
 */

/** @type {Record<string, Record<string, TransitionRule>>} */
const TASK_TRANSITIONS = {
  'To Do': {
    'In Progress': {
      requiredFields: ['developer', 'validator', 'epic', 'sprint', 'devPoints', 'businessPoints', 'acceptanceCriteria'],
      validatorOnly: false,
    },
    'Blocked': {
      requiredFields: ['blockedReason'],
      validatorOnly: false,
    },
  },
  'In Progress': {
    'To Validate': {
      requiredFields: ['startDate', 'commits'],
      validatorOnly: false,
    },
    'To Do': {
      requiredFields: [],
      validatorOnly: false,
    },
    'Blocked': {
      requiredFields: ['blockedReason'],
      validatorOnly: false,
    },
  },
  'To Validate': {
    'Done': {
      requiredFields: [],
      validatorOnly: true,
    },
    'Done&Validated': {
      requiredFields: [],
      validatorOnly: true,
    },
    'Reopened': {
      requiredFields: [],
      validatorOnly: true,
    },
  },
  'Done': {
    'Done&Validated': {
      requiredFields: [],
      validatorOnly: true,
    },
  },
  'Reopened': {
    'In Progress': {
      requiredFields: ['developer'],
      validatorOnly: false,
    },
    'To Do': {
      requiredFields: [],
      validatorOnly: false,
    },
  },
  'Blocked': {
    'To Do': {
      requiredFields: [],
      validatorOnly: false,
    },
    'In Progress': {
      requiredFields: ['developer'],
      validatorOnly: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Bug transition rules
// ---------------------------------------------------------------------------

/** @type {Record<string, Record<string, TransitionRule>>} */
const BUG_TRANSITIONS = {
  'Created': {
    'Assigned': {
      requiredFields: ['developer'],
      validatorOnly: false,
    },
  },
  'Assigned': {
    'Fixed': {
      requiredFields: ['commits'],
      validatorOnly: false,
    },
  },
  'Fixed': {
    'Verified': {
      requiredFields: [],
      validatorOnly: true,
    },
  },
  'Verified': {
    'Closed': {
      requiredFields: ['rootCause', 'resolution'],
      validatorOnly: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Exported constant with all rules
// ---------------------------------------------------------------------------

/**
 * All transition rules indexed by card type.
 * @type {{ task: Record<string, Record<string, TransitionRule>>, bug: Record<string, Record<string, TransitionRule>> }}
 */
export const TRANSITION_RULES = {
  task: TASK_TRANSITIONS,
  bug: BUG_TRANSITIONS,
};

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Get the transition rules map for a given card type.
 * @param {string} cardType
 * @returns {Record<string, Record<string, TransitionRule>> | null}
 */
function getRulesForType(cardType) {
  if (cardType === 'task') return TASK_TRANSITIONS;
  if (cardType === 'bug') return BUG_TRANSITIONS;
  return null;
}

/**
 * Check whether a card has a non-empty value for a given field.
 * Handles nested objects (developer, validator), arrays (commits, acceptanceCriteria),
 * and primitive values.
 *
 * @param {Record<string, unknown>} card
 * @param {string} field
 * @returns {boolean}
 */
function hasField(card, field) {
  const value = card[field];
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    // TeamMemberRef must have at least an id
    return /** @type {Record<string,unknown>} */ (value).id != null;
  }
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true;
  return Boolean(value);
}

/**
 * Determine whether a user is the validator (or co-validator) for a card.
 * @param {Record<string, unknown>} card
 * @param {{ uid: string }} user
 * @returns {boolean}
 */
function isUserValidator(card, user) {
  const validator = /** @type {{ id?: string } | undefined} */ (card.validator);
  const covalidator = /** @type {{ id?: string } | undefined} */ (card.covalidator);
  if (validator?.id === user.uid) return true;
  if (covalidator?.id === user.uid) return true;
  return false;
}

/**
 * Check if a specific transition from the card's current status to a target status
 * is allowed, given the card data and the requesting user.
 *
 * @param {Record<string, unknown>} card - Card data (must include `type` and `status`)
 * @param {string} targetStatus - Desired target status
 * @param {{ uid: string; role?: string }} user - User attempting the transition
 * @returns {import('./types.d.ts').TransitionResult}
 */
export function canTransition(card, targetStatus, user) {
  const cardType = /** @type {string} */ (card.type);
  const currentStatus = /** @type {string} */ (card.status);

  if (currentStatus === targetStatus) {
    return { allowed: false, reason: 'Card is already in this status' };
  }

  const rules = getRulesForType(cardType);
  if (!rules) {
    return { allowed: false, reason: `No transition rules defined for card type "${cardType}"` };
  }

  const fromRules = rules[currentStatus];
  if (!fromRules) {
    return { allowed: false, reason: `No transitions defined from status "${currentStatus}"` };
  }

  const rule = fromRules[targetStatus];
  if (!rule) {
    return {
      allowed: false,
      reason: `Transition from "${currentStatus}" to "${targetStatus}" is not allowed`,
    };
  }

  // Check validator-only constraint
  if (rule.validatorOnly) {
    const isSuperAdmin = user.role === 'superadmin';
    if (!isSuperAdmin && !isUserValidator(card, user)) {
      return {
        allowed: false,
        reason: `Only the assigned validator can change status to "${targetStatus}"`,
      };
    }
  }

  // Check required fields
  const missing = rule.requiredFields.filter((field) => !hasField(card, field));
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: `Missing required fields: ${missing.join(', ')}`,
      missing,
    };
  }

  return { allowed: true };
}

/**
 * Get all valid target statuses that the card can transition to,
 * given the current user.
 *
 * @param {Record<string, unknown>} card - Card data
 * @param {{ uid: string; role?: string }} user - Requesting user
 * @returns {string[]}
 */
export function getAvailableTransitions(card, user) {
  const cardType = /** @type {string} */ (card.type);
  const currentStatus = /** @type {string} */ (card.status);

  const rules = getRulesForType(cardType);
  if (!rules) return [];

  const fromRules = rules[currentStatus];
  if (!fromRules) return [];

  return Object.keys(fromRules).filter((targetStatus) => {
    const result = canTransition(card, targetStatus, user);
    return result.allowed;
  });
}

/**
 * Get the list of required fields for a specific transition.
 *
 * @param {string} cardType - 'task' or 'bug'
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Target status
 * @returns {string[]}
 */
export function getRequiredFields(cardType, fromStatus, toStatus) {
  const rules = getRulesForType(cardType);
  if (!rules) return [];

  const fromRules = rules[fromStatus];
  if (!fromRules) return [];

  const rule = fromRules[toStatus];
  if (!rule) return [];

  return [...rule.requiredFields];
}

/**
 * Check whether a transition is validator-only.
 *
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Target status
 * @returns {boolean}
 */
export function isValidatorAction(fromStatus, toStatus) {
  // Check both task and bug rules
  for (const rules of [TASK_TRANSITIONS, BUG_TRANSITIONS]) {
    const fromRules = rules[fromStatus];
    if (fromRules && fromRules[toStatus]) {
      return fromRules[toStatus].validatorOnly;
    }
  }
  return false;
}

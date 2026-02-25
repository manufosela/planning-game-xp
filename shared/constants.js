/**
 * Shared constants for PlanningGameXP
 * Single source of truth for statuses, priorities, transition rules, and maps.
 * Used by: Cloud Functions, MCP server, migration scripts.
 *
 * Frontend (app-constants.js) is kept manually aligned — a CI test verifies parity.
 */

// ──────────────────────────────────────────────
// Bug statuses (5 states)
// ──────────────────────────────────────────────
export const VALID_BUG_STATUSES = ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed'];

export const VALID_BUG_PRIORITIES = [
  'Application Blocker',
  'Department Blocker',
  'Individual Blocker',
  'User Experience Issue',
  'Workflow Improvement',
  'Workaround Available Issue'
];

// ──────────────────────────────────────────────
// Task statuses
// ──────────────────────────────────────────────
export const VALID_TASK_STATUSES = ['To Do', 'In Progress', 'Pausado', 'To Validate', 'Done&Validated', 'Blocked', 'Reopened'];

export const VALID_TASK_PRIORITIES = ['High', 'Medium', 'Low'];

// ──────────────────────────────────────────────
// Status values that only validators can set (Cloud Functions enforce this)
// ──────────────────────────────────────────────
export const VALIDATOR_ONLY_STATUSES = ['Done', 'Done&Validated'];

// ──────────────────────────────────────────────
// Status values that MCP cannot set (subset of VALIDATOR_ONLY_STATUSES)
// ──────────────────────────────────────────────
export const MCP_RESTRICTED_STATUSES = ['Done&Validated'];

// ──────────────────────────────────────────────
// Required fields before transitioning tasks OUT of "To Do"
// ──────────────────────────────────────────────
export const REQUIRED_FIELDS_TO_LEAVE_TODO = [
  'title',
  'developer',
  'validator',
  'epic',
  'sprint',
  'devPoints',
  'businessPoints',
  'acceptanceCriteria' // Can also be acceptanceCriteriaStructured
];

// ──────────────────────────────────────────────
// Required fields for "To Validate" (in addition to REQUIRED_FIELDS_TO_LEAVE_TODO)
// ──────────────────────────────────────────────
export const REQUIRED_FIELDS_FOR_TO_VALIDATE = [
  'startDate',
  'commits'
];

// ──────────────────────────────────────────────
// Required fields when closing a bug
// ──────────────────────────────────────────────
export const REQUIRED_FIELDS_TO_CLOSE_BUG = ['commits', 'rootCause', 'resolution'];

// ──────────────────────────────────────────────
// Required fields for "Blocked" status
// ──────────────────────────────────────────────
export const BLOCKED_REQUIRED_FIELDS = {
  blockedByBusiness: ['bbbWhy', 'bbbWho'],
  blockedByDevelopment: ['bbdWhy', 'bbdWho']
};

// ──────────────────────────────────────────────
// Task transition rules
// ──────────────────────────────────────────────
export const TASK_TRANSITION_RULES = {
  'To Do': {
    allowedTransitions: ['In Progress', 'Blocked'],
    requirements: {
      'In Progress': REQUIRED_FIELDS_TO_LEAVE_TODO,
      'Blocked': [...REQUIRED_FIELDS_TO_LEAVE_TODO, 'blockedByBusiness OR blockedByDevelopment', 'bbbWhy/bbbWho OR bbdWhy/bbdWho']
    }
  },
  'In Progress': {
    allowedTransitions: ['To Validate', 'Pausado', 'Blocked', 'To Do'],
    requirements: {
      'To Validate': [...REQUIRED_FIELDS_TO_LEAVE_TODO, ...REQUIRED_FIELDS_FOR_TO_VALIDATE],
      'Pausado': [],
      'Blocked': ['blockedByBusiness OR blockedByDevelopment', 'bbbWhy/bbbWho OR bbdWhy/bbdWho'],
      'To Do': []
    }
  },
  'Pausado': {
    allowedTransitions: ['In Progress', 'To Do'],
    requirements: {
      'In Progress': [],
      'To Do': []
    },
    note: 'Task was in progress and paused. startDate is immutable. timeLog tracks pause/resume timestamps.'
  },
  'To Validate': {
    allowedTransitions: ['Reopened'],
    mcpRestrictions: ['Done&Validated'],
    note: 'MCP cannot set Done&Validated - only validators can'
  },
  'Blocked': {
    allowedTransitions: ['In Progress', 'To Do'],
    requirements: {}
  },
  'Reopened': {
    allowedTransitions: ['In Progress', 'To Validate'],
    requirements: {
      'To Validate': [...REQUIRED_FIELDS_TO_LEAVE_TODO, ...REQUIRED_FIELDS_FOR_TO_VALIDATE]
    }
  },
  'Done&Validated': {
    allowedTransitions: [],
    note: 'Final state - no transitions allowed'
  }
};

// ──────────────────────────────────────────────
// Default values by card type
// ──────────────────────────────────────────────
export const TYPE_DEFAULTS = {
  bug: {
    status: 'Created',
    priority: 'User Experience Issue'
  },
  task: {
    status: 'To Do',
    priority: 'Medium'
  },
  epic: {
    status: 'To Do',
    priority: 'Medium'
  },
  proposal: {
    status: 'To Do',
    priority: 'Medium'
  },
  qa: {
    status: 'To Do',
    priority: 'Medium'
  }
};

// ──────────────────────────────────────────────
// Valid ID prefixes for entity references
// ──────────────────────────────────────────────
export const VALID_ID_PREFIXES = {
  developer: 'dev_',
  codeveloper: 'dev_',
  validator: 'stk_',
  stakeholder: 'stk_'
};

// ──────────────────────────────────────────────
// Valid relation types between cards
// ──────────────────────────────────────────────
export const VALID_RELATION_TYPES = ['related', 'blocks', 'blockedBy'];

// ──────────────────────────────────────────────
// Implementation plan statuses
// ──────────────────────────────────────────────
export const VALID_STEP_STATUSES = ['pending', 'in_progress', 'done'];
export const VALID_PLAN_STATUSES = ['pending', 'proposed', 'validated', 'in_progress', 'completed'];

// ──────────────────────────────────────────────
// Completed statuses (used for year migration exclusion)
// ──────────────────────────────────────────────
export const TASK_COMPLETED_STATUSES = ['done', 'done&validated'];
export const BUG_COMPLETED_STATUSES = ['fixed', 'verified', 'closed'];
export const PROPOSAL_COMPLETED_STATUSES = ['approved', 'rejected', 'converted'];

// ──────────────────────────────────────────────
// Friendly field names for error messages
// ──────────────────────────────────────────────
export const FRIENDLY_FIELD_NAMES = {
  acceptanceCriteria: 'Acceptance Criteria',
  devPoints: 'Dev Points',
  businessPoints: 'Business Points',
  epic: 'Epic',
  sprint: 'Sprint',
  developer: 'Developer',
  validator: 'Validator',
  title: 'Title'
};

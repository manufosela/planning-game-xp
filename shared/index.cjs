/**
 * CJS entry point for shared/ modules.
 * Used by Cloud Functions (which require CJS).
 *
 * Re-exports all shared constants and validation functions.
 * This file uses createRequire to load the ESM modules.
 */
'use strict';

const { createRequire } = require('module');
const _require = createRequire(__filename);

// Use a lazy loading pattern since ESM cannot be required synchronously.
// Instead, we duplicate the constants here (verified by CI test).
// The ESM files in shared/ remain the source of truth.

// ── Constants (duplicated from shared/constants.js — CI test verifies alignment) ──

const VALID_BUG_STATUSES = ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed'];

const VALID_BUG_PRIORITIES = [
  'Application Blocker', 'Department Blocker', 'Individual Blocker',
  'User Experience Issue', 'Workflow Improvement', 'Workaround Available Issue'
];

const VALID_TASK_STATUSES = ['To Do', 'In Progress', 'Pausado', 'To Validate', 'Done&Validated', 'Blocked', 'Reopened'];
const VALID_TASK_PRIORITIES = ['High', 'Medium', 'Low'];

const VALIDATOR_ONLY_STATUSES = ['Done', 'Done&Validated'];
const MCP_RESTRICTED_STATUSES = ['Done&Validated'];

const REQUIRED_FIELDS_TO_LEAVE_TODO = [
  'title', 'developer', 'validator', 'epic', 'sprint',
  'devPoints', 'businessPoints', 'acceptanceCriteria'
];

const REQUIRED_FIELDS_FOR_TO_VALIDATE = ['startDate', 'commits'];
const REQUIRED_FIELDS_TO_CLOSE_BUG = ['commits', 'rootCause', 'resolution'];

const FRIENDLY_FIELD_NAMES = {
  acceptanceCriteria: 'Acceptance Criteria',
  devPoints: 'Dev Points',
  businessPoints: 'Business Points',
  epic: 'Epic',
  sprint: 'Sprint',
  developer: 'Developer',
  validator: 'Validator',
  title: 'Title'
};

// ── Validation (duplicated from shared/validation.js — used by Cloud Functions) ──

function hasValidValue(data, field) {
  if (field === 'acceptanceCriteria') {
    const ac = data.acceptanceCriteria;
    const acs = data.acceptanceCriteriaStructured;
    if (ac && typeof ac === 'string' && ac.trim() !== '') return true;
    if (Array.isArray(acs) && acs.length > 0) {
      return acs.some(s =>
        (s.given && s.given.trim()) || (s.when && s.when.trim()) ||
        (s.then && s.then.trim()) || (s.raw && s.raw.trim())
      );
    }
    return false;
  }
  if (field === 'devPoints' || field === 'businessPoints') {
    const value = data[field];
    return value !== null && value !== undefined && value !== '' && Number(value) > 0;
  }
  const value = data[field];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

module.exports = {
  VALID_BUG_STATUSES,
  VALID_BUG_PRIORITIES,
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  VALIDATOR_ONLY_STATUSES,
  MCP_RESTRICTED_STATUSES,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  REQUIRED_FIELDS_FOR_TO_VALIDATE,
  REQUIRED_FIELDS_TO_CLOSE_BUG,
  FRIENDLY_FIELD_NAMES,
  hasValidValue
};

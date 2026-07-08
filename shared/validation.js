/**
 * Shared validation functions for PlanningGameXP
 * Single source of truth for entity, bug, task, commits, and plan validation.
 * Used by: Cloud Functions, MCP server.
 */

import {
  VALID_BUG_STATUSES,
  VALID_BUG_PRIORITIES,
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  VALID_ID_PREFIXES,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  REQUIRED_FIELDS_FOR_TO_VALIDATE,
  MCP_RESTRICTED_STATUSES,
  FRIENDLY_FIELD_NAMES,
  VALID_PLAN_STATUSES,
  VALID_STEP_STATUSES,
  PR_CREATED_EXPECTED_SHAPE,
  PR_CREATED_EXAMPLE,
  COMPLETION_NOTE_MIN_LENGTH,
  TASK_CATEGORY_VALUES
} from './constants.js';
import {
  getTaskCategory,
  requiresPipelineStatus,
  isValidCompletionNote,
  isValidTaskCategory
} from './task-category.js';

// ──────────────────────────────────────────────
// pipelineStatus.prCreated diagnosis (actionable errors)
// ──────────────────────────────────────────────

/**
 * Describes a received value with its type for actionable error messages.
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array ${JSON.stringify(value)}`;
  return `${typeof value} ${JSON.stringify(value)}`;
}

/**
 * Diagnoses pipelineStatus.prCreated against its required contract.
 * Returns a structured result so callers can build precise, self-correcting errors.
 * @param {unknown} pipelineStatus - The card's pipelineStatus object (or undefined).
 * @returns {{ok: true} | {ok: false, reason: string, received: string, expected: string, example: object}}
 */
export function diagnosePrCreated(pipelineStatus) {
  const expected = PR_CREATED_EXPECTED_SHAPE;
  const example = { pipelineStatus: { prCreated: PR_CREATED_EXAMPLE } };

  if (pipelineStatus === undefined || pipelineStatus === null) {
    return { ok: false, reason: 'pipelineStatus is missing', received: describeValue(pipelineStatus), expected, example };
  }
  const pr = pipelineStatus.prCreated;
  if (pr === undefined || pr === null) {
    return { ok: false, reason: 'pipelineStatus.prCreated is missing', received: describeValue(pr), expected, example };
  }
  if (typeof pr !== 'object' || Array.isArray(pr)) {
    return {
      ok: false,
      reason: `pipelineStatus.prCreated must be an object, received ${Array.isArray(pr) ? 'array' : typeof pr}`,
      received: describeValue(pr), expected, example
    };
  }
  const missingSubFields = [];
  if (!pr.prUrl) missingSubFields.push('prUrl');
  if (!pr.prNumber) missingSubFields.push('prNumber');
  if (missingSubFields.length > 0) {
    return {
      ok: false,
      reason: `pipelineStatus.prCreated is missing sub-field(s): ${missingSubFields.join(', ')}`,
      received: describeValue(pr), expected, example
    };
  }
  return { ok: true };
}

/**
 * Builds a single-line, actionable error string from a prCreated diagnosis.
 * @param {{reason: string, received: string, expected: string, example: object}} diagnosis
 * @returns {string}
 */
export function formatPrCreatedError(diagnosis) {
  return `${diagnosis.reason}. Expected ${diagnosis.expected}. Received: ${diagnosis.received}. ` +
    `Example: ${JSON.stringify(diagnosis.example)}. Create the PR first if it does not exist.`;
}

// ──────────────────────────────────────────────
// Entity ID validation
// ──────────────────────────────────────────────

export function validateEntityId(field, value) {
  if (!value) return;
  const prefix = VALID_ID_PREFIXES[field];
  if (!prefix) return;
  if (!value.startsWith(prefix)) {
    throw new Error(
      `Invalid ${field} ID "${value}". ` +
      `${field.charAt(0).toUpperCase() + field.slice(1)} IDs must start with "${prefix}".`
    );
  }
}

export function validateEntityIds(data) {
  for (const field of Object.keys(VALID_ID_PREFIXES)) {
    if (data[field] !== undefined) {
      validateEntityId(field, data[field]);
    }
  }
}

export function collectEntityIdIssues(data) {
  const errors = [];
  for (const field of Object.keys(VALID_ID_PREFIXES)) {
    if (data[field] !== undefined && data[field]) {
      const prefix = VALID_ID_PREFIXES[field];
      if (!data[field].startsWith(prefix)) {
        errors.push({
          code: 'INVALID_ENTITY_ID',
          field,
          message: `Invalid ${field} ID "${data[field]}". ${field.charAt(0).toUpperCase() + field.slice(1)} IDs must start with "${prefix}".`,
          expectedPrefix: prefix,
          actualValue: data[field]
        });
      }
    }
  }
  return errors;
}

// ──────────────────────────────────────────────
// Field value checks
// ──────────────────────────────────────────────

export function hasValidValue(data, field) {
  if (field === 'acceptanceCriteria') {
    const ac = data.acceptanceCriteria;
    const acs = data.acceptanceCriteriaStructured;
    if (ac && typeof ac === 'string' && ac.trim() !== '') return true;
    if (Array.isArray(acs) && acs.length > 0) {
      return acs.some(scenario =>
        (scenario.given && scenario.given.trim()) ||
        (scenario.when && scenario.when.trim()) ||
        (scenario.then && scenario.then.trim()) ||
        (scenario.raw && scenario.raw.trim())
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

// ──────────────────────────────────────────────
// Bug validation
// ──────────────────────────────────────────────

export function validateBugFields(data, isUpdate = false) {
  if (data.status !== undefined && !VALID_BUG_STATUSES.includes(data.status)) {
    throw new Error(
      `Invalid bug status "${data.status}". Valid bug statuses are: ${VALID_BUG_STATUSES.join(', ')}`
    );
  }
  if (data.priority !== undefined && !VALID_BUG_PRIORITIES.includes(data.priority)) {
    throw new Error(
      `Invalid bug priority "${data.priority}". Valid bug priorities are: ${VALID_BUG_PRIORITIES.join(', ')}`
    );
  }
}

export function validateBugStatusTransition(currentBug, updates) {
  const newStatus = updates.status;
  if (!newStatus) return;
  if (currentBug.status === newStatus) return;

  const finalBug = { ...currentBug, ...updates };

  // Assigned: requires startDate (when work begins on the bug)
  if (newStatus === 'Assigned') {
    if (!hasValidValue(finalBug, 'startDate')) {
      throw new Error(
        'Cannot set bug to "Assigned": startDate is required. ' +
        'Set startDate to the current date/time when assigning a bug.'
      );
    }
  }

  // Fixed: requires startDate, endDate, commits, PR
  if (newStatus === 'Fixed') {
    const missingFields = [];
    if (!hasValidValue(finalBug, 'startDate')) {
      missingFields.push('startDate (when work started on the bug)');
    }
    if (!hasValidValue(finalBug, 'endDate')) {
      missingFields.push('endDate (when the fix was completed)');
    }
    if (!(Array.isArray(finalBug.commits) && finalBug.commits.length > 0)) {
      missingFields.push('commits (list of commits that fixed the bug)');
    }
    const prDiag = diagnosePrCreated(finalBug.pipelineStatus);
    if (!prDiag.ok) {
      missingFields.push(formatPrCreatedError(prDiag));
    }
    if (missingFields.length > 0) {
      throw new Error(
        `Cannot set bug to "Fixed": missing required fields: ${missingFields.join(', ')}. ` +
        'When fixing a bug, you must include dates, commits and PR information.'
      );
    }
  }

  // Closed: requires commits, rootCause, resolution
  if (newStatus === 'Closed') {
    const missingFields = [];
    if (!(Array.isArray(finalBug.commits) && finalBug.commits.length > 0)) {
      missingFields.push('commits (list of commits that fixed the bug)');
    }
    if (!finalBug.rootCause || (typeof finalBug.rootCause === 'string' && finalBug.rootCause.trim() === '')) {
      missingFields.push('rootCause (why the bug occurred)');
    }
    if (!finalBug.resolution || (typeof finalBug.resolution === 'string' && finalBug.resolution.trim() === '')) {
      missingFields.push('resolution (how the bug was fixed)');
    }
    if (missingFields.length > 0) {
      throw new Error(
        `Cannot close bug: missing required fields: ${missingFields.join(', ')}. ` +
        'When closing a bug, you must document the commits, root cause, and resolution.'
      );
    }
  }
}

export function collectBugValidationIssues(data) {
  const result = { valid: true, errors: [] };
  if (data.status !== undefined && !VALID_BUG_STATUSES.includes(data.status)) {
    result.valid = false;
    result.errors.push({ code: 'INVALID_STATUS', message: `Invalid bug status "${data.status}".`, validValues: VALID_BUG_STATUSES });
  }
  if (data.priority !== undefined && !VALID_BUG_PRIORITIES.includes(data.priority)) {
    result.valid = false;
    result.errors.push({ code: 'INVALID_PRIORITY', message: `Invalid bug priority "${data.priority}".`, validValues: VALID_BUG_PRIORITIES });
  }
  return result;
}

// ──────────────────────────────────────────────
// Task validation
// ──────────────────────────────────────────────

export function validateTaskFields(data, isUpdate = false) {
  if (data.status !== undefined && !VALID_TASK_STATUSES.includes(data.status)) {
    throw new Error(
      `Invalid task status "${data.status}". Valid task statuses are: ${VALID_TASK_STATUSES.join(', ')}`
    );
  }
  if (data.priority !== undefined && !VALID_TASK_PRIORITIES.includes(data.priority)) {
    throw new Error(
      `Invalid task priority "${data.priority}". Valid task priorities are: ${VALID_TASK_PRIORITIES.join(', ')}`
    );
  }
  if (data.taskCategory !== undefined && !isValidTaskCategory(data.taskCategory)) {
    throw new Error(
      `Invalid taskCategory "${data.taskCategory}". Valid values: ${TASK_CATEGORY_VALUES.join(', ')}.`
    );
  }
  if (data.completionNote !== undefined && data.completionNote !== null && data.completionNote !== '' && !isValidCompletionNote(data.completionNote)) {
    throw new Error(
      `Invalid completionNote: must be a string of at least ${COMPLETION_NOTE_MIN_LENGTH} chars.`
    );
  }
}

export function collectTaskValidationIssues(data) {
  const result = { valid: true, errors: [] };
  if (data.status !== undefined && !VALID_TASK_STATUSES.includes(data.status)) {
    result.valid = false;
    result.errors.push({ code: 'INVALID_STATUS', message: `Invalid task status "${data.status}".`, validValues: VALID_TASK_STATUSES });
  }
  if (data.priority !== undefined && !VALID_TASK_PRIORITIES.includes(data.priority)) {
    result.valid = false;
    result.errors.push({ code: 'INVALID_PRIORITY', message: `Invalid task priority "${data.priority}".`, validValues: VALID_TASK_PRIORITIES });
  }
  if (data.taskCategory !== undefined && !isValidTaskCategory(data.taskCategory)) {
    result.valid = false;
    result.errors.push({ code: 'INVALID_TASK_CATEGORY', message: `Invalid taskCategory "${data.taskCategory}".`, validValues: TASK_CATEGORY_VALUES });
  }
  if (data.completionNote !== undefined && data.completionNote !== null && data.completionNote !== '' && !isValidCompletionNote(data.completionNote)) {
    result.valid = false;
    result.errors.push({ code: 'INVALID_COMPLETION_NOTE', message: `completionNote must be a string of at least ${COMPLETION_NOTE_MIN_LENGTH} chars.` });
  }
  return result;
}

export function validateStatusTransition(currentCard, updates, type) {
  if (type !== 'task') return;
  const newStatus = updates.status;
  if (!newStatus) return;
  const currentStatus = currentCard.status;
  if (currentStatus === newStatus) return;

  if (MCP_RESTRICTED_STATUSES.includes(newStatus)) {
    throw new Error(
      `MCP cannot change task status to "${newStatus}". ` +
      'Only the assigned validator or co-validator can change the status. ' +
      'Use "To Validate" instead. The validator will then set it to "Done&Validated" if approved, or "Reopened" if changes are needed.'
    );
  }

  const finalCard = { ...currentCard, ...updates };
  const normalizedCurrentStatus = (currentStatus || '').toLowerCase().replace(/\s+/g, '');

  if (normalizedCurrentStatus === 'todo' && newStatus !== 'To Do') {
    const missingFields = REQUIRED_FIELDS_TO_LEAVE_TODO.filter(field => !hasValidValue(finalCard, field));
    if (missingFields.length > 0) {
      const friendlyMissing = missingFields.map(f => FRIENDLY_FIELD_NAMES[f] || f);
      throw new Error(
        `Cannot change task from "To Do" to "${newStatus}": missing required fields: ${friendlyMissing.join(', ')}. ` +
        'A task cannot leave "To Do" without ALL these fields populated.'
      );
    }
  }

  if (newStatus === 'Blocked') {
    if (!finalCard.blockedByBusiness && !finalCard.blockedByDevelopment) {
      throw new Error('Cannot change to "Blocked": must specify blockedByBusiness=true or blockedByDevelopment=true (or both).');
    }
    const missingBlockedFields = [];
    if (finalCard.blockedByBusiness) {
      if (!hasValidValue(finalCard, 'bbbWhy')) missingBlockedFields.push('bbbWhy (reason for business block)');
      if (!hasValidValue(finalCard, 'bbbWho')) missingBlockedFields.push('bbbWho (who is blocking)');
    }
    if (finalCard.blockedByDevelopment) {
      if (!hasValidValue(finalCard, 'bbdWhy')) missingBlockedFields.push('bbdWhy (reason for development block)');
      if (!hasValidValue(finalCard, 'bbdWho')) missingBlockedFields.push('bbdWho (who is blocking)');
    }
    if (missingBlockedFields.length > 0) {
      throw new Error(
        `Cannot change to "Blocked": missing required fields: ${missingBlockedFields.join(', ')}. ` +
        'When blocking a task, you must specify who is blocking and why.'
      );
    }
  }

  if (newStatus === 'To Validate') {
    const category = getTaskCategory(finalCard);
    const missingForValidate = [];
    if (!hasValidValue(finalCard, 'startDate')) missingForValidate.push('startDate (when work started, e.g., "2024-01-15")');

    if (category === 'nocode') {
      // nocode tasks: no commits, no PR — completionNote is the audit trail.
      if (!hasValidValue(finalCard, 'endDate')) {
        missingForValidate.push('endDate (when work finished, e.g., "2024-01-20")');
      }
      if (!isValidCompletionNote(finalCard.completionNote)) {
        missingForValidate.push(
          `completionNote (a description of what was done, min ${COMPLETION_NOTE_MIN_LENGTH} chars — replaces the commit log for nocode tasks)`
        );
      }
    } else {
      // code tasks: legacy behaviour — commits + PR.
      if (!(Array.isArray(finalCard.commits) && finalCard.commits.length > 0)) {
        missingForValidate.push('commits (at least one commit with hash, message, date, author)');
      }
      const prDiag = diagnosePrCreated(finalCard.pipelineStatus);
      if (!prDiag.ok) {
        missingForValidate.push(formatPrCreatedError(prDiag));
      }
    }

    for (const field of REQUIRED_FIELDS_TO_LEAVE_TODO) {
      if (!hasValidValue(finalCard, field)) missingForValidate.push(FRIENDLY_FIELD_NAMES[field] || field);
    }

    if (missingForValidate.length > 0) {
      throw new Error(
        `Cannot change to "To Validate" (taskCategory="${category}"): missing required fields: ${missingForValidate.join(', ')}. ` +
        'All tasks must have complete information before being sent for validation.'
      );
    }
  }
}

export function collectValidationIssues(currentCard, updates, type) {
  const result = { valid: true, missingFields: [], errors: [], warnings: [], requiredFields: {} };
  if (type !== 'task') return result;
  const newStatus = updates.status;
  if (!newStatus) return result;
  const currentStatus = currentCard.status;
  if (currentStatus === newStatus) return result;

  if (MCP_RESTRICTED_STATUSES.includes(newStatus)) {
    result.valid = false;
    result.errors.push({
      code: 'VALIDATOR_ONLY_STATUS',
      message: `MCP cannot change task status to "${newStatus}". Only the assigned validator or co-validator can change the status.`,
      suggestion: 'Use "To Validate" instead.'
    });
    return result;
  }

  const normalizedCurrentStatus = (currentStatus || '').toLowerCase().replace(/\s+/g, '');
  if (normalizedCurrentStatus === 'todo' && newStatus !== 'To Do') {
    const finalCard = { ...currentCard, ...updates };
    for (const field of REQUIRED_FIELDS_TO_LEAVE_TODO) {
      const fieldHasValue = hasValidValue(finalCard, field);
      result.requiredFields[field] = {
        required: true, currentValue: currentCard[field] || null,
        providedInUpdate: updates[field] !== undefined, finalValue: finalCard[field] || null, missing: !fieldHasValue
      };
      if (!fieldHasValue) { result.missingFields.push(field); result.valid = false; }
    }
    if (result.missingFields.length > 0) {
      const friendlyMissing = result.missingFields.map(f => FRIENDLY_FIELD_NAMES[f] || f);
      result.errors.push({
        code: 'MISSING_REQUIRED_FIELDS',
        message: `Cannot change task from "To Do" to "${newStatus}": missing required fields: ${friendlyMissing.join(', ')}.`,
        suggestion: 'A task cannot leave "To Do" without ALL these fields.'
      });
    }
  }

  if (newStatus === 'To Validate') {
    const finalCard = { ...currentCard, ...updates };
    const category = getTaskCategory(finalCard);
    result.taskCategory = category;

    if (!hasValidValue(finalCard, 'startDate')) {
      result.valid = false; result.missingFields.push('startDate');
      result.requiredFields.startDate = { required: true, currentValue: currentCard.startDate || null, providedInUpdate: updates.startDate !== undefined, finalValue: finalCard.startDate || null, missing: true };
      result.errors.push({ code: 'MISSING_START_DATE', message: 'Cannot change to "To Validate": startDate is required.', suggestion: 'Include startDate in ISO format.' });
    }

    if (category === 'nocode') {
      // nocode tasks: no commits, no PR — completionNote + endDate are the audit trail.
      if (!hasValidValue(finalCard, 'endDate')) {
        result.valid = false; result.missingFields.push('endDate');
        result.requiredFields.endDate = { required: true, currentValue: currentCard.endDate || null, providedInUpdate: updates.endDate !== undefined, finalValue: finalCard.endDate || null, missing: true };
        result.errors.push({ code: 'MISSING_END_DATE', message: 'Cannot change to "To Validate" (nocode): endDate is required.', suggestion: 'Include endDate in ISO format.' });
      }
      if (!isValidCompletionNote(finalCard.completionNote)) {
        result.valid = false; result.missingFields.push('completionNote');
        result.requiredFields.completionNote = { required: true, currentValue: currentCard.completionNote || null, providedInUpdate: updates.completionNote !== undefined, finalValue: finalCard.completionNote || null, missing: true };
        result.errors.push({
          code: 'MISSING_COMPLETION_NOTE',
          field: 'completionNote',
          message: `Cannot change to "To Validate" (nocode): completionNote is required (min ${COMPLETION_NOTE_MIN_LENGTH} chars).`,
          suggestion: 'Describe briefly what was done. This replaces the commit log for nocode tasks.'
        });
      }
    } else {
      // code tasks: legacy behaviour — commits + PR.
      if (!(Array.isArray(finalCard.commits) && finalCard.commits.length > 0)) {
        result.valid = false; result.missingFields.push('commits');
        result.requiredFields.commits = { required: true, currentValue: currentCard.commits || null, providedInUpdate: updates.commits !== undefined, finalValue: finalCard.commits || null, missing: true };
        result.errors.push({ code: 'MISSING_COMMITS', message: 'Cannot change to "To Validate": at least one commit is required.' });
      }
      const prDiag = diagnosePrCreated(finalCard.pipelineStatus);
      if (!prDiag.ok) {
        result.valid = false; result.missingFields.push('pipelineStatus');
        result.requiredFields.pipelineStatus = {
          required: true, currentValue: currentCard.pipelineStatus || null,
          providedInUpdate: updates.pipelineStatus !== undefined, finalValue: finalCard.pipelineStatus || null, missing: true,
          expected: prDiag.expected, received: prDiag.received, example: prDiag.example
        };
        result.errors.push({
          code: 'MISSING_PIPELINE_STATUS',
          field: 'pipelineStatus.prCreated',
          message: `Cannot change to "To Validate": ${formatPrCreatedError(prDiag)}`,
          expected: prDiag.expected,
          received: prDiag.received,
          example: prDiag.example,
          suggestion: 'Set pipelineStatus.prCreated to an object with prUrl and prNumber (create the PR first).'
        });
      }
    }

    for (const field of REQUIRED_FIELDS_TO_LEAVE_TODO) {
      if (!hasValidValue(finalCard, field) && !result.missingFields.includes(field)) {
        result.valid = false; result.missingFields.push(field);
        result.errors.push({ code: 'MISSING_REQUIRED_FIELD', message: `Cannot change to "To Validate": ${field} is required.` });
      }
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Commits validation
// ──────────────────────────────────────────────

export const COMMITS_VALIDATION_ERROR_CODES = {
  NOT_AN_ARRAY: 'COMMITS_NOT_AN_ARRAY',
  MISSING_HASH: 'COMMIT_MISSING_HASH',
  MISSING_MESSAGE: 'COMMIT_MISSING_MESSAGE',
  MISSING_DATE: 'COMMIT_MISSING_DATE',
  MISSING_AUTHOR: 'COMMIT_MISSING_AUTHOR',
  INVALID_COMMIT_STRUCTURE: 'INVALID_COMMIT_STRUCTURE'
};

function validateSingleCommit(commit, index) {
  const errors = [];
  if (!commit || typeof commit !== 'object') {
    errors.push({ code: COMMITS_VALIDATION_ERROR_CODES.INVALID_COMMIT_STRUCTURE, message: `Commit at index ${index} is not a valid object`, index });
    return { valid: false, errors };
  }
  if (!commit.hash || (typeof commit.hash === 'string' && commit.hash.trim() === '')) {
    errors.push({ code: COMMITS_VALIDATION_ERROR_CODES.MISSING_HASH, message: `Commit at index ${index} is missing required field: hash`, index });
  }
  if (!commit.message || (typeof commit.message === 'string' && commit.message.trim() === '')) {
    errors.push({ code: COMMITS_VALIDATION_ERROR_CODES.MISSING_MESSAGE, message: `Commit at index ${index} is missing required field: message`, index });
  }
  if (!commit.date || (typeof commit.date === 'string' && commit.date.trim() === '')) {
    errors.push({ code: COMMITS_VALIDATION_ERROR_CODES.MISSING_DATE, message: `Commit at index ${index} is missing required field: date`, index });
  }
  if (!commit.author || (typeof commit.author === 'string' && commit.author.trim() === '')) {
    errors.push({ code: COMMITS_VALIDATION_ERROR_CODES.MISSING_AUTHOR, message: `Commit at index ${index} is missing required field: author`, index });
  }
  return { valid: errors.length === 0, errors };
}

export function validateCommitsField(commits) {
  const result = { valid: true, errors: [] };
  if (!Array.isArray(commits)) {
    result.valid = false;
    result.errors.push({ code: COMMITS_VALIDATION_ERROR_CODES.NOT_AN_ARRAY, message: 'commits field must be an array' });
    return result;
  }
  if (commits.length === 0) return result;
  for (let i = 0; i < commits.length; i++) {
    const commitResult = validateSingleCommit(commits[i], i);
    if (!commitResult.valid) { result.valid = false; result.errors.push(...commitResult.errors); }
  }
  return result;
}

export function appendCommitsToCard(currentCard, newCommits) {
  const existingCommits = currentCard.commits || [];
  if (!newCommits || !Array.isArray(newCommits) || newCommits.length === 0) return existingCommits;
  const existingHashes = new Set(existingCommits.map(c => c.hash));
  const commitsToAdd = newCommits.filter(c => !existingHashes.has(c.hash));
  return [...existingCommits, ...commitsToAdd];
}

// ──────────────────────────────────────────────
// Implementation plan validation
// ──────────────────────────────────────────────

export function migrateImplementationPlan(plan) {
  if (!plan) return null;
  if (typeof plan === 'object' && !Array.isArray(plan)) return plan;
  if (typeof plan === 'string' && plan.trim() !== '') {
    return { approach: plan, steps: [], dataModelChanges: '', apiChanges: '', risks: '', outOfScope: '', planStatus: 'proposed' };
  }
  return null;
}

export function validateImplementationPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return { valid: true, errors: [] };
  if (!plan.approach || (typeof plan.approach === 'string' && plan.approach.trim() === '')) {
    errors.push({ code: 'MISSING_APPROACH', message: 'implementationPlan.approach is required when providing an implementation plan' });
  }
  if (plan.planStatus && !VALID_PLAN_STATUSES.includes(plan.planStatus)) {
    errors.push({ code: 'INVALID_PLAN_STATUS', message: `Invalid planStatus "${plan.planStatus}". Valid values: ${VALID_PLAN_STATUSES.join(', ')}` });
  }
  if (plan.steps) {
    if (!Array.isArray(plan.steps)) {
      errors.push({ code: 'INVALID_STEPS', message: 'implementationPlan.steps must be an array' });
    } else {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        if (!step.description || (typeof step.description === 'string' && step.description.trim() === '')) {
          errors.push({ code: 'MISSING_STEP_DESCRIPTION', message: `implementationPlan.steps[${i}].description is required` });
        }
        if (step.status && !VALID_STEP_STATUSES.includes(step.status)) {
          errors.push({ code: 'INVALID_STEP_STATUS', message: `Invalid step status "${step.status}" at index ${i}. Valid values: ${VALID_STEP_STATUSES.join(', ')}` });
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

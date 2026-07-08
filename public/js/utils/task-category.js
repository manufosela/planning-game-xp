/**
 * Task category helpers — single source of truth for the code/nocode
 * behaviour introduced by PLN-TSK-0354. Consumed by mcp/tools/cards.js
 * (Node) and, via a byte-identical mirror at public/js/utils/task-category.js,
 * by the browser. Astro does not serve /shared/ to the client, so both
 * copies stay in sync via tests/shared/task-category-mirror.test.js.
 *
 * A task's `taskCategory` decides which fields are required to move it to
 * "To Validate":
 *   - 'code'   → commits + pipelineStatus.prCreated (legacy behaviour)
 *   - 'nocode' → completionNote (min N chars). No commits nor PR required.
 *
 * A task without the field is treated as 'code' — cero migration of the
 * ~2000 existing tasks.
 *
 * NOTE: the field lists (REQUIRED_FIELDS_TO_LEAVE_TODO,
 * REQUIRED_FIELDS_FOR_TO_VALIDATE, REQUIRED_FIELDS_FOR_TO_VALIDATE_NOCODE)
 * are inlined here to keep this file dependency-free so the mirror can be
 * byte-identical without dragging constants.js into the browser bundle.
 * If any of those lists changes in shared/constants.js this file must be
 * updated too — the tests cover both callers.
 */

export const TASK_CATEGORY_CODE = 'code';
export const TASK_CATEGORY_NOCODE = 'nocode';
export const TASK_CATEGORY_VALUES = [TASK_CATEGORY_CODE, TASK_CATEGORY_NOCODE];
export const TASK_CATEGORY_DEFAULT = TASK_CATEGORY_CODE;
export const COMPLETION_NOTE_MIN_LENGTH = 20;

const REQUIRED_FIELDS_TO_LEAVE_TODO = [
  'title',
  'developer',
  'validator',
  'epic',
  'sprint',
  'devPoints',
  'businessPoints',
  'acceptanceCriteria'
];

const REQUIRED_FIELDS_FOR_TO_VALIDATE_CODE_EXTRA = [
  'startDate',
  'commits'
];

const REQUIRED_FIELDS_FOR_TO_VALIDATE_NOCODE_EXTRA = [
  'startDate',
  'endDate',
  'completionNote'
];

/**
 * Coerce a task (or plain object) into a normalized category value.
 * Any unknown or missing value collapses to the default ('code').
 * @param {Object|undefined|null} task
 * @returns {'code'|'nocode'}
 */
export function getTaskCategory(task) {
  const raw = task && typeof task === 'object' ? task.taskCategory : undefined;
  if (raw === TASK_CATEGORY_NOCODE) return TASK_CATEGORY_NOCODE;
  return TASK_CATEGORY_DEFAULT;
}

/**
 * Whether a value is a valid taskCategory identifier.
 * @param {*} value
 * @returns {boolean}
 */
export function isValidTaskCategory(value) {
  return TASK_CATEGORY_VALUES.includes(value);
}

/**
 * Resolve the flat list of required fields to move a task from any status
 * to "To Validate". This is the composed list (fields to leave To Do +
 * transition-specific fields) so callers can iterate over one array.
 *
 * Does NOT include the nested pipelineStatus.prCreated check — callers
 * that need it should check it separately (see requiresPipelineStatus).
 *
 * @param {Object} task
 * @returns {string[]}
 */
export function resolveToValidateRequirements(task) {
  const category = getTaskCategory(task);
  if (category === TASK_CATEGORY_NOCODE) {
    return [...REQUIRED_FIELDS_TO_LEAVE_TODO, ...REQUIRED_FIELDS_FOR_TO_VALIDATE_NOCODE_EXTRA];
  }
  return [...REQUIRED_FIELDS_TO_LEAVE_TODO, ...REQUIRED_FIELDS_FOR_TO_VALIDATE_CODE_EXTRA];
}

/**
 * Whether pipelineStatus.prCreated is required for this task to reach
 * "To Validate". True for code tasks (default), false for nocode.
 * @param {Object} task
 * @returns {boolean}
 */
export function requiresPipelineStatus(task) {
  return getTaskCategory(task) === TASK_CATEGORY_CODE;
}

/**
 * Structured requirements for both categories, for exposure by
 * get_transition_rules so LLM callers see the two variants without
 * having to know the category up front.
 * @returns {{ code: string[], nocode: string[] }}
 */
export function toValidateRequirementsByCategory() {
  return {
    code: [
      ...REQUIRED_FIELDS_TO_LEAVE_TODO,
      ...REQUIRED_FIELDS_FOR_TO_VALIDATE_CODE_EXTRA,
      'pipelineStatus.prCreated'
    ],
    nocode: [
      ...REQUIRED_FIELDS_TO_LEAVE_TODO,
      ...REQUIRED_FIELDS_FOR_TO_VALIDATE_NOCODE_EXTRA
    ]
  };
}

/**
 * Whether a completionNote value satisfies the audit trail requirement.
 * @param {*} value
 * @returns {boolean}
 */
export function isValidCompletionNote(value) {
  return typeof value === 'string' && value.trim().length >= COMPLETION_NOTE_MIN_LENGTH;
}

/**
 * Centralized card field schemas - Single source of truth
 *
 * PERSISTENT_FIELDS: Fields saved to Firebase (whitelist for getWCProps())
 * VIEW_FIELDS: Subset for optimized table views (_extractViewFields() and CF sync)
 *
 * When adding a new field to a card type:
 * 1. Add to PERSISTENT_FIELDS here
 * 2. Add to VIEW_FIELDS if needed in table display
 * 3. All consumers automatically pick it up
 */

// Base fields shared by all card types
export const BASE_PERSISTENT_FIELDS = [
  'firebaseId', 'cardId', 'title', 'description', 'notes',
  'startDate', 'endDate', 'createdBy', 'updatedBy', 'projectId', 'cardType'
];

export const TASK_SCHEMA = {
  PERSISTENT_FIELDS: [
    ...BASE_PERSISTENT_FIELDS,
    'acceptanceCriteria', 'descriptionStructured', 'acceptanceCriteriaStructured',
    'businessPoints', 'devPoints', 'sprint', 'spike', 'expedited', 'status',
    'developer', 'coDeveloper', 'developerName', 'epic',
    'validator', 'coValidator',
    'blockedByBusiness', 'blockedByDevelopment', 'bbbWhy', 'bbbWho', 'bbdWhy', 'bbdWho',
    'group', 'developerHistory', 'blockedHistory',
    'attachment', 'relatedTasks', 'repositoryLabel', 'year',
    'commits', 'validatedAt', 'reopenCycles', 'reopenCount',
    'implementationPlan', 'implementationNotes',
    'aiUsage', 'pipelineStatus',
    'timeLog', 'totalElapsedTime', 'effectiveWorkTime', 'totalPausedTime'
  ],
  VIEW_FIELDS: [
    'firebaseId', 'cardId', 'title', 'status',
    'businessPoints', 'devPoints', 'sprint',
    'developer', 'coDeveloper', 'validator', 'coValidator',
    'epic', 'startDate', 'endDate', 'spike', 'expedited',
    'blockedByBusiness', 'blockedByDevelopment', 'year', 'relatedTasks',
    'notesCount', 'planStatus',
    'commitsCount', 'pipelineStatus'
  ]
};

export const BUG_SCHEMA = {
  PERSISTENT_FIELDS: [
    ...BASE_PERSISTENT_FIELDS,
    'status', 'priority', 'developer', 'coDeveloper', 'validator',
    'registerDate', 'acceptanceCriteria', 'acceptanceCriteriaStructured',
    'bugType', 'attachment', 'repositoryLabel', 'year', 'group',
    'epic', 'sprint', 'commits',
    'cinemaFile', 'exportedFile', 'importedFile',
    'plugin', 'pluginVersion', 'treatmentType',
    'rootCause', 'resolution',
    'aiUsage', 'pipelineStatus'
  ],
  VIEW_FIELDS: [
    'firebaseId', 'cardId', 'title', 'status', 'priority',
    'developer', 'coDeveloper', 'createdBy',
    'registerDate', 'startDate', 'endDate', 'year',
    'commitsCount', 'pipelineStatus'
  ]
};

export const PROPOSAL_SCHEMA = {
  PERSISTENT_FIELDS: [
    ...BASE_PERSISTENT_FIELDS,
    'status', 'acceptanceCriteria', 'acceptanceCriteriaStructured',
    'registerDate', 'group', 'section',
    'epic', 'businessPoints', 'projectScoringSystem',
    'developer', 'stakeholder', 'year',
    'descDado', 'descCuando', 'descPara'
  ],
  VIEW_FIELDS: [
    'firebaseId', 'cardId', 'title', 'status',
    'businessPoints', 'createdBy', 'stakeholder',
    'registerDate', 'year'
  ]
};

export const EPIC_SCHEMA = {
  PERSISTENT_FIELDS: [
    ...BASE_PERSISTENT_FIELDS,
    'objective', 'acceptanceCriteria',
    'year', 'section', 'group',
    'stakeholdersSelected', 'epicRelationsSelected'
  ],
  VIEW_FIELDS: [] // Epics don't have optimized views
};

export const QA_SCHEMA = {
  PERSISTENT_FIELDS: [
    ...BASE_PERSISTENT_FIELDS,
    'associatedTaskId', 'priority', 'steps', 'status',
    'actualResult', 'expectedResult', 'defectType',
    'attachments', 'group', 'section', 'suiteId'
  ],
  VIEW_FIELDS: [] // QA items don't have optimized views
};

export const SPRINT_SCHEMA = {
  PERSISTENT_FIELDS: [
    ...BASE_PERSISTENT_FIELDS,
    'retrospective', 'businessPoints', 'devPoints',
    'realBusinessPoints', 'realDevPoints', 'year',
    'demoVideo', 'demoVideoUrl', 'demoSummary',
    'group', 'section'
  ],
  VIEW_FIELDS: [] // Sprints don't have optimized views
};

// Map card types to schemas (using both cardType values and tag names)
export const CARD_SCHEMAS = {
  'task-card': TASK_SCHEMA,
  'bug-card': BUG_SCHEMA,
  'proposal-card': PROPOSAL_SCHEMA,
  'epic-card': EPIC_SCHEMA,
  'qa-card': QA_SCHEMA,
  'sprint-card': SPRINT_SCHEMA
};

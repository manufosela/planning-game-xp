/**
 * Zod validation schemas for all card types.
 *
 * Mirrors the type definitions in src/lib/types.d.ts.
 * Used for form validation (pg-form) and Firestore writes.
 *
 * @module schemas/cards
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** @type {z.ZodObject} */
export const userStorySchema = z.object({
  role: z.string().min(1, 'Role is required'),
  goal: z.string().min(1, 'Goal is required'),
  benefit: z.string().min(1, 'Benefit is required'),
});

/** @type {z.ZodObject} */
export const acceptanceCriteriaSchema = z.object({
  given: z.string().min(1, 'Given is required'),
  when: z.string().min(1, 'When is required'),
  then: z.string().min(1, 'Then is required'),
});

/** @type {z.ZodObject} */
export const teamMemberRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
});

/** @type {z.ZodObject} */
export const commitSchema = z.object({
  hash: z.string().min(1),
  message: z.string().min(1),
  date: z.string().min(1),
  author: z.string().min(1),
});

/** @type {z.ZodObject} */
export const pipelineSchema = z.object({
  branch: z.string().optional(),
  prUrl: z.string().url().optional(),
  prNumber: z.number().int().positive().optional(),
  mergedAt: z.any().optional(),
  deployedAt: z.any().optional(),
});

/** @type {z.ZodObject} */
export const implementationPlanSchema = z.object({
  approach: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string()).optional(),
  outOfScope: z.array(z.string()).optional(),
  status: z.enum(['proposed', 'validated']),
});

/** @type {z.ZodObject} */
export const workCycleSchema = z.object({
  startedAt: z.any(),
  endedAt: z.any().optional(),
  durationMs: z.number().nonnegative().optional(),
});

/** @type {z.ZodObject} */
export const aiUsageSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1),
  action: z.string().min(1),
  timestamp: z.any(),
  durationMinutes: z.number().nonnegative(),
});

// ---------------------------------------------------------------------------
// Card type enum
// ---------------------------------------------------------------------------

export const CARD_TYPES = /** @type {const} */ (['task', 'bug', 'epic', 'sprint', 'proposal', 'qa']);

export const cardTypeSchema = z.enum(CARD_TYPES);

// ---------------------------------------------------------------------------
// Status enums
// ---------------------------------------------------------------------------

export const TASK_STATUSES = /** @type {const} */ ([
  'To Do', 'In Progress', 'To Validate', 'Done', 'Done&Validated', 'Blocked', 'Reopened',
]);

export const BUG_STATUSES = /** @type {const} */ ([
  'Created', 'Assigned', 'Fixed', 'Verified', 'Closed',
]);

export const EPIC_STATUSES = /** @type {const} */ (['Active', 'Completed', 'Archived']);

export const SPRINT_STATUSES = /** @type {const} */ (['Active', 'Completed', 'Planned']);

export const PROPOSAL_STATUSES = /** @type {const} */ (['Pending', 'Planned', 'Rejected']);

export const QA_STATUSES = /** @type {const} */ (['Pending', 'Passed', 'Failed']);

export const BUG_PRIORITIES = /** @type {const} */ ([
  'APPLICATION BLOCKER',
  'DEPARTMENT BLOCKER',
  'INDIVIDUAL BLOCKER',
  'USER EXPERIENCE ISSUE',
  'WORKFLOW IMPROVEMENT',
  'WORKAROUND AVAILABLE ISSUE',
]);

// ---------------------------------------------------------------------------
// Base card schema (common fields)
// ---------------------------------------------------------------------------

export const baseCardSchema = z.object({
  cardId: z.string().min(1, 'Card ID is required'),
  type: cardTypeSchema,
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().default(''),
  status: z.string().min(1, 'Status is required'),
  year: z.number().int().min(2020).max(2099),
  epic: z.string().optional(),
  sprint: z.string().optional(),
  createdAt: z.any(),
  createdBy: z.string().min(1),
  updatedAt: z.any(),
  updatedBy: z.string().min(1),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Type-specific schemas
// ---------------------------------------------------------------------------

export const taskSchema = baseCardSchema.extend({
  type: z.literal('task'),
  status: z.enum(TASK_STATUSES),
  userStory: userStorySchema,
  acceptanceCriteria: z.array(acceptanceCriteriaSchema).min(1, 'At least one acceptance criterion is required'),
  devPoints: z.number().int().min(1).max(5),
  businessPoints: z.number().int().min(1).max(5),
  priority: z.number().nonnegative(),
  developer: teamMemberRefSchema.optional(),
  codeveloper: teamMemberRefSchema.optional(),
  validator: teamMemberRefSchema.optional(),
  covalidator: teamMemberRefSchema.optional(),
  startDate: z.any().optional(),
  endDate: z.any().optional(),
  commits: z.array(commitSchema).optional(),
  pipeline: pipelineSchema.optional(),
  implementationPlan: implementationPlanSchema.optional(),
  workCycles: z.array(workCycleSchema).optional(),
  totalWorkMs: z.number().nonnegative().optional(),
  aiUsage: z.array(aiUsageSchema).optional(),
});

export const bugSchema = baseCardSchema.extend({
  type: z.literal('bug'),
  status: z.enum(BUG_STATUSES),
  bugPriority: z.enum(BUG_PRIORITIES),
  registeredAt: z.any(),
  developer: teamMemberRefSchema.optional(),
  validator: teamMemberRefSchema.optional(),
  rootCause: z.string().optional(),
  resolution: z.string().optional(),
  commits: z.array(commitSchema).optional(),
  pipeline: pipelineSchema.optional(),
  attachments: z.array(z.string()).optional(),
});

export const epicSchema = baseCardSchema.extend({
  type: z.literal('epic'),
  status: z.enum(EPIC_STATUSES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
});

export const sprintSchema = baseCardSchema.extend({
  type: z.literal('sprint'),
  startDate: z.any(),
  endDate: z.any(),
  locked: z.boolean(),
  goals: z.array(z.string()).optional(),
});

export const proposalSchema = baseCardSchema.extend({
  type: z.literal('proposal'),
  status: z.enum(PROPOSAL_STATUSES),
  userStory: userStorySchema.optional(),
  convertedToTaskId: z.string().optional(),
});

export const qaSchema = baseCardSchema.extend({
  type: z.literal('qa'),
  status: z.enum(QA_STATUSES),
  suite: z.string().min(1, 'Suite is required'),
  steps: z.array(z.string().min(1)).min(1, 'At least one step is required'),
  expectedResult: z.string().min(1, 'Expected result is required'),
  actualResult: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Discriminated union: validates any card type
// ---------------------------------------------------------------------------

export const cardSchema = z.discriminatedUnion('type', [
  taskSchema,
  bugSchema,
  epicSchema,
  sprintSchema,
  proposalSchema,
  qaSchema,
]);

// ---------------------------------------------------------------------------
// Schema map by type (for partial validation)
// ---------------------------------------------------------------------------

/** @type {Record<string, z.ZodObject<any>>} */
const SCHEMA_BY_TYPE = {
  task: taskSchema,
  bug: bugSchema,
  epic: epicSchema,
  sprint: sprintSchema,
  proposal: proposalSchema,
  qa: qaSchema,
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a complete card object.
 * @param {unknown} data
 * @returns {{ success: true, data: import('../lib/types.d.ts').Card } | { success: false, errors: z.ZodError }}
 */
export function validateCard(data) {
  const result = cardSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: /** @type {import('../lib/types.d.ts').Card} */ (result.data) };
  }
  return { success: false, errors: result.error };
}

/**
 * Validate a partial card (for updates). Only validates the fields that are present.
 * @param {string} type - Card type
 * @param {Record<string, unknown>} data - Partial card data
 * @returns {{ success: true, data: Record<string, unknown> } | { success: false, errors: z.ZodError }}
 */
export function validatePartialCard(type, data) {
  const schema = SCHEMA_BY_TYPE[type];
  if (!schema) {
    return {
      success: false,
      errors: new z.ZodError([{
        code: 'custom',
        message: `Unknown card type: ${type}`,
        path: ['type'],
      }]),
    };
  }

  const partialSchema = schema.partial();
  const result = partialSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Get the schema for a specific card type.
 * @param {string} type
 * @returns {z.ZodObject<any> | undefined}
 */
export function getSchemaForType(type) {
  return SCHEMA_BY_TYPE[type];
}

/**
 * Get valid statuses for a card type.
 * @param {string} type
 * @returns {readonly string[]}
 */
export function getStatusesForType(type) {
  switch (type) {
    case 'task': return TASK_STATUSES;
    case 'bug': return BUG_STATUSES;
    case 'epic': return EPIC_STATUSES;
    case 'sprint': return SPRINT_STATUSES;
    case 'proposal': return PROPOSAL_STATUSES;
    case 'qa': return QA_STATUSES;
    default: return [];
  }
}

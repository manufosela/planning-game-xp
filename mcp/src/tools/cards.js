/**
 * MCP tool definitions for card operations.
 * @module mcp/tools/cards
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';
import { getMcpUserId, getMcpUser } from '../user.js';

// ---------------------------------------------------------------------------
// Transition rules (imported inline to avoid circular deps with frontend)
// ---------------------------------------------------------------------------

const TASK_TRANSITIONS = {
  'To Do': {
    'In Progress': { requiredFields: ['developer', 'validator', 'epic', 'sprint', 'devPoints', 'businessPoints', 'acceptanceCriteria'], validatorOnly: false },
    'Blocked': { requiredFields: ['blockedReason'], validatorOnly: false },
  },
  'In Progress': {
    'To Validate': { requiredFields: ['startDate', 'commits'], validatorOnly: false },
    'To Do': { requiredFields: [], validatorOnly: false },
    'Blocked': { requiredFields: ['blockedReason'], validatorOnly: false },
  },
  'To Validate': {
    'Done': { requiredFields: [], validatorOnly: true },
    'Done&Validated': { requiredFields: [], validatorOnly: true },
    'Reopened': { requiredFields: [], validatorOnly: true },
  },
  'Done': {
    'Done&Validated': { requiredFields: [], validatorOnly: true },
  },
  'Reopened': {
    'In Progress': { requiredFields: ['developer'], validatorOnly: false },
    'To Do': { requiredFields: [], validatorOnly: false },
  },
  'Blocked': {
    'To Do': { requiredFields: [], validatorOnly: false },
    'In Progress': { requiredFields: ['developer'], validatorOnly: false },
  },
};

const BUG_TRANSITIONS = {
  'Created': {
    'Assigned': { requiredFields: ['developer'], validatorOnly: false },
  },
  'Assigned': {
    'Fixed': { requiredFields: ['commits'], validatorOnly: false },
  },
  'Fixed': {
    'Verified': { requiredFields: [], validatorOnly: true },
  },
  'Verified': {
    'Closed': { requiredFields: ['rootCause', 'resolution'], validatorOnly: false },
  },
};

const MCP_RESTRICTED_STATUSES = ['Done', 'Done&Validated'];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const listCardsSchema = z.object({
  projectId: z.string().describe('Project ID'),
  type: z.string().optional().describe('Card type filter (task, bug, epic, sprint, proposal, qa)'),
  status: z.string().optional().describe('Status filter'),
  year: z.number().optional().describe('Year filter'),
  sprint: z.string().optional().describe('Sprint cardId filter'),
  epic: z.string().optional().describe('Epic cardId filter'),
  developerId: z.string().optional().describe('Developer team member ID filter'),
});

export const getCardSchema = z.object({
  projectId: z.string().describe('Project ID'),
  cardId: z.string().describe('Card ID (e.g., "PLN-TSK-0042")'),
});

export const createCardSchema = z.object({
  projectId: z.string().describe('Project ID'),
  type: z.enum(['task', 'bug', 'epic', 'sprint', 'proposal', 'qa']).describe('Card type'),
  title: z.string().describe('Card title'),
  description: z.string().optional().describe('Card description'),
  status: z.string().optional().describe('Initial status'),
  year: z.number().optional().describe('Year (default: current year)'),
  epic: z.string().optional().describe('Epic cardId reference'),
  sprint: z.string().optional().describe('Sprint cardId reference'),
  // Task-specific
  userStory: z.object({
    role: z.string(),
    goal: z.string(),
    benefit: z.string(),
  }).optional().describe('User story (task/proposal)'),
  acceptanceCriteria: z.array(z.object({
    given: z.string(),
    when: z.string(),
    then: z.string(),
  })).optional().describe('Acceptance criteria (Given/When/Then)'),
  devPoints: z.number().optional().describe('Development effort points (1-5)'),
  businessPoints: z.number().optional().describe('Business value points (1-5)'),
  developer: z.object({ id: z.string(), name: z.string(), email: z.string() }).optional().describe('Assigned developer'),
  validator: z.object({ id: z.string(), name: z.string(), email: z.string() }).optional().describe('Assigned validator'),
  // Bug-specific
  bugPriority: z.string().optional().describe('Bug priority level'),
  // Sprint-specific
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD or ISO)'),
  endDate: z.string().optional().describe('End date (YYYY-MM-DD or ISO)'),
  locked: z.boolean().optional().describe('Sprint locked flag'),
  goals: z.array(z.string()).optional().describe('Sprint goals'),
  // Epic-specific
  color: z.string().optional().describe('Epic color (hex)'),
  // QA-specific
  suite: z.string().optional().describe('QA test suite'),
  steps: z.array(z.string()).optional().describe('QA test steps'),
  expectedResult: z.string().optional().describe('QA expected result'),
  // Common
  tags: z.array(z.string()).optional().describe('Tags'),
  notes: z.string().optional().describe('Notes'),
  createdBy: z.string().optional().describe('Creator ID'),
});

export const updateCardSchema = z.object({
  projectId: z.string().describe('Project ID'),
  cardId: z.string().describe('Card ID'),
  updates: z.record(z.unknown()).describe('Fields to update'),
});

export const relateCardsSchema = z.object({
  projectId: z.string().describe('Project ID'),
  sourceCardId: z.string().describe('Source card ID'),
  targetCardId: z.string().describe('Target card ID'),
  relationType: z.enum(['related', 'blocks', 'blockedBy']).describe('Relation type'),
  action: z.enum(['add', 'remove']).default('add').describe('Add or remove relation'),
});

export const getTransitionRulesSchema = z.object({
  cardType: z.enum(['task', 'bug']).describe('Card type'),
  currentStatus: z.string().optional().describe('Current status to show transitions from'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get default status for a card type.
 * @param {string} type
 * @returns {string}
 */
function getDefaultStatus(type) {
  switch (type) {
    case 'task': return 'To Do';
    case 'bug': return 'Created';
    case 'epic': return 'Active';
    case 'sprint': return 'Planned';
    case 'proposal': return 'Pending';
    case 'qa': return 'Pending';
    default: return 'To Do';
  }
}

/**
 * Check if a field has a non-empty value.
 * @param {Record<string, *>} card
 * @param {string} field
 * @returns {boolean}
 */
function hasField(card, field) {
  const value = card[field];
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return value.id != null;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true;
  return Boolean(value);
}

/**
 * Validate a status transition.
 * @param {Record<string, *>} card
 * @param {string} newStatus
 * @param {Record<string, *>} mergedData - Card data merged with updates
 * @returns {{ allowed: boolean; reason?: string; missing?: string[] }}
 */
function validateTransition(card, newStatus, mergedData) {
  const type = card.type;
  const currentStatus = card.status;

  if (currentStatus === newStatus) {
    return { allowed: false, reason: 'Card is already in this status' };
  }

  // MCP cannot set tasks to Done or Done&Validated
  if (type === 'task' && MCP_RESTRICTED_STATUSES.includes(newStatus)) {
    return {
      allowed: false,
      reason: `MCP cannot change task status to "${newStatus}". Only the assigned validator can mark tasks as done. Use "To Validate" instead.`,
    };
  }

  const rules = type === 'task' ? TASK_TRANSITIONS : type === 'bug' ? BUG_TRANSITIONS : null;
  if (!rules) return { allowed: true };

  const fromRules = rules[currentStatus];
  if (!fromRules) {
    return { allowed: false, reason: `No transitions defined from status "${currentStatus}"` };
  }

  const rule = fromRules[newStatus];
  if (!rule) {
    return {
      allowed: false,
      reason: `Transition from "${currentStatus}" to "${newStatus}" is not allowed`,
    };
  }

  // Check required fields on merged data
  const missing = rule.requiredFields.filter((field) => !hasField(mergedData, field));
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: `Missing required fields: ${missing.join(', ')}`,
      missing,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * List cards for a project.
 */
export async function listCards(params) {
  const { projectId, type, status, year, sprint, epic, developerId } = params;
  const cards = await db.getCards(projectId, { type, status, year, sprint, epic, developerId });

  if (cards.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: 'No cards found.', cards: [] }, null, 2) }] };
  }

  // Return summary for list view
  const summary = cards.map((c) => ({
    cardId: c.cardId,
    type: c.type,
    title: c.title,
    status: c.status,
    year: c.year,
    sprint: c.sprint,
    epic: c.epic,
    developer: c.developer ? { id: c.developer.id, name: c.developer.name } : null,
    devPoints: c.devPoints,
    businessPoints: c.businessPoints,
    priority: c.priority,
    tags: c.tags,
  }));

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

/**
 * Get a single card.
 */
export async function getCard({ projectId, cardId }) {
  const card = await db.getCard(projectId, cardId);

  if (!card) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Card "${cardId}" not found in project "${projectId}".` }, null, 2) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(card, null, 2) }] };
}

/**
 * Create a new card.
 */
export async function createCard(params) {
  const { projectId, type, title, ...rest } = params;

  const cardData = {
    type,
    title,
    description: rest.description || '',
    status: rest.status || getDefaultStatus(type),
    year: rest.year || new Date().getFullYear(),
    createdBy: rest.createdBy || getMcpUserId(),
    updatedBy: rest.createdBy || getMcpUserId(),
  };

  // Copy optional fields
  const optionalFields = [
    'epic', 'sprint', 'userStory', 'acceptanceCriteria',
    'devPoints', 'businessPoints', 'developer', 'validator',
    'bugPriority', 'startDate', 'endDate', 'locked', 'goals',
    'color', 'suite', 'steps', 'expectedResult', 'tags', 'notes',
  ];

  for (const field of optionalFields) {
    if (rest[field] !== undefined) {
      cardData[field] = rest[field];
    }
  }

  // Calculate priority for tasks
  if (type === 'task' && cardData.devPoints && cardData.businessPoints) {
    cardData.priority = Math.round((cardData.businessPoints / cardData.devPoints) * 100);
  }

  const cardId = await db.createCard(projectId, cardData);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'Card created successfully',
        cardId,
        projectId,
        type,
        title,
      }, null, 2),
    }],
  };
}

/**
 * Update an existing card.
 */
export async function updateCard({ projectId, cardId, updates }) {
  const current = await db.getCard(projectId, cardId);
  if (!current) {
    throw new Error(`Card "${cardId}" not found in project "${projectId}".`);
  }

  const protectedFields = ['cardId', 'type', 'createdAt', 'createdBy'];
  for (const field of protectedFields) {
    if (field in updates) {
      throw new Error(`Cannot update protected field: "${field}"`);
    }
  }

  // Recalculate priority if points change
  if (current.type === 'task') {
    const devPoints = updates.devPoints ?? current.devPoints;
    const businessPoints = updates.businessPoints ?? current.businessPoints;
    if (devPoints && businessPoints) {
      updates.priority = Math.round((businessPoints / devPoints) * 100);
    }
  }

  // Validate status transition if status is being changed
  if (updates.status && updates.status !== current.status) {
    const merged = { ...current, ...updates };
    const result = validateTransition(current, updates.status, merged);
    if (!result.allowed) {
      throw new Error(result.reason);
    }
  }

  const userId = getMcpUserId();
  await db.updateCard(projectId, cardId, updates, { uid: userId, name: userId });

  const updated = await db.getCard(projectId, cardId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Card "${cardId}" updated successfully`,
        card: updated,
      }, null, 2),
    }],
  };
}

/**
 * Create or remove relations between cards.
 */
export async function relateCards({ projectId, sourceCardId, targetCardId, relationType, action }) {
  const source = await db.getCard(projectId, sourceCardId);
  if (!source) throw new Error(`Source card "${sourceCardId}" not found.`);

  const target = await db.getCard(projectId, targetCardId);
  if (!target) throw new Error(`Target card "${targetCardId}" not found.`);

  const userId = getMcpUserId();
  const changedBy = { uid: userId, name: userId };

  if (action === 'add') {
    // Add relation to source
    const sourceRelations = source.relations || {};
    const existing = sourceRelations[relationType] || [];
    if (!existing.includes(targetCardId)) {
      existing.push(targetCardId);
    }
    sourceRelations[relationType] = existing;
    await db.updateCard(projectId, sourceCardId, { relations: sourceRelations }, changedBy);

    // Add inverse relation to target
    const inverseType = relationType === 'blocks' ? 'blockedBy' : relationType === 'blockedBy' ? 'blocks' : 'related';
    const targetRelations = target.relations || {};
    const targetExisting = targetRelations[inverseType] || [];
    if (!targetExisting.includes(sourceCardId)) {
      targetExisting.push(sourceCardId);
    }
    targetRelations[inverseType] = targetExisting;
    await db.updateCard(projectId, targetCardId, { relations: targetRelations }, changedBy);
  } else {
    // Remove relation
    const sourceRelations = source.relations || {};
    const existing = sourceRelations[relationType] || [];
    sourceRelations[relationType] = existing.filter((id) => id !== targetCardId);
    await db.updateCard(projectId, sourceCardId, { relations: sourceRelations }, changedBy);

    const inverseType = relationType === 'blocks' ? 'blockedBy' : relationType === 'blockedBy' ? 'blocks' : 'related';
    const targetRelations = target.relations || {};
    const targetExisting = targetRelations[inverseType] || [];
    targetRelations[inverseType] = targetExisting.filter((id) => id !== sourceCardId);
    await db.updateCard(projectId, targetCardId, { relations: targetRelations }, changedBy);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Relation ${action === 'add' ? 'created' : 'removed'} successfully`,
        source: sourceCardId,
        target: targetCardId,
        relationType,
      }, null, 2),
    }],
  };
}

/**
 * Get transition rules for a card type.
 */
export async function getTransitionRules({ cardType, currentStatus }) {
  const rules = cardType === 'task' ? TASK_TRANSITIONS : BUG_TRANSITIONS;

  if (currentStatus) {
    const fromRules = rules[currentStatus];
    if (!fromRules) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            cardType,
            currentStatus,
            transitions: {},
            message: `No transitions defined from status "${currentStatus}"`,
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          cardType,
          currentStatus,
          transitions: fromRules,
          mcpRestricted: MCP_RESTRICTED_STATUSES,
        }, null, 2),
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        cardType,
        allTransitions: rules,
        mcpRestricted: MCP_RESTRICTED_STATUSES,
      }, null, 2),
    }],
  };
}

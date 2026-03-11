/**
 * MCP tool definitions for sprint operations.
 *
 * In V2, sprints are cards with type='sprint', so operations delegate
 * to card operations with sprint-specific validation.
 *
 * @module mcp/tools/sprints
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';
import { getMcpUserId } from '../user.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const listSprintsSchema = z.object({
  projectId: z.string().describe('Project ID'),
  year: z.number().optional().describe('Filter by year'),
});

export const getSprintSchema = z.object({
  projectId: z.string().describe('Project ID'),
  cardId: z.string().describe('Sprint card ID (e.g., "PLN-SPR-0001")'),
});

export const createSprintSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('Sprint title'),
  startDate: z.string().optional().describe('Sprint start date (YYYY-MM-DD)'),
  endDate: z.string().optional().describe('Sprint end date (YYYY-MM-DD)'),
  year: z.number().optional().describe('Year (default: extracted from startDate or current year)'),
  goals: z.array(z.string()).optional().describe('Sprint goals'),
});

export const updateSprintSchema = z.object({
  projectId: z.string().describe('Project ID'),
  cardId: z.string().describe('Sprint card ID'),
  updates: z.record(z.unknown()).describe('Fields to update'),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * List sprints for a project.
 */
export async function listSprints({ projectId, year }) {
  const filters = { type: 'sprint' };
  if (year) filters.year = year;

  const sprints = await db.getCards(projectId, filters);

  if (sprints.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: `No sprints found in project "${projectId}".`, sprints: [] }, null, 2) }] };
  }

  const result = sprints.map((s) => ({
    cardId: s.cardId,
    title: s.title,
    status: s.status,
    startDate: s.startDate,
    endDate: s.endDate,
    year: s.year,
    locked: s.locked,
    goals: s.goals,
  }));

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/**
 * Get a single sprint by cardId.
 */
export async function getSprint({ projectId, cardId }) {
  const card = await db.getCard(projectId, cardId);

  if (!card) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Sprint "${cardId}" not found in project "${projectId}".` }, null, 2) }] };
  }

  if (card.type !== 'sprint') {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Card "${cardId}" is not a sprint (type: ${card.type}).` }, null, 2) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(card, null, 2) }] };
}

/**
 * Create a new sprint.
 */
export async function createSprint({ projectId, title, startDate, endDate, year, goals }) {
  const sprintYear = year || (startDate ? parseInt(startDate.split('-')[0], 10) : new Date().getFullYear());

  const cardData = {
    type: 'sprint',
    title,
    description: '',
    status: 'Planned',
    year: sprintYear,
    locked: false,
    createdBy: getMcpUserId(),
    updatedBy: getMcpUserId(),
  };

  if (startDate) cardData.startDate = startDate;
  if (endDate) cardData.endDate = endDate;
  if (goals) cardData.goals = goals;

  const cardId = await db.createCard(projectId, cardData);

  const response = {
    message: 'Sprint created successfully',
    cardId,
    projectId,
    title,
    year: sprintYear,
  };

  if (startDate) response.startDate = startDate;
  if (endDate) response.endDate = endDate;

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    response.durationDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  }

  return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
}

/**
 * Update a sprint.
 */
export async function updateSprint({ projectId, cardId, updates }) {
  const current = await db.getCard(projectId, cardId);
  if (!current) {
    throw new Error(`Sprint "${cardId}" not found in project "${projectId}".`);
  }

  if (current.type !== 'sprint') {
    throw new Error(`Card "${cardId}" is not a sprint (type: ${current.type}).`);
  }

  const protectedFields = ['cardId', 'type', 'createdAt', 'createdBy'];
  for (const field of protectedFields) {
    if (field in updates) {
      throw new Error(`Cannot update protected field: "${field}"`);
    }
  }

  // Check sprint date immutability when tasks are active
  if ('startDate' in updates || 'endDate' in updates) {
    const tasks = await db.getCards(projectId, { sprint: cardId });
    const activeStatuses = ['In Progress', 'To Validate'];
    const activeTasks = tasks.filter((t) => activeStatuses.includes(t.status));

    if (activeTasks.length > 0) {
      const taskList = activeTasks.map((t) => `${t.cardId} (${t.status})`).join(', ');
      throw new Error(
        `Cannot change sprint dates: sprint "${cardId}" has active tasks (${taskList}). ` +
        'Sprint dates are immutable while tasks are "In Progress" or "To Validate".'
      );
    }
  }

  const userId = getMcpUserId();
  await db.updateCard(projectId, cardId, updates, { uid: userId, name: userId });

  const updated = await db.getCard(projectId, cardId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'Sprint updated successfully', sprint: updated }, null, 2),
    }],
  };
}

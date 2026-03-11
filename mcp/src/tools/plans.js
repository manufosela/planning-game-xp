/**
 * MCP tool definitions for development plan operations.
 * @module mcp/tools/plans
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';
import { getMcpUserId } from '../user.js';

const VALID_PLAN_STATUSES = ['draft', 'accepted', 'rejected'];

export const listPlansSchema = z.object({
  projectId: z.string().describe('Project ID'),
  status: z.string().optional().describe('Filter by status: draft, accepted, rejected'),
});

export const getPlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  planId: z.string().describe('Plan document ID'),
});

export const createPlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('Plan title'),
  objective: z.string().optional().describe('Plan objective'),
  phases: z.array(z.object({
    title: z.string().describe('Phase title'),
    description: z.string().optional(),
    estimatedPoints: z.number().optional(),
    taskIds: z.array(z.string()).optional(),
  })).optional().describe('Plan phases'),
});

export const updatePlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  planId: z.string().describe('Plan document ID'),
  updates: z.record(z.unknown()).describe('Fields to update'),
});

export const deletePlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  planId: z.string().describe('Plan document ID'),
});

export async function listPlans({ projectId, status }) {
  const plans = await db.getPlans(projectId, status ? { status } : {});

  if (plans.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: `No plans found for project "${projectId}".`, plans: [] }, null, 2) }] };
  }

  const summary = plans.map((p) => ({
    planId: p.id,
    title: p.title,
    status: p.status,
    phases: (p.phases || []).length,
    createdAt: p.createdAt,
    createdBy: p.createdBy,
  }));

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function getPlan({ projectId, planId }) {
  const plan = await db.getPlan(projectId, planId);
  if (!plan) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Plan "${planId}" not found in project "${projectId}".` }, null, 2) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
}

export async function createPlan({ projectId, title, objective, phases }) {
  const userId = getMcpUserId();
  const planId = await db.createPlan(projectId, {
    title,
    objective: objective || '',
    status: 'draft',
    phases: phases || [],
    createdBy: userId,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'Plan created successfully', planId, title, status: 'draft' }, null, 2),
    }],
  };
}

export async function updatePlan({ projectId, planId, updates }) {
  const existing = await db.getPlan(projectId, planId);
  if (!existing) throw new Error(`Plan "${planId}" not found in project "${projectId}".`);

  if (updates.status && !VALID_PLAN_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status "${updates.status}". Valid: ${VALID_PLAN_STATUSES.join(', ')}`);
  }

  const protectedFields = ['createdAt', 'createdBy'];
  for (const field of protectedFields) {
    if (field in updates) delete updates[field];
  }

  await db.updatePlan(projectId, planId, updates);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: `Plan "${planId}" updated successfully`, updatedFields: Object.keys(updates) }, null, 2),
    }],
  };
}

export async function deletePlan({ projectId, planId }) {
  await db.deletePlan(projectId, planId);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: `Plan "${planId}" deleted (moved to trash)` }, null, 2),
    }],
  };
}

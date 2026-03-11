/**
 * MCP tool definitions for plan proposal operations.
 * @module mcp/tools/plan-proposals
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';
import { getMcpUserId } from '../user.js';

const VALID_STATUSES = ['pending', 'planned', 'rejected'];

export const listPlanProposalsSchema = z.object({
  projectId: z.string().describe('Project ID'),
  status: z.string().optional().describe('Filter by status: pending, planned, rejected'),
});

export const getPlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  proposalId: z.string().describe('Proposal document ID'),
});

export const createPlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('Proposal title'),
  description: z.string().optional().describe('Detailed description'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  sourceDocumentUrl: z.string().optional().describe('URL to source document'),
});

export const updatePlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  proposalId: z.string().describe('Proposal document ID'),
  updates: z.record(z.unknown()).describe('Fields to update'),
});

export const deletePlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  proposalId: z.string().describe('Proposal document ID'),
});

export async function listPlanProposals({ projectId, status }) {
  const proposals = await db.getPlanProposals(projectId, status ? { status } : {});

  if (proposals.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: `No plan proposals found for project "${projectId}".`, proposals: [] }, null, 2) }] };
  }

  const summary = proposals.map((p) => ({
    proposalId: p.id,
    title: p.title,
    status: p.status,
    tags: p.tags || [],
    planCount: (p.planIds || []).length,
    createdAt: p.createdAt,
  }));

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function getPlanProposal({ projectId, proposalId }) {
  const proposal = await db.getPlanProposal(projectId, proposalId);
  if (!proposal) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Plan proposal "${proposalId}" not found.` }, null, 2) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] };
}

export async function createPlanProposal({ projectId, title, description, tags, sourceDocumentUrl }) {
  const userId = getMcpUserId();
  const data = {
    title: title.trim().slice(0, 200),
    description: (description || '').trim().slice(0, 5000),
    tags: (tags || []).map((t) => t.trim().slice(0, 50)).filter((t) => t.length > 0),
    createdBy: userId,
  };

  if (sourceDocumentUrl) {
    data.sourceDocumentUrl = sourceDocumentUrl.trim().slice(0, 500);
  }

  const proposalId = await db.createPlanProposal(projectId, data);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'Plan proposal created successfully', proposalId, title: data.title, status: 'pending' }, null, 2),
    }],
  };
}

export async function updatePlanProposal({ projectId, proposalId, updates }) {
  const existing = await db.getPlanProposal(projectId, proposalId);
  if (!existing) throw new Error(`Plan proposal "${proposalId}" not found.`);

  if (updates.status && !VALID_STATUSES.includes(updates.status.toLowerCase())) {
    throw new Error(`Invalid status "${updates.status}". Valid: ${VALID_STATUSES.join(', ')}`);
  }

  const protectedFields = ['createdAt', 'createdBy'];
  for (const field of protectedFields) {
    if (field in updates) delete updates[field];
  }

  await db.updatePlanProposal(projectId, proposalId, updates);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: `Plan proposal "${proposalId}" updated successfully`, updatedFields: Object.keys(updates) }, null, 2),
    }],
  };
}

export async function deletePlanProposal({ projectId, proposalId }) {
  await db.deletePlanProposal(projectId, proposalId);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: `Plan proposal "${proposalId}" deleted (moved to trash)` }, null, 2),
    }],
  };
}

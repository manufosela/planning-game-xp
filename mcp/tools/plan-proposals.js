import { z } from 'zod';
import { getDatabase } from '../firebase-adapter.js';
import { getMcpUserId } from '../user.js';

const VALID_PROPOSAL_STATUSES = ['pending', 'planned', 'rejected'];

// ── Schemas ──

export const listPlanProposalsSchema = z.object({
  projectId: z.string().describe('Project ID (e.g., "PlanningGame", "Cinema4D")'),
  status: z.string().optional().describe('Filter by status: pending, planned, rejected')
});

export const getPlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  proposalId: z.string().describe('Proposal ID (the Firebase key)')
});

export const createPlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('Proposal title (max 200 chars)'),
  description: z.string().optional().describe('Detailed description of the feature request (max 5000 chars)'),
  tags: z.array(z.string()).optional().describe('Tags for categorization (e.g., ["backend", "auth"])'),
  sourceDocumentUrl: z.string().optional().describe('URL to source document (e.g., Google Docs, Notion)')
});

export const updatePlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  proposalId: z.string().describe('Proposal ID (the Firebase key)'),
  updates: z.record(z.unknown()).describe('Fields to update (title, description, status, tags, sourceDocumentUrl)')
});

export const deletePlanProposalSchema = z.object({
  projectId: z.string().describe('Project ID'),
  proposalId: z.string().describe('Proposal ID (the Firebase key)')
});

// ── Handlers ──

export async function listPlanProposals({ projectId, status }) {
  const db = getDatabase();
  const snapshot = await db.ref(`planProposals/${projectId}`).once('value');
  const data = snapshot.val();

  if (!data) {
    return { content: [{ type: 'text', text: `No plan proposals found for project "${projectId}".` }] };
  }

  let proposals = Object.entries(data).map(([proposalId, proposal]) => ({
    proposalId,
    ...proposal
  }));

  if (status) {
    const normalizedStatus = status.toLowerCase().trim();
    if (!VALID_PROPOSAL_STATUSES.includes(normalizedStatus)) {
      return { content: [{ type: 'text', text: `Invalid status "${status}". Valid values: ${VALID_PROPOSAL_STATUSES.join(', ')}` }] };
    }
    proposals = proposals.filter(p => p.status === normalizedStatus);
  }

  proposals.sort((a, b) => {
    const order = { pending: 0, planned: 1, rejected: 2 };
    const sa = order[a.status] ?? 99;
    const sb = order[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
  });

  const summary = proposals.map(p => ({
    proposalId: p.proposalId,
    title: p.title,
    status: p.status,
    planCount: (p.planIds || []).length,
    tags: p.tags || [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdBy: p.createdBy
  }));

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function getPlanProposal({ projectId, proposalId }) {
  const db = getDatabase();
  const snapshot = await db.ref(`planProposals/${projectId}/${proposalId}`).once('value');

  if (!snapshot.exists()) {
    return { content: [{ type: 'text', text: `Plan proposal "${proposalId}" not found in project "${projectId}".` }] };
  }

  const proposal = { proposalId, ...snapshot.val() };

  return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] };
}

/**
 * Create a PLAN proposal (free text) — restored in PLN-TSK-0359.
 *
 * NOT the same as a proposal CARD (create_card type=proposal): a plan
 * proposal is prose, usually written by the AI, and its outcome is a
 * development plan; a proposal card is a Como/Quiero/Para user story, so
 * people outside the team can propose one unit of work.
 */
export async function createPlanProposal({ projectId, title, description, tags, sourceDocumentUrl }) {
  if (!title || title.trim().length === 0) {
    throw new Error('title is required and must be a non-empty string');
  }

  const db = getDatabase();

  // Verify project exists
  const projectSnap = await db.ref(`projects/${projectId}`).once('value');
  if (!projectSnap.exists()) {
    throw new Error(`Project "${projectId}" not found`);
  }

  const now = new Date().toISOString();
  const createdBy = getMcpUserId();

  const proposalData = {
    title: title.trim().slice(0, 200),
    description: (description || '').trim().slice(0, 5000),
    status: 'pending',
    tags: (tags || []).map(t => t.trim().slice(0, 50)).filter(t => t.length > 0),
    planIds: [],
    createdAt: now,
    updatedAt: now,
    createdBy
  };

  if (sourceDocumentUrl) {
    proposalData.sourceDocumentUrl = sourceDocumentUrl.trim().slice(0, 500);
  }

  const newRef = db.ref(`planProposals/${projectId}`).push();
  await newRef.set(proposalData);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'Plan proposal created successfully',
        proposalId: newRef.key,
        title: proposalData.title,
        status: 'pending'
      }, null, 2)
    }]
  };
}

export async function updatePlanProposal({ projectId, proposalId, updates }) {
  const db = getDatabase();
  const proposalRef = db.ref(`planProposals/${projectId}/${proposalId}`);
  const snapshot = await proposalRef.once('value');

  if (!snapshot.exists()) {
    throw new Error(`Plan proposal "${proposalId}" not found in project "${projectId}"`);
  }

  // Validate status if being updated
  if (updates.status) {
    const normalizedStatus = updates.status.toLowerCase().trim();
    if (!VALID_PROPOSAL_STATUSES.includes(normalizedStatus)) {
      throw new Error(`Invalid status "${updates.status}". Valid values: ${VALID_PROPOSAL_STATUSES.join(', ')}`);
    }
    updates.status = normalizedStatus;
  }

  // Protect certain fields
  const protectedFields = ['createdAt', 'createdBy'];
  for (const field of protectedFields) {
    if (field in updates) {
      delete updates[field];
    }
  }

  // Truncate string fields
  if (updates.title) updates.title = updates.title.trim().slice(0, 200);
  if (updates.description) updates.description = updates.description.trim().slice(0, 5000);
  if (updates.sourceDocumentUrl) updates.sourceDocumentUrl = updates.sourceDocumentUrl.trim().slice(0, 500);

  // Validate tags if provided
  if (updates.tags && Array.isArray(updates.tags)) {
    updates.tags = updates.tags.map(t => String(t).trim().slice(0, 50)).filter(t => t.length > 0);
  }

  // Validate planIds if provided
  if (updates.planIds && Array.isArray(updates.planIds)) {
    updates.planIds = updates.planIds.filter(id => typeof id === 'string' && id.length > 0);
  }

  updates.updatedAt = new Date().toISOString();
  updates.updatedBy = getMcpUserId();

  await proposalRef.update(updates);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Plan proposal "${proposalId}" updated successfully`,
        proposalId,
        updatedFields: Object.keys(updates)
      }, null, 2)
    }]
  };
}

export async function deletePlanProposal({ projectId, proposalId }) {
  const db = getDatabase();
  const proposalRef = db.ref(`planProposals/${projectId}/${proposalId}`);
  const snapshot = await proposalRef.once('value');

  if (!snapshot.exists()) {
    throw new Error(`Plan proposal "${proposalId}" not found in project "${projectId}"`);
  }

  const proposal = snapshot.val();

  // Move to trash
  const trashRef = db.ref(`planProposals-trash/${projectId}/${proposalId}`);
  await trashRef.set({
    ...proposal,
    deletedAt: new Date().toISOString(),
    deletedBy: getMcpUserId()
  });

  await proposalRef.remove();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Plan proposal "${proposalId}" deleted (moved to trash)`,
        proposalId,
        title: proposal.title
      }, null, 2)
    }]
  };
}

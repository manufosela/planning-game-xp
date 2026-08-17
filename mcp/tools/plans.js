import { z } from 'zod';
import { getDatabase, getFirestore } from '../firebase-adapter.js';
import { getMcpUserId } from '../user.js';
import { getAbbrId, buildSectionPath } from '../../shared/utils.js';

const VALID_PLAN_STATUSES = ['draft', 'accepted', 'rejected'];

const PLAN_SECTION_ABBR = getAbbrId('PLANS'); // 'PLA'

/**
 * Resolve a planId (Firebase push key or human cardId like "PLN-PLA-0001")
 * to the actual path key under /plans/{projectId}.
 *
 * Returns the key string, or null when nothing matches. Plans that don't yet
 * have a cardId (pre-migration) only resolve when called with the push key.
 */
async function resolvePlanKey(db, projectId, planIdOrCardId) {
  if (!planIdOrCardId) return null;
  // Firebase push keys start with '-' — try as direct key first.
  if (planIdOrCardId.startsWith('-')) {
    const snap = await db.ref(`plans/${projectId}/${planIdOrCardId}`).once('value');
    if (snap.exists()) return planIdOrCardId;
    return null;
  }
  // Otherwise look up by stored cardId.
  const snapshot = await db.ref(`plans/${projectId}`).once('value');
  const data = snapshot.val();
  if (!data) return null;
  for (const [key, plan] of Object.entries(data)) {
    if (plan?.cardId === planIdOrCardId) return key;
  }
  return null;
}

// ── Schemas ──

export const listPlansSchema = z.object({
  projectId: z.string().describe('Project ID (e.g., "PlanningGame", "Cinema4D")'),
  status: z.string().optional().describe('Filter by status: draft, accepted, rejected')
});

export const getPlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  planId: z.string().describe('Plan ID — either the human cardId (e.g. "PLN-PLA-0001") or the Firebase push key')
});

export const createPlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('Plan title (max 150 chars)'),
  objective: z.string().optional().describe('Plan objective (max 500 chars)'),
  proposalId: z.string().optional().describe('DEPRECATED (legacy plan proposals, PLN-TSK-0357). Use proposalCardId instead.'),
  proposalCardId: z.string().optional().describe('Proposal CARD id (e.g. "KJR-PRP-0009") this plan originates from. Validates the card exists and marks it with convertedToPlan=<planCardId> for traceability.'),
  phases: z.array(z.object({
    name: z.string().describe('Phase name (max 150 chars)'),
    description: z.string().optional().describe('Phase description (max 500 chars)'),
    tasks: z.array(z.object({
      title: z.string().describe('Task title (max 150 chars)'),
      como: z.string().optional().describe('User role - "As a..."'),
      quiero: z.string().optional().describe('Goal - "I want..."'),
      para: z.string().optional().describe('Benefit - "So that..."')
    })).optional().describe('Tasks proposed for this phase')
  })).optional().describe('Plan phases with tasks')
});

export const updatePlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  planId: z.string().describe('Plan ID — either the human cardId (e.g. "PLN-PLA-0001") or the Firebase push key'),
  updates: z.record(z.unknown()).describe('Fields to update (title, objective, status, phases)')
});

export const deletePlanSchema = z.object({
  projectId: z.string().describe('Project ID'),
  planId: z.string().describe('Plan ID — either the human cardId (e.g. "PLN-PLA-0001") or the Firebase push key')
});

// ── Handlers ──

export async function listPlans({ projectId, status }) {
  const db = getDatabase();
  const snapshot = await db.ref(`plans/${projectId}`).once('value');
  const data = snapshot.val();

  if (!data) {
    return { content: [{ type: 'text', text: `No development plans found for project "${projectId}".` }] };
  }

  let plans = Object.entries(data).map(([planId, plan]) => ({
    planId,
    ...plan
  }));

  if (status) {
    const normalizedStatus = status.toLowerCase().trim();
    if (!VALID_PLAN_STATUSES.includes(normalizedStatus)) {
      return { content: [{ type: 'text', text: `Invalid status "${status}". Valid values: ${VALID_PLAN_STATUSES.join(', ')}` }] };
    }
    plans = plans.filter(p => p.status === normalizedStatus);
  }

  plans.sort((a, b) => {
    const order = { draft: 0, accepted: 1, rejected: 2 };
    const sa = order[a.status] ?? 99;
    const sb = order[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  const summary = plans.map(p => {
    const phaseCount = (p.phases || []).length;
    const taskCount = (p.phases || []).reduce((sum, ph) => sum + (ph.tasks || []).length, 0);
    const generatedCount = (p.generatedTasks || []).length;
    return {
      cardId: p.cardId || null,
      planId: p.planId,
      title: p.title,
      status: p.status,
      phases: phaseCount,
      proposedTasks: taskCount,
      generatedTasks: generatedCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      createdBy: p.createdBy
    };
  });

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function getPlan({ projectId, planId }) {
  const db = getDatabase();
  const resolvedKey = await resolvePlanKey(db, projectId, planId);

  if (!resolvedKey) {
    return { content: [{ type: 'text', text: `Plan "${planId}" not found in project "${projectId}".` }] };
  }

  const snapshot = await db.ref(`plans/${projectId}/${resolvedKey}`).once('value');
  const plan = { planId: resolvedKey, ...snapshot.val() };

  return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
}

export async function createPlan({ projectId, title, objective, proposalId, proposalCardId, phases }) {
  if (!title || title.trim().length === 0) {
    throw new Error('title is required and must be a non-empty string');
  }

  const db = getDatabase();

  // Verify project exists and grab abbreviation for cardId generation.
  const projectSnap = await db.ref(`projects/${projectId}`).once('value');
  if (!projectSnap.exists()) {
    throw new Error(`Project "${projectId}" not found`);
  }
  const projectAbbr = await db.ref(`projects/${projectId}/abbreviation`).once('value').then(s => s.val());
  if (!projectAbbr) {
    throw new Error(`Project "${projectId}" has no abbreviation configured.`);
  }

  const now = new Date().toISOString();
  const createdBy = getMcpUserId();

  // Validate proposalId if provided (legacy plan proposals — deprecated,
  // kept for backwards compatibility until /planProposals is fully retired)
  if (proposalId) {
    const proposalSnap = await db.ref(`planProposals/${projectId}/${proposalId}`).once('value');
    if (!proposalSnap.exists()) {
      throw new Error(`Plan proposal "${proposalId}" not found in project "${projectId}"`);
    }
  }

  // Validate proposalCardId if provided (the unified flow, PLN-TSK-0357):
  // plans originate from a proposal CARD of the Proposals tab.
  let proposalCardRef = null;
  if (proposalCardId) {
    const proposalsPath = buildSectionPath(projectId, 'proposal');
    const proposalsSnap = await db.ref(proposalsPath).once('value');
    const proposalsData = proposalsSnap.val() || {};
    const entry = Object.entries(proposalsData).find(([, c]) => c && c.cardId === proposalCardId);
    if (!entry) {
      throw new Error(
        `Proposal card "${proposalCardId}" not found in project "${projectId}". ` +
        `Use list_cards type=proposal to see available proposals.`
      );
    }
    proposalCardRef = db.ref(`${proposalsPath}/${entry[0]}`);
  }

  // Generate human-readable cardId (e.g. "PLN-PLA-0001") via Firestore counter,
  // same pattern as cards.js — atomic across concurrent writers.
  const firestore = getFirestore();
  const counterKey = `${projectAbbr}-${PLAN_SECTION_ABBR}`;
  const counterRef = firestore.collection('projectCounters').doc(counterKey);
  const cardId = await firestore.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(counterRef);
    const lastId = docSnap.exists ? (docSnap.data().lastId || 0) : 0;
    const newId = lastId + 1;
    transaction.set(counterRef, { lastId: newId }, { merge: true });
    return `${counterKey}-${String(newId).padStart(4, '0')}`;
  });

  const planData = {
    cardId,
    title: title.trim().slice(0, 150),
    objective: (objective || '').trim().slice(0, 500),
    status: 'draft',
    phases: (phases || []).map(p => ({
      name: (p.name || '').trim().slice(0, 150),
      description: (p.description || '').trim().slice(0, 500),
      tasks: (p.tasks || []).map(t => ({
        title: (t.title || '').trim().slice(0, 150),
        como: (t.como || '').trim().slice(0, 300),
        quiero: (t.quiero || '').trim().slice(0, 500),
        para: (t.para || '').trim().slice(0, 300)
      })),
      epicIds: [],
      taskIds: [],
      status: 'pending'
    })),
    createdAt: now,
    updatedAt: now,
    createdBy
  };

  if (proposalId) {
    planData.proposalId = proposalId;
  }
  if (proposalCardId) {
    planData.proposalCardId = proposalCardId;
  }

  const newRef = db.ref(`plans/${projectId}`).push();
  await newRef.set(planData);

  // Mark the source proposal card as converted to this plan (traceability,
  // mirrors the proposal→task conversion pattern). PLN-TSK-0357.
  if (proposalCardRef) {
    await proposalCardRef.update({
      convertedToPlan: cardId,
      updatedAt: now,
      updatedBy: createdBy
    });
  }

  // Auto-add planId to proposal's planIds array
  if (proposalId) {
    const proposalRef = db.ref(`planProposals/${projectId}/${proposalId}`);
    const proposalSnap = await proposalRef.once('value');
    const proposal = proposalSnap.val();
    const currentPlanIds = proposal.planIds || [];
    if (!currentPlanIds.includes(newRef.key)) {
      await proposalRef.update({
        planIds: [...currentPlanIds, newRef.key],
        updatedAt: now,
        updatedBy: createdBy
      });
    }
  }

  const totalTasks = planData.phases.reduce((sum, p) => sum + p.tasks.length, 0);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Plan created successfully`,
        cardId,
        planId: newRef.key,
        title: planData.title,
        status: 'draft',
        phases: planData.phases.length,
        totalTasks,
        proposalId: proposalId || null,
        proposalCardId: proposalCardId || null
      }, null, 2)
    }]
  };
}

export async function updatePlan({ projectId, planId, updates }) {
  const db = getDatabase();
  const resolvedKey = await resolvePlanKey(db, projectId, planId);
  if (!resolvedKey) {
    throw new Error(`Plan "${planId}" not found in project "${projectId}"`);
  }
  const planRef = db.ref(`plans/${projectId}/${resolvedKey}`);
  const snapshot = await planRef.once('value');

  const existing = snapshot.val();

  // Validate status if being updated
  if (updates.status) {
    const normalizedStatus = updates.status.toLowerCase().trim();
    if (!VALID_PLAN_STATUSES.includes(normalizedStatus)) {
      throw new Error(`Invalid status "${updates.status}". Valid values: ${VALID_PLAN_STATUSES.join(', ')}`);
    }
    updates.status = normalizedStatus;
  }

  // Protect certain fields — including cardId, which is immutable once assigned.
  const protectedFields = ['createdAt', 'createdBy', 'generatedTasks', 'cardId'];
  for (const field of protectedFields) {
    if (field in updates) {
      delete updates[field];
    }
  }

  // Truncate string fields
  if (updates.title) updates.title = updates.title.trim().slice(0, 150);
  if (updates.objective) updates.objective = updates.objective.trim().slice(0, 500);

  // Validate phases if provided
  if (updates.phases && Array.isArray(updates.phases)) {
    updates.phases = updates.phases.map(p => ({
      name: (p.name || '').trim().slice(0, 150),
      description: (p.description || '').trim().slice(0, 500),
      tasks: (p.tasks || []).map(t => ({
        title: (t.title || '').trim().slice(0, 150),
        como: (t.como || '').trim().slice(0, 300),
        quiero: (t.quiero || '').trim().slice(0, 500),
        para: (t.para || '').trim().slice(0, 300)
      })),
      epicIds: p.epicIds || [],
      taskIds: p.taskIds || [],
      status: p.status || 'pending'
    }));
  }

  updates.updatedAt = new Date().toISOString();
  updates.updatedBy = getMcpUserId();

  await planRef.update(updates);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Plan "${existing.cardId || resolvedKey}" updated successfully`,
        cardId: existing.cardId || null,
        planId: resolvedKey,
        updatedFields: Object.keys(updates)
      }, null, 2)
    }]
  };
}

export async function deletePlan({ projectId, planId }) {
  const db = getDatabase();
  const resolvedKey = await resolvePlanKey(db, projectId, planId);
  if (!resolvedKey) {
    throw new Error(`Plan "${planId}" not found in project "${projectId}"`);
  }
  const planRef = db.ref(`plans/${projectId}/${resolvedKey}`);
  const snapshot = await planRef.once('value');
  const plan = snapshot.val();

  // Move to trash
  const trashRef = db.ref(`plans-trash/${projectId}/${resolvedKey}`);
  await trashRef.set({
    ...plan,
    deletedAt: new Date().toISOString(),
    deletedBy: getMcpUserId()
  });

  await planRef.remove();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Plan "${plan.cardId || resolvedKey}" deleted (moved to trash)`,
        cardId: plan.cardId || null,
        planId: resolvedKey,
        title: plan.title
      }, null, 2)
    }]
  };
}

/**
 * Firestore operations for MCP server (Admin SDK).
 *
 * Mirrors the client-side src/lib/firestore.js but uses firebase-admin.
 * All CRUD operations for projects, cards, team, sprints, plans, ADRs,
 * global config, and users.
 *
 * @module mcp/services/firestore-service
 */

import { getFirestore } from '../firebase-adapter.js';
import { FieldValue } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
const TYPE_PREFIX = {
  task: 'TSK',
  bug: 'BUG',
  epic: 'EPC',
  sprint: 'SPR',
  proposal: 'PRP',
  qa: 'QAI',
};

/**
 * Pad a number to 4 digits.
 * @param {number} n
 * @returns {string}
 */
function pad4(n) {
  return String(n).padStart(4, '0');
}

/**
 * Convert Firestore Timestamp to ISO string for JSON output.
 * @param {*} val
 * @returns {*}
 */
function serializeTimestamp(val) {
  if (val && typeof val === 'object' && typeof val.toDate === 'function') {
    return val.toDate().toISOString();
  }
  return val;
}

/**
 * Recursively serialize Timestamp fields in an object.
 * @param {Record<string, *>} obj
 * @returns {Record<string, *>}
 */
export function serializeDoc(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(serializeDoc);

  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && typeof val.toDate === 'function') {
      result[key] = val.toDate().toISOString();
    } else if (Array.isArray(val)) {
      result[key] = val.map(serializeDoc);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = serializeDoc(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * List all projects.
 * @param {{ includeArchived?: boolean }} [options]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getProjects(options = {}) {
  const db = getFirestore();
  const ref = db.collection('projects');
  const q = ref.orderBy('sortOrder', 'asc');
  const snap = await q.get();

  let docs = snap.docs.map((d) => ({ id: d.id, ...serializeDoc(d.data()) }));

  if (!options.includeArchived) {
    docs = docs.filter((d) => !d.archived);
  }

  return docs;
}

/**
 * Get a single project by ID.
 * @param {string} id
 * @returns {Promise<Record<string, *> | null>}
 */
export async function getProject(id) {
  const db = getFirestore();
  const snap = await db.collection('projects').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...serializeDoc(snap.data()) };
}

/**
 * Create a new project.
 * @param {string} projectId
 * @param {Record<string, *>} data
 * @returns {Promise<string>}
 */
export async function createProject(projectId, data) {
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();

  await db.collection('projects').doc(projectId).set({
    ...data,
    archived: data.archived ?? false,
    sortOrder: data.sortOrder ?? 0,
    developerCount: 0,
    stakeholderCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Initialize counters
  await db.collection('counters').doc(projectId).set({
    task: 0,
    bug: 0,
    epic: 0,
    sprint: 0,
    proposal: 0,
    qa: 0,
  });

  return projectId;
}

/**
 * Update a project.
 * @param {string} id
 * @param {Record<string, *>} data
 * @returns {Promise<void>}
 */
export async function updateProject(id, data) {
  const db = getFirestore();
  await db.collection('projects').doc(id).update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Find a project by repository URL (fuzzy).
 * @param {string} repoUrl
 * @returns {Promise<Record<string, *> | null>}
 */
export async function discoverProjectByRepo(repoUrl) {
  const projects = await getProjects({ includeArchived: false });
  const normalized = repoUrl.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();

  for (const project of projects) {
    if (project.repoUrl) {
      const projNorm = project.repoUrl.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
      if (projNorm === normalized) {
        return project;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * List cards for a project with optional filters.
 * @param {string} projectId
 * @param {{ type?: string; status?: string; year?: number; sprint?: string; epic?: string; developerId?: string }} [filters]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getCards(projectId, filters = {}) {
  const db = getFirestore();
  let ref = db.collection('projects').doc(projectId).collection('cards');

  /** @type {import('firebase-admin/firestore').Query} */
  let q = ref;

  if (filters.type) {
    q = q.where('type', '==', filters.type);
  }
  if (filters.status) {
    q = q.where('status', '==', filters.status);
  }
  if (filters.year) {
    q = q.where('year', '==', filters.year);
  }
  if (filters.sprint) {
    q = q.where('sprint', '==', filters.sprint);
  }
  if (filters.epic) {
    q = q.where('epic', '==', filters.epic);
  }
  if (filters.developerId) {
    q = q.where('developer.id', '==', filters.developerId);
  }

  const snap = await q.get();
  return snap.docs.map((d) => serializeDoc(d.data()));
}

/**
 * Get a single card.
 * @param {string} projectId
 * @param {string} cardId
 * @returns {Promise<Record<string, *> | null>}
 */
export async function getCard(projectId, cardId) {
  const db = getFirestore();
  const snap = await db
    .collection('projects')
    .doc(projectId)
    .collection('cards')
    .doc(cardId)
    .get();

  if (!snap.exists) return null;
  return serializeDoc(snap.data());
}

/**
 * Generate a card ID using atomic counter increment.
 * @param {string} projectId
 * @param {string} type
 * @param {string} abbreviation
 * @returns {Promise<string>}
 */
export async function generateCardId(projectId, type, abbreviation) {
  const db = getFirestore();
  const counterRef = db.collection('counters').doc(projectId);
  const prefix = TYPE_PREFIX[type];

  if (!prefix) {
    throw new Error(`Unknown card type: ${type}`);
  }

  const newNumber = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    if (!counterSnap.exists) {
      throw new Error(`Counter document for project ${projectId} not found`);
    }
    const current = counterSnap.data()[type] ?? 0;
    const next = current + 1;
    tx.update(counterRef, { [type]: next });
    return next;
  });

  return `${abbreviation}-${prefix}-${pad4(newNumber)}`;
}

/**
 * Create a card with auto-generated ID.
 * @param {string} projectId
 * @param {Record<string, *>} data
 * @returns {Promise<string>} The generated cardId
 */
export async function createCard(projectId, data) {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const cardId = await generateCardId(projectId, data.type, project.abbreviation);
  const now = FieldValue.serverTimestamp();

  const cardData = {
    ...data,
    cardId,
    createdAt: now,
    updatedAt: now,
  };

  const db = getFirestore();
  await db
    .collection('projects')
    .doc(projectId)
    .collection('cards')
    .doc(cardId)
    .set(cardData);

  return cardId;
}

/**
 * Update a card.
 * @param {string} projectId
 * @param {string} cardId
 * @param {Record<string, *>} data
 * @param {{ uid: string; name: string }} changedBy
 * @returns {Promise<void>}
 */
export async function updateCard(projectId, cardId, data, changedBy) {
  const db = getFirestore();
  const ref = db
    .collection('projects')
    .doc(projectId)
    .collection('cards')
    .doc(cardId);

  const current = await ref.get();
  if (!current.exists) {
    throw new Error(`Card ${cardId} not found in project ${projectId}`);
  }

  const currentData = current.data();

  // Compute diff for history
  /** @type {Record<string, { from: *, to: * }>} */
  const changes = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'updatedAt' || key === 'updatedBy') continue;
    const oldVal = currentData[key];
    const serializedOld = serializeTimestamp(oldVal);
    const serializedNew = serializeTimestamp(value);
    if (JSON.stringify(serializedOld) !== JSON.stringify(serializedNew)) {
      changes[key] = { from: serializedOld, to: serializedNew };
    }
  }

  await ref.update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: changedBy.uid,
  });

  // Write history if there are changes
  if (Object.keys(changes).length > 0) {
    await writeHistory(projectId, cardId, changedBy, changes);
  }
}

/**
 * Write a history entry for a card.
 * @param {string} projectId
 * @param {string} cardId
 * @param {{ uid: string; name: string }} changedBy
 * @param {Record<string, { from: *, to: * }>} changes
 * @returns {Promise<void>}
 */
export async function writeHistory(projectId, cardId, changedBy, changes) {
  const db = getFirestore();
  await db
    .collection('projects')
    .doc(projectId)
    .collection('cards')
    .doc(cardId)
    .collection('history')
    .add({
      timestamp: FieldValue.serverTimestamp(),
      changedBy: changedBy.uid,
      changedByName: changedBy.name,
      changes,
    });
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

/**
 * List team members for a project.
 * @param {string} projectId
 * @param {{ role?: string }} [filters]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getTeam(projectId, filters = {}) {
  const db = getFirestore();
  let q = db.collection('projects').doc(projectId).collection('team');

  if (filters.role) {
    // 'both' includes members with role 'developer', 'stakeholder', or 'both'
    // For filtering, we match exact role or 'both'
    q = q.where('role', 'in', [filters.role, 'both']);
  }

  const snap = await q.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...serializeDoc(d.data()) }))
    .filter((m) => m.active !== false);
}

/**
 * Add a team member to a project.
 * @param {string} projectId
 * @param {Record<string, *>} member
 * @returns {Promise<string>}
 */
export async function addTeamMember(projectId, member) {
  const db = getFirestore();
  const ref = db.collection('projects').doc(projectId).collection('team');
  const docRef = await ref.add({
    ...member,
    active: member.active ?? true,
    joinedAt: FieldValue.serverTimestamp(),
  });

  // Update denormalized counts
  const countField = member.role === 'stakeholder' ? 'stakeholderCount' : 'developerCount';
  await db.collection('projects').doc(projectId).update({
    [countField]: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Remove a team member from a project.
 * @param {string} projectId
 * @param {string} memberId
 * @returns {Promise<void>}
 */
export async function removeTeamMember(projectId, memberId) {
  const db = getFirestore();
  const memberRef = db.collection('projects').doc(projectId).collection('team').doc(memberId);
  const snap = await memberRef.get();

  if (!snap.exists) {
    throw new Error(`Team member ${memberId} not found in project ${projectId}`);
  }

  const memberData = snap.data();
  await memberRef.delete();

  const countField = memberData.role === 'stakeholder' ? 'stakeholderCount' : 'developerCount';
  await db.collection('projects').doc(projectId).update({
    [countField]: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Sprints (convenience — sprints are cards with type='sprint')
// ---------------------------------------------------------------------------

/**
 * Get sprints for a project.
 * @param {string} projectId
 * @param {{ year?: number }} [filters]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getSprints(projectId, filters = {}) {
  return getCards(projectId, { type: 'sprint', ...filters });
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/**
 * List plans for a project.
 * @param {string} projectId
 * @param {{ status?: string }} [filters]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getPlans(projectId, filters = {}) {
  const db = getFirestore();
  let q = db.collection('projects').doc(projectId).collection('plans').orderBy('createdAt', 'desc');

  if (filters.status) {
    q = db.collection('projects').doc(projectId).collection('plans')
      .where('status', '==', filters.status)
      .orderBy('createdAt', 'desc');
  }

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...serializeDoc(d.data()) }));
}

/**
 * Get a single plan.
 * @param {string} projectId
 * @param {string} planId
 * @returns {Promise<Record<string, *> | null>}
 */
export async function getPlan(projectId, planId) {
  const db = getFirestore();
  const snap = await db.collection('projects').doc(projectId).collection('plans').doc(planId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...serializeDoc(snap.data()) };
}

/**
 * Create a plan.
 * @param {string} projectId
 * @param {Record<string, *>} data
 * @returns {Promise<string>}
 */
export async function createPlan(projectId, data) {
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection('projects').doc(projectId).collection('plans').add({
    ...data,
    projectId,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/**
 * Update a plan.
 * @param {string} projectId
 * @param {string} planId
 * @param {Record<string, *>} data
 * @returns {Promise<void>}
 */
export async function updatePlan(projectId, planId, data) {
  const db = getFirestore();
  await db.collection('projects').doc(projectId).collection('plans').doc(planId).update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Delete a plan (move to trash subcollection).
 * @param {string} projectId
 * @param {string} planId
 * @returns {Promise<void>}
 */
export async function deletePlan(projectId, planId) {
  const db = getFirestore();
  const planRef = db.collection('projects').doc(projectId).collection('plans').doc(planId);
  const snap = await planRef.get();
  if (!snap.exists) throw new Error(`Plan ${planId} not found`);

  await db.collection('projects').doc(projectId).collection('plans-trash').doc(planId).set({
    ...snap.data(),
    deletedAt: FieldValue.serverTimestamp(),
  });

  await planRef.delete();
}

// ---------------------------------------------------------------------------
// Plan Proposals (stored as cards with type='proposal' in V2)
// In V2, plan proposals are a separate subcollection for richer data
// ---------------------------------------------------------------------------

/**
 * List plan proposals for a project.
 * @param {string} projectId
 * @param {{ status?: string }} [filters]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getPlanProposals(projectId, filters = {}) {
  const db = getFirestore();
  let q = db.collection('projects').doc(projectId).collection('planProposals')
    .orderBy('createdAt', 'desc');

  if (filters.status) {
    q = db.collection('projects').doc(projectId).collection('planProposals')
      .where('status', '==', filters.status)
      .orderBy('createdAt', 'desc');
  }

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...serializeDoc(d.data()) }));
}

/**
 * Get a single plan proposal.
 * @param {string} projectId
 * @param {string} proposalId
 * @returns {Promise<Record<string, *> | null>}
 */
export async function getPlanProposal(projectId, proposalId) {
  const db = getFirestore();
  const snap = await db.collection('projects').doc(projectId)
    .collection('planProposals').doc(proposalId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...serializeDoc(snap.data()) };
}

/**
 * Create a plan proposal.
 * @param {string} projectId
 * @param {Record<string, *>} data
 * @returns {Promise<string>}
 */
export async function createPlanProposal(projectId, data) {
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection('projects').doc(projectId)
    .collection('planProposals').add({
      ...data,
      status: data.status || 'pending',
      planIds: data.planIds || [],
      createdAt: now,
      updatedAt: now,
    });
  return ref.id;
}

/**
 * Update a plan proposal.
 * @param {string} projectId
 * @param {string} proposalId
 * @param {Record<string, *>} data
 * @returns {Promise<void>}
 */
export async function updatePlanProposal(projectId, proposalId, data) {
  const db = getFirestore();
  await db.collection('projects').doc(projectId)
    .collection('planProposals').doc(proposalId).update({
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Delete a plan proposal.
 * @param {string} projectId
 * @param {string} proposalId
 * @returns {Promise<void>}
 */
export async function deletePlanProposal(projectId, proposalId) {
  const db = getFirestore();
  const ref = db.collection('projects').doc(projectId)
    .collection('planProposals').doc(proposalId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Plan proposal ${proposalId} not found`);

  await db.collection('projects').doc(projectId)
    .collection('planProposals-trash').doc(proposalId).set({
      ...snap.data(),
      deletedAt: FieldValue.serverTimestamp(),
    });

  await ref.delete();
}

// ---------------------------------------------------------------------------
// ADRs (Architecture Decision Records)
// ---------------------------------------------------------------------------

/**
 * List ADRs for a project.
 * @param {string} projectId
 * @param {{ status?: string }} [filters]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getAdrs(projectId, filters = {}) {
  const db = getFirestore();
  let q = db.collection('projects').doc(projectId).collection('adrs')
    .orderBy('createdAt', 'desc');

  if (filters.status) {
    q = db.collection('projects').doc(projectId).collection('adrs')
      .where('status', '==', filters.status)
      .orderBy('createdAt', 'desc');
  }

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...serializeDoc(d.data()) }));
}

/**
 * Get a single ADR.
 * @param {string} projectId
 * @param {string} adrId
 * @returns {Promise<Record<string, *> | null>}
 */
export async function getAdr(projectId, adrId) {
  const db = getFirestore();
  const snap = await db.collection('projects').doc(projectId)
    .collection('adrs').doc(adrId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...serializeDoc(snap.data()) };
}

/**
 * Create an ADR.
 * @param {string} projectId
 * @param {Record<string, *>} data
 * @returns {Promise<string>}
 */
export async function createAdr(projectId, data) {
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection('projects').doc(projectId).collection('adrs').add({
    ...data,
    projectId,
    status: data.status || 'proposed',
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/**
 * Update an ADR.
 * @param {string} projectId
 * @param {string} adrId
 * @param {Record<string, *>} data
 * @returns {Promise<void>}
 */
export async function updateAdr(projectId, adrId, data) {
  const db = getFirestore();
  await db.collection('projects').doc(projectId).collection('adrs').doc(adrId).update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Delete an ADR (move to trash).
 * @param {string} projectId
 * @param {string} adrId
 * @returns {Promise<void>}
 */
export async function deleteAdr(projectId, adrId) {
  const db = getFirestore();
  const ref = db.collection('projects').doc(projectId).collection('adrs').doc(adrId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`ADR ${adrId} not found`);

  await db.collection('projects').doc(projectId).collection('adrs-trash').doc(adrId).set({
    ...snap.data(),
    deletedAt: FieldValue.serverTimestamp(),
  });

  await ref.delete();
}

// ---------------------------------------------------------------------------
// Global Configuration
// ---------------------------------------------------------------------------

/**
 * List global configs.
 * @param {{ type?: string }} [filters]
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getGlobalConfigs(filters = {}) {
  const db = getFirestore();
  let q = db.collection('globalConfig');

  if (filters.type) {
    q = q.where('type', '==', filters.type);
  }

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...serializeDoc(d.data()) }));
}

/**
 * Get a single global config.
 * @param {string} configId
 * @returns {Promise<Record<string, *> | null>}
 */
export async function getGlobalConfig(configId) {
  const db = getFirestore();
  const snap = await db.collection('globalConfig').doc(configId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...serializeDoc(snap.data()) };
}

/**
 * Create a global config.
 * @param {Record<string, *>} data
 * @returns {Promise<string>}
 */
export async function createGlobalConfig(data) {
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection('globalConfig').add({
    ...data,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/**
 * Update a global config. For guidelines, auto-increments version.
 * @param {string} configId
 * @param {Record<string, *>} data
 * @param {{ uid: string; name: string }} changedBy
 * @returns {Promise<void>}
 */
export async function updateGlobalConfig(configId, data, changedBy) {
  const db = getFirestore();
  const configRef = db.collection('globalConfig').doc(configId);
  const current = await configRef.get();

  if (!current.exists) {
    throw new Error(`Config ${configId} not found`);
  }

  const currentData = current.data();
  const isGuideline = currentData.type === 'guideline';
  const newVersion = isGuideline ? (currentData.version ?? 0) + 1 : currentData.version;

  // Save version history if content changed
  if (isGuideline && data.content && data.content !== currentData.content) {
    await configRef.collection('versions').add({
      version: currentData.version ?? 1,
      content: currentData.content,
      updatedAt: currentData.updatedAt,
      updatedBy: changedBy.uid,
    });
  }

  await configRef.update({
    ...data,
    version: newVersion,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Delete a global config.
 * @param {string} configId
 * @returns {Promise<void>}
 */
export async function deleteGlobalConfig(configId) {
  const db = getFirestore();
  const ref = db.collection('globalConfig').doc(configId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Config ${configId} not found`);

  await db.collection('globalConfig-trash').doc(configId).set({
    ...snap.data(),
    deletedAt: FieldValue.serverTimestamp(),
  });

  await ref.delete();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * List all users.
 * @returns {Promise<Array<Record<string, *>>>}
 */
export async function getUsers() {
  const db = getFirestore();
  const snap = await db.collection('users').get();
  return snap.docs.map((d) => ({ id: d.id, ...serializeDoc(d.data()) }));
}

/**
 * Provision a new user.
 * @param {Record<string, *>} data
 * @returns {Promise<string>}
 */
export async function provisionUser(data) {
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection('users').add({
    name: data.name,
    email: data.email,
    role: data.role || 'user',
    projects: data.projects || {},
    preferences: data.preferences || { theme: 'system', defaultYear: new Date().getFullYear(), locale: 'en' },
    createdAt: now,
    lastLoginAt: now,
  });
  return ref.id;
}

/**
 * Delete a user.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function deleteUser(userId) {
  const db = getFirestore();
  await db.collection('users').doc(userId).delete();
}

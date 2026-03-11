/**
 * Firestore CRUD operations for projects, cards, team, and tags.
 *
 * All functions operate on the Firestore instance from firebase.js.
 * Uses atomic transactions for counter increments.
 *
 * @module lib/firestore
 */

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { getDb, projectsRef, cardsRef, teamRef } from './firebase.js';

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
 * Pads a number to 4 digits.
 * @param {number} n
 * @returns {string}
 */
function pad4(n) {
  return String(n).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * List all projects (non-archived first, ordered by sortOrder).
 * @returns {Promise<Array<import('./types.d.ts').Project & { id: string }>>}
 */
export async function getProjects() {
  const q = query(projectsRef(), orderBy('sortOrder', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get a single project by ID.
 * @param {string} id
 * @returns {Promise<(import('./types.d.ts').Project & { id: string }) | null>}
 */
export async function getProject(id) {
  const snap = await getDoc(doc(projectsRef(), id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Create a new project.
 * @param {Omit<import('./types.d.ts').Project, 'createdAt' | 'updatedAt' | 'developerCount' | 'stakeholderCount' | 'sortOrder'>} data
 * @returns {Promise<string>} The project document ID.
 */
export async function createProject(data) {
  const db = getDb();
  const projRef = doc(collection(db, 'projects'));
  const now = serverTimestamp();

  await setDoc(projRef, {
    ...data,
    archived: data.archived ?? false,
    sortOrder: data.sortOrder ?? 0,
    developerCount: 0,
    stakeholderCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Initialize counters document
  const counterRef = doc(db, 'counters', projRef.id);
  await setDoc(counterRef, {
    task: 0,
    bug: 0,
    epic: 0,
    sprint: 0,
    proposal: 0,
    qa: 0,
  });

  return projRef.id;
}

/**
 * Update a project.
 * @param {string} id
 * @param {Partial<import('./types.d.ts').Project>} data
 * @returns {Promise<void>}
 */
export async function updateProject(id, data) {
  const ref = doc(projectsRef(), id);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-archive a project (sets archived=true).
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function archiveProject(id) {
  await updateProject(id, { archived: true });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * List cards for a project, with optional filters.
 * @param {string} projectId
 * @param {{ type?: string; status?: string; year?: number; sprint?: string; epic?: string; developerId?: string }} [filters]
 * @returns {Promise<Array<import('./types.d.ts').Card>>}
 */
export async function getCards(projectId, filters = {}) {
  const constraints = [];

  if (filters.type) {
    constraints.push(where('type', '==', filters.type));
  }
  if (filters.status) {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters.year) {
    constraints.push(where('year', '==', filters.year));
  }
  if (filters.sprint) {
    constraints.push(where('sprint', '==', filters.sprint));
  }
  if (filters.epic) {
    constraints.push(where('epic', '==', filters.epic));
  }
  if (filters.developerId) {
    constraints.push(where('developer.id', '==', filters.developerId));
  }

  const ref = cardsRef(projectId);
  const q = constraints.length > 0
    ? query(ref, ...constraints)
    : query(ref);

  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

/**
 * Get a single card.
 * @param {string} projectId
 * @param {string} cardId
 * @returns {Promise<import('./types.d.ts').Card | null>}
 */
export async function getCard(projectId, cardId) {
  const ref = doc(cardsRef(projectId), cardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Create a card with auto-generated ID from atomic counter.
 * @param {string} projectId
 * @param {Omit<import('./types.d.ts').Card, 'cardId' | 'createdAt' | 'updatedAt'>} data
 * @returns {Promise<string>} The generated cardId (e.g., "PLN-TSK-0042").
 */
export async function createCard(projectId, data) {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const cardId = await generateCardId(projectId, data.type, project.abbreviation);
  const now = serverTimestamp();

  const cardData = {
    ...data,
    cardId,
    createdAt: now,
    updatedAt: now,
  };

  const ref = doc(cardsRef(projectId), cardId);
  await setDoc(ref, cardData);

  return cardId;
}

/**
 * Update a card and write history entry.
 * @param {string} projectId
 * @param {string} cardId
 * @param {Partial<import('./types.d.ts').Card>} data
 * @param {{ uid: string; name: string }} changedBy
 * @returns {Promise<void>}
 */
export async function updateCard(projectId, cardId, data, changedBy) {
  const ref = doc(cardsRef(projectId), cardId);
  const current = await getDoc(ref);

  if (!current.exists()) {
    throw new Error(`Card ${cardId} not found in project ${projectId}`);
  }

  const currentData = current.data();

  // Compute diff for history
  /** @type {Record<string, { from: unknown; to: unknown }>} */
  const changes = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'updatedAt' || key === 'updatedBy') continue;
    const oldVal = currentData[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(value)) {
      changes[key] = { from: oldVal, to: value };
    }
  }

  // Update the card
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: changedBy.uid,
  });

  // Write history if there are changes
  if (Object.keys(changes).length > 0) {
    await writeHistory(projectId, cardId, changedBy, changes);
  }
}

/**
 * Soft-delete a card by moving it to a trash subcollection.
 * @param {string} projectId
 * @param {string} cardId
 * @returns {Promise<void>}
 */
export async function deleteCard(projectId, cardId) {
  const db = getDb();
  const cardRef = doc(db, 'projects', projectId, 'cards', cardId);
  const snap = await getDoc(cardRef);

  if (!snap.exists()) {
    throw new Error(`Card ${cardId} not found in project ${projectId}`);
  }

  // Move to trash
  const trashRef = doc(db, 'projects', projectId, 'trash', cardId);
  await setDoc(trashRef, {
    ...snap.data(),
    deletedAt: serverTimestamp(),
  });

  await deleteDoc(cardRef);
}

// ---------------------------------------------------------------------------
// Card ID generation (atomic counter)
// ---------------------------------------------------------------------------

/**
 * Generate a card ID using atomic counter increment.
 * Uses a Firestore transaction to ensure uniqueness.
 * @param {string} projectId
 * @param {string} type - Card type (task, bug, etc.)
 * @param {string} [abbreviation] - Project abbreviation. If not provided, fetched from project.
 * @returns {Promise<string>} Generated cardId, e.g., "PLN-TSK-0042"
 */
export async function generateCardId(projectId, type, abbreviation) {
  const db = getDb();
  const counterRef = doc(db, 'counters', projectId);
  const prefix = TYPE_PREFIX[type];

  if (!prefix) {
    throw new Error(`Unknown card type: ${type}`);
  }

  let abbr = abbreviation;
  if (!abbr) {
    const project = await getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    abbr = project.abbreviation;
  }

  const newNumber = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    if (!counterSnap.exists()) {
      throw new Error(`Counter document for project ${projectId} not found`);
    }
    const current = counterSnap.data()[type] ?? 0;
    const next = current + 1;
    tx.update(counterRef, { [type]: next });
    return next;
  });

  return `${abbr}-${prefix}-${pad4(newNumber)}`;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * Write a history entry for a card.
 * @param {string} projectId
 * @param {string} cardId
 * @param {{ uid: string; name: string }} changedBy
 * @param {Record<string, { from: unknown; to: unknown }>} changes
 * @returns {Promise<void>}
 */
export async function writeHistory(projectId, cardId, changedBy, changes) {
  const db = getDb();
  const historyRef = collection(db, 'projects', projectId, 'cards', cardId, 'history');
  await addDoc(historyRef, {
    timestamp: serverTimestamp(),
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
 * @returns {Promise<Array<import('./types.d.ts').TeamMember & { id: string }>>}
 */
export async function getTeam(projectId) {
  const snap = await getDocs(teamRef(projectId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Add a team member to a project.
 * @param {string} projectId
 * @param {Omit<import('./types.d.ts').TeamMember, 'joinedAt'>} member
 * @returns {Promise<string>} The team member document ID.
 */
export async function addTeamMember(projectId, member) {
  const db = getDb();
  const ref = collection(db, 'projects', projectId, 'team');
  const docRef = await addDoc(ref, {
    ...member,
    active: member.active ?? true,
    joinedAt: serverTimestamp(),
  });

  // Update denormalized counts on project
  const countField = member.role === 'stakeholder' ? 'stakeholderCount' : 'developerCount';
  const projRef = doc(db, 'projects', projectId);
  await updateDoc(projRef, {
    [countField]: increment(1),
    updatedAt: serverTimestamp(),
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
  const db = getDb();
  const memberRef = doc(db, 'projects', projectId, 'team', memberId);
  const snap = await getDoc(memberRef);

  if (!snap.exists()) {
    throw new Error(`Team member ${memberId} not found in project ${projectId}`);
  }

  const memberData = snap.data();
  await deleteDoc(memberRef);

  // Update denormalized counts on project
  const countField = memberData.role === 'stakeholder' ? 'stakeholderCount' : 'developerCount';
  const projRef = doc(db, 'projects', projectId);
  await updateDoc(projRef, {
    [countField]: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/**
 * Get the tag registry for a project.
 * @param {string} projectId
 * @returns {Promise<import('./types.d.ts').TagRegistryEntry[]>}
 */
export async function getTagRegistry(projectId) {
  const db = getDb();
  const ref = doc(db, 'projects', projectId, 'settings', 'tags');
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];
  return snap.data().tags ?? [];
}

/**
 * Update the tag registry for a project.
 * @param {string} projectId
 * @param {import('./types.d.ts').TagRegistryEntry[]} tags
 * @returns {Promise<void>}
 */
export async function updateTagRegistry(projectId, tags) {
  const db = getDb();
  const ref = doc(db, 'projects', projectId, 'settings', 'tags');
  await setDoc(ref, { tags }, { merge: false });
}

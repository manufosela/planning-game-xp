/**
 * Platform DB schema — collections and helpers for multi-tenant SaaS management.
 *
 * All platform data lives in the Firestore (default) database.
 * Tenant data lives in named databases (one per instance).
 *
 * Collections:
 *   /instances/{id}        — Registered tenant instances
 *   /pendingRequests/{id}  — Users waiting for approval
 *   /platformConfig/{id}   — Global SaaS configuration
 *
 * @module platform/schema
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Schema definitions (for documentation and validation)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Instance
 * @property {string} name — Unique instance name (lowercase, hyphens)
 * @property {string} databaseId — Firestore named database ID
 * @property {string} status — 'active' | 'suspended' | 'pending'
 * @property {string} ownerEmail — Email of the instance creator
 * @property {string} ownerUid — Firebase Auth UID of the owner
 * @property {string} [displayName] — Human-readable org name
 * @property {number} userCount — Number of users in this instance
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} PendingRequest
 * @property {string} email — Requester email
 * @property {string} uid — Firebase Auth UID
 * @property {string} orgName — Requested organization name
 * @property {string} reason — Why they want an instance
 * @property {string} status — 'pending' | 'approved' | 'rejected'
 * @property {string} [rejectionReason] — Why the request was rejected
 * @property {string} [assignedInstance] — Instance assigned on approval
 * @property {import('firebase/firestore').Timestamp} requestedAt
 * @property {import('firebase/firestore').Timestamp} [reviewedAt]
 * @property {string} [reviewedBy] — Admin UID who reviewed
 */

/**
 * @typedef {Object} PlatformConfig
 * @property {string} configId — Config key
 * @property {*} value — Config value
 * @property {string} [description] — What this config does
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

// ---------------------------------------------------------------------------
// Collection references (always on the default database)
// ---------------------------------------------------------------------------

/**
 * Get a reference to the instances collection.
 * @param {import('firebase/firestore').Firestore} db — The (default) Firestore database
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function instancesRef(db) {
  return collection(db, 'instances');
}

/**
 * Get a reference to the pending requests collection.
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function pendingRequestsRef(db) {
  return collection(db, 'pendingRequests');
}

/**
 * Get a reference to the platform config collection.
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function platformConfigRef(db) {
  return collection(db, 'platformConfig');
}

// ---------------------------------------------------------------------------
// Instances CRUD
// ---------------------------------------------------------------------------

/**
 * List all registered instances.
 * @param {import('firebase/firestore').Firestore} db
 * @returns {Promise<Array<Instance & { id: string }>>}
 */
export async function listInstances(db) {
  const q = query(instancesRef(db), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get an instance by its document ID.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} instanceId
 * @returns {Promise<(Instance & { id: string }) | null>}
 */
export async function getInstance(db, instanceId) {
  const snap = await getDoc(doc(instancesRef(db), instanceId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Find an instance by its name.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} name
 * @returns {Promise<(Instance & { id: string }) | null>}
 */
export async function getInstanceByName(db, name) {
  const q = query(instancesRef(db), where('name', '==', name));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Register a new instance in the platform DB.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{ name: string, databaseId: string, ownerEmail: string, ownerUid: string, displayName?: string }} data
 * @returns {Promise<string>} The document ID
 */
export async function createInstance(db, data) {
  const existing = await getInstanceByName(db, data.name);
  if (existing) {
    throw new Error(`Instance "${data.name}" already exists`);
  }

  const now = serverTimestamp();
  const ref = await addDoc(instancesRef(db), {
    name: data.name,
    databaseId: data.databaseId,
    status: 'active',
    ownerEmail: data.ownerEmail,
    ownerUid: data.ownerUid,
    displayName: data.displayName ?? data.name,
    userCount: 1,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/**
 * Update an instance.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} instanceId
 * @param {Partial<Instance>} updates
 * @returns {Promise<void>}
 */
export async function updateInstance(db, instanceId, updates) {
  const ref = doc(instancesRef(db), instanceId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Pending Requests CRUD
// ---------------------------------------------------------------------------

/**
 * List pending requests, optionally filtered by status.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{ status?: string }} [filters]
 * @returns {Promise<Array<PendingRequest & { id: string }>>}
 */
export async function listPendingRequests(db, filters = {}) {
  const constraints = [orderBy('requestedAt', 'desc')];
  if (filters.status) {
    constraints.unshift(where('status', '==', filters.status));
  }
  const q = query(pendingRequestsRef(db), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get a pending request by ID.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} requestId
 * @returns {Promise<(PendingRequest & { id: string }) | null>}
 */
export async function getPendingRequest(db, requestId) {
  const snap = await getDoc(doc(pendingRequestsRef(db), requestId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Create a new instance request.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{ email: string, uid: string, orgName: string, reason?: string }} data
 * @returns {Promise<string>}
 */
export async function createPendingRequest(db, data) {
  const ref = await addDoc(pendingRequestsRef(db), {
    email: data.email,
    uid: data.uid,
    orgName: data.orgName,
    reason: data.reason ?? '',
    status: 'pending',
    requestedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update a pending request (approve/reject).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} requestId
 * @param {Partial<PendingRequest>} updates
 * @returns {Promise<void>}
 */
export async function updatePendingRequest(db, requestId, updates) {
  const ref = doc(pendingRequestsRef(db), requestId);
  await updateDoc(ref, { ...updates, reviewedAt: serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Platform Config CRUD
// ---------------------------------------------------------------------------

/**
 * Get a platform config value.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} configId
 * @returns {Promise<(PlatformConfig & { id: string }) | null>}
 */
export async function getPlatformConfig(db, configId) {
  const snap = await getDoc(doc(platformConfigRef(db), configId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Set a platform config value.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} configId
 * @param {*} value
 * @param {string} [description]
 * @returns {Promise<void>}
 */
export async function setPlatformConfig(db, configId, value, description) {
  const ref = doc(platformConfigRef(db), configId);
  await setDoc(ref, {
    configId,
    value,
    description: description ?? '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * List all platform config entries.
 * @param {import('firebase/firestore').Firestore} db
 * @returns {Promise<Array<PlatformConfig & { id: string }>>}
 */
export async function listPlatformConfig(db) {
  const snap = await getDocs(platformConfigRef(db));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate an instance name.
 * @param {string} name
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateInstanceName(name) {
  if (!name) return { valid: false, reason: 'Name is required' };
  if (name.length < 2) return { valid: false, reason: 'Name must be at least 2 characters' };
  if (name.length > 30) return { valid: false, reason: 'Name must be at most 30 characters' };
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return { valid: false, reason: 'Name must start with a letter and contain only lowercase letters, numbers, and hyphens' };
  if (name === 'default' || name === 'platform') return { valid: false, reason: `"${name}" is reserved` };
  return { valid: true };
}

/**
 * Valid instance statuses.
 * @type {string[]}
 */
export const INSTANCE_STATUSES = ['active', 'suspended', 'pending'];

/**
 * Valid request statuses.
 * @type {string[]}
 */
export const REQUEST_STATUSES = ['pending', 'approved', 'rejected'];

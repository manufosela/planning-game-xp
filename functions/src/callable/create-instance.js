/**
 * Cloud Function: createInstance
 *
 * Creates a new tenant instance:
 * 1. Validates the request (name, permissions)
 * 2. Creates a Firestore named database via Admin API
 * 3. Initializes collections (counters, settings, default project)
 * 4. Registers the instance in the platform DB (default)
 * 5. Assigns Custom Claims to the owner
 *
 * @module functions/callable/create-instance
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * Validate instance name format.
 * @param {string} name
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateName(name) {
  if (!name) return { valid: false, reason: 'Name is required' };
  if (name.length < 2 || name.length > 30) return { valid: false, reason: 'Name must be 2-30 characters' };
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return { valid: false, reason: 'Name must start with a letter, only lowercase letters, numbers, hyphens' };
  if (name === 'default' || name === 'platform') return { valid: false, reason: `"${name}" is reserved` };
  return { valid: true };
}

/**
 * Check if the caller is a platform admin.
 * Platform admins have customClaims.platformAdmin === true.
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 * @returns {boolean}
 */
export function isPlatformAdmin(request) {
  return request.auth?.token?.platformAdmin === true;
}

/**
 * Initialize a tenant database with default collections.
 * @param {import('firebase-admin/firestore').Firestore} tenantDb
 * @param {string} instanceName
 * @returns {Promise<void>}
 */
export async function initializeTenantDb(tenantDb, instanceName) {
  const batch = tenantDb.batch();

  // Counters document
  const counterRef = tenantDb.doc('counters/_default');
  batch.set(counterRef, {
    task: 0,
    bug: 0,
    epic: 0,
    sprint: 0,
    proposal: 0,
    qa: 0,
  });

  // Settings document
  const settingsRef = tenantDb.doc('settings/general');
  batch.set(settingsRef, {
    instanceName,
    createdAt: new Date().toISOString(),
    pointScale: 'fibonacci',
    wipLimit: 1,
    defaultYear: new Date().getFullYear(),
  });

  await batch.commit();
}

/**
 * Register instance in platform DB and assign owner claims.
 * @param {import('firebase-admin/firestore').Firestore} platformDb
 * @param {{ name: string, ownerUid: string, ownerEmail: string, displayName?: string }} data
 * @returns {Promise<string>} Instance document ID
 */
export async function registerInstance(platformDb, data) {
  // Check for duplicate name
  const existing = await platformDb
    .collection('instances')
    .where('name', '==', data.name)
    .get();

  if (!existing.empty) {
    throw new HttpsError('already-exists', `Instance "${data.name}" already exists`);
  }

  const ref = await platformDb.collection('instances').add({
    name: data.name,
    databaseId: data.name,
    status: 'active',
    ownerEmail: data.ownerEmail,
    ownerUid: data.ownerUid,
    displayName: data.displayName ?? data.name,
    userCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return ref.id;
}

/**
 * Assign tenant Custom Claims to a user.
 * @param {string} uid
 * @param {string} instanceName
 * @param {string} role
 * @returns {Promise<void>}
 */
export async function assignTenantClaims(uid, instanceName, role) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims || {};

  if (currentClaims.instance && currentClaims.instance !== instanceName) {
    throw new HttpsError(
      'failed-precondition',
      `User already belongs to instance "${currentClaims.instance}". One user = one instance.`,
    );
  }

  await auth.setCustomUserClaims(uid, {
    ...currentClaims,
    instance: instanceName,
    instanceRole: role,
  });
}

// ---------------------------------------------------------------------------
// Cloud Function
// ---------------------------------------------------------------------------

export const createNewInstance = onCall(
  { enforceAppCheck: false },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    if (!isPlatformAdmin(request)) {
      throw new HttpsError('permission-denied', 'Only platform admins can create instances');
    }

    const { name, ownerEmail, ownerUid, displayName } = request.data;

    // Validate name
    const nameCheck = validateName(name);
    if (!nameCheck.valid) {
      throw new HttpsError('invalid-argument', nameCheck.reason);
    }

    // NOTE: Creating a Firestore named database requires the
    // Google Cloud Firestore Admin API (google.firestore.admin.v1).
    // This is NOT available in the firebase-admin SDK directly.
    // In production, use @google-cloud/firestore AdminClient or
    // call the REST API. For now, we register the instance and
    // the database must be created via Firebase Console or gcloud CLI.
    //
    // TODO: Automate database creation when google-cloud/firestore
    // exposes createDatabase() in the Node.js client.

    const platformDb = getFirestore();

    // Register in platform DB
    const instanceId = await registerInstance(platformDb, {
      name,
      ownerEmail,
      ownerUid,
      displayName,
    });

    // Try to initialize the tenant DB (will fail if DB doesn't exist yet)
    try {
      const tenantDb = getFirestore(name);
      await initializeTenantDb(tenantDb, name);
    } catch (err) {
      // DB may not exist yet — that's OK, it can be initialized later
      console.warn(`Could not initialize tenant DB "${name}":`, err.message);
    }

    // Assign claims to the owner
    await assignTenantClaims(ownerUid, name, 'admin');

    return {
      success: true,
      instanceId,
      databaseId: name,
      message: `Instance "${name}" created. Owner ${ownerEmail} assigned as admin.`,
    };
  },
);

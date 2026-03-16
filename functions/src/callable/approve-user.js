/**
 * Cloud Function: approveUser / rejectUser
 *
 * Admin approves or rejects a pending instance request.
 * On approval: assigns Custom Claims and updates request status.
 * On rejection: updates request with reason.
 *
 * @module functions/callable/approve-user
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * Check if user already has an instance claim.
 * @param {string} uid
 * @returns {Promise<string | null>} Current instance or null
 */
export async function getUserInstance(uid) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  return user.customClaims?.instance ?? null;
}

/**
 * Assign Custom Claims to link user to an instance.
 * Enforces 1 user = 1 instance unless force=true.
 * @param {string} uid
 * @param {string} instanceName
 * @param {string} role
 * @param {boolean} [force=false]
 * @returns {Promise<void>}
 */
export async function assignClaims(uid, instanceName, role, force = false) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims || {};

  if (currentClaims.instance && currentClaims.instance !== instanceName && !force) {
    throw new HttpsError(
      'failed-precondition',
      `User already belongs to instance "${currentClaims.instance}". Use force=true to reassign.`,
    );
  }

  await auth.setCustomUserClaims(uid, {
    ...currentClaims,
    instance: instanceName,
    instanceRole: role,
  });
}

/**
 * Remove instance claims from a user.
 * @param {string} uid
 * @returns {Promise<void>}
 */
export async function removeClaims(uid) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims || {};

  const { instance, instanceRole, ...rest } = currentClaims;
  await auth.setCustomUserClaims(uid, rest);
}

// ---------------------------------------------------------------------------
// Approve User
// ---------------------------------------------------------------------------

export const approveUser = onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    if (!request.auth.token.platformAdmin) {
      throw new HttpsError('permission-denied', 'Only platform admins can approve users');
    }

    const { requestId, instanceName, role = 'developer', force = false } = request.data;

    if (!requestId || !instanceName) {
      throw new HttpsError('invalid-argument', 'requestId and instanceName are required');
    }

    const platformDb = getFirestore();

    // Get the pending request
    const reqDoc = await platformDb.collection('pendingRequests').doc(requestId).get();
    if (!reqDoc.exists) {
      throw new HttpsError('not-found', `Request ${requestId} not found`);
    }

    const reqData = reqDoc.data();
    if (reqData.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Request is already ${reqData.status}`);
    }

    // Verify instance exists
    const instanceSnap = await platformDb
      .collection('instances')
      .where('name', '==', instanceName)
      .get();

    if (instanceSnap.empty) {
      throw new HttpsError('not-found', `Instance "${instanceName}" not found`);
    }

    // Assign claims
    await assignClaims(reqData.uid, instanceName, role, force);

    // Update request
    await platformDb.collection('pendingRequests').doc(requestId).update({
      status: 'approved',
      assignedInstance: instanceName,
      reviewedAt: new Date().toISOString(),
      reviewedBy: request.auth.uid,
    });

    // Increment user count on instance
    const instanceDoc = instanceSnap.docs[0];
    await instanceDoc.ref.update({
      userCount: (instanceDoc.data().userCount ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      message: `User ${reqData.email} approved for instance "${instanceName}" as ${role}`,
    };
  },
);

// ---------------------------------------------------------------------------
// Reject User
// ---------------------------------------------------------------------------

export const rejectUser = onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    if (!request.auth.token.platformAdmin) {
      throw new HttpsError('permission-denied', 'Only platform admins can reject users');
    }

    const { requestId, reason = '' } = request.data;

    if (!requestId) {
      throw new HttpsError('invalid-argument', 'requestId is required');
    }

    const platformDb = getFirestore();

    const reqDoc = await platformDb.collection('pendingRequests').doc(requestId).get();
    if (!reqDoc.exists) {
      throw new HttpsError('not-found', `Request ${requestId} not found`);
    }

    const reqData = reqDoc.data();
    if (reqData.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Request is already ${reqData.status}`);
    }

    await platformDb.collection('pendingRequests').doc(requestId).update({
      status: 'rejected',
      rejectionReason: reason,
      reviewedAt: new Date().toISOString(),
      reviewedBy: request.auth.uid,
    });

    return {
      success: true,
      message: `Request from ${reqData.email} rejected`,
    };
  },
);

// ---------------------------------------------------------------------------
// Request Instance (called by unapproved users)
// ---------------------------------------------------------------------------

export const requestInstance = onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    // Check if user already has an instance
    const existing = await getUserInstance(request.auth.uid);
    if (existing) {
      throw new HttpsError('already-exists', `You already belong to instance "${existing}"`);
    }

    const { orgName, reason = '' } = request.data;

    if (!orgName) {
      throw new HttpsError('invalid-argument', 'orgName is required');
    }

    const platformDb = getFirestore();

    // Check for duplicate pending request
    const pendingSnap = await platformDb
      .collection('pendingRequests')
      .where('uid', '==', request.auth.uid)
      .where('status', '==', 'pending')
      .get();

    if (!pendingSnap.empty) {
      throw new HttpsError('already-exists', 'You already have a pending request');
    }

    const ref = await platformDb.collection('pendingRequests').add({
      email: request.auth.token.email,
      uid: request.auth.uid,
      orgName,
      reason,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    });

    return {
      success: true,
      requestId: ref.id,
      message: 'Request submitted. An admin will review it.',
    };
  },
);

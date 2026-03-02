/**
 * Admin Users handlers.
 * CRUD operations for user management in /users/.
 *
 * Extracted from functions/index.js during monolith refactor.
 */
'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { encodeEmailForFirebase } = require('../shared/email-utils.cjs');
const { hasActiveProject } = require('../shared/card-utils.cjs');
const { generateNextId } = require('../shared/auth-utils.cjs');

/**
 * Syncs /data/projectsByUser/{encodedEmail} with the user's active projects from /users/.
 * This keeps the legacy path (read by the client) in sync with the canonical path.
 *
 * @param {object} db - Firebase RTDB reference
 * @param {string} encodedEmail - Encoded user email
 * @returns {Promise<void>}
 */
async function syncProjectsByUser(db, encodedEmail) {
  const projectsSnap = await db.ref(`/users/${encodedEmail}/projects`).once('value');
  const projects = projectsSnap.val();

  if (!projects || typeof projects !== 'object') {
    await db.ref(`/data/projectsByUser/${encodedEmail}`).remove();
    return;
  }

  const activeProjectIds = Object.entries(projects)
    .filter(([, p]) => p.developer === true || p.stakeholder === true)
    .map(([id]) => id);

  if (activeProjectIds.length === 0) {
    await db.ref(`/data/projectsByUser/${encodedEmail}`).remove();
  } else {
    await db.ref(`/data/projectsByUser/${encodedEmail}`).set(activeProjectIds.join(','));
  }
}

/**
 * Handle the listUsers callable function.
 * Returns all users from /users/ enriched with Auth status.
 *
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleListUsers(request, deps) {
  const { admin, db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const callerClaims = request.auth.token || {};
  if (!callerClaims.isAppAdmin) {
    throw new HttpsError('permission-denied', 'Only appAdmins can list users');
  }

  const snapshot = await db.ref('/users').once('value');
  const usersData = snapshot.val() || {};

  const users = [];
  for (const [encodedEmail, userData] of Object.entries(usersData)) {
    if (!userData.email) continue;
    let authStatus = 'not_registered';
    let lastLoginAt = null;
    try {
      const userRecord = await admin.auth().getUserByEmail(userData.email);
      authStatus = userRecord.disabled ? 'disabled' : 'active';
      lastLoginAt = userRecord.metadata?.lastSignInTime || null;
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        logger.warn(`Error checking auth for ${userData.email}`, error);
      }
    }
    // Include appPermissions nested inside each project
    const projects = userData.projects || {};
    users.push({
      encodedEmail,
      email: userData.email,
      name: userData.name || '',
      developerId: userData.developerId || null,
      stakeholderId: userData.stakeholderId || null,
      active: userData.active !== false,
      projects,
      authStatus,
      lastLoginAt
    });
  }

  return { users };
}

/**
 * Handle the createOrUpdateUser callable function.
 * Creates or updates a user in /users/{encodedEmail}.
 * Auto-generates developerId/stakeholderId when assigning roles.
 *
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleCreateOrUpdateUser(request, deps) {
  const { admin, db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const callerClaims = request.auth.token || {};
  if (!callerClaims.isAppAdmin) {
    throw new HttpsError('permission-denied', 'Only appAdmins can manage users');
  }

  const { email, name, projectId, developer, stakeholder } = request.data || {};
  if (!email || typeof email !== 'string') {
    throw new HttpsError('invalid-argument', 'Email is required');
  }
  if (!name || typeof name !== 'string') {
    throw new HttpsError('invalid-argument', 'Name is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const encodedEmail = encodeEmailForFirebase(normalizedEmail);
  const now = new Date().toISOString();
  const callerEmail = request.auth.token.email || 'unknown';

  // Read existing user data
  const existingSnap = await db.ref(`/users/${encodedEmail}`).once('value');
  const existingData = existingSnap.val() || {};

  const updates = {};
  updates[`/users/${encodedEmail}/name`] = name.trim();
  updates[`/users/${encodedEmail}/email`] = normalizedEmail;
  updates[`/users/${encodedEmail}/active`] = true;

  if (!existingData.createdAt) {
    updates[`/users/${encodedEmail}/createdAt`] = now;
    updates[`/users/${encodedEmail}/createdBy`] = callerEmail;
  }

  // Handle developer ID
  const isDeveloper = developer === true;
  if (isDeveloper && !existingData.developerId) {
    const newDevId = await generateNextId('dev_', 'developerId', db);
    updates[`/users/${encodedEmail}/developerId`] = newDevId;
  }

  // Handle stakeholder ID
  const isStakeholder = stakeholder === true;
  if (isStakeholder && !existingData.stakeholderId) {
    const newStkId = await generateNextId('stk_', 'stakeholderId', db);
    updates[`/users/${encodedEmail}/stakeholderId`] = newStkId;
  }

  // Handle project assignment
  if (projectId && typeof projectId === 'string') {
    updates[`/users/${encodedEmail}/projects/${projectId}/developer`] = isDeveloper;
    updates[`/users/${encodedEmail}/projects/${projectId}/stakeholder`] = isStakeholder;
    if (!existingData.projects?.[projectId]?.addedAt) {
      updates[`/users/${encodedEmail}/projects/${projectId}/addedAt`] = now;
    }
  }

  await db.ref().update(updates);

  // Sync /data/projectsByUser/ so the client can read the project list
  await syncProjectsByUser(db, encodedEmail);

  logger.info(`User created/updated: ${normalizedEmail}`, {
    changedBy: callerEmail,
    projectId,
    developer: isDeveloper,
    stakeholder: isStakeholder
  });

  // Sync allowed claim if user exists in Auth
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    const currentClaims = userRecord.customClaims || {};
    const projectsSnap = await db.ref(`/users/${encodedEmail}/projects`).once('value');
    const shouldBeAllowed = hasActiveProject(projectsSnap.val());

    if (currentClaims.allowed !== shouldBeAllowed) {
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        ...currentClaims,
        allowed: shouldBeAllowed
      });
    }
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      logger.warn(`Could not sync claims for ${normalizedEmail}`, error);
    }
  }

  return { success: true, email: normalizedEmail, encodedEmail };
}

/**
 * Handle the removeUserFromProject callable function.
 * Removes a user's assignment from a specific project.
 *
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleRemoveUserFromProject(request, deps) {
  const { admin, db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const callerClaims = request.auth.token || {};
  if (!callerClaims.isAppAdmin) {
    throw new HttpsError('permission-denied', 'Only appAdmins can manage users');
  }

  const { email, projectId } = request.data || {};
  if (!email || !projectId) {
    throw new HttpsError('invalid-argument', 'Email and projectId are required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const encodedEmail = encodeEmailForFirebase(normalizedEmail);

  // Remove project assignment
  await db.ref(`/users/${encodedEmail}/projects/${projectId}`).remove();

  // Sync /data/projectsByUser/ so the client can read the updated project list
  await syncProjectsByUser(db, encodedEmail);

  logger.info(`Removed ${normalizedEmail} from project ${projectId}`, {
    removedBy: request.auth.token.email
  });

  // Check remaining projects and sync allowed claim
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    const projectsSnap = await db.ref(`/users/${encodedEmail}/projects`).once('value');
    const shouldBeAllowed = hasActiveProject(projectsSnap.val());

    const currentClaims = userRecord.customClaims || {};
    if (currentClaims.allowed !== shouldBeAllowed) {
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        ...currentClaims,
        allowed: shouldBeAllowed
      });
      logger.info(`Revoked allowed claim for ${normalizedEmail} (no projects remaining)`);
    }
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      logger.warn(`Could not sync claims for ${normalizedEmail}`, error);
    }
  }

  return { success: true, email: normalizedEmail, projectId };
}

/**
 * Handle the deleteUser callable function.
 * Deletes a user from /users/ and cleans up legacy paths.
 * Revokes custom claims but does NOT delete the Firebase Auth account.
 *
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleDeleteUser(request, deps) {
  const { admin, db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const callerClaims = request.auth.token || {};
  if (!callerClaims.isAppAdmin) {
    throw new HttpsError('permission-denied', 'Only appAdmins can delete users');
  }

  const { email } = request.data || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const callerEmail = request.auth.token.email || 'unknown';

  // Cannot delete yourself
  if (normalizedEmail === callerEmail.toLowerCase()) {
    throw new HttpsError('failed-precondition', 'Cannot delete your own account');
  }

  const encodedEmail = encodeEmailForFirebase(normalizedEmail);

  // Read user data to get project list
  const userSnap = await db.ref(`/users/${encodedEmail}`).once('value');
  if (!userSnap.exists()) {
    throw new HttpsError('not-found', `User ${normalizedEmail} not found`);
  }

  const userData = userSnap.val();
  const projectIds = userData.projects ? Object.keys(userData.projects) : [];

  // Build multi-path delete
  const deletePaths = {};
  deletePaths[`/users/${encodedEmail}`] = null;
  deletePaths[`/data/appAdmins/${encodedEmail}`] = null;
  deletePaths[`/data/projectsByUser/${encodedEmail}`] = null;

  for (const pid of projectIds) {
    deletePaths[`/data/appUploaders/${pid}/${encodedEmail}`] = null;
    deletePaths[`/data/betaUsers/${pid}/${encodedEmail}`] = null;
  }

  await db.ref().update(deletePaths);

  logger.info(`User deleted: ${normalizedEmail}`, {
    deletedBy: callerEmail,
    projectsCleared: projectIds
  });

  // Revoke claims if user exists in Auth (do NOT delete the Auth account)
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    const currentClaims = userRecord.customClaims || {};
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...currentClaims,
      allowed: false,
      isAppAdmin: false,
      appPerms: {}
    });
    logger.info(`Claims revoked for ${normalizedEmail}`);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      logger.warn(`Could not revoke claims for ${normalizedEmail}`, error);
    }
  }

  return {
    success: true,
    email: normalizedEmail,
    deletedBy: callerEmail,
    projectsCleared: projectIds
  };
}

module.exports = {
  handleListUsers,
  handleCreateOrUpdateUser,
  handleRemoveUserFromProject,
  handleDeleteUser,
  syncProjectsByUser,
};

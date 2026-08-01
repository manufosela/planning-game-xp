/**
 * Admin Permissions handlers.
 * Manages appAdmin, appUploader, and appPermissions claims/data.
 *
 * Extracted from functions/index.js during monolith refactor.
 */
'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { encodeEmailForFirebase, decodeEmailFromFirebase } = require('../shared/email-utils.cjs');
const { hasActiveProject } = require('../shared/card-utils.cjs');

/**
 * Handle the syncAllAppAdminClaims callable function.
 * Syncs isAppAdmin claims for all users in /data/appAdmins.
 *
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleSyncAllAppAdminClaims(request, deps) {
  const { admin, db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const callerEmail = request.auth.token.email;
  const callerClaims = request.auth.token;

  // Check if caller is appAdmin or SuperAdmin (from env var)
  const superAdminEmail = process.env.PUBLIC_SUPER_ADMIN_EMAIL || '';
  const isCallerSuperAdmin = callerEmail && superAdminEmail &&
    callerEmail.toLowerCase() === superAdminEmail.toLowerCase();
  const isCallerAppAdmin = callerClaims.isAppAdmin === true;

  if (!isCallerSuperAdmin && !isCallerAppAdmin) {
    throw new HttpsError('permission-denied', 'Solo appAdmins pueden ejecutar esta función.');
  }

  const appAdminsSnapshot = await db.ref('/data/appAdmins').once('value');
  const appAdmins = appAdminsSnapshot.val() || {};

  const results = {
    success: [],
    notFound: [],
    errors: []
  };

  for (const [encodedEmail, value] of Object.entries(appAdmins)) {
    if (value !== true) continue;

    const email = decodeEmailFromFirebase(encodedEmail);
    if (!email) {
      results.errors.push({ encodedEmail, error: 'Could not decode email' });
      continue;
    }

    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      const currentClaims = userRecord.customClaims || {};

      await admin.auth().setCustomUserClaims(userRecord.uid, {
        ...currentClaims,
        isAppAdmin: true
      });

      results.success.push({ email, uid: userRecord.uid });
      logger.info(`Synced isAppAdmin claim for ${email}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        results.notFound.push({ email });
      } else {
        results.errors.push({ email, error: error.message });
        logger.error(`Failed to sync claim for ${email}`, error);
      }
    }
  }

  logger.info('syncAllAppAdminClaims completed', results);
  return results;
}

/**
 * Handle the addAppAdmin callable function.
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleAddAppAdmin(request, deps) {
  const { db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { email: targetEmail } = request.data || {};
  if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'Se requiere un email válido.');
  }

  const callerEmail = request.auth.token.email;
  const callerClaims = request.auth.token;

  // Check if caller is appAdmin or SuperAdmin (from env var)
  const superAdminEmail = process.env.PUBLIC_SUPER_ADMIN_EMAIL || '';
  const isCallerSuperAdmin = callerEmail && superAdminEmail &&
    callerEmail.toLowerCase() === superAdminEmail.toLowerCase();
  const isCallerAppAdmin = callerClaims.isAppAdmin === true;

  if (!isCallerSuperAdmin && !isCallerAppAdmin) {
    throw new HttpsError('permission-denied', 'Solo appAdmins o SuperAdmin pueden añadir appAdmins.');
  }

  const normalizedEmail = targetEmail.toLowerCase().trim();
  const encodedEmail = encodeEmailForFirebase(normalizedEmail);

  // Write to database (this will trigger syncAppAdminClaim)
  await db.ref(`/data/appAdmins/${encodedEmail}`).set(true);

  logger.info(`AppAdmin added: ${normalizedEmail} by ${callerEmail}`);

  return {
    success: true,
    email: normalizedEmail,
    addedBy: callerEmail
  };
}

/**
 * Handle the removeAppAdmin callable function.
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleRemoveAppAdmin(request, deps) {
  const { db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { email: targetEmail } = request.data || {};
  if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'Se requiere un email válido.');
  }

  const callerEmail = request.auth.token.email;
  const callerClaims = request.auth.token;

  // Only appAdmins can remove appAdmins
  if (callerClaims.isAppAdmin !== true) {
    throw new HttpsError('permission-denied', 'Solo appAdmins pueden eliminar appAdmins.');
  }

  const normalizedEmail = targetEmail.toLowerCase().trim();

  // Cannot remove yourself
  if (callerEmail.toLowerCase() === normalizedEmail) {
    throw new HttpsError('failed-precondition', 'No puedes eliminarte a ti mismo como appAdmin.');
  }

  const encodedEmail = encodeEmailForFirebase(normalizedEmail);

  // Remove from database (this will trigger syncAppAdminClaim)
  await db.ref(`/data/appAdmins/${encodedEmail}`).remove();

  logger.info(`AppAdmin removed: ${normalizedEmail} by ${callerEmail}`);

  return {
    success: true,
    email: normalizedEmail,
    removedBy: callerEmail
  };
}

/**
 * Handle the addAppUploader callable function.
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleAddAppUploader(request, deps) {
  const { db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { email: targetEmail, projectId } = request.data || {};
  if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'Se requiere un email válido.');
  }
  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'Se requiere un projectId válido.');
  }

  const callerClaims = request.auth.token;

  // Only appAdmins can add uploaders
  if (callerClaims.isAppAdmin !== true) {
    throw new HttpsError('permission-denied', 'Solo appAdmins pueden añadir uploaders.');
  }

  const normalizedEmail = targetEmail.toLowerCase().trim();
  const encodedEmail = encodeEmailForFirebase(normalizedEmail);

  // Dual-write: legacy path + new /users/ path
  const updates = {};
  updates[`/data/appUploaders/${projectId}/${encodedEmail}`] = true;
  updates[`/users/${encodedEmail}/projects/${projectId}/appPermissions/upload`] = true;
  await db.ref().update(updates);

  logger.info(`AppUploader added: ${normalizedEmail} for project ${projectId}`);

  return {
    success: true,
    email: normalizedEmail,
    projectId,
    addedBy: request.auth.token.email
  };
}

/**
 * Handle the removeAppUploader callable function.
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleRemoveAppUploader(request, deps) {
  const { db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { email: targetEmail, projectId } = request.data || {};
  if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'Se requiere un email válido.');
  }
  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'Se requiere un projectId válido.');
  }

  const callerClaims = request.auth.token;

  // Only appAdmins can remove uploaders
  if (callerClaims.isAppAdmin !== true) {
    throw new HttpsError('permission-denied', 'Solo appAdmins pueden eliminar uploaders.');
  }

  const normalizedEmail = targetEmail.toLowerCase().trim();
  const encodedEmail = encodeEmailForFirebase(normalizedEmail);

  // Dual-write: remove from legacy path + new /users/ path
  const updates = {};
  updates[`/data/appUploaders/${projectId}/${encodedEmail}`] = null;
  updates[`/users/${encodedEmail}/projects/${projectId}/appPermissions/upload`] = false;
  await db.ref().update(updates);

  logger.info(`AppUploader removed: ${normalizedEmail} from project ${projectId}`);

  return {
    success: true,
    email: normalizedEmail,
    projectId,
    removedBy: request.auth.token.email
  };
}

/**
 * Handle the syncAppAdminClaim trigger.
 * Syncs the isAppAdmin custom claim when /data/appAdmins changes.
 *
 * @param {object} eventParams - Event params (e.g. { encodedEmail })
 * @param {*} beforeValue - Value before the write
 * @param {*} afterValue - Value after the write
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object|null>}
 */
async function handleSyncAppAdminClaim(eventParams, beforeValue, afterValue, deps) {
  const { admin, logger } = deps;
  const { encodedEmail } = eventParams;

  // Decode the email
  const email = decodeEmailFromFirebase(encodedEmail);
  if (!email) {
    logger.error('Could not decode email from Firebase key', { encodedEmail });
    return null;
  }

  // Determine if user should be appAdmin
  const shouldBeAppAdmin = afterValue === true;
  const wasAppAdmin = beforeValue === true;

  // No change needed
  if (shouldBeAppAdmin === wasAppAdmin) {
    return null;
  }

  try {
    // Find user by email
    const userRecord = await admin.auth().getUserByEmail(email);

    // Get current claims and update isAppAdmin + allowed (app admins are
    // always allowed even without an active project — see PLN-BUG-0111).
    const currentClaims = userRecord.customClaims || {};
    const newClaims = {
      ...currentClaims,
      isAppAdmin: shouldBeAppAdmin
    };
    if (shouldBeAppAdmin) {
      newClaims.allowed = true;
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);

    logger.info(`Updated isAppAdmin claim for ${email}`, {
      uid: userRecord.uid,
      isAppAdmin: shouldBeAppAdmin,
      allowed: newClaims.allowed
    });

    return { success: true, email, isAppAdmin: shouldBeAppAdmin };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      logger.warn(`User not found for appAdmin sync: ${email}`);
      return null;
    }
    logger.error(`Failed to sync appAdmin claim for ${email}`, error);
    throw error;
  }
}

/**
 * Handle the syncUserAllowedClaim trigger.
 * Syncs the 'allowed' custom claim when /users/{encodedEmail}/projects changes.
 *
 * @param {object} eventParams - Event params (e.g. { encodedEmail })
 * @param {*} beforeValue - Value before the write (unused)
 * @param {*} afterValue - Value after the write (unused - reads fresh from DB)
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object|null>}
 */
async function handleSyncUserAllowedClaim(eventParams, beforeValue, afterValue, deps) {
  const { admin, db, logger } = deps;
  const { encodedEmail } = eventParams;

  const email = decodeEmailFromFirebase(encodedEmail);
  if (!email) {
    logger.error('Could not decode email from Firebase key', { encodedEmail });
    return null;
  }

  try {
    // Read all projects for this user to determine allowed status
    const projectsSnap = await db.ref(`/users/${encodedEmail}/projects`).once('value');
    const hasProject = hasActiveProject(projectsSnap.val());

    const userRecord = await admin.auth().getUserByEmail(email);
    const currentClaims = userRecord.customClaims || {};

    // App admins (SuperAdmin, appAdmin) always get allowed=true even without
    // an active project — otherwise a freshly bootstrapped instance blocks
    // its own SuperAdmin from reading /projects to create the first one
    // (PLN-BUG-0111 root cause).
    const isAppAdmin = currentClaims.isAppAdmin === true;
    const shouldBeAllowed = hasProject || isAppAdmin;

    if (currentClaims.allowed === shouldBeAllowed) {
      return null; // No change needed
    }

    const newClaims = { ...currentClaims, allowed: shouldBeAllowed };
    await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);

    logger.info(`Updated allowed claim for ${email}`, {
      uid: userRecord.uid,
      allowed: shouldBeAllowed,
      reason: hasProject ? 'active-project' : (isAppAdmin ? 'app-admin' : 'none')
    });

    return { success: true, email, allowed: shouldBeAllowed };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      logger.warn(`User not found for allowed sync: ${email}. Claim will be set when user registers.`);
      return null;
    }
    logger.error(`Failed to sync allowed claim for ${email}`, error);
    throw error;
  }
}

/**
 * Handle the updateAppPermissions callable function.
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleUpdateAppPermissions(request, deps) {
  const { db, logger } = deps;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const callerClaims = request.auth.token || {};
  if (!callerClaims.isAppAdmin) {
    throw new HttpsError('permission-denied', 'Only appAdmins can update app permissions');
  }

  const { email, projectId, permissions } = request.data || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email is required');
  }
  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'projectId is required');
  }
  if (!permissions || typeof permissions !== 'object') {
    throw new HttpsError('invalid-argument', 'permissions object is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const encodedEmail = encodeEmailForFirebase(normalizedEmail);

  // Verify user exists
  const userSnap = await db.ref(`/users/${encodedEmail}`).once('value');
  if (!userSnap.exists()) {
    throw new HttpsError('not-found', `User ${normalizedEmail} not found`);
  }

  const validPerms = ['view', 'download', 'upload', 'edit', 'approve'];
  const sanitized = {};
  for (const perm of validPerms) {
    sanitized[perm] = permissions[perm] === true;
  }

  // Multi-path update
  const updates = {};
  const basePath = `/users/${encodedEmail}/projects/${projectId}/appPermissions`;
  for (const [perm, value] of Object.entries(sanitized)) {
    updates[`${basePath}/${perm}`] = value;
  }

  // Dual-write to legacy paths
  if (sanitized.upload) {
    updates[`/data/appUploaders/${projectId}/${encodedEmail}`] = true;
  } else {
    updates[`/data/appUploaders/${projectId}/${encodedEmail}`] = null;
  }
  if (sanitized.view) {
    updates[`/data/betaUsers/${projectId}/${encodedEmail}`] = true;
  } else {
    updates[`/data/betaUsers/${projectId}/${encodedEmail}`] = null;
  }

  await db.ref().update(updates);

  logger.info(`App permissions updated for ${normalizedEmail} in ${projectId}`, {
    updatedBy: request.auth.token.email,
    permissions: sanitized
  });

  return {
    success: true,
    email: normalizedEmail,
    projectId,
    permissions: sanitized
  };
}

/**
 * Handle the syncAppPermissionsClaim trigger.
 * Rebuilds the compact appPerms claim from all project appPermissions.
 *
 * @param {object} eventParams - Event params (e.g. { encodedEmail })
 * @param {*} beforeValue - Value before the write (unused)
 * @param {*} afterValue - Projects data after the write
 * @param {object} deps - Injected dependencies
 * @param {object} deps.admin - Firebase Admin SDK instance
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object|null>}
 */
async function handleSyncAppPermissionsClaim(eventParams, beforeValue, afterValue, deps) {
  const { admin, logger } = deps;
  const { encodedEmail } = eventParams;
  const projectsData = afterValue;

  const email = decodeEmailFromFirebase(encodedEmail);
  if (!email) {
    logger.error('Could not decode email for appPerms sync', { encodedEmail });
    return null;
  }

  // Build compact appPerms map
  const flagMap = { view: 'v', download: 'd', upload: 'u', edit: 'e', approve: 'a' };
  const appPerms = {};

  if (projectsData && typeof projectsData === 'object') {
    for (const [pid, projData] of Object.entries(projectsData)) {
      const perms = projData?.appPermissions;
      if (!perms || typeof perms !== 'object') continue;

      let flags = '';
      for (const [perm, flag] of Object.entries(flagMap)) {
        if (perms[perm] === true) flags += flag;
      }
      if (flags) {
        appPerms[pid] = flags;
      }
    }
  }

  // Update custom claims
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const currentClaims = userRecord.customClaims || {};
    const newClaims = { ...currentClaims, appPerms };

    await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);
    logger.info(`appPerms claim synced for ${email}`, { appPerms });
    return { success: true, email, appPerms };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      logger.warn(`User not found for appPerms sync: ${email}. Claim will be set when user registers.`);
      return null;
    }
    logger.error(`Failed to sync appPerms claim for ${email}`, error);
    throw error;
  }
}

module.exports = {
  handleSyncAllAppAdminClaims,
  handleAddAppAdmin,
  handleRemoveAppAdmin,
  handleAddAppUploader,
  handleRemoveAppUploader,
  handleSyncAppAdminClaim,
  handleSyncUserAllowedClaim,
  handleUpdateAppPermissions,
  handleSyncAppPermissionsClaim,
};

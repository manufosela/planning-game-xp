/**
 * Handler for onTaskStatusValidation Cloud Function
 * Validates task status transitions and reverts invalid changes.
 *
 * Validations:
 * 1. Leaving "To Do": requires mandatory task fields
 * 2. To "In Progress": requires startDate to be updated in the same transition
 * 3. To "To Validate": requires endDate to be updated in the same transition
 * 2. To "Done" or "Done&Validated": only validator/coValidator can change
 */

function getAppUrl() {
  if (!process.env.PUBLIC_APP_URL) {
    throw new Error('PUBLIC_APP_URL environment variable is required. Set it in functions/.env or Firebase Functions config.');
  }
  if (process.env.FUNCTIONS_EMULATOR !== 'true' && process.env.PUBLIC_APP_URL.includes('localhost')) {
    throw new Error('PUBLIC_APP_URL contains "localhost" in production. Fix the value in functions/.env.');
  }
  return process.env.PUBLIC_APP_URL;
}

/**
 * Sanitize email for use as Firebase key (full email, not just prefix)
 */
function sanitizeEmailForKey(email) {
  return email.replace(/[.#$[\]/]/g, '_');
}

// Import shared constants and validation (single source of truth)
const {
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  VALIDATOR_ONLY_STATUSES,
  VALID_BUG_STATUSES: VALID_BUG_STATUSES_LIST,
  hasValidValue
} = require('../shared/index.cjs');

/**
 * Check if email matches a stakeholder ID
 * @param {string} email - User email
 * @param {string} stakeholderId - Stakeholder ID (stk_XXX)
 * @param {Object} stakeholdersData - All stakeholders data from /data/stakeholders
 * @returns {boolean}
 */
function isEmailMatchingStakeholder(email, stakeholderId, stakeholdersData) {
  if (!email || !stakeholderId || !stakeholdersData) return false;
  const stakeholder = stakeholdersData[stakeholderId];
  if (!stakeholder || !stakeholder.email) return false;
  return email.toLowerCase().trim() === stakeholder.email.toLowerCase().trim();
}

/**
 * Validate fields required to transition to "Blocked".
 * Must have at least one blocker type and its associated fields.
 * @param {Object} afterData - Card data after the change
 * @returns {Object|null} - Error object or null if valid
 */
function validateBlockedTransition(afterData) {
  const blockedByBusiness = afterData.blockedByBusiness;
  const blockedByDevelopment = afterData.blockedByDevelopment;

  // At least one blocker type must be set
  if (!blockedByBusiness && !blockedByDevelopment) {
    return {
      type: 'missing-blocker-type',
      message: 'Cannot change to "Blocked": must specify blockedByBusiness or blockedByDevelopment (or both)'
    };
  }

  const missingFields = [];

  // If blocked by business, need bbbWhy and bbbWho
  if (blockedByBusiness) {
    if (!hasValidValue(afterData, 'bbbWhy')) missingFields.push('bbbWhy (motivo bloqueo negocio)');
    if (!hasValidValue(afterData, 'bbbWho')) missingFields.push('bbbWho (quién bloquea)');
  }

  // If blocked by development, need bbdWhy and bbdWho
  if (blockedByDevelopment) {
    if (!hasValidValue(afterData, 'bbdWhy')) missingFields.push('bbdWhy (motivo bloqueo desarrollo)');
    if (!hasValidValue(afterData, 'bbdWho')) missingFields.push('bbdWho (quién bloquea)');
  }

  if (missingFields.length > 0) {
    return {
      type: 'missing-blocked-fields',
      message: `Cannot change to "Blocked": missing required fields: ${missingFields.join(', ')}`,
      missingFields
    };
  }

  return null;
}

/**
 * Validate fields required to transition OUT of "To Do".
 * A task cannot change from "To Do" to any other status without all required fields.
 * @param {Object} afterData - Card data after the change
 * @param {string} toStatus - The target status
 * @returns {Object|null} - Error object or null if valid
 */
function validateLeavingToDo(afterData, toStatus) {
  const missingFields = REQUIRED_FIELDS_TO_LEAVE_TODO.filter(field => !hasValidValue(afterData, field));

  if (missingFields.length > 0) {
    // Make field names more user-friendly
    const friendlyNames = {
      'acceptanceCriteria': 'Acceptance Criteria',
      'devPoints': 'Dev Points',
      'businessPoints': 'Business Points',
      'epic': 'Epic',
      'sprint': 'Sprint',
      'developer': 'Developer',
      'validator': 'Validator',
      'title': 'Title'
    };

    const friendlyMissing = missingFields.map(f => friendlyNames[f] || f);

    return {
      type: 'missing-fields',
      message: `Cannot change to "${toStatus}": missing required fields: ${friendlyMissing.join(', ')}`,
      missingFields
    };
  }
  return null;
}

/**
 * Validate permission for "Done"/"Done&Validated" transition.
 * Allowed actors: validator, co-validator, SuperAdmin (isAppAdmin claim), system/MCP.
 * @param {Object} afterData - Card data after the change
 * @param {Object} stakeholdersData - Stakeholders data from Firebase
 * @param {Object} [options] - Optional { auth } for SuperAdmin check
 * @returns {Promise<Object|null>} - Error object or null if valid
 */
async function validateDoneTransitionPermission(afterData, stakeholdersData, options = {}) {
  const { validator: validatorId, coValidator: coValidatorId, updatedBy, status: afterStatus } = afterData;

  // Skip validation for system users
  if (!updatedBy || updatedBy.includes('mcp') || updatedBy.includes('system')) {
    return null;
  }

  const isValidator = isEmailMatchingStakeholder(updatedBy, validatorId, stakeholdersData);
  const isCoValidator = coValidatorId && isEmailMatchingStakeholder(updatedBy, coValidatorId, stakeholdersData);

  if (isValidator || isCoValidator) {
    return null;
  }

  // Check if user is SuperAdmin (isAppAdmin custom claim)
  if (options.auth && updatedBy.includes('@')) {
    try {
      const userRecord = await options.auth.getUserByEmail(updatedBy);
      const claims = userRecord.customClaims || {};
      if (claims.isAppAdmin === true) {
        return null;
      }
    } catch (_) {
      // User not found in Auth — continue to reject
    }
  }

  return {
    type: 'permission-denied',
    message: `Cannot change to "${afterStatus}": only the validator, co-validator, or SuperAdmin can mark tasks as done`,
    updatedBy,
    validatorId,
    coValidatorId
  };
}

/**
 * Validate status-date coupling rules.
 * - Any transition to "In Progress" must have a valid startDate
 *   (startDate is immutable once set, so we only require it exists — not that it changed)
 * - Any transition to "To Validate" must update endDate
 * @param {Object} beforeData - Card data before change
 * @param {Object} afterData - Card data after change
 * @param {string} afterStatus - Target status
 * @returns {Object|null}
 */
function validateStatusDateTransition(beforeData, afterData, afterStatus) {
  if (afterStatus === 'In Progress') {
    // startDate is immutable: once set, it should never change.
    // We only require that a valid startDate EXISTS after the transition,
    // not that it was updated in this specific write.
    if (!hasValidValue(afterData, 'startDate')) {
      return {
        type: 'missing-start-date',
        message: 'Cannot change to "In Progress": startDate is required.'
      };
    }
  }

  if (afterStatus === 'Pausado') {
    if (!hasValidValue(afterData, 'startDate')) {
      return {
        type: 'missing-start-date-for-pause',
        message: 'Cannot change to "Pausado": startDate must exist (task must have been In Progress).'
      };
    }
  }

  if (afterStatus === 'To Validate') {
    const beforeEnd = beforeData?.endDate || null;
    const afterEnd = afterData?.endDate || null;
    if (!hasValidValue(afterData, 'endDate') || beforeEnd === afterEnd) {
      return {
        type: 'missing-end-date-update',
        message: 'Cannot change to "To Validate": endDate must be updated in the same status change.'
      };
    }
  }

  return null;
}

/**
 * Resolve a developer/stakeholder ID (dev_XXX) to an email address.
 * Checks /users/ first, then falls back to /data/developers/.
 */
async function resolveEmailFromId(db, entityId) {
  if (!entityId) return null;

  // Check /users/ (iterate to find by developerId or stakeholderId)
  try {
    const usersSnap = await db.ref('/users').orderByChild('developerId').equalTo(entityId).limitToFirst(1).once('value');
    const users = usersSnap.val();
    if (users) {
      const firstUser = Object.values(users)[0];
      if (firstUser?.email) return firstUser.email;
    }
  } catch (_) { /* ignore */ }

  // Fallback: /data/developers/{id}/email
  try {
    const devSnap = await db.ref(`/data/developers/${entityId}/email`).once('value');
    if (devSnap.exists()) return devSnap.val();
  } catch (_) { /* ignore */ }

  return null;
}

// Valid statuses per card type (bugs come from shared/constants)
const VALID_TASK_STATUSES_LIST = ['To Do', 'In Progress', 'Pausado', 'To Validate', 'Done&Validated', 'Blocked', 'Reopened'];

/**
 * Validate bug status changes — reject task-only statuses on bugs.
 */
async function handleBugStatusValidation(params, beforeData, afterData, deps) {
  const { projectId, section, cardId } = params;
  const { db, logger } = deps;

  const afterStatus = afterData?.status;
  const beforeStatus = beforeData?.status;

  if (!afterStatus || afterStatus === beforeStatus) return null;

  // Skip revert writes
  if (afterData._validationReverted) return null;

  // Check if the status is valid for bugs
  if (!VALID_BUG_STATUSES_LIST.includes(afterStatus)) {
    logger.warn('onTaskStatusValidation: Invalid bug status, reverting', {
      projectId, cardId, invalidStatus: afterStatus, validStatuses: VALID_BUG_STATUSES_LIST
    });

    const cardPath = `/cards/${projectId}/${section}/${cardId}`;
    const revertData = {
      ...afterData,
      status: beforeStatus || 'Created',
      _validationReverted: true,
      _validationError: `Invalid bug status "${afterStatus}". Valid bug statuses: ${VALID_BUG_STATUSES_LIST.join(', ')}`
    };

    await db.ref(cardPath).set(revertData);

    // Notification + email (same pattern as task validation)
    if (afterData.updatedBy && afterData.updatedBy.includes('@')) {
      const sanitizedKey = sanitizeEmailForKey(afterData.updatedBy);
      const notificationRef = db.ref(`/notifications/${sanitizedKey}`).push();
      await notificationRef.set({
        id: notificationRef.key,
        title: 'Invalid bug status reverted',
        message: `Bug ${afterData.cardId || cardId}: "${afterStatus}" is not a valid bug status. Reverted to "${beforeStatus || 'Created'}".`,
        type: 'validation-error',
        projectId,
        taskId: afterData.cardId || cardId,
        url: `${getAppUrl()}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(afterData.cardId || cardId)}#bugs`,
        timestamp: Date.now(),
        read: false,
        data: { itemType: 'bug', action: 'validation-error', type: 'invalid-status', invalidStatus: afterStatus }
      });
    }

    // Queue email
    try {
      const { queueRevertEmail } = require('./email-queue.js');
      const devId = afterData.developer;
      if (devId) {
        const devEmail = await resolveEmailFromId(db, devId);
        if (devEmail) {
          await queueRevertEmail(db, {
            recipientEmail: devEmail,
            cardId: afterData.cardId || cardId,
            projectId,
            taskTitle: afterData.title || '',
            attemptedStatus: afterStatus,
            revertedToStatus: beforeStatus || 'Created',
            reason: `Invalid bug status "${afterStatus}". Valid: ${VALID_BUG_STATUSES_LIST.join(', ')}`
          });
        }
      }
    } catch { /* non-critical */ }

    return { reverted: true, error: { type: 'invalid-bug-status', message: `Invalid bug status: ${afterStatus}` } };
  }

  return null;
}

/**
 * Main handler for task status validation
 * @param {Object} params - { projectId, section, cardId }
 * @param {Object} beforeData - Card data before the change
 * @param {Object} afterData - Card data after the change
 * @param {Object} deps - Dependencies { db, logger, auth }
 * @returns {Object|null} - Result or null if no action needed
 */
async function handleTaskStatusValidation(params, beforeData, afterData, deps) {
  const { projectId, section, cardId } = params;
  const { db, logger, auth } = deps;

  // Validate bugs: reject task-only statuses on bug cards
  if (section.toLowerCase().startsWith('bugs_')) {
    return handleBugStatusValidation(params, beforeData, afterData, deps);
  }

  // Only process tasks below this point
  if (!section.toLowerCase().startsWith('tasks_')) {
    return null;
  }

  const beforeStatus = beforeData?.status;
  const afterStatus = afterData?.status;

  // No status change, nothing to validate
  if (beforeStatus === afterStatus) {
    return null;
  }

  // Skip validation for CF revert writes (prevent infinite loops).
  // When the CF reverts a change, it sets _validationReverted=true.
  // That revert write triggers this function again — without this guard,
  // the revert itself would fail validation and trigger another revert, ad infinitum.
  if (afterData._validationReverted) {
    logger.info('onTaskStatusValidation: Skipping validation for revert write', {
      projectId,
      cardId,
      revertedTo: afterStatus
    });
    return null;
  }

  logger.info('onTaskStatusValidation: Status change detected', {
    projectId,
    cardId,
    beforeStatus,
    afterStatus
  });

  const cardPath = `/cards/${projectId}/${section}/${cardId}`;
  let validationError = null;

  // Validation 1: Transitioning OUT of "To Do" requires ALL mandatory fields
  // This applies to ANY status change from "To Do" (In Progress, To Validate, etc.)
  const normalizedBeforeStatus = (beforeStatus || '').toLowerCase().replace(/\s+/g, '');
  if (normalizedBeforeStatus === 'todo' && afterStatus !== 'To Do') {
    validationError = validateLeavingToDo(afterData, afterStatus);
  }

  // Validation 2: Transition to "Blocked" requires blocker fields
  if (afterStatus === 'Blocked' && !validationError) {
    validationError = validateBlockedTransition(afterData);
  }

  // Validation 3: Coupled status-date transitions (In Progress/startDate, To Validate/endDate)
  if (!validationError) {
    validationError = validateStatusDateTransition(beforeData, afterData, afterStatus);
  }

  // Validation 4: Transition to "Done"/"Done&Validated" requires validator permission
  if (VALIDATOR_ONLY_STATUSES.includes(afterStatus) && !validationError) {
    const updatedBy = afterData.updatedBy;
    // Skip DB call for system users (optimization)
    if (updatedBy && !updatedBy.includes('mcp') && !updatedBy.includes('system')) {
      const stakeholdersSnap = await db.ref('/data/stakeholders').once('value');
      const stakeholdersData = stakeholdersSnap.val() || {};
      validationError = await validateDoneTransitionPermission(afterData, stakeholdersData, { auth });
    }
  }

  // If validation failed, revert the change and notify
  if (validationError) {
    logger.warn('onTaskStatusValidation: Validation failed, reverting change', {
      projectId,
      cardId,
      error: validationError
    });

    // Revert to previous status
    const revertData = {
      ...afterData,
      status: beforeStatus,
      _validationReverted: true,
      _validationError: validationError.message
    };

    await db.ref(cardPath).set(revertData);

    // Create notification for the user who made the change
    if (afterData.updatedBy && afterData.updatedBy.includes('@')) {
      const sanitizedKey = sanitizeEmailForKey(afterData.updatedBy);
      const notificationRef = db.ref(`/notifications/${sanitizedKey}`).push();

      await notificationRef.set({
        id: notificationRef.key,
        title: 'Error de validación',
        message: validationError.message,
        type: 'validation-error',
        projectId,
        taskId: afterData.cardId || cardId,
        url: `${getAppUrl()}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(afterData.cardId || cardId)}#tasks`,
        timestamp: Date.now(),
        read: false,
        data: {
          itemType: 'task',
          action: 'validation-error',
          ...validationError
        }
      });

      logger.info('onTaskStatusValidation: Notification sent', {
        recipient: afterData.updatedBy,
        error: validationError.type
      });
    }

    // Queue email notifications to developer and codeveloper
    try {
      const { queueRevertEmail } = require('./email-queue.js');
      const emailData = {
        cardId: afterData.cardId || cardId,
        projectId,
        taskTitle: afterData.title || '',
        attemptedStatus: afterStatus,
        revertedToStatus: beforeStatus,
        reason: validationError.message,
        missingFields: validationError.missingFields || []
      };

      // Resolve developer email from /users/ or /data/developers/
      const devId = afterData.developer;
      if (devId) {
        const devEmail = await resolveEmailFromId(db, devId);
        if (devEmail) {
          await queueRevertEmail(db, { ...emailData, recipientEmail: devEmail });
        }
      }

      // Also notify codeveloper if different from developer
      const coDevId = afterData.coDeveloper || afterData.codeveloper;
      if (coDevId && coDevId !== devId) {
        const coDevEmail = await resolveEmailFromId(db, coDevId);
        if (coDevEmail) {
          await queueRevertEmail(db, { ...emailData, recipientEmail: coDevEmail });
        }
      }

      logger.info('onTaskStatusValidation: Revert emails queued', {
        cardId: emailData.cardId,
        developer: devId,
        codeveloper: coDevId
      });
    } catch (emailErr) {
      logger.warn('onTaskStatusValidation: Failed to queue revert email', {
        error: emailErr.message
      });
    }

    return { reverted: true, error: validationError };
  }

  return null;
}

module.exports = {
  handleTaskStatusValidation,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  VALIDATOR_ONLY_STATUSES,
  isEmailMatchingStakeholder,
  hasValidValue
};

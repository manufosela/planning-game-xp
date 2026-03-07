/**
 * Firebase Functions for PlanningGameXP
 * 
 * Weekly Task Summary Email Function
 * Sends weekly task summaries every Monday to project team members
 */

const functions = require("firebase-functions/v1");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onValueCreated, onValueUpdated, onValueWritten} = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const {initializeApp} = require("firebase-admin/app");
const {getDatabase} = require("firebase-admin/database");
const {getMessaging} = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");
const {defineSecret} = require("firebase-functions/params");
const axios = require("axios");
const fs = require("node:fs");
const path = require("node:path");

const { handleCardToValidate } = require("./handlers/on-card-to-validate");
const { handleBugFixed } = require("./handlers/on-bug-fixed");
const { handleHourlyDigest } = require("./handlers/hourly-validation-digest");
const { handleTaskStatusValidation } = require("./handlers/on-task-status-validation");
const { handleSyncCardViews } = require("./handlers/sync-card-views");
const { handlePortalBugResolved } = require("./handlers/on-portal-bug-resolved");
const { handleTaskReopen } = require("./handlers/on-task-reopen");
const { handleTaskDoneValidated } = require("./handlers/on-task-done-validated");

// Shared utilities — used by handlers, imported here only for re-export if needed
// (handlers import their own deps directly)

// Handlers (extracted from this file)
const { handlePushNotification } = require('./handlers/push-notification');
const { handleDemoCleanup } = require('./handlers/demo-cleanup');
const { handleRequestEmailAccess, handleProvisionDemoData, handleSetEncodedEmailClaim } = require('./handlers/auth-provisioning');
const { handleWeeklyEmail } = require('./handlers/weekly-email');
const { getGraphAccessToken: _getGraphAccessToken, sendEmail: _sendEmail } = require('./shared/ms-graph.cjs');

// IA handlers (extracted from this file during monolith refactor)
const { handleGenerateAcceptanceCriteria } = require('./handlers/ia-acceptance-criteria');
const { handleAnalyzeBugDescription } = require('./handlers/ia-bug-analysis');
const { handleGetIaContext } = require('./handlers/ia-context');
const { handleCreateCard } = require('./handlers/ia-create-card');
const { handleCreateTasksFromPlan, handleRegenerateTasksFromPlan, inferEpicsForPhases, createEpicForPlan } = require('./handlers/ia-plan-tasks');
const { handleParseDocumentForCards } = require('./handlers/ia-document-parser');
const { handleGenerateDevPlan } = require('./handlers/ia-dev-plan');
const { handleConvertDescriptionToUserStory } = require('./handlers/ia-user-story');
const { handleGetProjectEpics } = require('./handlers/ia-epics-api');

// Admin handlers (extracted from this file)
const { handleResyncAllViews } = require('./handlers/admin-views');
const { handleSyncAllAppAdminClaims, handleAddAppAdmin, handleRemoveAppAdmin, handleAddAppUploader, handleRemoveAppUploader, handleSyncAppAdminClaim, handleSyncUserAllowedClaim, handleUpdateAppPermissions, handleSyncAppPermissionsClaim } = require('./handlers/admin-permissions');
const { handleListUsers, handleCreateOrUpdateUser, handleRemoveUserFromProject, handleDeleteUser } = require('./handlers/admin-users');

// Demo mode: when DEMO_MODE=true, all new users are auto-allowed with role=demo.
// Read from process.env first, then fall back to reading functions/.env directly
// (Firebase CLI may not inject .env vars during module analysis phase).
function readDemoMode() {
  const envVal = (process.env.DEMO_MODE || '').toString().trim().toLowerCase();
  if (envVal === 'true') return true;
  if (envVal) return false;
  // Fallback: read from functions/.env file directly
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envContent.match(/^DEMO_MODE\s*=\s*(.+)$/m);
    if (match) return match[1].trim().toLowerCase() === 'true';
  } catch (_) { /* .env not found, not demo mode */ }
  return false;
}
const DEMO_MODE = readDemoMode();

/**
 * Read MS_EMAIL_ENABLED from env or functions/.env.
 * Defaults to true for backwards compatibility.
 * Set MS_EMAIL_ENABLED=false in instances that don't use Microsoft Auth.
 */
function readMsEmailEnabled() {
  const envVal = (process.env.MS_EMAIL_ENABLED || '').toString().trim().toLowerCase();
  if (envVal === 'false') return false;
  if (envVal) return true;
  // Fallback: read from functions/.env file directly
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envContent.match(/^MS_EMAIL_ENABLED\s*=\s*(.+)$/m);
    if (match) return match[1].trim().toLowerCase() !== 'false';
  } catch (_) { /* .env not found, MS email enabled by default */ }
  return true;
}
const MS_EMAIL_ENABLED = readMsEmailEnabled();

// normalizeEmail, extractEmails → shared/email-utils.cjs

// Initialize Firebase Admin
initializeApp();

const firestore = admin.firestore();

// Primary RTDB (default project / env)
const primaryDb = getDatabase();

// Optional secondary RTDB (e.g., tests) via env var IA_SECONDARY_DATABASE_URL
let secondaryDb = null;
const secondaryDbUrl = process.env.IA_SECONDARY_DATABASE_URL || process.env.SECONDARY_DATABASE_URL;
if (secondaryDbUrl) {
  try {
    const secondaryApp = admin.initializeApp({databaseURL: secondaryDbUrl}, 'secondary');
    secondaryDb = getDatabase(secondaryApp);
  } catch (err) {
    logger.error('Failed to init secondary RTDB', { error: err });
  }
}

const ACCOUNT_REQUESTS_COLLECTION = 'accountRequests';
const ALLOWED_SIGNUP_EMAIL_DOMAINS = (process.env.PUBLIC_ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map(d => d.trim())
  .filter(Boolean);

// Define secrets (skipped in DEMO_MODE; MS secrets also skipped when MS_EMAIL_ENABLED=false)
let msClientId, msClientSecret, msTenantId, msFromEmail, msAlertEmail;
let IA_GLOBAL_ENABLE, IA_API_KEY, CREATE_CARD_API_KEY;
if (!DEMO_MODE) {
  if (MS_EMAIL_ENABLED) {
    msClientId = defineSecret("MS_CLIENT_ID");
    msClientSecret = defineSecret("MS_CLIENT_SECRET");
    msTenantId = defineSecret("MS_TENANT_ID");
    msFromEmail = defineSecret("MS_FROM_EMAIL");
    msAlertEmail = defineSecret("MS_ALERT_EMAIL");
  }
  IA_GLOBAL_ENABLE = defineSecret("IA_GLOBAL_ENABLE");
  IA_API_KEY = defineSecret("IA_API_KEY");
  CREATE_CARD_API_KEY = defineSecret("CREATE_CARD_API_KEY");
}

// getMsalConfig, getGraphAccessToken, sendEmail → shared/ms-graph.cjs
// Thin wrappers that resolve secrets and inject deps.
// Only available when MS_EMAIL_ENABLED=true (and not DEMO_MODE).

let getGraphAccessToken, sendEmail;
if (MS_EMAIL_ENABLED && !DEMO_MODE) {
  getGraphAccessToken = () => _getGraphAccessToken({
    msClientId: msClientId.value(),
    msClientSecret: msClientSecret.value(),
    msTenantId: msTenantId.value(),
    logger
  });

  sendEmail = (accessToken, toEmails, subject, htmlContent) => _sendEmail(
    accessToken, toEmails, subject, htmlContent, {
      msFromEmail: msFromEmail.value(),
      msAlertEmail: msAlertEmail.value(),
      logger
    }
  );
}

// generateEmailTemplate, analyzeTasks, analyzeAllPendingTasks, addTaskToUserMap,
// processTasksForUserMap, buildUserTaskMap, generateConsolidatedEmailTemplate,
// notifyAdminMissingConfiguration, hasReportableIssues, sendTeamSummaryEmail,
// sendStakeholderValidationEmail, processProjectForWeeklySummary,
// sendWeeklyTaskSummaryLegacy, sendWeeklyTaskSummaryPerUser,
// sendWeeklyTaskSummary -> handlers/weekly-email.js

/**
 * Email functions - Skipped in DEMO_MODE or when MS_EMAIL_ENABLED=false
 */
if (!DEMO_MODE && MS_EMAIL_ENABLED) {

// weeklyTaskSummary, testWeeklyTaskSummary -> handlers/weekly-email.js
const weeklyEmailDeps = () => ({
  db: getDatabase(),
  logger,
  getGraphAccessToken,
  sendEmail
});

exports.weeklyTaskSummary = onSchedule({
  schedule: "0 9 * * 1", // Every Monday at 9:00 AM
  timeZone: "Europe/Madrid",
  region: "europe-west1",
  secrets: [msClientId, msClientSecret, msTenantId, msFromEmail, msAlertEmail]
}, async (event) => {
  return handleWeeklyEmail(weeklyEmailDeps());
});

exports.testWeeklyTaskSummary = onRequest({
  region: "europe-west1",
  secrets: [msClientId, msClientSecret, msTenantId, msFromEmail, msAlertEmail]
}, async (req, res) => {
  try {
    const filterEmail = req.query.email || null;
    if (filterEmail) {
      logger.info(`Test triggered with email filter: ${filterEmail}`);
    }
    const result = await handleWeeklyEmail(weeklyEmailDeps(), filterEmail);
    res.json(result);
  } catch (error) {
    logger.error('Error in test function:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Scheduled function - runs every hour to send consolidated digest emails
 * Replaces immediate per-card emails with hourly batched summaries.
 */
exports.hourlyValidationDigest = onSchedule({
  schedule: "0 * * * *", // Every hour at minute 0
  timeZone: "Europe/Madrid",
  region: "europe-west1",
  secrets: [msClientId, msClientSecret, msTenantId, msFromEmail, msAlertEmail]
}, async (event) => {
  const db = getDatabase();
  return handleHourlyDigest({
    db,
    getAccessToken: getGraphAccessToken,
    sendEmail,
    logger
  });
});

/**
 * HTTP trigger for manual testing of the hourly digest
 * Supports optional ?email=user@example.com parameter to filter and only send to that email
 */
exports.testHourlyDigest = onRequest({
  region: "europe-west1",
  secrets: [msClientId, msClientSecret, msTenantId, msFromEmail, msAlertEmail]
}, async (req, res) => {
  try {
    const filterEmail = req.query.email || null;
    if (filterEmail) {
      logger.info(`Hourly digest test triggered with email filter: ${filterEmail}`);
    }
    const db = getDatabase();
    const result = await handleHourlyDigest({
      db,
      getAccessToken: getGraphAccessToken,
      sendEmail,
      logger
    }, filterEmail);
    res.json(result);
  } catch (error) {
    logger.error('Error in hourly digest test function:', error);
    res.status(500).json({ error: error.message });
  }
});
} // end if (!DEMO_MODE && MS_EMAIL_ENABLED) — email functions

// ============================================================================
// DEMO CLEANUP - Remove inactive demo users and their data
// ============================================================================

// cleanupInactiveDemoUsers → handlers/demo-cleanup.js
const demoCleanupDeps = () => ({ db: admin.database(), auth: admin.auth(), logger, demoMode: DEMO_MODE });

exports.cleanupDemoUsers = onSchedule({
  schedule: '0 3 * * *',
  timeZone: 'Europe/Madrid',
  region: 'europe-west1',
}, async () => handleDemoCleanup(demoCleanupDeps()));

exports.testCleanupDemoUsers = onRequest({
  region: 'europe-west1',
}, async (req, res) => {
  try {
    const result = await handleDemoCleanup(demoCleanupDeps());
    res.json(result);
  } catch (error) {
    logger.error('Error in testCleanupDemoUsers:', error);
    res.status(500).json({ error: error.message });
  }
});

// sendPushNotification → handlers/push-notification.js
exports.sendPushNotification = onValueCreated({
  ref: "/notifications/{userId}/{notificationId}",
  region: "europe-west1",
}, async (event) => {
  return handlePushNotification(
    event.params,
    event.data.val(),
    { db: getDatabase(), messaging: getMessaging(), logger }
  );
});

// requestEmailAccess → handlers/auth-provisioning.js
exports.requestEmailAccess = functions.region('europe-west1').https.onCall(async (data, context) => {
  return handleRequestEmailAccess(data, {
    admin, firestore, logger, DEMO_MODE, ALLOWED_SIGNUP_EMAIL_DOMAINS, ACCOUNT_REQUESTS_COLLECTION
  });
});

// provisionDemoData, setEncodedEmailClaim → handlers/auth-provisioning.js
const provisionDemoData = (email, encodedEmail) =>
  handleProvisionDemoData(email, encodedEmail, { db: admin.database(), logger });

exports.setEncodedEmailClaim = functions.region('europe-west1').auth.user().onCreate(async (user) => {
  return handleSetEncodedEmailClaim(user, {
    admin, db: admin.database(), logger, DEMO_MODE, provisionDemoData
  });
});

/**
 * Verify IA availability and get API key
 */
function getIaApiKey() {
  const globalIaEnabled = (IA_GLOBAL_ENABLE.value() || '').toString().trim().toLowerCase() !== 'false';
  if (!globalIaEnabled) {
    throw new HttpsError('failed-precondition', 'IA no disponible globalmente.');
  }

  const apiKey = IA_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'IA API key no configurada.');
  }

  return apiKey;
}

/**
 * Check if IA is globally enabled (for handlers that receive iaEnabled as dep).
 */
function isIaEnabled() {
  return (IA_GLOBAL_ENABLE.value() || '').toString().trim().toLowerCase() !== 'false';
}

// ============================================================================
// IA + API functions — skipped in DEMO_MODE (no secrets available)
// All handler logic extracted to functions/handlers/ia-*.js
// ============================================================================
if (!DEMO_MODE) {

/**
 * Generate acceptance criteria for a task using IA.
 */
exports.generateAcceptanceCriteria = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  return handleGenerateAcceptanceCriteria(request, {
    db: primaryDb,
    logger,
    apiKey: getIaApiKey()
  });
});

// ============================================================================
// BUG DESCRIPTION ANALYSIS AND ACCEPTANCE CRITERIA → handlers/ia-bug-analysis.js
// ============================================================================

exports.analyzeBugDescription = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  return handleAnalyzeBugDescription(request, {
    db: primaryDb,
    logger,
    apiKey: getIaApiKey(),
    iaEnabled: isIaEnabled()
  });
});

// ============================================================================
// IA CONTEXT → handlers/ia-context.js
// ============================================================================

exports.getIaContext = onRequest({
  region: "europe-west1",
  cors: true,
  secrets: [IA_GLOBAL_ENABLE]
}, async (req, res) => {
  return handleGetIaContext(req, res, {
    primaryDb,
    secondaryDb,
    logger,
    iaEnabled: isIaEnabled()
  });
});

// ============================================================================
// CREATE CARD API → handlers/ia-create-card.js
// ============================================================================

exports.createCard = onRequest({
  region: "europe-west1",
  cors: true,
  secrets: [CREATE_CARD_API_KEY]
}, async (req, res) => {
  return handleCreateCard(req, res, {
    db: getDatabase(),
    firestore,
    logger,
    apiKeyValue: CREATE_CARD_API_KEY.value()
  });
});


// ============================================================================
// CREATE TASKS FROM PLAN → handlers/ia-plan-tasks.js
// ============================================================================

exports.createTasksFromPlan = onCall({
  region: "europe-west1",
  memory: "256MiB",
  timeoutSeconds: 60
}, async (request) => {
  return handleCreateTasksFromPlan(request, {
    db: getDatabase(),
    firestore,
    logger
  });
});

exports.regenerateTasksFromPlan = onCall({
  region: "europe-west1",
  memory: "256MiB",
  timeoutSeconds: 60
}, async (request) => {
  return handleRegenerateTasksFromPlan(request, {
    db: getDatabase(),
    firestore,
    logger
  });
});

// ============================================================================
// PARSE DOCUMENT FOR CARDS → handlers/ia-document-parser.js
// ============================================================================

exports.parseDocumentForCards = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  return handleParseDocumentForCards(request, {
    db: primaryDb,
    logger,
    apiKey: getIaApiKey(),
    iaEnabled: isIaEnabled()
  });
});

// ============================================================================
// GENERATE DEV PLAN → handlers/ia-dev-plan.js
// ============================================================================

exports.generateDevPlan = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  return handleGenerateDevPlan(request, {
    db: primaryDb,
    logger,
    apiKey: getIaApiKey(),
    iaEnabled: isIaEnabled()
  });
});

// ============================================================================
// CONVERT DESCRIPTION TO USER STORY → handlers/ia-user-story.js
// ============================================================================

exports.convertDescriptionToUserStory = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  return handleConvertDescriptionToUserStory(request, {
    logger,
    apiKey: getIaApiKey(),
    iaEnabled: isIaEnabled()
  });
});

// ============================================================================
// GET PROJECT EPICS API → handlers/ia-epics-api.js
// ============================================================================

exports.getProjectEpics = onRequest({
  region: "europe-west1",
  cors: true,
  secrets: [CREATE_CARD_API_KEY]
}, async (req, res) => {
  return handleGetProjectEpics(req, res, {
    db: getDatabase(),
    logger,
    apiKeyValue: CREATE_CARD_API_KEY.value()
  });
});

// Export internal functions for testing
exports._test = {
  inferEpicsForPhases,
  createEpicForPlan
};

} // end if (!DEMO_MODE) — IA + API functions

// ============================================================================
// DATABASE TRIGGER HANDLERS
// ============================================================================

/**
 * Cloud Function: onCardToValidate
 * Triggers when a card is updated, creates push notifications
 * and queues email for hourly digest when task transitions to "To Validate".
 */
exports.onCardToValidate = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  return handleCardToValidate(
    { projectId, section, cardId },
    event.data.before.val(),
    event.data.after.val(),
    { db: getDatabase(), logger }
  );
});

/**
 * Cloud Function: onBugFixed
 * Triggers when a bug is updated, creates push notifications
 * and queues email for hourly digest when a bug transitions to "Fixed".
 */
exports.onBugFixed = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  return handleBugFixed(
    { projectId, section, cardId },
    event.data.before.val(),
    event.data.after.val(),
    { db: getDatabase(), logger }
  );
});

/**
 * Cloud Function: onPortalBugResolved
 * Notifies the Portal de Incidencias when a bug transitions to "Fixed" or "Verified".
 * Skipped in DEMO_MODE (no Portal integration needed).
 */
if (!DEMO_MODE) {
exports.onPortalBugResolved = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1",
  secrets: [CREATE_CARD_API_KEY]
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  return handlePortalBugResolved(
    { projectId, section, cardId },
    event.data.before.val(),
    event.data.after.val(),
    { axios, apiKey: CREATE_CARD_API_KEY.value(), logger }
  );
});
}

/**
 * Cloud Function: onTaskStatusValidation
 * Validates task status transitions and reverts invalid changes.
 */
exports.onTaskStatusValidation = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  return handleTaskStatusValidation(
    { projectId, section, cardId },
    event.data.before.val(),
    event.data.after.val(),
    { db: getDatabase(), logger, auth: admin.auth() }
  );
});

/**
 * Cloud Function: onTaskDoneValidated
 * Recalculates effectiveHours when a task transitions to Done&Validated
 * and both timestamps are estimated (default times).
 */
exports.onTaskDoneValidated = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  return handleTaskDoneValidated(
    { projectId, section, cardId },
    event.data.before.val(),
    event.data.after.val(),
    { db: getDatabase(), logger }
  );
});

/**
 * Cloud Function: onTaskReopen
 * Manages time accumulation when tasks are reopened.
 * Archives work periods and calculates total effective hours.
 */
exports.onTaskReopen = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  return handleTaskReopen(
    { projectId, section, cardId },
    event.data.before.val(),
    event.data.after.val(),
    { db: getDatabase(), logger }
  );
});

/**
 * Cloud Function: syncCardViews
 * Syncs card data to optimized views for reduced data transfer (~70-80%).
 */
exports.syncCardViews = onValueWritten({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  return handleSyncCardViews(
    { projectId, section, cardId },
    event.data.before?.val() || null,
    event.data.after?.val() || null,
    { db: getDatabase(), logger }
  );
});

// ============================================================================
// ADMIN FUNCTIONS — Views, Permissions, Users
// All handler logic extracted to functions/handlers/admin-*.js
// ============================================================================

/**
 * Cloud Function: resyncAllViews
 * Re-generates all /views entries from /cards data.
 */
exports.resyncAllViews = onCall({
  region: "europe-west1",
  timeoutSeconds: 120
}, async (request) => {
  return handleResyncAllViews(request, {
    db: getDatabase(),
    logger,
    handleSyncCardViews
  });
});

/**
 * Cloud Function: syncAllAppAdminClaims
 * Syncs isAppAdmin custom claim for all entries in /data/appAdmins.
 */
exports.syncAllAppAdminClaims = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleSyncAllAppAdminClaims(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: addAppAdmin
 * Adds a new appAdmin to /data/appAdmins.
 */
exports.addAppAdmin = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleAddAppAdmin(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: removeAppAdmin
 * Removes an appAdmin from /data/appAdmins.
 */
exports.removeAppAdmin = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleRemoveAppAdmin(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: addAppUploader
 * Adds an app uploader for a specific project.
 */
exports.addAppUploader = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleAddAppUploader(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: removeAppUploader
 * Removes an app uploader from a specific project.
 */
exports.removeAppUploader = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleRemoveAppUploader(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: syncAppAdminClaim
 * Trigger: syncs isAppAdmin custom claim when /data/appAdmins changes.
 */
exports.syncAppAdminClaim = onValueWritten({
  ref: "/data/appAdmins/{encodedEmail}",
  region: "europe-west1"
}, async (event) => {
  return handleSyncAppAdminClaim(
    event.params,
    event.data.before?.val(),
    event.data.after?.val(),
    { admin, db: getDatabase(), logger }
  );
});

/**
 * Cloud Function: syncUserAllowedClaim
 * Trigger: syncs allowed custom claim when /users/{email}/projects changes.
 */
exports.syncUserAllowedClaim = onValueWritten({
  ref: "/users/{encodedEmail}/projects/{projectId}",
  region: "europe-west1"
}, async (event) => {
  return handleSyncUserAllowedClaim(
    event.params,
    event.data.before?.val(),
    event.data.after?.val(),
    { admin, db: getDatabase(), logger }
  );
});

/**
 * Cloud Function: listUsers
 * Returns all users from /users/ enriched with Auth status.
 */
exports.listUsers = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleListUsers(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: createOrUpdateUser
 * Creates or updates a user in /users/{encodedEmail}.
 */
exports.createOrUpdateUser = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleCreateOrUpdateUser(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: removeUserFromProject
 * Removes a user's assignment from a specific project.
 */
exports.removeUserFromProject = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleRemoveUserFromProject(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: deleteUser
 * Deletes a user from /users/ and cleans up legacy paths.
 */
exports.deleteUser = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleDeleteUser(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: updateAppPermissions
 * Updates app permissions for a user in a specific project.
 */
exports.updateAppPermissions = onCall({
  region: "europe-west1"
}, async (request) => {
  return handleUpdateAppPermissions(request, {
    admin,
    db: getDatabase(),
    logger
  });
});

/**
 * Cloud Function: syncAppPermissionsClaim
 * Trigger: rebuilds compact appPerms claim from all project appPermissions.
 */
exports.syncAppPermissionsClaim = onValueWritten({
  ref: "/users/{encodedEmail}/projects",
  region: "europe-west1"
}, async (event) => {
  return handleSyncAppPermissionsClaim(
    event.params,
    event.data.before?.val(),
    event.data.after?.val(),
    { admin, db: getDatabase(), logger }
  );
});

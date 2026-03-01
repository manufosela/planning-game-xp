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
const {ConfidentialClientApplication} = require("@azure/msal-node");
const fs = require("node:fs");
const path = require("node:path");

const { handleCardToValidate } = require("./handlers/on-card-to-validate");
const { handleBugFixed } = require("./handlers/on-bug-fixed");
const { handleHourlyDigest } = require("./handlers/hourly-validation-digest");
const { handleTaskStatusValidation } = require("./handlers/on-task-status-validation");
const { handleSyncCardViews } = require("./handlers/sync-card-views");
const { handlePortalBugResolved } = require("./handlers/on-portal-bug-resolved");
const { extractKeywords, findBestEpicMatch } = require("./helpers/epic-inference");

const normalizeEmail = (email) => (email || '').toString().trim().toLowerCase();

const extractEmails = (rawData, directory = {}) => {
  const emails = new Set();
  const addEmail = (value) => {
    if (!value) return;
    if (typeof value === 'string' && value.includes('@')) {
      emails.add(normalizeEmail(value));
      return;
    }
    if (typeof value === 'object') {
      const candidate = value.id || value.email || value.mail || value.value;
      if (typeof candidate === 'string' && candidate.includes('@')) {
        emails.add(normalizeEmail(candidate));
        return;
      }
      if (typeof candidate === 'string' && directory[candidate]?.email) {
        emails.add(normalizeEmail(directory[candidate].email));
        return;
      }
    }
    if (typeof value === 'string' && directory[value]?.email) {
      emails.add(normalizeEmail(directory[value].email));
    }
  };

  if (Array.isArray(rawData)) {
    rawData.forEach(addEmail);
  } else if (rawData && typeof rawData === 'object') {
    Object.values(rawData).forEach(addEmail);
  }

  return Array.from(emails);
};

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

// Define secrets for Azure AD configuration
const msClientId = defineSecret("MS_CLIENT_ID");
const msClientSecret = defineSecret("MS_CLIENT_SECRET");
const msTenantId = defineSecret("MS_TENANT_ID");
const msFromEmail = defineSecret("MS_FROM_EMAIL");
const msAlertEmail = defineSecret("MS_ALERT_EMAIL"); // Email address for system alerts (e.g. localhost URL detection)
const IA_GLOBAL_ENABLE = defineSecret("IA_GLOBAL_ENABLE"); // optional: 'true'/'false'
const IA_API_KEY = defineSecret("IA_API_KEY");
const CREATE_CARD_API_KEY = defineSecret("CREATE_CARD_API_KEY"); // API Key for creating cards programmatically

let cachedGlobalAgents = null;
function getGlobalAgentsContent() {
  if (cachedGlobalAgents !== null) return cachedGlobalAgents;
  try {
    const candidatePaths = [
      path.join(__dirname, "..", "AGENTS.md"),
      path.join(__dirname, "AGENTS.md")
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        cachedGlobalAgents = fs.readFileSync(p, "utf8");
        break;
      }
    }
    if (cachedGlobalAgents === null) {
      cachedGlobalAgents = "";
    }
  } catch (error_) {
    logger.warn('Could not load global agents file', { error: error_.message });
    cachedGlobalAgents = "";
  }
  return cachedGlobalAgents;
}

function buildAcceptanceText(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return '';
  }
  const parts = scenarios.map((scenario, index) => {
    const givenParts = (scenario.given || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const thenParts = (scenario.then || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

    const givenLines = givenParts.map((line, idx) => idx === 0 ? `Dado ${line}` : `Y ${line}`);
    const thenLines = thenParts.map((line, idx) => idx === 0 ? `Entonces ${line}` : `Y ${line}`);
    const whenLine = scenario.when ? `Cuando ${scenario.when}` : '';

    const allLines = [...givenLines, whenLine, ...thenLines].filter(Boolean);
    const title = scenarios.length > 1 ? `Escenario ${index + 1}:\n` : '';
    return `${title}${allLines.join('\n')}`;
  });
  return parts.filter(Boolean).join('\n\n');
}

function buildUserStoryText(task) {
  const entry = Array.isArray(task.descriptionStructured)
    ? (task.descriptionStructured[0] || {})
    : (task.descriptionStructured || {});
  const role = entry.role || '';
  const goal = entry.goal || '';
  const benefit = entry.benefit || '';
  const legacy = entry.legacy || '';

  const pieces = [
    role ? `Como ${role}` : '',
    goal ? `Quiero ${goal}` : '',
    benefit ? `Para ${benefit}` : ''
  ].filter(Boolean);
  if (pieces.length > 0) {
    return pieces.join('\n');
  }
  if (legacy) return legacy;
  return task.description || '';
}

/**
 * MS Graph API configuration using Firebase Functions v2 secrets
 * Set secrets using: firebase functions:secrets:set MS_CLIENT_ID
 */
function getMsalConfig() {
  return {
    auth: {
      clientId: msClientId.value(),
      clientSecret: msClientSecret.value(),
      authority: `https://login.microsoftonline.com/${msTenantId.value()}`
    }
  };
}

// Initialize MSAL client - will be created in functions that need it

/**
 * Get MS Graph API access token
 */
async function getGraphAccessToken() {
  try {
    const msalConfig = getMsalConfig();
    const cca = new ConfidentialClientApplication(msalConfig);
    
    const clientCredentialRequest = {
      scopes: ['https://graph.microsoft.com/.default']
    };
    
    const response = await cca.acquireTokenByClientCredential(clientCredentialRequest);
    return response.accessToken;
  } catch (error) {
    logger.error('Error getting MS Graph access token:', error);
    throw error;
  }
}

/**
 * Send email using MS Graph API
 */
async function sendEmail(accessToken, toEmails, subject, htmlContent) {
  // Block email sending on emulator to prevent localhost URLs and test noise
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    logger.info(`[EMULATOR] Email blocked — to: ${toEmails.join(', ')}, subject: "${subject}"`);
    return;
  }

  // Guard: block emails containing localhost URLs in production and alert IT
  if (htmlContent.includes('localhost')) {
    const alertSubject = '[ALERTA] Cloud Function intentó enviar email con localhost';
    const alertBody = `<p>Una Cloud Function intentó enviar un email con URLs localhost en producción.</p>
      <p><strong>Destinatarios originales:</strong> ${toEmails.join(', ')}</p>
      <p><strong>Asunto original:</strong> ${subject}</p>
      <p><strong>PUBLIC_APP_URL actual:</strong> ${process.env.PUBLIC_APP_URL || '(no definida)'}</p>
      <p>El email original fue bloqueado. Revisar la configuración de <code>functions/.env</code>.</p>`;

    logger.error(`Email blocked: contains localhost URLs. Subject: "${subject}", to: ${toEmails.join(', ')}`);

    try {
      const alertData = {
        message: {
          subject: alertSubject,
          body: { contentType: 'HTML', content: alertBody },
          toRecipients: [{ emailAddress: { address: msAlertEmail.value() || msFromEmail.value() } }]
        },
        saveToSentItems: true
      };
      await axios.post(
        `https://graph.microsoft.com/v1.0/users/${msFromEmail.value()}/sendMail`,
        alertData,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      logger.info(`Alert email sent to ${msAlertEmail.value() || msFromEmail.value()}`);
    } catch (alertError) {
      logger.error('Failed to send alert email:', alertError.message);
    }

    throw new Error('Email blocked: contains localhost URLs. Alert sent to IT.');
  }

  try {
    const emailData = {
      message: {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: htmlContent
        },
        toRecipients: toEmails.map(email => ({
          emailAddress: { address: email }
        }))
      },
      saveToSentItems: true
    };

    await axios.post(
      `https://graph.microsoft.com/v1.0/users/${msFromEmail.value()}/sendMail`,
      emailData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`Email sent successfully to: ${toEmails.join(', ')}`);
  } catch (error) {
    logger.error('Error sending email:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Generate HTML email template for task summary
 */
function generateEmailTemplate(projectName, taskSummary) {
  const {
    todoTasks,
    inProgressTasks,
    incompleteCompletedTasks,
    blockedTasks,
    toValidateTasks,
    sprintSummary
  } = taskSummary;

  const formatTaskList = (tasks, includeReason = false) => {
    if (!tasks || tasks.length === 0) {
      return '<li style="color: #28a745;">Ninguna tarea pendiente ✅</li>';
    }
    
    return tasks.map(task => `
      <li>
        <strong>${task.title || 'Sin título'}</strong>
        ${task.sprint ? `<span style="color: #6c757d;">[Sprint: ${task.sprint}]</span>` : ''}
        ${task.developer ? `<span style="color: #007bff;">[Dev: ${task.developer}]</span>` : ''}
        ${includeReason && task.blockReason ? `<br><em style="color: #dc3545;">Razón: ${task.blockReason}</em>` : ''}
        ${task.missingFields ? `<br><em style="color: #ffc107;">Campos faltantes: ${task.missingFields.join(', ')}</em>` : ''}
      </li>
    `).join('');
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resumen Semanal de Tareas - ${projectName}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f8f9fa; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 10px 10px 0 0; }
            .project-name { font-size: 24px; font-weight: bold; margin: 0; }
            .date { font-size: 14px; opacity: 0.9; margin-top: 5px; }
            .section { margin-bottom: 25px; }
            .section-title { color: #495057; font-size: 18px; font-weight: bold; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #e9ecef; }
            .task-list { margin: 0; padding-left: 20px; }
            .task-list li { margin-bottom: 8px; }
            .sprint-summary { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .footer { text-align: center; color: #6c757d; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; }
            .status-badge { padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
            .status-todo { background: #ffc107; color: #000; }
            .status-progress { background: #17a2b8; color: white; }
            .status-blocked { background: #dc3545; color: white; }
            .status-validate { background: #6f42c1; color: white; }
            .no-issues { color: #28a745; font-style: italic; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="project-name">📊 Resumen Semanal - ${projectName}</div>
                <div class="date">Generado el: ${new Date().toLocaleDateString('es-ES', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</div>
            </div>

            <div class="sprint-summary">
                <h3>📈 Resumen de Sprints Anteriores</h3>
                <p>Este reporte incluye tareas de sprints que ya deberían estar completados pero aún tienen pendientes.</p>
                ${sprintSummary ? `<p><strong>Sprints analizados:</strong> ${sprintSummary.join(', ')}</p>` : ''}
            </div>

            <div class="section">
                <div class="section-title">⏳ Tareas Sin Comenzar <span class="status-badge status-todo">TODO</span></div>
                <ul class="task-list">
                    ${formatTaskList(todoTasks)}
                </ul>
            </div>

            <div class="section">
                <div class="section-title">🔄 Tareas En Progreso <span class="status-badge status-progress">IN PROGRESS</span></div>
                <ul class="task-list">
                    ${formatTaskList(inProgressTasks)}
                </ul>
            </div>

            <div class="section">
                <div class="section-title">⚠️ Tareas "Completadas" con Datos Faltantes <span class="status-badge status-todo">DONE</span></div>
                <ul class="task-list">
                    ${formatTaskList(incompleteCompletedTasks)}
                </ul>
            </div>

            <div class="section">
                <div class="section-title">🚫 Tareas Bloqueadas <span class="status-badge status-blocked">BLOCKED</span></div>
                <ul class="task-list">
                    ${formatTaskList(blockedTasks, true)}
                </ul>
            </div>

            ${toValidateTasks && toValidateTasks.length > 0 ? `
            <div class="section">
                <div class="section-title">✅ Tareas Esperando Validación <span class="status-badge status-validate">TO VALIDATE</span></div>
                <ul class="task-list">
                    ${formatTaskList(toValidateTasks)}
                </ul>
                <p><em>Nota: Este correo se envía específicamente a los stakeholders para revisión.</em></p>
            </div>
            ` : ''}

            <div class="footer">
                <p>Este es un correo automático generado por el sistema PlanningGameXP.</p>
                <p>Para consultas contacta con el equipo de desarrollo.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

function buildBranchName(taskId, title) {
  const slug = (title || '')
    .toString()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '').replace(/-+$/, '') // NOSONAR - simple non-capturing patterns
    .slice(0, 40);
  const normalizedId = (taskId || '').toString().replaceAll(/\s+/g, '');
  const slugSuffix = slug ? `-${slug}` : '';
  return `feature/${normalizedId}${slugSuffix}`;
}

/**
 * Analyze tasks and categorize them
 */
function analyzeTasks(tasks, sprints) {
  const taskSummary = {
    todoTasks: [],
    inProgressTasks: [],
    incompleteCompletedTasks: [],
    blockedTasks: [],
    toValidateTasks: [],
    sprintSummary: []
  };

  // Get past sprints (ended before today)
  const today = new Date();
  const pastSprints = Object.values(sprints || {}).filter(sprint => {
    if (!sprint.endDate && !sprint.estimatedEndDate) return false;
    const endDate = new Date(sprint.endDate || sprint.estimatedEndDate);
    return endDate < today;
  });

  const pastSprintIds = pastSprints.map(sprint => sprint.cardId || sprint.id);
  taskSummary.sprintSummary = pastSprints.map(sprint => sprint.title || sprint.cardId || 'Sin nombre');

  // Analyze each task
  Object.values(tasks || {}).forEach(task => {
    // Skip deleted tasks
    if (task.deletedAt) return;

    // Only include tasks from past sprints
    if (!task.sprint || !pastSprintIds.includes(task.sprint)) return;

    const status = (task.status || '').toLowerCase().trim();

    // Check for missing required fields in completed tasks
    const requiredFields = ['startDate', 'endDate', 'epic', 'developer'];
    const missingFields = requiredFields.filter(field => !task[field]);

    switch (status) {
      case 'todo':
      case 'to do':
      case 'pending':
        taskSummary.todoTasks.push({
          ...task,
          missingFields: missingFields.length > 0 ? missingFields : null
        });
        break;

      case 'in progress':
      case 'in-progress':
      case 'working':
        taskSummary.inProgressTasks.push({
          ...task,
          missingFields: missingFields.length > 0 ? missingFields : null
        });
        break;

      case 'done':
      case 'completed':
        // Only include if has missing fields
        if (missingFields.length > 0) {
          taskSummary.incompleteCompletedTasks.push({
            ...task,
            missingFields
          });
        }
        break;

      case 'blocked':
        taskSummary.blockedTasks.push({
          ...task,
          blockReason: task.blockReason || task.reason || 'Sin razón especificada',
          missingFields: missingFields.length > 0 ? missingFields : null
        });
        break;

      case 'to validate':
      case 'validation':
      case 'review':
        taskSummary.toValidateTasks.push({
          ...task,
          missingFields: missingFields.length > 0 ? missingFields : null
        });
        break;
    }
  });

  return taskSummary;
}

/**
 * Analyze ALL pending tasks for a user (not just past sprints)
 * Used for consolidated weekly emails per user
 */
function analyzeAllPendingTasks(tasks) {
  const taskSummary = {
    todoTasks: [],
    inProgressTasks: [],
    blockedTasks: [],
    toValidateTasks: []
  };

  Object.values(tasks || {}).forEach(task => {
    // Skip deleted tasks
    if (task.deletedAt) return;

    const status = (task.status || '').toLowerCase().trim();

    switch (status) {
      case 'todo':
      case 'to do':
      case 'pending':
        taskSummary.todoTasks.push(task);
        break;

      case 'in progress':
      case 'in-progress':
      case 'working':
        taskSummary.inProgressTasks.push(task);
        break;

      case 'blocked':
        taskSummary.blockedTasks.push({
          ...task,
          blockReason: task.blockReason || task.reason || 'Sin razón especificada'
        });
        break;

      case 'to validate':
      case 'validation':
      case 'review':
        taskSummary.toValidateTasks.push(task);
        break;
    }
  });

  return taskSummary;
}

/**
 * Notify admin about missing email configuration for a project
 */
async function notifyAdminMissingConfiguration(projectId, accessToken) {
  const adminEmailContent = generateEmailTemplate(`⚠️ Configuración Faltante`, {
    todoTasks: [{
      title: `El proyecto "${projectId}" no tiene emails resolubles en /projects + /data`,
      developer: 'Admin',
      sprint: 'N/A'
    }],
    inProgressTasks: [],
    incompleteCompletedTasks: [],
    blockedTasks: [],
    toValidateTasks: [],
    sprintSummary: ['Configuración pendiente']
  });

  await sendEmail(
    accessToken,
    [process.env.PUBLIC_SUPER_ADMIN_EMAIL || 'admin@example.com'],
    `⚠️ Configuración de emails faltante para proyecto ${projectId}`,
    adminEmailContent
  );
}

/**
 * Check if task summary has any issues to report
 */
function hasReportableIssues(taskSummary) {
  return taskSummary.todoTasks.length > 0 ||
         taskSummary.inProgressTasks.length > 0 ||
         taskSummary.incompleteCompletedTasks.length > 0 ||
         taskSummary.blockedTasks.length > 0 ||
         taskSummary.toValidateTasks.length > 0;
}

/**
 * Send weekly summary email to team members
 */
async function sendTeamSummaryEmail(accessToken, emails, projectName, taskSummary, projectId) {
  if (emails.length === 0) return;

  const emailContent = generateEmailTemplate(projectName, taskSummary);
  await sendEmail(
    accessToken,
    emails,
    `📊 Resumen Semanal de Tareas Pendientes - ${projectName}`,
    emailContent
  );
  logger.info(`Weekly summary sent to team for project ${projectId}`);
}

/**
 * Send validation tasks email to stakeholders
 */
async function sendStakeholderValidationEmail(accessToken, stakeholderEmails, projectName, taskSummary, projectId) {
  if (taskSummary.toValidateTasks.length === 0 || stakeholderEmails.length === 0) return;

  const stakeholderEmailContent = generateEmailTemplate(
    `${projectName} - Tareas para Validación`,
    {
      todoTasks: [],
      inProgressTasks: [],
      incompleteCompletedTasks: [],
      blockedTasks: [],
      toValidateTasks: taskSummary.toValidateTasks,
      sprintSummary: taskSummary.sprintSummary
    }
  );

  await sendEmail(
    accessToken,
    stakeholderEmails,
    `✅ Tareas Esperando Validación - ${projectName}`,
    stakeholderEmailContent
  );
  logger.info(`Validation tasks email sent to stakeholders for project ${projectId}`);
}

/**
 * Process a single project for weekly summary
 */
async function processProjectForWeeklySummary(projectId, project, developersDirectory, stakeholdersDirectory, accessToken, db) {
  logger.info(`Processing project: ${projectId}`);

  const developerEmails = extractEmails(project?.developers, developersDirectory);
  const stakeholderEmails = extractEmails(project?.stakeholders, stakeholdersDirectory);

  if (developerEmails.length === 0 && stakeholderEmails.length === 0) {
    logger.warn(`No team emails found for project ${projectId}, notifying admin`);
    await notifyAdminMissingConfiguration(projectId, accessToken);
    return;
  }

  const [tasksSnapshot, sprintsSnapshot] = await Promise.all([
    db.ref(`/cards/${projectId}/TASKS_${projectId}`).once('value'),
    db.ref(`/cards/${projectId}/SPRINTS_${projectId}`).once('value')
  ]);

  const tasks = tasksSnapshot.val() || {};
  const sprints = sprintsSnapshot.val() || {};
  const taskSummary = analyzeTasks(tasks, sprints);

  if (!hasReportableIssues(taskSummary)) {
    logger.info(`Project ${projectId} has no pending issues, skipping email`);
    return;
  }

  const projectName = project.name || projectId;
  await sendTeamSummaryEmail(accessToken, [...developerEmails], projectName, taskSummary, projectId);
  await sendStakeholderValidationEmail(accessToken, stakeholderEmails, projectName, taskSummary, projectId);
}

/**
 * Legacy function to send weekly task summary (per project)
 * @deprecated Use sendWeeklyTaskSummaryPerUser instead
 */
async function sendWeeklyTaskSummaryLegacy() {
  try {
    logger.info('Starting weekly task summary process (legacy)...');

    const db = getDatabase();

    const [projectsSnapshot, developersSnapshot, stakeholdersSnapshot] = await Promise.all([
      db.ref('/projects').once('value'),
      db.ref('/data/developers').once('value'),
      db.ref('/data/stakeholders').once('value')
    ]);
    const projects = projectsSnapshot.val() || {};
    const developersDirectory = developersSnapshot.val() || {};
    const stakeholdersDirectory = stakeholdersSnapshot.val() || {};

    const accessToken = await getGraphAccessToken();

    for (const [projectId, project] of Object.entries(projects)) {
      try {
        await processProjectForWeeklySummary(projectId, project, developersDirectory, stakeholdersDirectory, accessToken, db);
      } catch (error) {
        logger.error(`Error processing project ${projectId}:`, error);
      }
    }

    logger.info('Weekly task summary process completed successfully (legacy)');
    return { success: true, message: 'Weekly summaries sent successfully' };

  } catch (error) {
    logger.error('Error in weekly task summary process:', error);
    throw error;
  }
}

/**
 * Resolve email from a developer/stakeholder ID or object
 * @param {string|object} value - Developer ID, email, or object
 * @param {object} directory - Directory to lookup IDs
 * @returns {string|null} - Resolved email or null
 */
function resolveEmail(value, directory = {}) {
  if (!value) return null;

  // Direct email
  if (typeof value === 'string' && value.includes('@')) {
    return normalizeEmail(value);
  }

  // Object with email/id
  if (typeof value === 'object') {
    const candidate = value.id || value.email || value.mail || value.value;
    if (typeof candidate === 'string' && candidate.includes('@')) {
      return normalizeEmail(candidate);
    }
    if (typeof candidate === 'string' && directory[candidate]?.email) {
      return normalizeEmail(directory[candidate].email);
    }
  }

  // ID lookup in directory
  if (typeof value === 'string' && directory[value]?.email) {
    return normalizeEmail(directory[value].email);
  }

  return null;
}

/**
 * Resolve name from a developer/stakeholder ID or object
 * @param {string|object} value - Developer ID, email, or object
 * @param {object} directory - Directory to lookup IDs
 * @returns {string} - Resolved name or 'Usuario'
 */
function resolveName(value, directory = {}) {
  if (!value) return 'Usuario';

  // Object with name
  if (typeof value === 'object') {
    if (value.name) return value.name;
    const candidate = value.id || value.value;
    if (typeof candidate === 'string' && directory[candidate]?.name) {
      return directory[candidate].name;
    }
  }

  // ID lookup in directory
  if (typeof value === 'string' && directory[value]?.name) {
    return directory[value].name;
  }

  // If it's an email, use the part before @
  if (typeof value === 'string' && value.includes('@')) {
    return value.split('@')[0];
  }

  return 'Usuario';
}

/**
 * Add a task to the user task map
 * @param {Map} userTaskMap - Map of email -> user data
 * @param {string} email - User email
 * @param {string} projectId - Project ID
 * @param {string} projectName - Project name
 * @param {object} task - Task data
 * @param {string} taskType - Type of task for user: 'assigned' or 'toValidate'
 * @param {string} status - Task status category
 * @param {object} directories - Developer and stakeholder directories
 */
function addTaskToUserMap(userTaskMap, email, projectId, projectName, task, taskType, status, directories) {
  if (!email) return;

  const { developersDirectory, stakeholdersDirectory } = directories;
  const combinedDirectory = { ...developersDirectory, ...stakeholdersDirectory };

  if (!userTaskMap.has(email)) {
    // Determine user name from developer or stakeholder entry
    let userName = 'Usuario';
    const devEntry = Object.values(developersDirectory).find(d => normalizeEmail(d.email) === email);
    const stkEntry = Object.values(stakeholdersDirectory).find(s => normalizeEmail(s.email) === email);
    if (devEntry?.name) userName = devEntry.name;
    else if (stkEntry?.name) userName = stkEntry.name;
    else if (email.includes('@')) userName = email.split('@')[0];

    userTaskMap.set(email, {
      name: userName,
      email: email,
      projects: new Map()
    });
  }

  const userData = userTaskMap.get(email);

  if (!userData.projects.has(projectId)) {
    userData.projects.set(projectId, {
      projectId,
      projectName,
      assigned: { todo: [], inProgress: [], blocked: [] },
      toValidate: [],
      sprintSummary: []
    });
  }

  const projectData = userData.projects.get(projectId);

  const taskInfo = {
    cardId: task.cardId || task.id,
    title: task.title || 'Sin título',
    sprint: task.sprint,
    developer: task.developer ? resolveName(task.developer, combinedDirectory) : null,
    validator: task.validator ? resolveName(task.validator, combinedDirectory) : null,
    blockReason: task.blockReason || task.reason,
    missingFields: task.missingFields
  };

  if (taskType === 'assigned') {
    if (status === 'todo') {
      projectData.assigned.todo.push(taskInfo);
    } else if (status === 'inProgress') {
      projectData.assigned.inProgress.push(taskInfo);
    } else if (status === 'blocked') {
      projectData.assigned.blocked.push(taskInfo);
    }
  } else if (taskType === 'toValidate') {
    projectData.toValidate.push(taskInfo);
  }
}

/**
 * Helper: Add tasks from a list to the user map
 * @param {Map} userTaskMap - The user task map to update
 * @param {Array} tasks - Array of tasks to process
 * @param {string} userField - Field name to get user (developer or validator)
 * @param {object} combinedDirectory - Combined developers/stakeholders directory
 * @param {string} projectId - Project ID
 * @param {string} projectName - Project name
 * @param {string} taskType - Task type (assigned or toValidate)
 * @param {string|null} status - Status for assigned tasks (todo, inProgress, blocked)
 * @param {object} directories - Directories object
 */
function processTasksForUserMap(userTaskMap, tasks, userField, combinedDirectory, projectId, projectName, taskType, status, directories) {
  for (const task of tasks) {
    const email = resolveEmail(task[userField], combinedDirectory);
    if (email) {
      addTaskToUserMap(userTaskMap, email, projectId, projectName, task, taskType, status, directories);
    }
  }
}

/**
 * Build a map of user -> tasks grouped by project
 * @param {object} db - Firebase database reference
 * @param {object} projects - Projects data
 * @param {object} developersDirectory - Developers directory
 * @param {object} stakeholdersDirectory - Stakeholders directory
 * @returns {Map} - Map of email -> user data with projects
 */
async function buildUserTaskMap(db, projects, developersDirectory, stakeholdersDirectory) {
  const userTaskMap = new Map();
  const directories = { developersDirectory, stakeholdersDirectory };
  const combinedDirectory = { ...developersDirectory, ...stakeholdersDirectory };

  for (const [projectId, project] of Object.entries(projects)) {
    try {
      const tasksSnapshot = await db.ref(`/cards/${projectId}/TASKS_${projectId}`).once('value');
      const tasks = tasksSnapshot.val() || {};
      const taskSummary = analyzeAllPendingTasks(tasks);
      const projectName = project.name || projectId;

      // Group tasks by developer (assigned tasks)
      processTasksForUserMap(userTaskMap, taskSummary.todoTasks, 'developer', combinedDirectory, projectId, projectName, 'assigned', 'todo', directories);
      processTasksForUserMap(userTaskMap, taskSummary.inProgressTasks, 'developer', combinedDirectory, projectId, projectName, 'assigned', 'inProgress', directories);
      processTasksForUserMap(userTaskMap, taskSummary.blockedTasks, 'developer', combinedDirectory, projectId, projectName, 'assigned', 'blocked', directories);

      // Group "To Validate" tasks by validator
      processTasksForUserMap(userTaskMap, taskSummary.toValidateTasks, 'validator', combinedDirectory, projectId, projectName, 'toValidate', null, directories);

    } catch (error) {
      logger.error(`Error processing project ${projectId} for user task map:`, error);
    }
  }

  return userTaskMap;
}

/**
 * Generate consolidated HTML email template for a user with multiple projects
 * @param {string} userName - User's name
 * @param {Array} projectsSummary - Array of project summaries
 * @returns {string} - HTML email content
 */
function generateConsolidatedEmailTemplate(userName, projectsSummary) {
  // Calculate total stats
  let totalAssigned = 0;
  let totalTodo = 0;
  let totalInProgress = 0;
  let totalBlocked = 0;
  let totalToValidate = 0;

  for (const project of projectsSummary) {
    totalTodo += project.assigned.todo.length;
    totalInProgress += project.assigned.inProgress.length;
    totalBlocked += project.assigned.blocked.length;
    totalToValidate += project.toValidate.length;
  }
  totalAssigned = totalTodo + totalInProgress + totalBlocked;

  const formatTaskList = (tasks, projectId, includeReason = false) => {
    if (!tasks || tasks.length === 0) {
      return '<li style="color: #28a745;">Ninguna tarea pendiente ✅</li>';
    }

    if (!process.env.PUBLIC_APP_URL) {
      throw new Error('PUBLIC_APP_URL environment variable is required. Set it in functions/.env or Firebase Functions config.');
    }
    if (process.env.FUNCTIONS_EMULATOR !== 'true' && process.env.PUBLIC_APP_URL.includes('localhost')) {
      throw new Error('PUBLIC_APP_URL contains "localhost" in production. Fix the value in functions/.env.');
    }
    const baseUrl = process.env.PUBLIC_APP_URL;

    return tasks.map(task => {
      const taskUrl = `${baseUrl}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(task.cardId)}#tasks`;
      return `
        <li>
          <a href="${taskUrl}" style="color: #667eea; text-decoration: none; font-weight: bold;">${task.title}</a>
          <span style="color: #999; font-size: 12px;">[${task.cardId}]</span>
          ${task.sprint ? `<span style="color: #6c757d; font-size: 12px;"> · Sprint: ${task.sprint}</span>` : ''}
          ${includeReason && task.blockReason ? `<br><em style="color: #dc3545; font-size: 12px;">⚠️ ${task.blockReason}</em>` : ''}
        </li>
      `;
    }).join('');
  };

  const renderProjectSection = (project) => {
    const hasAssignedTasks = project.assigned.todo.length > 0 ||
                            project.assigned.inProgress.length > 0 ||
                            project.assigned.blocked.length > 0;
    const hasValidationTasks = project.toValidate.length > 0;

    if (!hasAssignedTasks && !hasValidationTasks) return '';

    const totalProjectTasks = project.assigned.todo.length +
                              project.assigned.inProgress.length +
                              project.assigned.blocked.length;

    return `
      <div class="project-section">
        <div class="project-header">
          <span class="project-title">📁 ${project.projectName}</span>
          <span class="project-stats">
            Asignadas: <strong>${totalProjectTasks}</strong> ·
            Por validar: <strong>${project.toValidate.length}</strong> ·
            Bloqueadas: <strong>${project.assigned.blocked.length}</strong>
          </span>
        </div>

        ${hasAssignedTasks ? `
          <div class="task-category">
            ${project.assigned.todo.length > 0 ? `
              <div class="section">
                <div class="section-title">⏳ Sin Comenzar <span class="status-badge status-todo">${project.assigned.todo.length}</span></div>
                <ul class="task-list">${formatTaskList(project.assigned.todo, project.projectId)}</ul>
              </div>
            ` : ''}

            ${project.assigned.inProgress.length > 0 ? `
              <div class="section">
                <div class="section-title">🔄 En Progreso <span class="status-badge status-progress">${project.assigned.inProgress.length}</span></div>
                <ul class="task-list">${formatTaskList(project.assigned.inProgress, project.projectId)}</ul>
              </div>
            ` : ''}

            ${project.assigned.blocked.length > 0 ? `
              <div class="section">
                <div class="section-title">🚫 Bloqueadas <span class="status-badge status-blocked">${project.assigned.blocked.length}</span></div>
                <ul class="task-list">${formatTaskList(project.assigned.blocked, project.projectId, true)}</ul>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${hasValidationTasks ? `
          <div class="task-category">
            <div class="section">
              <div class="section-title">✅ Esperando tu Validación <span class="status-badge status-validate">${project.toValidate.length}</span></div>
              <ul class="task-list">${formatTaskList(project.toValidate, project.projectId)}</ul>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  const projectSections = projectsSummary
    .map(renderProjectSection)
    .filter(section => section.trim() !== '')
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resumen Semanal de Tareas</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f8f9fa; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 10px 10px 0 0; }
            .greeting { font-size: 24px; font-weight: bold; margin: 0; }
            .subtitle { font-size: 14px; opacity: 0.9; margin-top: 5px; }
            .date { font-size: 12px; opacity: 0.8; margin-top: 10px; }
            .summary-line { background: #f8f9fa; padding: 12px 15px; border-radius: 8px; margin-bottom: 25px; font-size: 14px; color: #495057; }
            .summary-line strong { color: #667eea; font-size: 16px; }
            .project-section { margin-bottom: 25px; padding: 15px 20px; background: #fafafa; border-radius: 8px; border-left: 4px solid #667eea; }
            .project-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #e9ecef; }
            .project-title { font-size: 18px; font-weight: bold; color: #495057; }
            .project-stats { font-size: 13px; color: #6c757d; }
            .task-category { margin-bottom: 15px; }
            .section { margin-bottom: 12px; }
            .section-title { color: #495057; font-size: 13px; font-weight: bold; margin-bottom: 6px; }
            .task-list { margin: 0; padding-left: 20px; }
            .task-list li { margin-bottom: 8px; font-size: 14px; line-height: 1.4; }
            .task-list a { color: #667eea; text-decoration: none; }
            .task-list a:hover { text-decoration: underline; }
            .footer { text-align: center; color: #6c757d; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; }
            .status-badge { padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: bold; margin-left: 5px; }
            .status-todo { background: #ffc107; color: #000; }
            .status-progress { background: #17a2b8; color: white; }
            .status-blocked { background: #dc3545; color: white; }
            .status-validate { background: #6f42c1; color: white; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="greeting">Hola ${userName},</div>
                <div class="subtitle">Aquí tienes tu resumen semanal de tareas</div>
                <div class="date">Generado el: ${new Date().toLocaleDateString('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</div>
            </div>

            <div class="summary-line">
                📊 Proyectos: <strong>${projectsSummary.length}</strong> ·
                Tareas asignadas: <strong>${totalAssigned}</strong> ·
                Por validar: <strong>${totalToValidate}</strong> ·
                Bloqueadas: <strong>${totalBlocked}</strong>
            </div>

            ${projectSections}

            <div class="footer">
                <p>Este es un correo automático generado por el sistema PlanningGameXP.</p>
                <p>Para consultas contacta con el equipo de desarrollo.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Main function to send weekly task summary per user (consolidated emails)
 * @param {string} [filterEmail] - Optional email to filter (only send to this user)
 */
async function sendWeeklyTaskSummaryPerUser(filterEmail = null) {
  try {
    const filterInfo = filterEmail ? ` (filtered to: ${filterEmail})` : '';
    logger.info(`Starting weekly task summary process (per user)...${filterInfo}`);

    const db = getDatabase();

    const [projectsSnapshot, developersSnapshot, stakeholdersSnapshot] = await Promise.all([
      db.ref('/projects').once('value'),
      db.ref('/data/developers').once('value'),
      db.ref('/data/stakeholders').once('value')
    ]);
    const projects = projectsSnapshot.val() || {};
    const developersDirectory = developersSnapshot.val() || {};
    const stakeholdersDirectory = stakeholdersSnapshot.val() || {};

    // Build map of user -> tasks grouped by project
    const userTaskMap = await buildUserTaskMap(db, projects, developersDirectory, stakeholdersDirectory);

    logger.info(`Found ${userTaskMap.size} users with tasks to notify`);

    if (userTaskMap.size === 0) {
      logger.info('No users with tasks to notify');
      return { success: true, message: 'No tasks to report', emailsSent: 0 };
    }

    const accessToken = await getGraphAccessToken();
    let emailsSent = 0;
    let emailsFailed = 0;

    // Normalize filter email for comparison
    const normalizedFilterEmail = filterEmail ? normalizeEmail(filterEmail) : null;

    for (const [email, userData] of userTaskMap) {
      // Skip if filter is set and this is not the target email
      if (normalizedFilterEmail && email !== normalizedFilterEmail) {
        continue;
      }

      try {
        // Convert projects Map to array
        const projectsArray = Array.from(userData.projects.values());

        // Check if user has any reportable tasks
        const hasReportableTasks = projectsArray.some(p =>
          p.assigned.todo.length > 0 ||
          p.assigned.inProgress.length > 0 ||
          p.assigned.blocked.length > 0 ||
          p.toValidate.length > 0
        );

        if (!hasReportableTasks) {
          logger.info(`User ${email} has no reportable tasks, skipping`);
          continue;
        }

        const emailContent = generateConsolidatedEmailTemplate(userData.name, projectsArray);
        const projectCount = projectsArray.length;
        const subject = projectCount === 1
          ? `📊 Resumen Semanal - ${projectsArray[0].projectName}`
          : `📊 Resumen Semanal - ${projectCount} proyectos`;

        await sendEmail(accessToken, [email], subject, emailContent);
        emailsSent++;
        logger.info(`Consolidated email sent to ${email} for ${projectCount} projects`);

      } catch (error) {
        emailsFailed++;
        logger.error(`Error sending email to ${email}:`, error);
      }
    }

    logger.info(`Weekly task summary process completed: ${emailsSent} emails sent, ${emailsFailed} failed`);
    return {
      success: true,
      message: 'Weekly summaries sent successfully',
      emailsSent,
      emailsFailed,
      totalUsers: userTaskMap.size
    };

  } catch (error) {
    logger.error('Error in weekly task summary per user process:', error);
    throw error;
  }
}

/**
 * Main function to send weekly task summary (now uses per-user approach)
 * @param {string} [filterEmail] - Optional email to filter (only send to this user)
 */
async function sendWeeklyTaskSummary(filterEmail = null) {
  return await sendWeeklyTaskSummaryPerUser(filterEmail);
}

/**
 * Scheduled function - runs every Monday at 9:00 AM in European region
 */
exports.weeklyTaskSummary = onSchedule({
  schedule: "0 9 * * 1", // Every Monday at 9:00 AM
  timeZone: "Europe/Madrid",
  region: "europe-west1", // Belgium (closest European region)
  secrets: [msClientId, msClientSecret, msTenantId, msFromEmail, msAlertEmail]
}, async (event) => {
  return await sendWeeklyTaskSummary();
});

/**
 * HTTP trigger for manual testing in European region
 * Supports optional ?email=user@example.com parameter to filter and only send to that email
 */
exports.testWeeklyTaskSummary = onRequest({
  region: "europe-west1", // Belgium (closest European region)
  secrets: [msClientId, msClientSecret, msTenantId, msFromEmail, msAlertEmail]
}, async (req, res) => {
  try {
    // Get optional email filter from query string
    const filterEmail = req.query.email || null;
    if (filterEmail) {
      logger.info(`Test triggered with email filter: ${filterEmail}`);
    }
    const result = await sendWeeklyTaskSummary(filterEmail);
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

/**
 * Firebase Cloud Function for Push Notifications
 * Triggers when a new notification is created for any user
 */
exports.sendPushNotification = onValueCreated({
 ref: "/notifications/{userId}/{notificationId}",
  region: "europe-west1"
}, async (event) => {
  try {
    // Permitir desactivar envíos durante importaciones masivas
    if (process.env.SKIP_PUSH_ON_IMPORT) {
      logger.info('🔔 SKIP_PUSH_ON_IMPORT activo, notificación ignorada');
      return null;
    }

    const userId = event.params.userId;
    const notificationId = event.params.notificationId;
    const notificationData = event.data.val();
    
    logger.info('🔔 New notification created:', {
      userId,
      notificationId,
      title: notificationData.title
    });

    // Get user's FCM token
    const db = getDatabase();
    const userTokenSnapshot = await db.ref(`userTokens/${userId}`).once('value');
    const userTokenData = userTokenSnapshot.val();
    
    if (!userTokenData || !userTokenData.token) {
      logger.warn('🔔 No FCM token found for user:', userId);
      return;
    }

    const fcmToken = userTokenData.token;
    logger.info('🔔 Found FCM token for user:', userId);

    // Prepare FCM message
    const message = {
      token: fcmToken,
      notification: {
        title: notificationData.title || 'Nueva notificación',
        body: notificationData.message || 'Tienes una nueva actualización'
      },
      data: {
        notificationId: notificationId,
        type: notificationData.type || 'info',
        projectId: notificationData.projectId || '',
        taskId: notificationData.taskId || '',
        bugId: notificationData.bugId || '',
        timestamp: String(notificationData.timestamp || Date.now()),
        // Agregar datos personalizados del payload
        ...(notificationData.data && typeof notificationData.data === 'object' ? 
           Object.fromEntries(
             Object.entries(notificationData.data).map(([k, v]) => [k, String(v)])
           ) : {})
      },
      android: {
        priority: 'high',
        notification: {
          icon: 'stock_ticker_update',
          color: '#4a9eff',
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      },
      webpush: {
        headers: {
          'Urgency': 'high'
        },
        notification: {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          requireInteraction: true,
          actions: [
            {
              action: 'open',
              title: 'Abrir'
            }
          ]
        }
      }
    };

    // Send FCM message
    const messaging = getMessaging();
    const response = await messaging.send(message);
    
    logger.info('🔔 Push notification sent successfully:', {
      userId,
      notificationId,
      messageId: response
    });

    return response;

  } catch (error) {
    logger.error('🔔 Error sending push notification:', error);
    
    // Don't throw error to avoid function retries for invalid tokens
    if (error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token') {
      logger.warn('🔔 Invalid or expired FCM token, should clean up:', error.code);
      // TODO: Remove invalid token from database
    }
    
    return null;
  }
});

/**
 * Encodes an email for Firebase keys.
 * @param {string} email The email to encode.
 * @return {string} The encoded email.
 */
function encodeEmailForFirebase(email) {
  if (!email) return '';
  return email.replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
}

/**
 * Normalizes a Gmail address by removing dots from the local part.
 * Gmail treats "jorge.casar@gmail.com" and "jorgecasar@gmail.com" as the same.
 * For non-Gmail addresses, returns the email as-is (lowercased).
 * @param {string} email The email to normalize.
 * @return {string} The normalized email.
 */
function normalizeGmailEmail(email) {
  if (!email) return '';
  const lower = email.trim().toLowerCase();
  const [localPart, domain] = lower.split('@');
  if (!domain) return lower;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return localPart.replace(/\./g, '') + '@' + domain;
  }
  return lower;
}

/**
 * Checks if an email is pre-authorized in /users/.
 * A user is authorized if they exist in /users/ and have at least one project assigned.
 * Tries both the exact email and the Gmail-normalized variant.
 * @param {string} email The email to check.
 * @return {Promise<boolean>} Whether the email is allowed.
 */
async function isEmailPreAuthorized(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const encodedExact = encodeEmailForFirebase(normalizedEmail);

  const exactSnap = await admin.database().ref(`/users/${encodedExact}/projects`).once('value');
  if (hasActiveProject(exactSnap.val())) return true;

  const gmailNormalized = normalizeGmailEmail(normalizedEmail);
  if (gmailNormalized !== normalizedEmail) {
    const encodedNormalized = encodeEmailForFirebase(gmailNormalized);
    const normalizedSnap = await admin.database().ref(`/users/${encodedNormalized}/projects`).once('value');
    if (hasActiveProject(normalizedSnap.val())) return true;
  }

  return false;
}

/**
 * Checks if a projects object has at least one project with developer or stakeholder = true.
 */
function hasActiveProject(projects) {
  if (!projects || typeof projects !== 'object') return false;
  return Object.values(projects).some(p => p.developer === true || p.stakeholder === true);
}

/**
 * Auto-generates the next available developer or stakeholder ID.
 * @param {string} prefix "dev_" or "stk_"
 * @param {string} field "developerId" or "stakeholderId"
 * @return {Promise<string>} The next ID (e.g., "dev_020")
 */
async function generateNextId(prefix, field) {
  const usersSnap = await admin.database().ref('/users').once('value');
  const users = usersSnap.val() || {};
  let maxNum = 0;
  for (const userData of Object.values(users)) {
    const id = userData[field];
    if (id && id.startsWith(prefix)) {
      const num = parseInt(id.replace(prefix, ''), 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * Callable function to create a pending email/password account request.
 * It creates/updates a disabled Firebase Auth user and stores the request for approval.
 */
exports.requestEmailAccess = functions.region('europe-west1').https.onCall(async (data, context) => {
  const error = (code, message) => {
    throw new functions.https.HttpsError(code, message);
  };

  const payload = data || {};
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!fullName || fullName.length < 3) {
    error('invalid-argument', 'Debes indicar tu nombre completo.');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error('invalid-argument', 'El correo electrónico no es válido.');
  }

  if (!password || password.length < 6) {
    error('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  }

  const emailDomain = email.split('@')[1];
  if (!emailDomain || !ALLOWED_SIGNUP_EMAIL_DOMAINS.includes(emailDomain)) {
    error('failed-precondition', 'El dominio del correo no está autorizado.');
  }
  const encodedEmailKey = encodeEmailForFirebase(email);
  const requestRef = firestore.collection(ACCOUNT_REQUESTS_COLLECTION).doc(encodedEmailKey);

  let existingRequestData = null;
  try {
    const existingRequestSnap = await requestRef.get();
    if (existingRequestSnap.exists) {
      existingRequestData = existingRequestSnap.data();
      if (existingRequestData?.status === 'pending') {
        error('already-exists', 'Ya existe una solicitud pendiente para este correo.');
      }
    }
  } catch (requestError) {
    logger.error('Error checking existing account request', requestError);
    throw new functions.https.HttpsError('internal', 'No se pudo validar la solicitud existente.');
  }

  let userRecord = null;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
    if (userRecord && !userRecord.disabled) {
      error('already-exists', 'Este usuario ya tiene acceso activo.');
    }
  } catch (authError) {
    if (authError.code !== 'auth/user-not-found') {
      logger.error('Error retrieving user before account request', authError);
      throw new functions.https.HttpsError('internal', 'No se pudo validar el estado del usuario.');
    }
  }

  if (!userRecord) {
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: fullName,
        disabled: true
      });
    } catch (createError) {
      if (createError.code === 'auth/email-already-exists') {
        error('already-exists', 'Ya existe un usuario con este correo.');
      }
      logger.error('Error creating pending user', createError);
      throw new functions.https.HttpsError('internal', 'No se pudo crear la cuenta. Inténtalo más tarde.');
    }
  } else {
    try {
      await admin.auth().updateUser(userRecord.uid, {
        password,
        displayName: fullName,
        disabled: true
      });
    } catch (updateError) {
      logger.error(`Error updating existing disabled user ${userRecord.uid}`, updateError);
      throw new functions.https.HttpsError('internal', 'No se pudo actualizar la cuenta existente.');
    }
  }

  const encodedEmailClaim = encodeEmailForFirebase(email);
  const existingClaims = (userRecord && userRecord.customClaims) ? userRecord.customClaims : {};

  try {
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...existingClaims,
      encodedEmail: encodedEmailClaim,
      accountStatus: 'pending'
    });
  } catch (claimsError) {
    logger.error(`Error setting custom claims for ${userRecord.uid}`, claimsError);
    throw new functions.https.HttpsError('internal', 'No se pudo registrar la solicitud.');
  }

  const timestamps = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await requestRef.set({
      uid: userRecord.uid,
      email,
      fullName,
      status: 'pending',
      ...timestamps,
      createdAt: existingRequestData?.createdAt || admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (writeError) {
    logger.error('Error storing account request', writeError);
    throw new functions.https.HttpsError('internal', 'No se pudo guardar la solicitud.');
  }

  logger.info('Nueva solicitud de acceso registrada', {
    email,
    uid: userRecord.uid
  });

  return {
    status: 'pending'
  };
});

// Demo mode: when DEMO_MODE=true, all new users are auto-allowed with role=demo
const DEMO_MODE = (process.env.DEMO_MODE || '').toString().trim().toLowerCase() === 'true';

/**
 * Auto-provisions new users on Firebase Auth account creation.
 * - Sets `encodedEmail` custom claim (for security rules)
 * - Checks /data/allowedUsers and sets `allowed: true` if pre-authorized
 * - Gmail normalization: treats jorge.casar@gmail.com = jorgecasar@gmail.com
 * - In DEMO_MODE: auto-allows all users with role=demo claim
 */
exports.setEncodedEmailClaim = functions.region('europe-west1').auth.user().onCreate(async (user) => {
  if (!user.email) return null;

  const email = user.email.toLowerCase();
  const encodedEmail = encodeEmailForFirebase(email);

  try {
    const existingUserRecord = await admin.auth().getUser(user.uid);
    const currentClaims = existingUserRecord.customClaims || {};

    const newClaims = {
      ...currentClaims,
      encodedEmail,
    };

    if (DEMO_MODE) {
      // Demo instance: auto-allow all users with demo role
      newClaims.allowed = true;
      newClaims.role = 'demo';
      logger.info(`DEMO MODE: auto-allowing user ${email} with role=demo`, { uid: user.uid });
    } else {
      // Production: check if user is pre-authorized in /data/allowedUsers
      const isAllowed = await isEmailPreAuthorized(email);
      if (isAllowed) {
        newClaims.allowed = true;
        logger.info(`User ${email} is pre-authorized, setting allowed=true`, { uid: user.uid });
      } else {
        logger.info(`User ${email} is NOT pre-authorized`, { uid: user.uid });
      }
    }

    await admin.auth().setCustomUserClaims(user.uid, newClaims);
    logger.info(`Custom claims set for user ${user.uid}`, {
      encodedEmail,
      allowed: newClaims.allowed || false,
      role: newClaims.role || 'standard',
      demoMode: DEMO_MODE,
    });

    // Log the claim setting
    await admin.database().ref(`/userClaimsLog/${user.uid}`).set({
      email,
      encodedEmail,
      allowed: newClaims.allowed || false,
      role: newClaims.role || 'standard',
      timestamp: Date.now(),
    });

    return { success: true, email, allowed: newClaims.allowed || false };
  } catch (error) {
    logger.error(`Failed to provision user ${user.uid}`, error);
    return null;
  }
});

/**
 * Validate generateAcceptanceCriteria request parameters
 */
function validateAcceptanceCriteriaRequest(request) {
  const payload = request.data || {};
  const projectId = typeof payload.projectId === 'string' ? payload.projectId.trim() : '';
  const taskId = typeof payload.taskId === 'string' ? payload.taskId.trim() : '';
  const taskPayload = payload.task && typeof payload.task === 'object' ? payload.task : null;
  const force = Boolean(payload.force);

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para generar criterios con IA.');
  }
  if (!projectId || (!taskId && !taskPayload)) {
    throw new HttpsError('invalid-argument', 'Faltan projectId o taskId.');
  }

  return { projectId, taskId, taskPayload, force };
}

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
 * Fetch task data from Firebase or payload
 */
async function fetchTaskForAcceptanceCriteria(db, projectId, taskId, taskPayload) {
  const projectSnap = await db.ref(`/projects/${projectId}`).once('value');
  if (!projectSnap.exists()) {
    throw new HttpsError('not-found', 'Proyecto no encontrado.');
  }

  let task = null;
  let taskPath = null;

  if (taskId) {
    taskPath = `/cards/${projectId}/TASKS_${projectId}/${taskId}`;
    const taskSnap = await db.ref(taskPath).once('value');
    if (!taskSnap.exists()) {
      throw new HttpsError('not-found', 'Tarea no encontrada.');
    }
    task = taskSnap.val() || {};
  } else {
    task = taskPayload || {};
  }

  return { task, taskPath };
}

/**
 * Check if task has existing acceptance criteria
 */
function hasExistingAcceptanceCriteria(task) {
  const existing = Array.isArray(task.acceptanceCriteriaStructured) ? task.acceptanceCriteriaStructured : [];
  return existing.some((scenario) =>
    (scenario?.given || '').trim() || (scenario?.when || '').trim() || (scenario?.then || '').trim()
  );
}

/**
 * Call OpenAI API to generate acceptance criteria
 */
async function callOpenAIForAcceptanceCriteria(apiKey, title, userStory, notes) {
  // Clear contract: JSON keys MUST be "given", "when", "then" (lowercase English)
  // Content should be in Spanish but keys are always English
  const systemPrompt = [
    'Eres un analista QA que redacta criterios de aceptación en español.',
    'IMPORTANTE: Devuelve SOLO JSON válido con esta estructura exacta:',
    '{"scenarios":[{"given":"texto en español","when":"texto en español","then":"texto en español"}]}',
    'Las claves JSON DEBEN ser exactamente: "given", "when", "then" (en minúsculas, en inglés).',
    'El contenido de cada campo debe estar en español usando Dado/Cuando/Entonces.',
    'Genera entre 1 y 5 escenarios claros y verificables.'
  ].join(' ');

  const userPrompt = [
    `Título: ${title}`,
    `Historia de usuario:\n${userStory || 'Sin descripción'}`,
    notes ? `Notas:\n${notes}` : ''
  ].filter(Boolean).join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Error generating acceptance criteria', { status: response.status, errorBody });
    throw new HttpsError('internal', 'No se pudo generar Acceptance Criteria con IA.');
  }

  return response.json();
}

/**
 * Parse and validate OpenAI response for acceptance criteria.
 *
 * CONTRACT:
 * - Response must be valid JSON
 * - Must have "scenarios" array
 * - Each scenario MUST have keys: "given", "when", "then" (lowercase English)
 * - Each field must be a non-empty string
 *
 * @param {Object} aiData - Raw response from OpenAI API
 * @returns {Array} Array of validated scenario objects
 * @throws {HttpsError} If response doesn't match the expected contract
 */
function parseAcceptanceCriteriaResponse(aiData) {
  const content = aiData?.choices?.[0]?.message?.content || '';

  // Validate: response must not be empty
  if (!content) {
    logger.error('Empty OpenAI response', { aiData });
    throw new HttpsError('internal', 'La IA devolvió una respuesta vacía.');
  }

  // Validate: must be valid JSON
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    logger.error('Invalid JSON from OpenAI', { content, error: parseError.message });
    throw new HttpsError('internal', 'La IA devolvió JSON inválido.');
  }

  // Validate: must have "scenarios" array
  if (!parsed || !Array.isArray(parsed.scenarios)) {
    logger.error('Missing scenarios array', { parsed });
    throw new HttpsError('internal', 'La IA no devolvió el array "scenarios" esperado.');
  }

  // Validate: scenarios array must not be empty
  if (parsed.scenarios.length === 0) {
    logger.error('Empty scenarios array', { parsed });
    throw new HttpsError('failed-precondition', 'La IA devolvió un array de escenarios vacío.');
  }

  // Validate each scenario strictly
  const validationErrors = [];
  const scenarios = [];

  parsed.scenarios.forEach((scenario, index) => {
    const scenarioErrors = [];

    // Check for required keys (must be lowercase English)
    if (typeof scenario?.given !== 'string') {
      scenarioErrors.push(`scenario[${index}]: missing or invalid "given" key`);
    }
    if (typeof scenario?.when !== 'string') {
      scenarioErrors.push(`scenario[${index}]: missing or invalid "when" key`);
    }
    if (typeof scenario?.then !== 'string') {
      scenarioErrors.push(`scenario[${index}]: missing or invalid "then" key`);
    }

    // Check for Spanish keys (contract violation)
    if (scenario?.Dado !== undefined || scenario?.Cuando !== undefined || scenario?.Entonces !== undefined) {
      scenarioErrors.push(`scenario[${index}]: uses Spanish keys (Dado/Cuando/Entonces) instead of required English keys (given/when/then)`);
    }

    if (scenarioErrors.length > 0) {
      validationErrors.push(...scenarioErrors);
    } else {
      // Extract and validate content
      const given = scenario.given.toString().trim();
      const when = scenario.when.toString().trim();
      const then = scenario.then.toString().trim(); // NOSONAR - Gherkin scenario field

      // At least one field must have content
      if (!given && !when && !then) {
        validationErrors.push(`scenario[${index}]: all fields are empty`);
      } else {
        scenarios.push({ given, when, then, raw: '' });
      }
    }
  });

  // If there are validation errors, log them and throw
  if (validationErrors.length > 0) {
    logger.error('Scenario validation failed', {
      errors: validationErrors,
      rawScenarios: JSON.stringify(parsed.scenarios).substring(0, 500)
    });
    throw new HttpsError(
      'internal',
      `La IA devolvió escenarios con formato incorrecto: ${validationErrors[0]}`
    );
  }

  // Final check: must have at least one valid scenario
  if (scenarios.length === 0) {
    logger.error('No valid scenarios after validation');
    throw new HttpsError('failed-precondition', 'La IA no devolvió escenarios válidos.');
  }

  return scenarios;
}

/**
 * Generate acceptance criteria for a task using IA.
 */
exports.generateAcceptanceCriteria = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  const { projectId, taskId, taskPayload, force } = validateAcceptanceCriteriaRequest(request);
  const apiKey = getIaApiKey();
  const db = primaryDb;

  const { task, taskPath } = await fetchTaskForAcceptanceCriteria(db, projectId, taskId, taskPayload);

  const existing = Array.isArray(task.acceptanceCriteriaStructured) ? task.acceptanceCriteriaStructured : [];
  if (!force && hasExistingAcceptanceCriteria(task)) {
    return {
      status: 'skipped',
      acceptanceCriteriaStructured: existing,
      acceptanceCriteria: task.acceptanceCriteria || buildAcceptanceText(existing)
    };
  }

  const userStory = buildUserStoryText(task);
  const notes = (task.notes || '').toString();
  const title = (task.title || task.cardId || task.id || '').toString();

  const aiData = await callOpenAIForAcceptanceCriteria(apiKey, title, userStory, notes);
  const scenarios = parseAcceptanceCriteriaResponse(aiData);

  const acceptanceText = buildAcceptanceText(scenarios);
  if (taskPath) {
    await db.ref(taskPath).update({
      acceptanceCriteriaStructured: scenarios,
      acceptanceCriteria: acceptanceText
    });
  }

  return {
    status: 'ok',
    acceptanceCriteriaStructured: scenarios,
    acceptanceCriteria: acceptanceText
  };
});

// ============================================================================
// BUG DESCRIPTION ANALYSIS AND ACCEPTANCE CRITERIA
// ============================================================================

/**
 * Call OpenAI API to analyze bug description clarity
 */
async function callOpenAIForBugAnalysis(apiKey, title, description) {
  const systemPrompt = [
    'Eres un analista QA experto. Analiza la descripción de un bug y determina si tiene suficiente contexto.',
    'IMPORTANTE: Devuelve SOLO JSON válido con esta estructura exacta:',
    '{"needsClarification": true/false, "questions": [{"question": "pregunta", "placeholder": "ejemplo"}], "reasoning": "explicación"}',
    '',
    'Evalúa si la descripción incluye:',
    '- Pasos para reproducir el bug (claros y específicos)',
    '- Comportamiento esperado vs comportamiento actual',
    '- Contexto suficiente (dónde ocurre, en qué condiciones)',
    '',
    'Si falta información crítica, genera entre 1 y 4 preguntas específicas.',
    'Si la descripción es clara y completa, devuelve needsClarification: false y questions: [].',
    'Las preguntas deben ser en español y enfocadas en lo esencial.'
  ].join('\n');

  const userPrompt = [
    `Título del bug: ${title || 'Sin título'}`,
    `Descripción: ${description || 'Sin descripción'}`
  ].join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Error analyzing bug description', { status: response.status, errorBody });
    throw new HttpsError('internal', 'No se pudo analizar la descripción del bug.');
  }

  return response.json();
}

/**
 * Parse and validate bug analysis response from OpenAI
 */
function parseBugAnalysisResponse(aiData) {
  const content = aiData?.choices?.[0]?.message?.content || '';

  if (!content) {
    logger.error('Empty OpenAI response for bug analysis', { aiData });
    throw new HttpsError('internal', 'La IA devolvió una respuesta vacía.');
  }

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    logger.error('Invalid JSON from OpenAI for bug analysis', { content, error: parseError.message });
    throw new HttpsError('internal', 'La IA devolvió JSON inválido.');
  }

  // Validate structure
  if (typeof parsed.needsClarification !== 'boolean') {
    logger.error('Missing needsClarification field', { parsed });
    throw new HttpsError('internal', 'La IA no devolvió el campo "needsClarification" esperado.');
  }

  // Validate questions array if clarification is needed
  if (parsed.needsClarification) {
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      logger.error('needsClarification is true but no questions provided', { parsed });
      throw new HttpsError('internal', 'La IA indicó que necesita clarificación pero no proporcionó preguntas.');
    }

    // Validate each question
    const validQuestions = parsed.questions.filter(q =>
      q && typeof q.question === 'string' && q.question.trim().length > 0
    ).map(q => ({
      question: q.question.trim(),
      placeholder: (q.placeholder || '').trim()
    }));

    if (validQuestions.length === 0) {
      logger.error('No valid questions in response', { parsed });
      throw new HttpsError('internal', 'La IA no proporcionó preguntas válidas.');
    }

    return {
      needsClarification: true,
      questions: validQuestions,
      reasoning: (parsed.reasoning || '').trim()
    };
  }

  return {
    needsClarification: false,
    questions: [],
    reasoning: (parsed.reasoning || '').trim()
  };
}

/**
 * Call OpenAI API to generate acceptance criteria for bugs
 */
async function callOpenAIForBugAcceptanceCriteria(apiKey, title, description, notes) {
  const systemPrompt = [
    'Eres un analista QA que redacta criterios de aceptación para BUGS en español.',
    'IMPORTANTE: Devuelve SOLO JSON válido con esta estructura exacta:',
    '{"scenarios":[{"given":"contexto/precondición","when":"acción relacionada con el bug","then":"comportamiento correcto esperado"}]}',
    'Las claves JSON DEBEN ser exactamente: "given", "when", "then" (en minúsculas, en inglés).',
    '',
    'Para bugs, los escenarios deben verificar:',
    '- Que el bug ya no se reproduce bajo las condiciones reportadas',
    '- Que la funcionalidad afectada funciona correctamente',
    '- Casos edge o variaciones relacionadas',
    '',
    'El contenido debe estar en español.',
    'Genera entre 1 y 5 escenarios claros y verificables.'
  ].join('\n');

  const userPrompt = [
    `Título del bug: ${title || 'Sin título'}`,
    `Descripción del bug:\n${description || 'Sin descripción'}`,
    notes ? `Notas adicionales:\n${notes}` : ''
  ].filter(Boolean).join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Error generating bug acceptance criteria', { status: response.status, errorBody });
    throw new HttpsError('internal', 'No se pudo generar Acceptance Criteria para el bug.');
  }

  return response.json();
}

/**
 * Analyze bug description and generate acceptance criteria.
 *
 * Flow:
 * 1. If description is clear -> generate acceptance criteria directly
 * 2. If description is ambiguous -> return questions for clarification
 * 3. If force=true -> skip analysis and generate acceptance criteria anyway
 */
exports.analyzeBugDescription = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  // Validate global IA is enabled
  const globalIaEnabled = (IA_GLOBAL_ENABLE.value() || '').toString().trim().toLowerCase() !== 'false';
  if (!globalIaEnabled) {
    throw new HttpsError('failed-precondition', 'La IA no está habilitada globalmente.');
  }

  // Validate request data
  const data = request.data || {};
  const { projectId, bugId, bug, force, skipAnalysis } = data;

  if (!bug || typeof bug !== 'object') {
    throw new HttpsError('invalid-argument', 'Se requiere el objeto bug con title y description.');
  }

  const title = (bug.title || '').trim();
  const description = (bug.description || '').trim();
  const notes = (bug.notes || '').toString().trim();

  if (!title && !description) {
    throw new HttpsError('invalid-argument', 'El bug debe tener al menos título o descripción.');
  }

  const apiKey = getIaApiKey();

  // Step 1: Analyze description (unless force or skipAnalysis)
  if (!force && !skipAnalysis) {
    try {
      const analysisData = await callOpenAIForBugAnalysis(apiKey, title, description);
      const analysis = parseBugAnalysisResponse(analysisData);

      if (analysis.needsClarification) {
        logger.info('Bug description needs clarification', {
          projectId,
          bugId,
          questionsCount: analysis.questions.length
        });
        return {
          status: 'needs_clarification',
          questions: analysis.questions,
          reasoning: analysis.reasoning
        };
      }
    } catch (analysisError) {
      // If analysis fails, log and continue to generate acceptance criteria anyway
      logger.warn('Bug analysis failed, proceeding to generate acceptance criteria', {
        error: analysisError.message
      });
    }
  }

  // Step 2: Generate acceptance criteria
  const aiData = await callOpenAIForBugAcceptanceCriteria(apiKey, title, description, notes);
  const scenarios = parseAcceptanceCriteriaResponse(aiData);
  const acceptanceText = buildAcceptanceText(scenarios);

  // Step 3: Save to database if bugId and projectId provided
  if (projectId && bugId) {
    const db = primaryDb;
    const bugPath = `/cards/${projectId}/BUGS_${projectId}/${bugId}`;
    try {
      await db.ref(bugPath).update({
        acceptanceCriteriaStructured: scenarios,
        acceptanceCriteria: acceptanceText
      });
      logger.info('Bug acceptance criteria saved', { projectId, bugId });
    } catch (saveError) {
      logger.warn('Failed to save bug acceptance criteria to database', {
        error: saveError.message,
        projectId,
        bugId
      });
      // Don't throw - still return the generated criteria
    }
  }

  return {
    status: 'ok',
    acceptanceCriteriaStructured: scenarios,
    acceptanceCriteria: acceptanceText
  };
});

/**
 * Extract token from request path or query
 */
function extractTokenFromRequest(req) {
  // NOSONAR - simple non-capturing patterns for trimming slashes
  const tokenFromPath = (req.path || '').replace(/^\/+/, '').replace(/\/+$/, '').split('/').pop();
  return (req.query.token || tokenFromPath || '').toString().trim();
}

/**
 * Find IA link in available databases
 */
async function findIaLinkInDatabases(token) {
  const dbCandidates = [primaryDb].concat(secondaryDb ? [secondaryDb] : []);

  for (const db of dbCandidates) {
    const candidateRef = db.ref(`/ia/links/${token}`);
    const candidateSnap = await candidateRef.once('value');
    if (candidateSnap.exists()) {
      return { linkRef: candidateRef, snap: candidateSnap, dbUsed: db };
    }
  }

  return { linkRef: null, snap: null, dbUsed: null };
}

/**
 * Get the correct repository for a task based on its repositoryLabel
 * @param {Object} project - Project data from Firebase
 * @param {Object} task - Task data from Firebase
 * @returns {{url: string, label: string}} Repository info
 */
function getRepositoryForTask(project, task) {
  const repoUrl = project.repoUrl || project.repositoryUrl;

  // No repository configured
  if (!repoUrl) {
    return { url: '', label: '' };
  }

  // Single repository (string format)
  if (typeof repoUrl === 'string') {
    return { url: repoUrl, label: 'Default' };
  }

  // Multiple repositories (array format)
  if (Array.isArray(repoUrl) && repoUrl.length > 0) {
    const taskLabel = task.repositoryLabel;
    if (taskLabel) {
      const found = repoUrl.find(r => r.label === taskLabel);
      if (found) {
        return { url: found.url || '', label: found.label || '' };
      }
    }
    // No label or not found → use the first one (default)
    return { url: repoUrl[0]?.url || '', label: repoUrl[0]?.label || 'Default' };
  }

  return { url: '', label: '' };
}

/**
 * Build IA context payload from project and card data (task or bug)
 */
function buildIaContextPayload(token, projectId, cardId, project, card, linkData, isBug = false) {
  const branchName = buildBranchName(cardId, card.title || card.cardId || card.id || '');
  const selectedRepo = getRepositoryForTask(project, card);

  const basePayload = {
    token,
    projectId,
    cardType: isBug ? 'bug' : 'task',
    branchName,
    repository: selectedRepo.url,
    repositoryLabel: selectedRepo.label,
    expiresAt: linkData.expiresAt || null,
    agents: {
      global: getGlobalAgentsContent(),
      project: project.businessContext || ''
    },
    project: {
      name: project.name || projectId,
      description: project.description || '',
      languages: Array.isArray(project.languages) ? project.languages : [],
      frameworks: Array.isArray(project.frameworks) ? project.frameworks : [],
      repoUrl: project.repoUrl || project.repositoryUrl || '',
      iaEnabled: Boolean(project.iaEnabled)
    },
    metadata: {
      createdBy: linkData.createdBy || null,
      createdAt: linkData.createdAt || null,
      used: false
    }
  };

  if (isBug) {
    // Bug-specific fields
    basePayload.bugId = cardId;
    basePayload.bug = {
      title: card.title || '',
      description: card.description || '',
      acceptanceCriteria: card.acceptanceCriteria || '',
      acceptanceCriteriaStructured: card.acceptanceCriteriaStructured || null,
      notes: card.notes || '',
      developer: card.developer || '',
      status: card.status || '',
      priority: card.priority || '',
      bugType: card.bugType || 'default',
      registerDate: card.registerDate || '',
      startDate: card.startDate || '',
      endDate: card.endDate || ''
    };
  } else {
    // Task-specific fields
    basePayload.taskId = cardId;
    basePayload.task = {
      title: card.title || '',
      description: card.description || card.descriptionStructured || '',
      descriptionStructured: card.descriptionStructured || null,
      acceptanceCriteria: card.acceptanceCriteria || '',
      acceptanceCriteriaStructured: card.acceptanceCriteriaStructured || null,
      notes: card.notes || '',
      sprint: card.sprint || '',
      epic: card.epic || '',
      developer: card.developer || '',
      validator: card.validator || '',
      status: card.status || '',
      expedited: Boolean(card.expedited),
      businessPoints: card.businessPoints || '',
      devPoints: card.devPoints || ''
    };
  }

  return basePayload;
}

/**
 * One-time token endpoint to deliver task context for IA tooling.
 * Path: /api/ia/context/{token} or ?token=
 * No auth; uses strong token + expiry (15 min suggested on creation).
 */
exports.getIaContext = onRequest({
  region: "europe-west1",
  cors: true,
  secrets: [IA_GLOBAL_ENABLE]
}, async (req, res) => {
  try {
    const globalIaEnabled = (IA_GLOBAL_ENABLE.value() || '').toString().trim().toLowerCase() !== 'false';
    if (!globalIaEnabled) {
      return res.status(503).json({ error: 'IA no disponible globalmente' });
    }

    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    const { linkRef, snap, dbUsed } = await findIaLinkInDatabases(token);
    if (!snap || !linkRef || !dbUsed) {
      return res.status(410).json({ error: 'Token inválido o consumido' });
    }

    const linkData = snap.val() || {};
    const now = Date.now();

    if (linkData.used) {
      return res.status(410).json({ error: 'Token ya usado' });
    }

    if (linkData.expiresAt && now > linkData.expiresAt) {
      await linkRef.update({ used: true, usedAt: now, expired: true });
      return res.status(410).json({ error: 'Token expirado' });
    }

    const { projectId, taskId, bugId, cardType } = linkData;
    const cardId = taskId || bugId;
    const isBug = cardType === 'bug' || !!bugId;

    if (!projectId || !cardId) {
      return res.status(400).json({ error: 'Token incompleto' });
    }

    const projectSnap = await dbUsed.ref(`/projects/${projectId}`).once('value');
    if (!projectSnap.exists()) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    const project = projectSnap.val() || {};

    // Determine path based on card type
    const cardPath = isBug
      ? `/cards/${projectId}/BUGS_${projectId}/${cardId}`
      : `/cards/${projectId}/TASKS_${projectId}/${cardId}`;
    const cardSnap = await dbUsed.ref(cardPath).once('value');
    if (!cardSnap.exists()) {
      return res.status(404).json({ error: isBug ? 'Bug no encontrado' : 'Tarea no encontrada' });
    }
    const card = cardSnap.val() || {};

    const payload = buildIaContextPayload(token, projectId, cardId, project, card, linkData, isBug);

    await linkRef.update({
      used: true,
      usedAt: now,
      usedIp: req.ip || null,
      lastStatus: 'delivered'
    });

    res.json(payload);
  } catch (error) {
    logger.error('Error in getIaContext:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ============================================================================
// CREATE CARD API - For programmatic card creation (Claude, scripts, etc.)
// ============================================================================

/**
 * Generate abbreviation for project/section names
 * Mirrors the frontend logic in firebase-service.js
 */
function getAbbrId(wordToAbbr) {
  const upperWord = (wordToAbbr || '').toUpperCase().trim();

  // Exceptions
  if (upperWord === "BUGS") return 'BUG';
  if (upperWord === "CINEMA4D") return 'C4D';
  if (upperWord === "EXTRANET V1") return 'EX1';
  if (upperWord === "EXTRANET V2") return 'EX2';
  if (upperWord === "PLANNING-GAME") return 'PLN';
  if (upperWord === "PLANNINGGAMEXP") return 'PLN';

  // Rule 1: 3 chars or less, return as-is
  if (upperWord.length <= 3) return upperWord.padStart(3, '_');

  // Extract consonants and vowels
  const consonants = upperWord.replace(/[AEIOUÁÉÍÓÚÜ\s\d]/gi, '').split('');
  const vowels = upperWord.replace(/[^AEIOUÁÉÍÓÚÜ]/gi, '').split('');

  // Check for trailing number
  const matchNumber = upperWord.match(/\d+$/);
  const lastNumber = matchNumber ? matchNumber[0] : null;

  // Rule 2: Number at end + 3+ consonants
  if (lastNumber && consonants.length >= 3) {
    return consonants.slice(0, 2).join('') + lastNumber;
  }

  // Rule 3: 3+ consonants
  if (consonants.length >= 3) {
    return consonants.slice(0, 3).join('');
  }

  // Rule 4: 2 consonants + first vowel
  if (consonants.length === 2) {
    return consonants.join('') + (vowels[0] || '_');
  }

  // Rule 5: 1 consonant + first and last vowel
  if (consonants.length === 1) {
    return consonants[0] + (vowels[0] || '_') + (vowels[vowels.length - 1] || '_');
  }

  // Rule 6: No consonants, first 3 letters
  return upperWord.slice(0, 3);
}

/**
 * Generate a unique card ID using Firestore transaction
 * Format: {PROJECT_ABBR}-{SECTION_ABBR}-{NUMBER}
 * Example: C4D-TSK-0042
 */
async function generateCardId(projectId, section) {
  const projectAbbr = getAbbrId(projectId);
  const sectionAbbr = getAbbrId(section);
  const counterKey = `${projectAbbr}-${sectionAbbr}`;

  const counterRef = firestore.collection('projectCounters').doc(counterKey);

  // Use transaction to ensure atomic increment
  const newId = await firestore.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(counterRef);

    let lastId = 0;
    if (docSnap.exists) {
      lastId = docSnap.data().lastId || 0;
    }

    const nextId = lastId + 1;
    transaction.set(counterRef, { lastId: nextId }, { merge: true });

    return nextId;
  });

  const paddedId = newId.toString().padStart(4, '0');
  return `${counterKey}-${paddedId}`;
}

/**
 * Validate create card request
 */
function validateCreateCardRequest(data) {
  const errors = [];

  if (!data.projectId || typeof data.projectId !== 'string') {
    errors.push('projectId is required and must be a string');
  }

  if (!data.type || !['task', 'bug'].includes(data.type)) {
    errors.push('type is required and must be "task" or "bug"');
  }

  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    errors.push('title is required and must be a non-empty string');
  }

  return errors;
}

/**
 * Build task card data structure
 */
function buildTaskCardData(data, cardId, firebaseId, createdBy) {
  const now = new Date().toISOString();

  // Build descriptionStructured from role/goal/benefit if provided
  let descriptionStructured = data.descriptionStructured || null;
  if (!descriptionStructured && (data.role || data.goal || data.benefit)) {
    descriptionStructured = {
      role: data.role || '',
      goal: data.goal || '',
      benefit: data.benefit || ''
    };
  }

  return {
    // Required fields
    cardId,
    id: firebaseId,
    firebaseId,
    cardType: 'task-card',
    group: 'tasks',
    section: 'tasks',
    projectId: data.projectId,
    title: data.title.trim(),
    createdBy,
    status: data.status || 'To Do',

    // Description: structured format preferred
    description: data.description || '', // Legacy field
    descriptionStructured,
    notes: data.notes || '',
    sprint: data.sprint || '',
    epic: data.epic || '',
    developer: data.developer || '',
    validator: data.validator || '',
    businessPoints: data.businessPoints || 0,
    devPoints: data.devPoints || 0,
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    desiredDate: data.desiredDate || '',
    year: data.year || new Date().getFullYear(),
    expedited: Boolean(data.expedited),
    blockedByBusiness: Boolean(data.blockedByBusiness),
    blockedByDevelopment: Boolean(data.blockedByDevelopment),
    acceptanceCriteria: data.acceptanceCriteria || '',
    acceptanceCriteriaStructured: data.acceptanceCriteriaStructured || [],
    repositoryLabel: data.repositoryLabel || '',
    coDeveloper: data.coDeveloper || '',

    // Metadata
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Build bug card data structure
 */
function buildBugCardData(data, cardId, firebaseId, createdBy) {
  const now = new Date().toISOString();

  // Build descriptionStructured from role/goal/benefit if provided
  let descriptionStructured = data.descriptionStructured || null;
  if (!descriptionStructured && (data.role || data.goal || data.benefit)) {
    descriptionStructured = {
      role: data.role || '',
      goal: data.goal || '',
      benefit: data.benefit || ''
    };
  }

  return {
    // Required fields
    cardId,
    id: firebaseId,
    firebaseId,
    cardType: 'bug-card',
    group: 'bugs',
    section: 'bugs',
    projectId: data.projectId,
    title: data.title.trim(),
    createdBy,
    status: data.status || 'Created',
    priority: data.priority || 'Not Evaluated',

    // Description: structured format preferred
    description: data.description || '', // Legacy field
    descriptionStructured,
    notes: data.notes || '',
    sprint: data.sprint || '',
    developer: data.developer || '',
    bugType: data.bugType || 'default',
    registerDate: data.registerDate || now.split('T')[0],
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    year: data.year || new Date().getFullYear(),
    acceptanceCriteria: data.acceptanceCriteria || '',
    acceptanceCriteriaStructured: data.acceptanceCriteriaStructured || [],

    // C4D specific fields (optional)
    cinemaFile: data.cinemaFile || '',
    exportedFile: data.exportedFile || '',
    importedFile: data.importedFile || '',
    plugin: data.plugin || '',
    pluginVersion: data.pluginVersion || '',
    treatmentType: data.treatmentType || '',

    // Metadata
    createdAt: now,
    updatedAt: now
  };
}

/**
 * HTTP endpoint to create cards programmatically
 *
 * Protected by API Key in header: x-api-key
 *
 * POST /createCard
 * Headers:
 *   x-api-key: YOUR_SECRET_KEY
 *   Content-Type: application/json
 *
 * Body for TASK:
 * {
 *   "type": "task",
 *   "projectId": "Cinema4D",
 *   "title": "Implement new feature X",
 *   "description": "As a user, I want...",
 *   "sprint": "Sprint 5",
 *   "epic": "Feature Epic",
 *   "developer": "dev@example.com",
 *   "businessPoints": 5,
 *   "devPoints": 8,
 *   "status": "To Do",
 *   "year": 2025
 * }
 *
 * Body for BUG:
 * {
 *   "type": "bug",
 *   "projectId": "Cinema4D",
 *   "title": "Button not working in settings",
 *   "description": "Steps to reproduce...",
 *   "priority": "High",
 *   "developer": "dev@example.com",
 *   "status": "Created",
 *   "year": 2025
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "cardId": "C4D-TSK-0042",
 *   "firebaseId": "-NxAbCdEfGh",
 *   "path": "/cards/Cinema4D/TASKS_Cinema4D/-NxAbCdEfGh"
 * }
 */
exports.createCard = onRequest({
  region: "europe-west1",
  cors: true,
  secrets: [CREATE_CARD_API_KEY]
}, async (req, res) => {
  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // Validate API Key
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const expectedKey = CREATE_CARD_API_KEY.value();

    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      logger.warn('createCard: Invalid or missing API key', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized. Invalid API key.' });
    }

    // Parse body
    const data = req.body || {};

    // Validate required fields
    const validationErrors = validateCreateCardRequest(data);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Verify project exists
    const db = getDatabase();
    const projectSnap = await db.ref(`/projects/${data.projectId}`).once('value');
    if (!projectSnap.exists()) {
      return res.status(404).json({ error: `Project "${data.projectId}" not found` });
    }

    // Determine section based on type
    const section = data.type === 'task' ? 'tasks' : 'bugs';
    const sectionPath = data.type === 'task'
      ? `TASKS_${data.projectId}`
      : `BUGS_${data.projectId}`;

    // Generate card ID
    const cardId = await generateCardId(data.projectId, section);

    // Generate Firebase ID
    const cardPath = `/cards/${data.projectId}/${sectionPath}`;
    const newCardRef = db.ref(cardPath).push();
    const firebaseId = newCardRef.key;

    // Build card data
    const createdBy = data.createdBy || process.env.PUBLIC_DEFAULT_API_EMAIL || 'api@example.com';
    const cardData = data.type === 'task'
      ? buildTaskCardData(data, cardId, firebaseId, createdBy)
      : buildBugCardData(data, cardId, firebaseId, createdBy);

    // Save to Firebase
    await newCardRef.set(cardData);

    logger.info('createCard: Card created successfully', {
      cardId,
      firebaseId,
      type: data.type,
      projectId: data.projectId
    });

    res.status(201).json({
      success: true,
      cardId,
      firebaseId,
      path: `${cardPath}/${firebaseId}`,
      type: data.type,
      title: cardData.title
    });

  } catch (error) {
    logger.error('createCard: Error creating card', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ============================================================================
// CREATE TASKS FROM PLAN - Generate task cards from an accepted development plan
// ============================================================================

/**
 * Creates task cards in Firebase from an accepted development plan.
 * Each phase's tasks become real task cards linked back to the plan.
 *
 * @param {string} projectId - The project ID
 * @param {string} planId - The Firebase plan ID
 * @returns {Object} - { createdTasks: [{cardId, firebaseId, title, phaseIndex}], totalCreated }
 */

/**
 * Infer which epic to assign to each phase.
 * Strategy:
 * - If phase already has epicIds assigned, use the first one
 * - If there are few phases (<=3) and the plan is cohesive, use/create a single epic for the whole plan
 * - For each phase, try to match its name against existing epic titles using keyword overlap
 * - If no match found, create a new epic based on the plan title
 *
 * @param {Object} db - Firebase database reference
 * @param {string} projectId - Project ID
 * @param {Array} phases - Plan phases
 * @param {Array} existingEpics - Existing epics [{firebaseId, cardId, title}]
 * @param {string} planTitle - The plan title (used for new epic naming)
 * @param {string} createdBy - Creator email
 * @param {string} now - ISO timestamp
 * @returns {Object} Map of phaseIndex -> epicCardId
 */
async function inferEpicsForPhases(db, projectId, phases, existingEpics, planTitle, createdBy, now) {
  const phaseEpicMap = {};

  // Check if any phase already has epicIds manually assigned
  const allHaveEpics = phases.every(p => p.epicIds && p.epicIds.length > 0);
  if (allHaveEpics) {
    phases.forEach((p, i) => { phaseEpicMap[i] = p.epicIds[0]; });
    return phaseEpicMap;
  }

  // Try to find a matching epic for the plan title
  const planKeywords = extractKeywords(planTitle);
  let bestMatch = findBestEpicMatch(planKeywords, existingEpics);

  // For cohesive plans (<=3 phases), use a single epic
  if (phases.length <= 3) {
    if (!bestMatch) {
      bestMatch = await createEpicForPlan(db, projectId, planTitle, createdBy, now);
    }
    phases.forEach((p, i) => {
      phaseEpicMap[i] = (p.epicIds && p.epicIds.length > 0) ? p.epicIds[0] : bestMatch;
    });
    return phaseEpicMap;
  }

  // For larger plans, try to match each phase individually
  const createdEpics = {};
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (phase.epicIds && phase.epicIds.length > 0) {
      phaseEpicMap[i] = phase.epicIds[0];
      continue;
    }

    const phaseKeywords = extractKeywords(phase.name);
    const match = findBestEpicMatch(phaseKeywords, existingEpics);
    if (match) {
      phaseEpicMap[i] = match;
    } else {
      // Use the plan-level epic (create once, reuse)
      if (!createdEpics.plan) {
        createdEpics.plan = bestMatch || await createEpicForPlan(db, projectId, planTitle, createdBy, now);
      }
      phaseEpicMap[i] = createdEpics.plan;
    }
  }

  return phaseEpicMap;
}

/**
 * Create a new epic card for a plan.
 */
async function createEpicForPlan(db, projectId, planTitle, createdBy, now) {
  const epicCardId = await generateCardId(projectId, 'epics');
  const epicSectionPath = `EPICS_${projectId}`;
  const epicPath = `/cards/${projectId}/${epicSectionPath}`;
  const newEpicRef = db.ref(epicPath).push();
  const firebaseId = newEpicRef.key;

  const epicData = {
    cardId: epicCardId,
    id: firebaseId,
    firebaseId,
    cardType: 'epic-card',
    group: 'epics',
    section: 'epics',
    projectId,
    title: planTitle,
    status: 'To Do',
    description: `Epic auto-created from development plan: ${planTitle}`,
    createdBy,
    year: new Date().getFullYear(),
    createdAt: now,
    updatedAt: now
  };

  await newEpicRef.set(epicData);
  logger.info('inferEpicsForPhases: Epic created for plan', { epicCardId, planTitle, projectId });

  return epicCardId;
}

exports.createTasksFromPlan = onCall({
  region: "europe-west1",
  memory: "256MiB",
  timeoutSeconds: 60
}, async (request) => {
  const { projectId, planId } = request.data || {};

  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'projectId is required');
  }
  if (!planId || typeof planId !== 'string') {
    throw new HttpsError('invalid-argument', 'planId is required');
  }

  const db = getDatabase();

  // Load the plan
  const planSnap = await db.ref(`/plans/${projectId}/${planId}`).once('value');
  if (!planSnap.exists()) {
    throw new HttpsError('not-found', `Plan "${planId}" not found in project "${projectId}"`);
  }
  const plan = planSnap.val();

  // Only accepted plans can generate tasks
  if (plan.status !== 'accepted') {
    throw new HttpsError('failed-precondition', 'Only accepted plans can generate tasks. Accept the plan first.');
  }

  // Check if tasks were already generated
  if (plan.generatedTasks && plan.generatedTasks.length > 0) {
    throw new HttpsError('already-exists', `This plan already has ${plan.generatedTasks.length} generated tasks. Use regenerate if you want to update them.`);
  }

  const phases = plan.phases || [];
  if (phases.length === 0) {
    throw new HttpsError('failed-precondition', 'Plan has no phases to generate tasks from.');
  }

  const createdTasks = [];
  const sectionPath = `TASKS_${projectId}`;
  const cardPath = `/cards/${projectId}/${sectionPath}`;
  const now = new Date().toISOString();
  const createdBy = request.auth?.token?.email || 'system';

  // Load existing epics for inference
  const epicsPath = `/cards/${projectId}/EPICS_${projectId}`;
  const epicsSnap = await db.ref(epicsPath).once('value');
  const epicsData = epicsSnap.val() || {};
  const existingEpics = Object.entries(epicsData)
    .filter(([, epic]) => !epic.deletedAt)
    .map(([fbId, epic]) => ({
      firebaseId: fbId,
      cardId: epic.cardId || fbId,
      title: (epic.title || '').toLowerCase()
    }));

  // Infer or create epic for each phase
  const phaseEpicMap = await inferEpicsForPhases(db, projectId, phases, existingEpics, plan.title, createdBy, now);

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const phase = phases[phaseIndex];
    const phaseTasks = phase.tasks || [];
    const epicId = phaseEpicMap[phaseIndex] || '';

    for (const task of phaseTasks) {
      if (!task.title) continue;

      // Generate unique card ID
      const cardId = await generateCardId(projectId, 'tasks');

      // Generate Firebase push key
      const newCardRef = db.ref(cardPath).push();
      const firebaseId = newCardRef.key;

      // Build description structured from AI task data
      const descriptionStructured = {
        role: task.como || '',
        goal: task.quiero || '',
        benefit: task.para || ''
      };

      // Build card data
      const cardData = {
        cardId,
        id: firebaseId,
        firebaseId,
        cardType: 'task-card',
        group: 'tasks',
        section: 'tasks',
        projectId,
        title: task.title.trim(),
        createdBy,
        status: 'To Do',
        description: '',
        descriptionStructured,
        notes: '',
        sprint: '',
        epic: epicId,
        developer: '',
        validator: '',
        businessPoints: 0,
        devPoints: 0,
        startDate: '',
        endDate: '',
        desiredDate: '',
        year: new Date().getFullYear(),
        expedited: false,
        blockedByBusiness: false,
        blockedByDevelopment: false,
        acceptanceCriteria: '',
        acceptanceCriteriaStructured: [],
        repositoryLabel: '',
        coDeveloper: '',
        planId,
        planPhase: phase.name || `Phase ${phaseIndex + 1}`,
        createdAt: now,
        updatedAt: now
      };

      await newCardRef.set(cardData);

      createdTasks.push({
        cardId,
        firebaseId,
        title: task.title.trim(),
        phaseIndex,
        epic: epicId
      });

      logger.info('createTasksFromPlan: Task created', { cardId, planId, phaseIndex, epic: epicId });
    }
  }

  // Update plan with generated task references
  const generatedTasksData = createdTasks.map(t => ({
    cardId: t.cardId,
    firebaseId: t.firebaseId,
    phaseIndex: t.phaseIndex
  }));

  // Also update each phase with its taskIds and inferred epicIds
  const updatedPhases = phases.map((phase, i) => {
    const phaseTaskIds = createdTasks
      .filter(t => t.phaseIndex === i)
      .map(t => t.cardId);
    const inferredEpic = phaseEpicMap[i];
    const epicIds = inferredEpic
      ? [...new Set([...(phase.epicIds || []), inferredEpic])]
      : (phase.epicIds || []);
    return {
      ...phase,
      taskIds: [...(phase.taskIds || []), ...phaseTaskIds],
      epicIds
    };
  });

  await db.ref(`/plans/${projectId}/${planId}`).update({
    generatedTasks: generatedTasksData,
    phases: updatedPhases,
    updatedAt: now
  });

  logger.info('createTasksFromPlan: All tasks created', {
    planId,
    projectId,
    totalCreated: createdTasks.length
  });

  return {
    createdTasks,
    totalCreated: createdTasks.length
  };
});

/**
 * Regenerate tasks from a plan that was modified.
 * Deletes previously generated tasks (only if still in "To Do") and creates new ones.
 */
exports.regenerateTasksFromPlan = onCall({
  region: "europe-west1",
  memory: "256MiB",
  timeoutSeconds: 60
}, async (request) => {
  const { projectId, planId } = request.data || {};

  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'projectId is required');
  }
  if (!planId || typeof planId !== 'string') {
    throw new HttpsError('invalid-argument', 'planId is required');
  }

  const db = getDatabase();

  // Load the plan
  const planSnap = await db.ref(`/plans/${projectId}/${planId}`).once('value');
  if (!planSnap.exists()) {
    throw new HttpsError('not-found', `Plan "${planId}" not found`);
  }
  const plan = planSnap.val();

  if (plan.status !== 'accepted') {
    throw new HttpsError('failed-precondition', 'Only accepted plans can regenerate tasks.');
  }

  const previousTasks = plan.generatedTasks || [];
  const sectionPath = `TASKS_${projectId}`;
  const cardPath = `/cards/${projectId}/${sectionPath}`;
  const skippedTasks = [];

  // Delete previous tasks that are still in "To Do"
  for (const prev of previousTasks) {
    const taskSnap = await db.ref(`${cardPath}/${prev.firebaseId}`).once('value');
    if (!taskSnap.exists()) continue;

    const taskData = taskSnap.val();
    if (taskData.status === 'To Do') {
      await db.ref(`${cardPath}/${prev.firebaseId}`).remove();
      logger.info('regenerateTasksFromPlan: Deleted To Do task', { cardId: prev.cardId });
    } else {
      skippedTasks.push({
        cardId: prev.cardId,
        status: taskData.status,
        reason: 'Task already started, cannot delete'
      });
    }
  }

  // Clear generatedTasks and phase taskIds for regeneration
  const cleanedPhases = (plan.phases || []).map(phase => {
    const prevTaskIds = previousTasks
      .filter(t => !skippedTasks.find(s => s.cardId === t.cardId))
      .map(t => t.cardId);
    return {
      ...phase,
      taskIds: (phase.taskIds || []).filter(id => !prevTaskIds.includes(id))
    };
  });

  await db.ref(`/plans/${projectId}/${planId}`).update({
    generatedTasks: null,
    phases: cleanedPhases
  });

  // Now create new tasks using the existing function logic
  const createFn = exports.createTasksFromPlan;
  // Instead of calling itself, inline the creation
  const phases = cleanedPhases;
  const createdTasks = [];
  const now = new Date().toISOString();
  const createdBy = request.auth?.token?.email || 'system';

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const phase = phases[phaseIndex];
    const phaseTasks = phase.tasks || [];

    for (const task of phaseTasks) {
      if (!task.title) continue;

      const cardId = await generateCardId(projectId, 'tasks');
      const newCardRef = db.ref(cardPath).push();
      const firebaseId = newCardRef.key;

      const descriptionStructured = {
        role: task.como || '',
        goal: task.quiero || '',
        benefit: task.para || ''
      };

      const cardData = {
        cardId,
        id: firebaseId,
        firebaseId,
        cardType: 'task-card',
        group: 'tasks',
        section: 'tasks',
        projectId,
        title: task.title.trim(),
        createdBy,
        status: 'To Do',
        description: '',
        descriptionStructured,
        notes: '',
        sprint: '',
        epic: (phase.epicIds && phase.epicIds.length > 0) ? phase.epicIds[0] : '',
        developer: '',
        validator: '',
        businessPoints: 0,
        devPoints: 0,
        startDate: '',
        endDate: '',
        desiredDate: '',
        year: new Date().getFullYear(),
        expedited: false,
        blockedByBusiness: false,
        blockedByDevelopment: false,
        acceptanceCriteria: '',
        acceptanceCriteriaStructured: [],
        repositoryLabel: '',
        coDeveloper: '',
        planId,
        planPhase: phase.name || `Phase ${phaseIndex + 1}`,
        createdAt: now,
        updatedAt: now
      };

      await newCardRef.set(cardData);
      createdTasks.push({ cardId, firebaseId, title: task.title.trim(), phaseIndex });
    }
  }

  // Update plan with new generated tasks
  const generatedTasksData = createdTasks.map(t => ({
    cardId: t.cardId,
    firebaseId: t.firebaseId,
    phaseIndex: t.phaseIndex
  }));

  const updatedPhases = phases.map((phase, i) => {
    const phaseTaskIds = createdTasks
      .filter(t => t.phaseIndex === i)
      .map(t => t.cardId);
    return {
      ...phase,
      taskIds: [...(phase.taskIds || []), ...phaseTaskIds]
    };
  });

  await db.ref(`/plans/${projectId}/${planId}`).update({
    generatedTasks: generatedTasksData,
    phases: updatedPhases,
    updatedAt: now
  });

  return {
    createdTasks,
    totalCreated: createdTasks.length,
    skippedTasks
  };
});

// ============================================================================
// PARSE DOCUMENT FOR CARDS - Generate tasks/bugs from text documents
// ============================================================================

/**
 * Call OpenAI API to parse document content and generate tasks/bugs
 */
async function callOpenAIForDocumentParsing(apiKey, documentContent, existingEpics, projectName, scoringSystem = '1-5') {
  const epicsList = existingEpics.length > 0
    ? existingEpics.map(e => `- "${e.title}" (${e.cardId})`).join('\n')
    : 'No hay épicas existentes en el proyecto.';

  // Get valid businessPoints values based on scoring system
  const businessPointsValues = scoringSystem === 'fibonacci' ? '1, 2, 3, 5, 8, 13' : '1, 2, 3, 4, 5';
  const businessPointsDefault = scoringSystem === 'fibonacci' ? '3' : '3';

  const systemPrompt = [
    'Eres un analista de producto experto que extrae requisitos de documentos.',
    'Tu tarea es analizar el documento proporcionado e identificar todas las tareas y bugs necesarios.',
    '',
    'IMPORTANTE: Devuelve SOLO JSON válido con esta estructura:',
    '',
    'Para TASKS (nuevas funcionalidades o mejoras):',
    `{"type":"task","title":"título","como":"rol del usuario","quiero":"acción deseada","para":"beneficio esperado","businessPoints":${businessPointsDefault},"epic":"épica","epicSuggested":true|false}`,
    '',
    'Para BUGS (problemas o errores):',
    '{"type":"bug","title":"título","description":"descripción del problema","priority":"APPLICATION BLOCKER|DEPARTMENT BLOCKER|INDIVIDUAL BLOCKER|USER EXPERIENCE ISSUE|WORKFLOW IMPROVEMENT|WORKAROUND AVAILABLE ISSUE","epic":"épica","epicSuggested":true|false}',
    '',
    'Estructura final: {"items":[...]}',
    '',
    'Reglas:',
    '- Identifica cada funcionalidad, mejora o problema como un item separado',
    '- type: "task" para nuevas funcionalidades o mejoras, "bug" para problemas o errores',
    '- title: máximo 100 caracteres, claro y específico',
    '',
    'Para TASKS:',
    `- businessPoints: OBLIGATORIO - Representa el VALOR DE NEGOCIO o importancia para el stakeholder (valores válidos: ${businessPointsValues})`,
    '  - Extrae la prioridad/importancia del texto si está indicada y mapéala a businessPoints:',
    '    - "crítico", "urgente", "muy alta", "alta prioridad" → valor alto (4-5 o 5-8 en fibonacci)',
    '    - "normal", "media", "estándar" → valor medio (3)',
    '    - "baja", "menor importancia", "nice-to-have" → valor bajo (1-2)',
    '  - Si no se indica prioridad, evalúa el impacto en negocio según contexto',
    '- usa formato historia de usuario (como/quiero/para)',
    '  - como: el rol o tipo de usuario (ej: "usuario registrado", "administrador")',
    '  - quiero: la acción o funcionalidad deseada',
    '  - para: el beneficio o valor que aporta',
    '',
    'Para BUGS:',
    '- priority: OBLIGATORIO - usa los valores exactos listados según severidad',
    '- usa description con explicación clara del problema',
    '',
    '- epic: asigna una épica existente si encaja, o sugiere una nueva si es necesario',
    '- epicSuggested: true si la épica es nueva (no existe), false si ya existe',
    '',
    `Proyecto: ${projectName}`,
    `Sistema de puntuación del proyecto: ${scoringSystem} (valores businessPoints: ${businessPointsValues})`,
    '',
    'Épicas existentes en el proyecto:',
    epicsList,
    '',
    'El contenido debe estar en español.',
    'Genera tantos items como sean necesarios para cubrir todo el documento.'
  ].join('\n');

  const userPrompt = [
    'Analiza el siguiente documento y genera la lista de tareas y bugs necesarios:',
    '',
    '---DOCUMENTO---',
    documentContent,
    '---FIN DOCUMENTO---'
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Error parsing document with OpenAI', { status: response.status, errorBody });
    throw new HttpsError('internal', 'No se pudo analizar el documento con IA.');
  }

  return response.json();
}

/**
 * Parse and validate document parsing response from OpenAI
 */
function parseDocumentParsingResponse(aiData) {
  const content = aiData?.choices?.[0]?.message?.content || '';

  if (!content) {
    logger.error('Empty OpenAI response for document parsing', { aiData });
    throw new HttpsError('internal', 'La IA devolvió una respuesta vacía.');
  }

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    logger.error('Invalid JSON from OpenAI for document parsing', { content, error: parseError.message });
    throw new HttpsError('internal', 'La IA devolvió JSON inválido.');
  }

  // Validate structure
  if (!parsed || !Array.isArray(parsed.items)) {
    logger.error('Missing items array in document parsing response', { parsed });
    throw new HttpsError('internal', 'La IA no devolvió el array "items" esperado.');
  }

  // Validate each item
  const validItems = [];
  parsed.items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      logger.warn(`Skipping invalid item at index ${index}`);
      return;
    }

    const type = (item.type || '').toLowerCase();
    if (type !== 'task' && type !== 'bug') {
      logger.warn(`Skipping item with invalid type at index ${index}`, { type });
      return;
    }

    const title = (item.title || '').trim();
    if (!title || title.length < 3) {
      logger.warn(`Skipping item with invalid title at index ${index}`);
      return;
    }

    const validItem = {
      type,
      title: title.substring(0, 150), // Limit title length
      epic: (item.epic || '').trim(),
      epicSuggested: Boolean(item.epicSuggested)
    };

    // Tasks use como/quiero/para format, bugs use description
    if (type === 'task') {
      validItem.como = (item.como || '').trim().substring(0, 500);
      validItem.quiero = (item.quiero || '').trim().substring(0, 1000);
      validItem.para = (item.para || '').trim().substring(0, 500);
    } else {
      validItem.description = (item.description || '').trim().substring(0, 2000);
    }

    validItems.push(validItem);
  });

  if (validItems.length === 0) {
    throw new HttpsError('failed-precondition', 'La IA no pudo extraer tareas o bugs del documento.');
  }

  return validItems;
}

/**
 * Parse a document and generate tasks/bugs using OpenAI.
 *
 * Request data:
 * - projectId: string (required)
 * - documentContent: string (required) - The text content of the document
 * - fileName: string (optional) - Original file name for reference
 *
 * Response:
 * {
 *   "status": "ok",
 *   "items": [
 *     {
 *       "type": "task" | "bug",
 *       "title": "...",
 *       "description": "...",
 *       "epic": "Nombre de épica",
 *       "epicSuggested": true | false
 *     }
 *   ],
 *   "existingEpics": [...] // List of existing epics for reference
 * }
 */
exports.parseDocumentForCards = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  // Validate auth
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar esta función.');
  }

  // Validate global IA is enabled
  const globalIaEnabled = (IA_GLOBAL_ENABLE.value() || '').toString().trim().toLowerCase() !== 'false';
  if (!globalIaEnabled) {
    throw new HttpsError('failed-precondition', 'La IA no está habilitada globalmente.');
  }

  // Validate request data
  const data = request.data || {};
  const { projectId, documentContent, fileName, scoringSystem } = data;

  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'projectId es requerido.');
  }

  if (!documentContent || typeof documentContent !== 'string') {
    throw new HttpsError('invalid-argument', 'documentContent es requerido.');
  }

  // Limit document size (approx 50KB of text)
  const maxContentLength = 50000;
  if (documentContent.length > maxContentLength) {
    throw new HttpsError('invalid-argument', `El documento es demasiado largo. Máximo ${maxContentLength} caracteres.`);
  }

  const apiKey = getIaApiKey();
  const db = primaryDb;

  // Verify project exists and get its name
  const projectSnap = await db.ref(`/projects/${projectId}`).once('value');
  if (!projectSnap.exists()) {
    throw new HttpsError('not-found', 'Proyecto no encontrado.');
  }
  const project = projectSnap.val() || {};
  const projectName = project.name || projectId;

  // Get existing epics for the project
  const epicsPath = `/cards/${projectId}/EPICS_${projectId}`;
  const epicsSnap = await db.ref(epicsPath).once('value');
  const epicsData = epicsSnap.val() || {};

  const existingEpics = Object.entries(epicsData)
    .filter(([, epic]) => !epic.deletedAt)
    .map(([firebaseId, epic]) => ({
      cardId: epic.cardId || firebaseId,
      firebaseId,
      title: epic.title || '',
      epicType: epic.epicType || 'default'
    }))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  // Call OpenAI to parse the document
  logger.info('parseDocumentForCards: Starting document analysis', {
    projectId,
    fileName: fileName || 'unknown',
    contentLength: documentContent.length,
    existingEpicsCount: existingEpics.length
  });

  // Get project scoring system (defaults to '1-5' if not specified)
  const projectScoringSystem = scoringSystem || project.scoringSystem || '1-5';

  const aiData = await callOpenAIForDocumentParsing(apiKey, documentContent, existingEpics, projectName, projectScoringSystem);
  const items = parseDocumentParsingResponse(aiData);

  logger.info('parseDocumentForCards: Analysis complete', {
    projectId,
    scoringSystem: projectScoringSystem,
    itemsCount: items.length,
    taskCount: items.filter(i => i.type === 'task').length,
    bugCount: items.filter(i => i.type === 'bug').length
  });

  return {
    status: 'ok',
    items,
    existingEpics: existingEpics.map(e => ({
      cardId: e.cardId,
      title: e.title
    }))
  };
});

// ============================================================================
// GENERATE DEV PLAN - Generate a structured development plan from a description
// ============================================================================

async function callOpenAIForPlanGeneration(apiKey, context, existingEpics, projectName, existingPlanJson) {
  const epicsList = existingEpics.length > 0
    ? existingEpics.map(e => `- "${e.title}" (${e.cardId})`).join('\n')
    : 'No hay épicas existentes en el proyecto.';

  const refinementBlock = existingPlanJson
    ? [
      '',
      'PLAN ANTERIOR (el usuario quiere refinarlo/mejorarlo con el nuevo contexto):',
      existingPlanJson,
      '',
      'Mejora el plan anterior incorporando el nuevo contexto. Mantén lo que siga siendo válido.',
    ].join('\n')
    : '';

  const systemPrompt = [
    'Eres un arquitecto de software y project manager experto que crea planes de desarrollo estructurados.',
    'Tu tarea es analizar el contexto proporcionado y generar un plan de desarrollo con fases y tareas.',
    '',
    'IMPORTANTE: Devuelve SOLO JSON válido con esta estructura:',
    '{',
    '  "title": "Título conciso del plan",',
    '  "objective": "Objetivo general del plan en 1-2 frases",',
    '  "phases": [',
    '    {',
    '      "name": "Nombre de la fase",',
    '      "description": "Descripción de lo que se hace en esta fase",',
    '      "tasks": [',
    '        {',
    '          "title": "Título de la tarea (máx 100 chars)",',
    '          "como": "rol del usuario",',
    '          "quiero": "acción deseada",',
    '          "para": "beneficio esperado"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    'Reglas:',
    '- Genera entre 2 y 6 fases lógicas que representen etapas del desarrollo',
    '- Cada fase debe tener entre 1 y 8 tareas concretas',
    '- Las fases deben estar ordenadas por dependencia (lo primero primero)',
    '- Cada tarea debe ser atómica y realizable en 1-3 días máximo',
    '- El título del plan debe ser descriptivo pero conciso (máx 80 chars)',
    '- Las tareas usan formato historia de usuario (como/quiero/para)',
    '- Si el contexto es insuficiente, genera lo que puedas y pon tareas genéricas marcando claramente qué necesita más detalle',
    '',
    `Proyecto: ${projectName}`,
    '',
    'Épicas existentes en el proyecto:',
    epicsList,
    '',
    'El contenido debe estar en español.',
    refinementBlock
  ].join('\n');

  const userPrompt = [
    'Genera un plan de desarrollo estructurado a partir del siguiente contexto:',
    '',
    '---CONTEXTO---',
    context,
    '---FIN CONTEXTO---'
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Error generating dev plan with OpenAI', { status: response.status, errorBody });
    throw new HttpsError('internal', 'No se pudo generar el plan con IA.');
  }

  return response.json();
}

exports.generateDevPlan = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar esta función.');
  }

  const globalIaEnabled = (IA_GLOBAL_ENABLE.value() || '').toString().trim().toLowerCase() !== 'false';
  if (!globalIaEnabled) {
    throw new HttpsError('failed-precondition', 'La IA no está habilitada globalmente.');
  }

  const data = request.data || {};
  const { projectId, context, existingPlanJson } = data;

  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'projectId es requerido.');
  }
  if (!context || typeof context !== 'string' || context.trim().length < 10) {
    throw new HttpsError('invalid-argument', 'Se necesita un contexto con al menos 10 caracteres.');
  }
  if (context.length > 50000) {
    throw new HttpsError('invalid-argument', 'El contexto es demasiado largo. Máximo 50.000 caracteres.');
  }

  const apiKey = getIaApiKey();
  const db = primaryDb;

  const projectSnap = await db.ref(`/projects/${projectId}`).once('value');
  if (!projectSnap.exists()) {
    throw new HttpsError('not-found', 'Proyecto no encontrado.');
  }
  const project = projectSnap.val() || {};
  const projectName = project.name || projectId;

  const epicsPath = `/cards/${projectId}/EPICS_${projectId}`;
  const epicsSnap = await db.ref(epicsPath).once('value');
  const epicsData = epicsSnap.val() || {};
  const existingEpics = Object.entries(epicsData)
    .filter(([, epic]) => !epic.deletedAt)
    .map(([firebaseId, epic]) => ({
      cardId: epic.cardId || firebaseId,
      title: epic.title || ''
    }))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  logger.info('generateDevPlan: Starting plan generation', {
    projectId,
    contextLength: context.length,
    hasExistingPlan: !!existingPlanJson,
    existingEpicsCount: existingEpics.length
  });

  const aiData = await callOpenAIForPlanGeneration(apiKey, context, existingEpics, projectName, existingPlanJson || null);
  const content = aiData?.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new HttpsError('internal', 'La IA no devolvió contenido.');
  }

  let plan;
  try {
    plan = JSON.parse(content);
  } catch (err) {
    logger.error('generateDevPlan: Invalid JSON from OpenAI', { content });
    throw new HttpsError('internal', 'La IA devolvió un formato inválido.');
  }

  if (!plan.title || !plan.phases || !Array.isArray(plan.phases)) {
    throw new HttpsError('internal', 'El plan generado no tiene la estructura esperada.');
  }

  plan.phases = plan.phases
    .filter(phase => phase.name && Array.isArray(phase.tasks))
    .map(phase => ({
      name: (phase.name || '').slice(0, 150),
      description: (phase.description || '').slice(0, 500),
      tasks: (phase.tasks || [])
        .filter(t => t.title)
        .map(t => ({
          title: (t.title || '').slice(0, 150),
          como: (t.como || '').slice(0, 300),
          quiero: (t.quiero || '').slice(0, 500),
          para: (t.para || '').slice(0, 300)
        }))
    }));

  const totalTasks = plan.phases.reduce((sum, p) => sum + p.tasks.length, 0);

  logger.info('generateDevPlan: Plan generated', {
    projectId,
    title: plan.title,
    phases: plan.phases.length,
    totalTasks
  });

  return {
    status: 'ok',
    plan: {
      title: (plan.title || '').slice(0, 150),
      objective: (plan.objective || '').slice(0, 500),
      phases: plan.phases
    },
    existingEpics: existingEpics.map(e => ({ cardId: e.cardId, title: e.title }))
  };
});

// ============================================================================
// CONVERT DESCRIPTION TO USER STORY - Transform legacy descriptions to como/quiero/para
// ============================================================================

/**
 * Convert a plain description to user story format (como/quiero/para) using OpenAI
 *
 * Request data:
 * - description: string (required) - The plain description to convert
 * - title: string (optional) - The card title for context
 *
 * Response:
 * {
 *   "status": "ok",
 *   "como": "...",
 *   "quiero": "...",
 *   "para": "..."
 * }
 */
exports.convertDescriptionToUserStory = onCall({
  region: "europe-west1",
  secrets: [IA_API_KEY, IA_GLOBAL_ENABLE]
}, async (request) => {
  // Validate auth
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar esta función.');
  }

  // Validate global IA is enabled
  const globalIaEnabled = (IA_GLOBAL_ENABLE.value() || '').toString().trim().toLowerCase() !== 'false';
  if (!globalIaEnabled) {
    throw new HttpsError('failed-precondition', 'La IA no está habilitada globalmente.');
  }

  // Validate request data
  const data = request.data || {};
  const { description, title } = data;

  if (!description || typeof description !== 'string' || description.trim().length < 5) {
    throw new HttpsError('invalid-argument', 'La descripción es requerida y debe tener al menos 5 caracteres.');
  }

  const apiKey = getIaApiKey();

  const systemPrompt = [
    'Eres un analista de producto experto.',
    'Tu tarea es convertir una descripción de tarea en formato de historia de usuario.',
    '',
    'IMPORTANTE: Devuelve SOLO JSON válido con esta estructura exacta:',
    '{"como":"rol del usuario","quiero":"acción deseada","para":"beneficio esperado"}',
    '',
    'Reglas:',
    '- como: el rol o tipo de usuario (ej: "usuario registrado", "administrador", "cliente")',
    '- quiero: la acción o funcionalidad deseada, comenzando con un verbo en infinitivo',
    '- para: el beneficio o valor que aporta esta funcionalidad',
    '- Mantén el contenido en español',
    '- Sé conciso pero claro',
    '- Infiere el rol de usuario si no está claro en la descripción'
  ].join('\n');

  const userPrompt = title
    ? `Convierte esta descripción de la tarea "${title}" a formato historia de usuario:\n\n${description}`
    : `Convierte esta descripción a formato historia de usuario:\n\n${description}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Error converting description with OpenAI', { status: response.status, errorBody });
    throw new HttpsError('internal', 'No se pudo convertir la descripción con IA.');
  }

  const aiData = await response.json();
  const content = aiData?.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new HttpsError('internal', 'La IA devolvió una respuesta vacía.');
  }

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    logger.error('Invalid JSON from OpenAI for description conversion', { content });
    throw new HttpsError('internal', 'La IA devolvió JSON inválido.');
  }

  if (!parsed.como || !parsed.quiero || !parsed.para) {
    throw new HttpsError('internal', 'La IA no devolvió todos los campos requeridos.');
  }

  logger.info('convertDescriptionToUserStory: Conversion complete', {
    originalLength: description.length,
    como: parsed.como.substring(0, 50),
    quiero: parsed.quiero.substring(0, 50)
  });

  return {
    status: 'ok',
    como: parsed.como.trim(),
    quiero: parsed.quiero.trim(),
    para: parsed.para.trim()
  };
});

// ============================================================================
// GET PROJECT EPICS API - For IA to assign epics automatically
// ============================================================================

/**
 * HTTP endpoint to get epics for a project
 *
 * Protected by API Key in header: x-api-key (same as createCard)
 *
 * GET /getProjectEpics?projectId=Cinema4D
 * Headers:
 *   x-api-key: YOUR_SECRET_KEY
 *
 * Optional query params:
 *   year: Filter epics by year (e.g., 2025)
 *   includeAll: If "true", include epics without year field
 *
 * Response:
 * {
 *   "success": true,
 *   "projectId": "Cinema4D",
 *   "count": 5,
 *   "epics": [
 *     {
 *       "cardId": "C4D-EPC-0001",
 *       "title": "Frontend Improvements",
 *       "description": "All frontend related tasks",
 *       "epicType": "feature",
 *       "year": 2025,
 *       "status": "In Progress"
 *     }
 *   ]
 * }
 */
exports.getProjectEpics = onRequest({
  region: "europe-west1",
  cors: true,
  secrets: [CREATE_CARD_API_KEY]
}, async (req, res) => {
  try {
    // Allow GET and POST
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    }

    // Validate API Key
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const expectedKey = CREATE_CARD_API_KEY.value();

    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      logger.warn('getProjectEpics: Invalid or missing API key', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized. Invalid API key.' });
    }

    // Get projectId from query or body
    const projectId = req.query.projectId || req.body?.projectId;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Optional filters
    const yearFilter = req.query.year || req.body?.year;
    const includeAll = (req.query.includeAll || req.body?.includeAll) === 'true';

    // Verify project exists
    const db = getDatabase();
    const projectSnap = await db.ref(`/projects/${projectId}`).once('value');
    if (!projectSnap.exists()) {
      return res.status(404).json({ error: `Project "${projectId}" not found` });
    }

    // Get epics from Firebase
    const epicsPath = `/cards/${projectId}/EPICS_${projectId}`;
    const epicsSnap = await db.ref(epicsPath).once('value');
    const epicsData = epicsSnap.val() || {};

    // Process and filter epics
    const epics = [];
    Object.entries(epicsData).forEach(([firebaseId, epic]) => {
      // Skip deleted epics
      if (epic.deletedAt) return;

      // Apply year filter if specified
      if (yearFilter) {
        const targetYear = Number(yearFilter);
        if (epic.year) {
          if (Number(epic.year) !== targetYear) return;
        } else if (!includeAll) {
          // Skip epics without year unless includeAll is true
          return;
        }
      }

      epics.push({
        cardId: epic.cardId || firebaseId,
        firebaseId,
        title: epic.title || '',
        description: epic.description || '',
        epicType: epic.epicType || 'default',
        year: epic.year || null,
        status: epic.status || '',
        startDate: epic.startDate || '',
        endDate: epic.endDate || '',
        businessPoints: epic.businessPoints || 0,
        devPoints: epic.devPoints || 0
      });
    });

    // Sort by title for consistency
    epics.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    logger.info('getProjectEpics: Epics retrieved', {
      projectId,
      count: epics.length,
      yearFilter: yearFilter || 'none'
    });

    res.json({
      success: true,
      projectId,
      count: epics.length,
      epics
    });

  } catch (error) {
    logger.error('getProjectEpics: Error retrieving epics', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * Cloud Function: onCardToValidate
 * Triggers when a card is updated, creates push notifications
 * and queues email for hourly digest when a task transitions to "To Validate".
 */
exports.onCardToValidate = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  const beforeData = event.data.before.val();
  const afterData = event.data.after.val();

  const db = getDatabase();

  return handleCardToValidate(
    { projectId, section, cardId },
    beforeData,
    afterData,
    {
      db,
      logger
    }
  );
});

/**
 * Cloud Function: onBugFixed
 * Triggers when a bug is updated, creates push notifications
 * and queues email for hourly digest when a bug transitions to "Fixed".
 * Notifies the bug creator so they can verify the fix.
 */
exports.onBugFixed = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  const beforeData = event.data.before.val();
  const afterData = event.data.after.val();

  const db = getDatabase();

  return handleBugFixed(
    { projectId, section, cardId },
    beforeData,
    afterData,
    {
      db,
      logger
    }
  );
});

/**
 * Cloud Function: onPortalBugResolved
 * Triggers when a bug is updated. If the bug was created from the
 * Portal de Incidencias and transitions to "Fixed" or "Verified",
 * notifies the Portal via POST so the ticket is auto-resolved.
 */
exports.onPortalBugResolved = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1",
  secrets: [CREATE_CARD_API_KEY]
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  const beforeData = event.data.before.val();
  const afterData = event.data.after.val();

  return handlePortalBugResolved(
    { projectId, section, cardId },
    beforeData,
    afterData,
    {
      axios,
      apiKey: CREATE_CARD_API_KEY.value(),
      logger
    }
  );
});

/**
 * Cloud Function: onTaskStatusValidation
 * Validates task status transitions and reverts invalid changes.
 *
 * Validations:
 * 1. To "To Validate": requires validator, title, developer, startDate
 * 2. To "Done" or "Done&Validated": only validator/coValidator can change
 */
exports.onTaskStatusValidation = onValueUpdated({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  const beforeData = event.data.before.val();
  const afterData = event.data.after.val();

  const db = getDatabase();

  return handleTaskStatusValidation(
    { projectId, section, cardId },
    beforeData,
    afterData,
    { db, logger }
  );
});

/**
 * Cloud Function: syncCardViews
 * Syncs card data to optimized views for reduced data transfer.
 *
 * Triggers on any write (create/update/delete) to /cards/{projectId}/{section}/{cardId}
 * and maintains denormalized views at:
 * - /views/task-list/{projectId}/{firebaseId}
 * - /views/bug-list/{projectId}/{firebaseId}
 * - /views/proposal-list/{projectId}/{firebaseId}
 *
 * This reduces Firebase traffic by ~70-80% for table views.
 */
exports.syncCardViews = onValueWritten({
  ref: "/cards/{projectId}/{section}/{cardId}",
  region: "europe-west1"
}, async (event) => {
  const { projectId, section, cardId } = event.params;
  const beforeData = event.data.before?.val() || null;
  const afterData = event.data.after?.val() || null;

  const db = getDatabase();

  return handleSyncCardViews(
    { projectId, section, cardId },
    beforeData,
    afterData,
    { db, logger }
  );
});

/**
 * Cloud Function: resyncAllViews
 * Callable function that re-generates all /views entries from /cards data.
 * Useful when view extraction logic changes (e.g., new fields like notesCount).
 * Requires authenticated user with appAdmin or superAdmin claim.
 */
exports.resyncAllViews = onCall({
  region: "europe-west1",
  timeoutSeconds: 120
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const callerClaims = request.auth.token;
  const superAdminEmail = process.env.PUBLIC_SUPER_ADMIN_EMAIL || '';
  const isSuperAdmin = request.auth.token.email === superAdminEmail;
  const isAppAdmin = callerClaims.isAppAdmin === true;

  if (!isSuperAdmin && !isAppAdmin) {
    throw new HttpsError('permission-denied', 'Only admins can resync views.');
  }

  const db = getDatabase();
  const cardsSnap = await db.ref('/cards').once('value');
  if (!cardsSnap.exists()) {
    return { success: true, message: 'No cards found', stats: {} };
  }

  const cardsData = cardsSnap.val();
  const stats = { tasks: 0, bugs: 0, proposals: 0, projects: 0 };
  const updates = {};

  for (const [projectId, projectData] of Object.entries(cardsData)) {
    if (!projectData || typeof projectData !== 'object') continue;
    stats.projects++;

    for (const [sectionName, sectionData] of Object.entries(projectData)) {
      if (!sectionData || typeof sectionData !== 'object') continue;

      const sectionLower = sectionName.toLowerCase();
      let viewType = null;
      if (sectionLower.startsWith('tasks_')) viewType = 'task-list';
      else if (sectionLower.startsWith('bugs_')) viewType = 'bug-list';
      else if (sectionLower.startsWith('proposals_')) viewType = 'proposal-list';
      else continue;

      for (const [cardId, cardData] of Object.entries(sectionData)) {
        if (!cardData || typeof cardData !== 'object') continue;
        if (cardData.deletedAt) continue;

        // Use the same handler to build view data
        await handleSyncCardViews(
          { projectId, section: sectionName, cardId },
          null,
          cardData,
          { db, logger }
        );

        if (viewType === 'task-list') stats.tasks++;
        else if (viewType === 'bug-list') stats.bugs++;
        else if (viewType === 'proposals') stats.proposals++;
      }
    }
  }

  logger.info('resyncAllViews completed', stats);
  return { success: true, stats };
});

/**
 * Helper function to decode Firebase-safe email back to original email
 * Reverses: @ -> |, . -> !, # -> -
 */
function decodeEmailFromFirebase(encodedEmail) {
  if (!encodedEmail) return null;
  return encodedEmail
    .replace(/\|/g, '@')
    .replace(/!/g, '.')
    .replace(/-/g, '#');
}

/**
 * Cloud Function: syncAllAppAdminClaims
 * Callable function to sync isAppAdmin claims for all users in /data/appAdmins.
 * Useful for initial setup/bootstrap or fixing claim inconsistencies.
 *
 * Can only be called by existing appAdmins or the SuperAdmin (from env var).
 */
exports.syncAllAppAdminClaims = onCall({
  region: "europe-west1"
}, async (request) => {
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

  const db = getDatabase();
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
});

/**
 * Cloud Function: addAppAdmin
 * Callable function to add a new appAdmin.
 * Only existing appAdmins or SuperAdmin (from env var) can call this.
 * This bypasses Firebase rules and writes directly to the database.
 */
exports.addAppAdmin = onCall({
  region: "europe-west1"
}, async (request) => {
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

  const db = getDatabase();

  // Write to database (this will trigger syncAppAdminClaim)
  await db.ref(`/data/appAdmins/${encodedEmail}`).set(true);

  logger.info(`AppAdmin added: ${normalizedEmail} by ${callerEmail}`);

  return {
    success: true,
    email: normalizedEmail,
    addedBy: callerEmail
  };
});

/**
 * Cloud Function: removeAppAdmin
 * Callable function to remove an appAdmin.
 * Only existing appAdmins can call this. Cannot remove yourself.
 */
exports.removeAppAdmin = onCall({
  region: "europe-west1"
}, async (request) => {
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
  const db = getDatabase();

  // Remove from database (this will trigger syncAppAdminClaim)
  await db.ref(`/data/appAdmins/${encodedEmail}`).remove();

  logger.info(`AppAdmin removed: ${normalizedEmail} by ${callerEmail}`);

  return {
    success: true,
    email: normalizedEmail,
    removedBy: callerEmail
  };
});

/**
 * Cloud Function: addAppUploader
 * Callable function to add an app uploader for a specific project.
 * Only appAdmins can call this.
 */
exports.addAppUploader = onCall({
  region: "europe-west1"
}, async (request) => {
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

  const db = getDatabase();

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
});

/**
 * Cloud Function: removeAppUploader
 * Callable function to remove an app uploader from a specific project.
 * Only appAdmins can call this.
 */
exports.removeAppUploader = onCall({
  region: "europe-west1"
}, async (request) => {
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

  const db = getDatabase();

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
});

/**
 * Cloud Function: syncAppAdminClaim
 * Syncs the isAppAdmin custom claim when /data/appAdmins changes.
 *
 * When a user is added to appAdmins (value = true), sets isAppAdmin claim to true.
 * When a user is removed from appAdmins, sets isAppAdmin claim to false.
 */
exports.syncAppAdminClaim = onValueWritten({
  ref: "/data/appAdmins/{encodedEmail}",
  region: "europe-west1"
}, async (event) => {
  const { encodedEmail } = event.params;
  const beforeValue = event.data.before?.val();
  const afterValue = event.data.after?.val();

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

    // Get current claims and update isAppAdmin
    const currentClaims = userRecord.customClaims || {};
    const newClaims = {
      ...currentClaims,
      isAppAdmin: shouldBeAppAdmin
    };

    await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);

    logger.info(`Updated isAppAdmin claim for ${email}`, {
      uid: userRecord.uid,
      isAppAdmin: shouldBeAppAdmin
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
});

/**
 * Cloud Function: syncUserAllowedClaim
 * Syncs the 'allowed' custom claim when /users/{encodedEmail}/projects changes.
 * If user has at least one project with developer or stakeholder = true → allowed: true.
 * Otherwise → allowed: false.
 */
exports.syncUserAllowedClaim = onValueWritten({
  ref: "/users/{encodedEmail}/projects/{projectId}",
  region: "europe-west1"
}, async (event) => {
  const { encodedEmail } = event.params;

  const email = decodeEmailFromFirebase(encodedEmail);
  if (!email) {
    logger.error('Could not decode email from Firebase key', { encodedEmail });
    return null;
  }

  try {
    // Read all projects for this user to determine allowed status
    const projectsSnap = await admin.database().ref(`/users/${encodedEmail}/projects`).once('value');
    const shouldBeAllowed = hasActiveProject(projectsSnap.val());

    const userRecord = await admin.auth().getUserByEmail(email);
    const currentClaims = userRecord.customClaims || {};

    if (currentClaims.allowed === shouldBeAllowed) {
      return null; // No change needed
    }

    const newClaims = { ...currentClaims, allowed: shouldBeAllowed };
    await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);

    logger.info(`Updated allowed claim for ${email}`, {
      uid: userRecord.uid,
      allowed: shouldBeAllowed
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
});

/**
 * Cloud Function: listUsers
 * Returns all users from /users/ enriched with Auth status.
 * Only appAdmins can call this.
 */
exports.listUsers = onCall({
  region: "europe-west1"
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const callerClaims = request.auth.token || {};
  if (!callerClaims.isAppAdmin) {
    throw new HttpsError('permission-denied', 'Only appAdmins can list users');
  }

  const snapshot = await admin.database().ref('/users').once('value');
  const usersData = snapshot.val() || {};

  const users = [];
  for (const [encodedEmail, userData] of Object.entries(usersData)) {
    if (!userData.email) continue;
    let authStatus = 'not_registered';
    try {
      const userRecord = await admin.auth().getUserByEmail(userData.email);
      authStatus = userRecord.disabled ? 'disabled' : 'active';
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
      authStatus
    });
  }

  return { users };
});

/**
 * Cloud Function: createOrUpdateUser
 * Creates or updates a user in /users/{encodedEmail}.
 * Auto-generates developerId/stakeholderId when assigning roles.
 * Syncs allowed claim if user exists in Auth.
 * Only appAdmins can call this.
 */
exports.createOrUpdateUser = onCall({
  region: "europe-west1"
}, async (request) => {
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
  const existingSnap = await admin.database().ref(`/users/${encodedEmail}`).once('value');
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
    const newDevId = await generateNextId('dev_', 'developerId');
    updates[`/users/${encodedEmail}/developerId`] = newDevId;
  }

  // Handle stakeholder ID
  const isStakeholder = stakeholder === true;
  if (isStakeholder && !existingData.stakeholderId) {
    const newStkId = await generateNextId('stk_', 'stakeholderId');
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

  await admin.database().ref().update(updates);

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
    const projectsSnap = await admin.database().ref(`/users/${encodedEmail}/projects`).once('value');
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
});

/**
 * Cloud Function: removeUserFromProject
 * Removes a user's assignment from a specific project.
 * If no projects remain, revokes allowed claim.
 * Only appAdmins can call this.
 */
exports.removeUserFromProject = onCall({
  region: "europe-west1"
}, async (request) => {
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
  await admin.database().ref(`/users/${encodedEmail}/projects/${projectId}`).remove();

  logger.info(`Removed ${normalizedEmail} from project ${projectId}`, {
    removedBy: request.auth.token.email
  });

  // Check remaining projects and sync allowed claim
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    const projectsSnap = await admin.database().ref(`/users/${encodedEmail}/projects`).once('value');
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
});

/**
 * Cloud Function: deleteUser
 * Deletes a user from /users/ and cleans up legacy paths.
 * Revokes custom claims but does NOT delete the Firebase Auth account.
 * Only appAdmins can call this.
 */
exports.deleteUser = onCall({
  region: "europe-west1"
}, async (request) => {
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
  const db = getDatabase();

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
});

/**
 * Cloud Function: updateAppPermissions
 * Updates app permissions for a user in a specific project.
 * Writes to /users/{encodedEmail}/projects/{projectId}/appPermissions
 * and dual-writes to legacy paths for backward compatibility.
 * Only appAdmins can call this.
 */
exports.updateAppPermissions = onCall({
  region: "europe-west1"
}, async (request) => {
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
  const db = getDatabase();

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
});

/**
 * Cloud Function: syncAppPermissionsClaim
 * Trigger on /users/{encodedEmail}/projects write.
 * Rebuilds the compact appPerms claim from all project appPermissions.
 * Flags: v=view, d=download, u=upload, e=edit, a=approve
 */
exports.syncAppPermissionsClaim = onValueWritten({
  ref: "/users/{encodedEmail}/projects",
  region: "europe-west1"
}, async (event) => {
  const { encodedEmail } = event.params;
  const projectsData = event.data.after?.val();

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
});

// Export internal functions for testing
exports._test = {
  inferEpicsForPhases,
  createEpicForPlan
};

/**
 * Handler for onCardToValidate Cloud Function
 * Sends push notifications and email when a task transitions to "To Validate"
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

// Import validation functions to ensure we don't send emails for invalid transitions
const { REQUIRED_FIELDS_TO_LEAVE_TODO, hasValidValue } = require('./on-task-status-validation');

/**
 * Sanitize email for use as Firebase key (full email, not just prefix)
 */
function sanitizeEmailForKey(email) {
  return email.replace(/[.#$[\]/]/g, '_');
}

/**
 * Check if an email belongs to an AI agent (should not receive notifications)
 */
function isAIAgentEmail(email) {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  // BecarIA and other AI agents should not receive notifications
  const aiEmails = ['becaria@ia.local', 'becarai@ia.local'];
  return aiEmails.includes(normalizedEmail) || normalizedEmail.endsWith('@ia.local');
}

/**
 * Format acceptance criteria as HTML for email
 */
function formatAcceptanceCriteriaHtml(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return '<p><em>No hay criterios de aceptación definidos.</em></p>';
  }

  const items = criteria.map((criterion, index) => {
    const parts = [];
    if (criterion.given) parts.push(`<strong>Given</strong> ${criterion.given}`);
    if (criterion.when) parts.push(`<strong>When</strong> ${criterion.when}`);
    if (criterion.then) parts.push(`<strong>Then</strong> ${criterion.then}`);

    if (parts.length === 0 && criterion.raw) {
      return `<li>${criterion.raw}</li>`;
    }

    return `<li>
      <strong>Criterio ${index + 1}:</strong><br/>
      ${parts.join('<br/>')}
    </li>`;
  });

  return `<ol>${items.join('')}</ol>`;
}

/**
 * Generate the validation email HTML body
 */
function generateValidationEmailHtml(cardData, projectId, cardId, developerName) {
  const taskUrl = `${getAppUrl()}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(cardId)}#tasks`;
  const title = cardData.title || 'Sin título';
  const developer = developerName || cardData.developer || 'No asignado';
  const criteriaHtml = formatAcceptanceCriteriaHtml(cardData.acceptanceCriteriaStructured);

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c3e50;">Tarea pendiente de validación</h2>
      <p>La siguiente tarea está lista para ser validada:</p>

      <div style="background: #f8f9fa; border-left: 4px solid #4a9eff; padding: 15px; margin: 15px 0;">
        <h3 style="margin: 0 0 10px 0; color: #333;">${title}</h3>
        <p style="margin: 5px 0;"><strong>Proyecto:</strong> ${projectId}</p>
        <p style="margin: 5px 0;"><strong>ID:</strong> ${cardId}</p>
        <p style="margin: 5px 0;"><strong>Desarrollador:</strong> ${developer}</p>
      </div>

      <h3 style="color: #2c3e50;">Criterios de aceptación</h3>
      ${criteriaHtml}

      <div style="margin: 20px 0;">
        <a href="${taskUrl}" style="display: inline-block; background: #4a9eff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Ver tarea
        </a>
      </div>

      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px; margin: 15px 0;">
        <strong>Instrucciones:</strong>
        <ul style="margin: 8px 0;">
          <li>Si la tarea cumple los criterios de aceptación, márcala como <strong>"Done"</strong></li>
          <li>Si no cumple, cámbiala a <strong>"To Do"</strong> y añade un comentario explicando los motivos</li>
        </ul>
      </div>

      <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
        Este email se envía automáticamente desde PlanningGameXP.
      </p>
    </div>
  `;
}

/**
 * Main handler for card status change to "To Validate"
 * @param {Object} params - { projectId, section, cardId }
 * @param {Object} beforeData - Card data before the change
 * @param {Object} afterData - Card data after the change
 * @param {Object} deps - Dependencies { db, sendEmail, logger }
 */
async function handleCardToValidate(params, beforeData, afterData, deps) {
  const { projectId, section, cardId } = params;
  const { db, sendEmail, logger } = deps;

  logger.info('onCardToValidate: Triggered', { projectId, section, cardId });

  // Only process tasks (section starts with "tasks_" or "TASKS_")
  if (!section.toLowerCase().startsWith('tasks_')) {
    logger.info('onCardToValidate: Skipping - not a task section', { section });
    return null;
  }

  // Only trigger on transition TO "To Validate"
  const beforeStatus = beforeData?.status;
  const afterStatus = afterData?.status;

  logger.info('onCardToValidate: Status check', { beforeStatus, afterStatus });

  if (afterStatus !== 'To Validate' || beforeStatus === 'To Validate') {
    logger.info('onCardToValidate: Skipping - not a transition to To Validate');
    return null;
  }

  // Validate that the transition is valid before sending notifications
  // If transitioning from "To Do", all required fields must be present
  // This prevents sending emails for transitions that will be reverted by onTaskStatusValidation
  const normalizedBeforeStatus = (beforeStatus || '').toLowerCase().replace(/\s+/g, '');
  if (normalizedBeforeStatus === 'todo') {
    const missingFields = REQUIRED_FIELDS_TO_LEAVE_TODO.filter(field => !hasValidValue(afterData, field));
    if (missingFields.length > 0) {
      logger.info('onCardToValidate: Skipping - invalid transition from To Do, missing fields', {
        projectId,
        cardId,
        missingFields
      });
      return null;
    }
  }

  const cardTitle = afterData.title || 'Sin título';
  const taskCardId = afterData.cardId || cardId;

  // Get validator and coValidator
  const validatorId = afterData.validator;
  const coValidatorId = afterData.coValidator;

  logger.info('onCardToValidate: Validators', { validatorId, coValidatorId });

  if (!validatorId) {
    logger.warn('onCardToValidate: No validator assigned', { projectId, cardId });
    return null;
  }

  // Resolve stakeholder IDs to emails
  const stakeholderIds = [validatorId];
  if (coValidatorId) {
    stakeholderIds.push(coValidatorId);
  }

  logger.info('onCardToValidate: Resolving stakeholders', { stakeholderIds });

  const recipientEmails = [];
  for (const stkId of stakeholderIds) {
    const snapshot = await db.ref(`/data/stakeholders/${stkId}`).once('value');
    const stakeholder = snapshot.val();
    logger.info('onCardToValidate: Stakeholder lookup', { stkId, found: !!stakeholder, email: stakeholder?.email });
    if (stakeholder?.email) {
      const email = stakeholder.email.trim().toLowerCase();
      // Skip AI agents - they don't need notifications
      if (isAIAgentEmail(email)) {
        logger.info('onCardToValidate: Skipping AI agent email', { stkId, email });
        continue;
      }
      recipientEmails.push({
        email,
        name: stakeholder.name || stkId
      });
    } else {
      logger.warn('onCardToValidate: Stakeholder not found or has no email', { stkId, projectId });
    }
  }

  if (recipientEmails.length === 0) {
    logger.warn('onCardToValidate: No recipient emails resolved', { projectId, cardId });
    return null;
  }

  // Create push notifications
  const timestamp = Date.now();
  const taskUrl = `${getAppUrl()}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(taskCardId)}#tasks`;

  const notificationPromises = recipientEmails.map(recipient => {
    const sanitizedKey = sanitizeEmailForKey(recipient.email);
    const notificationRef = db.ref(`/notifications/${sanitizedKey}`).push();
    return notificationRef.set({
      id: notificationRef.key,
      title: 'Tarea pendiente de validación',
      message: `La tarea "${cardTitle}" está lista para validar`,
      type: 'validation-request',
      projectId,
      taskId: taskCardId,
      url: taskUrl,
      timestamp,
      read: false,
      data: {
        itemType: 'task',
        action: 'validation-request'
      }
    });
  });

  await Promise.all(notificationPromises);
  logger.info('onCardToValidate: Push notifications created', {
    projectId,
    cardId: taskCardId,
    recipients: recipientEmails.map(r => r.email)
  });

  // Resolve developer ID to name for email
  let developerName = null;
  const developerId = afterData.developer;
  if (developerId) {
    try {
      const devSnapshot = await db.ref(`/data/developers/${developerId}`).once('value');
      const developerData = devSnapshot.val();
      if (developerData?.name) {
        developerName = developerData.name;
        logger.info('onCardToValidate: Developer resolved', { developerId, developerName });
      }
    } catch (devError) {
      logger.warn('onCardToValidate: Could not resolve developer', { developerId, error: devError.message });
    }
  }

  // Send email
  try {
    const emailSubject = `[${projectId}] Tarea pendiente de validación: ${cardTitle}`;
    const emailHtml = generateValidationEmailHtml(afterData, projectId, taskCardId, developerName);
    const emails = recipientEmails.map(r => r.email);

    await sendEmail(emails, emailSubject, emailHtml);
    logger.info('onCardToValidate: Email sent', {
      projectId,
      cardId: taskCardId,
      recipients: emails
    });
  } catch (error) {
    logger.error('onCardToValidate: Failed to send email', {
      error: error.message,
      projectId,
      cardId: taskCardId
    });
    // Don't throw - notifications were already created successfully
  }

  return { notified: recipientEmails.map(r => r.email) };
}

module.exports = {
  handleCardToValidate,
  sanitizeEmailForKey,
  formatAcceptanceCriteriaHtml,
  generateValidationEmailHtml
};

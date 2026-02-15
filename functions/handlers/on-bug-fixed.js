/**
 * Handler for onBugFixed Cloud Function
 * Sends push notification and email when a bug transitions to "Fixed"
 * Notifies the bug creator so they can verify the fix.
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
 * Generate the bug fixed email HTML body
 */
function generateBugFixedEmailHtml(bugData, projectId, cardId) {
  const bugUrl = `${getAppUrl()}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(cardId)}#bugs`;
  const title = bugData.title || 'Sin título';
  const description = bugData.description || 'Sin descripción';
  const developer = bugData.developer || 'No asignado';

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #28a745;">Bug corregido</h2>
      <p>El siguiente bug ha sido marcado como <strong>Fixed</strong> y está listo para verificar:</p>

      <div style="background: #f8f9fa; border-left: 4px solid #28a745; padding: 15px; margin: 15px 0;">
        <h3 style="margin: 0 0 10px 0; color: #333;">${title}</h3>
        <p style="margin: 5px 0;"><strong>Proyecto:</strong> ${projectId}</p>
        <p style="margin: 5px 0;"><strong>ID:</strong> ${cardId}</p>
        <p style="margin: 5px 0;"><strong>Resuelto por:</strong> ${developer}</p>
      </div>

      <h3 style="color: #2c3e50;">Descripción del bug</h3>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 10px 0;">
        <p style="margin: 0; white-space: pre-wrap;">${description}</p>
      </div>

      <div style="margin: 20px 0;">
        <a href="${bugUrl}" style="display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Ver bug
        </a>
      </div>

      <div style="background: #d4edda; border: 1px solid #28a745; border-radius: 4px; padding: 12px; margin: 15px 0;">
        <strong>Instrucciones:</strong>
        <ul style="margin: 8px 0;">
          <li>Verifica que el bug está correctamente solucionado</li>
          <li>Si está correcto, márcalo como <strong>"Verified"</strong> o <strong>"Closed"</strong></li>
          <li>Si no está correcto, cámbialo a <strong>"Assigned"</strong> y añade un comentario</li>
        </ul>
      </div>

      <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
        Este email se envía automáticamente desde PlanningGameXP.
      </p>
    </div>
  `;
}

/**
 * Main handler for bug status change to "Fixed"
 * @param {Object} params - { projectId, section, cardId }
 * @param {Object} beforeData - Bug data before the change
 * @param {Object} afterData - Bug data after the change
 * @param {Object} deps - Dependencies { db, sendEmail, logger }
 */
async function handleBugFixed(params, beforeData, afterData, deps) {
  const { projectId, section, cardId } = params;
  const { db, sendEmail, logger } = deps;

  logger.info('onBugFixed: Triggered', { projectId, section, cardId });

  // Only process bugs (section starts with "bugs_" or "BUGS_")
  if (!section.toLowerCase().startsWith('bugs_')) {
    logger.info('onBugFixed: Skipping - not a bugs section', { section });
    return null;
  }

  // Only trigger on transition TO "Fixed"
  const beforeStatus = beforeData?.status;
  const afterStatus = afterData?.status;

  logger.info('onBugFixed: Status check', { beforeStatus, afterStatus });

  if (afterStatus !== 'Fixed' || beforeStatus === 'Fixed') {
    logger.info('onBugFixed: Skipping - not a transition to Fixed');
    return null;
  }

  const bugTitle = afterData.title || 'Sin título';
  const bugCardId = afterData.cardId || cardId;

  // Get bug creator
  const creatorEmail = afterData.createdBy;

  logger.info('onBugFixed: Creator', { creatorEmail });

  if (!creatorEmail) {
    logger.warn('onBugFixed: No creator registered', { projectId, cardId: bugCardId });
    return null;
  }

  // Validate email format
  if (!creatorEmail.includes('@')) {
    logger.warn('onBugFixed: Invalid creator email format', { creatorEmail, projectId, cardId: bugCardId });
    return null;
  }

  const recipientEmail = creatorEmail.trim().toLowerCase();

  // Skip AI agents - they don't need notifications
  if (isAIAgentEmail(recipientEmail)) {
    logger.info('onBugFixed: Skipping AI agent email', { recipientEmail, projectId, cardId: bugCardId });
    return null;
  }

  // Create push notification
  const timestamp = Date.now();
  const bugUrl = `${getAppUrl()}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(bugCardId)}#bugs`;
  const sanitizedKey = sanitizeEmailForKey(recipientEmail);

  const notificationRef = db.ref(`/notifications/${sanitizedKey}`).push();
  await notificationRef.set({
    id: notificationRef.key,
    title: 'Bug corregido',
    message: `El bug "${bugTitle}" ha sido corregido`,
    type: 'bug-fixed',
    projectId,
    bugId: bugCardId,
    url: bugUrl,
    timestamp,
    read: false,
    data: {
      itemType: 'bug',
      action: 'bug-fixed'
    }
  });

  logger.info('onBugFixed: Push notification created', {
    projectId,
    cardId: bugCardId,
    recipient: recipientEmail
  });

  // Send email
  try {
    const emailSubject = `[${projectId}] Bug corregido: ${bugTitle}`;
    const emailHtml = generateBugFixedEmailHtml(afterData, projectId, bugCardId);

    await sendEmail([recipientEmail], emailSubject, emailHtml);
    logger.info('onBugFixed: Email sent', {
      projectId,
      cardId: bugCardId,
      recipient: recipientEmail
    });
  } catch (error) {
    logger.error('onBugFixed: Failed to send email', {
      error: error.message,
      projectId,
      cardId: bugCardId
    });
    // Don't throw - notification was already created successfully
  }

  return { notified: recipientEmail };
}

module.exports = {
  handleBugFixed,
  sanitizeEmailForKey,
  generateBugFixedEmailHtml
};

/**
 * Hourly Validation Digest
 *
 * Scheduled Cloud Function that runs every hour. Reads pending email
 * notifications from /emailQueue/, groups them by recipient and project,
 * and sends a single consolidated digest email per recipient.
 *
 * This replaces the immediate per-card email spam with a clean hourly summary.
 * Push notifications remain immediate (handled by onCardToValidate/onBugFixed).
 */

const {
  readQueue,
  removeFromQueue,
  groupByRecipient,
  groupByProject
} = require('./email-queue');

/**
 * Get the application URL from environment
 * @returns {string} App URL
 */
function getAppUrl() {
  if (!process.env.PUBLIC_APP_URL) {
    throw new Error('PUBLIC_APP_URL environment variable is required.');
  }
  return process.env.PUBLIC_APP_URL;
}

/**
 * Generate HTML for the hourly digest email
 * @param {Object} params
 * @param {Array} params.validationEntries - Task validation queue entries
 * @param {Array} params.bugFixedEntries - Bug fixed queue entries
 * @returns {string} HTML email body
 */
function generateDigestHtml({ validationEntries, bugFixedEntries, revertEntries = [] }) {
  const appUrl = getAppUrl();
  const sections = [];

  // Revert warnings (urgent — shown first with red styling)
  if (revertEntries.length > 0) {
    const revertRows = revertEntries.map(entry => {
      const d = entry.data;
      const taskUrl = `${appUrl}/adminproject/?projectId=${encodeURIComponent(d.projectId)}&cardId=${encodeURIComponent(d.cardId)}#tasks`;
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">
            <a href="${taskUrl}" style="color: #dc3545; text-decoration: none; font-weight: 500;">${d.cardId}</a>
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.taskTitle || 'Sin titulo'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.attemptedStatus} → ${d.revertedToStatus}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; color: #dc3545;">${d.reason}</td>
        </tr>`;
    }).join('');

    sections.push(`
      <div style="margin-bottom: 24px; background: #fff5f5; border: 1px solid #dc3545; border-radius: 4px; padding: 16px;">
        <h3 style="color: #dc3545; margin: 0 0 12px 0;">
          ⚠ Transiciones revertidas (${revertEntries.length})
        </h3>
        <p style="color: #666; font-size: 13px; margin: 0 0 12px;">
          Un agente IA o una escritura directa intentó cambiar el estado de estas tareas sin cumplir los requisitos.
          El cambio fue revertido automáticamente.
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #f1f3f5;">
              <th style="padding: 8px; text-align: left; width: 130px;">ID</th>
              <th style="padding: 8px; text-align: left;">Titulo</th>
              <th style="padding: 8px; text-align: left; width: 150px;">Transicion</th>
              <th style="padding: 8px; text-align: left;">Motivo</th>
            </tr>
          </thead>
          <tbody>${revertRows}</tbody>
        </table>
      </div>`);
  }

  // Group validation entries by project
  if (validationEntries.length > 0) {
    const byProject = groupByProject(validationEntries);

    let tasksHtml = '';
    for (const [projectId, entries] of byProject) {
      const taskRows = entries.map(entry => {
        const d = entry.data;
        const taskUrl = `${appUrl}/adminproject/?projectId=${encodeURIComponent(d.projectId)}&cardId=${encodeURIComponent(d.cardId)}#tasks`;
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
              <a href="${taskUrl}" style="color: #4a9eff; text-decoration: none; font-weight: 500;">${d.cardId}</a>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.taskTitle || 'Sin titulo'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.developerName || '-'}</td>
          </tr>`;
      }).join('');

      tasksHtml += `
        <div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0; color: #555; font-size: 14px;">${projectId} (${entries.length})</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f1f3f5;">
                <th style="padding: 8px; text-align: left; width: 140px;">ID</th>
                <th style="padding: 8px; text-align: left;">Titulo</th>
                <th style="padding: 8px; text-align: left; width: 150px;">Desarrollador</th>
              </tr>
            </thead>
            <tbody>${taskRows}</tbody>
          </table>
        </div>`;
    }

    sections.push(`
      <div style="margin-bottom: 24px;">
        <h3 style="color: #2c3e50; margin: 0 0 12px 0; border-bottom: 2px solid #4a9eff; padding-bottom: 6px;">
          Tareas pendientes de validacion (${validationEntries.length})
        </h3>
        ${tasksHtml}
      </div>`);
  }

  // Group bug fixed entries by project
  if (bugFixedEntries.length > 0) {
    const byProject = groupByProject(bugFixedEntries);

    let bugsHtml = '';
    for (const [projectId, entries] of byProject) {
      const bugRows = entries.map(entry => {
        const d = entry.data;
        const bugUrl = `${appUrl}/adminproject/?projectId=${encodeURIComponent(d.projectId)}&cardId=${encodeURIComponent(d.cardId)}#bugs`;
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
              <a href="${bugUrl}" style="color: #28a745; text-decoration: none; font-weight: 500;">${d.cardId}</a>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.bugTitle || 'Sin titulo'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.developerName || '-'}</td>
          </tr>`;
      }).join('');

      bugsHtml += `
        <div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0; color: #555; font-size: 14px;">${projectId} (${entries.length})</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f1f3f5;">
                <th style="padding: 8px; text-align: left; width: 140px;">ID</th>
                <th style="padding: 8px; text-align: left;">Titulo</th>
                <th style="padding: 8px; text-align: left; width: 150px;">Resuelto por</th>
              </tr>
            </thead>
            <tbody>${bugRows}</tbody>
          </table>
        </div>`;
    }

    sections.push(`
      <div style="margin-bottom: 24px;">
        <h3 style="color: #28a745; margin: 0 0 12px 0; border-bottom: 2px solid #28a745; padding-bottom: 6px;">
          Bugs corregidos (${bugFixedEntries.length})
        </h3>
        ${bugsHtml}
      </div>`);
  }

  const totalItems = validationEntries.length + bugFixedEntries.length + revertEntries.length;

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <h2 style="color: #2c3e50; margin-bottom: 4px;">Resumen de notificaciones</h2>
      <p style="color: #6c757d; margin-top: 0;">${totalItems} elemento${totalItems !== 1 ? 's' : ''} pendiente${totalItems !== 1 ? 's' : ''} de tu atencion</p>

      ${sections.join('')}

      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px; margin: 20px 0;">
        <strong>Recordatorio:</strong>
        <ul style="margin: 8px 0;">
          <li>Las tareas validadas se marcan como <strong>"Done"</strong></li>
          <li>Los bugs verificados se marcan como <strong>"Done&amp;Validated"</strong></li>
          <li>Si algo no es correcto, devuelvelo a su estado anterior con un comentario</li>
        </ul>
      </div>

      <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
        Este email se envia automaticamente cada hora desde PlanningGameXP.
      </p>
    </div>`;
}

/**
 * Main handler for the hourly validation digest
 * @param {Object} deps - Dependencies { db, getAccessToken, sendEmail, logger }
 * @param {string} [filterEmail] - Optional email filter for testing
 * @returns {Promise<Object>} Summary of emails sent
 */
async function handleHourlyDigest(deps, filterEmail = null) {
  const { db, getAccessToken, sendEmail, logger } = deps;

  logger.info('hourlyDigest: Starting digest processing');

  // Read all queues
  const [validationEntries, bugFixedEntries, revertEntries] = await Promise.all([
    readQueue(db, 'toValidate'),
    readQueue(db, 'bugFixed'),
    readQueue(db, 'validationRevert')
  ]);

  const totalEntries = validationEntries.length + bugFixedEntries.length + revertEntries.length;

  if (totalEntries === 0) {
    logger.info('hourlyDigest: No pending notifications, skipping');
    return { emailsSent: 0, totalItems: 0 };
  }

  logger.info('hourlyDigest: Found pending notifications', {
    validationCount: validationEntries.length,
    bugFixedCount: bugFixedEntries.length,
    revertCount: revertEntries.length
  });

  // Merge all entries for grouping by recipient
  const allEntries = [
    ...validationEntries.map(e => ({ ...e, queueType: 'toValidate' })),
    ...bugFixedEntries.map(e => ({ ...e, queueType: 'bugFixed' })),
    ...revertEntries.map(e => ({ ...e, queueType: 'validationRevert' }))
  ];

  const byRecipient = groupByRecipient(allEntries);

  let emailsSent = 0;
  const processedKeys = { toValidate: [], bugFixed: [], validationRevert: [] };
  let accessToken = null;

  for (const [recipientEmail, entries] of byRecipient) {
    // Optional email filter for testing
    if (filterEmail && recipientEmail !== filterEmail.trim().toLowerCase()) {
      continue;
    }

    // Split back into types for this recipient
    const recipientValidation = entries.filter(e => e.queueType === 'toValidate');
    const recipientBugs = entries.filter(e => e.queueType === 'bugFixed');
    const recipientReverts = entries.filter(e => e.queueType === 'validationRevert');

    try {
      // Lazy token acquisition
      if (!accessToken) {
        accessToken = await getAccessToken();
      }

      const html = generateDigestHtml({
        validationEntries: recipientValidation,
        bugFixedEntries: recipientBugs,
        revertEntries: recipientReverts
      });

      const itemCount = recipientValidation.length + recipientBugs.length;
      const subject = `[PlanningGameXP] Resumen: ${itemCount} elemento${itemCount !== 1 ? 's' : ''} pendiente${itemCount !== 1 ? 's' : ''}`;

      await sendEmail(accessToken, [recipientEmail], subject, html);
      emailsSent++;

      // Track processed keys for cleanup
      for (const entry of recipientValidation) {
        processedKeys.toValidate.push(entry.key);
      }
      for (const entry of recipientBugs) {
        processedKeys.bugFixed.push(entry.key);
      }
      for (const entry of recipientReverts) {
        processedKeys.validationRevert.push(entry.key);
      }

      logger.info('hourlyDigest: Email sent', {
        recipient: recipientEmail,
        validationItems: recipientValidation.length,
        bugItems: recipientBugs.length
      });
    } catch (error) {
      logger.error('hourlyDigest: Failed to send digest email', {
        recipient: recipientEmail,
        error: error.message
      });
      // Don't remove entries from queue on failure - they'll be retried next hour
    }
  }

  // Clean up processed entries
  await Promise.all([
    removeFromQueue(db, 'toValidate', processedKeys.toValidate),
    removeFromQueue(db, 'bugFixed', processedKeys.bugFixed),
    removeFromQueue(db, 'validationRevert', processedKeys.validationRevert)
  ]);

  logger.info('hourlyDigest: Completed', {
    emailsSent,
    totalItems: totalEntries,
    cleanedUp: processedKeys.toValidate.length + processedKeys.bugFixed.length
  });

  return {
    emailsSent,
    totalItems: totalEntries,
    processedKeys
  };
}

module.exports = {
  handleHourlyDigest,
  generateDigestHtml
};

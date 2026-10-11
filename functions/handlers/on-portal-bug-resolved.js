/**
 * Handler for onPortalBugResolved Cloud Function
 * Notifies the Portal de Incidencias when a bug created from
 * the portal is resolved (Fixed) in PlanningGameXP.
 *
 * Bugs created via the Portal include a marker in their notes:
 *   [Portal de Incidencias] ticketId: <id>
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

function getPortalUrl() {
  if (!process.env.PORTAL_SOPORTE_URL) {
    throw new Error('PORTAL_SOPORTE_URL environment variable is required. Set it in functions/.env or Firebase Functions config.');
  }
  if (process.env.FUNCTIONS_EMULATOR !== 'true' && process.env.PORTAL_SOPORTE_URL.includes('localhost')) {
    throw new Error('PORTAL_SOPORTE_URL contains "localhost" in production. Fix the value in functions/.env.');
  }
  return process.env.PORTAL_SOPORTE_URL;
}

/**
 * Parse the Portal ticketId from the notes field.
 * Notes can be: string, array of {content}, or Firebase object {pushKey: {content}}.
 * @param {string|Array|Object|null} notes
 * @returns {string|null} ticketId or null
 */
function parsePortalTicketId(notes) {
  if (!notes) return null;

  const TICKET_REGEX = /\[Portal de Incidencias\].*?ticketId:\s*(\S+)/s;

  // String notes
  if (typeof notes === 'string') {
    if (!notes) return null;
    const match = notes.match(TICKET_REGEX);
    return match ? match[1] : null;
  }

  // Array or Firebase-object notes → extract content strings and search
  const entries = Array.isArray(notes) ? notes : Object.values(notes);
  for (const entry of entries) {
    const text = typeof entry === 'string' ? entry : entry?.content;
    if (typeof text !== 'string') continue;
    const match = text.match(TICKET_REGEX);
    if (match) return match[1];
  }

  return null;
}

/**
 * POST to Portal de Incidencias to resolve the linked ticket.
 * @param {Object} data - { ticketId, cardId, projectId }
 * @param {Object} deps - { axios, apiKey, logger }
 */
async function notifyPortal({ ticketId, cardId, projectId }, deps) {
  const { axios, apiKey } = deps;
  const bugUrl = `${getAppUrl()}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(cardId)}#bugs`;

  await axios.post(
    `${getPortalUrl()}/api/planningGame/resolveTicket`,
    {
      ticketId,
      cardId,
      bugUrl,
      message: `Bug ${cardId} has been resolved in PlanningGameXP`
    },
    {
      headers: { 'x-api-key': apiKey },
      timeout: 10000
    }
  );
}

/**
 * Main handler: check if a bug from the Portal was resolved and notify.
 * @param {Object} params - { projectId, section, cardId }
 * @param {Object} beforeData - Bug data before the change
 * @param {Object} afterData - Bug data after the change
 * @param {Object} deps - { axios, apiKey, logger }
 * @returns {Object|null}
 */
async function handlePortalBugResolved(params, beforeData, afterData, deps) {
  const { projectId, section, cardId } = params;
  const { logger } = deps;

  // Only process bugs
  if (!section.toLowerCase().startsWith('bugs_')) {
    return null;
  }

  // Only trigger on transition TO Fixed (validation afterwards must not re-notify)
  const beforeStatus = beforeData?.status;
  const afterStatus = afterData?.status;

  if (afterStatus !== 'Fixed' || beforeStatus === afterStatus) {
    return null;
  }

  // Check if this bug came from the Portal
  const ticketId = parsePortalTicketId(afterData?.notes);
  if (!ticketId) {
    return null;
  }

  const bugCardId = afterData.cardId || cardId;

  logger.info('onPortalBugResolved: Notifying Portal', {
    projectId, cardId: bugCardId, ticketId, status: afterStatus
  });

  try {
    await notifyPortal({ ticketId, cardId: bugCardId, projectId }, deps);
    logger.info('onPortalBugResolved: Portal notified successfully', {
      projectId, cardId: bugCardId, ticketId
    });
    return { notifiedPortal: true, ticketId };
  } catch (error) {
    logger.error('onPortalBugResolved: Failed to notify Portal', {
      error: error.message,
      projectId,
      cardId: bugCardId,
      ticketId
    });
    return null;
  }
}

module.exports = {
  parsePortalTicketId,
  notifyPortal,
  handlePortalBugResolved
};

/**
 * Public API for reading cards from public projects.
 * No authentication required - only exposes safe fields.
 */
'use strict';

// Fields allowed in the public API response (whitelist approach)
const PUBLIC_CARD_FIELDS = ['cardId', 'title', 'status', 'cardType', 'epic', 'year', 'sprint'];

// Card type sections in RTDB
const CARD_SECTIONS = {
  task: 'TASKS',
  bug: 'BUGS',
  epic: 'EPICS',
  proposal: 'PROPOSALS'
};

/**
 * Project a card to only include public-safe fields.
 * @param {object} card - Full card data from RTDB
 * @returns {object} Card with only public fields
 */
function projectPublicFields(card) {
  const projected = {};
  for (const field of PUBLIC_CARD_FIELDS) {
    if (card[field] !== undefined) {
      projected[field] = card[field];
    }
  }
  return projected;
}

/**
 * Handle GET /api/public/:projectId/cards
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {object} deps - { db, logger }
 */
async function handlePublicProjectCards(req, res, { db, logger }) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract projectId from path: /api/public/:projectId/cards
  // The path after the function name comes in req.path
  const pathParts = req.path.split('/').filter(Boolean);
  // Expected: ['api', 'public', projectId, 'cards'] or just [projectId, 'cards'] depending on routing
  let projectId = null;

  if (pathParts.length >= 2 && pathParts[pathParts.length - 1] === 'cards') {
    projectId = pathParts[pathParts.length - 2];
  } else if (pathParts.length === 1) {
    projectId = pathParts[0];
  }

  if (!projectId) {
    return res.status(400).json({ error: 'Missing projectId. Use: /api/public/{projectId}/cards' });
  }

  // Decode projectId (URL-encoded spaces, etc.)
  projectId = decodeURIComponent(projectId);

  try {
    // Load project
    const projectSnap = await db.ref(`/projects/${projectId}`).once('value');
    if (!projectSnap.exists()) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectSnap.val();

    // Check if project is public
    if (!project.public) {
      return res.status(403).json({ error: 'Project is not public' });
    }

    // Optional type filter
    const typeFilter = req.query.type;
    const validTypes = Object.keys(CARD_SECTIONS);
    if (typeFilter && !validTypes.includes(typeFilter)) {
      return res.status(400).json({
        error: `Invalid type "${typeFilter}". Valid types: ${validTypes.join(', ')}`
      });
    }

    // Determine which sections to read
    const sectionsToRead = typeFilter
      ? { [typeFilter]: CARD_SECTIONS[typeFilter] }
      : CARD_SECTIONS;

    // Read cards from each section
    const cards = [];
    for (const [type, sectionPrefix] of Object.entries(sectionsToRead)) {
      const sectionPath = `/cards/${projectId}/${sectionPrefix}_${projectId}`;
      const snap = await db.ref(sectionPath).once('value');
      const data = snap.val();
      if (!data) continue;

      for (const [, cardData] of Object.entries(data)) {
        if (!cardData || cardData.deletedAt) continue;
        const projected = projectPublicFields(cardData);
        projected.type = type;
        cards.push(projected);
      }
    }

    logger.info('publicProjectCards: served', { projectId, type: typeFilter || 'all', count: cards.length });

    return res.status(200).json({
      projectId,
      projectName: project.name || projectId,
      cards
    });
  } catch (error) {
    logger.error('publicProjectCards: error', { projectId, error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  handlePublicProjectCards,
  projectPublicFields,
  PUBLIC_CARD_FIELDS,
  CARD_SECTIONS
};

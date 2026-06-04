/**
 * Handler for syncing card data to optimized views
 *
 * This reduces Firebase traffic by maintaining denormalized "views" with only
 * the essential fields needed for table displays (~15 fields vs ~50 fields).
 *
 * Views created:
 * - /views/task-list/{projectId}/{firebaseId} - Task table data
 * - /views/bug-list/{projectId}/{firebaseId} - Bug table data
 * - /views/proposal-list/{projectId}/{firebaseId} - Proposal table data
 *
 * Public views (for unauthenticated access via RTDB listeners):
 * - /publicViews/{projectId}/tasks/{firebaseId} - Minimal safe fields
 * - /publicViews/{projectId}/bugs/{firebaseId}
 * - /publicViews/{projectId}/epics/{firebaseId}
 */

// Whitelisted fields for public views — only safe, non-sensitive data
const PUBLIC_VIEW_FIELDS = [
  'cardId', 'title', 'status', 'devPoints', 'businessPoints',
  'startDate', 'endDate', 'priority', 'sprint', 'epic', 'year'
];

// Whitelisted fields published to /publicProjects/{id} for the public directory.
// Sensitive data (developers, stakeholders, serviceAccountKey, ...) stays out.
const PUBLIC_PROJECT_FIELDS = [
  'name', 'description', 'abbreviation', 'languages', 'frameworks', 'repoUrl'
];

/**
 * Map section name to public view card type key
 * @param {string} section - Section name like "TASKS_ProjectA"
 * @returns {string|null} - Public view type (tasks, bugs, epics) or null
 */
function getPublicViewType(section) {
  const s = section.toLowerCase();
  if (s.startsWith('tasks_')) return 'tasks';
  if (s.startsWith('bugs_')) return 'bugs';
  if (s.startsWith('epics_')) return 'epics';
  return null;
}

/**
 * Extract whitelisted fields for a public view entry
 * @param {Object} cardData - Full card data
 * @param {string} firebaseId - Firebase key
 * @param {string} cardType - Card type (task, bug, epic)
 * @returns {Object} - Minimal safe fields
 */
function extractPublicViewFields(cardData, firebaseId, cardType) {
  const view = { firebaseId, type: cardType };
  for (const field of PUBLIC_VIEW_FIELDS) {
    if (cardData[field] !== undefined) {
      view[field] = cardData[field];
    }
  }
  return view;
}

/**
 * Map section name to view path
 * @param {string} section - Section name like "TASKS_ProjectA", "BUGS_ProjectA"
 * @returns {string|null} - View path name or null if section should be skipped
 */
function getViewPathForSection(section) {
  // Section names in Firebase are uppercase (TASKS_, BUGS_, PROPOSALS_)
  const sectionLower = section.toLowerCase();
  if (sectionLower.startsWith('tasks_')) return 'task-list';
  if (sectionLower.startsWith('bugs_')) return 'bug-list';
  if (sectionLower.startsWith('proposals_')) return 'proposal-list';
  // Skip epics, sprints, qa - they don't need optimized views
  return null;
}

/**
 * Extract essential fields for task table view
 * @param {Object} taskData - Full task data from /cards
 * @param {string} firebaseId - Firebase key of the card
 * @returns {Object} - Minimal data for table view
 */
function extractTaskViewFields(taskData, firebaseId) {
  return {
    firebaseId,
    cardId: taskData.cardId,
    title: taskData.title,
    status: taskData.status,
    businessPoints: taskData.businessPoints,
    devPoints: taskData.devPoints,
    sprint: taskData.sprint,
    developer: taskData.developer,
    coDeveloper: taskData.coDeveloper,
    validator: taskData.validator,
    coValidator: taskData.coValidator,
    epic: taskData.epic,
    startDate: taskData.startDate,
    endDate: taskData.endDate,
    spike: taskData.spike,
    expedited: taskData.expedited,
    blockedByBusiness: taskData.blockedByBusiness,
    blockedByDevelopment: taskData.blockedByDevelopment,
    notesCount: Array.isArray(taskData.notes)
      ? taskData.notes.length
      : (taskData.notes && typeof taskData.notes === 'object' ? Object.keys(taskData.notes).length : 0),
    year: taskData.year,
    relatedTasks: Array.isArray(taskData.relatedTasks)
      ? taskData.relatedTasks.map(rt => ({
        id: rt.id,
        title: rt.title || rt.id,
        type: rt.type || 'related',
        projectId: rt.projectId
      }))
      : undefined,
    planStatus: taskData.implementationPlan?.planStatus || undefined,
    commitsCount: Array.isArray(taskData.commits) ? taskData.commits.length : 0,
    pipelineStatus: taskData.pipelineStatus || undefined
  };
}

/**
 * Extract essential fields for bug table view
 * @param {Object} bugData - Full bug data from /cards
 * @param {string} firebaseId - Firebase key of the card
 * @returns {Object} - Minimal data for table view
 */
function extractBugViewFields(bugData, firebaseId) {
  return {
    firebaseId,
    cardId: bugData.cardId,
    title: bugData.title,
    status: bugData.status,
    priority: bugData.priority,
    developer: bugData.developer,
    coDeveloper: bugData.coDeveloper,
    createdBy: bugData.createdBy,
    registerDate: bugData.registerDate,
    startDate: bugData.startDate,
    endDate: bugData.endDate,
    year: bugData.year,
    commitsCount: Array.isArray(bugData.commits) ? bugData.commits.length : 0,
    pipelineStatus: bugData.pipelineStatus || undefined
  };
}

/**
 * Extract essential fields for proposal table view
 * @param {Object} proposalData - Full proposal data from /cards
 * @param {string} firebaseId - Firebase key of the card
 * @returns {Object} - Minimal data for table view
 */
function extractProposalViewFields(proposalData, firebaseId) {
  return {
    firebaseId,
    cardId: proposalData.cardId,
    title: proposalData.title,
    status: proposalData.status,
    businessPoints: proposalData.businessPoints,
    createdBy: proposalData.createdBy,
    stakeholder: proposalData.stakeholder,
    registerDate: proposalData.registerDate,
    year: proposalData.year
  };
}

/**
 * Handle card sync to views
 * @param {Object} params - Event params { projectId, section, cardId }
 * @param {Object|null} beforeData - Data before change (null if created)
 * @param {Object|null} afterData - Data after change (null if deleted)
 * @param {Object} deps - Dependencies { db, logger }
 */
async function handleSyncCardViews(params, beforeData, afterData, deps) {
  const { projectId, section, cardId } = params;
  const { db, logger } = deps;

  // Determine which view this section maps to
  const viewType = getViewPathForSection(section);

  if (!viewType) {
    // Section doesn't need a view (epics, sprints, qa)
    return;
  }

  const viewRef = db.ref(`/views/${viewType}/${projectId}/${cardId}`);

  // Handle deletion
  if (!afterData) {
    logger.info(`Removing view entry: /views/${viewType}/${projectId}/${cardId}`);
    await viewRef.remove();
    return;
  }

  // Extract appropriate fields based on view type
  let viewData;
  switch (viewType) {
    case 'task-list':
      viewData = extractTaskViewFields(afterData, cardId);
      break;
    case 'bug-list':
      viewData = extractBugViewFields(afterData, cardId);
      break;
    case 'proposal-list':
      viewData = extractProposalViewFields(afterData, cardId);
      break;
    default:
      return;
  }

  // Remove undefined values to keep data clean
  Object.keys(viewData).forEach(key => {
    if (viewData[key] === undefined) {
      delete viewData[key];
    }
  });

  logger.info(`Syncing view: /views/${viewType}/${projectId}/${cardId}`);
  await viewRef.set(viewData);

  // Also sync public view if this project is public or has a publicToken
  await syncPublicView(projectId, section, cardId, afterData, db, logger);
}

/**
 * Sync a card to /publicViews/{projectId}/{type}/{cardId} if the project is public.
 * Checks /projects/{projectId}/public and /projects/{projectId}/publicToken.
 */
async function syncPublicView(projectId, section, cardId, cardData, db, logger) {
  const publicType = getPublicViewType(section);
  if (!publicType) return; // Skip sections without public views (proposals, qa, sprints)

  const publicRef = db.ref(`/publicViews/${projectId}/${publicType}/${cardId}`);

  // Handle deletion
  if (!cardData) {
    await publicRef.remove();
    return;
  }

  // Check if project is public or has a token
  const projectSnap = await db.ref(`/projects/${projectId}`).once('value');
  const project = projectSnap.val();
  if (!project || (!project.public && !project.publicToken)) {
    // Not a public project — ensure no stale public view exists
    await publicRef.remove();
    return;
  }

  // Skip deleted cards
  if (cardData.deletedAt) {
    await publicRef.remove();
    return;
  }

  const cardType = publicType === 'tasks' ? 'task' : publicType === 'bugs' ? 'bug' : 'epic';
  const viewData = extractPublicViewFields(cardData, cardId, cardType);

  logger.info(`Syncing public view: /publicViews/${projectId}/${publicType}/${cardId}`);
  await publicRef.set(viewData);
}

const PUBLIC_VIEWS_BATCH_SIZE = 20;

/**
 * Map a public view type ('tasks'|'bugs'|'epics') to its singular card type.
 */
function getCardTypeForPublicType(publicType) {
  if (publicType === 'tasks') return 'task';
  if (publicType === 'bugs') return 'bug';
  if (publicType === 'epics') return 'epic';
  return null;
}

/**
 * Backfill /publicViews/{projectId}/{tasks|bugs|epics}/ from /cards/{projectId}.
 * Walks every TASKS_*, BUGS_*, EPICS_* section, skips cards with `deletedAt`,
 * and writes the whitelisted PUBLIC_VIEW_FIELDS in batches.
 *
 * Idempotent: existing entries are overwritten with current data.
 *
 * @param {string} projectId - Firebase key of the project
 * @param {Object} db - Realtime Database admin instance
 * @param {Object} logger - Cloud Functions logger
 * @returns {Promise<{written: number, sections: number}>}
 */
async function backfillPublicViewsForProject(projectId, db, logger) {
  const cardsSnap = await db.ref(`/cards/${projectId}`).once('value');
  const sections = cardsSnap.val() || {};

  const updates = {};
  let written = 0;
  let scannedSections = 0;

  for (const [sectionKey, cards] of Object.entries(sections)) {
    if (!cards || typeof cards !== 'object') continue;

    const publicType = getPublicViewType(sectionKey);
    if (!publicType) continue;

    const cardType = getCardTypeForPublicType(publicType);
    scannedSections++;

    for (const [firebaseId, card] of Object.entries(cards)) {
      if (!card || typeof card !== 'object' || card.deletedAt) continue;
      const viewData = extractPublicViewFields(card, firebaseId, cardType);
      updates[`/publicViews/${projectId}/${publicType}/${firebaseId}`] = viewData;
      written++;
    }
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    logger.info(`Backfill ${projectId}: no eligible cards (${scannedSections} sections scanned)`);
    return { written: 0, sections: scannedSections };
  }

  for (let i = 0; i < keys.length; i += PUBLIC_VIEWS_BATCH_SIZE) {
    const batch = {};
    keys.slice(i, i + PUBLIC_VIEWS_BATCH_SIZE).forEach(k => { batch[k] = updates[k]; });
    await db.ref().update(batch);
  }

  logger.info(`Backfill ${projectId}: wrote ${written} cards in ${Math.ceil(keys.length / PUBLIC_VIEWS_BATCH_SIZE)} batches`);
  return { written, sections: scannedSections };
}

/**
 * Remove all entries under /publicViews/{projectId} in a single call.
 *
 * @param {string} projectId - Firebase key of the project
 * @param {Object} db - Realtime Database admin instance
 * @param {Object} logger - Cloud Functions logger
 */
async function clearPublicViewsForProject(projectId, db, logger) {
  await db.ref(`/publicViews/${projectId}`).remove();
  logger.info(`Cleared /publicViews/${projectId}`);
}

/**
 * Extract whitelisted, JSON-safe fields for the /publicProjects/{id} directory.
 * Skips undefined/empty values so the directory never publishes stub entries.
 *
 * @param {Object} projectData - Full project data from /projects/{id}
 * @param {string} updatedAt - ISO timestamp to stamp the snapshot
 * @returns {Object} - Minimal safe metadata, includes updatedAt
 */
function extractPublicProjectFields(projectData, updatedAt) {
  const entry = { updatedAt };
  for (const field of PUBLIC_PROJECT_FIELDS) {
    const value = projectData[field];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    entry[field] = value;
  }
  return entry;
}

/**
 * Decide whether a project transition needs backfill, clear, or no-op.
 * Treats a project as public when `public === true` OR `publicToken` is a
 * non-empty string.
 *
 * @param {Object|null} before - Project data before the write (null on create)
 * @param {Object|null} after - Project data after the write (null on delete)
 * @returns {'backfill'|'clear'|'noop'}
 */
function decideProjectPublicAction(before, after) {
  const wasPublic = Boolean(before && (before.public === true || (typeof before.publicToken === 'string' && before.publicToken.length > 0)));
  const isPublic = Boolean(after && (after.public === true || (typeof after.publicToken === 'string' && after.publicToken.length > 0)));

  if (!wasPublic && isPublic) return 'backfill';
  if (wasPublic && !isPublic) return 'clear';
  return 'noop';
}

/**
 * Write a /publicProjects/{projectId} entry from the current project snapshot.
 *
 * @param {string} projectId - Firebase key of the project
 * @param {Object} projectData - Project data after the write
 * @param {Object} db - Realtime Database admin instance
 * @param {Object} logger - Cloud Functions logger
 * @param {string} [nowIso] - Optional ISO timestamp (defaults to Date.now())
 */
async function writePublicProjectEntry(projectId, projectData, db, logger, nowIso) {
  const updatedAt = nowIso || new Date().toISOString();
  const entry = extractPublicProjectFields(projectData, updatedAt);
  await db.ref(`/publicProjects/${projectId}`).set(entry);
  logger.info(`Wrote /publicProjects/${projectId}`);
}

/**
 * Remove the /publicProjects/{projectId} directory entry.
 *
 * @param {string} projectId - Firebase key of the project
 * @param {Object} db - Realtime Database admin instance
 * @param {Object} logger - Cloud Functions logger
 */
async function clearPublicProjectEntry(projectId, db, logger) {
  await db.ref(`/publicProjects/${projectId}`).remove();
  logger.info(`Cleared /publicProjects/${projectId}`);
}

/**
 * True when at least one PUBLIC_PROJECT_FIELDS value differs between snapshots.
 *
 * @param {Object|null} before
 * @param {Object|null} after
 * @returns {boolean}
 */
function hasPublicProjectFieldsChanged(before, after) {
  const a = before || {};
  const b = after || {};
  return PUBLIC_PROJECT_FIELDS.some(
    (field) => JSON.stringify(a[field]) !== JSON.stringify(b[field])
  );
}

/**
 * Cloud Function handler for /projects/{projectId} writes.
 * Mirrors the public-flag transition into /publicViews/ and the public
 * directory entry in /publicProjects/{projectId}.
 *
 * @param {Object} params - { projectId }
 * @param {Object|null} beforeData - Project state before the write
 * @param {Object|null} afterData - Project state after the write
 * @param {Object} deps - { db, logger }
 * @returns {Promise<{action: string, written?: number}>}
 */
async function handleSyncProjectPublicViews(params, beforeData, afterData, deps) {
  const { projectId } = params;
  const { db, logger } = deps;

  const action = decideProjectPublicAction(beforeData, afterData);
  const isPublicAfter = Boolean(
    afterData && (afterData.public === true || (typeof afterData.publicToken === 'string' && afterData.publicToken.length > 0))
  );

  if (action === 'clear') {
    await clearPublicViewsForProject(projectId, db, logger);
    await clearPublicProjectEntry(projectId, db, logger);
    return { action };
  }

  if (action === 'backfill') {
    const result = await backfillPublicViewsForProject(projectId, db, logger);
    await writePublicProjectEntry(projectId, afterData, db, logger);
    return { action, written: result.written };
  }

  // noop public-flag transition. Still refresh the directory entry when
  // the project stays public AND any whitelisted directory field changed,
  // so name/description/repoUrl edits propagate without a manual toggle.
  if (isPublicAfter && hasPublicProjectFieldsChanged(beforeData, afterData)) {
    await writePublicProjectEntry(projectId, afterData, db, logger);
    return { action: 'refresh' };
  }

  return { action };
}

module.exports = {
  handleSyncCardViews,
  extractTaskViewFields,
  extractBugViewFields,
  extractProposalViewFields,
  extractPublicViewFields,
  extractPublicProjectFields,
  getViewPathForSection,
  getPublicViewType,
  getCardTypeForPublicType,
  syncPublicView,
  backfillPublicViewsForProject,
  clearPublicViewsForProject,
  writePublicProjectEntry,
  clearPublicProjectEntry,
  hasPublicProjectFieldsChanged,
  decideProjectPublicAction,
  handleSyncProjectPublicViews,
  PUBLIC_VIEW_FIELDS,
  PUBLIC_PROJECT_FIELDS,
  PUBLIC_VIEWS_BATCH_SIZE
};

/**
 * IA Plan Tasks handler.
 * Creates and regenerates task cards from accepted development plans.
 *
 * Extracted from functions/index.js during monolith refactor.
 */
'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { generateCardId } = require('../shared/card-utils.cjs');
const { extractKeywords, findBestEpicMatch, extractPhaseKeywords } = require('../helpers/epic-inference');

/**
 * Infer which epic to assign to each phase.
 * Strategy:
 * - If phase already has epicIds assigned, use the first one
 * - If there are few phases (<=3) and the plan is cohesive, use/create a single epic for the whole plan
 * - For each phase, try to match its name against existing epic titles using keyword overlap
 * - If no match found, create a new epic based on the plan title
 *
 * @param {object} db - Firebase database reference
 * @param {string} projectId - Project ID
 * @param {Array} phases - Plan phases
 * @param {Array} existingEpics - Existing epics [{firebaseId, cardId, title}]
 * @param {string} planTitle - The plan title (used for new epic naming)
 * @param {string} createdBy - Creator email
 * @param {string} now - ISO timestamp
 * @param {object} firestore - Firestore instance (for generateCardId)
 * @param {object} logger - Logger instance
 * @returns {Promise<object>} Map of phaseIndex -> epicCardId
 */
async function inferEpicsForPhases(db, projectId, phases, existingEpics, planTitle, createdBy, now, firestore, logger) {
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
      bestMatch = await createEpicForPlan(db, projectId, planTitle, createdBy, now, firestore, logger);
    }
    phases.forEach((p, i) => {
      phaseEpicMap[i] = (p.epicIds && p.epicIds.length > 0) ? p.epicIds[0] : bestMatch;
    });
    return phaseEpicMap;
  }

  // For larger plans, try to match each phase individually using phase name + task titles
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (phase.epicIds && phase.epicIds.length > 0) {
      phaseEpicMap[i] = phase.epicIds[0];
      continue;
    }

    // Use enriched keywords (phase name + task titles) for better matching
    const phaseKeywords = extractPhaseKeywords(phase);
    const match = findBestEpicMatch(phaseKeywords, existingEpics);
    if (match) {
      phaseEpicMap[i] = match;
    } else {
      // Create a phase-specific epic when no match found
      const phaseTitle = phase.name || `${planTitle} - Phase ${i + 1}`;
      phaseEpicMap[i] = await createEpicForPlan(db, projectId, phaseTitle, createdBy, now, firestore, logger);
    }
  }

  return phaseEpicMap;
}

/**
 * Create a new epic card for a plan.
 * @param {object} db - Firebase database reference
 * @param {string} projectId
 * @param {string} planTitle
 * @param {string} createdBy
 * @param {string} now - ISO timestamp
 * @param {object} firestore - Firestore instance
 * @param {object} logger - Logger instance
 * @returns {Promise<string>} New epic card ID
 */
async function createEpicForPlan(db, projectId, planTitle, createdBy, now, firestore, logger) {
  const epicCardId = await generateCardId(projectId, 'epics', firestore);
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

/**
 * Build a single task card data object for plan-generated tasks.
 * @param {object} params
 * @returns {object} Card data
 */
function buildPlanTaskCardData({ cardId, firebaseId, projectId, task, phase, phaseIndex, planId, epicId, createdBy, now }) {
  const descriptionStructured = {
    role: task.como || '',
    goal: task.quiero || '',
    benefit: task.para || ''
  };

  return {
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
}

/**
 * Handle the createTasksFromPlan callable function.
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.db - Firebase RTDB reference (from getDatabase())
 * @param {object} deps.firestore - Firestore instance
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleCreateTasksFromPlan(request, deps) {
  const { db, firestore, logger } = deps;
  const { projectId, planId } = request.data || {};

  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'projectId is required');
  }
  if (!planId || typeof planId !== 'string') {
    throw new HttpsError('invalid-argument', 'planId is required');
  }

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
  const phaseEpicMap = await inferEpicsForPhases(db, projectId, phases, existingEpics, plan.title, createdBy, now, firestore, logger);

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const phase = phases[phaseIndex];
    const phaseTasks = phase.tasks || [];
    const epicId = phaseEpicMap[phaseIndex] || '';

    for (const task of phaseTasks) {
      if (!task.title) continue;

      // Generate unique card ID
      const cardId = await generateCardId(projectId, 'tasks', firestore);

      // Generate Firebase push key
      const newCardRef = db.ref(cardPath).push();
      const firebaseId = newCardRef.key;

      // Build card data
      const cardData = buildPlanTaskCardData({
        cardId, firebaseId, projectId, task, phase, phaseIndex, planId, epicId, createdBy, now
      });

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
}

/**
 * Handle the regenerateTasksFromPlan callable function.
 * Deletes previously generated tasks (only if still in "To Do") and creates new ones.
 * @param {object} request - Firebase callable request
 * @param {object} deps - Injected dependencies
 * @param {object} deps.db - Firebase RTDB reference
 * @param {object} deps.firestore - Firestore instance
 * @param {object} deps.logger - Logger instance
 * @returns {Promise<object>}
 */
async function handleRegenerateTasksFromPlan(request, deps) {
  const { db, firestore, logger } = deps;
  const { projectId, planId } = request.data || {};

  if (!projectId || typeof projectId !== 'string') {
    throw new HttpsError('invalid-argument', 'projectId is required');
  }
  if (!planId || typeof planId !== 'string') {
    throw new HttpsError('invalid-argument', 'planId is required');
  }

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

  // Now create new tasks with re-inferred epics
  const phases = cleanedPhases;
  const createdTasks = [];
  const now = new Date().toISOString();
  const createdBy = request.auth?.token?.email || 'system';

  // Re-run epic inference for regeneration
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

  const phaseEpicMap = await inferEpicsForPhases(db, projectId, phases, existingEpics, plan.title, createdBy, now, firestore, logger);

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const phase = phases[phaseIndex];
    const phaseTasks = phase.tasks || [];
    const epicId = phaseEpicMap[phaseIndex] || '';

    for (const task of phaseTasks) {
      if (!task.title) continue;

      const cardId = await generateCardId(projectId, 'tasks', firestore);
      const newCardRef = db.ref(cardPath).push();
      const firebaseId = newCardRef.key;

      const cardData = buildPlanTaskCardData({
        cardId,
        firebaseId,
        projectId,
        task,
        phase,
        phaseIndex,
        planId,
        epicId,
        createdBy,
        now
      });

      await newCardRef.set(cardData);
      createdTasks.push({ cardId, firebaseId, title: task.title.trim(), phaseIndex, epic: epicId });
    }
  }

  // Update plan with new generated tasks (including inferred epics)
  const generatedTasksData = createdTasks.map(t => ({
    cardId: t.cardId,
    firebaseId: t.firebaseId,
    phaseIndex: t.phaseIndex
  }));

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

  return {
    createdTasks,
    totalCreated: createdTasks.length,
    skippedTasks
  };
}

module.exports = {
  handleCreateTasksFromPlan,
  handleRegenerateTasksFromPlan,
  // Exported for testing
  inferEpicsForPhases,
  createEpicForPlan,
};

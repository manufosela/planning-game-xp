import { z } from 'zod';
import { getDatabase, getFirestore } from '../firebase-adapter.js';
import { buildSectionPath, SECTION_MAP, CARD_TYPE_MAP, GROUP_MAP, getAbbrId } from '../../shared/utils.js';
import {
  SPRINT_NAME_EXAMPLE,
  isValidSprintName,
  buildSprintName,
  getSprintBoundsForDay,
  findSprintForDay,
  getNextSprintNumberForYear
} from '../../shared/sprint-naming.js';
import { getMcpUserId } from '../user.js';

export const listSprintsSchema = z.object({
  projectId: z.string().describe('Project ID (e.g., "Cinema4D", "Intranet")'),
  year: z.number().optional().describe('Filter by year')
});

export const createSprintSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().optional().describe(
    'Sprint title. Optional: if omitted, generated as "Sprint N - YYYYMMDD" where N is the per-year correlative. ' +
    'If passed, must match the strict format "Sprint N - YYYYMMDD" with optional " - <suffix>".'
  ),
  suffix: z.string().optional().describe(
    'Optional human suffix appended after the date tag (e.g. "Foundations" → "Sprint 1 - 20260607 - Foundations"). ' +
    'Ignored when an explicit title is passed.'
  ),
  startDate: z.string().optional().describe(
    'Ignored. The sprint always spans the current UTC day (startDate=today 00:00:00Z, endDate=today 23:59:59Z). ' +
    'Passing this triggers a warning in the response.'
  ),
  endDate: z.string().optional().describe(
    'Ignored. See startDate.'
  ),
  status: z.string().optional().describe('Sprint status (default: "Planning")'),
  devPoints: z.number().optional().describe('Total dev points planned'),
  businessPoints: z.number().optional().describe('Total business points planned')
});

export const updateSprintSchema = z.object({
  projectId: z.string().describe('Project ID'),
  firebaseId: z.string().describe('Firebase key of the sprint'),
  updates: z.record(z.unknown()).describe('Fields to update')
});

export const getSprintSchema = z.object({
  projectId: z.string().describe('Project ID'),
  cardId: z.string().describe('Sprint card ID (e.g., "GSP-SPR-0001")')
});

export async function listSprints({ projectId, year }) {
  const db = getDatabase();
  const sectionPath = buildSectionPath(projectId, 'sprint');
  const snapshot = await db.ref(sectionPath).once('value');
  const sprintsData = snapshot.val();

  if (!sprintsData) {
    return { content: [{ type: 'text', text: `No sprints found in project "${projectId}".` }] };
  }

  let sprints = Object.entries(sprintsData).map(([firebaseId, sprint]) => ({
    firebaseId,
    cardId: sprint.cardId,
    title: sprint.title,
    status: sprint.status,
    startDate: sprint.startDate || null,
    endDate: sprint.endDate || null,
    year: sprint.year || null,
    devPoints: sprint.devPoints || null,
    businessPoints: sprint.businessPoints || null
  }));

  if (year) {
    sprints = sprints.filter(s => s.year === year);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(sprints, null, 2)
    }]
  };
}

export async function getSprint({ projectId, cardId }) {
  const db = getDatabase();
  const sectionPath = buildSectionPath(projectId, 'sprint');
  const snapshot = await db.ref(sectionPath).once('value');
  const sprintsData = snapshot.val();

  if (!sprintsData) {
    return { content: [{ type: 'text', text: `No sprints found in project "${projectId}".` }] };
  }

  for (const [firebaseId, sprint] of Object.entries(sprintsData)) {
    if (sprint.cardId === cardId) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ firebaseId, ...sprint }, null, 2)
        }]
      };
    }
  }

  return { content: [{ type: 'text', text: `Sprint "${cardId}" not found in project "${projectId}".` }] };
}

export async function createSprint({
  projectId,
  title,
  suffix,
  startDate,
  endDate,
  status,
  devPoints,
  businessPoints
}, deps = {}) {
  const db = getDatabase();
  const firestore = getFirestore();
  const now = deps.now instanceof Date ? deps.now : new Date();

  const abbrSnapshot = await db.ref(`/projects/${projectId}/abbreviation`).once('value');
  const projectAbbr = abbrSnapshot.val();
  if (!projectAbbr) {
    throw new Error(`Project "${projectId}" has no abbreviation configured.`);
  }

  const sectionPath = buildSectionPath(projectId, 'sprint');
  const existingSnapshot = await db.ref(sectionPath).once('value');
  const existingSprints = existingSnapshot.val();

  // Strict policy: 1 sprint = 1 day, UTC.
  const bounds = getSprintBoundsForDay(now);
  const warnings = [];

  // Idempotency: if a sprint already covers today, return it.
  const existingToday = findSprintForDay(existingSprints, now);
  if (existingToday) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: 'Sprint for today already exists; returning the existing one (idempotent).',
          idempotent: true,
          cardId: existingToday.sprint.cardId,
          firebaseId: existingToday.firebaseId,
          projectId,
          title: existingToday.sprint.title,
          startDate: existingToday.sprint.startDate,
          endDate: existingToday.sprint.endDate
        }, null, 2)
      }]
    };
  }

  if (startDate || endDate) {
    warnings.push(
      `Ignored startDate/endDate input — sprints always span the current UTC day ` +
      `(${bounds.startDate} → ${bounds.endDate}).`
    );
  }

  // Resolve the title: explicit (must be valid) or auto-generated.
  let finalTitle;
  let autoGenerated = false;
  if (typeof title === 'string' && title.trim().length > 0) {
    if (!isValidSprintName(title.trim())) {
      throw new Error(
        `Invalid sprint title: "${title}". Required format: ${SPRINT_NAME_EXAMPLE}.`
      );
    }
    finalTitle = title.trim();
    if (suffix && suffix.trim().length > 0) {
      warnings.push('Ignored "suffix" because an explicit title was provided.');
    }
  } else {
    const sprintYear = Number(bounds.isoDate.slice(0, 4));
    const nextNumber = getNextSprintNumberForYear(existingSprints, sprintYear);
    finalTitle = buildSprintName(nextNumber, bounds.dateTag, suffix);
    autoGenerated = true;
  }

  const sectionKey = SECTION_MAP['sprint'];
  const sectionAbbr = getAbbrId(sectionKey);
  const counterKey = `${projectAbbr}-${sectionAbbr}`;
  const counterRef = firestore.collection('projectCounters').doc(counterKey);

  const cardId = await firestore.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(counterRef);
    let lastId = 0;

    if (docSnap.exists) {
      lastId = docSnap.data().lastId || 0;
    }

    const newId = lastId + 1;
    transaction.set(counterRef, { lastId: newId }, { merge: true });

    const newIdStr = newId.toString().padStart(4, '0');
    return `${counterKey}-${newIdStr}`;
  });

  const sprintYear = Number(bounds.isoDate.slice(0, 4));
  const newSprintRef = db.ref(sectionPath).push();

  const sprintData = {
    cardId,
    cardType: CARD_TYPE_MAP['sprint'],
    group: GROUP_MAP['sprint'],
    projectId,
    title: finalTitle,
    year: sprintYear,
    status: status || 'Planning',
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    createdAt: now.toISOString(),
    createdBy: getMcpUserId(),
    firebaseId: newSprintRef.key
  };

  if (devPoints !== undefined) sprintData.devPoints = devPoints;
  if (businessPoints !== undefined) sprintData.businessPoints = businessPoints;

  await newSprintRef.set(sprintData);

  const response = {
    message: 'Sprint created successfully',
    cardId,
    firebaseId: newSprintRef.key,
    projectId,
    title: finalTitle,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    durationDays: 1,
    autoGenerated
  };
  if (warnings.length > 0) response.warnings = warnings;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2)
    }]
  };
}

export async function updateSprint({ projectId, firebaseId, updates }) {
  const db = getDatabase();
  const sectionPath = buildSectionPath(projectId, 'sprint');
  const sprintRef = db.ref(`${sectionPath}/${firebaseId}`);

  const snapshot = await sprintRef.once('value');
  if (!snapshot.exists()) {
    throw new Error(`Sprint with firebaseId "${firebaseId}" not found in project "${projectId}".`);
  }

  const protectedFields = ['cardId', 'firebaseId', 'cardType', 'group', 'projectId'];
  for (const field of protectedFields) {
    if (field in updates) {
      throw new Error(`Cannot update protected field: "${field}"`);
    }
  }

  // AC4: Sprint dates are immutable when tasks are In Progress or To Validate
  const isDateChange = 'startDate' in updates || 'endDate' in updates;
  if (isDateChange) {
    const currentSprint = snapshot.val();
    const sprintCardId = currentSprint.cardId;

    const taskSectionPath = buildSectionPath(projectId, 'task');
    const tasksSnapshot = await db.ref(taskSectionPath).once('value');
    const tasksData = tasksSnapshot.val();

    if (tasksData) {
      const activeStatuses = ['In Progress', 'To Validate'];
      const activeTasks = Object.values(tasksData).filter(
        task => task.sprint === sprintCardId && activeStatuses.includes(task.status)
      );

      if (activeTasks.length > 0) {
        const taskList = activeTasks.map(t => `${t.cardId} (${t.status})`).join(', ');
        throw new Error(
          `Cannot change sprint dates: sprint "${sprintCardId}" has active tasks (${taskList}). ` +
          'Sprint dates are immutable while tasks are "In Progress" or "To Validate".'
        );
      }
    }
  }

  updates.updatedAt = new Date().toISOString();
  updates.updatedBy = getMcpUserId();

  await sprintRef.update(updates);

  const updatedSnapshot = await sprintRef.once('value');

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'Sprint updated successfully',
        sprint: updatedSnapshot.val()
      }, null, 2)
    }]
  };
}

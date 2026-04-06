import { z } from 'zod';
import { getDatabase, getFirestore } from '../firebase-adapter.js';
import { buildSectionPath, SECTION_MAP, CARD_TYPE_MAP, GROUP_MAP, getAbbrId } from '../../shared/utils.js';
import { getMcpUserId } from '../user.js';

export const listSprintsSchema = z.object({
  projectId: z.string().describe('Project ID (e.g., "Cinema4D", "Intranet")'),
  year: z.number().optional().describe('Filter by year')
});

export const createSprintSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('Sprint title'),
  startDate: z.string().optional().describe('Sprint start date (YYYY-MM-DD). Only allowed for the first sprint in a project.'),
  endDate: z.string().optional().describe('Sprint end date (YYYY-MM-DD). Only allowed for the first sprint in a project.'),
  year: z.number().optional().describe('Year (default: extracted from startDate or current year)'),
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

export async function createSprint({ projectId, title, startDate, endDate, year, status, devPoints, businessPoints }) {
  const db = getDatabase();
  const firestore = getFirestore();

  const abbrSnapshot = await db.ref(`/projects/${projectId}/abbreviation`).once('value');
  const projectAbbr = abbrSnapshot.val();
  if (!projectAbbr) {
    throw new Error(`Project "${projectId}" has no abbreviation configured.`);
  }

  // AC2: Only the first sprint in a project can have startDate/endDate
  const sectionPath = buildSectionPath(projectId, 'sprint');
  const existingSnapshot = await db.ref(sectionPath).once('value');
  const existingSprints = existingSnapshot.val();
  const sprintCount = existingSprints ? Object.keys(existingSprints).length : 0;

  if (sprintCount > 0 && (startDate || endDate)) {
    throw new Error(
      'Only the first sprint in a project can have startDate and endDate. ' +
      'Subsequent sprints must be created without dates. ' +
      'Update the sprint dates later using update_sprint when the sprint becomes active.'
    );
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

  const sprintYear = year || (startDate ? parseInt(startDate.split('-')[0], 10) : new Date().getFullYear());

  const newSprintRef = db.ref(sectionPath).push();

  const sprintData = {
    cardId,
    cardType: CARD_TYPE_MAP['sprint'],
    group: GROUP_MAP['sprint'],
    projectId,
    title,
    year: sprintYear,
    status: status || 'Planning',
    createdAt: new Date().toISOString(),
    createdBy: getMcpUserId(),
    firebaseId: newSprintRef.key
  };

  if (startDate) sprintData.startDate = startDate;
  if (endDate) sprintData.endDate = endDate;
  if (devPoints !== undefined) sprintData.devPoints = devPoints;
  if (businessPoints !== undefined) sprintData.businessPoints = businessPoints;

  await newSprintRef.set(sprintData);

  // Build response
  const response = {
    message: 'Sprint created successfully',
    cardId,
    firebaseId: newSprintRef.key,
    projectId
  };

  if (startDate) response.startDate = startDate;
  if (endDate) response.endDate = endDate;

  // AI duration warning
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    response.durationDays = durationDays;

    const userId = getMcpUserId();
    const isAiUser = userId === 'geniova-mcp' || userId === 'becaria-mcp';
    if (isAiUser && durationDays > 1) {
      response.warning = `Sprint duration is ${durationDays} days. As an AI agent, consider whether this duration is appropriate. Typical AI sprints are 1 day or less.`;
    }
  } else {
    response.durationDays = 0;
  }

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

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

export const SPRINT_POLICY_NOTE =
  'Sprint = 1 day of work by default (this is not Scrum). ' +
  'Pass explicit startDate and/or endDate to extend a sprint beyond a single day. ' +
  'Sprints longer than the instance limit require allowLongSprint:true.';

// Default upper bound (in days) for a sprint created without allowLongSprint.
// Enforcement introduced in PLN-TSK-0355 after a real-world case where an
// agent stretched a sprint to 15 days ignoring the advisory-only policy.
export const DEFAULT_MAX_SPRINT_DAYS_WITHOUT_FLAG = 1;
const SPRINT_POLICY_CONFIG_PATH = '/data/config/sprintPolicy';

/**
 * Read the per-instance sprint policy config from RTDB. Robust against a
 * missing path — returns the safe default so a fresh instance without config
 * enforces the 1-day rule out of the box.
 *
 * @param {object} db - Firebase Admin database instance
 * @returns {Promise<{maxDaysWithoutFlag: number, isDefault: boolean}>}
 */
export async function readSprintPolicyConfig(db) {
  try {
    const snap = await db.ref(SPRINT_POLICY_CONFIG_PATH).once('value');
    const raw = snap.val();
    if (!raw || typeof raw !== 'object') {
      return { maxDaysWithoutFlag: DEFAULT_MAX_SPRINT_DAYS_WITHOUT_FLAG, isDefault: true };
    }
    const parsed = Number(raw.maxDaysWithoutFlag);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return { maxDaysWithoutFlag: DEFAULT_MAX_SPRINT_DAYS_WITHOUT_FLAG, isDefault: true };
    }
    return { maxDaysWithoutFlag: Math.floor(parsed), isDefault: false };
  } catch {
    return { maxDaysWithoutFlag: DEFAULT_MAX_SPRINT_DAYS_WITHOUT_FLAG, isDefault: true };
  }
}

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
    'Optional. Sprint start date (YYYY-MM-DD or full ISO). ' +
    'Defaults to today (UTC). The provided day is snapped to 00:00:00.000Z of that day.'
  ),
  endDate: z.string().optional().describe(
    'Optional. Sprint end date (YYYY-MM-DD or full ISO). ' +
    'Defaults to the same day as startDate (1-day sprint). Snapped to 23:59:59.999Z of that day. ' +
    'Must be on or after startDate.'
  ),
  status: z.string().optional().describe('Sprint status (default: "Planning")'),
  devPoints: z.number().optional().describe('Total dev points planned'),
  businessPoints: z.number().optional().describe('Total business points planned'),
  allowLongSprint: z.boolean().optional().describe(
    'REQUIRED opt-in when duration exceeds the instance limit (default 1 day, configurable at /data/config/sprintPolicy/maxDaysWithoutFlag). ' +
    'Pass true only when you consciously want a multi-day sprint. The decision is persisted as longSprintApproved:true in the sprint for audit.'
  )
});

function parseDateInput(input, fieldName) {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') {
    throw new Error(`${fieldName} must be an ISO date string (YYYY-MM-DD or full ISO).`);
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}: "${input}". Expected ISO date (YYYY-MM-DD or full ISO).`);
  }
  return parsed;
}

function computeDurationDays(startIsoDate, endIsoDate) {
  const start = new Date(`${startIsoDate}T00:00:00.000Z`);
  const end = new Date(`${endIsoDate}T00:00:00.000Z`);
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / oneDayMs) + 1;
}

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
  businessPoints,
  allowLongSprint
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

  // Sprint = 1 day by default. Caller can extend by passing explicit
  // startDate/endDate; the canonical title format stays forced.
  const startInput = parseDateInput(startDate, 'startDate');
  const endInput = parseDateInput(endDate, 'endDate');

  const referenceDate = startInput || now;
  const startBounds = getSprintBoundsForDay(referenceDate);
  const endBounds = getSprintBoundsForDay(endInput || referenceDate);

  const finalStart = startBounds.startDate;
  const finalEnd = endBounds.endDate;

  if (finalEnd < finalStart) {
    throw new Error(
      `Invalid sprint range: endDate (${endBounds.isoDate}) must be on or after ` +
      `startDate (${startBounds.isoDate}).`
    );
  }

  const durationDays = computeDurationDays(startBounds.isoDate, endBounds.isoDate);
  const warnings = [];

  // Enforcement of the "Sprint = 1 day by default" policy. Previous behaviour
  // was advisory-only (just a note in the response), which real-world agents
  // ignored. Now the MCP rejects sprints longer than the instance limit
  // unless the caller opts in explicitly with allowLongSprint:true.
  // PLN-TSK-0355.
  const policyConfig = await readSprintPolicyConfig(db);
  const maxDaysWithoutFlag = policyConfig.maxDaysWithoutFlag;
  const longSprintApproved = allowLongSprint === true && durationDays > maxDaysWithoutFlag;
  if (durationDays > maxDaysWithoutFlag && allowLongSprint !== true) {
    const err = new Error(
      `SPRINT_DURATION_EXCEEDS_POLICY: sprint would span ${durationDays} days ` +
      `(limit ${maxDaysWithoutFlag} without explicit approval). ` +
      `Add allowLongSprint:true to the call if this multi-day sprint is intentional. ` +
      `Instance policy: ${policyConfig.isDefault ? 'default (1 day)' : `custom (${maxDaysWithoutFlag} days)`}. ` +
      `Configure at /data/config/sprintPolicy/maxDaysWithoutFlag.`
    );
    err.code = 'SPRINT_DURATION_EXCEEDS_POLICY';
    throw err;
  }

  // Idempotency: if a sprint already starts on the reference day, return it.
  // (Multi-day requests find the same anchor too — extend via update_sprint.)
  const existingForDay = findSprintForDay(existingSprints, referenceDate);
  if (existingForDay) {
    const sameDay = referenceDate.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: sameDay
            ? 'Sprint for today already exists; returning the existing one (idempotent).'
            : 'A sprint already starts on that day; returning the existing one (idempotent). ' +
              'Use update_sprint to change its duration.',
          idempotent: true,
          policy: SPRINT_POLICY_NOTE,
          cardId: existingForDay.sprint.cardId,
          firebaseId: existingForDay.firebaseId,
          projectId,
          title: existingForDay.sprint.title,
          startDate: existingForDay.sprint.startDate,
          endDate: existingForDay.sprint.endDate
        }, null, 2)
      }]
    };
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
    const sprintYear = Number(startBounds.isoDate.slice(0, 4));
    const nextNumber = getNextSprintNumberForYear(existingSprints, sprintYear);
    finalTitle = buildSprintName(nextNumber, startBounds.dateTag, suffix);
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

  const sprintYear = Number(startBounds.isoDate.slice(0, 4));
  const newSprintRef = db.ref(sectionPath).push();

  const sprintData = {
    cardId,
    cardType: CARD_TYPE_MAP['sprint'],
    group: GROUP_MAP['sprint'],
    projectId,
    title: finalTitle,
    year: sprintYear,
    status: status || 'Planning',
    startDate: finalStart,
    endDate: finalEnd,
    createdAt: now.toISOString(),
    createdBy: getMcpUserId(),
    firebaseId: newSprintRef.key
  };

  if (devPoints !== undefined) sprintData.devPoints = devPoints;
  if (businessPoints !== undefined) sprintData.businessPoints = businessPoints;
  if (longSprintApproved) sprintData.longSprintApproved = true;

  await newSprintRef.set(sprintData);

  const response = {
    message: 'Sprint created successfully',
    policy: SPRINT_POLICY_NOTE,
    cardId,
    firebaseId: newSprintRef.key,
    projectId,
    title: finalTitle,
    startDate: finalStart,
    endDate: finalEnd,
    durationDays,
    autoGenerated,
    appliedLimit: maxDaysWithoutFlag
  };
  if (longSprintApproved) response.longSprintApproved = true;
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

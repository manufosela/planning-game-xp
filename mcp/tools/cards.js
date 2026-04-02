import { z } from 'zod';
import { getDatabase, getFirestore } from '../firebase-adapter.js';
import { SECTION_MAP, CARD_TYPE_MAP, GROUP_MAP, getAbbrId, buildSectionPath } from '../../shared/utils.js';
import { getMcpUser } from '../user.js';
import { generatePriorityMap, calculatePriority, PRIORITY_MAP_1_5, PRIORITY_MAP_FIBONACCI } from '../../shared/priority.js';
import {
  VALID_BUG_STATUSES,
  VALID_BUG_PRIORITIES,
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  VALID_ID_PREFIXES,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  REQUIRED_FIELDS_FOR_TO_VALIDATE,
  REQUIRED_FIELDS_TO_CLOSE_BUG,
  MCP_RESTRICTED_STATUSES,
  VALIDATOR_ONLY_STATUSES,
  FRIENDLY_FIELD_NAMES,
  TYPE_DEFAULTS,
  VALID_RELATION_TYPES,
  VALID_STEP_STATUSES,
  VALID_PLAN_STATUSES,
  TASK_TRANSITION_RULES,
  BLOCKED_REQUIRED_FIELDS
} from '../../shared/constants.js';
import {
  validateEntityId,
  validateEntityIds,
  collectEntityIdIssues,
  hasValidValue,
  validateBugFields,
  validateBugStatusTransition,
  collectBugValidationIssues,
  validateTaskFields,
  collectTaskValidationIssues,
  validateStatusTransition,
  collectValidationIssues,
  validateCommitsField,
  appendCommitsToCard,
  migrateImplementationPlan,
  validateImplementationPlan
} from '../../shared/validation.js';
import { getListTexts, getListPairs, resolveValue } from '../services/list-service.js';

// Re-export for use by register-tools.js and tests
export {
  VALID_BUG_STATUSES,
  VALID_BUG_PRIORITIES,
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  VALID_RELATION_TYPES,
  TASK_TRANSITION_RULES,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  REQUIRED_FIELDS_FOR_TO_VALIDATE,
  REQUIRED_FIELDS_TO_CLOSE_BUG,
  MCP_RESTRICTED_STATUSES,
  VALIDATOR_ONLY_STATUSES,
  generatePriorityMap,
  calculatePriority,
  PRIORITY_MAP_1_5,
  PRIORITY_MAP_FIBONACCI,
  validateEntityId,
  validateEntityIds,
  hasValidValue,
  validateBugFields,
  validateTaskFields,
  validateBugStatusTransition
};

// ──────────────────────────────────────────────
// Plan-first workflow tracking (session-based)
// ──────────────────────────────────────────────

// Tracks tasks created without planId per project in this MCP session
// Key: projectId, Value: count of tasks without planId
const _sessionTasksWithoutPlan = new Map();

const PLAN_FIRST_THRESHOLD = 2;

export function getSessionTasksWithoutPlan(projectId) {
  return _sessionTasksWithoutPlan.get(projectId) || 0;
}

export function resetSessionTaskCounter(projectId) {
  if (projectId) {
    _sessionTasksWithoutPlan.delete(projectId);
  } else {
    _sessionTasksWithoutPlan.clear();
  }
}

// ──────────────────────────────────────────────
// Sprint helpers
// ──────────────────────────────────────────────

export async function validateSprintExists(projectId, sprint) {
  if (!sprint) return;

  const db = getDatabase();
  const sprintSectionPath = buildSectionPath(projectId, 'sprint');
  const snapshot = await db.ref(sprintSectionPath).once('value');
  const sprintsData = snapshot.val();

  if (!sprintsData) {
    throw new Error(
      `No sprints found in project "${projectId}". ` +
      `Create a sprint first using create_sprint.`
    );
  }

  const sprintExists = Object.values(sprintsData).some(s => s.cardId === sprint);
  if (!sprintExists) {
    const availableSprints = Object.values(sprintsData)
      .map(s => `${s.cardId} (${s.title})`)
      .join(', ');
    throw new Error(
      `Sprint "${sprint}" not found in project "${projectId}". ` +
      `Available sprints: ${availableSprints}. ` +
      `Use list_sprints to see full details.`
    );
  }
}

export async function getActiveSprint(projectId) {
  const db = getDatabase();
  const sprintSectionPath = buildSectionPath(projectId, 'sprint');
  const snapshot = await db.ref(sprintSectionPath).once('value');
  const sprintsData = snapshot.val();

  if (!sprintsData) {
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  const sprints = Object.entries(sprintsData).map(([firebaseId, sprint]) => ({
    firebaseId,
    ...sprint
  }));

  const activeBySatus = sprints.find(s =>
    s.status === 'Active' || s.status === 'In Progress'
  );
  if (activeBySatus) {
    return activeBySatus;
  }

  const activeByDate = sprints.find(s => {
    if (!s.startDate || !s.endDate) return false;
    return s.startDate <= today && today <= s.endDate;
  });
  if (activeByDate) {
    return activeByDate;
  }

  return null;
}

// ──────────────────────────────────────────────
// Type defaults helper
// ──────────────────────────────────────────────

export function applyTypeDefaults(type, data) {
  const defaults = TYPE_DEFAULTS[type] || {};
  const result = { ...data };

  if (!result.status) {
    result.status = defaults.status;
  }

  if (!result.priority) {
    result.priority = defaults.priority;
  }

  if (type === 'bug' && !result.registerDate) {
    result.registerDate = new Date().toISOString().split('T')[0];
  }

  return result;
}

// ──────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────

export const listCardsSchema = z.object({
  projectId: z.string().describe('Project ID (e.g., "Cinema4D", "Intranet")'),
  type: z.enum(['task', 'bug', 'epic', 'proposal', 'qa']).describe('Card type to list'),
  status: z.string().optional().describe('Filter by status (e.g., "To Do", "In Progress", "Done&Validated")'),
  sprint: z.string().optional().describe('Filter by sprint name'),
  developer: z.string().optional().describe('Filter by developer name'),
  planId: z.string().optional().describe('Filter tasks by plan ID (Firebase key)'),
  year: z.number().optional().describe('Filter by year')
});

export const getCardSchema = z.object({
  projectId: z.string().describe('Project ID'),
  cardId: z.string().describe('Card ID (e.g., "C4D-TSK-0042")')
});

export const getTransitionRulesSchema = z.object({
  type: z.enum(['task', 'bug']).optional().describe('Card type (default: task)')
});

export const descriptionStructuredItemSchema = z.object({
  role: z.string().describe('User role (Como...)'),
  goal: z.string().describe('What the user wants (Quiero...)'),
  benefit: z.string().describe('Why they want it (Para...)')
});

export const acceptanceCriteriaItemSchema = z.object({
  given: z.string().optional().describe('Given: Initial context/preconditions'),
  when: z.string().optional().describe('When: Action or event'),
  then: z.string().optional().describe('Then: Expected outcome'),
  raw: z.string().optional().describe('Raw text format if not using Given/When/Then')
});

export const implementationPlanStepSchema = z.object({
  description: z.string().describe('What is done in this step'),
  files: z.string().optional().describe('Affected files (comma-separated paths)'),
  status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Step status (default: pending)')
});

export const implementationPlanSchema = z.object({
  approach: z.string().describe('Technical approach chosen and why'),
  steps: z.array(implementationPlanStepSchema).optional().describe('Implementation steps, each step = 1 potential commit'),
  dataModelChanges: z.string().optional().describe('Data model changes (Firestore, RTDB, etc.)'),
  apiChanges: z.string().optional().describe('API/endpoints/Cloud Functions changes'),
  risks: z.string().optional().describe('Identified risks'),
  outOfScope: z.string().optional().describe('What is explicitly NOT included'),
  planStatus: z.enum(['pending', 'proposed', 'validated', 'in_progress', 'completed']).optional().describe('Plan status (default: pending)')
});

export const createCardSchema = z.object({
  projectId: z.string().describe('Project ID'),
  type: z.enum(['task', 'bug', 'epic', 'proposal', 'qa']).describe('Card type to create'),
  title: z.string().describe('Card title'),
  description: z.string().optional().describe('Card description (legacy - use descriptionStructured for tasks)'),
  descriptionStructured: z.array(descriptionStructuredItemSchema).optional().describe('Structured user story format: [{role: "Como...", goal: "Quiero...", benefit: "Para..."}]. REQUIRED for tasks.'),
  acceptanceCriteria: z.string().optional().describe('Acceptance criteria as plain text. REQUIRED for tasks (use this OR acceptanceCriteriaStructured).'),
  acceptanceCriteriaStructured: z.array(acceptanceCriteriaItemSchema).optional().describe('Acceptance criteria in Gherkin format: [{given: "...", when: "...", then: "..."}]. REQUIRED for tasks (use this OR acceptanceCriteria).'),
  epic: z.string().optional().describe('Epic ID (e.g., "PRJ-EPC-0001"). REQUIRED for tasks - must reference an existing epic in the project.'),
  implementationPlan: implementationPlanSchema.optional().describe('Pre-implementation plan. Recommended for tasks with devPoints >= 3 or complex tasks. Must include approach and at least 1 step.'),
  status: z.string().optional().describe('Card status (default: "To Do")'),
  priority: z.string().optional().describe('Card priority. For bugs/epics: "High", "Medium", "Low". For tasks: DO NOT SET - calculated automatically from devPoints/businessPoints using Planning Game formula.'),
  developer: z.string().optional().describe('Developer ID (must start with "dev_")'),
  codeveloper: z.string().optional().describe('Co-developer ID (must start with "dev_"). Auto-assigned from mcp.user.json when AI (BecarIA) is the developer.'),
  validator: z.string().optional().describe('Validator/Stakeholder ID (must start with "stk_"). If not provided for tasks, auto-assigned: 1) developer if also stakeholder, 2) Mánu Fosela, 3) error with available stakeholders.'),
  sprint: z.string().optional().describe('Sprint ID (e.g., "PRJ-SPR-0001"). Must reference an existing sprint in the project.'),
  devPoints: z.number().optional().describe('Development points (1-5 or fibonacci). Used to calculate task priority.'),
  businessPoints: z.number().optional().describe('Business points (1-5 or fibonacci). Used to calculate task priority.'),
  planId: z.string().optional().describe('Plan ID (Firebase key) to link this task to a development plan. Only for tasks.'),
  year: z.number().optional().describe('Year (default: current year)')
});

export const updateCardSchema = z.object({
  projectId: z.string().describe('Project ID'),
  type: z.enum(['task', 'bug', 'epic', 'proposal', 'sprint', 'qa']).describe('Card type'),
  firebaseId: z.string().describe('Firebase key of the card (the RTDB push ID)'),
  updates: z.record(z.unknown()).describe('Fields to update (e.g., { status: "In Progress", developer: "Name" })'),
  validateOnly: z.boolean().optional().describe('If true, only validate the update without applying it. Returns missing fields and validation errors.')
});

export const relateCardsSchema = z.object({
  projectId: z.string().describe('Project ID'),
  sourceCardId: z.string().describe('Source card ID (e.g., "PLN-TSK-0114")'),
  targetCardId: z.string().describe('Target card ID (e.g., "PLN-TSK-0115")'),
  relationType: z.enum(['related', 'blocks']).describe('Relation type: "related" (bidirectional link) or "blocks" (source blocks target)'),
  action: z.enum(['add', 'remove']).optional().describe('Action to perform (default: "add")')
});

// ──────────────────────────────────────────────
// Tool handlers
// ──────────────────────────────────────────────

export async function listCards({ projectId, type, status, sprint, developer, planId, year }) {
  const db = getDatabase();
  const sectionPath = buildSectionPath(projectId, type);
  const snapshot = await db.ref(sectionPath).once('value');
  const cardsData = snapshot.val();

  if (!cardsData) {
    return { content: [{ type: 'text', text: `No ${type} cards found in project "${projectId}".` }] };
  }

  let cards = Object.entries(cardsData).map(([firebaseId, card]) => ({
    firebaseId,
    ...card
  }));

  if (status) {
    cards = cards.filter(c => c.status === status);
  }
  if (sprint) {
    cards = cards.filter(c => c.sprint === sprint);
  }
  if (developer) {
    cards = cards.filter(c => c.developer === developer);
  }
  if (planId) {
    cards = cards.filter(c => c.planId === planId);
  }
  if (year) {
    cards = cards.filter(c => c.year === year);
  }

  const summary = cards.map(c => ({
    firebaseId: c.firebaseId,
    cardId: c.cardId,
    title: c.title,
    status: c.status,
    priority: c.priority,
    developer: c.developer || null,
    sprint: c.sprint || null,
    year: c.year || null
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(summary, null, 2)
    }]
  };
}

export async function getCard({ projectId, cardId }) {
  const db = getDatabase();

  const typePart = cardId.split('-')[1];
  const typeMap = { TSK: 'task', BUG: 'bug', EPC: 'epic', PRP: 'proposal', SPR: 'sprint', _QA: 'qa' };

  let foundCard = null;

  if (typePart && typeMap[typePart]) {
    const section = typeMap[typePart];
    const sectionPath = buildSectionPath(projectId, section);
    const snapshot = await db.ref(sectionPath).once('value');
    const cardsData = snapshot.val();

    if (cardsData) {
      for (const [firebaseId, card] of Object.entries(cardsData)) {
        if (card.cardId === cardId) {
          foundCard = { firebaseId, ...card };
          break;
        }
      }
    }
  }

  if (!foundCard) {
    for (const section of Object.keys(SECTION_MAP)) {
      const sectionPath = buildSectionPath(projectId, section);
      const snapshot = await db.ref(sectionPath).once('value');
      const cardsData = snapshot.val();

      if (cardsData) {
        for (const [firebaseId, card] of Object.entries(cardsData)) {
          if (card.cardId === cardId) {
            foundCard = { firebaseId, ...card };
            break;
          }
        }
      }
      if (foundCard) break;
    }
  }

  if (!foundCard) {
    return { content: [{ type: 'text', text: `Card "${cardId}" not found in project "${projectId}".` }] };
  }

  // Fetch development instructions for tasks
  let developmentInstructions = [];
  if (foundCard.cardType === 'Task' || typePart === 'TSK') {
    try {
      const instructionsSnapshot = await db.ref('global/instructions').once('value');
      const instructionsData = instructionsSnapshot.val();

      if (instructionsData) {
        developmentInstructions = Object.entries(instructionsData)
          .filter(([, instruction]) => {
            const isDevelopment = instruction.category === 'development';
            const isActive = instruction.status !== 'archived';
            return isDevelopment && isActive;
          })
          .map(([, instruction]) => ({
            name: instruction.name,
            content: instruction.content
          }));
      }
    } catch (error) {
      // Silently fail - don't block card retrieval if instructions fail
    }
  }

  // Calculate available transitions for tasks
  let availableTransitions = null;
  if (foundCard.cardType === 'Task' || typePart === 'TSK') {
    availableTransitions = calculateAvailableTransitions(foundCard);
  }

  const response = {
    card: foundCard,
    ...(developmentInstructions.length > 0 && { developmentInstructions }),
    ...(availableTransitions && { availableTransitions })
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2)
    }]
  };
}

async function resolveValidator(db, projectId, validator, developer) {
  if (validator) return validator;

  const stakeholdersSnapshot = await db.ref('/data/stakeholders').once('value');
  const stakeholdersData = stakeholdersSnapshot.val() || {};

  const projectStkSnapshot = await db.ref(`/projects/${projectId}/stakeholders`).once('value');
  const projectStkIds = projectStkSnapshot.val() || [];

  const projectStakeholders = [];
  for (const [stkId, stkData] of Object.entries(stakeholdersData)) {
    if (!stkId.startsWith('stk_') || typeof stkData !== 'object') continue;
    if (stkData.active === false) continue;
    if (Array.isArray(projectStkIds) && projectStkIds.includes(stkId)) {
      projectStakeholders.push({ id: stkId, name: stkData.name || '', email: stkData.email || '' });
    }
  }

  if (developer) {
    const devSnapshot = await db.ref(`/data/developers/${developer}`).once('value');
    const devData = devSnapshot.val();
    if (devData && devData.email) {
      const matchingStk = projectStakeholders.find(s => s.email === devData.email);
      if (matchingStk) return matchingStk.id;
    }
  }

  const manu = projectStakeholders.find(s => s.name === 'Mánu Fosela');
  if (manu) return manu.id;

  if (projectStakeholders.length > 0) {
    const stkList = projectStakeholders.map(s => `  - ${s.id}: "${s.name}" (${s.email})`).join('\n');
    throw new Error(
      'Could not auto-assign a validator for this task. ' +
      'Please provide a validator ID (stk_XXX).\n\n' +
      `Available stakeholders in "${projectId}":\n${stkList}`
    );
  }

  throw new Error(
    `No stakeholders found in project "${projectId}". ` +
    'Add stakeholders to the project before creating tasks, or provide a validator ID explicitly.'
  );
}

export async function createCard({ projectId, type, title, description, descriptionStructured, acceptanceCriteria, acceptanceCriteriaStructured, epic, implementationPlan, status, priority, developer, codeveloper, validator, sprint, devPoints, businessPoints, planId, year }) {
  const db = getDatabase();
  const firestore = getFirestore();

  // Auto-assign BecarIA as developer and current user as codeveloper for AI-driven tasks
  const mcpUser = getMcpUser();
  if (mcpUser && developer === 'dev_016') {
    if (!codeveloper && mcpUser.developerId && mcpUser.developerId !== 'dev_016') {
      codeveloper = mcpUser.developerId;
    }
  }

  validateEntityIds({ developer, codeveloper, validator });

  // Validate implementationPlan if provided (only for tasks)
  if (type === 'task' && implementationPlan) {
    const planValidation = validateImplementationPlan(implementationPlan);
    if (!planValidation.valid) {
      const errorMessages = planValidation.errors.map(e => e.message).join('; ');
      throw new Error(`Invalid implementationPlan: ${errorMessages}`);
    }
  }

  // Epics do NOT have status or priority — strip if passed
  if (type === 'epic') {
    status = undefined;
    priority = undefined;
  }

  // Resolve values dynamically from Firebase RTDB (case-insensitive)
  if (type === 'bug') {
    if (status) status = await resolveValue('bugStatus', status);
    if (priority) priority = await resolveValue('bugPriority', priority);
  } else if (type === 'task') {
    if (status) status = await resolveValue('taskStatus', status);
  }

  const initialData = { status, priority };

  if (type === 'bug') {
    validateBugFields(initialData, false);
  } else if (type === 'task') {
    validateTaskFields(initialData, false);

    // Tasks MUST use descriptionStructured format
    if (!descriptionStructured || descriptionStructured.length === 0) {
      throw new Error(
        'Tasks require descriptionStructured in user story format. ' +
        'Use: descriptionStructured: [{role: "usuario/desarrollador/...", goal: "lo que quiere", benefit: "para qué lo quiere"}]. ' +
        'Example: {role: "desarrollador", goal: "crear una función de login", benefit: "permitir autenticación de usuarios"}'
      );
    }

    for (let i = 0; i < descriptionStructured.length; i++) {
      const item = descriptionStructured[i];
      if (!item.role || !item.goal || !item.benefit) {
        throw new Error(
          `descriptionStructured[${i}] is incomplete. Each item must have: role, goal, benefit. ` +
          `Got: role="${item.role || ''}", goal="${item.goal || ''}", benefit="${item.benefit || ''}"`
        );
      }
    }

    // Tasks MUST have acceptance criteria
    const hasAcceptanceCriteria =
      (acceptanceCriteria && typeof acceptanceCriteria === 'string' && acceptanceCriteria.trim() !== '') ||
      (Array.isArray(acceptanceCriteriaStructured) && acceptanceCriteriaStructured.length > 0);

    if (!hasAcceptanceCriteria) {
      throw new Error(
        'Tasks require acceptance criteria. ' +
        'Use acceptanceCriteria (plain text) OR acceptanceCriteriaStructured (Gherkin format): ' +
        '[{given: "context", when: "action", then: "expected result"}]. ' +
        'Example: {given: "el usuario está logueado", when: "hace clic en logout", then: "se cierra la sesión"}'
      );
    }

    if (Array.isArray(acceptanceCriteriaStructured)) {
      for (let i = 0; i < acceptanceCriteriaStructured.length; i++) {
        const scenario = acceptanceCriteriaStructured[i];
        const hasGherkin = scenario.given || scenario.when || scenario.then;
        const hasRaw = scenario.raw && scenario.raw.trim() !== '';

        if (!hasGherkin && !hasRaw) {
          throw new Error(
            `acceptanceCriteriaStructured[${i}] is empty. Each scenario must have either: ` +
            `given/when/then fields OR a raw text field.`
          );
        }
      }
    }

    // Fetch available epics for validation
    const epicSectionPath = buildSectionPath(projectId, 'epic');
    const epicSnapshot = await db.ref(epicSectionPath).once('value');
    const epicsData = epicSnapshot.val();

    const availableEpics = [];
    if (epicsData) {
      for (const [, epicCard] of Object.entries(epicsData)) {
        availableEpics.push({
          cardId: epicCard.cardId,
          title: epicCard.title,
          status: epicCard.status || 'N/A'
        });
      }
    }

    if (!epic || (typeof epic === 'string' && epic.trim() === '')) {
      const epicList = availableEpics.length > 0
        ? availableEpics.map(e => `  - ${e.cardId}: "${e.title}" (${e.status})`).join('\n')
        : '  (no epics found in this project)';

      throw new Error(
        'Tasks require an epic. ' +
        'Choose one of the available epics or create a new one with create_card(type="epic") first.\n\n' +
        `Available epics in "${projectId}":\n${epicList}`
      );
    }

    let epicExists = availableEpics.some(e => e.cardId === epic);

    if (!epicExists) {
      const epicList = availableEpics.length > 0
        ? availableEpics.map(e => `  - ${e.cardId}: "${e.title}" (${e.status})`).join('\n')
        : '  (no epics found in this project)';

      throw new Error(
        `Epic "${epic}" not found in project "${projectId}". ` +
        'Choose one of the available epics or create a new one with create_card(type="epic") first.\n\n' +
        `Available epics:\n${epicList}`
      );
    }

    // Tasks CANNOT have priority set directly
    if (priority !== undefined) {
      throw new Error(
        'Cannot set priority directly for tasks. ' +
        'Priority is calculated automatically from devPoints and businessPoints ' +
        'using Planning Game formula: (businessPoints/devPoints)*100. ' +
        'Set devPoints and businessPoints instead.'
      );
    }

    // AC1: Tasks cannot have sprint assigned at creation time
    if (sprint) {
      throw new Error(
        'Cannot assign sprint when creating a task. ' +
        'Sprint is assigned when moving the task to "In Progress". ' +
        'Create the task first, then update it with a sprint when starting work.'
      );
    }

    // Auto-resolve validator for tasks
    validator = await resolveValidator(db, projectId, validator, developer);
  }

  // Get project abbreviation
  const abbrSnapshot = await db.ref(`/projects/${projectId}/abbreviation`).once('value');
  const projectAbbr = abbrSnapshot.val();
  if (!projectAbbr) {
    throw new Error(`Project "${projectId}" has no abbreviation configured.`);
  }

  // Generate card ID using Firestore counter
  const sectionKey = SECTION_MAP[type];
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

  // Build card data with type-specific defaults
  const sectionPath = buildSectionPath(projectId, type);
  const newCardRef = db.ref(sectionPath).push();

  const dataWithDefaults = applyTypeDefaults(type, {
    status,
    priority
  });

  // Generate description from descriptionStructured if available
  let finalDescription = description || '';
  if (descriptionStructured && descriptionStructured.length > 0) {
    finalDescription = descriptionStructured.map(item =>
      `**Como** ${item.role}\n**Quiero** ${item.goal}\n**Para** ${item.benefit}`
    ).join('\n\n');

    if (description) {
      finalDescription += '\n\n' + description;
    }
  }

  const cardData = {
    cardId,
    cardType: CARD_TYPE_MAP[type],
    group: GROUP_MAP[type],
    projectId,
    title,
    description: finalDescription,
    status: dataWithDefaults.status,
    priority: dataWithDefaults.priority,
    year: year || new Date().getFullYear(),
    createdAt: new Date().toISOString(),
    createdBy: 'geniova-mcp',
    firebaseId: newCardRef.key
  };

  if (descriptionStructured && descriptionStructured.length > 0) {
    cardData.descriptionStructured = descriptionStructured;
  }

  if (acceptanceCriteria && typeof acceptanceCriteria === 'string' && acceptanceCriteria.trim() !== '') {
    cardData.acceptanceCriteria = acceptanceCriteria;
  }
  if (Array.isArray(acceptanceCriteriaStructured) && acceptanceCriteriaStructured.length > 0) {
    cardData.acceptanceCriteriaStructured = acceptanceCriteriaStructured;
  }

  if (epic) {
    cardData.epic = epic;
  }

  if (type === 'task' && implementationPlan) {
    cardData.implementationPlan = {
      ...implementationPlan,
      steps: implementationPlan.steps || [],
      planStatus: implementationPlan.planStatus || 'pending'
    };
  }

  if (type === 'bug' && dataWithDefaults.registerDate) {
    cardData.registerDate = dataWithDefaults.registerDate;
  }

  if (developer) cardData.developer = developer;
  if (codeveloper) cardData.codeveloper = codeveloper;
  if (validator) cardData.validator = validator;
  if (sprint) cardData.sprint = sprint;
  if (type === 'task' && planId) cardData.planId = planId;

  if (devPoints !== undefined) cardData.devPoints = devPoints;
  if (businessPoints !== undefined) cardData.businessPoints = businessPoints;

  // For tasks: calculate priority automatically if both points are provided
  if (type === 'task' && devPoints && businessPoints) {
    const scoringSnapshot = await db.ref(`/projects/${projectId}/scoringSystem`).once('value');
    const scoringSystem = scoringSnapshot.val() || '1-5';
    const calculatedPriority = calculatePriority(businessPoints, devPoints, scoringSystem);
    if (calculatedPriority !== null) {
      cardData.priority = calculatedPriority;
    }
  }

  await newCardRef.set(cardData);

  const response = {
    message: `Card created successfully`,
    cardId,
    firebaseId: newCardRef.key,
    projectId,
    type
  };

  // For tasks: track plan-first workflow and include instructions for the AI
  if (type === 'task') {
    // Track tasks created without a planId for plan-first enforcement
    if (!planId) {
      const currentCount = _sessionTasksWithoutPlan.get(projectId) || 0;
      _sessionTasksWithoutPlan.set(projectId, currentCount + 1);
    }

    const tasksWithoutPlanCount = _sessionTasksWithoutPlan.get(projectId) || 0;

    if (implementationPlan) {
      response.planAction = {
        action: 'SHOW_PLAN_FOR_VALIDATION',
        message: 'Present the implementation plan to the user for review. If the user approves, update the card setting implementationPlan.planStatus to "validated". Do NOT start implementation until the plan is validated.',
        plan: cardData.implementationPlan
      };
    } else {
      response.planAction = {
        action: 'CREATE_PLAN',
        message: 'This task was created without an implementation plan. Create a plan (with approach and steps) and present it to the user for validation before starting implementation. Use update_card to add the implementationPlan with planStatus "proposed", then show it to the user for approval.'
      };
    }

    // Plan-first warning: when creating 2+ tasks without a plan in the same session
    if (!planId && tasksWithoutPlanCount >= PLAN_FIRST_THRESHOLD) {
      response.planFirstWarning = {
        level: 'warning',
        tasksWithoutPlan: tasksWithoutPlanCount,
        message: `You have created ${tasksWithoutPlanCount} tasks without a development plan in project "${projectId}" during this session. ` +
          'When creating multiple related tasks, you SHOULD first create a plan (create_plan) to group them, then reference the planId when creating tasks. ' +
          'This ensures traceability and documentation of multi-task developments. ' +
          'Consider creating a plan now and linking these tasks to it via update_card.',
        recommendation: 'CREATE_PLAN_FIRST'
      };
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2)
    }]
  };
}

export async function updateCard({ projectId, type, firebaseId, updates, validateOnly = false }) {
  const db = getDatabase();
  const sectionPath = buildSectionPath(projectId, type);
  const cardRef = db.ref(`${sectionPath}/${firebaseId}`);

  const snapshot = await cardRef.once('value');
  if (!snapshot.exists()) {
    throw new Error(`Card with firebaseId "${firebaseId}" not found in ${type} section of project "${projectId}".`);
  }

  const currentCard = snapshot.val();

  const protectedFields = ['cardId', 'firebaseId', 'cardType', 'group', 'projectId'];
  const protectedFieldsInUpdate = protectedFields.filter(field => field in updates);

  // validateOnly mode
  if (validateOnly) {
    const validationResult = {
      valid: true,
      cardId: currentCard.cardId,
      currentStatus: currentCard.status,
      targetStatus: updates.status || currentCard.status,
      protectedFieldsViolation: protectedFieldsInUpdate,
      typeValidation: null,
      statusTransitionValidation: null,
      missingFields: [],
      currentCard: {
        cardId: currentCard.cardId,
        title: currentCard.title,
        status: currentCard.status,
        developer: currentCard.developer || null,
        validator: currentCard.validator || null,
        startDate: currentCard.startDate || null,
        endDate: currentCard.endDate || null
      }
    };

    if (protectedFieldsInUpdate.length > 0) {
      validationResult.valid = false;
      validationResult.errors = validationResult.errors || [];
      validationResult.errors.push({
        code: 'PROTECTED_FIELD',
        message: `Cannot update protected fields: ${protectedFieldsInUpdate.join(', ')}`
      });
    }

    if (type === 'bug') {
      validationResult.typeValidation = collectBugValidationIssues(updates);
      if (!validationResult.typeValidation.valid) {
        validationResult.valid = false;
      }
    } else if (type === 'task') {
      validationResult.typeValidation = collectTaskValidationIssues(updates);
      if (!validationResult.typeValidation.valid) {
        validationResult.valid = false;
      }

      validationResult.statusTransitionValidation = collectValidationIssues(currentCard, updates, type);
      if (!validationResult.statusTransitionValidation.valid) {
        validationResult.valid = false;
        validationResult.missingFields = validationResult.statusTransitionValidation.missingFields;
      }
    }

    if (updates.commits !== undefined && (type === 'task' || type === 'bug')) {
      validationResult.commitsValidation = validateCommitsField(updates.commits);
      if (!validationResult.commitsValidation.valid) {
        validationResult.valid = false;
      }
    }

    const entityIdIssues = collectEntityIdIssues(updates);
    if (entityIdIssues.length > 0) {
      validationResult.valid = false;
      validationResult.entityIdValidation = {
        valid: false,
        errors: entityIdIssues
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          validateOnly: true,
          ...validationResult
        }, null, 2)
      }]
    };
  }

  // Normal update mode
  for (const field of protectedFieldsInUpdate) {
    throw new Error(`Cannot update protected field: "${field}"`);
  }

  // Auto-assign codeveloper when AI (BecarIA) is set as developer via update
  if (updates.developer === 'dev_016') {
    const mcpUser = getMcpUser();
    if (mcpUser && !updates.codeveloper && mcpUser.developerId && mcpUser.developerId !== 'dev_016') {
      updates.codeveloper = mcpUser.developerId;
    }
  }

  validateEntityIds(updates);

  // Epics do NOT have status or priority — strip if passed
  if (type === 'epic') {
    delete updates.status;
    delete updates.priority;
  }

  // Resolve values dynamically from Firebase RTDB (case-insensitive)
  if (type === 'bug') {
    if (updates.status) updates.status = await resolveValue('bugStatus', updates.status);
    if (updates.priority) updates.priority = await resolveValue('bugPriority', updates.priority);
  } else if (type === 'task') {
    if (updates.status) updates.status = await resolveValue('taskStatus', updates.status);
  }

  if (type === 'bug') {
    validateBugFields(updates, true);
    validateBugStatusTransition(currentCard, updates);
  } else if (type === 'task') {
    validateTaskFields(updates, true);
    validateStatusTransition(currentCard, updates, type);

    // Tasks CANNOT have priority set directly
    if (updates.priority !== undefined) {
      throw new Error(
        'Cannot set priority directly for tasks. ' +
        'Priority is calculated automatically from devPoints and businessPoints ' +
        'using Planning Game formula: (businessPoints/devPoints)*100. ' +
        'Set devPoints and businessPoints instead.'
      );
    }

    if (updates.sprint !== undefined) {
      await validateSprintExists(projectId, updates.sprint);
    }
  }

  // Validate and process commits field
  if (updates.commits !== undefined && (type === 'task' || type === 'bug')) {
    const commitsValidation = validateCommitsField(updates.commits);
    if (!commitsValidation.valid) {
      const errorMessages = commitsValidation.errors.map(e => e.message).join('; ');
      throw new Error(`Invalid commits field: ${errorMessages}`);
    }

    updates.commits = appendCommitsToCard(currentCard, updates.commits);
  }

  // Validate and process implementationPlan
  if (type === 'task' && updates.implementationPlan !== undefined) {
    const migratedPlan = migrateImplementationPlan(updates.implementationPlan);
    if (migratedPlan) {
      const planValidation = validateImplementationPlan(migratedPlan);
      if (!planValidation.valid) {
        const errorMessages = planValidation.errors.map(e => e.message).join('; ');
        throw new Error(`Invalid implementationPlan: ${errorMessages}`);
      }
      updates.implementationPlan = migratedPlan;
    }
  }

  // Handle planStatus transitions based on task status changes
  let warnings = [];
  if (type === 'task' && updates.status) {
    const newStatus = updates.status;
    const currentPlan = updates.implementationPlan || migrateImplementationPlan(currentCard.implementationPlan);
    const devPoints = updates.devPoints || currentCard.devPoints || 0;

    if (newStatus === 'In Progress') {
      if (devPoints >= 3 && !currentPlan) {
        warnings.push({
          code: 'MISSING_IMPLEMENTATION_PLAN',
          message: `Task has ${devPoints} devPoints but no implementationPlan. Consider adding a plan with approach and steps before implementing.`
        });
      }

      if (currentPlan && currentPlan.planStatus === 'proposed') {
        warnings.push({
          code: 'PLAN_NOT_VALIDATED',
          message: 'The implementation plan has not been validated by the user. Present the plan to the user for approval and update planStatus to "validated" before starting implementation.'
        });
      }

      if (currentPlan && currentPlan.planStatus === 'validated') {
        if (!updates.implementationPlan) {
          updates.implementationPlan = { ...currentPlan };
        }
        updates.implementationPlan.planStatus = 'in_progress';
      }
    }

    if (newStatus === 'To Validate') {
      if (currentPlan && currentPlan.planStatus !== 'completed') {
        if (!updates.implementationPlan) {
          updates.implementationPlan = { ...currentPlan };
        }
        updates.implementationPlan.planStatus = 'completed';
      }

      warnings.push({
        code: 'VERSION_REMINDER',
        message: `Task "${currentCard.title}" is ready for validation. If this change affects the app version, consider updating it (npm version patch/minor/major).`
      });
    }
  }

  // Reminder for bugs moving to "Fixed"
  if (type === 'bug' && updates.status === 'Fixed') {
    warnings.push({
      code: 'VERSION_REMINDER',
      message: `Bug "${currentCard.title}" has been fixed. If this fix should be released, consider updating the app version (npm version patch).`
    });
  }

  // Auto-assign active sprint when moving task out of "To Do"
  if (type === 'task' && updates.status) {
    const currentStatus = (currentCard.status || '').toLowerCase().replace(/\s+/g, '');
    const newStatus = updates.status;

    if (currentStatus === 'todo' && newStatus !== 'To Do') {
      const hasSprint = updates.sprint || currentCard.sprint;

      if (!hasSprint) {
        const activeSprint = await getActiveSprint(projectId);
        if (activeSprint) {
          updates.sprint = activeSprint.cardId;
        }
      }
    }
  }

  // Auto-set startDate when moving task to "In Progress"
  // startDate is IMMUTABLE: set once on first "In Progress", never changed
  if (type === 'task' && updates.status === 'In Progress') {
    const hasStartDate = updates.startDate || currentCard.startDate;
    if (!hasStartDate) {
      const today = new Date().toISOString().split('T')[0];
      updates.startDate = today;
    }

    // AC3: Validate sprint date range when moving to In Progress
    const sprintCardId = updates.sprint || currentCard.sprint;
    if (sprintCardId) {
      const sprintSectionPath = buildSectionPath(projectId, 'sprint');
      const sprintSnapshot = await db.ref(sprintSectionPath).once('value');
      const sprintsData = sprintSnapshot.val();

      if (sprintsData) {
        const sprintEntry = Object.entries(sprintsData).find(([, s]) => s.cardId === sprintCardId);
        if (sprintEntry) {
          const [sprintFbId, sprint] = sprintEntry;
          if (sprint.startDate && sprint.endDate) {
            const today = new Date().toISOString().split('T')[0];
            if (today < sprint.startDate || today > sprint.endDate) {
              throw new Error(
                `Cannot move task to "In Progress": today (${today}) is outside sprint "${sprintCardId}" date range ` +
                `(${sprint.startDate} to ${sprint.endDate}). Update the sprint dates first using update_sprint.`
              );
            }
          }

          // AC5: Auto-lock sprint when task moves to In Progress
          const sprintRef = db.ref(`${sprintSectionPath}/${sprintFbId}`);
          await sprintRef.update({ locked: true });
        }
      }
    }
  }

  // Auto-set endDate when moving task to "To Validate"
  // endDate is always updated on each transition to "To Validate" (reset on reopen)
  if (type === 'task' && updates.status === 'To Validate') {
    updates.endDate = new Date().toISOString().split('T')[0];
  }

  // Work Cycles tracking for tasks
  // Opens a new cycle when entering "In Progress", closes it when leaving
  if (type === 'task' && updates.status) {
    const prevStatus = currentCard.status;
    const newStatus = updates.status;
    const now = new Date().toISOString();

    // Open a new work cycle when moving TO "In Progress"
    if (newStatus === 'In Progress' && prevStatus !== 'In Progress') {
      const existingCycles = Array.isArray(currentCard.workCycles) ? [...currentCard.workCycles] : [];
      const cycleNumber = existingCycles.length + 1;
      existingCycles.push({
        cycleNumber,
        startDate: now,
        endDate: null,
        durationMs: 0
      });
      updates.workCycles = existingCycles;
      updates.totalWorkDurationMs = currentCard.totalWorkDurationMs || 0;
    }

    // Close the open work cycle when leaving "In Progress"
    if (prevStatus === 'In Progress' && newStatus !== 'In Progress') {
      const existingCycles = Array.isArray(currentCard.workCycles) ? [...currentCard.workCycles] : [];
      if (existingCycles.length > 0) {
        const lastCycle = existingCycles[existingCycles.length - 1];
        if (lastCycle.endDate === null) {
          lastCycle.endDate = now;
          lastCycle.durationMs = new Date(now).getTime() - new Date(lastCycle.startDate).getTime();
        }
        const totalMs = existingCycles.reduce((sum, c) => sum + (c.durationMs || 0), 0);
        updates.workCycles = existingCycles;
        updates.totalWorkDurationMs = totalMs;
      }
    }
  }

  // Auto-calculate priority for tasks when devPoints or businessPoints are updated
  if (type === 'task') {
    const finalDevPoints = updates.devPoints !== undefined ? updates.devPoints : currentCard.devPoints;
    const finalBizPoints = updates.businessPoints !== undefined ? updates.businessPoints : currentCard.businessPoints;

    if (finalDevPoints && finalBizPoints) {
      const scoringSnapshot = await db.ref(`/projects/${projectId}/scoringSystem`).once('value');
      const scoringSystem = scoringSnapshot.val() || '1-5';
      const calculatedPriority = calculatePriority(finalBizPoints, finalDevPoints, scoringSystem);
      if (calculatedPriority !== null) {
        updates.priority = calculatedPriority;
      }
    }
  }

  updates.updatedAt = new Date().toISOString();
  updates.updatedBy = 'geniova-mcp';

  await cardRef.update(updates);

  // Return only essential fields + what was updated (not the full card)
  // This drastically reduces token consumption for bulk operations
  const updatedSnapshot = await cardRef.once('value');
  const fullCard = updatedSnapshot.val();

  const response = {
    message: 'Card updated successfully',
    card: {
      cardId: fullCard.cardId,
      cardType: fullCard.cardType,
      title: fullCard.title,
      status: fullCard.status,
      developer: fullCard.developer || null,
      codeveloper: fullCard.codeveloper || fullCard.coDeveloper || null,
      validator: fullCard.validator || null,
      sprint: fullCard.sprint || null,
      startDate: fullCard.startDate || null,
      endDate: fullCard.endDate || null,
      firebaseId: firebaseId,
      projectId: fullCard.projectId,
      priority: fullCard.priority || null,
      devPoints: fullCard.devPoints || null,
      businessPoints: fullCard.businessPoints || null,
      epic: fullCard.epic || null,
      updatedAt: fullCard.updatedAt,
      ...(fullCard.workCycles && { workCycles: fullCard.workCycles }),
      ...(fullCard.totalWorkDurationMs != null && { totalWorkDurationMs: fullCard.totalWorkDurationMs })
    }
  };

  if (warnings && warnings.length > 0) {
    response.warnings = warnings;
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2)
    }]
  };
}

// ──────────────────────────────────────────────
// Card relations
// ──────────────────────────────────────────────

async function findCardByCardId(db, projectId, cardId) {
  const typePart = cardId.split('-')[1];
  const typeMap = { TSK: 'task', BUG: 'bug', EPC: 'epic', PRP: 'proposal', SPR: 'sprint', _QA: 'qa' };

  if (typePart && typeMap[typePart]) {
    const section = typeMap[typePart];
    const sectionPath = buildSectionPath(projectId, section);
    const snapshot = await db.ref(sectionPath).once('value');
    const cardsData = snapshot.val();

    if (cardsData) {
      for (const [firebaseId, card] of Object.entries(cardsData)) {
        if (card.cardId === cardId) {
          return { firebaseId, card, sectionPath, section };
        }
      }
    }
  }

  for (const section of Object.keys(SECTION_MAP)) {
    const sectionPath = buildSectionPath(projectId, section);
    const snapshot = await db.ref(sectionPath).once('value');
    const cardsData = snapshot.val();

    if (cardsData) {
      for (const [firebaseId, card] of Object.entries(cardsData)) {
        if (card.cardId === cardId) {
          return { firebaseId, card, sectionPath, section };
        }
      }
    }
  }

  return null;
}

function updateRelatedTasks(currentRelations, targetCardId, targetProjectId, targetTitle, relationType, action) {
  const relations = Array.isArray(currentRelations) ? [...currentRelations] : [];

  if (action === 'remove') {
    return relations.filter(r => !(r.id === targetCardId && r.type === relationType));
  }

  const existingIndex = relations.findIndex(r => r.id === targetCardId && r.type === relationType);
  if (existingIndex >= 0) {
    relations[existingIndex].title = targetTitle;
    return relations;
  }

  relations.push({
    id: targetCardId,
    projectId: targetProjectId,
    title: targetTitle,
    type: relationType
  });

  return relations;
}

export async function relateCards({ projectId, sourceCardId, targetCardId, relationType, action = 'add' }) {
  const db = getDatabase();

  if (sourceCardId === targetCardId) {
    throw new Error('Cannot relate a card to itself.');
  }

  const sourceResult = await findCardByCardId(db, projectId, sourceCardId);
  if (!sourceResult) {
    throw new Error(`Source card "${sourceCardId}" not found in project "${projectId}".`);
  }

  const targetResult = await findCardByCardId(db, projectId, targetCardId);
  if (!targetResult) {
    throw new Error(`Target card "${targetCardId}" not found in project "${projectId}".`);
  }

  const { firebaseId: sourceFirebaseId, card: sourceCard, sectionPath: sourceSectionPath } = sourceResult;
  const { firebaseId: targetFirebaseId, card: targetCard, sectionPath: targetSectionPath } = targetResult;

  let sourceRelationType, targetRelationType;

  if (relationType === 'related') {
    sourceRelationType = 'related';
    targetRelationType = 'related';
  } else if (relationType === 'blocks') {
    sourceRelationType = 'blocks';
    targetRelationType = 'blockedBy';
  }

  const sourceUpdatedRelations = updateRelatedTasks(
    sourceCard.relatedTasks,
    targetCardId,
    projectId,
    targetCard.title,
    sourceRelationType,
    action
  );

  const targetUpdatedRelations = updateRelatedTasks(
    targetCard.relatedTasks,
    sourceCardId,
    projectId,
    sourceCard.title,
    targetRelationType,
    action
  );

  const now = new Date().toISOString();
  const sourceUpdates = {
    relatedTasks: sourceUpdatedRelations,
    updatedAt: now,
    updatedBy: 'geniova-mcp'
  };
  const targetUpdates = {
    relatedTasks: targetUpdatedRelations,
    updatedAt: now,
    updatedBy: 'geniova-mcp'
  };

  await db.ref(`${sourceSectionPath}/${sourceFirebaseId}`).update(sourceUpdates);
  await db.ref(`${targetSectionPath}/${targetFirebaseId}`).update(targetUpdates);

  const actionVerb = action === 'add' ? 'created' : 'removed';
  const relationDescription = relationType === 'blocks'
    ? `${sourceCardId} blocks ${targetCardId}`
    : `${sourceCardId} ↔ ${targetCardId} (related)`;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Relation ${actionVerb} successfully`,
        relation: relationDescription,
        sourceCard: {
          cardId: sourceCardId,
          relatedTasks: sourceUpdatedRelations
        },
        targetCard: {
          cardId: targetCardId,
          relatedTasks: targetUpdatedRelations
        }
      }, null, 2)
    }]
  };
}

// ──────────────────────────────────────────────
// Pending blockers check
// ──────────────────────────────────────────────

export async function checkPendingBlockers(db, projectId, card) {
  const relatedTasks = card.relatedTasks || [];
  const blockedByRelations = relatedTasks.filter(r => r.type === 'blockedBy');

  if (blockedByRelations.length === 0) {
    return { hasPendingBlockers: false, pendingBlockers: [] };
  }

  const pendingBlockers = [];

  for (const blocker of blockedByRelations) {
    const blockerResult = await findCardByCardId(db, blocker.projectId || projectId, blocker.id);

    if (blockerResult) {
      const blockerStatus = blockerResult.card.status || '';
      const isComplete = blockerStatus === 'Done&Validated' || blockerStatus === 'Closed';

      if (!isComplete) {
        pendingBlockers.push({
          cardId: blocker.id,
          title: blocker.title || blockerResult.card.title,
          status: blockerStatus
        });
      }
    }
  }

  return {
    hasPendingBlockers: pendingBlockers.length > 0,
    pendingBlockers
  };
}

// ──────────────────────────────────────────────
// Transition rules
// ──────────────────────────────────────────────

export async function getTransitionRules({ type = 'task' }) {
  if (type === 'task') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          type: 'task',
          validStatuses: VALID_TASK_STATUSES,
          mcpRestrictedStatuses: MCP_RESTRICTED_STATUSES,
          mcpRestrictedNote: 'MCP cannot set tasks to "Done&Validated". Only validators can approve tasks.',
          transitionRules: TASK_TRANSITION_RULES,
          requiredFieldsToLeaveToDo: REQUIRED_FIELDS_TO_LEAVE_TODO,
          requiredFieldsForToValidate: [...REQUIRED_FIELDS_TO_LEAVE_TODO, ...REQUIRED_FIELDS_FOR_TO_VALIDATE, 'pipelineStatus.prCreated'],
          fieldDescriptions: {
            title: 'Task title',
            developer: 'Developer ID (must start with dev_)',
            validator: 'Validator/Stakeholder ID (must start with stk_)',
            epic: 'Epic ID the task belongs to',
            sprint: 'Sprint ID or name',
            devPoints: 'Development points (numeric)',
            businessPoints: 'Business points (numeric)',
            acceptanceCriteria: 'Acceptance criteria (text or acceptanceCriteriaStructured array)',
            startDate: 'Date work started (YYYY-MM-DD format)',
            commits: 'Array of commits [{hash, message, date, author}]',
            pipelineStatus: 'Pipeline tracking object with prCreated: {prUrl, prNumber, date}'
          },
          exampleValidUpdate: {
            status: 'To Validate',
            startDate: '2024-01-15',
            commits: [{ hash: 'abc1234', message: 'feat: implement feature', date: '2024-01-20T10:00:00Z', author: 'dev@example.com' }],
            pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42, date: '2024-01-20T10:30:00Z' } }
          }
        }, null, 2)
      }]
    };
  } else if (type === 'bug') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          type: 'bug',
          validStatuses: VALID_BUG_STATUSES,
          validPriorities: VALID_BUG_PRIORITIES,
          note: 'Bugs follow a simpler workflow: Created → Assigned → Fixed → Verified → Closed',
          requiredFieldsForFixed: ['commits', 'pipelineStatus.prCreated'],
          requiredFieldsForClosed: ['commits', 'rootCause', 'resolution'],
          fieldDescriptions: {
            commits: 'Array of commits [{hash, message, date, author}]',
            pipelineStatus: 'Pipeline tracking object with prCreated: {prUrl, prNumber, date}',
            rootCause: 'Why the bug occurred',
            resolution: 'How the bug was fixed'
          },
          exampleFixedUpdate: {
            status: 'Fixed',
            commits: [{ hash: 'abc1234', message: 'fix: resolve issue', date: '2024-01-20T10:00:00Z', author: 'dev@example.com' }],
            pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42, date: '2024-01-20T10:30:00Z' } }
          }
        }, null, 2)
      }]
    };
  }

  throw new Error(`Unknown card type: ${type}`);
}

export function calculateAvailableTransitions(card) {
  const currentStatus = card.status || 'To Do';
  const transitions = {};

  const rules = TASK_TRANSITION_RULES[currentStatus];
  if (!rules) {
    return { currentStatus, note: 'Unknown status', transitions: {} };
  }

  const allPossibleStatuses = ['To Do', 'In Progress', 'To Validate', 'Blocked', 'Reopened', 'Done&Validated'];

  for (const targetStatus of allPossibleStatuses) {
    if (targetStatus === currentStatus) continue;

    const transition = {
      allowed: false,
      missing: [],
      reason: null
    };

    if (MCP_RESTRICTED_STATUSES.includes(targetStatus)) {
      transition.reason = 'Only validators can set this status';
      transitions[targetStatus] = transition;
      continue;
    }

    if (!rules.allowedTransitions?.includes(targetStatus)) {
      transition.reason = `Cannot transition from "${currentStatus}" to "${targetStatus}"`;
      transitions[targetStatus] = transition;
      continue;
    }

    let requiredFields = [];

    if (targetStatus === 'In Progress' || targetStatus === 'To Validate' || targetStatus === 'Blocked') {
      if (currentStatus === 'To Do') {
        requiredFields = [...REQUIRED_FIELDS_TO_LEAVE_TODO];
      }
    }

    if (targetStatus === 'To Validate') {
      requiredFields = [...REQUIRED_FIELDS_TO_LEAVE_TODO, ...REQUIRED_FIELDS_FOR_TO_VALIDATE];
      // Check pipelineStatus.prCreated separately (nested field)
      const ps = card.pipelineStatus;
      if (!ps?.prCreated || !ps.prCreated.prUrl || !ps.prCreated.prNumber) {
        transition.missing.push('pipelineStatus.prCreated');
      }
    }

    if (targetStatus === 'Blocked') {
      const hasBlocker = card.blockedByBusiness || card.blockedByDevelopment;
      if (!hasBlocker) {
        transition.missing.push('blockedByBusiness OR blockedByDevelopment');
      }
      if (card.blockedByBusiness) {
        if (!card.bbbWhy) transition.missing.push('bbbWhy');
        if (!card.bbbWho) transition.missing.push('bbbWho');
      }
      if (card.blockedByDevelopment) {
        if (!card.bbdWhy) transition.missing.push('bbdWhy');
        if (!card.bbdWho) transition.missing.push('bbdWho');
      }
    }

    for (const field of requiredFields) {
      if (!hasValidValue(card, field)) {
        transition.missing.push(field);
      }
    }

    transition.allowed = transition.missing.length === 0;
    transitions[targetStatus] = transition;
  }

  return {
    currentStatus,
    transitions
  };
}

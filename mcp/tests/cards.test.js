import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resetMockData,
  setMockRtdbData,
  setMockFirestoreData,
  getMockRtdbData
} from './__mocks__/firebase.js';

// Mock the firebase module before importing cards and list-service
vi.mock('../firebase-adapter.js', async () => {
  const mock = await import('./__mocks__/firebase.js');
  return {
    getDatabase: mock.getDatabase,
    getFirestore: mock.getFirestore
  };
});

// Import after mocking
const {
  validateEntityId,
  validateEntityIds,
  validateBugFields,
  validateTaskFields,
  hasValidValue,
  getActiveSprint,
  listCards,
  createCard,
  updateCard,
  validateSprintExists,
  generatePriorityMap,
  calculatePriority,
  PRIORITY_MAP_1_5,
  PRIORITY_MAP_FIBONACCI,
  VALID_BUG_STATUSES,
  VALID_TASK_STATUSES,
  VALID_BUG_PRIORITIES,
  VALID_TASK_PRIORITIES,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  REQUIRED_FIELDS_TO_CLOSE_BUG,
  VALIDATOR_ONLY_STATUSES,
  validateBugStatusTransition,
  getSessionTasksWithoutPlan,
  resetSessionTaskCounter,
  getTransitionRules
} = await import('../tools/cards.js');

const { invalidateCache } = await import('../services/list-service.js');

/**
 * Setup mock Firebase list data for ListService
 */
function setupMockLists() {
  setMockRtdbData('/data/bugpriorityList', {
    'Application Blocker': 1,
    'Department Blocker': 2,
    'Individual Blocker': 3,
    'User Experience Issue': 4,
    'Workaround Available Issue': 5,
    'Workflow Improvement': 6
  });
  setMockRtdbData('/data/statusList/bug-card', {
    'Created': 1,
    'Assigned': 2,
    'Fixed': 3,
    'Verified': 4,
    'Closed': 5
  });
  setMockRtdbData('/data/statusList/task-card', {
    'To Do': 1,
    'In Progress': 2,
    'To Validate': 3,
    'Done&Validated': 4,
    'Blocked': 5,
    'Reopened': 6
  });
}

describe('cards.js', () => {
  beforeEach(() => {
    resetMockData();
    invalidateCache();
    setupMockLists();
  });

  describe('validateEntityId', () => {
    it('should pass for valid developer ID', () => {
      expect(() => validateEntityId('developer', 'dev_123')).not.toThrow();
    });

    it('should pass for valid validator ID', () => {
      expect(() => validateEntityId('validator', 'stk_456')).not.toThrow();
    });

    it('should pass for valid stakeholder ID', () => {
      expect(() => validateEntityId('stakeholder', 'stk_789')).not.toThrow();
    });

    it('should throw for invalid developer ID prefix', () => {
      expect(() => validateEntityId('developer', 'usr_123')).toThrow(/must start with "dev_"/);
    });

    it('should throw for invalid stakeholder ID prefix', () => {
      expect(() => validateEntityId('stakeholder', 'dev_123')).toThrow(/must start with "stk_"/);
    });

    it('should pass for empty values (optional fields)', () => {
      expect(() => validateEntityId('developer', '')).not.toThrow();
      expect(() => validateEntityId('developer', null)).not.toThrow();
      expect(() => validateEntityId('developer', undefined)).not.toThrow();
    });
  });

  describe('validateBugFields', () => {
    it('should pass for valid bug status', () => {
      expect(() => validateBugFields({ status: 'Created' })).not.toThrow();
      expect(() => validateBugFields({ status: 'Fixed' })).not.toThrow();
    });

    it('should throw for invalid bug status', () => {
      expect(() => validateBugFields({ status: 'In Progress' })).toThrow(/Invalid bug status/);
    });

    it('should pass for valid bug priority', () => {
      expect(() => validateBugFields({ priority: 'Application Blocker' })).not.toThrow();
    });

    it('should throw for invalid bug priority', () => {
      expect(() => validateBugFields({ priority: 'High' })).toThrow(/Invalid bug priority/);
    });
  });

  describe('validateTaskFields', () => {
    it('should pass for valid task status', () => {
      for (const status of VALID_TASK_STATUSES) {
        expect(() => validateTaskFields({ status })).not.toThrow();
      }
    });

    it('should throw for invalid task status', () => {
      expect(() => validateTaskFields({ status: 'Created' })).toThrow(/Invalid task status/);
    });

    it('should pass for valid task priority', () => {
      for (const priority of VALID_TASK_PRIORITIES) {
        expect(() => validateTaskFields({ priority })).not.toThrow();
      }
    });

    it('should throw for invalid task priority', () => {
      expect(() => validateTaskFields({ priority: 'Application Blocker' })).toThrow(/Invalid task priority/);
    });
  });

  describe('hasValidValue', () => {
    it('should return true for non-empty string', () => {
      expect(hasValidValue({ title: 'Test' }, 'title')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(hasValidValue({ title: '' }, 'title')).toBe(false);
      expect(hasValidValue({ title: '   ' }, 'title')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(hasValidValue({ title: null }, 'title')).toBe(false);
      expect(hasValidValue({ title: undefined }, 'title')).toBe(false);
      expect(hasValidValue({}, 'title')).toBe(false);
    });

    it('should check acceptanceCriteria string', () => {
      expect(hasValidValue({ acceptanceCriteria: 'Some criteria' }, 'acceptanceCriteria')).toBe(true);
      expect(hasValidValue({ acceptanceCriteria: '' }, 'acceptanceCriteria')).toBe(false);
    });

    it('should check acceptanceCriteriaStructured array', () => {
      expect(hasValidValue({
        acceptanceCriteriaStructured: [{ given: 'context', when: 'action', then: 'result' }]
      }, 'acceptanceCriteria')).toBe(true);

      expect(hasValidValue({
        acceptanceCriteriaStructured: []
      }, 'acceptanceCriteria')).toBe(false);
    });

    it('should validate numeric fields (devPoints, businessPoints)', () => {
      expect(hasValidValue({ devPoints: 5 }, 'devPoints')).toBe(true);
      expect(hasValidValue({ devPoints: 0 }, 'devPoints')).toBe(false);
      expect(hasValidValue({ devPoints: '' }, 'devPoints')).toBe(false);
      expect(hasValidValue({ businessPoints: 3 }, 'businessPoints')).toBe(true);
    });
  });

  describe('getActiveSprint', () => {
    it('should return sprint with "Active" status', async () => {
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', status: 'Planning', startDate: '2024-01-01', endDate: '2024-01-14' },
        'sprint2': { cardId: 'TP-SPR-0002', status: 'Active', startDate: '2024-01-15', endDate: '2024-01-28' }
      });

      const result = await getActiveSprint('TestProject');
      expect(result.cardId).toBe('TP-SPR-0002');
    });

    it('should return sprint with "In Progress" status', async () => {
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', status: 'In Progress', startDate: '2024-01-01', endDate: '2024-12-31' }
      });

      const result = await getActiveSprint('TestProject');
      expect(result.cardId).toBe('TP-SPR-0001');
    });

    it('should return sprint by date range if no active status', async () => {
      const today = new Date().toISOString().split('T')[0];
      const pastDate = '2020-01-01';
      const futureDate = '2030-12-31';

      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', status: 'Planning', startDate: pastDate, endDate: futureDate }
      });

      const result = await getActiveSprint('TestProject');
      expect(result.cardId).toBe('TP-SPR-0001');
    });

    it('should return null if no active sprint', async () => {
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', status: 'Completed', startDate: '2020-01-01', endDate: '2020-01-14' }
      });

      const result = await getActiveSprint('TestProject');
      expect(result).toBeNull();
    });

    it('should return null if no sprints exist', async () => {
      const result = await getActiveSprint('TestProject');
      expect(result).toBeNull();
    });
  });

  describe('createCard - Task validation', () => {
    beforeEach(() => {
      // Setup basic project data
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockFirestoreData('projectCounters', 'TP-TSK', { lastId: 0 });
      setMockRtdbData('/cards/TestProject/EPICS_TestProject', {
        'epic1': { cardId: 'TP-EPC-0001', title: 'Test Epic' }
      });
      // Setup stakeholders and developers for validator auto-assignment
      setMockRtdbData('/data/stakeholders', {
        'stk_001': { name: 'Dev User', email: 'dev@test.com', active: true },
        'stk_002': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', active: true },
        'stk_003': { name: 'Other Stk', email: 'other@test.com', active: true }
      });
      setMockRtdbData('/projects/TestProject/stakeholders', ['stk_001', 'stk_002', 'stk_003']);
      setMockRtdbData('/data/developers/dev_100', { name: 'Dev User', email: 'dev@test.com' });
      setMockRtdbData('/data/developers/dev_200', { name: 'No Stk Dev', email: 'nostk@test.com' });
      setMockRtdbData('/data/developers/dev_300', { name: 'Unknown Dev', email: 'unknown@test.com' });
    });

    it('should throw error when descriptionStructured is missing for task', async () => {
      await expect(createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task'
      })).rejects.toThrow(/Tasks require descriptionStructured/);
    });

    it('should throw error when descriptionStructured item is incomplete', async () => {
      await expect(createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user' }] // missing goal and benefit
      })).rejects.toThrow(/is incomplete/);
    });

    it('should throw error when acceptanceCriteria is missing for task', async () => {
      await expect(createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }]
      })).rejects.toThrow(/Tasks require acceptance criteria/);
    });

    it('should throw error when epic is missing for task', async () => {
      await expect(createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
        acceptanceCriteria: 'Should work correctly'
      })).rejects.toThrow(/Tasks require an epic/);
    });

    it('should throw error when epic does not exist and list available epics', async () => {
      try {
        await createCard({
          projectId: 'TestProject',
          type: 'task',
          title: 'Test Task',
          descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
          acceptanceCriteria: 'Should work correctly',
          epic: 'TP-EPC-9999' // non-existent
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toMatch(/Epic "TP-EPC-9999" not found/);
        expect(error.message).toContain('TP-EPC-0001');
        expect(error.message).toContain('Test Epic');
      }
    });

    it('should list available epics when epic is missing', async () => {
      try {
        await createCard({
          projectId: 'TestProject',
          type: 'task',
          title: 'Test Task',
          descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
          acceptanceCriteria: 'Should work correctly'
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toMatch(/Tasks require an epic/);
        expect(error.message).toContain('TP-EPC-0001');
        expect(error.message).toContain('Test Epic');
      }
    });

    it('should create task successfully with all required fields', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
        acceptanceCriteria: 'Should work correctly',
        epic: 'TP-EPC-0001'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Card created successfully');
      expect(response.cardId).toMatch(/^TP-TSK-\d{4}$/);
    });

    it('should save epic and acceptanceCriteria fields in the created task', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task with Epic',
        descriptionStructured: [{ role: 'developer', goal: 'test field saving', benefit: 'verify bug fix' }],
        acceptanceCriteria: 'All fields should be saved correctly',
        epic: 'TP-EPC-0001',
        developer: 'dev_123'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Card created successfully');

      // Verify the card was saved with the correct fields
      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      expect(savedCards).toBeTruthy();

      // Find the created card
      const cardEntries = Object.entries(savedCards);
      expect(cardEntries.length).toBeGreaterThan(0);

      const [, savedCard] = cardEntries[0];
      expect(savedCard.epic).toBe('TP-EPC-0001');
      expect(savedCard.acceptanceCriteria).toBe('All fields should be saved correctly');
      expect(savedCard.developer).toBe('dev_123');
      expect(savedCard.descriptionStructured).toEqual([{ role: 'developer', goal: 'test field saving', benefit: 'verify bug fix' }]);
    });

    it('should accept acceptanceCriteriaStructured instead of plain text', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
        acceptanceCriteriaStructured: [{ given: 'context', when: 'action', then: 'result' }],
        epic: 'TP-EPC-0001'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Card created successfully');
    });

    it('should save acceptanceCriteriaStructured in the created task', async () => {
      const acceptanceCriteriaStructured = [
        { given: 'user is logged in', when: 'clicks logout', then: 'session ends' },
        { given: 'user is on home', when: 'clicks profile', then: 'profile page loads' }
      ];

      await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Structured AC',
        descriptionStructured: [{ role: 'user', goal: 'test AC', benefit: 'verify saving' }],
        acceptanceCriteriaStructured,
        epic: 'TP-EPC-0001'
      });

      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      const [, savedCard] = Object.entries(savedCards)[0];

      expect(savedCard.acceptanceCriteriaStructured).toEqual(acceptanceCriteriaStructured);
      expect(savedCard.acceptanceCriteriaStructured).toHaveLength(2);
    });

    it('should save implementationPlan in the created task', async () => {
      const implementationPlan = {
        approach: 'Use TDD approach with unit tests first',
        steps: [
          { description: 'Create test file', status: 'pending' },
          { description: 'Implement feature', status: 'pending' }
        ],
        risks: 'May need refactoring',
        outOfScope: 'UI changes'
      };

      await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test with Plan',
        descriptionStructured: [{ role: 'dev', goal: 'implement feature', benefit: 'add value' }],
        acceptanceCriteria: 'Feature works as expected',
        epic: 'TP-EPC-0001',
        implementationPlan
      });

      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      const [, savedCard] = Object.entries(savedCards)[0];

      expect(savedCard.implementationPlan).toBeDefined();
      expect(savedCard.implementationPlan.approach).toBe('Use TDD approach with unit tests first');
      expect(savedCard.implementationPlan.steps).toHaveLength(2);
      expect(savedCard.implementationPlan.risks).toBe('May need refactoring');
      expect(savedCard.implementationPlan.planStatus).toBe('pending'); // Auto-set default
    });

    it('should return planAction with SHOW_PLAN_FOR_VALIDATION when task has plan', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Task with Plan',
        descriptionStructured: [{ role: 'dev', goal: 'implement feature', benefit: 'add value' }],
        acceptanceCriteria: 'Feature works',
        epic: 'TP-EPC-0001',
        implementationPlan: {
          approach: 'Use TDD',
          steps: [{ description: 'Write tests' }]
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.planAction).toBeDefined();
      expect(response.planAction.action).toBe('SHOW_PLAN_FOR_VALIDATION');
      expect(response.planAction.plan).toBeDefined();
      expect(response.planAction.plan.approach).toBe('Use TDD');
    });

    it('should return planAction with CREATE_PLAN when task has no plan', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Task without Plan',
        descriptionStructured: [{ role: 'dev', goal: 'implement feature', benefit: 'add value' }],
        acceptanceCriteria: 'Feature works',
        epic: 'TP-EPC-0001'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.planAction).toBeDefined();
      expect(response.planAction.action).toBe('CREATE_PLAN');
    });

    it('should not return planAction for non-task types', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'bug',
        title: 'Test Bug'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.planAction).toBeUndefined();
    });

    it('should auto-assign developer as validator when they exist as stakeholder', async () => {
      await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Task auto validator',
        descriptionStructured: [{ role: 'dev', goal: 'test', benefit: 'test' }],
        acceptanceCriteria: 'Works',
        epic: 'TP-EPC-0001',
        developer: 'dev_100' // email: dev@test.com -> matches stk_001
      });

      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      const [, savedCard] = Object.entries(savedCards)[0];
      expect(savedCard.validator).toBe('stk_001');
    });

    it('should auto-assign Mánu Fosela as validator when developer is not a stakeholder', async () => {
      await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Task fallback validator',
        descriptionStructured: [{ role: 'dev', goal: 'test', benefit: 'test' }],
        acceptanceCriteria: 'Works',
        epic: 'TP-EPC-0001',
        developer: 'dev_200' // email: nostk@test.com -> no stk match, falls back to Mánu
      });

      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      const [, savedCard] = Object.entries(savedCards)[0];
      expect(savedCard.validator).toBe('stk_002'); // Mánu Fosela
    });

    it('should error with stakeholder list when no auto-assignment possible', async () => {
      // Remove Mánu Fosela from project stakeholders
      setMockRtdbData('/projects/TestProject/stakeholders', ['stk_003']);

      try {
        await createCard({
          projectId: 'TestProject',
          type: 'task',
          title: 'Task no validator',
          descriptionStructured: [{ role: 'dev', goal: 'test', benefit: 'test' }],
          acceptanceCriteria: 'Works',
          epic: 'TP-EPC-0001',
          developer: 'dev_300' // no stk match, no Mánu in project
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Could not auto-assign a validator');
        expect(error.message).toContain('stk_003');
      }
    });

    it('should use explicit validator without auto-assignment', async () => {
      await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Task explicit validator',
        descriptionStructured: [{ role: 'dev', goal: 'test', benefit: 'test' }],
        acceptanceCriteria: 'Works',
        epic: 'TP-EPC-0001',
        developer: 'dev_100',
        validator: 'stk_003' // Explicit, different from dev's stk
      });

      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      const [, savedCard] = Object.entries(savedCards)[0];
      expect(savedCard.validator).toBe('stk_003');
    });

    it('should save all optional fields correctly', async () => {
      // Setup sprint for this test
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1' }
      });

      await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Complete Task',
        description: 'Additional description text',
        descriptionStructured: [{ role: 'admin', goal: 'manage users', benefit: 'control access' }],
        acceptanceCriteria: 'All criteria met',
        epic: 'TP-EPC-0001',
        developer: 'dev_456',
        sprint: 'TP-SPR-0001', // Must be a valid sprint ID now
        devPoints: 3,
        businessPoints: 4,
        status: 'To Do',
        year: 2025
      });

      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      const [, savedCard] = Object.entries(savedCards)[0];

      // Verify all fields are saved
      expect(savedCard.title).toBe('Complete Task');
      expect(savedCard.description).toContain('Additional description text');
      expect(savedCard.descriptionStructured).toEqual([{ role: 'admin', goal: 'manage users', benefit: 'control access' }]);
      expect(savedCard.acceptanceCriteria).toBe('All criteria met');
      expect(savedCard.epic).toBe('TP-EPC-0001');
      expect(savedCard.developer).toBe('dev_456');
      expect(savedCard.sprint).toBe('TP-SPR-0001');
      // Priority is now calculated automatically (4/3 ~= 133%)
      expect(savedCard.priority).toBeDefined();
      expect(typeof savedCard.priority).toBe('number');
      expect(savedCard.devPoints).toBe(3);
      expect(savedCard.businessPoints).toBe(4);
      expect(savedCard.status).toBe('To Do');
      expect(savedCard.year).toBe(2025);
    });
  });

  describe('updateCard - Status transitions', () => {
    beforeEach(() => {
      // Setup project and task data
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'To Do',
          description: 'Test description'
        }
      });
      // Setup active sprint
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', status: 'Active' }
      });
    });

    it('should throw error when trying to set Done&Validated status via MCP', async () => {
      await expect(updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'Done&Validated' }
      })).rejects.toThrow(/MCP cannot change task status to "Done&Validated"/);
    });

    it('should throw error when missing required fields to leave To Do', async () => {
      await expect(updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should auto-assign active sprint when moving to In Progress', async () => {
      // Setup complete task data - sprint will be auto-assigned
      // Note: sprint is required to leave To Do, so we include it in the update
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'To Do',
          developer: 'dev_123',
          validator: 'stk_456',
          epic: 'TP-EPC-0001',
          devPoints: 3,
          businessPoints: 5,
          acceptanceCriteria: 'Should work',
          sprint: 'TP-SPR-0001'  // Sprint is required to leave To Do
        }
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('In Progress');
    });

    it('should auto-set startDate when moving to In Progress', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'To Do',
          developer: 'dev_123',
          validator: 'stk_456',
          epic: 'TP-EPC-0001',
          devPoints: 3,
          businessPoints: 5,
          acceptanceCriteria: 'Should work',
          sprint: 'TP-SPR-0001'
        }
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.startDate).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should not overwrite existing startDate when moving to In Progress', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'Blocked',
          developer: 'dev_123',
          validator: 'stk_456',
          epic: 'TP-EPC-0001',
          devPoints: 3,
          businessPoints: 5,
          acceptanceCriteria: 'Should work',
          sprint: 'TP-SPR-0001',
          startDate: '2025-12-01'
        }
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.startDate).toBe('2025-12-01');
    });

    it('should auto-transition planStatus from validated to in_progress when moving to In Progress', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'To Do',
          developer: 'dev_123',
          validator: 'stk_456',
          epic: 'TP-EPC-0001',
          devPoints: 3,
          businessPoints: 5,
          acceptanceCriteria: 'Should work',
          sprint: 'TP-SPR-0001',
          implementationPlan: {
            approach: 'Use TDD',
            steps: [{ description: 'Write tests' }],
            planStatus: 'validated'
          }
        }
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.implementationPlan.planStatus).toBe('in_progress');
    });

    it('should warn when moving to In Progress with plan still in proposed status', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'To Do',
          developer: 'dev_123',
          validator: 'stk_456',
          epic: 'TP-EPC-0001',
          devPoints: 3,
          businessPoints: 5,
          acceptanceCriteria: 'Should work',
          sprint: 'TP-SPR-0001',
          implementationPlan: {
            approach: 'Use TDD',
            steps: [{ description: 'Write tests' }],
            planStatus: 'proposed'
          }
        }
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.warnings).toBeDefined();
      const planWarning = response.warnings.find(w => w.code === 'PLAN_NOT_VALIDATED');
      expect(planWarning).toBeDefined();
      // planStatus should NOT auto-transition from proposed
      expect(response.card.implementationPlan.planStatus).toBe('proposed');
    });

    it('should require commits for To Validate status', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'In Progress',
          developer: 'dev_123',
          validator: 'stk_456',
          epic: 'TP-EPC-0001',
          sprint: 'TP-SPR-0001',
          devPoints: 3,
          businessPoints: 5,
          acceptanceCriteria: 'Should work',
          startDate: '2024-01-01'  // Required for To Validate
        }
      });

      await expect(updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'To Validate' }
      })).rejects.toThrow(/commits/i);  // Error should mention commits
    });

    it('should allow To Validate with commits', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'In Progress',
          developer: 'dev_123',
          validator: 'stk_456',
          epic: 'TP-EPC-0001',
          sprint: 'TP-SPR-0001',
          devPoints: 3,
          businessPoints: 5,
          acceptanceCriteria: 'Should work',
          startDate: '2024-01-01'  // Required for To Validate
        }
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [{ hash: 'abc123', message: 'Fix bug', date: '2024-01-01', author: 'dev@test.com' }],
          pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1, date: '2024-01-01T10:00:00Z' } }
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('To Validate');
    });
  });

  describe('updateCard - validateOnly mode', () => {
    beforeEach(() => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'To Do'
        }
      });
    });

    it('should return validation errors without applying changes', async () => {
      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' },
        validateOnly: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.validateOnly).toBe(true);
      expect(response.valid).toBe(false);
      expect(response.missingFields.length).toBeGreaterThan(0);
    });

    it('should report protected field violations', async () => {
      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { cardId: 'HACKED' },
        validateOnly: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.protectedFieldsViolation).toContain('cardId');
    });
  });

  describe('Constants', () => {
    it('should have correct valid bug statuses', () => {
      expect(VALID_BUG_STATUSES).toContain('Created');
      expect(VALID_BUG_STATUSES).toContain('Closed');
    });

    it('should have correct valid task statuses', () => {
      expect(VALID_TASK_STATUSES).toContain('To Do');
      expect(VALID_TASK_STATUSES).toContain('In Progress');
      expect(VALID_TASK_STATUSES).toContain('Done&Validated');
    });

    it('should have correct required fields to leave To Do', () => {
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('developer');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('acceptanceCriteria');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('epic');
    });

    it('should have correct validator-only statuses', () => {
      expect(VALIDATOR_ONLY_STATUSES).toContain('Done');
      expect(VALIDATOR_ONLY_STATUSES).toContain('Done&Validated');
    });

    it('should have correct required fields to close bug', () => {
      expect(REQUIRED_FIELDS_TO_CLOSE_BUG).toContain('commits');
      expect(REQUIRED_FIELDS_TO_CLOSE_BUG).toContain('rootCause');
      expect(REQUIRED_FIELDS_TO_CLOSE_BUG).toContain('resolution');
    });
  });

  describe('validateBugStatusTransition', () => {
    it('should pass when not changing status', () => {
      const currentBug = { status: 'Fixed' };
      const updates = { priority: 'Application Blocker' };
      expect(() => validateBugStatusTransition(currentBug, updates)).not.toThrow();
    });

    it('should pass when status stays the same', () => {
      const currentBug = { status: 'Fixed' };
      const updates = { status: 'Fixed' };
      expect(() => validateBugStatusTransition(currentBug, updates)).not.toThrow();
    });

    it('should pass for non-Fixed/Closed status transitions', () => {
      const currentBug = { status: 'Created' };
      const updates = { status: 'Assigned' };
      expect(() => validateBugStatusTransition(currentBug, updates)).not.toThrow();
    });

    it('should throw when fixing bug without commits', () => {
      const currentBug = { status: 'Assigned' };
      const updates = {
        status: 'Fixed',
        pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1, date: '2024-01-20T10:00:00Z' } }
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).toThrow(/commits/);
    });

    it('should throw when fixing bug without pipelineStatus', () => {
      const currentBug = { status: 'Assigned' };
      const updates = {
        status: 'Fixed',
        commits: [{ hash: 'abc123', message: 'fix: bug', date: '2024-01-20T10:00:00Z', author: 'dev' }]
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).toThrow(/pipelineStatus/);
    });

    it('should pass when fixing bug with all required fields', () => {
      const currentBug = { status: 'Assigned' };
      const updates = {
        status: 'Fixed',
        commits: [{ hash: 'abc123', message: 'fix: bug', date: '2024-01-20T10:00:00Z', author: 'dev' }],
        pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1, date: '2024-01-20T10:00:00Z' } }
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).not.toThrow();
    });

    it('should throw when closing bug without commits', () => {
      const currentBug = { status: 'Verified' };
      const updates = {
        status: 'Closed',
        rootCause: 'Memory leak',
        resolution: 'Fixed memory allocation'
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).toThrow(/commits/);
    });

    it('should throw when closing bug without rootCause', () => {
      const currentBug = { status: 'Verified' };
      const updates = {
        status: 'Closed',
        commits: [{ hash: 'abc123', message: 'Fix', date: '2024-01-01', author: 'dev@test.com' }],
        resolution: 'Fixed memory allocation'
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).toThrow(/rootCause/);
    });

    it('should throw when closing bug without resolution', () => {
      const currentBug = { status: 'Verified' };
      const updates = {
        status: 'Closed',
        commits: [{ hash: 'abc123', message: 'Fix', date: '2024-01-01', author: 'dev@test.com' }],
        rootCause: 'Memory leak'
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).toThrow(/resolution/);
    });

    it('should pass when closing bug with all required fields', () => {
      const currentBug = { status: 'Verified' };
      const updates = {
        status: 'Closed',
        commits: [{ hash: 'abc123', message: 'Fix memory leak', date: '2024-01-01', author: 'dev@test.com' }],
        rootCause: 'Memory was not being freed after use',
        resolution: 'Added proper cleanup in destructor'
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).not.toThrow();
    });

    it('should use existing values from currentBug when closing', () => {
      const currentBug = {
        status: 'Verified',
        commits: [{ hash: 'abc123', message: 'Fix', date: '2024-01-01', author: 'dev@test.com' }],
        rootCause: 'Memory leak'
      };
      const updates = {
        status: 'Closed',
        resolution: 'Fixed it'
      };
      expect(() => validateBugStatusTransition(currentBug, updates)).not.toThrow();
    });
  });

  describe('updateCard - Bug closing', () => {
    beforeEach(() => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        'bug1': {
          cardId: 'TP-BUG-0001',
          title: 'Test Bug',
          status: 'Verified'
        }
      });
    });

    it('should throw error when closing bug without required fields', async () => {
      await expect(updateCard({
        projectId: 'TestProject',
        type: 'bug',
        firebaseId: 'bug1',
        updates: { status: 'Closed' }
      })).rejects.toThrow(/Cannot close bug/);
    });

    it('should allow closing bug with all required fields', async () => {
      const result = await updateCard({
        projectId: 'TestProject',
        type: 'bug',
        firebaseId: 'bug1',
        updates: {
          status: 'Closed',
          commits: [{ hash: 'abc123', message: 'Fix bug', date: '2024-01-01', author: 'dev@test.com' }],
          rootCause: 'Null pointer exception due to uninitialized variable',
          resolution: 'Initialize variable before use'
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('Closed');
      expect(response.card.rootCause).toBe('Null pointer exception due to uninitialized variable');
      expect(response.card.resolution).toBe('Initialize variable before use');
    });
  });

  describe('Sprint validation', () => {
    beforeEach(() => {
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1' },
        'sprint2': { cardId: 'TP-SPR-0002', title: 'Sprint 2' }
      });
    });

    it('should pass for valid sprint ID', async () => {
      await expect(validateSprintExists('TestProject', 'TP-SPR-0001')).resolves.not.toThrow();
    });

    it('should pass when sprint is undefined', async () => {
      await expect(validateSprintExists('TestProject', undefined)).resolves.not.toThrow();
    });

    it('should throw for non-existent sprint', async () => {
      await expect(validateSprintExists('TestProject', 'TP-SPR-9999'))
        .rejects.toThrow(/Sprint "TP-SPR-9999" not found/);
    });

    it('should throw for text sprint instead of ID', async () => {
      await expect(validateSprintExists('TestProject', 'Sprint 1'))
        .rejects.toThrow(/Sprint "Sprint 1" not found/);
    });

    it('should include available sprints in error message', async () => {
      await expect(validateSprintExists('TestProject', 'Invalid'))
        .rejects.toThrow(/Available sprints: TP-SPR-0001 \(Sprint 1\), TP-SPR-0002 \(Sprint 2\)/);
    });

    it('should throw when project has no sprints', async () => {
      resetMockData();
      await expect(validateSprintExists('EmptyProject', 'TP-SPR-0001'))
        .rejects.toThrow(/No sprints found in project "EmptyProject"/);
    });
  });

  describe('Priority calculation', () => {
    it('should generate 25 combinations for 1-5 system', () => {
      expect(PRIORITY_MAP_1_5.length).toBe(25);
    });

    it('should generate 36 combinations for fibonacci system', () => {
      expect(PRIORITY_MAP_FIBONACCI.length).toBe(36);
    });

    it('should have priority 1 for highest ratio (5/1 = 500%)', () => {
      const entry = PRIORITY_MAP_1_5.find(e => e.biz === 5 && e.dev === 1);
      expect(entry.priority).toBe(1);
    });

    it('should have priority 25 for lowest ratio in 1-5 (1/5 = 20%)', () => {
      const entry = PRIORITY_MAP_1_5.find(e => e.biz === 1 && e.dev === 5);
      expect(entry.priority).toBe(25);
    });

    it('should calculate priority correctly for ratio >= 500', () => {
      const priority = calculatePriority(5, 1, '1-5');
      expect(priority).toBe(1);
    });

    it('should calculate priority correctly for ratio = 100', () => {
      // 3/3 = 100%, 5/5 = 100%, etc.
      const priority = calculatePriority(3, 3, '1-5');
      expect(priority).toBeGreaterThan(1);
      expect(priority).toBeLessThan(25);
    });

    it('should calculate priority correctly for lowest ratio', () => {
      const priority = calculatePriority(1, 5, '1-5');
      expect(priority).toBe(25);
    });

    it('should return null when businessPoints is missing', () => {
      expect(calculatePriority(null, 3)).toBeNull();
      expect(calculatePriority(undefined, 3)).toBeNull();
      expect(calculatePriority(0, 3)).toBeNull();
    });

    it('should return null when devPoints is missing', () => {
      expect(calculatePriority(3, null)).toBeNull();
      expect(calculatePriority(3, undefined)).toBeNull();
      expect(calculatePriority(3, 0)).toBeNull();
    });

    it('should use fibonacci system when specified', () => {
      const priority = calculatePriority(13, 1, 'fibonacci');
      expect(priority).toBe(1); // Highest in fibonacci
    });
  });

  describe('createCard - Priority and Sprint validation', () => {
    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/projects/TestProject/scoringSystem', '1-5');
      setMockFirestoreData('projectCounters', 'TP-TSK', { lastId: 0 });
      setMockRtdbData('/cards/TestProject/EPICS_TestProject', {
        'epic1': { cardId: 'TP-EPC-0001', title: 'Test Epic' }
      });
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1' }
      });
      // Stakeholders needed for validator auto-assignment
      setMockRtdbData('/data/stakeholders', {
        'stk_002': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', active: true }
      });
      setMockRtdbData('/projects/TestProject/stakeholders', ['stk_002']);
    });

    it('should reject manual priority in createCard for tasks', async () => {
      await expect(createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
        acceptanceCriteria: 'Should work',
        epic: 'TP-EPC-0001',
        priority: 'High'
      })).rejects.toThrow(/Cannot set priority directly for tasks/);
    });

    it('should reject non-existent sprint in createCard', async () => {
      await expect(createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
        acceptanceCriteria: 'Should work',
        epic: 'TP-EPC-0001',
        sprint: 'Invalid-Sprint'
      })).rejects.toThrow(/Sprint "Invalid-Sprint" not found/);
    });

    it('should accept valid sprint ID in createCard', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
        acceptanceCriteria: 'Should work',
        epic: 'TP-EPC-0001',
        sprint: 'TP-SPR-0001'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Card created successfully');
    });

    it('should calculate priority when devPoints and businessPoints provided', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Test Task with Points',
        descriptionStructured: [{ role: 'user', goal: 'do something', benefit: 'get value' }],
        acceptanceCriteria: 'Should work',
        epic: 'TP-EPC-0001',
        devPoints: 2,
        businessPoints: 5
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Card created successfully');

      // Check that priority was calculated
      const savedCards = getMockRtdbData('/cards/TestProject/TASKS_TestProject');
      const [, savedCard] = Object.entries(savedCards)[0];
      expect(savedCard.devPoints).toBe(2);
      expect(savedCard.businessPoints).toBe(5);
      // 5/2 = 250%, should be a low priority number (high priority)
      expect(savedCard.priority).toBeDefined();
      expect(typeof savedCard.priority).toBe('number');
    });

    it('should allow priority for bugs (not calculated)', async () => {
      setMockFirestoreData('projectCounters', 'TP-BUG', { lastId: 0 });

      const result = await createCard({
        projectId: 'TestProject',
        type: 'bug',
        title: 'Test Bug',
        description: 'A bug',
        priority: 'Application Blocker'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Card created successfully');
    });
  });

  describe('updateCard - Priority and Sprint validation', () => {
    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/projects/TestProject/scoringSystem', '1-5');
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': {
          cardId: 'TP-TSK-0001',
          title: 'Test Task',
          status: 'To Do',
          devPoints: 3,
          businessPoints: 3
        }
      });
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1', status: 'Active' }
      });
    });

    it('should reject manual priority in updateCard for tasks', async () => {
      await expect(updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { priority: 'High' }
      })).rejects.toThrow(/Cannot set priority directly for tasks/);
    });

    it('should reject non-existent sprint in updateCard', async () => {
      await expect(updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { sprint: 'Invalid-Sprint' }
      })).rejects.toThrow(/Sprint "Invalid-Sprint" not found/);
    });

    it('should calculate priority when devPoints updated', async () => {
      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { devPoints: 1 } // Now 3/1 = 300%, high priority
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.devPoints).toBe(1);
      expect(response.card.priority).toBeDefined();
      expect(typeof response.card.priority).toBe('number');
    });

    it('should calculate priority when businessPoints updated', async () => {
      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { businessPoints: 5 } // Now 5/3 ~= 167%
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.businessPoints).toBe(5);
      expect(response.card.priority).toBeDefined();
      expect(typeof response.card.priority).toBe('number');
    });
  });

  describe('planId field for tasks', () => {
    beforeEach(() => {
      setupMockLists();
      setMockRtdbData('/projects/TestProject', { name: 'Test', abbreviation: 'TP', scoringSystem: '1-5' });
      setMockFirestoreData('projectCounters', 'TP-TSK', { lastId: 100 });
      setMockRtdbData('/cards/TestProject/EPICS_TestProject', {
        'epic1': { cardId: 'TP-EPC-0001', title: 'Test Epic' }
      });
      setMockRtdbData('/data/stakeholders', {
        'stk_001': { name: 'Dev User', email: 'dev@test.com', active: true },
        'stk_002': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', active: true }
      });
      setMockRtdbData('/projects/TestProject/stakeholders', ['stk_001', 'stk_002']);
    });

    it('should save planId when creating a task with planId', async () => {
      const result = await createCard({
        projectId: 'TestProject',
        type: 'task',
        title: 'Task linked to plan',
        descriptionStructured: [{ role: 'developer', goal: 'link task to plan', benefit: 'traceability' }],
        acceptanceCriteria: 'Task is linked to a plan',
        epic: 'TP-EPC-0001',
        planId: '-plan123'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.cardId).toMatch(/^TP-TSK-/);
    });

    it('should NOT save planId for non-task types', async () => {
      setMockFirestoreData('projectCounters', 'TP-BUG', { lastId: 0 });
      const result = await createCard({
        projectId: 'TestProject',
        type: 'bug',
        title: 'Bug without planId',
        planId: '-plan123'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.cardId).toMatch(/^TP-BUG-/);
    });

    it('should filter tasks by planId in listCards', async () => {
      const sectionPath = 'cards/TestProject/TASKS_TestProject';
      setMockRtdbData(`/${sectionPath}`, {
        'task1': { cardId: 'TP-TSK-0001', title: 'Task A', planId: '-planX', status: 'To Do' },
        'task2': { cardId: 'TP-TSK-0002', title: 'Task B', planId: '-planY', status: 'To Do' },
        'task3': { cardId: 'TP-TSK-0003', title: 'Task C', planId: '-planX', status: 'To Do' }
      });

      const result = await listCards({ projectId: 'TestProject', type: 'task', planId: '-planX' });
      const cards = JSON.parse(result.content[0].text);

      expect(cards).toHaveLength(2);
      expect(cards.every(c => c.cardId === 'TP-TSK-0001' || c.cardId === 'TP-TSK-0003')).toBe(true);
    });
  });

  describe('plan-first workflow enforcement', () => {
    beforeEach(() => {
      setupMockLists();
      resetSessionTaskCounter();
      setMockRtdbData('/projects/TestProject', { name: 'Test', abbreviation: 'TP', scoringSystem: '1-5' });
      setMockFirestoreData('projectCounters', 'TP-TSK', { lastId: 200 });
      setMockRtdbData('/cards/TestProject/EPICS_TestProject', {
        'epic1': { cardId: 'TP-EPC-0001', title: 'Test Epic' }
      });
      setMockRtdbData('/data/stakeholders', {
        'stk_001': { name: 'Dev User', email: 'dev@test.com', active: true },
        'stk_002': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', active: true }
      });
      setMockRtdbData('/projects/TestProject/stakeholders', ['stk_001', 'stk_002']);
    });

    const baseTaskParams = {
      projectId: 'TestProject',
      type: 'task',
      descriptionStructured: [{ role: 'developer', goal: 'test plan-first', benefit: 'enforcement' }],
      acceptanceCriteria: 'Plan-first is enforced',
      epic: 'TP-EPC-0001'
    };

    it('should NOT include planFirstWarning for the first task without planId', async () => {
      const result = await createCard({ ...baseTaskParams, title: 'First task no plan' });
      const response = JSON.parse(result.content[0].text);

      expect(response.planFirstWarning).toBeUndefined();
      expect(getSessionTasksWithoutPlan('TestProject')).toBe(1);
    });

    it('should include planFirstWarning for the second task without planId', async () => {
      await createCard({ ...baseTaskParams, title: 'Task 1 no plan' });
      const result = await createCard({ ...baseTaskParams, title: 'Task 2 no plan' });
      const response = JSON.parse(result.content[0].text);

      expect(response.planFirstWarning).toBeDefined();
      expect(response.planFirstWarning.level).toBe('warning');
      expect(response.planFirstWarning.tasksWithoutPlan).toBe(2);
      expect(response.planFirstWarning.recommendation).toBe('CREATE_PLAN_FIRST');
    });

    it('should NOT count tasks that have a planId', async () => {
      await createCard({ ...baseTaskParams, title: 'Task with plan', planId: '-plan1' });
      const result = await createCard({ ...baseTaskParams, title: 'Task without plan' });
      const response = JSON.parse(result.content[0].text);

      expect(response.planFirstWarning).toBeUndefined();
      expect(getSessionTasksWithoutPlan('TestProject')).toBe(1);
    });

    it('should track counts independently per project', async () => {
      // Create a task in TestProject
      await createCard({ ...baseTaskParams, title: 'TestProject task 1' });

      // Setup a second project
      setMockRtdbData('/projects/OtherProject', { name: 'Other', abbreviation: 'OT', scoringSystem: '1-5' });
      setMockFirestoreData('projectCounters', 'OT-TSK', { lastId: 0 });
      setMockRtdbData('/cards/OtherProject/EPICS_OtherProject', {
        'epic1': { cardId: 'OT-EPC-0001', title: 'Other Epic' }
      });
      setMockRtdbData('/projects/OtherProject/stakeholders', ['stk_001', 'stk_002']);

      const result = await createCard({
        ...baseTaskParams,
        projectId: 'OtherProject',
        title: 'OtherProject task 1',
        epic: 'OT-EPC-0001'
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.planFirstWarning).toBeUndefined();
      expect(getSessionTasksWithoutPlan('TestProject')).toBe(1);
      expect(getSessionTasksWithoutPlan('OtherProject')).toBe(1);
    });

    it('should increment warning count for 3+ tasks without plan', async () => {
      await createCard({ ...baseTaskParams, title: 'Task 1' });
      await createCard({ ...baseTaskParams, title: 'Task 2' });
      const result = await createCard({ ...baseTaskParams, title: 'Task 3' });
      const response = JSON.parse(result.content[0].text);

      expect(response.planFirstWarning).toBeDefined();
      expect(response.planFirstWarning.tasksWithoutPlan).toBe(3);
    });

    it('should NOT warn for non-task card types', async () => {
      setMockFirestoreData('projectCounters', 'TP-BUG', { lastId: 0 });
      // Create multiple bugs - should never trigger plan-first warning
      await createCard({ projectId: 'TestProject', type: 'bug', title: 'Bug 1' });
      const result = await createCard({ projectId: 'TestProject', type: 'bug', title: 'Bug 2' });
      const response = JSON.parse(result.content[0].text);

      expect(response.planFirstWarning).toBeUndefined();
    });

    it('should reset counter for a specific project', async () => {
      await createCard({ ...baseTaskParams, title: 'Task 1' });
      expect(getSessionTasksWithoutPlan('TestProject')).toBe(1);

      resetSessionTaskCounter('TestProject');
      expect(getSessionTasksWithoutPlan('TestProject')).toBe(0);
    });

    it('should reset all counters when no projectId given', async () => {
      await createCard({ ...baseTaskParams, title: 'Task 1' });
      expect(getSessionTasksWithoutPlan('TestProject')).toBe(1);

      resetSessionTaskCounter();
      expect(getSessionTasksWithoutPlan('TestProject')).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // PARANOID STATUS TRANSITION TESTS
  // ══════════════════════════════════════════════════════════════

  describe('Task: To Do → In Progress (paranoid field validation)', () => {
    const fullTaskInTodo = {
      cardId: 'TP-TSK-0001',
      title: 'Test Task',
      status: 'To Do',
      developer: 'dev_001',
      validator: 'stk_001',
      epic: 'TP-EPC-0001',
      sprint: 'TP-SPR-0001',
      devPoints: 2,
      businessPoints: 3,
      acceptanceCriteria: 'Should work correctly'
    };

    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/projects/TestProject/scoringSystem', '1-5');
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1', status: 'Active' }
      });
    });

    it('should throw when developer is missing', async () => {
      const task = { ...fullTaskInTodo };
      delete task.developer;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should throw when validator is missing', async () => {
      const task = { ...fullTaskInTodo };
      delete task.validator;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should throw when epic is missing', async () => {
      const task = { ...fullTaskInTodo };
      delete task.epic;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should throw when sprint is missing and no active sprint exists', async () => {
      const task = { ...fullTaskInTodo };
      delete task.sprint;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });
      // Remove sprints so auto-assign also fails
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {});

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should throw when devPoints is missing', async () => {
      const task = { ...fullTaskInTodo };
      delete task.devPoints;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should throw when businessPoints is missing', async () => {
      const task = { ...fullTaskInTodo };
      delete task.businessPoints;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should throw when acceptanceCriteria is missing', async () => {
      const task = { ...fullTaskInTodo };
      delete task.acceptanceCriteria;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      })).rejects.toThrow(/missing required fields/);
    });

    it('should succeed when all required fields are present', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInTodo } });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('In Progress');
    });

    it('should succeed with acceptanceCriteriaStructured instead of plain', async () => {
      const task = { ...fullTaskInTodo };
      delete task.acceptanceCriteria;
      task.acceptanceCriteriaStructured = [
        { given: 'A user is logged in', when: 'They click save', then: 'Data is persisted' }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('In Progress');
    });

    it('should throw when sprint in update does not exist in Firebase', async () => {
      const task = { ...fullTaskInTodo };
      delete task.sprint;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'In Progress', sprint: 'TP-SPR-9999' }
      })).rejects.toThrow(/not found/);
    });
  });

  describe('Task: In Progress → To Validate (paranoid pipeline validation)', () => {
    const validCommit = { hash: 'abc1234', message: 'feat: implement feature', date: '2024-01-20T10:00:00Z', author: 'dev@test.com' };
    const validPipelineStatus = {
      prCreated: { prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42, date: '2024-01-20T10:30:00Z' }
    };

    const fullTaskInProgress = {
      cardId: 'TP-TSK-0001',
      title: 'Test Task',
      status: 'In Progress',
      developer: 'dev_001',
      validator: 'stk_001',
      epic: 'TP-EPC-0001',
      sprint: 'TP-SPR-0001',
      devPoints: 2,
      businessPoints: 3,
      acceptanceCriteria: 'Should work correctly',
      startDate: '2024-01-01'
    };

    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/projects/TestProject/scoringSystem', '1-5');
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1', status: 'Active' }
      });
    });

    it('should throw when commits are missing', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', pipelineStatus: validPipelineStatus }
      })).rejects.toThrow(/commits/i);
    });

    it('should throw when pipelineStatus is missing', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit] }
      })).rejects.toThrow(/pipelineStatus/i);
    });

    it('should throw when pipelineStatus has no prCreated', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit], pipelineStatus: {} }
      })).rejects.toThrow(/pipelineStatus/i);
    });

    it('should throw when pipelineStatus.prCreated is missing prUrl', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [validCommit],
          pipelineStatus: { prCreated: { prNumber: 42, date: '2024-01-20T10:30:00Z' } }
        }
      })).rejects.toThrow(/pipelineStatus/i);
    });

    it('should throw when pipelineStatus.prCreated is missing prNumber', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [validCommit],
          pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/42', date: '2024-01-20T10:30:00Z' } }
        }
      })).rejects.toThrow(/pipelineStatus/i);
    });

    it('should succeed with all required fields in updates', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit], pipelineStatus: validPipelineStatus }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('To Validate');
      expect(response.card.endDate).toBeDefined();
    });

    it('should succeed when startDate and commits are already on currentCard, only pipelineStatus in updates', async () => {
      const task = {
        ...fullTaskInProgress,
        commits: [validCommit]
      };
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', pipelineStatus: validPipelineStatus }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('To Validate');
    });

    it('should succeed when pipelineStatus is already on currentCard, commits in updates', async () => {
      const task = {
        ...fullTaskInProgress,
        pipelineStatus: validPipelineStatus
      };
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit] }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('To Validate');
    });

    it('should throw when startDate is missing from both card and updates', async () => {
      const task = { ...fullTaskInProgress };
      delete task.startDate;
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: task });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit], pipelineStatus: validPipelineStatus }
      })).rejects.toThrow(/startDate/i);
    });
  });

  describe('Task: MCP restrictions', () => {
    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/projects/TestProject/scoringSystem', '1-5');
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1', status: 'Active' }
      });
    });

    it('should throw when setting status to Done&Validated with specific message', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001', validator: 'stk_001'
        }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'Done&Validated' }
      })).rejects.toThrow(/MCP cannot change task status to "Done&Validated"/);
    });

    it('should succeed when setting status to Blocked with required block info', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001', validator: 'stk_001', epic: 'TP-EPC-0001',
          sprint: 'TP-SPR-0001', devPoints: 2, businessPoints: 3,
          acceptanceCriteria: 'Should work', startDate: '2024-01-01'
        }
      });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: {
          status: 'Blocked',
          blockedByDevelopment: true,
          bbdWhy: 'Dependency not ready',
          bbdWho: 'External team'
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('Blocked');
    });

    it('should throw when setting Blocked without specifying block reason', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001', validator: 'stk_001', epic: 'TP-EPC-0001',
          sprint: 'TP-SPR-0001', devPoints: 2, businessPoints: 3,
          acceptanceCriteria: 'Should work', startDate: '2024-01-01'
        }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'Blocked' }
      })).rejects.toThrow(/blockedByBusiness.*blockedByDevelopment|must specify/i);
    });
  });

  describe('Bug: Assigned → Fixed (paranoid pipeline validation)', () => {
    const validCommit = { hash: 'def5678', message: 'fix: resolve issue', date: '2024-02-01T10:00:00Z', author: 'dev@test.com' };
    const validPipelineStatus = {
      prCreated: { prUrl: 'https://github.com/org/repo/pull/99', prNumber: 99, date: '2024-02-01T10:30:00Z' }
    };

    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
    });

    it('should throw when commits are missing', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        bug1: { cardId: 'TP-BUG-0001', title: 'Test Bug', status: 'Assigned', developer: 'dev_001' }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: { status: 'Fixed', pipelineStatus: validPipelineStatus }
      })).rejects.toThrow(/commits/i);
    });

    it('should throw when pipelineStatus is missing', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        bug1: { cardId: 'TP-BUG-0001', title: 'Test Bug', status: 'Assigned', developer: 'dev_001' }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: { status: 'Fixed', commits: [validCommit] }
      })).rejects.toThrow(/pipelineStatus/i);
    });

    it('should throw when pipelineStatus.prCreated is missing prUrl', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        bug1: { cardId: 'TP-BUG-0001', title: 'Test Bug', status: 'Assigned', developer: 'dev_001' }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: {
          status: 'Fixed',
          commits: [validCommit],
          pipelineStatus: { prCreated: { prNumber: 99, date: '2024-02-01T10:30:00Z' } }
        }
      })).rejects.toThrow(/pipelineStatus/i);
    });

    it('should succeed with commits and pipelineStatus present', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        bug1: { cardId: 'TP-BUG-0001', title: 'Test Bug', status: 'Assigned', developer: 'dev_001' }
      });

      const result = await updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: { status: 'Fixed', commits: [validCommit], pipelineStatus: validPipelineStatus }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('Fixed');
    });

    it('should succeed without rootCause/resolution for Fixed status (not required)', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        bug1: { cardId: 'TP-BUG-0001', title: 'Test Bug', status: 'Assigned', developer: 'dev_001' }
      });

      const result = await updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: { status: 'Fixed', commits: [validCommit], pipelineStatus: validPipelineStatus }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('Fixed');
      // rootCause and resolution are only required for Closed, not Fixed
      expect(response.card.rootCause).toBeUndefined();
      expect(response.card.resolution).toBeUndefined();
    });
  });

  describe('Bug: Fixed → Closed (paranoid field validation)', () => {
    const validCommit = { hash: 'def5678', message: 'fix: resolve issue', date: '2024-02-01T10:00:00Z', author: 'dev@test.com' };

    const fixedBug = {
      cardId: 'TP-BUG-0001',
      title: 'Test Bug',
      status: 'Fixed',
      developer: 'dev_001',
      commits: [validCommit]
    };

    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
    });

    it('should throw when rootCause is missing', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', { bug1: { ...fixedBug } });

      await expect(updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: { status: 'Closed', resolution: 'Fixed the query' }
      })).rejects.toThrow(/rootCause/i);
    });

    it('should throw when resolution is missing', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', { bug1: { ...fixedBug } });

      await expect(updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: { status: 'Closed', rootCause: 'Bad SQL query' }
      })).rejects.toThrow(/resolution/i);
    });

    it('should succeed when all required fields are present', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', { bug1: { ...fixedBug } });

      const result = await updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: {
          status: 'Closed',
          rootCause: 'Bad SQL query',
          resolution: 'Fixed the query with parameterized version'
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('Closed');
      expect(response.card.rootCause).toBe('Bad SQL query');
      expect(response.card.resolution).toBe('Fixed the query with parameterized version');
    });

    it('should succeed when commits are already on the currentCard (not in updates)', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', { bug1: { ...fixedBug } });

      const result = await updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: {
          status: 'Closed',
          rootCause: 'Bad SQL query',
          resolution: 'Fixed the query'
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.status).toBe('Closed');
    });
  });

  describe('getTransitionRules integration', () => {
    it('should return task rules with pipelineStatus.prCreated in requiredFieldsForToValidate', async () => {
      const result = await getTransitionRules({ type: 'task' });
      const response = JSON.parse(result.content[0].text);

      expect(response.type).toBe('task');
      expect(response.requiredFieldsForToValidate).toContain('pipelineStatus.prCreated');
    });

    it('should return task rules with exampleValidUpdate containing pipelineStatus', async () => {
      const result = await getTransitionRules({ type: 'task' });
      const response = JSON.parse(result.content[0].text);

      expect(response.exampleValidUpdate).toBeDefined();
      expect(response.exampleValidUpdate.pipelineStatus).toBeDefined();
      expect(response.exampleValidUpdate.pipelineStatus.prCreated).toBeDefined();
      expect(response.exampleValidUpdate.pipelineStatus.prCreated.prUrl).toBeDefined();
      expect(response.exampleValidUpdate.pipelineStatus.prCreated.prNumber).toBeDefined();
    });

    it('should return bug rules with pipelineStatus.prCreated in requiredFieldsForFixed', async () => {
      const result = await getTransitionRules({ type: 'bug' });
      const response = JSON.parse(result.content[0].text);

      expect(response.type).toBe('bug');
      expect(response.requiredFieldsForFixed).toContain('pipelineStatus.prCreated');
    });

    it('should return bug rules with rootCause and resolution in requiredFieldsForClosed', async () => {
      const result = await getTransitionRules({ type: 'bug' });
      const response = JSON.parse(result.content[0].text);

      expect(response.requiredFieldsForClosed).toContain('rootCause');
      expect(response.requiredFieldsForClosed).toContain('resolution');
      expect(response.requiredFieldsForClosed).toContain('commits');
    });

    it('should return bug rules with exampleFixedUpdate', async () => {
      const result = await getTransitionRules({ type: 'bug' });
      const response = JSON.parse(result.content[0].text);

      expect(response.exampleFixedUpdate).toBeDefined();
      expect(response.exampleFixedUpdate.status).toBe('Fixed');
      expect(response.exampleFixedUpdate.commits).toBeDefined();
      expect(response.exampleFixedUpdate.pipelineStatus).toBeDefined();
    });

    it('should return bug rules with fieldDescriptions for pipelineStatus', async () => {
      const result = await getTransitionRules({ type: 'bug' });
      const response = JSON.parse(result.content[0].text);

      expect(response.fieldDescriptions).toBeDefined();
      expect(response.fieldDescriptions.pipelineStatus).toBeDefined();
    });

    it('should return task rules with validStatuses and mcpRestrictedStatuses', async () => {
      const result = await getTransitionRules({ type: 'task' });
      const response = JSON.parse(result.content[0].text);

      expect(response.validStatuses).toBeDefined();
      expect(response.validStatuses.length).toBeGreaterThan(0);
      expect(response.mcpRestrictedStatuses).toBeDefined();
      expect(response.mcpRestrictedStatuses).toContain('Done&Validated');
    });

    it('should throw for unknown card type', async () => {
      await expect(getTransitionRules({ type: 'unknown' })).rejects.toThrow(/Unknown card type/);
    });
  });

  describe('validateOnly mode for status transitions', () => {
    const validCommit = { hash: 'abc1234', message: 'feat: implement feature', date: '2024-01-20T10:00:00Z', author: 'dev@test.com' };
    const validPipelineStatus = {
      prCreated: { prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42, date: '2024-01-20T10:30:00Z' }
    };

    const fullTaskInProgress = {
      cardId: 'TP-TSK-0001',
      title: 'Test Task',
      status: 'In Progress',
      developer: 'dev_001',
      validator: 'stk_001',
      epic: 'TP-EPC-0001',
      sprint: 'TP-SPR-0001',
      devPoints: 2,
      businessPoints: 3,
      acceptanceCriteria: 'Should work',
      startDate: '2024-01-01'
    };

    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/projects/TestProject/scoringSystem', '1-5');
    });

    it('should return valid:false with missing pipelineStatus for To Validate', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit] },
        validateOnly: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.validateOnly).toBe(true);
      expect(response.valid).toBe(false);
      expect(response.missingFields).toContain('pipelineStatus');
    });

    it('should return valid:true when all fields are present for To Validate', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit], pipelineStatus: validPipelineStatus },
        validateOnly: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.validateOnly).toBe(true);
      expect(response.valid).toBe(true);
    });

    it('should return valid:false with missing commits for To Validate', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', pipelineStatus: validPipelineStatus },
        validateOnly: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.validateOnly).toBe(true);
      expect(response.valid).toBe(false);
      expect(response.missingFields).toContain('commits');
    });

    it('should not apply changes when validateOnly is true', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', { task1: { ...fullTaskInProgress } });

      await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'To Validate', commits: [validCommit], pipelineStatus: validPipelineStatus },
        validateOnly: true
      });

      // Card should still be In Progress (validateOnly does not write)
      const db = (await import('./__mocks__/firebase.js')).getDatabase();
      const snap = await db.ref('/cards/TestProject/TASKS_TestProject/task1').once('value');
      expect(snap.val().status).toBe('In Progress');
    });

    it('should report MCP-restricted status as error in validateOnly mode', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: { cardId: 'TP-TSK-0001', title: 'Test Task', status: 'To Validate' }
      });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { status: 'Done&Validated' },
        validateOnly: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.statusTransitionValidation.errors.some(
        e => e.code === 'VALIDATOR_ONLY_STATUS'
      )).toBe(true);
    });
  });

  describe('Commits field in updateCard', () => {
    const commit1 = { hash: 'aaa111', message: 'feat: first commit', date: '2024-01-10T10:00:00Z', author: 'dev@test.com' };
    const commit2 = { hash: 'bbb222', message: 'feat: second commit', date: '2024-01-11T10:00:00Z', author: 'dev@test.com' };
    const commit3 = { hash: 'ccc333', message: 'fix: third commit', date: '2024-01-12T10:00:00Z', author: 'dev@test.com' };

    beforeEach(() => {
      setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
      setMockRtdbData('/projects/TestProject/scoringSystem', '1-5');
      setMockRtdbData('/cards/TestProject/SPRINTS_TestProject', {
        'sprint1': { cardId: 'TP-SPR-0001', title: 'Sprint 1', status: 'Active' }
      });
    });

    it('should append new commits to existing ones', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001', validator: 'stk_001', epic: 'TP-EPC-0001',
          sprint: 'TP-SPR-0001', devPoints: 2, businessPoints: 3,
          acceptanceCriteria: 'Should work', startDate: '2024-01-01',
          commits: [commit1]
        }
      });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { commits: [commit2, commit3] }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.commits).toHaveLength(3);
      expect(response.card.commits[0].hash).toBe('aaa111');
      expect(response.card.commits[1].hash).toBe('bbb222');
      expect(response.card.commits[2].hash).toBe('ccc333');
    });

    it('should deduplicate commits with the same hash', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001', validator: 'stk_001', epic: 'TP-EPC-0001',
          sprint: 'TP-SPR-0001', devPoints: 2, businessPoints: 3,
          acceptanceCriteria: 'Should work', startDate: '2024-01-01',
          commits: [commit1]
        }
      });

      const result = await updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { commits: [commit1, commit2] }
      });

      const response = JSON.parse(result.content[0].text);
      // commit1 already exists, so only commit2 should be added
      expect(response.card.commits).toHaveLength(2);
      expect(response.card.commits[0].hash).toBe('aaa111');
      expect(response.card.commits[1].hash).toBe('bbb222');
    });

    it('should throw for invalid commit format (missing hash)', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001'
        }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { commits: [{ message: 'no hash', date: '2024-01-01', author: 'dev' }] }
      })).rejects.toThrow(/hash/i);
    });

    it('should throw for invalid commit format (missing message)', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001'
        }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { commits: [{ hash: 'abc123', date: '2024-01-01', author: 'dev' }] }
      })).rejects.toThrow(/message/i);
    });

    it('should throw for invalid commit format (missing date)', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001'
        }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { commits: [{ hash: 'abc123', message: 'test', author: 'dev' }] }
      })).rejects.toThrow(/date/i);
    });

    it('should throw for invalid commit format (missing author)', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001'
        }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { commits: [{ hash: 'abc123', message: 'test', date: '2024-01-01' }] }
      })).rejects.toThrow(/author/i);
    });

    it('should throw when commits is not an array', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        task1: {
          cardId: 'TP-TSK-0001', title: 'Test Task', status: 'In Progress',
          developer: 'dev_001'
        }
      });

      await expect(updateCard({
        projectId: 'TestProject', type: 'task', firebaseId: 'task1',
        updates: { commits: 'not an array' }
      })).rejects.toThrow(/array/i);
    });

    it('should work for bug commits too', async () => {
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        bug1: {
          cardId: 'TP-BUG-0001', title: 'Test Bug', status: 'Assigned',
          developer: 'dev_001', commits: [commit1]
        }
      });

      const result = await updateCard({
        projectId: 'TestProject', type: 'bug', firebaseId: 'bug1',
        updates: { commits: [commit2] }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.commits).toHaveLength(2);
    });
  });
});

/**
 * Tests for workCycles feature in cards.js
 * Tracks work cycles (start/end) when tasks move through In Progress status,
 * especially for Reopened tasks with multiple cycles.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resetMockData,
  setMockRtdbData
} from '../../mcp/tests/__mocks__/firebase.js';

vi.mock('../../mcp/firebase-adapter.js', async () => {
  const mock = await import('../../mcp/tests/__mocks__/firebase.js');
  return {
    getDatabase: mock.getDatabase,
    getFirestore: mock.getFirestore
  };
});

const { updateCard } = await import('../../mcp/tools/cards.js');
const { invalidateCache } = await import('../../mcp/services/list-service.js');

function setupMockLists() {
  setMockRtdbData('/data/statusList/task-card', {
    'To Do': 1,
    'In Progress': 2,
    'To Validate': 3,
    'Done&Validated': 4,
    'Blocked': 5,
    'Reopened': 6,
    'Pausado': 7
  });
  setMockRtdbData('/data/bugpriorityList', {
    'Application Blocker': 1
  });
  setMockRtdbData('/data/statusList/bug-card', {
    'Created': 1
  });
}

/**
 * Creates a complete task with all required fields to pass validation.
 */
function createCompleteTask(overrides = {}) {
  return {
    cardId: 'TP-TSK-0001',
    title: 'Test Task',
    status: 'To Do',
    developer: 'dev_123',
    validator: 'stk_456',
    epic: 'TP-EPC-0001',
    devPoints: 2,
    businessPoints: 3,
    acceptanceCriteria: 'Should work',
    sprint: 'TP-SPR-0001',
    ...overrides
  };
}

describe('workCycles feature', () => {
  beforeEach(() => {
    resetMockData();
    invalidateCache();
    setupMockLists();
  });

  describe('opening a work cycle when moving to In Progress', () => {
    it('should create workCycles array with first cycle when moving To Do → In Progress', async () => {
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({ status: 'To Do' })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toBeDefined();
      expect(response.card.workCycles).toHaveLength(1);
      expect(response.card.workCycles[0].cycleNumber).toBe(1);
      expect(response.card.workCycles[0].startDate).toBeDefined();
      expect(response.card.workCycles[0].endDate).toBeNull();
      expect(response.card.workCycles[0].durationMs).toBe(0);
    });

    it('should create a new cycle when moving Reopened → In Progress', async () => {
      const existingCycles = [
        { cycleNumber: 1, startDate: '2026-03-01T10:00:00.000Z', endDate: '2026-03-02T15:00:00.000Z', durationMs: 104400000 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'Reopened',
          startDate: '2026-03-01',
          workCycles: existingCycles,
          totalWorkDurationMs: 104400000
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(2);
      expect(response.card.workCycles[1].cycleNumber).toBe(2);
      expect(response.card.workCycles[1].startDate).toBeDefined();
      expect(response.card.workCycles[1].endDate).toBeNull();
      expect(response.card.workCycles[1].durationMs).toBe(0);
      // First cycle unchanged
      expect(response.card.workCycles[0]).toEqual(existingCycles[0]);
    });

    it('should create a new cycle when moving Pausado → In Progress', async () => {
      const existingCycles = [
        { cycleNumber: 1, startDate: '2026-03-01T10:00:00.000Z', endDate: '2026-03-01T12:00:00.000Z', durationMs: 7200000 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'Pausado',
          startDate: '2026-03-01',
          workCycles: existingCycles,
          totalWorkDurationMs: 7200000
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(2);
      expect(response.card.workCycles[1].cycleNumber).toBe(2);
      expect(response.card.workCycles[1].endDate).toBeNull();
    });

    it('should create a new cycle when moving Blocked → In Progress', async () => {
      const existingCycles = [
        { cycleNumber: 1, startDate: '2026-03-01T10:00:00.000Z', endDate: '2026-03-01T14:00:00.000Z', durationMs: 14400000 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'Blocked',
          startDate: '2026-03-01',
          workCycles: existingCycles,
          totalWorkDurationMs: 14400000
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(2);
      expect(response.card.workCycles[1].cycleNumber).toBe(2);
    });
  });

  describe('closing a work cycle when leaving In Progress', () => {
    it('should close the open cycle when moving In Progress → To Validate', async () => {
      const cycleStartDate = '2026-03-10T08:00:00.000Z';
      const openCycles = [
        { cycleNumber: 1, startDate: cycleStartDate, endDate: null, durationMs: 0 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'In Progress',
          startDate: '2026-03-10',
          workCycles: openCycles,
          totalWorkDurationMs: 0
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [{ hash: 'abc123', message: 'feat: test', date: '2026-03-10T10:00:00Z', author: 'dev' }],
          pipelineStatus: { prCreated: { date: '2026-03-10T10:30:00Z', prUrl: 'https://github.com/test/pr/1', prNumber: 1 } }
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(1);
      expect(response.card.workCycles[0].endDate).not.toBeNull();
      expect(response.card.workCycles[0].durationMs).toBeGreaterThan(0);
      expect(response.card.totalWorkDurationMs).toBeGreaterThan(0);
      expect(response.card.totalWorkDurationMs).toBe(response.card.workCycles[0].durationMs);
    });

    it('should close the open cycle when moving In Progress → Pausado', async () => {
      const cycleStartDate = '2026-03-10T08:00:00.000Z';
      const openCycles = [
        { cycleNumber: 1, startDate: cycleStartDate, endDate: null, durationMs: 0 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'In Progress',
          startDate: '2026-03-10',
          workCycles: openCycles,
          totalWorkDurationMs: 0
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'Pausado' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles[0].endDate).not.toBeNull();
      expect(response.card.workCycles[0].durationMs).toBeGreaterThan(0);
      expect(response.card.totalWorkDurationMs).toBe(response.card.workCycles[0].durationMs);
    });

    it('should close the open cycle when moving In Progress → Blocked', async () => {
      const cycleStartDate = '2026-03-10T08:00:00.000Z';
      const openCycles = [
        { cycleNumber: 1, startDate: cycleStartDate, endDate: null, durationMs: 0 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'In Progress',
          startDate: '2026-03-10',
          workCycles: openCycles,
          totalWorkDurationMs: 0
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: {
          status: 'Blocked',
          blockedByDevelopment: true,
          bbdWhy: 'Dependency not ready',
          bbdWho: 'dev_456'
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles[0].endDate).not.toBeNull();
      expect(response.card.workCycles[0].durationMs).toBeGreaterThan(0);
      expect(response.card.totalWorkDurationMs).toBe(response.card.workCycles[0].durationMs);
    });

    it('should close the open cycle when moving In Progress → To Do', async () => {
      const cycleStartDate = '2026-03-10T08:00:00.000Z';
      const openCycles = [
        { cycleNumber: 1, startDate: cycleStartDate, endDate: null, durationMs: 0 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'In Progress',
          startDate: '2026-03-10',
          workCycles: openCycles,
          totalWorkDurationMs: 0
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'To Do' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles[0].endDate).not.toBeNull();
      expect(response.card.workCycles[0].durationMs).toBeGreaterThan(0);
      expect(response.card.totalWorkDurationMs).toBe(response.card.workCycles[0].durationMs);
    });
  });

  describe('multiple cycles with accumulated duration', () => {
    it('should accumulate totalWorkDurationMs across multiple cycles', async () => {
      const closedCycles = [
        { cycleNumber: 1, startDate: '2026-03-01T10:00:00.000Z', endDate: '2026-03-01T15:00:00.000Z', durationMs: 18000000 },
        { cycleNumber: 2, startDate: '2026-03-05T09:00:00.000Z', endDate: null, durationMs: 0 }
      ];
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'In Progress',
          startDate: '2026-03-01',
          workCycles: closedCycles,
          totalWorkDurationMs: 18000000
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [{ hash: 'def456', message: 'feat: second pass', date: '2026-03-05T12:00:00Z', author: 'dev' }],
          pipelineStatus: { prCreated: { date: '2026-03-05T12:30:00Z', prUrl: 'https://github.com/test/pr/2', prNumber: 2 } }
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(2);
      expect(response.card.workCycles[1].endDate).not.toBeNull();
      expect(response.card.workCycles[1].durationMs).toBeGreaterThan(0);
      // Total should be sum of both cycles
      const expectedTotal = response.card.workCycles[0].durationMs + response.card.workCycles[1].durationMs;
      expect(response.card.totalWorkDurationMs).toBe(expectedTotal);
    });

    it('should handle full Reopened cycle: To Do → In Progress → To Validate → Reopened → In Progress → To Validate', async () => {
      // Step 1: To Do → In Progress (opens cycle 1)
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({ status: 'To Do' })
      });

      let result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });
      let response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(1);
      expect(response.card.workCycles[0].cycleNumber).toBe(1);
      expect(response.card.workCycles[0].endDate).toBeNull();

      // Step 2: In Progress → To Validate (closes cycle 1)
      result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [{ hash: 'aaa111', message: 'feat: initial', date: '2026-03-10T10:00:00Z', author: 'dev' }],
          pipelineStatus: { prCreated: { date: '2026-03-10T10:30:00Z', prUrl: 'https://github.com/test/pr/1', prNumber: 1 } }
        }
      });
      response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(1);
      expect(response.card.workCycles[0].endDate).not.toBeNull();
      expect(response.card.workCycles[0].durationMs).toBeGreaterThanOrEqual(0);
      const cycle1Duration = response.card.workCycles[0].durationMs;

      // Step 3: Simulate Reopened status (set directly, as MCP can't do this transition)
      // Reconstruct full card (response.card is now summary-only) with closed cycle and Reopened status
      const fullCardData = createCompleteTask({
        status: 'Reopened',
        startDate: '2026-03-10T09:00:00',
        endDate: '2026-03-10T17:00:00',
        workCycles: response.card.workCycles,
        totalWorkDurationMs: response.card.totalWorkDurationMs || 0
      });
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': fullCardData
      });

      // Step 4: Reopened → In Progress (opens cycle 2)
      result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });
      response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(2);
      expect(response.card.workCycles[1].cycleNumber).toBe(2);
      expect(response.card.workCycles[1].endDate).toBeNull();

      // Step 5: In Progress → To Validate (closes cycle 2)
      result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [{ hash: 'bbb222', message: 'fix: reopened fixes', date: '2026-03-10T14:00:00Z', author: 'dev' }],
          pipelineStatus: { prCreated: { date: '2026-03-10T14:30:00Z', prUrl: 'https://github.com/test/pr/3', prNumber: 3 } }
        }
      });
      response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toHaveLength(2);
      expect(response.card.workCycles[1].endDate).not.toBeNull();
      expect(response.card.workCycles[1].durationMs).toBeGreaterThanOrEqual(0);
      // Total is sum of both
      expect(response.card.totalWorkDurationMs).toBe(cycle1Duration + response.card.workCycles[1].durationMs);
    });
  });

  describe('edge cases', () => {
    it('should handle legacy cards without workCycles when moving to In Progress', async () => {
      // Card already In Progress but no workCycles (legacy)
      // Moving to To Validate should not crash
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'In Progress',
          startDate: '2026-03-01'
          // No workCycles field
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: {
          status: 'To Validate',
          commits: [{ hash: 'legacy1', message: 'feat: legacy', date: '2026-03-10T10:00:00Z', author: 'dev' }],
          pipelineStatus: { prCreated: { date: '2026-03-10T10:30:00Z', prUrl: 'https://github.com/test/pr/4', prNumber: 4 } }
        }
      });

      const response = JSON.parse(result.content[0].text);
      // Should not crash, workCycles remains undefined for legacy cards
      expect(response.card.status).toBe('To Validate');
    });

    it('should not add workCycles for bug cards', async () => {
      setMockRtdbData('/data/statusList/bug-card', {
        'Created': 1,
        'In Progress': 2,
        'Fixed': 3,
        'Done&Validated': 4,
        'Rejected': 5
      });
      setMockRtdbData('/cards/TestProject/BUGS_TestProject', {
        'bug1': {
          cardId: 'TP-BUG-0001',
          title: 'Test Bug',
          status: 'Created',
          description: 'A bug'
        }
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'bug',
        firebaseId: 'bug1',
        updates: { status: 'In Progress', developer: 'dev_001', startDate: '2026-01-01T09:00:00' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toBeUndefined();
    });

    it('should initialize workCycles when card has no cycles but enters In Progress from Reopened', async () => {
      // Card was set to Reopened externally (via UI) without workCycles
      setMockRtdbData('/cards/TestProject/TASKS_TestProject', {
        'task1': createCompleteTask({
          status: 'Reopened',
          startDate: '2026-03-01'
          // No workCycles
        })
      });

      const result = await updateCard({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: 'task1',
        updates: { status: 'In Progress' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.card.workCycles).toBeDefined();
      expect(response.card.workCycles).toHaveLength(1);
      expect(response.card.workCycles[0].cycleNumber).toBe(1);
    });
  });
});

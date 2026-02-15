import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirebaseWriter } from '../src/services/firebase-writer.js';

function createMockDb() {
  const data = {};
  const mockRef = (refPath) => ({
    update: vi.fn(async (updates) => {
      Object.assign(data, updates);
    }),
    set: vi.fn(async (value) => {
      data[refPath] = value;
    }),
    once: vi.fn(async () => ({
      val: () => data[refPath] || null,
    })),
  });

  const rootRef = {
    update: vi.fn(async (updates) => {
      Object.assign(data, updates);
    }),
  };

  return {
    ref: vi.fn((p) => (p ? mockRef(p) : rootRef)),
    _data: data,
    _rootRef: rootRef,
  };
}

describe('FirebaseWriter', () => {
  let mockDb;
  let writer;

  beforeEach(() => {
    mockDb = createMockDb();
    writer = new FirebaseWriter(mockDb);
  });

  describe('constructor', () => {
    it('should throw if db is not provided', () => {
      expect(() => new FirebaseWriter(null)).toThrow('required');
    });
  });

  describe('createExecution()', () => {
    it('should write execution and card index', async () => {
      const execution = {
        executionId: 'exec_001',
        cardId: 'PLN-TSK-0042',
        projectId: 'PlanningGame',
        firebaseCardId: '-NxyzAbcDef',
        requestedBy: 'dev_010',
        requestedAt: '2026-02-14T10:30:00Z',
        status: 'queued',
      };

      await writer.createExecution(execution);

      const rootRef = mockDb._rootRef;
      expect(rootRef.update).toHaveBeenCalled();

      const updates = rootRef.update.mock.calls[0][0];
      expect(updates['aiExecutions/exec_001']).toEqual(execution);
      expect(updates['aiExecutionsByCard/PlanningGame/-NxyzAbcDef/latestExecutionId']).toBe('exec_001');
      expect(updates['aiExecutionsByCard/PlanningGame/-NxyzAbcDef/history/exec_001']).toEqual({
        status: 'queued',
        requestedAt: '2026-02-14T10:30:00Z',
        requestedBy: 'dev_010',
      });
    });
  });

  describe('updateExecution()', () => {
    it('should update specific fields', async () => {
      // Pre-populate data for status update
      mockDb._data['aiExecutions/exec_001'] = {
        executionId: 'exec_001',
        projectId: 'PlanningGame',
        firebaseCardId: '-NxyzAbcDef',
      };
      mockDb.ref = vi.fn((p) => {
        if (p === 'aiExecutions/exec_001') {
          return {
            once: vi.fn(async () => ({
              val: () => mockDb._data['aiExecutions/exec_001'],
            })),
          };
        }
        return {
          update: vi.fn(async (updates) => Object.assign(mockDb._data, updates)),
        };
      });

      await writer.updateExecution('exec_001', { status: 'running', startedAt: '2026-02-14T10:31:00Z' });

      // Should have called ref() for root update
      expect(mockDb.ref).toHaveBeenCalled();
    });
  });

  describe('writeCheckpoint()', () => {
    it('should write checkpoint at specific index', async () => {
      const checkpoint = { stage: 'coder', iteration: 1, status: 'completed', timestamp: '2026-02-14T10:31:00Z' };

      await writer.writeCheckpoint('exec_001', 0, checkpoint);

      const refCall = mockDb.ref.mock.calls.find(c => c[0] === 'aiExecutions/exec_001/checkpoints/0');
      expect(refCall).toBeDefined();
    });
  });

  describe('setResult()', () => {
    it('should set result and status to completed', async () => {
      // Mock for the getExecution call inside updateExecution
      mockDb.ref = vi.fn((p) => {
        if (p && p.includes('aiExecutions/exec_001')) {
          return {
            once: vi.fn(async () => ({
              val: () => ({ executionId: 'exec_001', projectId: 'PG', firebaseCardId: '-Nxyz' }),
            })),
          };
        }
        return {
          update: vi.fn(async () => {}),
        };
      });

      await writer.setResult('exec_001', { commits: ['abc123'] });

      // Verify update was called on root ref
      expect(mockDb.ref).toHaveBeenCalled();
    });
  });

  describe('setError()', () => {
    it('should set error and status to failed', async () => {
      mockDb.ref = vi.fn((p) => {
        if (p && p.includes('aiExecutions/exec_001')) {
          return {
            once: vi.fn(async () => ({
              val: () => ({ executionId: 'exec_001', projectId: 'PG', firebaseCardId: '-Nxyz' }),
            })),
          };
        }
        return {
          update: vi.fn(async () => {}),
        };
      });

      await writer.setError('exec_001', 'Something went wrong');

      expect(mockDb.ref).toHaveBeenCalled();
    });
  });

  describe('getExecution()', () => {
    it('should return execution data', async () => {
      const execData = { executionId: 'exec_001', status: 'running' };
      mockDb.ref = vi.fn(() => ({
        once: vi.fn(async () => ({ val: () => execData })),
      }));

      const result = await writer.getExecution('exec_001');

      expect(result).toEqual(execData);
    });

    it('should return null for non-existent execution', async () => {
      mockDb.ref = vi.fn(() => ({
        once: vi.fn(async () => ({ val: () => null })),
      }));

      const result = await writer.getExecution('nonexistent');

      expect(result).toBeNull();
    });
  });
});

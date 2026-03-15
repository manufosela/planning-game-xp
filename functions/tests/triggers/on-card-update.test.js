/**
 * Tests for the onCardUpdate Cloud Function trigger.
 * Verifies: transition validation via domain service, WIP enforcement,
 * work cycle tracking, and notifications.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canTransition } from '@pgv2/domain/services';

// ---------------------------------------------------------------------------
// Mock firebase-admin and firebase-functions
// ---------------------------------------------------------------------------

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockAdd = vi.fn().mockResolvedValue({ id: 'notif_001' });
const mockGet = vi.fn();
const mockWhere = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => {
  const FieldValue = {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  };
  return {
    getFirestore: () => ({
      doc: (...args) => {
        mockDoc(...args);
        return { update: mockUpdate, get: mockGet };
      },
      collection: (...args) => {
        mockCollection(...args);
        return {
          doc: (id) => ({
            collection: (sub) => ({ add: mockAdd }),
            get: mockGet,
          }),
          where: (...wArgs) => {
            mockWhere(...wArgs);
            return { where: (...w2) => ({ get: mockGet }), get: mockGet };
          },
          get: mockGet,
        };
      },
    }),
    FieldValue,
  };
});

// Capture the trigger handler
let triggerHandler;
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (path, handler) => {
    triggerHandler = handler;
    return { path, handler };
  },
}));

// Import after mocks are set up
const { onCardUpdate } = await import('../../src/triggers/on-card-update.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(beforeData, afterData, params = {}) {
  return {
    params: { projectId: 'proj1', cardId: 'PLN-TSK-0001', ...params },
    data: {
      before: { data: () => beforeData },
      after: { data: () => afterData },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no other In Progress cards
  mockGet.mockResolvedValue({ docs: [] });
});

// ---------------------------------------------------------------------------
// Tests: Domain service integration
// ---------------------------------------------------------------------------

describe('onCardUpdate — transition validation via domain', () => {
  it('allows valid task transition To Do -> In Progress', async () => {
    const before = {
      status: 'To Do', type: 'task',
      developer: { id: 'dev_001' }, validator: { id: 'stk_001' },
      epic: 'EPC-001', sprint: 'SPR-001',
      devPoints: 3, businessPoints: 5,
      acceptanceCriteria: [{ given: 'x', when: 'y', then: 'z' }],
    };
    const after = { ...before, status: 'In Progress' };

    await triggerHandler(makeEvent(before, after));

    // Should NOT revert — no update with oldStatus
    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'To Do',
    );
    expect(revertCalls).toHaveLength(0);
  });

  it('reverts invalid task transition To Do -> Done', async () => {
    const before = { status: 'To Do', type: 'task', developer: { id: 'dev_001' } };
    const after = { ...before, status: 'Done' };

    await triggerHandler(makeEvent(before, after));

    // Should revert
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'To Do' }),
    );
  });

  it('reverts invalid bug transition Created -> Fixed', async () => {
    const before = { status: 'Created', type: 'bug', developer: { id: 'dev_001' } };
    const after = { ...before, status: 'Fixed' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Created' }),
    );
  });

  it('allows valid bug transition Created -> Assigned', async () => {
    const before = { status: 'Created', type: 'bug', developer: { id: 'dev_001' } };
    const after = { ...before, status: 'Assigned' };

    await triggerHandler(makeEvent(before, after));

    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'Created',
    );
    expect(revertCalls).toHaveLength(0);
  });

  it('does nothing when status has not changed', async () => {
    const data = { status: 'To Do', type: 'task' };
    await triggerHandler(makeEvent(data, data));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: WIP enforcement
// ---------------------------------------------------------------------------

describe('onCardUpdate — WIP enforcement', () => {
  it('reverts when developer already has In Progress card', async () => {
    const before = { status: 'To Do', type: 'task', developer: { id: 'dev_001' } };
    const after = { ...before, status: 'In Progress' };

    // Mock: other projects exist and have In Progress cards
    mockGet
      .mockResolvedValueOnce({ docs: [] }) // projects query — will be overridden below
      .mockResolvedValueOnce({
        // projects collection
        docs: [{ id: 'proj2' }],
      })
      .mockResolvedValueOnce({
        // cards query for proj2
        docs: [{ id: 'PLN-TSK-0099' }],
      });

    await triggerHandler(makeEvent(before, after));

    // Should revert due to WIP
    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'To Do',
    );
    expect(revertCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Notifications
// ---------------------------------------------------------------------------

describe('onCardUpdate — notifications', () => {
  it('notifies validator when status changes to To Validate', async () => {
    const before = { status: 'In Progress', type: 'task', developer: { id: 'dev_001' }, validator: { id: 'stk_001' }, title: 'Test', startDate: '2026-01-01', commits: [{ hash: 'abc' }] };
    const after = { ...before, status: 'To Validate' };

    await triggerHandler(makeEvent(before, after));

    // Should write notification for validator
    expect(mockAdd).toHaveBeenCalled();
  });

  it('notifies developer when status changes to Reopened', async () => {
    const before = { status: 'To Validate', type: 'task', developer: { id: 'dev_001' }, validator: { id: 'stk_001' }, title: 'Test' };
    const after = { ...before, status: 'Reopened' };

    // canTransition for To Validate -> Reopened requires validatorOnly
    // Our trigger uses systemUser with superadmin role, so it should pass
    await triggerHandler(makeEvent(before, after));

    expect(mockAdd).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Domain canTransition is consistent
// ---------------------------------------------------------------------------

describe('Domain canTransition consistency', () => {
  const systemUser = { uid: 'system', role: 'superadmin' };

  it('rejects To Do -> Done', () => {
    const card = { type: 'task', status: 'To Do' };
    const result = canTransition(card, 'Done', systemUser);
    expect(result.allowed).toBe(false);
  });

  it('allows To Do -> In Progress with all fields', () => {
    const card = {
      type: 'task',
      status: 'To Do',
      developer: { id: 'd1' },
      validator: { id: 'v1' },
      epic: 'e1',
      sprint: 's1',
      devPoints: 3,
      businessPoints: 5,
      acceptanceCriteria: [{ given: 'x', when: 'y', then: 'z' }],
    };
    const result = canTransition(card, 'In Progress', systemUser);
    expect(result.allowed).toBe(true);
  });

  it('rejects Created -> Fixed for bug', () => {
    const card = { type: 'bug', status: 'Created' };
    const result = canTransition(card, 'Fixed', systemUser);
    expect(result.allowed).toBe(false);
  });

  it('allows Created -> Assigned for bug with developer', () => {
    const card = { type: 'bug', status: 'Created', developer: { id: 'd1' } };
    const result = canTransition(card, 'Assigned', systemUser);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Validator-only transitions
// ---------------------------------------------------------------------------

describe('onCardUpdate — validator-only transitions', () => {
  it('allows To Validate -> Done via systemUser (superadmin)', async () => {
    const before = {
      status: 'To Validate', type: 'task',
      developer: { id: 'dev_001' }, validator: { id: 'stk_001' },
      title: 'Test', startDate: '2026-01-01', commits: [{ hash: 'abc' }],
    };
    const after = { ...before, status: 'Done' };

    await triggerHandler(makeEvent(before, after));

    // Trigger uses systemUser with superadmin — should NOT revert
    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'To Validate',
    );
    expect(revertCalls).toHaveLength(0);
  });

  it('allows To Validate -> Reopened via systemUser', async () => {
    const before = {
      status: 'To Validate', type: 'task',
      developer: { id: 'dev_001' }, validator: { id: 'stk_001' },
      title: 'Test',
    };
    const after = { ...before, status: 'Reopened' };

    await triggerHandler(makeEvent(before, after));

    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'To Validate',
    );
    expect(revertCalls).toHaveLength(0);
  });

  it('allows Done -> Done&Validated via systemUser', async () => {
    const before = {
      status: 'Done', type: 'task',
      developer: { id: 'dev_001' }, validator: { id: 'stk_001' },
      title: 'Test',
    };
    const after = { ...before, status: 'Done&Validated' };

    await triggerHandler(makeEvent(before, after));

    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'Done',
    );
    expect(revertCalls).toHaveLength(0);
  });

  it('allows Fixed -> Verified for bug via systemUser', async () => {
    const before = {
      status: 'Fixed', type: 'bug',
      developer: { id: 'dev_001' }, validator: { id: 'stk_001' },
      title: 'Bug test',
    };
    const after = { ...before, status: 'Verified' };

    await triggerHandler(makeEvent(before, after));

    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'Fixed',
    );
    expect(revertCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Required-field enforcement
// ---------------------------------------------------------------------------

describe('onCardUpdate — required-field enforcement', () => {
  it('reverts To Do -> In Progress when developer is missing', async () => {
    const before = {
      status: 'To Do', type: 'task',
      validator: { id: 'stk_001' }, epic: 'e1', sprint: 's1',
      devPoints: 3, businessPoints: 5,
      acceptanceCriteria: [{ given: 'x', when: 'y', then: 'z' }],
    };
    const after = { ...before, status: 'In Progress' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'To Do' }),
    );
  });

  it('reverts To Do -> In Progress when acceptanceCriteria is missing', async () => {
    const before = {
      status: 'To Do', type: 'task',
      developer: { id: 'dev_001' }, validator: { id: 'stk_001' },
      epic: 'e1', sprint: 's1', devPoints: 3, businessPoints: 5,
    };
    const after = { ...before, status: 'In Progress' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'To Do' }),
    );
  });

  it('reverts To Do -> In Progress when sprint is missing', async () => {
    const before = {
      status: 'To Do', type: 'task',
      developer: { id: 'dev_001' }, validator: { id: 'stk_001' },
      epic: 'e1', devPoints: 3, businessPoints: 5,
      acceptanceCriteria: [{ given: 'x', when: 'y', then: 'z' }],
    };
    const after = { ...before, status: 'In Progress' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'To Do' }),
    );
  });

  it('reverts In Progress -> To Validate when commits are missing', async () => {
    const before = {
      status: 'In Progress', type: 'task',
      developer: { id: 'dev_001' }, startDate: '2026-01-01',
      title: 'Test',
    };
    const after = { ...before, status: 'To Validate' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'In Progress' }),
    );
  });

  it('reverts In Progress -> To Validate when startDate is missing', async () => {
    const before = {
      status: 'In Progress', type: 'task',
      developer: { id: 'dev_001' }, commits: [{ hash: 'abc' }],
      title: 'Test',
    };
    const after = { ...before, status: 'To Validate' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'In Progress' }),
    );
  });

  it('reverts Created -> Assigned for bug when developer is missing', async () => {
    const before = { status: 'Created', type: 'bug', title: 'Bug' };
    const after = { ...before, status: 'Assigned' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Created' }),
    );
  });

  it('reverts Assigned -> Fixed for bug when commits are missing', async () => {
    const before = { status: 'Assigned', type: 'bug', developer: { id: 'dev_001' }, title: 'Bug' };
    const after = { ...before, status: 'Fixed' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Assigned' }),
    );
  });

  it('reverts Verified -> Closed for bug when rootCause is missing', async () => {
    const before = { status: 'Verified', type: 'bug', developer: { id: 'dev_001' }, title: 'Bug', resolution: 'Fixed it' };
    const after = { ...before, status: 'Closed' };

    await triggerHandler(makeEvent(before, after));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Verified' }),
    );
  });

  it('allows Verified -> Closed for bug with all required fields', async () => {
    const before = {
      status: 'Verified', type: 'bug', developer: { id: 'dev_001' },
      title: 'Bug', rootCause: 'Null check missing', resolution: 'Added null guard',
    };
    const after = { ...before, status: 'Closed' };

    await triggerHandler(makeEvent(before, after));

    const revertCalls = mockUpdate.mock.calls.filter(
      (call) => call[0]?.status === 'Verified',
    );
    expect(revertCalls).toHaveLength(0);
  });
});

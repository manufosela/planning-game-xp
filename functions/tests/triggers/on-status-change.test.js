/**
 * Tests for the onStatusChange Cloud Function trigger.
 * Verifies: FCM notifications and developer backlog management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock firebase-admin and firebase-functions
// ---------------------------------------------------------------------------

const mockSend = vi.fn().mockResolvedValue('message-id');
const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockDocSet = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    send: mockSend,
  }),
}));

vi.mock('firebase-admin/firestore', () => {
  const FieldValue = {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  };
  return {
    getFirestore: () => ({
      doc: (path) => ({
        get: mockDocGet,
        update: mockDocUpdate,
        set: mockDocSet,
      }),
    }),
    FieldValue,
  };
});

let triggerHandler;
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (path, handler) => {
    triggerHandler = handler;
    return { path, handler };
  },
}));

// Import after mocks
const { onStatusChange } = await import('../../src/triggers/on-status-change.js');

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
  mockDocGet.mockResolvedValue({ exists: false });
});

// ---------------------------------------------------------------------------
// Tests: FCM notifications
// ---------------------------------------------------------------------------

describe('onStatusChange — FCM notifications', () => {
  it('sends FCM to developer when status changes and updatedBy is not developer', async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ fcmToken: 'token-dev' }),
    });

    const before = {
      status: 'To Do',
      developer: { id: 'dev_001' },
      validator: null,
      updatedBy: 'stk_001',
      type: 'task',
      title: 'Test task',
    };
    const after = { ...before, status: 'In Progress' };

    await triggerHandler(makeEvent(before, after));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'token-dev',
        notification: expect.objectContaining({
          title: 'PLN-TSK-0001: To Do -> In Progress',
        }),
      }),
    );
  });

  it('does not send FCM to developer if they made the change', async () => {
    const before = {
      status: 'To Do',
      developer: { id: 'dev_001' },
      validator: null,
      updatedBy: 'dev_001',
      type: 'task',
      title: 'Test task',
    };
    const after = { ...before, status: 'In Progress' };

    await triggerHandler(makeEvent(before, after));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not send FCM when status has not changed', async () => {
    const data = {
      status: 'To Do',
      developer: { id: 'dev_001' },
      validator: null,
      updatedBy: 'stk_001',
      type: 'task',
      title: 'Test',
    };

    await triggerHandler(makeEvent(data, data));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handles missing FCM token gracefully', async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ fcmToken: undefined }),
    });

    const before = {
      status: 'To Do',
      developer: { id: 'dev_001' },
      validator: null,
      updatedBy: 'other',
      type: 'task',
      title: 'Test',
    };
    const after = { ...before, status: 'In Progress' };

    await triggerHandler(makeEvent(before, after));

    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Backlog management
// ---------------------------------------------------------------------------

describe('onStatusChange — backlog management', () => {
  it('does nothing when neither status nor developer changed', async () => {
    const data = {
      status: 'To Do',
      developer: { id: 'dev_001' },
      validator: null,
      updatedBy: 'dev_001',
      type: 'task',
      title: 'Test',
    };

    await triggerHandler(makeEvent(data, data));

    expect(mockDocUpdate).not.toHaveBeenCalled();
    expect(mockDocSet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge cases
// ---------------------------------------------------------------------------

describe('onStatusChange — edge cases', () => {
  it('handles missing before data', async () => {
    const event = {
      params: { projectId: 'proj1', cardId: 'PLN-TSK-0001' },
      data: {
        before: { data: () => undefined },
        after: { data: () => ({ status: 'To Do' }) },
      },
    };

    await triggerHandler(event);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handles missing after data', async () => {
    const event = {
      params: { projectId: 'proj1', cardId: 'PLN-TSK-0001' },
      data: {
        before: { data: () => ({ status: 'To Do' }) },
        after: { data: () => undefined },
      },
    };

    await triggerHandler(event);

    expect(mockSend).not.toHaveBeenCalled();
  });
});

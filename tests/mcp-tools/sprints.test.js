/**
 * Tests for MCP Sprint tools - Sprint validations (PMC-TSK-0062)
 *
 * AC1: Creating a task with sprint assigned → error (sprint assigned on In Progress)
 * AC2: Only first sprint can have startDate/endDate
 * AC3: Moving task to In Progress with date outside sprint range → error
 * AC4: Sprint with In Progress/To Validate tasks → dates immutable
 * AC5: Sprint with In Progress tasks → locked=true
 * Plus: AI duration warning for sprint creation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-adapter
const mockOnce = vi.fn();
const mockSet = vi.fn().mockResolvedValue();
const mockUpdate = vi.fn().mockResolvedValue();
const mockPush = vi.fn();
const mockRef = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../mcp/firebase-adapter.js', () => ({
  getDatabase: () => ({
    ref: mockRef
  }),
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({})
    }),
    runTransaction: mockTransaction
  })
}));

// Default: AI user (geniova-mcp)
let mockUserId = 'geniova-mcp';
vi.mock('../../mcp/user.js', () => ({
  getMcpUserId: () => mockUserId,
  getMcpUser: () => ({ email: 'test@example.com', developerId: 'dev_001' }),
  isMcpUserConfigured: () => true
}));

// Mock list-service to avoid Firebase RTDB calls for resolveValue
vi.mock('../../mcp/services/list-service.js', () => ({
  getListTexts: vi.fn().mockResolvedValue([]),
  getListPairs: vi.fn().mockResolvedValue([]),
  resolveValue: vi.fn().mockImplementation((listType, value) => Promise.resolve(value))
}));

const { createSprint, updateSprint } = await import('../../mcp/tools/sprints.js');
const { createCard, updateCard } = await import('../../mcp/tools/cards.js');

function setupMockRef(abbreviation = 'TST', extraHandlers = {}) {
  const pushKey = '-newSprintKey';
  mockPush.mockReturnValue({
    key: pushKey,
    set: mockSet
  });

  mockRef.mockImplementation((path) => {
    if (path.includes('/abbreviation')) {
      return {
        once: vi.fn().mockResolvedValue({ val: () => abbreviation })
      };
    }
    // Allow custom handlers by path pattern (check longest patterns first)
    const sortedPatterns = Object.keys(extraHandlers).sort((a, b) => b.length - a.length);
    for (const pattern of sortedPatterns) {
      if (path.includes(pattern)) {
        return extraHandlers[pattern](path);
      }
    }
    return {
      once: mockOnce,
      set: mockSet,
      update: mockUpdate,
      push: () => mockPush()
    };
  });

  // Mock Firestore transaction for counter
  mockTransaction.mockImplementation(async (fn) => {
    const mockDocSnap = { exists: true, data: () => ({ lastId: 5 }) };
    const mockTransactionObj = {
      get: vi.fn().mockResolvedValue(mockDocSnap),
      set: vi.fn()
    };
    return fn(mockTransactionObj);
  });
}

// ──────────────────────────────────────────────
// AI duration warning tests (existing)
// ──────────────────────────────────────────────
describe('MCP Sprint tools - AI duration warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 'geniova-mcp';
  });

  it('should warn when AI creates a sprint longer than 1 day', async () => {
    setupMockRef();
    // No existing sprints
    mockOnce.mockResolvedValue({ val: () => null });

    const result = await createSprint({
      projectId: 'TestProject',
      title: 'Sprint 1',
      startDate: '2026-03-07',
      endDate: '2026-03-21' // 14 days
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toBeDefined();
    expect(data.warning).toContain('14 days');
    expect(data.warning).toContain('AI agent');
    expect(data.durationDays).toBe(14);
  });

  it('should not warn when AI creates a 1-day sprint', async () => {
    setupMockRef();
    mockOnce.mockResolvedValue({ val: () => null });

    const result = await createSprint({
      projectId: 'TestProject',
      title: 'Sprint AI',
      startDate: '2026-03-07',
      endDate: '2026-03-08' // 1 day
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toBeUndefined();
    expect(data.durationDays).toBe(1);
  });

  it('should not warn when AI creates a same-day sprint', async () => {
    setupMockRef();
    mockOnce.mockResolvedValue({ val: () => null });

    const result = await createSprint({
      projectId: 'TestProject',
      title: 'Sprint AI Quick',
      startDate: '2026-03-07',
      endDate: '2026-03-07' // same day
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toBeUndefined();
    expect(data.durationDays).toBe(0);
  });

  it('should not warn when a human creates a long sprint', async () => {
    mockUserId = 'human@example.com';
    setupMockRef();
    mockOnce.mockResolvedValue({ val: () => null });

    const result = await createSprint({
      projectId: 'TestProject',
      title: 'Sprint Humano',
      startDate: '2026-03-07',
      endDate: '2026-03-21' // 14 days, but human
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toBeUndefined();
    expect(data.durationDays).toBe(14);
  });

  it('should include durationDays in response regardless of warning', async () => {
    mockUserId = 'human@example.com';
    setupMockRef();
    mockOnce.mockResolvedValue({ val: () => null });

    const result = await createSprint({
      projectId: 'TestProject',
      title: 'Sprint Normal',
      startDate: '2026-03-01',
      endDate: '2026-03-15'
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.durationDays).toBe(14);
    expect(data.cardId).toBeDefined();
    expect(data.message).toBe('Sprint created successfully');
  });
});

// ──────────────────────────────────────────────
// AC2: Only first sprint can have startDate/endDate
// ──────────────────────────────────────────────
describe('MCP Sprint tools - AC2: Only first sprint with dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 'geniova-mcp';
  });

  it('should allow first sprint with startDate and endDate', async () => {
    setupMockRef();
    // No existing sprints
    mockOnce.mockResolvedValue({ val: () => null });

    const result = await createSprint({
      projectId: 'TestProject',
      title: 'Sprint 1',
      startDate: '2026-03-01',
      endDate: '2026-03-15'
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Sprint created successfully');
    expect(data.startDate).toBe('2026-03-01');
    expect(data.endDate).toBe('2026-03-15');
  });

  it('should reject second sprint with startDate/endDate', async () => {
    setupMockRef();
    // One existing sprint
    mockOnce.mockResolvedValue({
      val: () => ({
        '-sprint1': {
          cardId: 'TST-SPR-0001',
          title: 'Sprint 1',
          startDate: '2026-03-01',
          endDate: '2026-03-15'
        }
      })
    });

    await expect(createSprint({
      projectId: 'TestProject',
      title: 'Sprint 2',
      startDate: '2026-03-16',
      endDate: '2026-03-31'
    })).rejects.toThrow(/dates/i);
  });

  it('should allow second sprint without dates', async () => {
    setupMockRef();
    // One existing sprint
    mockOnce.mockResolvedValue({
      val: () => ({
        '-sprint1': {
          cardId: 'TST-SPR-0001',
          title: 'Sprint 1',
          startDate: '2026-03-01',
          endDate: '2026-03-15'
        }
      })
    });

    const result = await createSprint({
      projectId: 'TestProject',
      title: 'Sprint 2'
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Sprint created successfully');
  });
});

// ──────────────────────────────────────────────
// AC4: Sprint dates immutable when tasks active
// ──────────────────────────────────────────────
describe('MCP Sprint tools - AC4: Immutable dates with active tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 'geniova-mcp';
  });

  it('should reject date change when sprint has In Progress tasks', async () => {
    const sprintCardId = 'TST-SPR-0001';
    const sprintFirebaseId = '-sprint1';

    const sprintOnce = vi.fn().mockResolvedValue({
      exists: () => true,
      val: () => ({
        cardId: sprintCardId,
        title: 'Sprint 1',
        startDate: '2026-03-01',
        endDate: '2026-03-15'
      })
    });
    const taskOnce = vi.fn().mockResolvedValue({
      val: () => ({
        '-task1': {
          cardId: 'TST-TSK-0001',
          status: 'In Progress',
          sprint: sprintCardId
        }
      })
    });

    setupMockRef('TST', {
      [`SPRINTS_TestProject/${sprintFirebaseId}`]: () => ({
        once: sprintOnce,
        update: mockUpdate
      }),
      ['TASKS_TestProject']: () => ({
        once: taskOnce
      })
    });

    await expect(updateSprint({
      projectId: 'TestProject',
      firebaseId: sprintFirebaseId,
      updates: { startDate: '2026-03-05' }
    })).rejects.toThrow(/immutable|cannot.*change.*date/i);
  });

  it('should reject date change when sprint has To Validate tasks', async () => {
    const sprintCardId = 'TST-SPR-0001';
    const sprintFirebaseId = '-sprint1';

    const sprintOnce = vi.fn().mockResolvedValue({
      exists: () => true,
      val: () => ({
        cardId: sprintCardId,
        title: 'Sprint 1',
        startDate: '2026-03-01',
        endDate: '2026-03-15'
      })
    });
    const taskOnce = vi.fn().mockResolvedValue({
      val: () => ({
        '-task1': {
          cardId: 'TST-TSK-0001',
          status: 'To Validate',
          sprint: sprintCardId
        }
      })
    });

    setupMockRef('TST', {
      [`SPRINTS_TestProject/${sprintFirebaseId}`]: () => ({
        once: sprintOnce,
        update: mockUpdate
      }),
      ['TASKS_TestProject']: () => ({
        once: taskOnce
      })
    });

    await expect(updateSprint({
      projectId: 'TestProject',
      firebaseId: sprintFirebaseId,
      updates: { endDate: '2026-03-20' }
    })).rejects.toThrow(/immutable|cannot.*change.*date/i);
  });

  it('should allow date change when sprint has no active tasks', async () => {
    const sprintCardId = 'TST-SPR-0001';
    const sprintFirebaseId = '-sprint1';

    const sprintData = {
      cardId: sprintCardId,
      title: 'Sprint 1',
      startDate: '2026-03-01',
      endDate: '2026-03-15'
    };

    const sprintOnce = vi.fn()
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ ...sprintData })
      })
      .mockResolvedValueOnce({
        val: () => ({ ...sprintData, startDate: '2026-03-05' })
      });
    const taskOnce = vi.fn().mockResolvedValue({
      val: () => ({
        '-task1': {
          cardId: 'TST-TSK-0001',
          status: 'Done',
          sprint: sprintCardId
        }
      })
    });

    setupMockRef('TST', {
      [`SPRINTS_TestProject/${sprintFirebaseId}`]: () => ({
        once: sprintOnce,
        update: mockUpdate
      }),
      ['TASKS_TestProject']: () => ({
        once: taskOnce
      })
    });

    const result = await updateSprint({
      projectId: 'TestProject',
      firebaseId: sprintFirebaseId,
      updates: { startDate: '2026-03-05' }
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Sprint updated successfully');
  });
});

// ──────────────────────────────────────────────
// AC1: Reject sprint in createCard for tasks
// ──────────────────────────────────────────────
describe('MCP Sprint tools - AC1: Reject sprint on task creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 'geniova-mcp';
  });

  it('should reject creating a task with sprint assigned', async () => {
    setupMockRef();
    mockOnce.mockResolvedValue({
      val: () => ({
        '-epic1': {
          cardId: 'TST-EPC-0001',
          title: 'Epic 1',
          status: 'Open'
        }
      })
    });

    await expect(createCard({
      projectId: 'TestProject',
      type: 'task',
      title: 'Test task',
      descriptionStructured: [{ role: 'developer', goal: 'test', benefit: 'testing' }],
      acceptanceCriteriaStructured: [{ given: 'ctx', when: 'act', then: 'res' }],
      epic: 'TST-EPC-0001',
      sprint: 'TST-SPR-0001'
    })).rejects.toThrow(/sprint.*In Progress|sprint.*assigned.*In Progress/i);
  });

  it('should allow creating a task without sprint', async () => {
    setupMockRef();
    mockOnce.mockResolvedValue({
      val: () => ({
        '-epic1': {
          cardId: 'TST-EPC-0001',
          title: 'Epic 1',
          status: 'Open'
        }
      })
    });

    const result = await createCard({
      projectId: 'TestProject',
      type: 'task',
      title: 'Test task',
      descriptionStructured: [{ role: 'developer', goal: 'test', benefit: 'testing' }],
      acceptanceCriteriaStructured: [{ given: 'ctx', when: 'act', then: 'res' }],
      epic: 'TST-EPC-0001',
      validator: 'stk_001'
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Card created successfully');
  });

  it('should allow creating a bug with sprint (no restriction for bugs)', async () => {
    setupMockRef();
    // Mock sprint exists
    mockOnce.mockResolvedValue({
      val: () => ({
        '-sprint1': {
          cardId: 'TST-SPR-0001',
          title: 'Sprint 1'
        }
      })
    });

    const result = await createCard({
      projectId: 'TestProject',
      type: 'bug',
      title: 'Test bug',
      description: 'A bug description',
      sprint: 'TST-SPR-0001'
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Card created successfully');
  });
});

// ──────────────────────────────────────────────
// AC3: Validate sprint date range on In Progress
// ──────────────────────────────────────────────
describe('MCP Sprint tools - AC3: Sprint date range on In Progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 'geniova-mcp';
  });

  it('should reject moving task to In Progress when today is outside sprint date range', async () => {
    const taskFirebaseId = '-task1';
    const sprintCardId = 'TST-SPR-0001';

    const taskOnce = vi.fn().mockResolvedValue({
      exists: () => true,
      val: () => ({
        cardId: 'TST-TSK-0001',
        title: 'Test task',
        status: 'To Do',
        sprint: sprintCardId,
        developer: 'dev_001',
        validator: 'stk_001',
        devPoints: 2,
        businessPoints: 3,
        acceptanceCriteria: 'Some criteria',
        epic: 'TST-EPC-0001'
      })
    });
    const sprintOnce = vi.fn().mockResolvedValue({
      val: () => ({
        '-sprint1': {
          cardId: sprintCardId,
          title: 'Sprint 1',
          startDate: '2025-01-01',
          endDate: '2025-01-15'
        }
      })
    });

    setupMockRef('TST', {
      [`TASKS_TestProject/${taskFirebaseId}`]: () => ({
        once: taskOnce,
        update: mockUpdate
      }),
      ['SPRINTS_TestProject']: () => ({
        once: sprintOnce
      }),
      ['/scoringSystem']: () => ({
        once: vi.fn().mockResolvedValue({ val: () => '1-5' })
      })
    });

    await expect(updateCard({
      projectId: 'TestProject',
      type: 'task',
      firebaseId: taskFirebaseId,
      updates: {
        status: 'In Progress',
        developer: 'dev_001',
        validator: 'stk_001',
        sprint: sprintCardId,
        devPoints: 2,
        businessPoints: 3,
        acceptanceCriteria: 'Some criteria',
        epic: 'TST-EPC-0001'
      }
    })).rejects.toThrow(/sprint.*date|date.*sprint/i);
  });

  it('should allow moving task to In Progress when sprint has no dates (skip validation)', async () => {
    const taskFirebaseId = '-task1';
    const sprintCardId = 'TST-SPR-0001';
    const sprintFirebaseId = '-sprint1';

    const taskData = {
      cardId: 'TST-TSK-0001',
      title: 'Test task',
      status: 'To Do',
      sprint: sprintCardId,
      developer: 'dev_001',
      validator: 'stk_001',
      devPoints: 2,
      businessPoints: 3,
      acceptanceCriteria: 'Some criteria',
      epic: 'TST-EPC-0001'
    };

    const taskOnce = vi.fn()
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ ...taskData })
      })
      .mockResolvedValueOnce({
        val: () => ({ ...taskData, status: 'In Progress' })
      });
    const sprintOnce = vi.fn().mockResolvedValue({
      val: () => ({
        [sprintFirebaseId]: {
          cardId: sprintCardId,
          title: 'Sprint 1'
          // No startDate/endDate
        }
      })
    });
    const sprintItemUpdate = vi.fn().mockResolvedValue();

    setupMockRef('TST', {
      [`TASKS_TestProject/${taskFirebaseId}`]: () => ({
        once: taskOnce,
        update: mockUpdate
      }),
      ['SPRINTS_TestProject']: (path) => {
        if (path.includes(sprintFirebaseId)) {
          return { update: sprintItemUpdate };
        }
        return { once: sprintOnce, update: sprintItemUpdate };
      },
      ['/scoringSystem']: () => ({
        once: vi.fn().mockResolvedValue({ val: () => '1-5' })
      })
    });

    const result = await updateCard({
      projectId: 'TestProject',
      type: 'task',
      firebaseId: taskFirebaseId,
      updates: {
        status: 'In Progress',
        developer: 'dev_001',
        validator: 'stk_001',
        sprint: sprintCardId,
        devPoints: 2,
        businessPoints: 3,
        acceptanceCriteria: 'Some criteria',
        epic: 'TST-EPC-0001'
      }
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Card updated successfully');
  });
});

// ──────────────────────────────────────────────
// AC5: Auto-lock sprint on In Progress
// ──────────────────────────────────────────────
describe('MCP Sprint tools - AC5: Auto-lock sprint on In Progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 'geniova-mcp';
  });

  it('should set locked=true on sprint when task moves to In Progress', async () => {
    const taskFirebaseId = '-task1';
    const sprintCardId = 'TST-SPR-0001';
    const sprintFirebaseId = '-sprint1';
    const today = new Date().toISOString().split('T')[0];

    const sprintUpdateMock = vi.fn().mockResolvedValue();
    const taskData = {
      cardId: 'TST-TSK-0001',
      title: 'Test task',
      status: 'To Do',
      sprint: sprintCardId,
      developer: 'dev_001',
      validator: 'stk_001',
      devPoints: 2,
      businessPoints: 3,
      acceptanceCriteria: 'Some criteria',
      epic: 'TST-EPC-0001'
    };

    const taskOnce = vi.fn()
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ ...taskData })
      })
      .mockResolvedValueOnce({
        val: () => ({ ...taskData, status: 'In Progress' })
      });
    const sprintOnce = vi.fn().mockResolvedValue({
      val: () => ({
        [sprintFirebaseId]: {
          cardId: sprintCardId,
          title: 'Sprint 1',
          startDate: today,
          endDate: '2099-12-31'
        }
      })
    });

    setupMockRef('TST', {
      [`TASKS_TestProject/${taskFirebaseId}`]: () => ({
        once: taskOnce,
        update: mockUpdate
      }),
      ['SPRINTS_TestProject']: (path) => {
        if (path.includes(sprintFirebaseId)) {
          return { update: sprintUpdateMock };
        }
        return { once: sprintOnce, update: sprintUpdateMock };
      },
      ['/scoringSystem']: () => ({
        once: vi.fn().mockResolvedValue({ val: () => '1-5' })
      })
    });

    await updateCard({
      projectId: 'TestProject',
      type: 'task',
      firebaseId: taskFirebaseId,
      updates: {
        status: 'In Progress',
        developer: 'dev_001',
        validator: 'stk_001',
        sprint: sprintCardId,
        devPoints: 2,
        businessPoints: 3,
        acceptanceCriteria: 'Some criteria',
        epic: 'TST-EPC-0001'
      }
    });

    // Verify sprint was updated with locked=true
    expect(sprintUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ locked: true })
    );
  });
});

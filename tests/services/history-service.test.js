import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPushEntry = vi.fn();
const mockGetEntries = vi.fn();
const mockSubscribeToEntries = vi.fn();
const mockGetStats = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    history: {
      pushEntry: (...args) => mockPushEntry(...args),
      getEntries: (...args) => mockGetEntries(...args),
      subscribeToEntries: (...args) => mockSubscribeToEntries(...args),
      getStats: (...args) => mockGetStats(...args),
    },
  },
}));

const { historyService } = await import('../../public/js/services/history-service.js');

beforeEach(() => {
  mockPushEntry.mockReset();
  mockGetEntries.mockReset();
  mockSubscribeToEntries.mockReset();
  mockGetStats.mockReset();
  historyService.previousStates.clear();
});

describe('historyService.saveHistory', () => {
  it('saves changes via DAL history.pushEntry', async () => {
    mockPushEntry.mockResolvedValueOnce('new-key');
    const oldState = { status: 'To Do', title: 'Test', cardType: 'task-card' };
    const card = {
      projectId: 'PlanningGame',
      cardId: 'PLN-TSK-0001',
      cardType: 'task-card',
      status: 'In Progress',
      title: 'Test'
    };

    await historyService.saveHistory(card, oldState, 'user@example.com');

    expect(mockPushEntry).toHaveBeenCalledTimes(1);
    const [projectId, cardType, cardId, entry] = mockPushEntry.mock.calls[0];
    expect(projectId).toBe('PlanningGame');
    expect(cardType).toBe('tasks');
    expect(cardId).toBe('PLN-TSK-0001');
    expect(entry.changes).toHaveProperty('status');
    expect(entry.changedBy).toBe('user@example.com');
  });

  it('does not save history when there is no previous state', async () => {
    const card = {
      projectId: 'PlanningGame',
      cardId: 'PLN-TSK-0002',
      cardType: 'task-card',
      status: 'To Do',
      title: 'Test'
    };

    await historyService.saveHistory(card, null, 'user@example.com');

    expect(mockPushEntry).not.toHaveBeenCalled();
  });

  it('does not save history when there are no changes', async () => {
    const state = { projectId: 'PlanningGame', cardId: 'PLN-TSK-0003', status: 'To Do', title: 'Test', cardType: 'task-card' };
    const card = {
      projectId: 'PlanningGame',
      cardId: 'PLN-TSK-0003',
      cardType: 'task-card',
      status: 'To Do',
      title: 'Test'
    };

    await historyService.saveHistory(card, state, 'user@example.com');

    expect(mockPushEntry).not.toHaveBeenCalled();
  });
});

describe('historyService.getHistory', () => {
  it('retrieves entries via DAL history.getEntries', async () => {
    const mockEntries = [
      { id: 'e1', timestamp: '2026-01-02', changes: {} },
      { id: 'e2', timestamp: '2026-01-01', changes: {} }
    ];
    mockGetEntries.mockResolvedValueOnce(mockEntries);

    const result = await historyService.getHistory('PlanningGame', 'task-card', 'PLN-TSK-0001', 10);

    expect(mockGetEntries).toHaveBeenCalledWith('PlanningGame', 'tasks', 'PLN-TSK-0001', 10);
    expect(result).toEqual(mockEntries);
  });

  it('returns empty array on error', async () => {
    mockGetEntries.mockRejectedValueOnce(new Error('fail'));

    const result = await historyService.getHistory('PlanningGame', 'tasks', 'PLN-TSK-0001');

    expect(result).toEqual([]);
  });
});

describe('historyService.subscribeToHistory', () => {
  it('delegates to DAL history.subscribeToEntries', () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    mockSubscribeToEntries.mockReturnValueOnce(unsubscribe);

    const result = historyService.subscribeToHistory('PlanningGame', 'task-card', 'PLN-TSK-0001', callback);

    expect(mockSubscribeToEntries).toHaveBeenCalledWith('PlanningGame', 'tasks', 'PLN-TSK-0001', 50, callback);
    expect(result).toBe(unsubscribe);
  });
});

describe('historyService.getHistoryStats', () => {
  it('processes stats from DAL data', async () => {
    const data = {
      'PLN-TSK-0001': {
        'e1': { changedBy: 'user1@test.com', timestamp: '2026-01-01' },
        'e2': { changedBy: 'user2@test.com', timestamp: '2026-01-02' }
      }
    };
    mockGetStats.mockResolvedValueOnce(data);

    const stats = await historyService.getHistoryStats('PlanningGame', 'tasks');

    expect(stats.totalEntries).toBe(2);
    expect(stats.uniqueUsers).toBe(2);
    expect(stats.lastUpdate).toBe('2026-01-02');
  });

  it('returns empty stats when no data', async () => {
    mockGetStats.mockResolvedValueOnce(null);

    const stats = await historyService.getHistoryStats('PlanningGame', 'tasks');

    expect(stats).toEqual({ totalEntries: 0, cards: 0 });
  });
});

describe('historyService.migrateEmbeddedHistory', () => {
  it('pushes each embedded entry via DAL', async () => {
    mockPushEntry.mockResolvedValue('key');
    const card = {
      projectId: 'PlanningGame',
      cardId: 'PLN-TSK-0001',
      cardType: 'task-card',
      history: [
        { updatedBy: 'user1@test.com', timestamp: '2026-01-01', changes: { status: { from: 'A', to: 'B' } } },
        { user: 'user2@test.com', date: '2026-01-02' }
      ]
    };

    await historyService.migrateEmbeddedHistory(card);

    expect(mockPushEntry).toHaveBeenCalledTimes(2);
    expect(mockPushEntry.mock.calls[0][0]).toBe('PlanningGame');
    expect(mockPushEntry.mock.calls[0][1]).toBe('tasks');
    expect(mockPushEntry.mock.calls[0][2]).toBe('PLN-TSK-0001');
    expect(mockPushEntry.mock.calls[0][3].action).toBe('migrated');
  });

  it('does nothing for cards without embedded history', async () => {
    const card = { projectId: 'P', cardId: 'C', cardType: 'task-card' };

    await historyService.migrateEmbeddedHistory(card);

    expect(mockPushEntry).not.toHaveBeenCalled();
  });
});

describe('historyService.calculateDifferences', () => {
  it('detects changed fields', () => {
    const old = { status: 'To Do', title: 'Old' };
    const current = { status: 'In Progress', title: 'Old' };

    const changes = historyService.calculateDifferences(old, current);

    expect(changes).toHaveProperty('status');
    expect(changes.status).toEqual({ from: 'To Do', to: 'In Progress' });
    expect(changes).not.toHaveProperty('title');
  });

  it('ignores internal fields', () => {
    const old = { status: 'To Do' };
    const current = { status: 'To Do', updatedAt: '2026-01-01', isEditable: true };

    const changes = historyService.calculateDifferences(old, current);

    expect(Object.keys(changes)).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockGetDocs = vi.fn();
const mockAddDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
  addDoc: (...args) => mockAddDoc(...args),
}));

vi.mock('../../../src/lib/firebase.js', () => ({
  getDb: vi.fn(() => 'mock-db'),
}));

import { FirebaseStateTransitionRepository } from '../../../src/infrastructure/firebase/state-transition-repository.js';

describe('FirebaseStateTransitionRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseStateTransitionRepository();
  });

  describe('recordTransition', () => {
    it('adds transition doc to subcollection', async () => {
      mockCollection.mockReturnValue('transitions-ref');
      mockAddDoc.mockResolvedValue({ id: 't1' });

      const transition = {
        fromStatus: 'To Do',
        toStatus: 'In Progress',
        changedBy: 'u1',
        changedAt: { seconds: 1234 },
      };

      await repo.recordTransition('p1', 'c1', transition);

      expect(mockCollection).toHaveBeenCalledWith('mock-db', 'projects', 'p1', 'cards', 'c1', 'transitions');
      expect(mockAddDoc).toHaveBeenCalledWith('transitions-ref', transition);
    });
  });

  describe('getTransitions', () => {
    it('queries transitions ordered by changedAt desc', async () => {
      const docs = [
        { id: 't1', data: () => ({ fromStatus: 'To Do', toStatus: 'In Progress' }) },
      ];
      mockCollection.mockReturnValue('transitions-ref');
      mockOrderBy.mockReturnValue('order-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ docs });

      const result = await repo.getTransitions('p1', 'c1');

      expect(mockCollection).toHaveBeenCalledWith('mock-db', 'projects', 'p1', 'cards', 'c1', 'transitions');
      expect(mockOrderBy).toHaveBeenCalledWith('changedAt', 'desc');
      expect(result).toEqual([{ id: 't1', fromStatus: 'To Do', toStatus: 'In Progress' }]);
    });
  });

  describe('getMetrics', () => {
    it('computes metrics from transitions across cards', async () => {
      // Mock cards query
      const cardDocs = [
        { id: 'c1', data: () => ({ type: 'task', year: 2026, sprint: 's1', developer: 'd1' }) },
      ];

      let collectionCallCount = 0;
      mockCollection.mockImplementation((...args) => {
        collectionCallCount++;
        return `collection-ref-${collectionCallCount}`;
      });

      mockQuery.mockReturnValue('query-ref');
      mockWhere.mockReturnValue('where-constraint');

      // First getDocs call: cards; second: transitions for c1
      mockGetDocs
        .mockResolvedValueOnce({ docs: cardDocs })
        .mockResolvedValueOnce({
          docs: [
            {
              data: () => ({
                fromStatus: 'To Do',
                toStatus: 'In Progress',
                changedBy: 'u1',
                durationInPreviousStatus: 3600,
              }),
            },
            {
              data: () => ({
                fromStatus: 'In Progress',
                toStatus: 'To Validate',
                changedBy: 'u1',
                durationInPreviousStatus: 7200,
              }),
            },
          ],
        });

      const result = await repo.getMetrics('p1');

      expect(result.transitionCounts).toEqual({
        'To Do->In Progress': 1,
        'In Progress->To Validate': 1,
      });
      expect(result.avgCycleTime['To Do']).toBe(3600);
      expect(result.avgCycleTime['In Progress']).toBe(7200);
      expect(result.bottlenecks).toHaveLength(2);
      expect(result.bottlenecks[0].status).toBe('In Progress');
    });

    it('returns empty metrics when no transitions', async () => {
      mockCollection.mockReturnValue('collection-ref');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ docs: [] });

      const result = await repo.getMetrics('p1');

      expect(result).toEqual({
        avgCycleTime: {},
        transitionCounts: {},
        bottlenecks: [],
      });
    });
  });

  describe('_computeMetrics', () => {
    it('handles multiple transitions for same status', () => {
      const transitions = [
        { fromStatus: 'To Do', toStatus: 'IP', durationInPreviousStatus: 100 },
        { fromStatus: 'To Do', toStatus: 'IP', durationInPreviousStatus: 200 },
      ];

      const result = repo._computeMetrics(transitions);

      expect(result.avgCycleTime['To Do']).toBe(150);
      expect(result.transitionCounts['To Do->IP']).toBe(2);
    });
  });
});

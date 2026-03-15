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

    it('applies type filter via where clause', async () => {
      const cardDocs = [
        { id: 'c1', data: () => ({ type: 'task' }) },
      ];

      let collectionCallCount = 0;
      mockCollection.mockImplementation(() => {
        collectionCallCount++;
        return `collection-ref-${collectionCallCount}`;
      });
      mockWhere.mockReturnValue('where-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs
        .mockResolvedValueOnce({ docs: cardDocs })
        .mockResolvedValueOnce({ docs: [] });

      await repo.getMetrics('p1', { type: 'task' });

      expect(mockWhere).toHaveBeenCalledWith('type', '==', 'task');
    });

    it('skips cards not matching year/sprint/developer filters', async () => {
      const cardDocs = [
        { id: 'c1', data: () => ({ type: 'task', year: 2025, sprint: 's1', developer: 'd1' }) },
        { id: 'c2', data: () => ({ type: 'task', year: 2026, sprint: 's2', developer: 'd2' }) },
      ];

      let collectionCallCount = 0;
      mockCollection.mockImplementation(() => {
        collectionCallCount++;
        return `collection-ref-${collectionCallCount}`;
      });
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs
        .mockResolvedValueOnce({ docs: cardDocs })
        .mockResolvedValueOnce({
          docs: [{ data: () => ({ fromStatus: 'To Do', toStatus: 'IP', durationInPreviousStatus: 100 }) }],
        });

      const result = await repo.getMetrics('p1', { year: 2026, sprint: 's2', developer: 'd2' });

      // Only c2 matches all filters, so only 1 transition set fetched
      expect(result.transitionCounts).toEqual({ 'To Do->IP': 1 });
    });

    it('skips cards not matching sprint filter (year matches)', async () => {
      const cardDocs = [
        { id: 'c1', data: () => ({ type: 'task', year: 2026, sprint: 's1', developer: 'd1' }) },
      ];

      let collectionCallCount = 0;
      mockCollection.mockImplementation(() => {
        collectionCallCount++;
        return `collection-ref-${collectionCallCount}`;
      });
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValueOnce({ docs: cardDocs });

      const result = await repo.getMetrics('p1', { year: 2026, sprint: 's2' });

      expect(result.transitionCounts).toEqual({});
    });

    it('skips cards not matching developer filter (year and sprint match)', async () => {
      const cardDocs = [
        { id: 'c1', data: () => ({ type: 'task', year: 2026, sprint: 's1', developer: 'd1' }) },
      ];

      let collectionCallCount = 0;
      mockCollection.mockImplementation(() => {
        collectionCallCount++;
        return `collection-ref-${collectionCallCount}`;
      });
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValueOnce({ docs: cardDocs });

      const result = await repo.getMetrics('p1', { year: 2026, sprint: 's1', developer: 'd2' });

      expect(result.transitionCounts).toEqual({});
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

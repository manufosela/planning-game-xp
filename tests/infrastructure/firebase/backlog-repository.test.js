import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockQuery = vi.fn();
const mockOrderBy = vi.fn();
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockWriteBatch = vi.fn();

const mockBatch = { update: vi.fn(), commit: vi.fn() };

vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  getDocs: (...args) => mockGetDocs(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  writeBatch: (...args) => mockWriteBatch(...args),
}));

vi.mock('../../../src/lib/firebase.js', () => ({
  getDb: vi.fn(() => 'mock-db'),
}));

import { FirebaseBacklogRepository } from '../../../src/infrastructure/firebase/backlog-repository.js';

describe('FirebaseBacklogRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteBatch.mockReturnValue(mockBatch);
    mockBatch.commit.mockResolvedValue(undefined);
    repo = new FirebaseBacklogRepository();
  });

  describe('getBacklog', () => {
    it('queries backlog subcollection ordered by order asc', async () => {
      const docs = [
        { id: 'card1', data: () => ({ projectId: 'p1', title: 'Task 1', order: 0 }) },
        { id: 'card2', data: () => ({ projectId: 'p1', title: 'Task 2', order: 1 }) },
      ];
      mockCollection.mockReturnValue('backlog-ref');
      mockOrderBy.mockReturnValue('order-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ docs });

      const result = await repo.getBacklog('dev1');

      expect(mockCollection).toHaveBeenCalledWith('mock-db', 'users', 'dev1', 'backlog');
      expect(mockOrderBy).toHaveBeenCalledWith('order', 'asc');
      expect(result).toEqual([
        { cardId: 'card1', projectId: 'p1', title: 'Task 1', order: 0 },
        { cardId: 'card2', projectId: 'p1', title: 'Task 2', order: 1 },
      ]);
    });
  });

  describe('reorderBacklog', () => {
    it('updates order for each card in batch', async () => {
      mockDoc.mockImplementation((_db, ...path) => path.join('/'));

      await repo.reorderBacklog('dev1', ['c2', 'c1', 'c3']);

      expect(mockBatch.update).toHaveBeenCalledTimes(3);
      expect(mockBatch.update).toHaveBeenCalledWith('users/dev1/backlog/c2', { order: 0 });
      expect(mockBatch.update).toHaveBeenCalledWith('users/dev1/backlog/c1', { order: 1 });
      expect(mockBatch.update).toHaveBeenCalledWith('users/dev1/backlog/c3', { order: 2 });
      expect(mockBatch.commit).toHaveBeenCalledOnce();
    });
  });

  describe('addToBacklog', () => {
    it('sets doc with entry data (cardId as doc id)', async () => {
      mockDoc.mockReturnValue('backlog-doc-ref');
      mockSetDoc.mockResolvedValue(undefined);

      await repo.addToBacklog('dev1', {
        cardId: 'c1',
        projectId: 'p1',
        cardType: 'task',
        title: 'Test',
        status: 'To Do',
      });

      expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'dev1', 'backlog', 'c1');
      expect(mockSetDoc).toHaveBeenCalledWith('backlog-doc-ref', {
        projectId: 'p1',
        cardType: 'task',
        title: 'Test',
        status: 'To Do',
      });
    });
  });

  describe('removeFromBacklog', () => {
    it('deletes the backlog doc', async () => {
      mockDoc.mockReturnValue('backlog-doc-ref');
      mockDeleteDoc.mockResolvedValue(undefined);

      await repo.removeFromBacklog('dev1', 'c1');

      expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'dev1', 'backlog', 'c1');
      expect(mockDeleteDoc).toHaveBeenCalledWith('backlog-doc-ref');
    });
  });
});

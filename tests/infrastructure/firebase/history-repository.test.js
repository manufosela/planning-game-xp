import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockOrderBy = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  getDocs: (...args) => mockGetDocs(...args),
}));

vi.mock('../../../src/lib/firebase.js', () => ({
  getDb: vi.fn(() => 'mock-db'),
}));

vi.mock('../../../src/lib/firestore.js', () => ({
  writeHistory: vi.fn(),
}));

import { FirebaseHistoryRepository } from '../../../src/infrastructure/firebase/history-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebaseHistoryRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseHistoryRepository();
  });

  describe('addEntry', () => {
    it('delegates to writeHistory with correct argument mapping', async () => {
      firestore.writeHistory.mockResolvedValue(undefined);
      const entry = {
        changedBy: 'uid1',
        changedByName: 'John',
        changes: { status: { from: 'To Do', to: 'In Progress' } },
      };

      await repo.addEntry('p1', 'c1', entry);

      expect(firestore.writeHistory).toHaveBeenCalledWith(
        'p1',
        'c1',
        { uid: 'uid1', name: 'John' },
        { status: { from: 'To Do', to: 'In Progress' } }
      );
    });

    it('propagates errors', async () => {
      firestore.writeHistory.mockRejectedValue(new Error('write-fail'));
      await expect(repo.addEntry('p1', 'c1', { changedBy: 'u1', changedByName: 'X', changes: {} }))
        .rejects.toThrow('write-fail');
    });
  });

  describe('getHistory', () => {
    it('queries history subcollection ordered by timestamp desc', async () => {
      const historyDocs = [
        { id: 'h1', data: () => ({ changedBy: 'u1', changes: {} }) },
        { id: 'h2', data: () => ({ changedBy: 'u2', changes: {} }) },
      ];
      mockCollection.mockReturnValue('history-ref');
      mockOrderBy.mockReturnValue('order-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ docs: historyDocs });

      const result = await repo.getHistory('p1', 'c1');

      expect(mockCollection).toHaveBeenCalledWith('mock-db', 'projects', 'p1', 'cards', 'c1', 'history');
      expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(result).toEqual([
        { id: 'h1', changedBy: 'u1', changes: {} },
        { id: 'h2', changedBy: 'u2', changes: {} },
      ]);
    });
  });
});

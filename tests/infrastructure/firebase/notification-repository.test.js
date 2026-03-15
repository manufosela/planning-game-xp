import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockQuery = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn();
const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn();
const mockWriteBatch = vi.fn();

const mockBatch = { update: vi.fn(), commit: vi.fn() };

vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  limit: (...args) => mockLimit(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  writeBatch: (...args) => mockWriteBatch(...args),
}));

vi.mock('../../../src/lib/firebase.js', () => ({
  getDb: vi.fn(() => 'mock-db'),
}));

import { FirebaseNotificationRepository } from '../../../src/infrastructure/firebase/notification-repository.js';

describe('FirebaseNotificationRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteBatch.mockReturnValue(mockBatch);
    mockBatch.commit.mockResolvedValue(undefined);
    repo = new FirebaseNotificationRepository();
  });

  describe('getNotifications', () => {
    it('queries notifications ordered by createdAt desc', async () => {
      const docs = [
        { id: 'n1', data: () => ({ title: 'Notif 1', read: false }) },
      ];
      mockCollection.mockReturnValue('notif-ref');
      mockOrderBy.mockReturnValue('order-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ docs });

      const result = await repo.getNotifications('u1');

      expect(mockCollection).toHaveBeenCalledWith('mock-db', 'users', 'u1', 'notifications');
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(result).toEqual([{ id: 'n1', title: 'Notif 1', read: false }]);
    });

    it('applies limit when provided', async () => {
      mockCollection.mockReturnValue('notif-ref');
      mockOrderBy.mockReturnValue('order-constraint');
      mockLimit.mockReturnValue('limit-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ docs: [] });

      await repo.getNotifications('u1', 10);

      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('does not apply limit when not provided', async () => {
      mockCollection.mockReturnValue('notif-ref');
      mockOrderBy.mockReturnValue('order-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ docs: [] });

      await repo.getNotifications('u1');

      expect(mockLimit).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('updates the notification doc read field to true', async () => {
      mockDoc.mockReturnValue('notif-doc-ref');
      mockUpdateDoc.mockResolvedValue(undefined);

      await repo.markAsRead('u1', 'n1');

      expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'u1', 'notifications', 'n1');
      expect(mockUpdateDoc).toHaveBeenCalledWith('notif-doc-ref', { read: true });
    });
  });

  describe('markAllAsRead', () => {
    it('batch updates all unread notifications', async () => {
      const docs = [
        { ref: 'ref1' },
        { ref: 'ref2' },
      ];
      mockCollection.mockReturnValue('notif-ref');
      mockWhere.mockReturnValue('where-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ empty: false, docs });

      await repo.markAllAsRead('u1');

      expect(mockWhere).toHaveBeenCalledWith('read', '==', false);
      expect(mockBatch.update).toHaveBeenCalledTimes(2);
      expect(mockBatch.update).toHaveBeenCalledWith('ref1', { read: true });
      expect(mockBatch.update).toHaveBeenCalledWith('ref2', { read: true });
      expect(mockBatch.commit).toHaveBeenCalledOnce();
    });

    it('does nothing when no unread notifications', async () => {
      mockCollection.mockReturnValue('notif-ref');
      mockWhere.mockReturnValue('where-constraint');
      mockQuery.mockReturnValue('query-ref');
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

      await repo.markAllAsRead('u1');

      expect(mockBatch.commit).not.toHaveBeenCalled();
    });
  });
});

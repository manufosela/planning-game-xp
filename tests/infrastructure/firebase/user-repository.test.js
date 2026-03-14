import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
}));

vi.mock('../../../src/lib/firebase.js', () => ({
  getDb: vi.fn(() => 'mock-db'),
}));

vi.mock('../../../src/lib/firestore.js', () => ({
  getUsers: vi.fn(),
  deleteUser: vi.fn(),
}));

import { FirebaseUserRepository } from '../../../src/infrastructure/firebase/user-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebaseUserRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseUserRepository();
  });

  describe('getUser', () => {
    it('returns user data from Firestore doc', async () => {
      mockDoc.mockReturnValue('user-ref');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: 'u1',
        data: () => ({ email: 'a@b.com', name: 'Test' }),
      });

      const result = await repo.getUser('u1');

      expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'u1');
      expect(result).toEqual({ uid: 'u1', email: 'a@b.com', name: 'Test' });
    });

    it('returns null when user not found', async () => {
      mockDoc.mockReturnValue('user-ref');
      mockGetDoc.mockResolvedValue({ exists: () => false });

      const result = await repo.getUser('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('saveUser', () => {
    it('saves user to Firestore with merge', async () => {
      mockDoc.mockReturnValue('user-ref');
      mockSetDoc.mockResolvedValue(undefined);

      await repo.saveUser({ uid: 'u1', email: 'a@b.com', name: 'Test' });

      expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'u1');
      expect(mockSetDoc).toHaveBeenCalledWith('user-ref', { email: 'a@b.com', name: 'Test' }, { merge: true });
    });
  });

  describe('getUsers', () => {
    it('delegates to firestore.getUsers', async () => {
      const users = [{ uid: 'u1' }, { uid: 'u2' }];
      firestore.getUsers.mockResolvedValue(users);

      const result = await repo.getUsers();

      expect(firestore.getUsers).toHaveBeenCalledOnce();
      expect(result).toEqual(users);
    });
  });

  describe('deleteUser', () => {
    it('delegates to firestore.deleteUser', async () => {
      firestore.deleteUser.mockResolvedValue(undefined);

      await repo.deleteUser('u1');

      expect(firestore.deleteUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('error propagation', () => {
    it('propagates errors from getDoc', async () => {
      mockDoc.mockReturnValue('user-ref');
      mockGetDoc.mockRejectedValue(new Error('doc-fail'));
      await expect(repo.getUser('u1')).rejects.toThrow('doc-fail');
    });
  });
});

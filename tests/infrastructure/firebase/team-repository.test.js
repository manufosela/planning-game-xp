import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/firestore.js', () => ({
  getTeam: vi.fn(),
  addTeamMember: vi.fn(),
  removeTeamMember: vi.fn(),
  getTagRegistry: vi.fn(),
  updateTagRegistry: vi.fn(),
}));

import { FirebaseTeamRepository } from '../../../src/infrastructure/firebase/team-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebaseTeamRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseTeamRepository();
  });

  describe('getTeam', () => {
    it('delegates to firestore.getTeam', async () => {
      const team = [{ memberId: 'm1', name: 'Dev' }];
      firestore.getTeam.mockResolvedValue(team);

      const result = await repo.getTeam('p1');

      expect(firestore.getTeam).toHaveBeenCalledWith('p1');
      expect(result).toEqual(team);
    });
  });

  describe('addMember', () => {
    it('delegates to firestore.addTeamMember', async () => {
      firestore.addTeamMember.mockResolvedValue('m1');
      const member = { name: 'New Dev', role: 'developer' };

      await repo.addMember('p1', member);

      expect(firestore.addTeamMember).toHaveBeenCalledWith('p1', member);
    });
  });

  describe('removeMember', () => {
    it('delegates to firestore.removeTeamMember', async () => {
      firestore.removeTeamMember.mockResolvedValue(undefined);

      await repo.removeMember('p1', 'm1');

      expect(firestore.removeTeamMember).toHaveBeenCalledWith('p1', 'm1');
    });
  });

  describe('getTagRegistry', () => {
    it('delegates to firestore.getTagRegistry', async () => {
      const tags = [{ name: 'bug', color: 'red' }];
      firestore.getTagRegistry.mockResolvedValue(tags);

      const result = await repo.getTagRegistry('p1');

      expect(firestore.getTagRegistry).toHaveBeenCalledWith('p1');
      expect(result).toEqual(tags);
    });
  });

  describe('saveTagRegistry', () => {
    it('delegates to firestore.updateTagRegistry', async () => {
      firestore.updateTagRegistry.mockResolvedValue(undefined);
      const tags = [{ name: 'feature', color: 'blue' }];

      await repo.saveTagRegistry('p1', tags);

      expect(firestore.updateTagRegistry).toHaveBeenCalledWith('p1', tags);
    });
  });

  describe('error propagation', () => {
    it('propagates errors from getTeam', async () => {
      firestore.getTeam.mockRejectedValue(new Error('fail'));
      await expect(repo.getTeam('p1')).rejects.toThrow('fail');
    });
  });
});

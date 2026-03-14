import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/firestore.js', () => ({
  getAdrs: vi.fn(),
  createAdr: vi.fn(),
  updateAdr: vi.fn(),
  deleteAdr: vi.fn(),
}));

import { FirebaseAdrRepository } from '../../../src/infrastructure/firebase/adr-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebaseAdrRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseAdrRepository();
  });

  describe('getAdrs', () => {
    it('delegates to firestore.getAdrs', async () => {
      const adrs = [{ adrId: 'a1', title: 'ADR 1' }];
      firestore.getAdrs.mockResolvedValue(adrs);

      const result = await repo.getAdrs('p1');

      expect(firestore.getAdrs).toHaveBeenCalledWith('p1');
      expect(result).toEqual(adrs);
    });
  });

  describe('getAdr', () => {
    it('finds ADR by id from getAdrs result', async () => {
      const adrs = [
        { adrId: 'a1', title: 'ADR 1' },
        { adrId: 'a2', title: 'ADR 2' },
      ];
      firestore.getAdrs.mockResolvedValue(adrs);

      const result = await repo.getAdr('p1', 'a2');
      expect(result).toEqual({ adrId: 'a2', title: 'ADR 2' });
    });

    it('returns null when ADR not found', async () => {
      firestore.getAdrs.mockResolvedValue([]);
      const result = await repo.getAdr('p1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('saveAdr', () => {
    it('calls createAdr for new ADRs (no adrId)', async () => {
      firestore.createAdr.mockResolvedValue('new-id');

      await repo.saveAdr('p1', { title: 'New ADR' });

      expect(firestore.createAdr).toHaveBeenCalledWith('p1', { title: 'New ADR' });
    });

    it('calls updateAdr for existing ADRs (with adrId)', async () => {
      firestore.updateAdr.mockResolvedValue(undefined);

      await repo.saveAdr('p1', { adrId: 'a1', title: 'Updated' });

      expect(firestore.updateAdr).toHaveBeenCalledWith('p1', 'a1', { title: 'Updated' });
    });
  });

  describe('deleteAdr', () => {
    it('delegates to firestore.deleteAdr', async () => {
      firestore.deleteAdr.mockResolvedValue(undefined);

      await repo.deleteAdr('p1', 'a1');

      expect(firestore.deleteAdr).toHaveBeenCalledWith('p1', 'a1');
    });
  });
});

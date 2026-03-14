import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/firestore.js', () => ({
  getCards: vi.fn(),
  getCard: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  generateCardId: vi.fn(),
  restoreFromTrash: vi.fn(),
}));

import { FirebaseCardRepository } from '../../../src/infrastructure/firebase/card-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebaseCardRepository', () => {
  /** @type {FirebaseCardRepository} */
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseCardRepository();
  });

  describe('getCards', () => {
    it('delegates to firestore.getCards with projectId and filters', async () => {
      const cards = [{ cardId: 'c1' }];
      firestore.getCards.mockResolvedValue(cards);
      const filters = { type: 'task', status: 'To Do' };

      const result = await repo.getCards('p1', filters);

      expect(firestore.getCards).toHaveBeenCalledWith('p1', filters);
      expect(result).toEqual(cards);
    });

    it('works without filters', async () => {
      firestore.getCards.mockResolvedValue([]);
      await repo.getCards('p1');
      expect(firestore.getCards).toHaveBeenCalledWith('p1', undefined);
    });
  });

  describe('getCard', () => {
    it('delegates to firestore.getCard', async () => {
      const card = { cardId: 'c1', title: 'Test' };
      firestore.getCard.mockResolvedValue(card);

      const result = await repo.getCard('p1', 'c1');

      expect(firestore.getCard).toHaveBeenCalledWith('p1', 'c1');
      expect(result).toEqual(card);
    });
  });

  describe('saveCard', () => {
    it('calls createCard for new cards (no cardId)', async () => {
      firestore.createCard.mockResolvedValue('new-id');
      const card = { title: 'New Card', type: 'task' };

      await repo.saveCard('p1', card);

      expect(firestore.createCard).toHaveBeenCalledWith('p1', card);
      expect(firestore.updateCard).not.toHaveBeenCalled();
    });

    it('calls updateCard for existing cards (with cardId)', async () => {
      firestore.updateCard.mockResolvedValue(undefined);
      const card = { cardId: 'c1', title: 'Updated' };

      await repo.saveCard('p1', card);

      expect(firestore.updateCard).toHaveBeenCalledWith('p1', 'c1', { title: 'Updated' });
      expect(firestore.createCard).not.toHaveBeenCalled();
    });
  });

  describe('deleteCard', () => {
    it('delegates to firestore.deleteCard (soft-delete)', async () => {
      firestore.deleteCard.mockResolvedValue(undefined);

      await repo.deleteCard('p1', 'c1');

      expect(firestore.deleteCard).toHaveBeenCalledWith('p1', 'c1');
    });
  });

  describe('getNextCardNumber', () => {
    it('extracts number from generated card ID', async () => {
      firestore.generateCardId.mockResolvedValue('PLN-TSK-0042');

      const result = await repo.getNextCardNumber('p1', 'task');

      expect(firestore.generateCardId).toHaveBeenCalledWith('p1', 'task');
      expect(result).toBe(42);
    });

    it('returns 0 if no number found', async () => {
      firestore.generateCardId.mockResolvedValue('invalid');

      const result = await repo.getNextCardNumber('p1', 'task');
      expect(result).toBe(0);
    });
  });

  describe('moveToTrash', () => {
    it('delegates to firestore.deleteCard (soft-delete)', async () => {
      firestore.deleteCard.mockResolvedValue(undefined);

      await repo.moveToTrash('p1', 'c1');

      expect(firestore.deleteCard).toHaveBeenCalledWith('p1', 'c1');
    });
  });

  describe('restoreFromTrash', () => {
    it('delegates to firestore.restoreFromTrash', async () => {
      firestore.restoreFromTrash.mockResolvedValue(undefined);

      await repo.restoreFromTrash('p1', 'c1');

      expect(firestore.restoreFromTrash).toHaveBeenCalledWith('p1', 'c1');
    });
  });

  describe('error propagation', () => {
    it('propagates errors from getCards', async () => {
      firestore.getCards.mockRejectedValue(new Error('fail'));
      await expect(repo.getCards('p1')).rejects.toThrow('fail');
    });

    it('propagates errors from saveCard', async () => {
      firestore.createCard.mockRejectedValue(new Error('save-fail'));
      await expect(repo.saveCard('p1', { title: 'x' })).rejects.toThrow('save-fail');
    });
  });
});

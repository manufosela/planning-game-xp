import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDoc = vi.fn();
const mockDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockServerTimestamp = vi.fn(() => 'mock-server-timestamp');

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock('../../../src/lib/firebase.js', () => ({
  getDb: vi.fn(() => 'mock-db'),
  cardsRef: vi.fn(() => 'mock-cards-collection'),
}));

vi.mock('../../../src/lib/firestore.js', () => ({
  getCards: vi.fn(),
  getCard: vi.fn(),
  createCard: vi.fn(),
  deleteCard: vi.fn(),
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

    it('maps developer filter to developerId for firestore helper', async () => {
      firestore.getCards.mockResolvedValue([]);
      const filters = { developer: 'dev_001', type: 'task' };

      await repo.getCards('p1', filters);

      expect(firestore.getCards).toHaveBeenCalledWith('p1', {
        type: 'task',
        developerId: 'dev_001',
      });
    });

    it('passes other filters through unchanged', async () => {
      firestore.getCards.mockResolvedValue([]);
      const filters = { type: 'bug', status: 'Created', sprint: 'SPR-001' };

      await repo.getCards('p1', filters);

      expect(firestore.getCards).toHaveBeenCalledWith('p1', {
        type: 'bug',
        status: 'Created',
        sprint: 'SPR-001',
      });
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
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('calls updateDoc directly for existing cards (with cardId)', async () => {
      mockDoc.mockReturnValue('card-doc-ref');
      mockUpdateDoc.mockResolvedValue(undefined);
      const card = { cardId: 'c1', title: 'Updated' };

      await repo.saveCard('p1', card);

      expect(mockDoc).toHaveBeenCalledWith('mock-cards-collection', 'c1');
      expect(mockUpdateDoc).toHaveBeenCalledWith('card-doc-ref', {
        title: 'Updated',
        updatedAt: 'mock-server-timestamp',
        updatedBy: '',
      });
      expect(firestore.createCard).not.toHaveBeenCalled();
    });

    it('includes updatedBy from card data when present', async () => {
      mockDoc.mockReturnValue('card-doc-ref');
      mockUpdateDoc.mockResolvedValue(undefined);
      const card = { cardId: 'c1', title: 'Updated', updatedBy: 'user-123' };

      await repo.saveCard('p1', card);

      expect(mockUpdateDoc).toHaveBeenCalledWith('card-doc-ref', {
        title: 'Updated',
        updatedBy: 'user-123',
        updatedAt: 'mock-server-timestamp',
      });
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
    it('reads counter without mutating and returns next number', async () => {
      mockDoc.mockReturnValue('counter-ref');
      mockGetDoc.mockResolvedValue({
        data: () => ({ task: 41 }),
      });

      const result = await repo.getNextCardNumber('p1', 'task');

      expect(mockDoc).toHaveBeenCalledWith('mock-db', 'counters', 'p1');
      expect(result).toBe(42);
    });

    it('returns 1 when counter type is missing', async () => {
      mockDoc.mockReturnValue('counter-ref');
      mockGetDoc.mockResolvedValue({
        data: () => ({}),
      });

      const result = await repo.getNextCardNumber('p1', 'task');
      expect(result).toBe(1);
    });

    it('returns 1 when counter data is null', async () => {
      mockDoc.mockReturnValue('counter-ref');
      mockGetDoc.mockResolvedValue({
        data: () => null,
      });

      const result = await repo.getNextCardNumber('p1', 'task');
      expect(result).toBe(1);
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

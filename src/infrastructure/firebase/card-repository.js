import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '../../lib/firebase.js';
import {
  getCards as fsGetCards,
  getCard as fsGetCard,
  createCard,
  updateCard,
  deleteCard as fsDeleteCard,
  restoreFromTrash as fsRestoreFromTrash,
} from '../../lib/firestore.js';

/**
 * Firebase implementation of CardRepository port.
 * @implements {import('@pgv2/domain/ports').CardRepository}
 */
export class FirebaseCardRepository {
  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').QueryFilters} [filters]
   * @returns {Promise<import('@pgv2/domain/ports').Card[]>}
   */
  async getCards(projectId, filters) {
    return fsGetCards(projectId, filters);
  }

  /**
   * @param {string} projectId
   * @param {string} cardId
   * @returns {Promise<import('@pgv2/domain/ports').Card | null>}
   */
  async getCard(projectId, cardId) {
    return fsGetCard(projectId, cardId);
  }

  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').Card} card
   * @returns {Promise<void>}
   */
  async saveCard(projectId, card) {
    if (card.cardId) {
      const { cardId, ...data } = card;
      await updateCard(projectId, cardId, data, { uid: 'system', name: 'system' });
    } else {
      await createCard(projectId, card);
    }
  }

  /**
   * @param {string} projectId
   * @param {string} cardId
   * @returns {Promise<void>}
   */
  async deleteCard(projectId, cardId) {
    await fsDeleteCard(projectId, cardId);
  }

  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').CardType} type
   * @returns {Promise<number>}
   */
  async getNextCardNumber(projectId, type) {
    const counterSnap = await getDoc(doc(getDb(), 'counters', projectId));
    return (counterSnap.data()?.[type] ?? 0) + 1;
  }

  /**
   * @param {string} projectId
   * @param {string} cardId
   * @returns {Promise<void>}
   */
  async moveToTrash(projectId, cardId) {
    await fsDeleteCard(projectId, cardId);
  }

  /**
   * @param {string} projectId
   * @param {string} cardId
   * @returns {Promise<void>}
   */
  async restoreFromTrash(projectId, cardId) {
    await fsRestoreFromTrash(projectId, cardId);
  }
}

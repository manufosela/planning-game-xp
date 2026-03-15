import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from '../../lib/firebase.js';

/**
 * Firebase implementation of BacklogRepository port.
 * Uses Firestore subcollection: users/{developerId}/backlog/{cardId}
 * @implements {import('@pgv2/domain/ports').BacklogRepository}
 */
export class FirebaseBacklogRepository {
  /**
   * @param {string} developerId
   * @returns {Promise<import('@pgv2/domain/ports').BacklogEntry[]>}
   */
  async getBacklog(developerId) {
    const ref = collection(getDb(), 'users', developerId, 'backlog');
    const q = query(ref, orderBy('order', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ cardId: d.id, ...d.data() }));
  }

  /**
   * @param {string} developerId
   * @param {string[]} orderedCardIds
   * @returns {Promise<void>}
   */
  async reorderBacklog(developerId, orderedCardIds) {
    const db = getDb();
    const batch = writeBatch(db);
    orderedCardIds.forEach((cardId, index) => {
      const ref = doc(db, 'users', developerId, 'backlog', cardId);
      batch.update(ref, { order: index });
    });
    await batch.commit();
  }

  /**
   * @param {string} developerId
   * @param {import('@pgv2/domain/ports').BacklogEntry} entry
   * @returns {Promise<void>}
   */
  async addToBacklog(developerId, entry) {
    const { cardId, ...data } = entry;
    const ref = doc(getDb(), 'users', developerId, 'backlog', cardId);
    await setDoc(ref, data);
  }

  /**
   * @param {string} developerId
   * @param {string} cardId
   * @returns {Promise<void>}
   */
  async removeFromBacklog(developerId, cardId) {
    const ref = doc(getDb(), 'users', developerId, 'backlog', cardId);
    await deleteDoc(ref);
  }
}

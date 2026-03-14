import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getDb } from '../../lib/firebase.js';
import { writeHistory } from '../../lib/firestore.js';

/**
 * Firebase implementation of HistoryRepository port.
 * @implements {import('@pgv2/domain/ports').HistoryRepository}
 */
export class FirebaseHistoryRepository {
  /**
   * @param {string} projectId
   * @param {string} cardId
   * @param {import('@pgv2/domain/ports').HistoryEntry} entry
   * @returns {Promise<void>}
   */
  async addEntry(projectId, cardId, entry) {
    await writeHistory(
      projectId,
      cardId,
      { uid: entry.changedBy, name: entry.changedByName },
      entry.changes
    );
  }

  /**
   * @param {string} projectId
   * @param {string} cardId
   * @returns {Promise<import('@pgv2/domain/ports').HistoryEntry[]>}
   */
  async getHistory(projectId, cardId) {
    const ref = collection(getDb(), 'projects', projectId, 'cards', cardId, 'history');
    const q = query(ref, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

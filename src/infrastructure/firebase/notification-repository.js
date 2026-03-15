import {
  collection,
  doc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import { getDb } from '../../lib/firebase.js';

/**
 * Firebase implementation of NotificationRepository port.
 * Uses Firestore subcollection: users/{userId}/notifications
 * @implements {import('@pgv2/domain/ports').NotificationRepository}
 */
export class FirebaseNotificationRepository {
  /**
   * @param {string} userId
   * @param {number} [limit]
   * @returns {Promise<import('@pgv2/domain/ports').Notification[]>}
   */
  async getNotifications(userId, limit) {
    const ref = collection(getDb(), 'users', userId, 'notifications');
    const constraints = [orderBy('createdAt', 'desc')];
    if (limit) constraints.push(fsLimit(limit));
    const q = query(ref, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  /**
   * @param {string} userId
   * @param {string} notifId
   * @returns {Promise<void>}
   */
  async markAsRead(userId, notifId) {
    const ref = doc(getDb(), 'users', userId, 'notifications', notifId);
    await updateDoc(ref, { read: true });
  }

  /**
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async markAllAsRead(userId) {
    const ref = collection(getDb(), 'users', userId, 'notifications');
    const q = query(ref, where('read', '==', false));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const db = getDb();
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }
}

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb } from '../../lib/firebase.js';
import {
  getUsers as fsGetUsers,
  deleteUser as fsDeleteUser,
} from '../../lib/firestore.js';

/**
 * Firebase implementation of UserRepository port.
 * @implements {import('@pgv2/domain/ports').UserRepository}
 */
export class FirebaseUserRepository {
  /**
   * @param {string} uid
   * @returns {Promise<import('@pgv2/domain/ports').User | null>}
   */
  async getUser(uid) {
    const ref = doc(getDb(), 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { uid: snap.id, ...snap.data() };
  }

  /**
   * @param {import('@pgv2/domain/ports').User} user
   * @returns {Promise<void>}
   */
  async saveUser(user) {
    const { uid, ...data } = user;
    const ref = doc(getDb(), 'users', uid);
    await setDoc(ref, data, { merge: true });
  }

  /** @returns {Promise<import('@pgv2/domain/ports').User[]>} */
  async getUsers() {
    const users = await fsGetUsers();
    return users.map(({ id, ...rest }) => ({ uid: id, ...rest }));
  }

  /**
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async deleteUser(uid) {
    await fsDeleteUser(uid);
  }
}

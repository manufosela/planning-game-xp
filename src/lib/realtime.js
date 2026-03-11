/**
 * Real-time Firestore listeners.
 *
 * Provides subscription functions that wire onSnapshot listeners
 * to the store signals for automatic UI reactivity.
 *
 * @module lib/realtime
 */

import {
  onSnapshot,
  query,
  where,
  orderBy,
  collection,
  doc,
  limit,
} from 'firebase/firestore';
import { getDb, cardsRef } from './firebase.js';
import { cards, notifications, wipTasks } from './store.js';

// ---------------------------------------------------------------------------
// Card subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to all cards in a project. Updates the `cards` store signal
 * automatically on every snapshot.
 *
 * @param {string} projectId
 * @param {((cards: import('./types.d.ts').Card[]) => void)} [callback] - Optional extra callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToCards(projectId, callback) {
  const ref = cardsRef(projectId);
  return onSnapshot(ref, (snapshot) => {
    const data = snapshot.docs.map((d) => d.data());
    cards.set(data);
    callback?.(data);
  });
}

/**
 * Subscribe to a single card document. Calls the callback whenever
 * the card changes.
 *
 * @param {string} projectId
 * @param {string} cardId
 * @param {(card: import('./types.d.ts').Card | null) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToCard(projectId, cardId, callback) {
  const ref = doc(cardsRef(projectId), cardId);
  return onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback(snapshot.data());
  });
}

// ---------------------------------------------------------------------------
// Notification subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to user notifications. Updates the `notifications` store signal.
 * Returns up to 50 most recent notifications.
 *
 * @param {string} userId
 * @param {((items: import('./types.d.ts').Notification[]) => void)} [callback]
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToNotifications(userId, callback) {
  const db = getDb();
  const ref = collection(db, 'users', userId, 'notifications');
  const q = query(ref, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    notifications.set(data);
    callback?.(data);
  });
}

// ---------------------------------------------------------------------------
// WIP subscription (cross-project In Progress tasks)
// ---------------------------------------------------------------------------

/**
 * Subscribe to all "In Progress" tasks across a list of projects.
 * Updates the `wipTasks` store signal.
 *
 * Returns a single unsubscribe function that tears down all listeners.
 *
 * @param {string[]} projectIds
 * @param {((tasks: import('./types.d.ts').Card[]) => void)} [callback]
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToWipTasks(projectIds, callback) {
  /** @type {Map<string, import('./types.d.ts').Card[]>} */
  const tasksByProject = new Map();
  /** @type {Array<() => void>} */
  const unsubscribers = [];

  for (const projectId of projectIds) {
    const ref = cardsRef(projectId);
    const q = query(ref, where('status', '==', 'In Progress'));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => d.data());
      tasksByProject.set(projectId, data);

      // Merge all project results into a single array
      const all = /** @type {import('./types.d.ts').Card[]} */ ([]);
      for (const items of tasksByProject.values()) {
        all.push(...items);
      }
      wipTasks.set(all);
      callback?.(all);
    });

    unsubscribers.push(unsub);
  }

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Check if a card has been modified on the server since the local version was fetched.
 * Used for optimistic concurrency control.
 *
 * @param {{ updatedAt?: { seconds: number } | null }} localCard - Local card snapshot
 * @param {{ seconds: number } | null} serverUpdatedAt - Server timestamp from onSnapshot
 * @returns {boolean} True if there is a conflict (server is newer)
 */
export function checkConflict(localCard, serverUpdatedAt) {
  if (!localCard.updatedAt || !serverUpdatedAt) return false;

  const localSeconds = localCard.updatedAt.seconds ?? 0;
  const serverSeconds = serverUpdatedAt.seconds ?? 0;

  return serverSeconds > localSeconds;
}

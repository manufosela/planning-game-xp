/**
 * Firestore trigger: onStatusChange
 *
 * Fires on card updates to handle:
 * 1. FCM push notifications on status change
 * 2. Developer backlog updates on assignment changes
 *
 * @module functions/triggers/on-status-change
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { initializeApp, getApps } from 'firebase-admin/app';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export const onStatusChange = onDocumentUpdated(
  'projects/{projectId}/cards/{cardId}',
  async (event) => {
    const { projectId, cardId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    if (!beforeData || !afterData) return;

    const oldStatus = beforeData.status;
    const newStatus = afterData.status;
    const oldDevId = beforeData.developer?.id;
    const newDevId = afterData.developer?.id;

    // Handle status change notifications
    if (oldStatus !== newStatus) {
      await sendStatusChangeNotification(projectId, cardId, afterData, oldStatus, newStatus);
    }

    // Handle developer assignment changes (backlog management)
    if (oldDevId !== newDevId || oldStatus !== newStatus) {
      await updateDeveloperBacklog(projectId, cardId, beforeData, afterData, oldDevId, newDevId);
    }
  }
);

// ---------------------------------------------------------------------------
// FCM Push Notification
// ---------------------------------------------------------------------------

/**
 * Send FCM push notification on status change.
 * @param {string} projectId
 * @param {string} cardId
 * @param {Record<string, unknown>} cardData
 * @param {string} oldStatus
 * @param {string} newStatus
 * @returns {Promise<void>}
 */
async function sendStatusChangeNotification(projectId, cardId, cardData, oldStatus, newStatus) {
  // Determine who should receive the notification
  const recipientIds = new Set();

  const developer = /** @type {{ id?: string } | undefined} */ (cardData.developer);
  const validator = /** @type {{ id?: string } | undefined} */ (cardData.validator);
  const updatedBy = /** @type {string | undefined} */ (cardData.updatedBy);

  // Notify developer (unless they made the change)
  if (developer?.id && developer.id !== updatedBy) {
    recipientIds.add(developer.id);
  }

  // Notify validator (unless they made the change)
  if (validator?.id && validator.id !== updatedBy) {
    recipientIds.add(validator.id);
  }

  if (recipientIds.size === 0) return;

  // Get FCM tokens for recipients
  for (const userId of recipientIds) {
    try {
      const userDoc = await db.doc(`users/${userId}`).get();
      if (!userDoc.exists) continue;

      const userData = userDoc.data();
      const fcmToken = /** @type {string | undefined} */ (userData?.fcmToken);
      if (!fcmToken) continue;

      const messaging = getMessaging();
      await messaging.send({
        token: fcmToken,
        notification: {
          title: `${cardId}: ${oldStatus} -> ${newStatus}`,
          body: /** @type {string} */ (cardData.title),
        },
        data: {
          projectId,
          cardId,
          oldStatus,
          newStatus,
          url: `/project/${projectId}?card=${cardId}`,
        },
      });
    } catch (error) {
      // Token may be invalid/expired — log but do not fail
      console.warn(`FCM send failed for user ${userId}:`, error.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Developer Backlog Management
// ---------------------------------------------------------------------------

/**
 * Update developer backlog when card assignment or status changes.
 * @param {string} projectId
 * @param {string} cardId
 * @param {Record<string, unknown>} beforeData
 * @param {Record<string, unknown>} afterData
 * @param {string | undefined} oldDevId
 * @param {string | undefined} newDevId
 * @returns {Promise<void>}
 */
async function updateDeveloperBacklog(projectId, cardId, beforeData, afterData, oldDevId, newDevId) {
  const oldStatus = /** @type {string} */ (beforeData.status);
  const newStatus = /** @type {string} */ (afterData.status);

  // Remove from old developer's backlog if developer changed or status leaves backlog
  if (oldDevId && (oldDevId !== newDevId || shouldLeaveBacklog(newStatus))) {
    await removeFromBacklog(oldDevId, `${projectId}:${cardId}`);
  }

  // Add to new developer's backlog if status warrants it
  if (newDevId && shouldBeInBacklog(newStatus)) {
    await addToBacklog(newDevId, `${projectId}:${cardId}`, {
      cardId,
      projectId,
      cardType: /** @type {string} */ (afterData.type),
      title: /** @type {string} */ (afterData.title),
      status: newStatus,
    });
  }

  // Remove from backlog on completion
  if (newDevId && shouldLeaveBacklog(newStatus) && !shouldLeaveBacklog(oldStatus)) {
    await removeFromBacklog(newDevId, `${projectId}:${cardId}`);
  }
}

/**
 * Whether a status means the card should be in the developer's backlog.
 * @param {string} status
 * @returns {boolean}
 */
function shouldBeInBacklog(status) {
  return status === 'To Do';
}

/**
 * Whether a status means the card should leave the backlog.
 * @param {string} status
 * @returns {boolean}
 */
function shouldLeaveBacklog(status) {
  return ['In Progress', 'Done', 'Done&Validated', 'Closed', 'Fixed', 'Verified'].includes(status);
}

/**
 * Add a card to a developer's backlog.
 * @param {string} devId
 * @param {string} cardKey
 * @param {{ cardId: string; projectId: string; cardType: string; title: string; status: string }} item
 * @returns {Promise<void>}
 */
async function addToBacklog(devId, cardKey, item) {
  const backlogRef = db.doc(`developerBacklogs/${devId}`);
  const snap = await backlogRef.get();

  if (snap.exists) {
    const data = snap.data();
    const order = /** @type {string[]} */ (data?.order ?? []);
    const items = /** @type {Record<string, unknown>} */ (data?.items ?? {});

    if (!order.includes(cardKey)) {
      order.push(cardKey);
    }
    items[cardKey] = item;

    await backlogRef.update({ order, items, updatedAt: FieldValue.serverTimestamp() });
  } else {
    await backlogRef.set({
      order: [cardKey],
      items: { [cardKey]: item },
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Remove a card from a developer's backlog.
 * @param {string} devId
 * @param {string} cardKey
 * @returns {Promise<void>}
 */
async function removeFromBacklog(devId, cardKey) {
  const backlogRef = db.doc(`developerBacklogs/${devId}`);
  const snap = await backlogRef.get();

  if (!snap.exists) return;

  const data = snap.data();
  const order = /** @type {string[]} */ (data?.order ?? []).filter((k) => k !== cardKey);
  const items = /** @type {Record<string, unknown>} */ (data?.items ?? {});
  delete items[cardKey];

  await backlogRef.update({ order, items, updatedAt: FieldValue.serverTimestamp() });
}

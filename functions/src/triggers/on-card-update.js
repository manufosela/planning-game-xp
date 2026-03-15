/**
 * Firestore trigger: onCardUpdate
 *
 * Fires on every write to `projects/{projectId}/cards/{cardId}`.
 * Responsibilities:
 * 1. Validate status transitions (revert if invalid)
 * 2. WIP enforcement (only 1 In Progress per developer across all projects)
 * 3. Track work cycles (startedAt/endedAt/durationMs)
 * 4. Write notification to validator on "To Validate"
 * 5. Write notification to developer on "Reopened"
 *
 * @module functions/triggers/on-card-update
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { canTransition, getRequiredFields } from '@pgv2/domain/services';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export const onCardUpdate = onDocumentUpdated(
  'projects/{projectId}/cards/{cardId}',
  async (event) => {
    const { projectId, cardId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    if (!beforeData || !afterData) return;

    const oldStatus = beforeData.status;
    const newStatus = afterData.status;

    // Only process status changes
    if (oldStatus === newStatus) return;

    const cardType = afterData.type;
    const cardRef = db.doc(`projects/${projectId}/cards/${cardId}`);

    // 1. Validate transition using domain service
    // Use a system user for server-side validation (no user-level permission check)
    const systemUser = { uid: 'system', role: 'superadmin' };
    const transitionResult = canTransition(
      { ...afterData, type: cardType, status: oldStatus },
      newStatus,
      systemUser,
    );
    if (!transitionResult.allowed) {
      // Revert the status change
      await cardRef.update({
        status: oldStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Write notification about the revert
      if (afterData.developer?.id) {
        await writeNotification(afterData.developer.id, {
          title: 'Invalid status transition',
          message: `Card ${cardId}: ${transitionResult.reason}. Status reverted.`,
          type: 'warning',
          cardRef: `${projectId}/${cardId}`,
        });
      }
      return;
    }

    // 2. WIP enforcement for "In Progress"
    if (newStatus === 'In Progress' && afterData.developer?.id) {
      const devId = afterData.developer.id;
      const hasOtherWip = await checkDeveloperWip(devId, projectId, cardId);

      if (hasOtherWip) {
        // Revert
        await cardRef.update({
          status: oldStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });

        await writeNotification(devId, {
          title: 'WIP limit exceeded',
          message: `Card ${cardId}: you already have another task "In Progress". Complete or pause it first.`,
          type: 'warning',
          cardRef: `${projectId}/${cardId}`,
        });
        return;
      }
    }

    // 3. Track work cycles
    await trackWorkCycle(cardRef, afterData, oldStatus, newStatus);

    // 4. Notify validator on "To Validate"
    if (newStatus === 'To Validate' && afterData.validator?.id) {
      await writeNotification(afterData.validator.id, {
        title: 'Card ready for validation',
        message: `${cardId} "${afterData.title}" is ready for your review.`,
        type: 'action',
        cardRef: `${projectId}/${cardId}`,
      });
    }

    // 5. Notify developer on "Reopened"
    if (newStatus === 'Reopened' && afterData.developer?.id) {
      await writeNotification(afterData.developer.id, {
        title: 'Card reopened',
        message: `${cardId} "${afterData.title}" has been reopened and needs rework.`,
        type: 'action',
        cardRef: `${projectId}/${cardId}`,
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if developer has another "In Progress" task across all projects.
 * @param {string} devId
 * @param {string} currentProjectId
 * @param {string} currentCardId
 * @returns {Promise<boolean>}
 */
async function checkDeveloperWip(devId, currentProjectId, currentCardId) {
  // Get all projects
  const projectsSnap = await db.collection('projects').get();

  for (const projectDoc of projectsSnap.docs) {
    const cardsSnap = await db
      .collection('projects')
      .doc(projectDoc.id)
      .collection('cards')
      .where('status', '==', 'In Progress')
      .where('developer.id', '==', devId)
      .get();

    for (const cardDoc of cardsSnap.docs) {
      // Skip the card being updated
      if (projectDoc.id === currentProjectId && cardDoc.id === currentCardId) {
        continue;
      }
      return true; // Found another In Progress card
    }
  }

  return false;
}

/**
 * Track work cycle timing.
 * @param {FirebaseFirestore.DocumentReference} cardRef
 * @param {Record<string, unknown>} cardData
 * @param {string} oldStatus
 * @param {string} newStatus
 * @returns {Promise<void>}
 */
async function trackWorkCycle(cardRef, cardData, oldStatus, newStatus) {
  const workCycles = /** @type {Array<{ startedAt: unknown; endedAt?: unknown; durationMs?: number }>} */ (
    cardData.workCycles ?? []
  );

  if (newStatus === 'In Progress') {
    // Start a new work cycle
    workCycles.push({
      startedAt: FieldValue.serverTimestamp(),
    });
    await cardRef.update({ workCycles });
  } else if (oldStatus === 'In Progress') {
    // End the current work cycle
    const lastCycle = workCycles[workCycles.length - 1];
    if (lastCycle && !lastCycle.endedAt) {
      const now = Date.now();
      const startMs = lastCycle.startedAt?.seconds
        ? /** @type {{ seconds: number }} */ (lastCycle.startedAt).seconds * 1000
        : now;
      lastCycle.endedAt = FieldValue.serverTimestamp();
      lastCycle.durationMs = now - startMs;

      // Calculate total work time
      const totalWorkMs = workCycles.reduce((sum, cycle) => {
        return sum + (cycle.durationMs ?? 0);
      }, 0);

      await cardRef.update({ workCycles, totalWorkMs });
    }
  }
}

/**
 * Write a notification document to a user's notifications subcollection.
 * @param {string} userId
 * @param {{ title: string; message: string; type: string; cardRef: string }} data
 * @returns {Promise<void>}
 */
async function writeNotification(userId, data) {
  const notifRef = db.collection('users').doc(userId).collection('notifications');
  await notifRef.add({
    ...data,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });
}

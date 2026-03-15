/**
 * Callable function for bulk card import.
 * Validates each card and generates IDs atomically.
 *
 * Input: { projectId: string, cards: Array<Record<string, any>> }
 * Output: { results: Array<{ cardId?: string, success: boolean, error?: string }> }
 *
 * @module functions/callable/import-cards
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStatusesForType } from '@pgv2/domain/services';

/** @type {Record<string, string>} */
const TYPE_PREFIX = {
  task: 'TSK',
  bug: 'BUG',
  epic: 'EPC',
  sprint: 'SPR',
  proposal: 'PRP',
  qa: 'QAI',
};

const VALID_TYPES = Object.keys(TYPE_PREFIX);

/**
 * Get the correct initial/default status for a card type.
 * Uses domain-defined statuses — the first status in the list is the initial state.
 * @param {string} type
 * @returns {string}
 */
export function getDefaultStatusForType(type) {
  const statuses = getStatusesForType(type);
  return statuses.length > 0 ? statuses[0] : 'To Do';
}

/**
 * Validate a card object has required fields.
 * Exported for unit testing.
 * @param {Record<string, any>} card
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImportCard(card) {
  if (!card.title || typeof card.title !== 'string' || card.title.trim().length === 0) {
    return { valid: false, error: 'Missing or empty title' };
  }
  if (!card.type || !VALID_TYPES.includes(card.type)) {
    return { valid: false, error: `Invalid type: ${card.type}. Must be one of: ${VALID_TYPES.join(', ')}` };
  }
  // Validate status against domain-defined statuses for the card type
  if (card.status) {
    const validStatuses = getStatusesForType(card.type);
    if (validStatuses.length > 0 && !validStatuses.includes(card.status)) {
      return { valid: false, error: `Invalid status "${card.status}" for type "${card.type}". Must be one of: ${validStatuses.join(', ')}` };
    }
  }
  return { valid: true };
}

export const importCards = onCall(
  { cors: true, maxInstances: 5 },
  async (request) => {
    const { projectId, cards } = request.data;

    if (!projectId) {
      throw new HttpsError('invalid-argument', 'projectId is required.');
    }
    if (!Array.isArray(cards) || cards.length === 0) {
      throw new HttpsError('invalid-argument', 'cards must be a non-empty array.');
    }
    if (cards.length > 500) {
      throw new HttpsError('invalid-argument', 'Maximum 500 cards per import.');
    }

    const db = getFirestore();
    const projectSnap = await db.doc(`projects/${projectId}`).get();

    if (!projectSnap.exists) {
      throw new HttpsError('not-found', `Project ${projectId} not found.`);
    }

    const project = projectSnap.data();
    const abbreviation = project.abbreviation;
    const counterRef = db.doc(`counters/${projectId}`);

    /** @type {Array<{ cardId?: string, success: boolean, error?: string }>} */
    const results = [];

    // Process cards in batches of 50 for Firestore write limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      const writeBatch = db.batch();

      for (const card of batch) {
        const validation = validateImportCard(card);
        if (!validation.valid) {
          results.push({ success: false, error: validation.error });
          continue;
        }

        try {
          // Atomically increment counter
          const newNum = await db.runTransaction(async (tx) => {
            const counterSnap = await tx.get(counterRef);
            if (!counterSnap.exists) {
              throw new Error(`Counter document for project ${projectId} not found`);
            }
            const current = counterSnap.data()[card.type] ?? 0;
            const next = current + 1;
            tx.update(counterRef, { [card.type]: next });
            return next;
          });

          const prefix = TYPE_PREFIX[card.type];
          const cardId = `${abbreviation}-${prefix}-${String(newNum).padStart(4, '0')}`;

          const cardRef = db.doc(`projects/${projectId}/cards/${cardId}`);
          writeBatch.set(cardRef, {
            ...card,
            cardId,
            title: card.title.trim(),
            status: card.status ?? getDefaultStatusForType(card.type),
            year: card.year ?? new Date().getFullYear(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            createdBy: request.auth?.uid ?? 'import',
          });

          results.push({ cardId, success: true });
        } catch (err) {
          results.push({ success: false, error: err.message });
        }
      }

      await writeBatch.commit();
    }

    return { results };
  }
);

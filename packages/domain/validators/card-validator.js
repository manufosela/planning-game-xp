/**
 * CardValidator — structural validation for card entities.
 */

import { validate as validateCardId } from '../value-objects/card-id.js';
import { isValidStatus } from '../value-objects/status.js';
import { validatePoints } from '../value-objects/priority.js';

const VALID_CARD_TYPES = ['task-card', 'bug-card', 'epic-card', 'proposal-card', 'qa-card', 'sprint-card'];
const REQUIRED_BASE_FIELDS = ['cardId', 'cardType', 'title', 'projectId', 'createdBy'];

/**
 * Check if a field value is "present" (not null, undefined, empty string, or empty array).
 * @param {unknown} value
 * @returns {boolean}
 */
function isPresent(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Validate a card's structure and basic constraints.
 * @param {object} card
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCard(card) {
  const errors = [];

  for (const field of REQUIRED_BASE_FIELDS) {
    if (!isPresent(card[field])) {
      errors.push(`${field} is required`);
    }
  }

  if (card.cardId && !validateCardId(card.cardId)) {
    errors.push(`Invalid cardId format: "${card.cardId}"`);
  }

  if (card.cardType && !VALID_CARD_TYPES.includes(card.cardType)) {
    errors.push(`Invalid cardType: "${card.cardType}". Must be one of: ${VALID_CARD_TYPES.join(', ')}`);
  }

  if (card.cardType && card.status && !isValidStatus(card.cardType, card.status)) {
    errors.push(`Invalid status "${card.status}" for cardType "${card.cardType}"`);
  }

  if (card.cardType === 'task-card') {
    if (card.devPoints != null && !validatePoints(card.devPoints)) {
      errors.push('devPoints must be an integer between 1 and 5');
    }
    if (card.businessPoints != null && !validatePoints(card.businessPoints)) {
      errors.push('businessPoints must be an integer between 1 and 5');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that all required fields are present on a card.
 * @param {object} card
 * @param {string[]} fields
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateRequiredFields(card, fields) {
  const missing = fields.filter((field) => !isPresent(card[field]));
  return { valid: missing.length === 0, missing };
}

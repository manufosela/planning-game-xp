/**
 * TransitionValidator — validates card status transition requirements.
 * Delegates to TransitionService for transition rules and field checks.
 */

import { validateTransition } from '../services/transition-service.js';

/**
 * Validate whether a card meets all requirements for a status transition.
 * @param {object} card - Card data with cardType and status
 * @param {string} toStatus - Target status
 * @returns {{ valid: boolean, missing: string[], reason?: string }}
 */
export function validateTransitionRequirements(card, toStatus) {
  return validateTransition(card, toStatus);
}

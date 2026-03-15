/**
 * Status transition engine — re-exports from @pgv2/domain.
 * @module lib/transitions
 */

export {
  canTransition,
  getAvailableTransitions,
  getRequiredFields,
  isValidatorAction,
  TRANSITION_RULES,
} from '../../packages/domain/services/transitions.js';

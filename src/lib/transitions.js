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
} from '@pgv2/domain/services';

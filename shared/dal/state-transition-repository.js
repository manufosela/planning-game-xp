/**
 * @fileoverview State transition repository interface for tracking card status changes.
 *
 * Path patterns:
 *   /stateTransitions/{projectId}/{cardType}/{cardId}
 *   /stateTransitions/{projectId}/{cardType}/{cardId}/transitions/{transitionId}
 *   /stateTransitions/{projectId}/{cardType}/{cardId}/firstInProgressDate
 *   /stateTransitions/{projectId}/{cardType}/{cardId}/validationCycles
 *   /stateTransitions/{projectId}/{cardType}/{cardId}/reopenCycles
 *
 * @module shared/dal/state-transition-repository
 */

/**
 * @abstract
 */
export class StateTransitionRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === StateTransitionRepository) {
      throw new Error('StateTransitionRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * Get all transition data for a card.
   * @param {string} projectId
   * @param {string} cardType - Normalized type (tasks, bugs, etc.)
   * @param {string} cardId
   * @returns {Promise<Object|null>}
   */
  async getTransitionData(projectId, cardType, cardId) {
    throw new Error('Not implemented: getTransitionData()');
  }

  /**
   * Read a specific field from the transition data.
   * @param {string} projectId
   * @param {string} cardType
   * @param {string} cardId
   * @param {string} field - e.g. 'firstInProgressDate', 'validationCycles'
   * @returns {Promise<*>}
   */
  async getTransitionField(projectId, cardType, cardId, field) {
    throw new Error('Not implemented: getTransitionField()');
  }

  /**
   * Set a specific field in the transition data.
   * @param {string} projectId
   * @param {string} cardType
   * @param {string} cardId
   * @param {string} field
   * @param {*} value
   * @returns {Promise<void>}
   */
  async setTransitionField(projectId, cardType, cardId, field, value) {
    throw new Error('Not implemented: setTransitionField()');
  }

  /**
   * Add a transition entry.
   * @param {string} projectId
   * @param {string} cardType
   * @param {string} cardId
   * @param {Object} data - Transition data
   * @returns {Promise<string>} Generated transition ID
   */
  async addTransition(projectId, cardType, cardId, data) {
    throw new Error('Not implemented: addTransition()');
  }

  /**
   * Subscribe to transition data changes for a card.
   * @param {string} projectId
   * @param {string} cardType
   * @param {string} cardId
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToTransitions(projectId, cardType, cardId, callback) {
    throw new Error('Not implemented: subscribeToTransitions()');
  }

  static get basePath() { return '/stateTransitions'; }

  static buildCardPath(projectId, cardType, cardId) {
    return `/stateTransitions/${projectId}/${cardType}/${cardId}`;
  }

  static buildTransitionsPath(projectId, cardType, cardId) {
    return `/stateTransitions/${projectId}/${cardType}/${cardId}/transitions`;
  }

  static buildFieldPath(projectId, cardType, cardId, field) {
    return `/stateTransitions/${projectId}/${cardType}/${cardId}/${field}`;
  }
}

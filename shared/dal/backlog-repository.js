/**
 * @fileoverview Backlog repository interface for developer backlogs and WIP tracking.
 *
 * Path patterns:
 *   /developerBacklogs/{developerId}
 *   /wip/{developerId}
 *   /wipHistory/{developerId}/{historyId}
 *
 * @module shared/dal/backlog-repository
 */

/**
 * @abstract
 */
export class BacklogRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === BacklogRepository) {
      throw new Error('BacklogRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * Get developer backlog.
   * @param {string} developerId
   * @returns {Promise<Object|null>} { order: [], items: {} }
   */
  async getBacklog(developerId) {
    throw new Error('Not implemented: getBacklog()');
  }

  /**
   * Set developer backlog.
   * @param {string} developerId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setBacklog(developerId, data) {
    throw new Error('Not implemented: setBacklog()');
  }

  /**
   * Update developer backlog fields.
   * @param {string} developerId
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  async updateBacklog(developerId, updates) {
    throw new Error('Not implemented: updateBacklog()');
  }

  /**
   * Get all developer backlogs.
   * @returns {Promise<Object|null>}
   */
  async getAllBacklogs() {
    throw new Error('Not implemented: getAllBacklogs()');
  }

  /**
   * Get current WIP task for a developer.
   * @param {string} developerId
   * @returns {Promise<Object|null>}
   */
  async getWip(developerId) {
    throw new Error('Not implemented: getWip()');
  }

  /**
   * Set WIP task for a developer.
   * @param {string} developerId
   * @param {Object|null} data - null to clear WIP
   * @returns {Promise<void>}
   */
  async setWip(developerId, data) {
    throw new Error('Not implemented: setWip()');
  }

  /**
   * Remove WIP task for a developer.
   * @param {string} developerId
   * @returns {Promise<void>}
   */
  async removeWip(developerId) {
    throw new Error('Not implemented: removeWip()');
  }

  /**
   * Get all WIP entries.
   * @returns {Promise<Object|null>}
   */
  async getAllWip() {
    throw new Error('Not implemented: getAllWip()');
  }

  /**
   * Atomically update WIP using transaction.
   * @param {string} developerId
   * @param {Function} updateFn
   * @returns {Promise<*>}
   */
  async transactionWip(developerId, updateFn) {
    throw new Error('Not implemented: transactionWip()');
  }

  /**
   * Add WIP history entry.
   * @param {string} developerId
   * @param {Object} historyData
   * @returns {Promise<string>} Generated history ID
   */
  async addWipHistory(developerId, historyData) {
    throw new Error('Not implemented: addWipHistory()');
  }

  /**
   * Get WIP history for a developer.
   * @param {string} developerId
   * @returns {Promise<Object|null>}
   */
  async getWipHistory(developerId) {
    throw new Error('Not implemented: getWipHistory()');
  }

  /**
   * Subscribe to WIP changes for a developer.
   * @param {string} developerId
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToWip(developerId, callback) {
    throw new Error('Not implemented: subscribeToWip()');
  }

  /**
   * Subscribe to backlog changes for a developer.
   * @param {string} developerId
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToBacklog(developerId, callback) {
    throw new Error('Not implemented: subscribeToBacklog()');
  }

  static get backlogsPath() { return '/developerBacklogs'; }
  static get wipPath() { return '/wip'; }
  static get wipHistoryPath() { return '/wipHistory'; }

  /**
   * Subscribe to backlog items only for a developer.
   * @param {string} developerId
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToBacklogItems(developerId, callback) {
    throw new Error('Not implemented: subscribeToBacklogItems()');
  }

  static buildBacklogPath(developerId) { return `/developerBacklogs/${developerId}`; }
  static buildBacklogItemsPath(developerId) { return `/developerBacklogs/${developerId}/items`; }
  static buildWipPath(developerId) { return `/wip/${developerId}`; }
  static buildWipHistoryPath(developerId) { return `/wipHistory/${developerId}`; }
}

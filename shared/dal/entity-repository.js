/**
 * @fileoverview Entity repository interface for developers, stakeholders, and teams.
 *
 * Path patterns:
 *   /data/developers/{developerId}
 *   /data/stakeholders/{stakeholderId}
 *   /data/teams/{teamId}
 *   /users/{encodedEmail}
 *
 * @module shared/dal/entity-repository
 */

/**
 * @abstract
 */
export class EntityRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === EntityRepository) {
      throw new Error('EntityRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * Get all developers.
   * @returns {Promise<Object|null>} Map of developerId -> developerData
   */
  async getAllDevelopers() {
    throw new Error('Not implemented: getAllDevelopers()');
  }

  /**
   * Get a single developer by ID.
   * @param {string} developerId
   * @returns {Promise<Object|null>}
   */
  async getDeveloper(developerId) {
    throw new Error('Not implemented: getDeveloper()');
  }

  /**
   * Get all stakeholders.
   * @returns {Promise<Object|null>} Map of stakeholderId -> stakeholderData
   */
  async getAllStakeholders() {
    throw new Error('Not implemented: getAllStakeholders()');
  }

  /**
   * Get a single stakeholder by ID.
   * @param {string} stakeholderId
   * @returns {Promise<Object|null>}
   */
  async getStakeholder(stakeholderId) {
    throw new Error('Not implemented: getStakeholder()');
  }

  /**
   * Get all teams.
   * @returns {Promise<Object|null>} Map of teamId -> teamData
   */
  async getAllTeams() {
    throw new Error('Not implemented: getAllTeams()');
  }

  /**
   * Get user directory entry by email.
   * @param {string} encodedEmail - Email with dots replaced by commas
   * @returns {Promise<Object|null>}
   */
  async getUser(encodedEmail) {
    throw new Error('Not implemented: getUser()');
  }

  /**
   * Set user directory entry.
   * @param {string} encodedEmail
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setUser(encodedEmail, data) {
    throw new Error('Not implemented: setUser()');
  }

  /**
   * Update user directory entry.
   * @param {string} encodedEmail
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  async updateUser(encodedEmail, updates) {
    throw new Error('Not implemented: updateUser()');
  }

  /**
   * Get all users directory.
   * @returns {Promise<Object|null>}
   */
  async getAllUsers() {
    throw new Error('Not implemented: getAllUsers()');
  }

  /**
   * Subscribe to developer list changes.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToDevelopers(callback) {
    throw new Error('Not implemented: subscribeToDevelopers()');
  }

  /**
   * Subscribe to stakeholder list changes.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToStakeholders(callback) {
    throw new Error('Not implemented: subscribeToStakeholders()');
  }

  /**
   * Subscribe to teams changes.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToTeams(callback) {
    throw new Error('Not implemented: subscribeToTeams()');
  }

  /**
   * Subscribe to users directory changes.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToUsers(callback) {
    throw new Error('Not implemented: subscribeToUsers()');
  }

  /**
   * Get all trash users.
   * @returns {Promise<Object|null>}
   */
  async getTrashUsers() {
    throw new Error('Not implemented: getTrashUsers()');
  }

  static get developersPath() { return '/data/developers'; }
  static get stakeholdersPath() { return '/data/stakeholders'; }
  static get teamsPath() { return '/data/teams'; }
  static get usersPath() { return '/users'; }

  static buildDeveloperPath(developerId) { return `/data/developers/${developerId}`; }
  static buildStakeholderPath(stakeholderId) { return `/data/stakeholders/${stakeholderId}`; }
  static buildUserPath(encodedEmail) { return `/users/${encodedEmail}`; }
  static buildLoginHistoryPath(encodedEmail) { return `/loginHistory/${encodedEmail}`; }
  static get trashUsersPath() { return '/trash/users'; }

  /**
   * Get login history for a user (latest entries).
   * @param {string} encodedEmail
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} Login history entries sorted by timestamp desc
   */
  async getLoginHistory(encodedEmail, limit = 50) {
    throw new Error('Not implemented: getLoginHistory()');
  }
}

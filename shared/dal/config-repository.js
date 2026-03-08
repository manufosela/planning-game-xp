/**
 * @fileoverview Config repository interface for global configuration, themes, and app settings.
 *
 * Path patterns:
 *   /global/{type}/{configId}          (agents, prompts, instructions)
 *   /config/theme
 *   /config/ia/enabled
 *   /appConfig/currentVersion
 *   /data/appAdmins/{projectName}
 *   /data/appUploaders/{projectName}
 *   /data/statusList/{cardType}
 *   /data/bugpriorityList
 *   /data/userAdminEmails
 *   /data/projectsByUser/{encodedEmail}
 *   /data/config/defaultProjects
 *   /data/suites/{projectId}/SUITES_{projectId}
 *
 * @module shared/dal/config-repository
 */

/**
 * @abstract
 */
export class ConfigRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === ConfigRepository) {
      throw new Error('ConfigRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * Get all global configs of a type.
   * @param {string} type - 'agents', 'prompts', 'instructions'
   * @returns {Promise<Object|null>}
   */
  async getGlobalConfigs(type) {
    throw new Error('Not implemented: getGlobalConfigs()');
  }

  /**
   * Get a single global config.
   * @param {string} type
   * @param {string} configId
   * @returns {Promise<Object|null>}
   */
  async getGlobalConfig(type, configId) {
    throw new Error('Not implemented: getGlobalConfig()');
  }

  /**
   * Set a global config.
   * @param {string} type
   * @param {string} configId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setGlobalConfig(type, configId, data) {
    throw new Error('Not implemented: setGlobalConfig()');
  }

  /**
   * Remove a global config.
   * @param {string} type
   * @param {string} configId
   * @returns {Promise<void>}
   */
  async removeGlobalConfig(type, configId) {
    throw new Error('Not implemented: removeGlobalConfig()');
  }

  /**
   * Get theme configuration.
   * @returns {Promise<Object|null>}
   */
  async getTheme() {
    throw new Error('Not implemented: getTheme()');
  }

  /**
   * Set theme configuration.
   * @param {Object} themeData
   * @returns {Promise<void>}
   */
  async setTheme(themeData) {
    throw new Error('Not implemented: setTheme()');
  }

  /**
   * Get IA availability status.
   * @returns {Promise<boolean>}
   */
  async getIAEnabled() {
    throw new Error('Not implemented: getIAEnabled()');
  }

  /**
   * Get current app version.
   * @returns {Promise<string|null>}
   */
  async getCurrentVersion() {
    throw new Error('Not implemented: getCurrentVersion()');
  }

  /**
   * Get app admins for a project.
   * @param {string} projectName
   * @returns {Promise<Object|null>}
   */
  async getAppAdmins(projectName) {
    throw new Error('Not implemented: getAppAdmins()');
  }

  /**
   * Get app uploaders for a project.
   * @param {string} projectName
   * @returns {Promise<Object|null>}
   */
  async getAppUploaders(projectName) {
    throw new Error('Not implemented: getAppUploaders()');
  }

  /**
   * Subscribe to theme changes.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToTheme(callback) {
    throw new Error('Not implemented: subscribeToTheme()');
  }

  /**
   * Get status list for a card type.
   * @param {string} cardType - e.g. 'task-card', 'bug-card'
   * @returns {Promise<Object|null>}
   */
  async getStatusList(cardType) {
    throw new Error('Not implemented: getStatusList()');
  }

  /**
   * Get all status lists.
   * @returns {Promise<Object|null>}
   */
  async getAllStatusLists() {
    throw new Error('Not implemented: getAllStatusLists()');
  }

  /**
   * Get bug priority list.
   * @returns {Promise<Object|null>}
   */
  async getBugPriorityList() {
    throw new Error('Not implemented: getBugPriorityList()');
  }

  /**
   * Get user admin emails.
   * @returns {Promise<Array|Object|null>}
   */
  async getUserAdminEmails() {
    throw new Error('Not implemented: getUserAdminEmails()');
  }

  /**
   * Get projects assigned to a user.
   * @param {string} encodedEmail
   * @returns {Promise<string|null>}
   */
  async getUserProjects(encodedEmail) {
    throw new Error('Not implemented: getUserProjects()');
  }

  /**
   * Set projects assigned to a user.
   * @param {string} encodedEmail
   * @param {string} data
   * @returns {Promise<void>}
   */
  async setUserProjects(encodedEmail, data) {
    throw new Error('Not implemented: setUserProjects()');
  }

  /**
   * Get default projects config.
   * @returns {Promise<string|null>}
   */
  async getDefaultProjects() {
    throw new Error('Not implemented: getDefaultProjects()');
  }

  /**
   * Get QA suites for a project.
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  async getSuites(projectId) {
    throw new Error('Not implemented: getSuites()');
  }

  /**
   * Add a QA suite.
   * @param {string} projectId
   * @param {Object} suiteData
   * @returns {Promise<string>} Generated suite ID
   */
  async addSuite(projectId, suiteData) {
    throw new Error('Not implemented: addSuite()');
  }

  /**
   * Delete a QA suite.
   * @param {string} projectId
   * @param {string} suiteId
   * @returns {Promise<void>}
   */
  async deleteSuite(projectId, suiteId) {
    throw new Error('Not implemented: deleteSuite()');
  }

  // --- Developer groups ---

  async getDeveloperGroups() {
    throw new Error('Not implemented: getDeveloperGroups()');
  }

  async setDeveloperGroups(data) {
    throw new Error('Not implemented: setDeveloperGroups()');
  }

  // --- Users directory ---

  async getUsersDirectory() {
    throw new Error('Not implemented: getUsersDirectory()');
  }

  // --- Global proposal order ---

  async getGlobalProposalOrder() {
    throw new Error('Not implemented: getGlobalProposalOrder()');
  }

  async setGlobalProposalOrder(data) {
    throw new Error('Not implemented: setGlobalProposalOrder()');
  }

  subscribeToGlobalProposalOrder(callback) {
    throw new Error('Not implemented: subscribeToGlobalProposalOrder()');
  }

  static get globalBasePath() { return '/global'; }
  static get configPath() { return '/config'; }
  static get appConfigPath() { return '/appConfig'; }
  static get dataPath() { return '/data'; }

  static buildGlobalPath(type) { return `/global/${type}`; }
  static buildGlobalConfigPath(type, configId) { return `/global/${type}/${configId}`; }
  static buildStatusListPath(cardType) { return `/data/statusList/${cardType}`; }
  static buildUserProjectsPath(encodedEmail) { return `/data/projectsByUser/${encodedEmail}`; }
  static buildSuitesPath(projectId) { return `/data/suites/${projectId}/SUITES_${projectId}`; }
  static buildSuitePath(projectId, suiteId) { return `/data/suites/${projectId}/SUITES_${projectId}/${suiteId}`; }
}

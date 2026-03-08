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

  static get globalBasePath() { return '/global'; }
  static get configPath() { return '/config'; }
  static get appConfigPath() { return '/appConfig'; }

  static buildGlobalPath(type) { return `/global/${type}`; }
  static buildGlobalConfigPath(type, configId) { return `/global/${type}/${configId}`; }
}

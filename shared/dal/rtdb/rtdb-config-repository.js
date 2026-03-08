/**
 * @fileoverview RTDB implementation of ConfigRepository.
 *
 * @module shared/dal/rtdb/rtdb-config-repository
 */

import { ConfigRepository } from '../config-repository.js';

export class RtdbConfigRepository extends ConfigRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async getGlobalConfigs(type) {
    return this._repo.read(ConfigRepository.buildGlobalPath(type));
  }

  async getGlobalConfig(type, configId) {
    return this._repo.read(ConfigRepository.buildGlobalConfigPath(type, configId));
  }

  async setGlobalConfig(type, configId, data) {
    await this._repo.write(ConfigRepository.buildGlobalConfigPath(type, configId), data);
  }

  async removeGlobalConfig(type, configId) {
    await this._repo.remove(ConfigRepository.buildGlobalConfigPath(type, configId));
  }

  async getTheme() {
    return this._repo.read('/config/theme');
  }

  async setTheme(themeData) {
    await this._repo.write('/config/theme', themeData);
  }

  async getIAEnabled() {
    const val = await this._repo.read('/config/ia/enabled');
    return val === true;
  }

  async getCurrentVersion() {
    return this._repo.read('/appConfig/currentVersion');
  }

  async getAppAdmins(projectName) {
    return this._repo.read(`/data/appAdmins/${projectName}`);
  }

  async getAppUploaders(projectName) {
    return this._repo.read(`/data/appUploaders/${projectName}`);
  }

  subscribeToTheme(callback) {
    return this._repo.subscribe('/config/theme', callback);
  }
}

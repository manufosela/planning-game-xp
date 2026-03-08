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

  async setCurrentVersion(version) {
    await this._repo.write('/appConfig/currentVersion', version);
  }

  subscribeToCurrentVersion(callback) {
    return this._repo.subscribe('/appConfig/currentVersion', callback);
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

  async getStatusList(cardType) {
    return this._repo.read(ConfigRepository.buildStatusListPath(cardType));
  }

  async getAllStatusLists() {
    return this._repo.read('/data/statusList');
  }

  async getBugPriorityList() {
    return this._repo.read('/data/bugpriorityList');
  }

  async getUserAdminEmails() {
    return this._repo.read('/data/userAdminEmails');
  }

  async getAllProjectsByUser() {
    return this._repo.read('/data/projectsByUser');
  }

  async getUserProjects(encodedEmail) {
    return this._repo.read(ConfigRepository.buildUserProjectsPath(encodedEmail));
  }

  async setUserProjects(encodedEmail, data) {
    await this._repo.write(ConfigRepository.buildUserProjectsPath(encodedEmail), data);
  }

  async getDefaultProjects() {
    return this._repo.read('/data/config/defaultProjects');
  }

  async getSuites(projectId) {
    return this._repo.read(ConfigRepository.buildSuitesPath(projectId));
  }

  async addSuite(projectId, suiteData) {
    return this._repo.push(ConfigRepository.buildSuitesPath(projectId), suiteData);
  }

  async deleteSuite(projectId, suiteId) {
    await this._repo.remove(ConfigRepository.buildSuitePath(projectId, suiteId));
  }

  async getDeveloperGroups() {
    return this._repo.read('/data/developerGroups');
  }

  async setDeveloperGroups(data) {
    await this._repo.write('/data/developerGroups', data);
  }

  async getUsersDirectory() {
    return this._repo.read('/data/usersDirectory');
  }

  async getGlobalProposalOrder() {
    return this._repo.read('/data/globalProposalOrder');
  }

  async setGlobalProposalOrder(data) {
    await this._repo.write('/data/globalProposalOrder', data);
  }

  subscribeToGlobalProposalOrder(callback) {
    return this._repo.subscribe('/data/globalProposalOrder', callback);
  }

  async createIaLink(token, data) {
    return this._repo.write(`/ia/links/${token}`, data);
  }

  async getRelEmailUser() {
    return this._repo.read('/data/relEmailUser');
  }

  async getWipTimelineState() {
    return this._repo.read('/data/wipTimelineState');
  }

  async setWipTimelineState(data) {
    await this._repo.write('/data/wipTimelineState', data);
  }

  async getAllSuites() {
    return this._repo.read('/data/suites');
  }

  subscribeToProjects(callback) {
    return this._repo.subscribe('/projects', callback);
  }

  subscribeToProjectsByUser(callback) {
    return this._repo.subscribe('/data/projectsByUser', callback);
  }

  subscribeToRelEmailUser(callback) {
    return this._repo.subscribe('/data/relEmailUser', callback);
  }

  subscribeToStatusLists(callback) {
    return this._repo.subscribe('/data/statusList', callback);
  }

  subscribeToAllSuites(callback) {
    return this._repo.subscribe('/data/suites', callback);
  }

  subscribeToWipTimelineState(callback) {
    return this._repo.subscribe('/data/wipTimelineState', callback);
  }

  async getDevelopers() {
    return this._repo.read('/data/developers');
  }
}

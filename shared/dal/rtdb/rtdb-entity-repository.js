/**
 * @fileoverview RTDB implementation of EntityRepository.
 *
 * @module shared/dal/rtdb/rtdb-entity-repository
 */

import { EntityRepository } from '../entity-repository.js';

export class RtdbEntityRepository extends EntityRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async getAllDevelopers() {
    return this._repo.read(EntityRepository.developersPath);
  }

  async getDeveloper(developerId) {
    return this._repo.read(EntityRepository.buildDeveloperPath(developerId));
  }

  async getAllStakeholders() {
    return this._repo.read(EntityRepository.stakeholdersPath);
  }

  async getStakeholder(stakeholderId) {
    return this._repo.read(EntityRepository.buildStakeholderPath(stakeholderId));
  }

  async getAllTeams() {
    return this._repo.read(EntityRepository.teamsPath);
  }

  async getUser(encodedEmail) {
    return this._repo.read(EntityRepository.buildUserPath(encodedEmail));
  }

  async setUser(encodedEmail, data) {
    await this._repo.write(EntityRepository.buildUserPath(encodedEmail), data);
  }

  async updateUser(encodedEmail, updates) {
    await this._repo.update(EntityRepository.buildUserPath(encodedEmail), updates);
  }

  async getAllUsers() {
    return this._repo.read(EntityRepository.usersPath);
  }

  subscribeToDevelopers(callback) {
    return this._repo.subscribe(EntityRepository.developersPath, callback);
  }

  subscribeToStakeholders(callback) {
    return this._repo.subscribe(EntityRepository.stakeholdersPath, callback);
  }

  subscribeToTeams(callback) {
    return this._repo.subscribe(EntityRepository.teamsPath, callback);
  }

  subscribeToUsers(callback) {
    return this._repo.subscribe(EntityRepository.usersPath, callback);
  }

  async getTrashUsers() {
    return this._repo.read(EntityRepository.trashUsersPath);
  }
}

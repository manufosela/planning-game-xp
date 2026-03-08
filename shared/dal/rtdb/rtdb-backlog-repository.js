/**
 * @fileoverview RTDB implementation of BacklogRepository.
 *
 * @module shared/dal/rtdb/rtdb-backlog-repository
 */

import { BacklogRepository } from '../backlog-repository.js';

export class RtdbBacklogRepository extends BacklogRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async getBacklog(developerId) {
    return this._repo.read(BacklogRepository.buildBacklogPath(developerId));
  }

  async setBacklog(developerId, data) {
    await this._repo.write(BacklogRepository.buildBacklogPath(developerId), data);
  }

  async updateBacklog(developerId, updates) {
    await this._repo.update(BacklogRepository.buildBacklogPath(developerId), updates);
  }

  async getAllBacklogs() {
    return this._repo.read(BacklogRepository.backlogsPath);
  }

  async getWip(developerId) {
    return this._repo.read(BacklogRepository.buildWipPath(developerId));
  }

  async setWip(developerId, data) {
    await this._repo.write(BacklogRepository.buildWipPath(developerId), data);
  }

  async removeWip(developerId) {
    await this._repo.remove(BacklogRepository.buildWipPath(developerId));
  }

  async getAllWip() {
    return this._repo.read(BacklogRepository.wipPath);
  }

  async transactionWip(developerId, updateFn) {
    return this._repo.transaction(BacklogRepository.buildWipPath(developerId), updateFn);
  }

  async addWipHistory(developerId, historyData) {
    return this._repo.push(BacklogRepository.buildWipHistoryPath(developerId), historyData);
  }

  async getWipHistory(developerId) {
    return this._repo.read(BacklogRepository.buildWipHistoryPath(developerId));
  }

  subscribeToWip(developerId, callback) {
    return this._repo.subscribe(BacklogRepository.buildWipPath(developerId), callback);
  }

  subscribeToBacklog(developerId, callback) {
    return this._repo.subscribe(BacklogRepository.buildBacklogPath(developerId), callback);
  }

  subscribeToBacklogItems(developerId, callback) {
    return this._repo.subscribe(BacklogRepository.buildBacklogItemsPath(developerId), callback);
  }

  async transactionBacklog(developerId, updateFn) {
    return this._repo.transaction(BacklogRepository.buildBacklogPath(developerId), updateFn);
  }

  async getBacklogItem(developerId, cardKey) {
    return this._repo.read(BacklogRepository.buildBacklogItemPath(developerId, cardKey));
  }

  async setBacklogItem(developerId, cardKey, data) {
    await this._repo.write(BacklogRepository.buildBacklogItemPath(developerId, cardKey), data);
  }

  async setBacklogOrder(developerId, order) {
    await this._repo.write(BacklogRepository.buildBacklogOrderPath(developerId), order);
  }

  subscribeToAllBacklogs(callback) {
    return this._repo.subscribe(BacklogRepository.backlogsPath, callback);
  }
}

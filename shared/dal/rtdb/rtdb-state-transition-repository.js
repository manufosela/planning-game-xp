/**
 * @fileoverview RTDB implementation of StateTransitionRepository.
 *
 * @module shared/dal/rtdb/rtdb-state-transition-repository
 */

import { StateTransitionRepository } from '../state-transition-repository.js';

export class RtdbStateTransitionRepository extends StateTransitionRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async getTransitionData(projectId, cardType, cardId) {
    return this._repo.read(StateTransitionRepository.buildCardPath(projectId, cardType, cardId));
  }

  async getTransitionField(projectId, cardType, cardId, field) {
    return this._repo.read(StateTransitionRepository.buildFieldPath(projectId, cardType, cardId, field));
  }

  async setTransitionField(projectId, cardType, cardId, field, value) {
    await this._repo.write(StateTransitionRepository.buildFieldPath(projectId, cardType, cardId, field), value);
  }

  async addTransition(projectId, cardType, cardId, data) {
    return this._repo.push(StateTransitionRepository.buildTransitionsPath(projectId, cardType, cardId), data);
  }

  subscribeToTransitions(projectId, cardType, cardId, callback) {
    return this._repo.subscribe(StateTransitionRepository.buildCardPath(projectId, cardType, cardId), callback);
  }
}

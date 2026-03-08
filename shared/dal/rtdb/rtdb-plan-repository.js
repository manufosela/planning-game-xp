/**
 * @fileoverview RTDB implementation of PlanRepository.
 *
 * @module shared/dal/rtdb/rtdb-plan-repository
 */

import { PlanRepository } from '../plan-repository.js';

export class RtdbPlanRepository extends PlanRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async getAll(projectId) {
    return this._repo.read(PlanRepository.buildPlansPath(projectId));
  }

  async get(projectId, planId) {
    return this._repo.read(PlanRepository.buildPlanPath(projectId, planId));
  }

  async create(projectId, data) {
    return this._repo.push(PlanRepository.buildPlansPath(projectId), data);
  }

  async set(projectId, planId, data) {
    await this._repo.write(PlanRepository.buildPlanPath(projectId, planId), data);
  }

  async remove(projectId, planId) {
    await this._repo.remove(PlanRepository.buildPlanPath(projectId, planId));
  }

  async getAllProposals(projectId) {
    return this._repo.read(PlanRepository.buildProposalsPath(projectId));
  }

  async getProposal(projectId, proposalId) {
    return this._repo.read(PlanRepository.buildProposalPath(projectId, proposalId));
  }

  async createProposal(projectId, data) {
    return this._repo.push(PlanRepository.buildProposalsPath(projectId), data);
  }

  async setProposal(projectId, proposalId, data) {
    await this._repo.write(PlanRepository.buildProposalPath(projectId, proposalId), data);
  }

  async removeProposal(projectId, proposalId) {
    await this._repo.remove(PlanRepository.buildProposalPath(projectId, proposalId));
  }
}

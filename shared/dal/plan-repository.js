/**
 * @fileoverview Plan repository interface for development plans and plan proposals.
 *
 * Path patterns:
 *   /plans/{projectId}/{planId}
 *   /planProposals/{projectId}/{proposalId}
 *
 * @module shared/dal/plan-repository
 */

/**
 * @abstract
 */
export class PlanRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === PlanRepository) {
      throw new Error('PlanRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * Get all plans for a project.
   * @param {string} projectId
   * @returns {Promise<Object|null>} Map of planId -> planData
   */
  async getAll(projectId) {
    throw new Error('Not implemented: getAll()');
  }

  /**
   * Get a single plan.
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<Object|null>}
   */
  async get(projectId, planId) {
    throw new Error('Not implemented: get()');
  }

  /**
   * Create a new plan.
   * @param {string} projectId
   * @param {Object} data
   * @returns {Promise<string>} Generated plan ID
   */
  async create(projectId, data) {
    throw new Error('Not implemented: create()');
  }

  /**
   * Update a plan.
   * @param {string} projectId
   * @param {string} planId
   * @param {Object} data - Full plan data (overwrites)
   * @returns {Promise<void>}
   */
  async set(projectId, planId, data) {
    throw new Error('Not implemented: set()');
  }

  /**
   * Remove a plan.
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<void>}
   */
  async remove(projectId, planId) {
    throw new Error('Not implemented: remove()');
  }

  /**
   * Get all plan proposals for a project.
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  async getAllProposals(projectId) {
    throw new Error('Not implemented: getAllProposals()');
  }

  /**
   * Get a single plan proposal.
   * @param {string} projectId
   * @param {string} proposalId
   * @returns {Promise<Object|null>}
   */
  async getProposal(projectId, proposalId) {
    throw new Error('Not implemented: getProposal()');
  }

  /**
   * Create a new plan proposal.
   * @param {string} projectId
   * @param {Object} data
   * @returns {Promise<string>} Generated proposal ID
   */
  async createProposal(projectId, data) {
    throw new Error('Not implemented: createProposal()');
  }

  /**
   * Update a plan proposal.
   * @param {string} projectId
   * @param {string} proposalId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setProposal(projectId, proposalId, data) {
    throw new Error('Not implemented: setProposal()');
  }

  /**
   * Remove a plan proposal.
   * @param {string} projectId
   * @param {string} proposalId
   * @returns {Promise<void>}
   */
  async removeProposal(projectId, proposalId) {
    throw new Error('Not implemented: removeProposal()');
  }

  static get plansBasePath() { return '/plans'; }
  static get proposalsBasePath() { return '/planProposals'; }

  static buildPlansPath(projectId) { return `/plans/${projectId}`; }
  static buildPlanPath(projectId, planId) { return `/plans/${projectId}/${planId}`; }
  static buildProposalsPath(projectId) { return `/planProposals/${projectId}`; }
  static buildProposalPath(projectId, proposalId) { return `/planProposals/${projectId}/${proposalId}`; }
}

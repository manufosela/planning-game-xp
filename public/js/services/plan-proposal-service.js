/**
 * Plan Proposal Service
 * Handles CRUD operations for plan proposals stored per project in Firebase Realtime Database
 *
 * Structure:
 * /planProposals/{projectId}/{proposalId}/
 *   title, description, status, tags, planIds, sourceDocumentUrl, createdAt, createdBy, updatedAt, updatedBy
 */

export const PROPOSAL_STATUSES = ['pending', 'planned', 'rejected'];

class PlanProposalService {
  constructor() {
    this.cache = new Map();
    this.projectCache = new Map();
  }

  /**
   * Get Firebase modules dynamically
   */
  async getFirebaseModules() {
    const module = await import(
      /* @vite-ignore */ `${window.location.origin}/firebase-config.js`
    );
    return {
      database: module.database,
      ref: module.ref,
      get: module.get,
      set: module.set,
      push: module.push,
      remove: module.remove,
      auth: module.auth
    };
  }

  _getCacheKey(projectId, proposalId) {
    return `${projectId}/${proposalId}`;
  }

  /**
   * Get all proposals for a project
   * @param {string} projectId
   * @returns {Promise<Array>}
   */
  async getAll(projectId) {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    try {
      const { database, ref, get } = await this.getFirebaseModules();
      const proposalsRef = ref(database, `planProposals/${projectId}`);
      const snapshot = await get(proposalsRef);

      if (!snapshot.exists()) {
        return [];
      }

      const proposals = [];
      snapshot.forEach((child) => {
        const proposal = { id: child.key, ...child.val() };
        proposals.push(proposal);
        this.cache.set(this._getCacheKey(projectId, proposal.id), proposal);
      });

      proposals.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      this.projectCache.set(projectId, proposals);
      return proposals;
    } catch (error) {
      console.error('Error getting plan proposals:', error);
      throw error;
    }
  }

  /**
   * Get a single proposal
   * @param {string} projectId
   * @param {string} proposalId
   * @returns {Promise<Object|null>}
   */
  async get(projectId, proposalId) {
    if (!projectId || !proposalId) {
      throw new Error('projectId and proposalId are required');
    }

    const cacheKey = this._getCacheKey(projectId, proposalId);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const { database, ref, get } = await this.getFirebaseModules();
      const proposalRef = ref(database, `planProposals/${projectId}/${proposalId}`);
      const snapshot = await get(proposalRef);

      if (!snapshot.exists()) {
        return null;
      }

      const proposal = { id: proposalId, projectId, ...snapshot.val() };
      this.cache.set(cacheKey, proposal);
      return proposal;
    } catch (error) {
      console.error('Error getting plan proposal:', error);
      throw error;
    }
  }

  /**
   * Save a proposal (create or update)
   * @param {string} projectId
   * @param {Object} proposal
   * @returns {Promise<Object>}
   */
  async save(projectId, proposal) {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    try {
      const { database, ref, set, push, get: fbGet, auth } = await this.getFirebaseModules();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated');
      }

      const now = new Date().toISOString();
      const isNew = !proposal.id;
      let proposalId = proposal.id;

      if (isNew) {
        const proposalsRef = ref(database, `planProposals/${projectId}`);
        const newRef = push(proposalsRef);
        proposalId = newRef.key;
      }

      const status = proposal.status || 'pending';
      if (!PROPOSAL_STATUSES.includes(status)) {
        throw new Error(`Invalid proposal status: ${status}. Valid: ${PROPOSAL_STATUSES.join(', ')}`);
      }

      if (!proposal.title || proposal.title.length > 200) {
        throw new Error('Title is required and must be 200 characters or less');
      }

      if (proposal.description && proposal.description.length > 5000) {
        throw new Error('Description must be 5000 characters or less');
      }

      let previousData = null;
      if (!isNew) {
        const existingRef = ref(database, `planProposals/${projectId}/${proposalId}`);
        const snap = await fbGet(existingRef);
        if (snap.exists()) {
          previousData = snap.val();
        }
      }

      const data = {
        title: proposal.title,
        description: proposal.description || '',
        status,
        tags: proposal.tags || [],
        planIds: proposal.planIds || previousData?.planIds || [],
        sourceDocumentUrl: proposal.sourceDocumentUrl || '',
        updatedAt: now,
        updatedBy: currentUser.email
      };

      if (isNew) {
        data.createdAt = now;
        data.createdBy = currentUser.email;
      } else {
        data.createdAt = previousData?.createdAt || now;
        data.createdBy = previousData?.createdBy || currentUser.email;
      }

      const proposalRef = ref(database, `planProposals/${projectId}/${proposalId}`);
      await set(proposalRef, data);

      const saved = { id: proposalId, projectId, ...data };
      this.cache.set(this._getCacheKey(projectId, proposalId), saved);
      this.projectCache.delete(projectId);

      return saved;
    } catch (error) {
      console.error('Error saving plan proposal:', error);
      throw error;
    }
  }

  /**
   * Delete a proposal
   * @param {string} projectId
   * @param {string} proposalId
   * @returns {Promise<boolean>}
   */
  async delete(projectId, proposalId) {
    if (!projectId || !proposalId) {
      throw new Error('projectId and proposalId are required');
    }

    try {
      const { database, ref, remove, auth } = await this.getFirebaseModules();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated');
      }

      const proposalRef = ref(database, `planProposals/${projectId}/${proposalId}`);
      await remove(proposalRef);

      this.cache.delete(this._getCacheKey(projectId, proposalId));
      this.projectCache.delete(projectId);

      return true;
    } catch (error) {
      console.error('Error deleting plan proposal:', error);
      throw error;
    }
  }

  /**
   * Link a plan ID to a proposal
   * @param {string} projectId
   * @param {string} proposalId
   * @param {string} planId
   * @returns {Promise<Object>}
   */
  async linkPlan(projectId, proposalId, planId) {
    const proposal = await this.get(projectId, proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const planIds = proposal.planIds || [];
    if (!planIds.includes(planId)) {
      planIds.push(planId);
    }

    return this.save(projectId, {
      ...proposal,
      planIds,
      status: 'planned'
    });
  }

  /**
   * Clear cache
   * @param {string} [projectId]
   */
  clearCache(projectId) {
    if (projectId) {
      this.projectCache.delete(projectId);
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${projectId}/`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.projectCache.clear();
    }
  }
}

export const planProposalService = new PlanProposalService();

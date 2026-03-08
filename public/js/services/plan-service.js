/**
 * Plan Service
 * Handles CRUD operations for development plans via DAL,
 * plus calls to Cloud Functions for AI generation and task creation.
 *
 * Structure:
 * /plans/{projectId}/{planId}/
 *   title, objective, content (markdown), phases[], generatedTasks[], createdAt, createdBy, updatedAt
 */

import { dalService } from './dal-service.js';

export const PLAN_STATUSES = ['draft', 'accepted'];

class PlanService {
  constructor() {
    this.cache = new Map();
    this.projectCache = new Map();
  }

  /**
   * Get Firebase modules for Cloud Functions and Auth only.
   * RTDB operations go through DAL.
   */
  async _getCloudModules() {
    const module = await import(
      /* @vite-ignore */ `${window.location.origin}/firebase-config.js`
    );
    return {
      auth: module.auth,
      functions: module.functions,
      httpsCallable: module.httpsCallable
    };
  }

  _getCacheKey(projectId, planId) {
    return `${projectId}/${planId}`;
  }

  /**
   * Get all plans for a project
   * @param {string} projectId
   * @returns {Promise<Array>}
   */
  async getAll(projectId) {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    try {
      const data = await dalService.plans.getAll(projectId);

      if (!data) {
        return [];
      }

      const plans = Object.entries(data).map(([key, val]) => {
        const plan = { _id: key, ...val };
        this.cache.set(this._getCacheKey(projectId, key), plan);
        return plan;
      });

      // Sort: drafts first, then by updatedAt desc
      plans.sort((a, b) => {
        const order = { draft: 0, accepted: 1 };
        const sa = order[a.status] ?? 99;
        const sb = order[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });

      this.projectCache.set(projectId, plans);
      return plans;
    } catch (error) {
      console.error('Error getting plans:', error);
      throw error;
    }
  }

  /**
   * Get a single plan
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<Object|null>}
   */
  async get(projectId, planId) {
    if (!projectId || !planId) {
      throw new Error('projectId and planId are required');
    }

    const cacheKey = this._getCacheKey(projectId, planId);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const data = await dalService.plans.get(projectId, planId);

      if (!data) {
        return null;
      }

      const plan = { _id: planId, ...data };
      this.cache.set(cacheKey, plan);
      return plan;
    } catch (error) {
      console.error('Error getting plan:', error);
      throw error;
    }
  }

  /**
   * Save a plan (create or update)
   * @param {string} projectId
   * @param {Object} plan
   * @returns {Promise<Object>}
   */
  async save(projectId, plan) {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    try {
      const { auth } = await this._getCloudModules();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated');
      }

      const now = new Date().toISOString();
      const isNew = !plan._id;
      let planId = plan._id;

      let previousData = null;
      if (!isNew) {
        previousData = await dalService.plans.get(projectId, planId);
      }

      const data = {
        title: plan.title || 'Untitled Plan',
        objective: plan.objective || '',
        content: plan.content || previousData?.content || '',
        status: plan.status || previousData?.status || 'draft',
        phases: plan.phases || [],
        updatedAt: now
      };

      // Preserve generated tasks
      if (previousData?.generatedTasks) {
        data.generatedTasks = previousData.generatedTasks;
      }
      if (plan.generatedTasks) {
        data.generatedTasks = plan.generatedTasks;
      }

      // Preserve proposalId if linked
      if (previousData?.proposalId) {
        data.proposalId = previousData.proposalId;
      }
      if (plan.proposalId) {
        data.proposalId = plan.proposalId;
      }

      if (isNew) {
        data.createdAt = now;
        data.createdBy = currentUser.email;
        planId = await dalService.plans.create(projectId, data);
      } else {
        data.createdAt = previousData?.createdAt || now;
        data.createdBy = previousData?.createdBy || currentUser.email;

        // Preserve epicIds/taskIds from existing phases
        if (previousData?.phases) {
          data.phases = data.phases.map((phase, i) => {
            const existingPhase = previousData.phases[i];
            if (existingPhase) {
              phase.epicIds = existingPhase.epicIds || phase.epicIds || [];
              phase.taskIds = existingPhase.taskIds || phase.taskIds || [];
            }
            return phase;
          });
        }

        await dalService.plans.set(projectId, planId, data);
      }

      const saved = { _id: planId, ...data };
      this.cache.set(this._getCacheKey(projectId, planId), saved);
      this.projectCache.delete(projectId);

      return saved;
    } catch (error) {
      console.error('Error saving plan:', error);
      throw error;
    }
  }

  /**
   * Delete a plan
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<boolean>}
   */
  async delete(projectId, planId) {
    if (!projectId || !planId) {
      throw new Error('projectId and planId are required');
    }

    try {
      await dalService.plans.remove(projectId, planId);

      this.cache.delete(this._getCacheKey(projectId, planId));
      this.projectCache.delete(projectId);
      return true;
    } catch (error) {
      console.error('Error deleting plan:', error);
      throw error;
    }
  }

  /**
   * Generate a plan using AI (Cloud Function)
   * @param {string} projectId
   * @param {string} context - Description or specification text
   * @param {string} [existingPlanJson] - Optional JSON of existing plan for refinement
   * @returns {Promise<Object>} Generated plan data
   */
  async generateWithAI(projectId, context, existingPlanJson) {
    const { functions, httpsCallable } = await this._getCloudModules();
    const generateDevPlan = httpsCallable(functions, 'generateDevPlan');
    const params = { projectId, context };
    if (existingPlanJson) {
      params.existingPlanJson = existingPlanJson;
    }
    const result = await generateDevPlan(params);
    const generatedPlan = result.data?.plan;
    if (!generatedPlan) {
      throw new Error('No plan returned from AI');
    }
    return generatedPlan;
  }

  /**
   * Generate tasks from an accepted plan (Cloud Function)
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<Object>} { createdTasks, totalCreated }
   */
  async generateTasksFromPlan(projectId, planId) {
    const { functions, httpsCallable } = await this._getCloudModules();
    const createTasksFn = httpsCallable(functions, 'createTasksFromPlan');
    const result = await createTasksFn({ projectId, planId });
    return result.data;
  }

  /**
   * Regenerate tasks from a plan (Cloud Function)
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<Object>} { createdTasks, totalCreated, skippedTasks }
   */
  async regenerateTasksFromPlan(projectId, planId) {
    const { functions, httpsCallable } = await this._getCloudModules();
    const regenerateFn = httpsCallable(functions, 'regenerateTasksFromPlan');
    const result = await regenerateFn({ projectId, planId });
    return result.data;
  }

  /**
   * Refresh a plan's data from DAL (after task generation, etc.)
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<Object>}
   */
  async refresh(projectId, planId) {
    const cacheKey = this._getCacheKey(projectId, planId);
    this.cache.delete(cacheKey);
    this.projectCache.delete(projectId);

    const data = await dalService.plans.get(projectId, planId);

    if (!data) {
      return null;
    }

    const plan = { _id: planId, ...data };
    this.cache.set(cacheKey, plan);
    return plan;
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

export const planService = new PlanService();

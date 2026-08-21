/**
 * Plan Service
 * Handles CRUD operations for development plans stored per project in Firebase Realtime Database,
 * plus calls to Cloud Functions for AI generation and task creation.
 *
 * Structure:
 * /plans/{projectId}/{planId}/
 *   title, objective, status, phases[], generatedTasks[], createdAt, createdBy, updatedAt
 */

export const PLAN_STATUSES = ['draft', 'accepted'];

class PlanService {
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
      const { database, ref, get } = await this.getFirebaseModules();
      const plansRef = ref(database, `plans/${projectId}`);
      const snapshot = await get(plansRef);

      if (!snapshot.exists()) {
        return [];
      }

      const plans = [];
      snapshot.forEach((child) => {
        const plan = { _id: child.key, ...child.val() };
        plans.push(plan);
        this.cache.set(this._getCacheKey(projectId, plan._id), plan);
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
      const { database, ref, get } = await this.getFirebaseModules();
      const planRef = ref(database, `plans/${projectId}/${planId}`);
      const snapshot = await get(planRef);

      if (!snapshot.exists()) {
        return null;
      }

      const plan = { _id: planId, ...snapshot.val() };
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
      const { database, ref, set, push, get: fbGet, auth } = await this.getFirebaseModules();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated');
      }

      const now = new Date().toISOString();
      const isNew = !plan._id;
      let planId = plan._id;

      let previousData = null;
      if (!isNew) {
        const existingRef = ref(database, `plans/${projectId}/${planId}`);
        const snap = await fbGet(existingRef);
        if (snap.exists()) {
          previousData = snap.val();
        }
      }

      const data = {
        title: plan.title || 'Untitled Plan',
        objective: plan.objective || '',
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

      // Origin proposal. New plans link to a proposal CARD (PLN-TSK-0357);
      // the legacy plan-proposal link of old plans is preserved untouched.
      if (previousData?.proposalId) {
        data.proposalId = previousData.proposalId;
      }
      if (previousData?.proposalCardId) {
        data.proposalCardId = previousData.proposalCardId;
      }
      if (plan.proposalCardId) {
        data.proposalCardId = plan.proposalCardId;
      }

      // Every plan carries a human card id (PMC-BUG-0003). Plans created here
      // used to miss it — only MCP-created ones had it — which left them
      // unreferenceable from tasks, proposals and the MCP tools.
      // Imported dynamically: this service deliberately keeps no static
      // Firebase dependencies (see getFirebaseModules).
      if (previousData?.cardId) {
        data.cardId = previousData.cardId;
      } else {
        const { FirebaseService } = await import('./firebase-service.js');
        data.cardId = await FirebaseService.generateProjectSectionId(projectId, 'plans');
      }

      if (isNew) {
        data.createdAt = now;
        data.createdBy = currentUser.email;
        const plansRef = ref(database, `plans/${projectId}`);
        const newRef = push(plansRef);
        planId = newRef.key;
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
      }

      const planRef = ref(database, `plans/${projectId}/${planId}`);
      await set(planRef, data);

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
   * Accept a plan (change status to accepted)
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<void>}
   */
  async accept(projectId, planId) {
    const { database, ref, set } = await this.getFirebaseModules();
    const now = new Date().toISOString();
    await set(ref(database, `plans/${projectId}/${planId}/status`), 'accepted');
    await set(ref(database, `plans/${projectId}/${planId}/updatedAt`), now);

    // Update cache
    const cacheKey = this._getCacheKey(projectId, planId);
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      cached.status = 'accepted';
      cached.updatedAt = now;
    }
    this.projectCache.delete(projectId);
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
      const { database, ref, remove } = await this.getFirebaseModules();
      const planRef = ref(database, `plans/${projectId}/${planId}`);
      await remove(planRef);

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
    const { functions, httpsCallable } = await this.getFirebaseModules();
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
    const { functions, httpsCallable } = await this.getFirebaseModules();
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
    const { functions, httpsCallable } = await this.getFirebaseModules();
    const regenerateFn = httpsCallable(functions, 'regenerateTasksFromPlan');
    const result = await regenerateFn({ projectId, planId });
    return result.data;
  }

  /**
   * Refresh a plan's data from Firebase (after task generation, etc.)
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<Object>}
   */
  async refresh(projectId, planId) {
    const cacheKey = this._getCacheKey(projectId, planId);
    this.cache.delete(cacheKey);
    this.projectCache.delete(projectId);

    const { database, ref, get } = await this.getFirebaseModules();
    const planRef = ref(database, `plans/${projectId}/${planId}`);
    const snapshot = await get(planRef);

    if (!snapshot.exists()) {
      return null;
    }

    const plan = { _id: planId, ...snapshot.val() };
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

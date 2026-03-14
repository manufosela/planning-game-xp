import {
  getPlans as fsGetPlans,
  createPlan,
  updatePlan,
  deletePlan as fsDeletePlan,
} from '../../lib/firestore.js';

/**
 * Firebase implementation of PlanRepository port.
 * @implements {import('@pgv2/domain/ports').PlanRepository}
 */
export class FirebasePlanRepository {
  /**
   * @param {string} projectId
   * @returns {Promise<import('@pgv2/domain/ports').Plan[]>}
   */
  async getPlans(projectId) {
    return fsGetPlans(projectId);
  }

  /**
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<import('@pgv2/domain/ports').Plan | null>}
   */
  async getPlan(projectId, planId) {
    const plans = await fsGetPlans(projectId);
    return plans.find((p) => p.planId === planId) ?? null;
  }

  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').Plan} plan
   * @returns {Promise<void>}
   */
  async savePlan(projectId, plan) {
    if (plan.planId) {
      const { planId, ...data } = plan;
      await updatePlan(projectId, planId, data);
    } else {
      await createPlan(projectId, plan);
    }
  }

  /**
   * @param {string} projectId
   * @param {string} planId
   * @returns {Promise<void>}
   */
  async deletePlan(projectId, planId) {
    await fsDeletePlan(projectId, planId);
  }
}

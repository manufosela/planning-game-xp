import { Plan } from '../entities/plan';

export interface PlanRepository {
  getPlans(projectId: string): Promise<Plan[]>;
  getPlan(projectId: string, planId: string): Promise<Plan | null>;
  savePlan(projectId: string, plan: Plan): Promise<void>;
  deletePlan(projectId: string, planId: string): Promise<void>;
}

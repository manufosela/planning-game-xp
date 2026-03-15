import { Timestamp } from './timestamp';

export type PlanStatus = 'draft' | 'accepted' | 'rejected';

export interface PlanPhase {
  title: string;
  description: string;
  estimatedPoints: number;
  taskIds?: string[];
}

export interface Plan {
  planId?: string;
  projectId: string;
  title: string;
  objective: string;
  status: PlanStatus;
  phases: PlanPhase[];
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

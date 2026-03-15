import { Timestamp } from '../entities/timestamp';

export interface StateTransition {
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  changedAt: Timestamp;
  durationInPreviousStatus?: number;
}

export interface MetricFilters {
  year?: number;
  sprint?: string;
  developer?: string;
  type?: string;
}

export interface TransitionMetrics {
  avgCycleTime: Record<string, number>;
  transitionCounts: Record<string, number>;
  bottlenecks: Array<{ status: string; avgDuration: number }>;
}

export interface StateTransitionRepository {
  recordTransition(projectId: string, cardId: string, transition: StateTransition): Promise<void>;
  getTransitions(projectId: string, cardId: string): Promise<StateTransition[]>;
  getMetrics(projectId: string, filters?: MetricFilters): Promise<TransitionMetrics>;
}

/**
 * Type re-exports for domain services.
 * Re-exports from the main src/lib/types.d.ts via entities.
 */

// Card-related types
export type { Card, Task, Bug, BaseCard, CardType } from '../entities/card.d.ts';
export type { User, ProjectRole, UserRole } from '../entities/user.d.ts';

// Workflow types
export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  missing?: string[];
}

export interface FilterState {
  type: string | 'all' | null;
  status: string | 'all' | null;
  year: number | null;
  developer: string | null;
  sprint: string | null;
  epic: string | null;
  tags: string[];
  query?: string;
  search: string;
}

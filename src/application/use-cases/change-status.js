/**
 * ChangeStatus use case — the most complex use case.
 * Validates transitions, checks permissions, manages WIP limits, and tracks work cycles.
 * @module application/use-cases/change-status
 */

import { canTransition, TRANSITION_RULES } from '../../lib/transitions.js';
import { canChangeStatus } from '../../lib/permissions.js';

/**
 * Valid statuses for card types that don't have full transition rules.
 * Prevents persisting arbitrary status strings.
 * @type {Record<string, string[]>}
 */
const VALID_STATUSES = {
  proposal: ['Pending', 'Planned', 'Accepted', 'Rejected', 'Deferred'],
  epic: ['Draft', 'Active', 'Done', 'Cancelled'],
  qa: ['Created', 'In Progress', 'Passed', 'Failed', 'Blocked'],
};

/**
 * @typedef {Object} ChangeStatusDeps
 * @property {{ get: (projectId: string, cardId: string) => Promise<any>, update: (projectId: string, cardId: string, updates: any) => Promise<void>, countByStatus: (projectId: string, status: string) => Promise<number> }} cardRepository
 * @property {{ add: (projectId: string, cardId: string, entry: any) => Promise<void> }} historyRepository
 * @property {{ getWipLimit: (projectId: string) => Promise<number> }} stateTransitionRepository
 * @property {{ addCard: (projectId: string, cardId: string, developerId: string) => Promise<void>, removeCard: (projectId: string, cardId: string) => Promise<void> }} backlogRepository
 */

export class ChangeStatus {
  /** @param {ChangeStatusDeps} deps */
  constructor({ cardRepository, historyRepository, stateTransitionRepository, backlogRepository }) {
    this._cardRepo = cardRepository;
    this._historyRepo = historyRepository;
    this._transitionRepo = stateTransitionRepository;
    this._backlogRepo = backlogRepository;
  }

  /**
   * Change a card's status.
   * @param {string} projectId
   * @param {string} cardId
   * @param {string} targetStatus
   * @param {any} user
   * @param {any} project
   * @returns {Promise<{ previousStatus: string, newStatus: string, workCycle?: any }>}
   */
  async execute(projectId, cardId, targetStatus, user, project) {
    const card = await this._cardRepo.get(projectId, cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    const previousStatus = card.status;

    // Check project-level permissions
    const permResult = canChangeStatus(card, targetStatus, user, project);
    if (!permResult.allowed) {
      throw new Error(permResult.reason);
    }

    // Check transition rules (required fields, validator-only)
    if (TRANSITION_RULES[card.type]) {
      const transResult = canTransition(card, targetStatus, user);
      if (!transResult.allowed) {
        throw new Error(transResult.reason);
      }
    } else {
      // For card types without full transition rules (proposal, epic, qa),
      // validate that the target status is one of the known valid statuses.
      const validStatuses = VALID_STATUSES[card.type];
      if (validStatuses) {
        if (!validStatuses.includes(targetStatus)) {
          throw new Error(`Invalid status "${targetStatus}" for card type "${card.type}". Valid statuses: ${validStatuses.join(', ')}`);
        }
      } else {
        throw new Error(`No status rules defined for card type "${card.type}"`);
      }
    }

    const now = new Date().toISOString();
    const updates = /** @type {Record<string, any>} */ ({ status: targetStatus });

    // WIP limit and work cycle management — only for tasks
    if (card.type === 'task') {
      if (targetStatus === 'In Progress') {
        // Check WIP limit
        const wipLimit = await this._transitionRepo.getWipLimit(projectId);
        if (wipLimit > 0) {
          const currentWip = await this._cardRepo.countByStatus(projectId, 'In Progress');
          if (currentWip >= wipLimit) {
            throw new Error(`WIP limit reached (${wipLimit}). Complete or move existing tasks before starting new ones.`);
          }
        }

        // Start a new work cycle
        const workCycles = [...(card.workCycles || [])];
        updates.startDate = now;
        updates.endDate = null;
        workCycles.push({ startDate: now });
        updates.workCycles = workCycles;
      }

      if (previousStatus === 'In Progress' && targetStatus !== 'In Progress') {
        // End the current work cycle
        const workCycles = [...(card.workCycles || [])];
        updates.endDate = now;
        if (workCycles.length > 0) {
          const lastCycle = workCycles[workCycles.length - 1];
          if (!lastCycle.endDate) {
            lastCycle.endDate = now;
          }
        }
        updates.workCycles = workCycles;
      }
    }

    await this._cardRepo.update(projectId, cardId, updates);

    // Update developer backlog when transitioning in/out of In Progress
    const developerId = card.developer?.id;
    if (developerId) {
      if (targetStatus === 'In Progress') {
        await this._backlogRepo.addCard(projectId, cardId, developerId);
      } else if (previousStatus === 'In Progress') {
        await this._backlogRepo.removeCard(projectId, cardId, developerId);
      }
    }

    await this._historyRepo.add(projectId, cardId, {
      action: 'status_changed',
      userId: user.uid,
      timestamp: now,
      previousStatus,
      newStatus: targetStatus,
    });

    const finalWorkCycles = updates.workCycles ?? card.workCycles ?? [];
    return {
      previousStatus,
      newStatus: targetStatus,
      workCycle: finalWorkCycles.length > 0 ? finalWorkCycles[finalWorkCycles.length - 1] : undefined,
    };
  }
}

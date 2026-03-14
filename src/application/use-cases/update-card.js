/**
 * UpdateCard use case — updates card fields with permission checks and diff-based history.
 * @module application/use-cases/update-card
 */

import { canEditCard } from '../../lib/permissions.js';

/**
 * @typedef {Object} UpdateCardDeps
 * @property {{ get: (projectId: string, cardId: string) => Promise<any>, update: (projectId: string, cardId: string, updates: any) => Promise<void> }} cardRepository
 * @property {{ add: (projectId: string, cardId: string, entry: any) => Promise<void> }} historyRepository
 */

export class UpdateCard {
  /** @param {UpdateCardDeps} deps */
  constructor({ cardRepository, historyRepository }) {
    this._cardRepo = cardRepository;
    this._historyRepo = historyRepository;
  }

  /**
   * Update a card's fields.
   * @param {string} projectId
   * @param {string} cardId
   * @param {Record<string, any>} updates
   * @param {any} user
   * @param {{ id: string }} project
   * @returns {Promise<{ updated: boolean, changes: Record<string, { from: any, to: any }> }>}
   */
  async execute(projectId, cardId, updates, user, project) {
    const card = await this._cardRepo.get(projectId, cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    if (!canEditCard(card, user, project)) {
      throw new Error('Permission denied: user cannot edit this card');
    }

    // Calculate diff
    const changes = /** @type {Record<string, { from: any, to: any }>} */ ({});
    for (const [key, value] of Object.entries(updates)) {
      if (card[key] !== value) {
        changes[key] = { from: card[key], to: value };
      }
    }

    await this._cardRepo.update(projectId, cardId, updates);

    const now = new Date().toISOString();
    await this._historyRepo.add(projectId, cardId, {
      action: 'updated',
      userId: user.uid,
      timestamp: now,
      changes,
    });

    return { updated: true, changes };
  }
}

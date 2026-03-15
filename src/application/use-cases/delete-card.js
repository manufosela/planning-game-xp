/**
 * DeleteCard use case — soft-deletes a card (moves to trash) with permission checks.
 * @module application/use-cases/delete-card
 */

import { canDeleteCard } from '../../lib/permissions.js';

/**
 * @typedef {Object} DeleteCardDeps
 * @property {{ get: (projectId: string, cardId: string) => Promise<any>, moveToTrash: (projectId: string, cardId: string) => Promise<void> }} cardRepository
 * @property {{ add: (projectId: string, cardId: string, entry: any) => Promise<void> }} historyRepository
 */

export class DeleteCard {
  /** @param {DeleteCardDeps} deps */
  constructor({ cardRepository, historyRepository }) {
    this._cardRepo = cardRepository;
    this._historyRepo = historyRepository;
  }

  /**
   * Soft-delete a card (move to trash).
   * @param {string} projectId
   * @param {string} cardId
   * @param {any} user
   * @param {{ id: string }} project
   * @returns {Promise<{ deleted: boolean }>}
   */
  async execute(projectId, cardId, user, project) {
    const card = await this._cardRepo.get(projectId, cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    if (!canDeleteCard(card, user, project)) {
      throw new Error('Permission denied: user cannot delete this card');
    }

    await this._cardRepo.moveToTrash(projectId, cardId);

    const now = new Date().toISOString();
    await this._historyRepo.add(projectId, cardId, {
      action: 'deleted',
      userId: user.uid,
      timestamp: now,
    });

    return { deleted: true };
  }
}

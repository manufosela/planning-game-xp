/**
 * CreateCard use case — creates a new card with permission checks and history tracking.
 * @module application/use-cases/create-card
 */

import { canEditCard } from '../../lib/permissions.js';

/**
 * @typedef {Object} CreateCardDeps
 * @property {{ generateId: (projectId: string, type: string) => string, save: (projectId: string, cardId: string, data: any) => Promise<void> }} cardRepository
 * @property {{ add: (projectId: string, cardId: string, entry: any) => Promise<void> }} historyRepository
 * @property {{ addCard: (projectId: string, cardId: string, developerId: string) => Promise<void> }} backlogRepository
 */

export class CreateCard {
  /** @param {CreateCardDeps} deps */
  constructor({ cardRepository, historyRepository, backlogRepository }) {
    this._cardRepo = cardRepository;
    this._historyRepo = historyRepository;
    this._backlogRepo = backlogRepository;
  }

  /**
   * Create a new card.
   * @param {string} projectId
   * @param {any} data - Card data (title, type, status, year, etc.)
   * @param {any} user - Authenticated user
   * @param {{ id: string }} project
   * @returns {Promise<{ cardId: string, card: any }>}
   */
  async execute(projectId, data, user, project) {
    // Use canEditCard with the card data to enforce role-based permissions:
    // consultants are blocked, stakeholders can only create proposals
    if (!canEditCard(/** @type {any} */ (data), user, project)) {
      throw new Error('Permission denied: user cannot create cards in this project');
    }

    const cardId = this._cardRepo.generateId(projectId, data.type);
    const now = new Date().toISOString();

    const card = {
      ...data,
      cardId,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await this._cardRepo.save(projectId, cardId, card);

    // Add to developer backlog if card has an assigned developer
    if (data.developer?.id) {
      await this._backlogRepo.addCard(projectId, cardId, data.developer.id);
    }

    await this._historyRepo.add(projectId, cardId, {
      action: 'created',
      userId: user.uid,
      timestamp: now,
      data: card,
    });

    return { cardId, card };
  }
}

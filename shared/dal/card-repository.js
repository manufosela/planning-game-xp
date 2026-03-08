/**
 * @fileoverview Card repository interface for CRUD operations on cards.
 * Cards include: tasks, bugs, epics, proposals, sprints, QA items.
 *
 * Path pattern: /cards/{projectId}/{SECTION}_{projectId}/{firebaseId}
 *
 * @module shared/dal/card-repository
 */

import { buildSectionPath, SECTION_MAP } from '../utils.js';

/**
 * @typedef {Object} CardFilters
 * @property {string} [status] - Filter by status
 * @property {string} [sprint] - Filter by sprint ID
 * @property {string} [developer] - Filter by developer ID
 * @property {number} [year] - Filter by year
 * @property {string} [planId] - Filter by plan ID
 */

/**
 * @typedef {Object} CreateCardResult
 * @property {string} firebaseId - Generated Firebase key
 * @property {Object} data - The saved card data
 */

/**
 * @abstract
 */
export class CardRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === CardRepository) {
      throw new Error('CardRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * List cards of a given type for a project, with optional filters.
   * @param {string} projectId
   * @param {string} type - Card type: 'task', 'bug', 'epic', 'proposal', 'sprint', 'qa'
   * @param {CardFilters} [filters={}]
   * @returns {Promise<Object>} Map of firebaseId -> cardData
   */
  async listCards(projectId, type, filters = {}) {
    throw new Error('Not implemented: listCards()');
  }

  /**
   * Get a single card by its Firebase ID.
   * @param {string} projectId
   * @param {string} type - Card type
   * @param {string} firebaseId
   * @returns {Promise<Object|null>} Card data or null
   */
  async getCard(projectId, type, firebaseId) {
    throw new Error('Not implemented: getCard()');
  }

  /**
   * Find a card by its human-readable card ID (e.g., 'PLN-TSK-0001').
   * Searches across all section types if type is not specified.
   * @param {string} projectId
   * @param {string} cardId - Human-readable ID
   * @param {string} [type] - Optional type hint to narrow search
   * @returns {Promise<{firebaseId: string, type: string, data: Object}|null>}
   */
  async findCardByCardId(projectId, cardId, type) {
    throw new Error('Not implemented: findCardByCardId()');
  }

  /**
   * Create a new card. Pushes a new child under the section path.
   * @param {string} projectId
   * @param {string} type - Card type
   * @param {Object} data - Card data (should include cardId, cardType, etc.)
   * @returns {Promise<CreateCardResult>}
   */
  async createCard(projectId, type, data) {
    throw new Error('Not implemented: createCard()');
  }

  /**
   * Update an existing card's fields.
   * @param {string} projectId
   * @param {string} type - Card type
   * @param {string} firebaseId
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateCard(projectId, type, firebaseId, updates) {
    throw new Error('Not implemented: updateCard()');
  }

  /**
   * Soft-delete a card (move to trash).
   * @param {string} projectId
   * @param {string} type - Card type
   * @param {string} firebaseId
   * @param {Object} [trashMetadata] - Additional metadata (deletedAt, deletedBy)
   * @returns {Promise<void>}
   */
  async deleteCard(projectId, type, firebaseId, trashMetadata) {
    throw new Error('Not implemented: deleteCard()');
  }

  /**
   * Subscribe to real-time changes on a specific card.
   * @param {string} projectId
   * @param {string} type - Card type
   * @param {string} firebaseId
   * @param {Function} callback - Called with card data on each change
   * @returns {Function} Unsubscribe function
   */
  subscribeToCard(projectId, type, firebaseId, callback) {
    throw new Error('Not implemented: subscribeToCard()');
  }

  /**
   * Subscribe to real-time changes on all cards of a type in a project.
   * @param {string} projectId
   * @param {string} type - Card type
   * @param {Function} callback - Called with cards data on each change
   * @returns {Function} Unsubscribe function
   */
  subscribeToSection(projectId, type, callback) {
    throw new Error('Not implemented: subscribeToSection()');
  }

  /**
   * Read a card from the trash.
   * @param {string} projectId
   * @param {string} sectionKey - Section key in trash (e.g. "TASKS_ProjectName")
   * @param {string} firebaseId
   * @returns {Promise<Object|null>}
   */
  async readTrashCard(projectId, sectionKey, firebaseId) {
    throw new Error('Not implemented: readTrashCard()');
  }

  /**
   * Write a card to the trash.
   * @param {string} projectId
   * @param {string} sectionKey - Section key in trash
   * @param {string} firebaseId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async writeTrashCard(projectId, sectionKey, firebaseId, data) {
    throw new Error('Not implemented: writeTrashCard()');
  }

  /**
   * Remove a card from the trash.
   * @param {string} projectId
   * @param {string} sectionKey - Section key in trash
   * @param {string} firebaseId
   * @returns {Promise<void>}
   */
  async removeTrashCard(projectId, sectionKey, firebaseId) {
    throw new Error('Not implemented: removeTrashCard()');
  }

  /**
   * Remove an orphan entry from a view.
   * @param {string} viewType - e.g. 'task-list', 'bug-list'
   * @param {string} projectId
   * @param {string} firebaseId
   * @returns {Promise<void>}
   */
  async removeFromView(viewType, projectId, firebaseId) {
    throw new Error('Not implemented: removeFromView()');
  }

  /**
   * Build the section path for a card type in a project.
   * @param {string} projectId
   * @param {string} type
   * @returns {string} e.g., '/cards/PlanningGame/TASKS_PlanningGame'
   */
  static buildPath(projectId, type) {
    return buildSectionPath(projectId, type);
  }

  /**
   * Build the full path to a specific card.
   * @param {string} projectId
   * @param {string} type
   * @param {string} firebaseId
   * @returns {string}
   */
  static buildCardPath(projectId, type, firebaseId) {
    return `${buildSectionPath(projectId, type)}/${firebaseId}`;
  }

  /**
   * Get all valid card types.
   * @returns {string[]}
   */
  static get validTypes() {
    return Object.keys(SECTION_MAP);
  }
}

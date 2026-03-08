/**
 * @fileoverview RTDB implementation of CardRepository.
 *
 * @module shared/dal/rtdb/rtdb-card-repository
 */

import { CardRepository } from '../card-repository.js';
import { SECTION_MAP } from '../../utils.js';

export class RtdbCardRepository extends CardRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async listCards(projectId, type, filters = {}) {
    const path = CardRepository.buildPath(projectId, type);
    const data = await this._repo.read(path);
    if (!data) return {};

    return this._applyFilters(data, filters);
  }

  async getCard(projectId, type, firebaseId) {
    const path = CardRepository.buildCardPath(projectId, type, firebaseId);
    return this._repo.read(path);
  }

  async findCardByCardId(projectId, cardId, type) {
    const typesToSearch = type ? [type] : Object.keys(SECTION_MAP);

    for (const t of typesToSearch) {
      const path = CardRepository.buildPath(projectId, t);
      const data = await this._repo.read(path);
      if (!data) continue;

      const entry = Object.entries(data).find(
        ([, card]) => card.cardId === cardId
      );
      if (entry) {
        return { firebaseId: entry[0], type: t, data: entry[1] };
      }
    }
    return null;
  }

  async createCard(projectId, type, data) {
    const path = CardRepository.buildPath(projectId, type);
    const firebaseId = await this._repo.push(path, data);
    return { firebaseId, data };
  }

  async updateCard(projectId, type, firebaseId, updates) {
    const path = CardRepository.buildCardPath(projectId, type, firebaseId);
    await this._repo.update(path, updates);
  }

  async deleteCard(projectId, type, firebaseId, trashMetadata = {}) {
    const cardPath = CardRepository.buildCardPath(projectId, type, firebaseId);
    const cardData = await this._repo.read(cardPath);

    if (cardData) {
      const sectionKey = SECTION_MAP[type];
      const trashPath = `/trash/cards/${projectId}/${sectionKey}_${projectId}/${firebaseId}`;
      await this._repo.write(trashPath, { ...cardData, ...trashMetadata });
    }

    await this._repo.remove(cardPath);
  }

  subscribeToCard(projectId, type, firebaseId, callback) {
    const path = CardRepository.buildCardPath(projectId, type, firebaseId);
    return this._repo.subscribe(path, callback);
  }

  subscribeToSection(projectId, type, callback) {
    const path = CardRepository.buildPath(projectId, type);
    return this._repo.subscribe(path, callback);
  }

  async readTrashCard(projectId, sectionKey, firebaseId) {
    return this._repo.read(`/trash/cards/${projectId}/${sectionKey}/${firebaseId}`);
  }

  async writeTrashCard(projectId, sectionKey, firebaseId, data) {
    await this._repo.write(`/trash/cards/${projectId}/${sectionKey}/${firebaseId}`, data);
  }

  async removeTrashCard(projectId, sectionKey, firebaseId) {
    await this._repo.remove(`/trash/cards/${projectId}/${sectionKey}/${firebaseId}`);
  }

  async removeFromView(viewType, projectId, firebaseId) {
    await this._repo.remove(`/views/${viewType}/${projectId}/${firebaseId}`);
  }

  /**
   * Apply in-memory filters to card data.
   * @param {Object} data - Map of firebaseId -> cardData
   * @param {import('../card-repository.js').CardFilters} filters
   * @returns {Object} Filtered map
   */
  _applyFilters(data, filters) {
    if (!filters || Object.keys(filters).length === 0) return data;

    const result = {};
    for (const [id, card] of Object.entries(data)) {
      if (filters.status && card.status !== filters.status) continue;
      if (filters.sprint && card.sprint !== filters.sprint) continue;
      if (filters.developer && card.developer !== filters.developer) continue;
      if (filters.year && card.year !== filters.year) continue;
      if (filters.planId && card.planId !== filters.planId) continue;
      result[id] = card;
    }
    return result;
  }
}

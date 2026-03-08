/**
 * @fileoverview History repository interface for card change tracking.
 *
 * Path patterns:
 *   /history/{projectId}/{cardType}/{cardId}
 *
 * @module shared/dal/history-repository
 */

/**
 * @abstract
 */
export class HistoryRepository {
  constructor(baseRepo) {
    if (new.target === HistoryRepository) {
      throw new Error('HistoryRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  async pushEntry(projectId, cardType, cardId, entry) {
    throw new Error('Not implemented: pushEntry()');
  }

  async getEntries(projectId, cardType, cardId, limit) {
    throw new Error('Not implemented: getEntries()');
  }

  subscribeToEntries(projectId, cardType, cardId, limit, callback) {
    throw new Error('Not implemented: subscribeToEntries()');
  }

  async getStats(projectId, cardType) {
    throw new Error('Not implemented: getStats()');
  }

  static buildPath(projectId, cardType, cardId) {
    return `/history/${projectId}/${cardType}/${cardId}`;
  }

  static buildBasePath(projectId, cardType) {
    return cardType
      ? `/history/${projectId}/${cardType}`
      : `/history/${projectId}`;
  }
}

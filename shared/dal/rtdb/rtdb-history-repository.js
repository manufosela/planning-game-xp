/**
 * @fileoverview RTDB implementation of HistoryRepository.
 *
 * Queries are handled in-memory since history per card is typically small (<100 entries).
 *
 * @module shared/dal/rtdb/rtdb-history-repository
 */

import { HistoryRepository } from '../history-repository.js';

export class RtdbHistoryRepository extends HistoryRepository {
  constructor(baseRepo) {
    super(baseRepo);
  }

  async pushEntry(projectId, cardType, cardId, entry) {
    const path = HistoryRepository.buildPath(projectId, cardType, cardId);
    return this._repo.push(path, entry);
  }

  async getEntries(projectId, cardType, cardId, limit = 50) {
    const path = HistoryRepository.buildPath(projectId, cardType, cardId);
    const data = await this._repo.read(path);
    if (!data) return [];

    const entries = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return entries.slice(0, limit);
  }

  subscribeToEntries(projectId, cardType, cardId, limit, callback) {
    const path = HistoryRepository.buildPath(projectId, cardType, cardId);
    return this._repo.subscribe(path, (data) => {
      if (!data) {
        callback([]);
        return;
      }
      const entries = Object.entries(data).map(([id, val]) => ({ id, ...val }));
      entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      callback(entries.slice(0, limit));
    });
  }

  async getStats(projectId, cardType) {
    const path = HistoryRepository.buildBasePath(projectId, cardType);
    return this._repo.read(path);
  }
}

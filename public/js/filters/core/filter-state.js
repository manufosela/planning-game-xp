/**
 * FilterState - Manages filter state and persistence
 * Single Source of Truth for active filters
 *
 * Features:
 * - Per-project, per-cardType filter state
 * - localStorage persistence
 * - Subscription system for reactive updates
 */

const STORAGE_KEY_PREFIX = 'pgxp_filters_';

export class FilterState {
  constructor() {
    // State structure: { projectId: { cardType: { filterType: [values] } } }
    this.state = {};
    // Subscribers: { projectId_cardType: [callbacks] }
    this.subscribers = new Map();
    // Restore from localStorage
    this._restoreFromStorage();
  }

  /**
   * Generate storage key for a project/cardType combo
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @returns {string}
   */
  _getStorageKey(projectId, cardType) {
    return `${STORAGE_KEY_PREFIX}${projectId}_${cardType}`;
  }

  /**
   * Generate subscriber key
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @returns {string}
   */
  _getSubscriberKey(projectId, cardType) {
    return `${projectId}_${cardType}`;
  }

  /**
   * Restore state from localStorage
   */
  _restoreFromStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_KEY_PREFIX)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            // Extract projectId and cardType from key
            const suffix = key.substring(STORAGE_KEY_PREFIX.length);
            const lastUnderscore = suffix.lastIndexOf('_');
            if (lastUnderscore > 0) {
              const projectId = suffix.substring(0, lastUnderscore);
              const cardType = suffix.substring(lastUnderscore + 1);
              this._ensureStateStructure(projectId, cardType);
              this.state[projectId][cardType] = parsed;
            }
          }
        }
      }
    } catch (error) {
      console.warn('FilterState: Error restoring from localStorage', error);
    }
  }

  /**
   * Persist state to localStorage
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   */
  _persistToStorage(projectId, cardType) {
    try {
      const key = this._getStorageKey(projectId, cardType);
      const filters = this.getFilters(projectId, cardType);
      if (Object.keys(filters).length > 0) {
        localStorage.setItem(key, JSON.stringify(filters));
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('FilterState: Error persisting to localStorage', error);
    }
  }

  /**
   * Ensure state structure exists for project/cardType
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   */
  _ensureStateStructure(projectId, cardType) {
    if (!this.state[projectId]) {
      this.state[projectId] = {};
    }
    if (!this.state[projectId][cardType]) {
      this.state[projectId][cardType] = {};
    }
  }

  /**
   * Get all filters for a project/cardType
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @returns {Object} - Filters object { filterType: [values] }
   */
  getFilters(projectId, cardType) {
    return this.state[projectId]?.[cardType] || {};
  }

  /**
   * Get a specific filter value
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} filterType - Filter type
   * @returns {Array} - Filter values
   */
  getFilter(projectId, cardType, filterType) {
    return this.getFilters(projectId, cardType)[filterType] || [];
  }

  /**
   * Set a specific filter value
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} filterType - Filter type
   * @param {Array} values - Filter values
   */
  setFilter(projectId, cardType, filterType, values) {
    // Guard: a filter stored without projectId/cardType lands under a
    // malformed key (e.g. 'pgxp_filters__task') that no view ever reads
    // back — silent state pollution from cold-start races (PLN-BUG-0119).
    if (!projectId || !cardType) {
      console.warn('FilterState.setFilter ignored: missing projectId or cardType', { projectId, cardType, filterType });
      return;
    }
    this._ensureStateStructure(projectId, cardType);

    const normalizedValues = Array.isArray(values) ? values : [values];

    if (normalizedValues.length === 0) {
      delete this.state[projectId][cardType][filterType];
    } else {
      this.state[projectId][cardType][filterType] = normalizedValues;
    }

    this._persistToStorage(projectId, cardType);
    this._notifySubscribers(projectId, cardType);
  }

  /**
   * Set multiple filters at once
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {Object} filters - Filters object { filterType: [values] }
   */
  setFilters(projectId, cardType, filters) {
    if (!projectId || !cardType) {
      console.warn('FilterState.setFilters ignored: missing projectId or cardType', { projectId, cardType });
      return;
    }
    this._ensureStateStructure(projectId, cardType);

    // Clear existing filters for this cardType
    this.state[projectId][cardType] = {};

    // Set new filters
    for (const [filterType, values] of Object.entries(filters)) {
      const normalizedValues = Array.isArray(values) ? values : [values];
      if (normalizedValues.length > 0) {
        this.state[projectId][cardType][filterType] = normalizedValues;
      }
    }

    this._persistToStorage(projectId, cardType);
    this._notifySubscribers(projectId, cardType);
  }

  /**
   * Clear a specific filter
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} filterType - Filter type
   */
  clearFilter(projectId, cardType, filterType) {
    if (this.state[projectId]?.[cardType]?.[filterType]) {
      delete this.state[projectId][cardType][filterType];
      this._persistToStorage(projectId, cardType);
      this._notifySubscribers(projectId, cardType);
    }
  }

  /**
   * Clear all filters for a project/cardType
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   */
  clearAllFilters(projectId, cardType) {
    if (this.state[projectId]?.[cardType]) {
      this.state[projectId][cardType] = {};
      this._persistToStorage(projectId, cardType);
      this._notifySubscribers(projectId, cardType);
    }
  }

  /**
   * Clear filters for a specific filter type across all projects/cardTypes
   * Useful when year changes and sprint filter needs to be reset
   * @param {string} filterType - Filter type to clear
   */
  clearFilterTypeGlobally(filterType) {
    let changed = false;
    for (const projectId of Object.keys(this.state)) {
      for (const cardType of Object.keys(this.state[projectId])) {
        if (this.state[projectId][cardType][filterType]) {
          delete this.state[projectId][cardType][filterType];
          this._persistToStorage(projectId, cardType);
          changed = true;
        }
      }
    }
    if (changed) {
      this._notifyAllSubscribers();
    }
  }

  /**
   * Check if there are any active filters
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @returns {boolean}
   */
  hasActiveFilters(projectId, cardType) {
    const filters = this.getFilters(projectId, cardType);
    return Object.keys(filters).length > 0;
  }

  /**
   * Subscribe to filter changes for a project/cardType
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {Function} callback - Callback function(filters)
   * @returns {Function} - Unsubscribe function
   */
  subscribe(projectId, cardType, callback) {
    const key = this._getSubscriberKey(projectId, cardType);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(key);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Notify subscribers of filter changes
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   */
  _notifySubscribers(projectId, cardType) {
    const key = this._getSubscriberKey(projectId, cardType);
    const callbacks = this.subscribers.get(key);
    if (callbacks) {
      const filters = this.getFilters(projectId, cardType);
      callbacks.forEach(callback => {
        try {
          callback(filters);
        } catch (error) {
          console.error('FilterState: Error in subscriber callback', error);
        }
      });
    }
  }

  /**
   * Notify all subscribers (used for global changes like year change)
   */
  _notifyAllSubscribers() {
    for (const [key, callbacks] of this.subscribers.entries()) {
      // The key is `${projectId}_${cardType}` and projectId may itself
      // contain underscores — split on the LAST one, mirroring
      // _restoreFromStorage. A plain split('_') notified 'MI_PRJ' as
      // projectId='MI' with empty filters (PLN-BUG-0119).
      const lastUnderscore = key.lastIndexOf('_');
      if (lastUnderscore <= 0) continue;
      const projectId = key.substring(0, lastUnderscore);
      const cardType = key.substring(lastUnderscore + 1);
      const filters = this.getFilters(projectId, cardType);
      callbacks.forEach(callback => {
        try {
          callback(filters);
        } catch (error) {
          console.error('FilterState: Error in subscriber callback', error);
        }
      });
    }
  }

  /**
   * Export current state (for debugging)
   * @returns {Object}
   */
  exportState() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

// Singleton instance
let filterStateInstance = null;

/**
 * Get the singleton FilterState instance
 * @returns {FilterState}
 */
export function getFilterState() {
  if (!filterStateInstance) {
    filterStateInstance = new FilterState();
  }
  return filterStateInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetFilterState() {
  filterStateInstance = null;
}

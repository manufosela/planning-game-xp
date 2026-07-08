/**
 * UnifiedFilterService - Main facade for the unified filter system
 *
 * This service provides a single point of access for all filtering operations.
 * It combines FilterEngine, FilterState, and filter configurations to provide
 * a simple API for filtering cards.
 *
 * Key responsibilities:
 * - Coordinate between FilterEngine and FilterState
 * - Register matchers from configurations
 * - Provide context for matchers (global lists, services)
 * - Handle year-based filter clearing
 * - Emit events for filter changes
 */

import { getFilterEngine, resetFilterEngine } from '../filters/core/filter-engine.js';
import { getFilterState, resetFilterState } from '../filters/core/filter-state.js';
import { getFilterConfig, getRegisteredCardTypes } from '../filters/configs/index.js';
import { URLStateManager } from '../utils/url-utils.js';

// Import all matchers
import { statusMatcher } from '../filters/matchers/status-matcher.js';
import { developerMatcher, validatorMatcher } from '../filters/matchers/developer-matcher.js';
import { sprintMatcher, completedInSprintMatcher } from '../filters/matchers/sprint-matcher.js';
import { epicMatcher } from '../filters/matchers/epic-matcher.js';
import { priorityMatcher } from '../filters/matchers/priority-matcher.js';
import { createdByMatcher } from '../filters/matchers/created-by-matcher.js';
import { repositoryLabelMatcher } from '../filters/matchers/repository-matcher.js';
import { taskCategoryMatcher } from '../filters/matchers/task-category-matcher.js';

export class UnifiedFilterService {
  constructor() {
    this.engine = getFilterEngine();
    this.state = getFilterState();
    this._initialized = false;
    this._eventTarget = new EventTarget();

    // External services that can be injected
    this.entityDirectoryService = null;
    this.userDirectoryService = null;
  }

  /**
   * Initialize the service
   * Registers all matchers from configurations
   */
  initialize() {
    if (this._initialized) {
      return;
    }

    // Register all matchers
    this.engine.registerMatcher('status', statusMatcher);
    this.engine.registerMatcher('developer', developerMatcher);
    this.engine.registerMatcher('validator', validatorMatcher);
    this.engine.registerMatcher('sprint', sprintMatcher);
    this.engine.registerMatcher('completedInSprint', completedInSprintMatcher);
    this.engine.registerMatcher('epic', epicMatcher);
    this.engine.registerMatcher('priority', priorityMatcher);
    this.engine.registerMatcher('createdBy', createdByMatcher);
    this.engine.registerMatcher('repositoryLabel', repositoryLabelMatcher);
    this.engine.registerMatcher('taskCategory', taskCategoryMatcher);

    // Listen for year changes
    window.addEventListener('year-changed', this._handleYearChange.bind(this));

    this._initialized = true;
  }

  /**
   * Set external services for context
   * @param {Object} services - { entityDirectoryService, userDirectoryService }
   */
  setServices(services) {
    if (services.entityDirectoryService) {
      this.entityDirectoryService = services.entityDirectoryService;
    }
    if (services.userDirectoryService) {
      this.userDirectoryService = services.userDirectoryService;
    }
  }

  /**
   * Build context object for matchers
   * @returns {Object}
   */
  _buildContext() {
    return {
      globalDeveloperList: globalThis.globalDeveloperList,
      globalSprintList: globalThis.globalSprintList,
      globalEpicList: globalThis.globalEpicList,
      usersDirectory: globalThis.usersDirectory,
      entityDirectoryService: this.entityDirectoryService,
      userDirectoryService: this.userDirectoryService
    };
  }

  /**
   * Apply filters to cards
   * @param {Object|Array} cards - Cards to filter
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type ('task', 'bug', etc.)
   * @returns {Object|Array} - Filtered cards
   */
  applyFilters(cards, projectId, cardType) {
    const activeFilters = this.state.getFilters(projectId, cardType);
    const context = this._buildContext();
    return this.engine.applyFilters(cards, activeFilters, context);
  }

  /**
   * Apply filters with custom filter values (not from state)
   * @param {Object|Array} cards - Cards to filter
   * @param {Object} filters - Filter values { filterType: [values] }
   * @returns {Object|Array} - Filtered cards
   */
  applyCustomFilters(cards, filters) {
    const context = this._buildContext();
    return this.engine.applyFilters(cards, filters, context);
  }

  /**
   * Get filter configuration for a card type
   * @param {string} cardType - Card type
   * @returns {Object|null}
   */
  getConfig(cardType) {
    return getFilterConfig(cardType);
  }

  /**
   * Get current active filters for a project/cardType
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @returns {Object}
   */
  getActiveFilters(projectId, cardType) {
    return this.state.getFilters(projectId, cardType);
  }

  /**
   * Set a filter value
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} filterType - Filter type
   * @param {Array} values - Filter values
   */
  setFilter(projectId, cardType, filterType, values) {
    this.state.setFilter(projectId, cardType, filterType, values);
    this._emitFilterChanged(projectId, cardType);
  }

  /**
   * Set multiple filters at once
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {Object} filters - Filter values { filterType: [values] }
   */
  setFilters(projectId, cardType, filters) {
    this.state.setFilters(projectId, cardType, filters);
    this._emitFilterChanged(projectId, cardType);
  }

  /**
   * Clear a specific filter
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} filterType - Filter type
   */
  clearFilter(projectId, cardType, filterType) {
    this.state.clearFilter(projectId, cardType, filterType);
    this._emitFilterChanged(projectId, cardType);
  }

  /**
   * Clear all filters for a project/cardType
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   */
  clearAllFilters(projectId, cardType) {
    this.state.clearAllFilters(projectId, cardType);
    this._emitFilterChanged(projectId, cardType);
  }

  /**
   * Check if there are any active filters
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @returns {boolean}
   */
  hasActiveFilters(projectId, cardType) {
    return this.state.hasActiveFilters(projectId, cardType);
  }

  /**
   * Subscribe to filter changes
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {Function} callback - Callback function(filters)
   * @returns {Function} - Unsubscribe function
   */
  subscribe(projectId, cardType, callback) {
    return this.state.subscribe(projectId, cardType, callback);
  }

  /**
   * Subscribe to all filter changes (global listener)
   * @param {Function} callback - Callback function(event)
   * @returns {Function} - Unsubscribe function
   */
  subscribeToAll(callback) {
    this._eventTarget.addEventListener('filters-changed', callback);
    return () => {
      this._eventTarget.removeEventListener('filters-changed', callback);
    };
  }

  /**
   * Get filter options for a specific filter
   * @param {string} cardType - Card type
   * @param {string} filterId - Filter ID
   * @param {number} year - Optional year for year-dependent filters
   * @returns {Promise<Array>}
   */
  async getFilterOptions(cardType, filterId, year) {
    const config = this.getConfig(cardType);
    if (!config || !config.filters[filterId]) {
      return [];
    }

    const filterConfig = config.filters[filterId];
    if (filterConfig.optionsProvider) {
      try {
        if (filterConfig.yearDependent) {
          return await filterConfig.optionsProvider(year);
        }
        return await filterConfig.optionsProvider();
      } catch (error) {
        console.error(`Error getting options for ${filterId}:`, error);
        return [];
      }
    }

    return [];
  }

  /**
   * Get all filter options for a card type
   * @param {string} cardType - Card type
   * @param {number} year - Optional year for year-dependent filters
   * @returns {Promise<Object>}
   */
  async getAllFilterOptions(cardType, year) {
    const config = this.getConfig(cardType);
    if (!config) {
      return {};
    }

    const options = {};
    for (const filterId of Object.keys(config.filters)) {
      options[filterId] = await this.getFilterOptions(cardType, filterId, year);
    }

    return options;
  }

  /**
   * Handle year change event
   * Clears year-dependent filters (sprint, completedInSprint)
   * @param {Event} event
   */
  _handleYearChange(event) {
    // Clear sprint filters globally (they depend on year)
    this.state.clearFilterTypeGlobally('sprint');
    this.state.clearFilterTypeGlobally('completedInSprint');

    // Emit event
    this._emitYearChanged(event.detail?.year);
  }

  /**
   * Emit filter changed event
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   */
  _emitFilterChanged(projectId, cardType) {
    const filters = this.state.getFilters(projectId, cardType);

    // Update URL with filters (use replaceState to avoid polluting history)
    URLStateManager.updateState({ filters }, true);

    // Emit custom event on EventTarget
    this._eventTarget.dispatchEvent(new CustomEvent('filters-changed', {
      detail: { projectId, cardType, filters }
    }));

    // Also dispatch on window for global listeners
    window.dispatchEvent(new CustomEvent('unified-filters-changed', {
      detail: { projectId, cardType, filters }
    }));
  }

  /**
   * Restore filters from URL state
   * Call this during page initialization to apply filters from URL
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @returns {boolean} True if filters were restored from URL
   */
  restoreFiltersFromUrl(projectId, cardType) {
    const urlState = URLStateManager.getState();
    if (urlState.filters && Object.keys(urlState.filters).length > 0) {
      this.setFilters(projectId, cardType, urlState.filters);
      return true;
    }
    return false;
  }

  /**
   * Emit year changed event (for UI components to refresh options)
   * @param {number} year
   */
  _emitYearChanged(year) {
    this._eventTarget.dispatchEvent(new CustomEvent('year-changed', {
      detail: { year }
    }));
  }

  /**
   * Apply default values from config (for first load)
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   */
  applyDefaultValues(projectId, cardType) {
    const config = this.getConfig(cardType);
    if (!config || !config.defaultValues) {
      return;
    }

    // Only apply if no filters are currently set
    if (this.hasActiveFilters(projectId, cardType)) {
      return;
    }

    for (const [filterType, values] of Object.entries(config.defaultValues)) {
      if (values && values.length > 0) {
        this.state.setFilter(projectId, cardType, filterType, values);
      }
    }
  }

  /**
   * Get display order for filters
   * @param {string} cardType - Card type
   * @returns {string[]}
   */
  getDisplayOrder(cardType) {
    const config = this.getConfig(cardType);
    return config?.displayOrder || [];
  }

  /**
   * Check if a filter is year-dependent
   * @param {string} cardType - Card type
   * @param {string} filterId - Filter ID
   * @returns {boolean}
   */
  isYearDependent(cardType, filterId) {
    const config = this.getConfig(cardType);
    return config?.filters[filterId]?.yearDependent || false;
  }
}

// Singleton instance
let unifiedFilterServiceInstance = null;

/**
 * Get the singleton UnifiedFilterService instance
 * @returns {UnifiedFilterService}
 */
export function getUnifiedFilterService() {
  if (!unifiedFilterServiceInstance) {
    unifiedFilterServiceInstance = new UnifiedFilterService();
    unifiedFilterServiceInstance.initialize();
  }
  return unifiedFilterServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetUnifiedFilterService() {
  resetFilterEngine();
  resetFilterState();
  unifiedFilterServiceInstance = null;
}

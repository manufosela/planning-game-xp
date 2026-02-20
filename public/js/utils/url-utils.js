export class URLUtils {
  static getProjectIdFromUrl() {
    // Primero intentar obtener de la variable global (establecida temprano en adminproject.astro)
    if (window.currentProjectId) {
      return window.currentProjectId;
    }
    // Fallback a leer de URL params
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('projectId') || '';
  }

  static getSectionFromUrl() {
    const hash = window.location.hash.replace('#', '');
    return hash || 'tasks';
  }

  static updateUrl(projectId, section) {
    const newUrl = new URL(window.location.href);
    if (projectId) newUrl.searchParams.set('projectId', projectId);
    if (section) newUrl.hash = section;
    window.history.pushState({}, '', newUrl.toString());
  }
}

/**
 * URLStateManager - Manages URL state for SPA navigation
 *
 * Provides methods to:
 * - Get current state from URL (view, tab, filters, sprint, section)
 * - Update URL state without page reload
 * - Listen for browser back/forward navigation
 * - Encode/decode filters to compact URL format
 *
 * URL Pattern:
 * /adminproject?projectId=C4D&view=kanban&f=status:In%20Progress;developer:dev_001#tasks
 * /wip?tab=backlog&developer=dev_001
 * /sprintview?projectId=C4D&sprint=SPR-001
 * /proposals?tab=byProject
 */
export class URLStateManager {
  static PARAMS = {
    VIEW: 'view',           // table, list, kanban, sprint, gantt
    TAB: 'tab',             // wip, backlog (for /wip page); general, byProject, byTeam (for /proposals)
    SPRINT: 'sprint',       // selected sprint
    FILTERS: 'f',           // encoded filters
    DEVELOPER: 'developer'  // selected developer (for /wip backlog)
  };

  /**
   * Get the current state from URL
   * @returns {Object} State object with projectId, view, tab, sprint, filters, section
   */
  static getState() {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace('#', '');

    return {
      projectId: params.get('projectId'),
      view: params.get('view'),
      tab: params.get('tab'),
      sprint: params.get('sprint'),
      developer: params.get('developer'),
      filters: this._decodeFilters(params.get('f')),
      section: hash || null
    };
  }

  /**
   * Update URL state without page reload
   * @param {Object} updates - Key-value pairs to update
   * @param {boolean} replace - Use replaceState instead of pushState (default: false)
   */
  static updateState(updates, replace = false) {
    const url = new URL(window.location.href);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        // Remove null/empty values
        if (key === 'section') {
          url.hash = '';
        } else if (key === 'filters') {
          url.searchParams.delete('f');
        } else {
          url.searchParams.delete(key);
        }
      } else if (key === 'section') {
        // Section goes to hash
        url.hash = value;
      } else if (key === 'filters') {
        // Filters are encoded
        const encoded = this._encodeFilters(value);
        if (encoded) {
          url.searchParams.set('f', encoded);
        } else {
          url.searchParams.delete('f');
        }
      } else {
        url.searchParams.set(key, value);
      }
    });

    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ ...updates }, '', url.toString());
  }

  /**
   * Clear specified state parameters from URL
   * @param {string[]} keys - Array of keys to clear (e.g., ['view', 'tab', 'filters'])
   */
  static clearState(keys) {
    const updates = {};
    keys.forEach(key => {
      updates[key] = null;
    });
    this.updateState(updates);
  }

  /**
   * Encode filters object to compact URL string
   * Format: status:In Progress;developer:dev_001
   * @param {Object} filters - Filters object { filterType: value }
   * @returns {string|null} Encoded string or null if empty
   */
  static _encodeFilters(filters) {
    if (!filters || Object.keys(filters).length === 0) return null;

    // Only include filters with values
    const active = Object.entries(filters)
      .filter(([_, v]) => v && (Array.isArray(v) ? v.length > 0 : v !== ''))
      .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join(',') : v}`)
      .join(';');

    return active || null;
  }

  /**
   * Decode filters from URL string to object
   * @param {string} encoded - Encoded string from URL
   * @returns {Object} Decoded filters object
   */
  static _decodeFilters(encoded) {
    if (!encoded) return {};

    return Object.fromEntries(
      encoded.split(';').map(pair => {
        const [key, value] = pair.split(':');
        // Always return an array - filters expect arrays of values
        return [key, value.includes(',') ? value.split(',') : [value]];
      })
    );
  }

  /**
   * Listen for browser back/forward navigation
   * @param {Function} callback - Function to call with (state, eventState) on popstate
   */
  static onPopState(callback) {
    window.addEventListener('popstate', (e) => {
      callback(this.getState(), e.state);
    });
  }
}

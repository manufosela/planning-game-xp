/**
 * AppEventBus - Centralized event system for application synchronization
 *
 * This service replaces setTimeout-based synchronization with a proper
 * event-driven architecture. Components emit events when ready, and
 * other components can wait for these events using promises.
 *
 * @example
 * // Emitting an event
 * AppEventBus.emit(AppEvents.TABLE_RENDERED, { section: 'tasks' });
 *
 * // Listening once
 * AppEventBus.once(AppEvents.TABLE_RENDERED, (detail) => {
 *   console.log('Table rendered:', detail.section);
 * });
 *
 * // Waiting with promise
 * const detail = await AppEventBus.waitFor(AppEvents.TABLE_RENDERED);
 *
 * // Waiting with timeout
 * try {
 *   const detail = await AppEventBus.waitFor(AppEvents.GLOBAL_DATA_READY, 5000);
 * } catch (error) {
 *   console.error('Timeout waiting for global data');
 * }
 */

/**
 * Application event constants
 * Use these instead of string literals for type safety and autocomplete
 */
export const AppEvents = {
  // Data events
  GLOBAL_DATA_READY: 'app:global-data-ready',
  CARDS_LOADED: 'app:cards-loaded',
  CARDS_RENDERED: 'app:cards-rendered',

  // View events
  VIEW_CHANGED: 'app:view-changed',
  TABLE_RENDERED: 'app:table-rendered',
  KANBAN_RENDERED: 'app:kanban-rendered',

  // Filter events
  FILTERS_READY: 'app:filters-ready',
  FILTERS_APPLIED: 'app:filters-applied',

  // Component lifecycle events
  COMPONENT_READY: 'app:component-ready',

  // Section events
  SECTION_CHANGED: 'app:section-changed',

  // AI Execution events
  AI_EXECUTION_STARTED: 'app:ai-execution-started',
  AI_EXECUTION_CHECKPOINT: 'app:ai-execution-checkpoint',
  AI_EXECUTION_COMPLETED: 'app:ai-execution-completed',
  AI_EXECUTION_ERROR: 'app:ai-execution-error',
  AI_EXECUTION_CANCELLED: 'app:ai-execution-cancelled',
  BRIDGE_STATUS_CHANGED: 'app:bridge-status-changed',
};

/**
 * Centralized event bus for application-wide communication
 */
export class AppEventBus {
  /**
   * Emit an event with optional detail data
   * @param {string} event - Event name (use AppEvents constants)
   * @param {Object} detail - Optional data to pass with the event
   */
  static emit(event, detail = {}) {
    document.dispatchEvent(new CustomEvent(event, {
      detail,
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Listen for an event once
   * @param {string} event - Event name to listen for
   * @param {Function} callback - Function to call when event fires
   */
  static once(event, callback) {
    const handler = (e) => {
      callback(e.detail);
    };
    document.addEventListener(event, handler, { once: true });
  }

  /**
   * Listen for an event continuously
   * @param {string} event - Event name to listen for
   * @param {Function} callback - Function to call when event fires
   * @returns {Function} Unsubscribe function
   */
  static on(event, callback) {
    const handler = (e) => {
      callback(e.detail);
    };
    document.addEventListener(event, handler);

    // Return unsubscribe function
    return () => {
      document.removeEventListener(event, handler);
    };
  }

  /**
   * Wait for an event with optional timeout
   * @param {string} event - Event name to wait for
   * @param {number} timeout - Maximum wait time in ms (default: 10000)
   * @returns {Promise<Object>} Resolves with event detail, rejects on timeout
   */
  static waitFor(event, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let timeoutId;

      const handler = (e) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(e.detail);
      };

      document.addEventListener(event, handler, { once: true });

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          document.removeEventListener(event, handler);
          reject(new Error(`Timeout waiting for event: ${event} (${timeout}ms)`));
        }, timeout);
      }
    });
  }

  /**
   * Wait for an event only if a condition is not already met
   * Useful for checking if data is already available before waiting
   * @param {string} event - Event name to wait for
   * @param {Function} checkCondition - Function that returns true if condition is met
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<Object|null>} Resolves immediately if condition met, or with event detail
   */
  static async waitForUnless(event, checkCondition, timeout = 10000) {
    // Check if condition is already met
    if (checkCondition()) {
      return null;
    }

    // Otherwise wait for the event
    return this.waitFor(event, timeout);
  }

  /**
   * Wait for multiple events to complete
   * @param {string[]} events - Array of event names to wait for
   * @param {number} timeout - Maximum wait time in ms for each event
   * @returns {Promise<Object[]>} Resolves with array of event details
   */
  static waitForAll(events, timeout = 10000) {
    return Promise.all(events.map(event => this.waitFor(event, timeout)));
  }

  /**
   * Wait for any of the specified events
   * @param {string[]} events - Array of event names to wait for
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<{event: string, detail: Object}>} Resolves with first event that fires
   */
  static waitForAny(events, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      const handlers = [];

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        handlers.forEach(({ event, handler }) => {
          document.removeEventListener(event, handler);
        });
      };

      events.forEach(event => {
        const handler = (e) => {
          cleanup();
          resolve({ event, detail: e.detail });
        };
        document.addEventListener(event, handler, { once: true });
        handlers.push({ event, handler });
      });

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout waiting for any of: ${events.join(', ')} (${timeout}ms)`));
        }, timeout);
      }
    });
  }
}

// Make available globally for debugging
if (typeof window !== 'undefined') {
  window.AppEventBus = AppEventBus;
  window.AppEvents = AppEvents;
}

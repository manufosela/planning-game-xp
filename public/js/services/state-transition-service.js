import { dalService } from './dal-service.js';
import { auth } from '../../firebase-config.js';

/**
 * Service for tracking state transitions in tasks
 *
 * Records:
 * - First time a task enters "In Progress" (immutable firstInProgressDate)
 * - All state transitions with timestamps and duration
 * - Validation cycles (rejections from "To Validate" back to "To Do")
 *
 * Firebase structure: /stateTransitions/{projectId}/{cardType}/{cardId}
 */
export class StateTransitionService {
  constructor() {
    this._initialized = false;
  }

  /**
   * Initializes the service
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;
  }

  /**
   * Gets the normalized card type for path construction
   * @param {string} cardType - Card type (task-card, bug-card, etc.)
   * @returns {string} Normalized type for path
   */
  getCardTypeForPath(cardType) {
    const typeMap = {
      'task-card': 'tasks',
      'bug-card': 'bugs',
      'sprint-card': 'sprints',
      'proposal-card': 'proposals',
      'epic-card': 'epics',
      'qa-card': 'qa'
    };
    return typeMap[cardType] || cardType;
  }

  /**
   * Gets the Firebase path for state transitions
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} cardId - Card ID
   * @returns {string} Firebase path
   */
  getTransitionPath(projectId, cardType, cardId) {
    const normalizedType = this.getCardTypeForPath(cardType);
    return `/stateTransitions/${projectId}/${normalizedType}/${cardId}`;
  }

  /**
   * Records a state transition
   * @param {Object} card - Card data with projectId, cardType, cardId
   * @param {string} fromStatus - Previous status
   * @param {string} toStatus - New status
   * @param {string} changedBy - Email of user making the change
   * @returns {Promise<Object>} The recorded transition
   */
  async recordTransition(card, fromStatus, toStatus, changedBy) {
    if (!card.projectId || !card.cardId) {
      console.error('[StateTransitionService] Missing projectId or cardId');
      return null;
    }

    // Don't record if status didn't change
    if (fromStatus === toStatus) {
      return null;
    }

    const cardType = card.cardType || 'task-card';
    const timestamp = new Date().toISOString();
    const normalizedToStatus = (toStatus || '').toLowerCase();
    const normalizedFromStatus = (fromStatus || '').toLowerCase();

    try {
      const normalizedCardType = this.getCardTypeForPath(cardType);

      // Get current transition data
      const currentData = await dalService.stateTransitions.getTransitionData(card.projectId, normalizedCardType, card.cardId) || {
        firstInProgressDate: null,
        validationCycles: 0,
        reopenCycles: 0,
        transitions: {}
      };

      // Calculate duration in previous status
      let durationInPrevious = null;
      const transitionsArray = Object.values(currentData.transitions || {});
      if (transitionsArray.length > 0) {
        transitionsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const lastTransition = transitionsArray[0];
        if (lastTransition.timestamp) {
          durationInPrevious = new Date(timestamp) - new Date(lastTransition.timestamp);
        }
      }

      // Create the transition entry
      const transition = {
        timestamp,
        fromStatus: fromStatus || null,
        toStatus: toStatus || null,
        changedBy: changedBy || auth?.currentUser?.email || 'system',
        durationInPrevious
      };

      // Push new transition
      const transitionId = await dalService.stateTransitions.addTransition(card.projectId, normalizedCardType, card.cardId, transition);

      // Update firstInProgressDate if entering In Progress for the first time
      if (normalizedToStatus === 'in progress' && !currentData.firstInProgressDate) {
        const today = timestamp.split('T')[0];
        await dalService.stateTransitions.setTransitionField(card.projectId, normalizedCardType, card.cardId, 'firstInProgressDate', today);
      }

      // Increment validationCycles if rejected (To Validate -> To Do)
      if (normalizedFromStatus === 'to validate' && normalizedToStatus === 'to do') {
        const newCycles = (currentData.validationCycles || 0) + 1;
        await dalService.stateTransitions.setTransitionField(card.projectId, normalizedCardType, card.cardId, 'validationCycles', newCycles);
      }

      // Increment reopenCycles if task is reopened (To Validate/Done&Validated -> Reopened)
      if (normalizedToStatus === 'reopened' &&
          (normalizedFromStatus === 'to validate' || normalizedFromStatus === 'done&validated')) {
        const newReopenCycles = (currentData.reopenCycles || 0) + 1;
        await dalService.stateTransitions.setTransitionField(card.projectId, normalizedCardType, card.cardId, 'reopenCycles', newReopenCycles);
      }

      return {
        ...transition,
        id: transitionId
      };
    } catch (error) {
      console.error('[StateTransitionService] recordTransition failed:', error);
      return null;
    }
  }

  /**
   * Gets the first In Progress date (immutable)
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} cardId - Card ID
   * @returns {Promise<string|null>} Date string in YYYY-MM-DD format or null
   */
  async getFirstInProgressDate(projectId, cardType, cardId) {
    if (!projectId || !cardId) return null;

    try {
      const normalizedType = this.getCardTypeForPath(cardType);
      return await dalService.stateTransitions.getTransitionField(projectId, normalizedType, cardId, 'firstInProgressDate');
    } catch (error) {
      console.error('[StateTransitionService] getFirstInProgressDate failed:', error);
      return null;
    }
  }

  /**
   * Gets the validation cycles count (rejections)
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} cardId - Card ID
   * @returns {Promise<number>} Number of validation cycles
   */
  async getValidationCycles(projectId, cardType, cardId) {
    if (!projectId || !cardId) return 0;

    try {
      const normalizedType = this.getCardTypeForPath(cardType);
      const value = await dalService.stateTransitions.getTransitionField(projectId, normalizedType, cardId, 'validationCycles');
      return value || 0;
    } catch (error) {
      console.error('[StateTransitionService] getValidationCycles failed:', error);
      return 0;
    }
  }

  /**
   * Gets the reopen cycles count (times task was reopened after validation)
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} cardId - Card ID
   * @returns {Promise<number>} Number of reopen cycles
   */
  async getReopenCycles(projectId, cardType, cardId) {
    if (!projectId || !cardId) return 0;

    try {
      const normalizedType = this.getCardTypeForPath(cardType);
      const value = await dalService.stateTransitions.getTransitionField(projectId, normalizedType, cardId, 'reopenCycles');
      return value || 0;
    } catch (error) {
      console.error('[StateTransitionService] getReopenCycles failed:', error);
      return 0;
    }
  }

  /**
   * Gets all transitions for a card
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} cardId - Card ID
   * @returns {Promise<Array>} Array of transitions sorted by timestamp (newest first)
   */
  async getTransitions(projectId, cardType, cardId) {
    if (!projectId || !cardId) return [];

    try {
      const normalizedType = this.getCardTypeForPath(cardType);
      const data = await dalService.stateTransitions.getTransitionData(projectId, normalizedType, cardId);

      if (!data || !data.transitions) return [];

      const transitions = Object.entries(data.transitions).map(([key, value]) => ({
        id: key,
        ...value
      }));

      // Sort by timestamp descending (newest first)
      return transitions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error('[StateTransitionService] getTransitions failed:', error);
      return [];
    }
  }

  /**
   * Gets all transition data for a card
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} cardId - Card ID
   * @returns {Promise<Object>} Full transition data object
   */
  async getTransitionData(projectId, cardType, cardId) {
    if (!projectId || !cardId) {
      return {
        firstInProgressDate: null,
        validationCycles: 0,
        reopenCycles: 0,
        transitions: []
      };
    }

    try {
      const normalizedType = this.getCardTypeForPath(cardType);
      const data = await dalService.stateTransitions.getTransitionData(projectId, normalizedType, cardId);

      if (!data) {
        return {
          firstInProgressDate: null,
          validationCycles: 0,
          reopenCycles: 0,
          transitions: []
        };
      }

      const transitions = [];

      if (data.transitions) {
        Object.entries(data.transitions).forEach(([key, value]) => {
          transitions.push({ id: key, ...value });
        });
        transitions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      return {
        firstInProgressDate: data.firstInProgressDate || null,
        validationCycles: data.validationCycles || 0,
        reopenCycles: data.reopenCycles || 0,
        transitions
      };
    } catch (error) {
      console.error('[StateTransitionService] getTransitionData failed:', error);
      return {
        firstInProgressDate: null,
        validationCycles: 0,
        reopenCycles: 0,
        transitions: []
      };
    }
  }

  /**
   * Calculates time metrics from transitions
   * @param {Array} transitions - Array of transitions
   * @returns {Object} Time metrics by status
   */
  calculateTimeMetrics(transitions) {
    if (!transitions || transitions.length === 0) {
      return {
        totalDevelopmentTime: 0,
        timeByStatus: {},
        averageValidationTime: 0,
        timesRejected: 0
      };
    }

    // Sort by timestamp ascending (oldest first) for calculation
    const sortedTransitions = [...transitions].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    const timeByStatus = {};
    let totalDevelopmentTime = 0;
    let validationTimes = [];
    let timesRejected = 0;

    // Calculate time spent in each status
    for (let i = 0; i < sortedTransitions.length; i++) {
      const transition = sortedTransitions[i];
      const fromStatus = (transition.fromStatus || '').toLowerCase();

      if (transition.durationInPrevious && transition.durationInPrevious > 0 && fromStatus) {
        if (!timeByStatus[fromStatus]) {
          timeByStatus[fromStatus] = 0;
        }
        timeByStatus[fromStatus] += transition.durationInPrevious;

        // Track development time (In Progress)
        if (fromStatus === 'in progress') {
          totalDevelopmentTime += transition.durationInPrevious;
        }

        // Track validation time (To Validate)
        if (fromStatus === 'to validate') {
          validationTimes.push(transition.durationInPrevious);
        }
      }

      // Count rejections (To Validate -> To Do)
      const toStatus = (transition.toStatus || '').toLowerCase();
      if (fromStatus === 'to validate' && toStatus === 'to do') {
        timesRejected++;
      }
    }

    // Calculate average validation time
    const averageValidationTime = validationTimes.length > 0
      ? validationTimes.reduce((a, b) => a + b, 0) / validationTimes.length
      : 0;

    const totalPausedTime = timeByStatus['pausado'] || 0;

    return {
      totalDevelopmentTime,
      timeByStatus,
      averageValidationTime,
      timesRejected,
      totalPausedTime,
      effectiveWorkTime: totalDevelopmentTime > 0 ? totalDevelopmentTime - totalPausedTime : 0,
    };
  }

  /**
   * Formats milliseconds to a human-readable duration string
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration (e.g., "2d 3h 15m")
   */
  formatDuration(ms) {
    if (!ms || ms <= 0) return '-';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);

    return parts.length > 0 ? parts.join(' ') : '< 1m';
  }

  /**
   * Subscribe to transition changes for a card
   * @param {string} projectId - Project ID
   * @param {string} cardType - Card type
   * @param {string} cardId - Card ID
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeToTransitions(projectId, cardType, cardId, callback) {
    if (!projectId || !cardId) {
      callback({ firstInProgressDate: null, validationCycles: 0, reopenCycles: 0, transitions: [] });
      return () => {};
    }

    const normalizedType = this.getCardTypeForPath(cardType);

    const unsubscribe = dalService.stateTransitions.subscribeToTransitions(projectId, normalizedType, cardId, (data) => {
      if (!data) {
        callback({ firstInProgressDate: null, validationCycles: 0, reopenCycles: 0, transitions: [] });
        return;
      }

      const transitions = [];

      if (data.transitions) {
        Object.entries(data.transitions).forEach(([key, value]) => {
          transitions.push({ id: key, ...value });
        });
        transitions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      callback({
        firstInProgressDate: data.firstInProgressDate || null,
        validationCycles: data.validationCycles || 0,
        reopenCycles: data.reopenCycles || 0,
        transitions
      });
    });

    return unsubscribe;
  }

  /**
   * Migrates existing card data to the transition system
   * This can be used to backfill firstInProgressDate from existing startDate
   * @param {Object} card - Card with existing dates
   * @returns {Promise<boolean>} Success status
   */
  async migrateFromExistingDates(card) {
    if (!card.projectId || !card.cardId) return false;

    try {
      const cardType = card.cardType || 'task-card';
      const normalizedType = this.getCardTypeForPath(cardType);

      // Check if already has transition data
      const data = await dalService.stateTransitions.getTransitionData(card.projectId, normalizedType, card.cardId);
      if (data && data.firstInProgressDate) {
        return false;
      }

      // If card has startDate, use it as firstInProgressDate
      if (card.startDate) {
        await dalService.stateTransitions.setTransitionField(card.projectId, normalizedType, card.cardId, 'firstInProgressDate', card.startDate);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[StateTransitionService] migrateFromExistingDates failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const stateTransitionService = new StateTransitionService();

/**
 * AI Execution Service
 *
 * Singleton service that communicates with the Bridge Server and
 * Firebase RTDB for AI execution management.
 *
 * Provides:
 * - Execute/cancel AI tasks via Bridge REST API
 * - WebSocket connection for real-time low-latency updates
 * - Firebase RTDB subscriptions for global multi-client visibility
 * - Bridge availability detection
 */

import { AppEventBus, AppEvents } from './app-event-bus.js';

class AiExecutionService {
  constructor() {
    this._initialized = false;
    this._available = false;
    this._bridgeUrl = null;
    this._apiKey = null;
    this._db = null;
    this._wsConnections = new Map(); // executionId → WebSocket
    this._rtdbUnsubscribes = new Map(); // executionId → unsubscribe fn
  }

  /**
   * Initialize service by reading Bridge config from Firebase RTDB.
   * Call once before using other methods.
   */
  async ensureInitialized() {
    if (this._initialized) return;

    try {
      // Try to read config from Firebase RTDB /config/bridge
      const { getDatabase, ref, get } = await import('firebase/database');
      this._db = getDatabase();
      const configSnap = await get(ref(this._db, 'config/bridge'));
      const config = configSnap.val();

      if (config && config.url && config.apiKey) {
        this._bridgeUrl = config.url;
        this._apiKey = config.apiKey;

        // Health check
        const healthy = await this._healthCheck();
        this._available = healthy;
      }
    } catch {
      this._available = false;
    }

    this._initialized = true;
    AppEventBus.emit(AppEvents.BRIDGE_STATUS_CHANGED, { available: this._available });
  }

  /**
   * Check if Bridge Server is configured and reachable.
   * @returns {boolean}
   */
  isAvailable() {
    return this._available;
  }

  /**
   * Get the Bridge URL.
   * @returns {string|null}
   */
  getBridgeUrl() {
    return this._bridgeUrl;
  }

  // ─── Execution ──────────────────────────────────────────────────────

  /**
   * Start an AI execution for a card.
   * @param {object} cardData - Card information
   * @param {string} cardData.projectId
   * @param {string} cardData.cardId
   * @param {string} cardData.cardType
   * @param {string} cardData.firebaseCardId
   * @param {string} cardData.requestedBy
   * @param {object} cardData.context - { title, acceptanceCriteria, description }
   * @param {object} [options] - { maxIterations, sonarEnabled }
   * @returns {Promise<{ executionId: string, wsUrl: string, status: string }>}
   */
  async execute(cardData, options = {}) {
    if (!this._available) {
      throw new Error('Bridge Server is not available');
    }

    const response = await this._fetch('/execute', {
      method: 'POST',
      body: JSON.stringify({
        projectId: cardData.projectId,
        cardId: cardData.cardId,
        cardType: cardData.cardType,
        firebaseCardId: cardData.firebaseCardId,
        requestedBy: cardData.requestedBy,
        context: cardData.context,
        options,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Bridge error: ${response.status}`);
    }

    const result = await response.json();

    AppEventBus.emit(AppEvents.AI_EXECUTION_STARTED, {
      executionId: result.executionId,
      cardId: cardData.cardId,
      projectId: cardData.projectId,
    });

    return result;
  }

  /**
   * Cancel a running execution.
   * @param {string} executionId
   * @returns {Promise<{ executionId: string, status: string }>}
   */
  async cancel(executionId) {
    if (!this._available) {
      throw new Error('Bridge Server is not available');
    }

    const response = await this._fetch(`/cancel/${executionId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Cancel error: ${response.status}`);
    }

    const result = await response.json();

    AppEventBus.emit(AppEvents.AI_EXECUTION_CANCELLED, { executionId });

    return result;
  }

  // ─── WebSocket ──────────────────────────────────────────────────────

  /**
   * Connect WebSocket for real-time execution updates.
   * @param {string} executionId
   * @param {Function} onEvent - Callback: (event) => void
   * @returns {Function} Close function
   */
  connectWebSocket(executionId, onEvent) {
    if (!this._bridgeUrl || !this._apiKey) {
      throw new Error('Bridge not configured');
    }

    // Close existing connection for this execution
    this.disconnectWebSocket(executionId);

    const wsUrl = this._bridgeUrl.replace(/^http/, 'ws') + `/ws/${executionId}?token=${this._apiKey}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);

        // Also emit to AppEventBus
        if (data.type === 'checkpoint') {
          AppEventBus.emit(AppEvents.AI_EXECUTION_CHECKPOINT, { executionId, ...data.data });
        } else if (data.type === 'completed') {
          AppEventBus.emit(AppEvents.AI_EXECUTION_COMPLETED, { executionId, ...data.data });
        } else if (data.type === 'error') {
          AppEventBus.emit(AppEvents.AI_EXECUTION_ERROR, { executionId, ...data.data });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // WebSocket errors are non-fatal; RTDB subscription is the primary channel
    };

    ws.onclose = () => {
      this._wsConnections.delete(executionId);
    };

    this._wsConnections.set(executionId, ws);

    return () => this.disconnectWebSocket(executionId);
  }

  /**
   * Close WebSocket connection for an execution.
   * @param {string} executionId
   */
  disconnectWebSocket(executionId) {
    const ws = this._wsConnections.get(executionId);
    if (ws) {
      ws.close();
      this._wsConnections.delete(executionId);
    }
  }

  // ─── Firebase RTDB ──────────────────────────────────────────────────

  /**
   * Subscribe to execution updates via Firebase RTDB.
   * @param {string} executionId
   * @param {Function} callback - (executionData) => void
   * @returns {Function} Unsubscribe function
   */
  subscribeToExecution(executionId, callback) {
    if (!this._db) return () => {};

    import('firebase/database').then(({ ref, onValue }) => {
      const execRef = ref(this._db, `aiExecutions/${executionId}`);
      const unsubscribe = onValue(execRef, (snapshot) => {
        const data = snapshot.val();
        if (data) callback(data);
      });

      this._rtdbUnsubscribes.set(executionId, unsubscribe);
    });

    return () => this.unsubscribeFromExecution(executionId);
  }

  /**
   * Subscribe to all active executions (for dashboard).
   * @param {Function} callback - (executions: object) => void
   * @returns {Function} Unsubscribe function
   */
  subscribeToActiveExecutions(callback) {
    if (!this._db) return () => {};

    let unsubscribe = () => {};

    import('firebase/database').then(({ ref, query, orderByChild, equalTo, onValue }) => {
      const execRef = query(
        ref(this._db, 'aiExecutions'),
        orderByChild('status'),
        equalTo('running')
      );

      unsubscribe = onValue(execRef, (snapshot) => {
        const data = snapshot.val() || {};
        callback(data);
      });
    });

    return () => unsubscribe();
  }

  /**
   * Get execution history for a specific card.
   * @param {string} projectId
   * @param {string} firebaseCardId
   * @returns {Promise<object|null>}
   */
  async getCardExecutions(projectId, firebaseCardId) {
    if (!this._db) return null;

    const { ref, get } = await import('firebase/database');
    const snap = await get(ref(this._db, `aiExecutionsByCard/${projectId}/${firebaseCardId}`));
    return snap.val();
  }

  /**
   * Unsubscribe from execution updates.
   * @param {string} executionId
   */
  unsubscribeFromExecution(executionId) {
    const unsub = this._rtdbUnsubscribes.get(executionId);
    if (unsub) {
      unsub();
      this._rtdbUnsubscribes.delete(executionId);
    }
  }

  // ─── Private ────────────────────────────────────────────────────────

  async _healthCheck() {
    try {
      const response = await fetch(`${this._bridgeUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return false;
      const data = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  async _fetch(path, options = {}) {
    return fetch(`${this._bridgeUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`,
        ...options.headers,
      },
    });
  }
}

export const aiExecutionService = new AiExecutionService();

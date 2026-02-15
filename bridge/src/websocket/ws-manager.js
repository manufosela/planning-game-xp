/**
 * WebSocket Manager
 *
 * Manages WebSocket connections for real-time execution updates.
 * Maps executionId → Set<WebSocket> for broadcasting updates.
 */

const { WebSocketServer } = require('ws');

class WsManager {
  /**
   * @param {object} [deps] - Optional dependencies for testing
   * @param {typeof WebSocketServer} [deps.WebSocketServer] - WSS class override
   */
  constructor(deps = {}) {
    this._WsServer = deps.WebSocketServer || WebSocketServer;
    this._connections = new Map(); // executionId → Set<WebSocket>
    this._wss = null;
  }

  /**
   * Attach WebSocket server to an HTTP server.
   * @param {import('http').Server} server - HTTP server instance
   * @param {object} options
   * @param {Function} options.validateToken - Token validation function
   */
  attach(server, { validateToken }) {
    this._wss = new this._WsServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const pathParts = url.pathname.split('/');

      // Expected path: /ws/{executionId}
      if (pathParts.length < 3 || pathParts[1] !== 'ws') {
        socket.destroy();
        return;
      }

      const executionId = pathParts[2];
      const token = url.searchParams.get('token');

      if (!validateToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this._wss.handleUpgrade(request, socket, head, (ws) => {
        this._handleConnection(ws, executionId);
      });
    });
  }

  /**
   * Send event to all WebSocket clients subscribed to an execution.
   * @param {string} executionId
   * @param {string} type - Event type
   * @param {object} data - Event data
   */
  broadcast(executionId, type, data) {
    const connections = this._connections.get(executionId);
    if (!connections) return;

    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });

    for (const ws of connections) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    }
  }

  /**
   * Get count of active connections for an execution.
   * @param {string} executionId
   * @returns {number}
   */
  getConnectionCount(executionId) {
    const connections = this._connections.get(executionId);
    return connections ? connections.size : 0;
  }

  /**
   * Get total active connections across all executions.
   * @returns {number}
   */
  getTotalConnections() {
    let total = 0;
    for (const connections of this._connections.values()) {
      total += connections.size;
    }
    return total;
  }

  /**
   * Close all connections for an execution.
   * @param {string} executionId
   */
  closeExecution(executionId) {
    const connections = this._connections.get(executionId);
    if (!connections) return;

    for (const ws of connections) {
      ws.close(1000, 'Execution ended');
    }
    this._connections.delete(executionId);
  }

  /**
   * Handle a new WebSocket connection.
   * @param {WebSocket} ws
   * @param {string} executionId
   * @private
   */
  _handleConnection(ws, executionId) {
    if (!this._connections.has(executionId)) {
      this._connections.set(executionId, new Set());
    }
    this._connections.get(executionId).add(ws);

    ws.on('message', (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        if (message.type === 'cancel') {
          ws.emit('cancel_request', executionId);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      const connections = this._connections.get(executionId);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          this._connections.delete(executionId);
        }
      }
    });

    // Send initial connected event
    ws.send(JSON.stringify({
      type: 'connected',
      data: { executionId },
      timestamp: new Date().toISOString(),
    }));
  }
}

module.exports = { WsManager };

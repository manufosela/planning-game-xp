/**
 * Bridge Server
 *
 * Express + WebSocket server that connects Planning Game web UI
 * with Karajan-Code AI orchestrator.
 *
 * Endpoints:
 *   GET  /health           - Health check (no auth)
 *   POST /execute          - Start AI execution
 *   GET  /status/:id       - Get execution status
 *   POST /cancel/:id       - Cancel execution
 *   WS   /ws/:id           - Real-time execution updates
 */

const http = require('http');
const express = require('express');
const cors = require('cors');

const { loadConfig } = require('./config');
const { AuthService } = require('./services/auth-service');
const { FirebaseWriter } = require('./services/firebase-writer');
const { SessionMonitor } = require('./services/session-monitor');
const { KjExecutor } = require('./services/kj-executor');
const { WsManager } = require('./websocket/ws-manager');
const { createExecuteRouter } = require('./routes/execute');
const { createStatusRouter } = require('./routes/status');
const { createCancelRouter } = require('./routes/cancel');

/**
 * Create and configure the Bridge server.
 * @param {object} [overrides] - Optional dependency overrides for testing
 * @returns {{ app: express.Application, server: http.Server, start: Function }}
 */
function createServer(overrides = {}) {
  const config = overrides.config || loadConfig();

  // Initialize services
  const authService = overrides.authService || new AuthService(config.apiKey);
  const firebaseWriter = overrides.firebaseWriter || _initFirebase(config);
  const sessionMonitor = overrides.sessionMonitor || new SessionMonitor();
  const kjExecutor = overrides.kjExecutor || new KjExecutor();
  const wsManager = overrides.wsManager || new WsManager();

  // Express app
  const app = express();

  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json());
  app.use(authService.middleware());

  // Health check (no auth - skipped by middleware)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      runningExecutions: kjExecutor.getRunningCount(),
      activeWsConnections: wsManager.getTotalConnections(),
    });
  });

  // API routes
  const deps = { kjExecutor, firebaseWriter, sessionMonitor, wsManager, config };
  app.use('/execute', createExecuteRouter(deps));
  app.use('/status', createStatusRouter(deps));
  app.use('/cancel', createCancelRouter(deps));

  // HTTP server
  const server = http.createServer(app);

  // WebSocket upgrade
  wsManager.attach(server, {
    validateToken: (token) => authService.validateWsToken(token),
  });

  function start() {
    return new Promise((resolve) => {
      server.listen(config.port, () => {
        console.log(`Bridge Server listening on port ${config.port}`);
        resolve(server);
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      kjExecutor.cancelAll();
      sessionMonitor.stopAll();
      server.close(resolve);
    });
  }

  return { app, server, start, stop };
}

/**
 * Initialize Firebase Admin SDK and return the RTDB instance.
 * @param {object} config
 * @returns {FirebaseWriter}
 */
function _initFirebase(config) {
  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    const initConfig = { databaseURL: config.databaseUrl };

    if (config.googleCredentials) {
      const serviceAccount = require(config.googleCredentials);
      initConfig.credential = admin.credential.cert(serviceAccount);
    } else {
      initConfig.credential = admin.credential.applicationDefault();
    }

    admin.initializeApp(initConfig);
  }

  const db = admin.database();
  return new FirebaseWriter(db);
}

// Auto-start when run directly
if (require.main === module) {
  const { start } = createServer();
  start().catch((err) => {
    console.error('Failed to start Bridge Server:', err);
    process.exit(1);
  });
}

module.exports = { createServer };

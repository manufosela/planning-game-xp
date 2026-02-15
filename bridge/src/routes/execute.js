/**
 * Execute Route
 *
 * POST /execute - Start an AI execution for a card.
 * Creates execution record in Firebase RTDB, spawns KJ process,
 * and begins monitoring the session.
 */

const { randomUUID } = require('crypto');
const { Router } = require('express');

/**
 * Create execute router.
 * @param {object} deps
 * @param {import('../services/kj-executor')} deps.kjExecutor
 * @param {import('../services/firebase-writer')} deps.firebaseWriter
 * @param {import('../services/session-monitor')} deps.sessionMonitor
 * @param {import('../websocket/ws-manager')} deps.wsManager
 * @param {object} deps.config
 * @returns {Router}
 */
function createExecuteRouter({ kjExecutor, firebaseWriter, sessionMonitor, wsManager, config }) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { projectId, cardId, cardType, firebaseCardId, requestedBy, context, options = {} } = req.body;

      // Validate required fields
      if (!projectId || !cardId || !cardType || !firebaseCardId || !requestedBy) {
        return res.status(400).json({
          error: 'Missing required fields: projectId, cardId, cardType, firebaseCardId, requestedBy',
        });
      }

      const executionId = `exec_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const now = new Date().toISOString();

      const execution = {
        executionId,
        cardId,
        cardType,
        projectId,
        firebaseCardId,
        status: 'queued',
        phase: null,
        iteration: 0,
        maxIterations: options.maxIterations || 3,
        requestedBy,
        requestedAt: now,
        startedAt: null,
        completedAt: null,
        bridgeInstanceId: `bridge-${config.port}`,
        kjSessionId: null,
        checkpoints: {},
        result: null,
        error: null,
      };

      // Write to Firebase RTDB
      await firebaseWriter.createExecution(execution);

      // Start KJ execution asynchronously
      _startExecution(executionId, execution, context, options, {
        kjExecutor, firebaseWriter, sessionMonitor, wsManager, config,
      });

      const wsUrl = `ws://localhost:${config.port}/ws/${executionId}`;

      res.status(202).json({
        executionId,
        wsUrl,
        status: 'queued',
      });
    } catch (err) {
      console.error('Execute error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

/**
 * Start KJ execution asynchronously.
 * This runs in the background after the HTTP response is sent.
 */
async function _startExecution(executionId, execution, context, options, deps) {
  const { kjExecutor, firebaseWriter, sessionMonitor, wsManager, config } = deps;

  try {
    // Update status to running
    await firebaseWriter.updateExecution(executionId, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    wsManager.broadcast(executionId, 'phase_change', { status: 'running', phase: 'coder' });

    // Build task description from context
    const description = _buildDescription(execution, context);

    // Listen for session monitor events
    sessionMonitor.on('checkpoint', (event) => {
      if (event.executionId !== executionId) return;

      firebaseWriter.writeCheckpoint(executionId, event.index, event.checkpoint);
      wsManager.broadcast(executionId, 'checkpoint', event.checkpoint);
    });

    sessionMonitor.on('status_change', (event) => {
      if (event.executionId !== executionId) return;

      firebaseWriter.updateExecution(executionId, {
        phase: event.phase,
        iteration: event.iteration,
      });
      wsManager.broadcast(executionId, 'phase_change', {
        phase: event.phase,
        iteration: event.iteration,
      });
    });

    // Execute KJ
    const result = await kjExecutor.execute(executionId, {
      description,
      cwd: process.cwd(),
      maxIterations: options.maxIterations || 3,
      sonarEnabled: options.sonarEnabled || false,
      kjHome: config.kjHome,
    });

    if (result.exitCode === 0) {
      await firebaseWriter.setResult(executionId, {
        exitCode: result.exitCode,
        sessionId: result.sessionId,
      });
      wsManager.broadcast(executionId, 'completed', { exitCode: result.exitCode });
    } else {
      await firebaseWriter.setError(executionId, `KJ exited with code ${result.exitCode}`);
      wsManager.broadcast(executionId, 'error', { exitCode: result.exitCode });
    }
  } catch (err) {
    await firebaseWriter.setError(executionId, err.message);
    wsManager.broadcast(executionId, 'error', { error: err.message });
  } finally {
    sessionMonitor.stopMonitoring(executionId);
    // Give clients time to receive final messages before closing
    setTimeout(() => wsManager.closeExecution(executionId), 2000);
  }
}

/**
 * Build a task description string from card context.
 */
function _buildDescription(execution, context = {}) {
  let desc = `[${execution.cardId}] ${context.title || execution.cardId}`;

  if (context.acceptanceCriteria && context.acceptanceCriteria.length > 0) {
    desc += '\n\nAcceptance Criteria:';
    for (const ac of context.acceptanceCriteria) {
      if (ac.given && ac.when && ac.then) {
        desc += `\n- Given ${ac.given}, When ${ac.when}, Then ${ac.then}`;
      } else if (ac.raw) {
        desc += `\n- ${ac.raw}`;
      }
    }
  }

  if (context.description) {
    desc += `\n\nDescription: ${context.description}`;
  }

  return desc;
}

module.exports = { createExecuteRouter };

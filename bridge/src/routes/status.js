/**
 * Status Route
 *
 * GET /status/:executionId - Get current status of an AI execution.
 */

const { Router } = require('express');

/**
 * Create status router.
 * @param {object} deps
 * @param {import('../services/firebase-writer')} deps.firebaseWriter
 * @param {import('../services/kj-executor')} deps.kjExecutor
 * @returns {Router}
 */
function createStatusRouter({ firebaseWriter, kjExecutor }) {
  const router = Router();

  router.get('/:executionId', async (req, res) => {
    try {
      const { executionId } = req.params;

      const execution = await firebaseWriter.getExecution(executionId);

      if (!execution) {
        return res.status(404).json({ error: `Execution ${executionId} not found` });
      }

      const isRunning = kjExecutor.isRunning(executionId);
      const startedAt = execution.startedAt ? new Date(execution.startedAt).getTime() : null;
      const elapsedMs = isRunning && startedAt ? Date.now() - startedAt : null;

      res.json({
        executionId: execution.executionId,
        status: execution.status,
        phase: execution.phase,
        iteration: execution.iteration,
        maxIterations: execution.maxIterations,
        checkpoints: execution.checkpoints || {},
        result: execution.result,
        error: execution.error,
        requestedAt: execution.requestedAt,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        elapsedMs,
        isRunning,
      });
    } catch (err) {
      console.error('Status error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createStatusRouter };

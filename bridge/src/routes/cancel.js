/**
 * Cancel Route
 *
 * POST /cancel/:executionId - Cancel a running AI execution.
 */

const { Router } = require('express');

/**
 * Create cancel router.
 * @param {object} deps
 * @param {import('../services/kj-executor')} deps.kjExecutor
 * @param {import('../services/firebase-writer')} deps.firebaseWriter
 * @param {import('../websocket/ws-manager')} deps.wsManager
 * @returns {Router}
 */
function createCancelRouter({ kjExecutor, firebaseWriter, wsManager }) {
  const router = Router();

  router.post('/:executionId', async (req, res) => {
    try {
      const { executionId } = req.params;

      const execution = await firebaseWriter.getExecution(executionId);

      if (!execution) {
        return res.status(404).json({ error: `Execution ${executionId} not found` });
      }

      if (execution.status !== 'running' && execution.status !== 'queued') {
        return res.status(400).json({
          error: `Cannot cancel execution with status "${execution.status}"`,
        });
      }

      const killed = kjExecutor.cancel(executionId);

      await firebaseWriter.updateExecution(executionId, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      });

      wsManager.broadcast(executionId, 'cancelled', { executionId });

      res.json({
        executionId,
        status: 'cancelled',
        processKilled: killed,
      });
    } catch (err) {
      console.error('Cancel error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createCancelRouter };

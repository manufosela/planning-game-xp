/**
 * Firebase Writer Service
 *
 * Writes AI execution data to Firebase Realtime Database.
 * Handles both /aiExecutions/{id} and /aiExecutionsByCard/{proj}/{card} paths.
 */

class FirebaseWriter {
  /**
   * @param {object} db - Firebase Realtime Database instance
   */
  constructor(db) {
    if (!db) {
      throw new Error('Firebase database instance is required');
    }
    this._db = db;
  }

  /**
   * Create a new execution record.
   * @param {object} execution - Execution data
   * @returns {Promise<void>}
   */
  async createExecution(execution) {
    const { executionId, projectId, firebaseCardId, requestedBy, requestedAt, status } = execution;

    const updates = {};

    // Main execution record
    updates[`aiExecutions/${executionId}`] = execution;

    // Card index
    updates[`aiExecutionsByCard/${projectId}/${firebaseCardId}/latestExecutionId`] = executionId;
    updates[`aiExecutionsByCard/${projectId}/${firebaseCardId}/history/${executionId}`] = {
      status,
      requestedAt,
      requestedBy,
    };

    await this._db.ref().update(updates);
  }

  /**
   * Update execution status and optional fields.
   * @param {string} executionId
   * @param {object} data - Fields to update
   * @returns {Promise<void>}
   */
  async updateExecution(executionId, data) {
    const updates = {};

    for (const [key, value] of Object.entries(data)) {
      updates[`aiExecutions/${executionId}/${key}`] = value;
    }

    // If status changed, update the card index too
    if (data.status) {
      const execSnap = await this._db.ref(`aiExecutions/${executionId}`).once('value');
      const exec = execSnap.val();
      if (exec) {
        updates[`aiExecutionsByCard/${exec.projectId}/${exec.firebaseCardId}/history/${executionId}/status`] = data.status;
      }
    }

    await this._db.ref().update(updates);
  }

  /**
   * Write a checkpoint to the execution.
   * @param {string} executionId
   * @param {number} index - Checkpoint index
   * @param {object} checkpoint - Checkpoint data
   * @returns {Promise<void>}
   */
  async writeCheckpoint(executionId, index, checkpoint) {
    await this._db.ref(`aiExecutions/${executionId}/checkpoints/${index}`).set(checkpoint);
  }

  /**
   * Set execution result.
   * @param {string} executionId
   * @param {object} result - Result data
   * @returns {Promise<void>}
   */
  async setResult(executionId, result) {
    await this.updateExecution(executionId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result,
    });
  }

  /**
   * Set execution error.
   * @param {string} executionId
   * @param {string} error - Error message
   * @returns {Promise<void>}
   */
  async setError(executionId, error) {
    await this.updateExecution(executionId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
    });
  }

  /**
   * Get execution by ID.
   * @param {string} executionId
   * @returns {Promise<object|null>}
   */
  async getExecution(executionId) {
    const snap = await this._db.ref(`aiExecutions/${executionId}`).once('value');
    return snap.val();
  }
}

module.exports = { FirebaseWriter };

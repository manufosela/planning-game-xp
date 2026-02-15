/**
 * Session Monitor Service
 *
 * Watches Karajan-Code session files for checkpoint updates.
 * Uses fs.watch on the session.json file and emits events when
 * new checkpoints are detected.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class SessionMonitor extends EventEmitter {
  constructor() {
    super();
    this._watchers = new Map(); // executionId → FSWatcher
    this._lastCheckpointCount = new Map(); // executionId → number
  }

  /**
   * Start monitoring a KJ session file.
   * @param {string} executionId - Execution ID for correlation
   * @param {string} sessionDir - Path to KJ session directory
   */
  startMonitoring(executionId, sessionDir) {
    const sessionFile = path.join(sessionDir, 'session.json');

    if (this._watchers.has(executionId)) {
      this.stopMonitoring(executionId);
    }

    this._lastCheckpointCount.set(executionId, 0);

    // Set up watcher first, then do initial read.
    // This ensures stopMonitoring() inside _readAndEmit can find and close the watcher.
    try {
      const watcher = fs.watch(sessionFile, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          this._readAndEmit(executionId, sessionFile);
        }
      });

      watcher.on('error', (err) => {
        this.emit('error', { executionId, error: err.message });
        this.stopMonitoring(executionId);
      });

      this._watchers.set(executionId, watcher);
    } catch (err) {
      this.emit('error', { executionId, error: `Cannot watch session file: ${err.message}` });
    }

    // Initial read (may trigger stopMonitoring if session is already complete)
    this._readAndEmit(executionId, sessionFile);
  }

  /**
   * Stop monitoring a session.
   * @param {string} executionId
   */
  stopMonitoring(executionId) {
    const watcher = this._watchers.get(executionId);
    if (watcher) {
      watcher.close();
      this._watchers.delete(executionId);
    }
    this._lastCheckpointCount.delete(executionId);
  }

  /**
   * Stop all monitors.
   */
  stopAll() {
    for (const executionId of this._watchers.keys()) {
      this.stopMonitoring(executionId);
    }
  }

  /**
   * Get count of active monitors.
   * @returns {number}
   */
  getActiveCount() {
    return this._watchers.size;
  }

  /**
   * Read session file and emit new checkpoints.
   * @param {string} executionId
   * @param {string} sessionFile
   * @private
   */
  _readAndEmit(executionId, sessionFile) {
    try {
      const content = fs.readFileSync(sessionFile, 'utf8');
      const session = JSON.parse(content);

      // Emit status changes
      if (session.status) {
        this.emit('status_change', {
          executionId,
          status: session.status,
          phase: session.currentPhase || null,
          iteration: session.currentIteration || null,
        });
      }

      // Emit new checkpoints
      const checkpoints = session.checkpoints || [];
      const lastCount = this._lastCheckpointCount.get(executionId) || 0;

      if (checkpoints.length > lastCount) {
        for (let i = lastCount; i < checkpoints.length; i++) {
          this.emit('checkpoint', {
            executionId,
            index: i,
            checkpoint: checkpoints[i],
          });
        }
        this._lastCheckpointCount.set(executionId, checkpoints.length);
      }

      // Handle completion: stop monitoring first, then emit
      if (session.status === 'completed' || session.status === 'failed') {
        this.stopMonitoring(executionId);
        this.emit('completed', {
          executionId,
          status: session.status,
          result: session.result || null,
          error: session.error || null,
        });
      }
    } catch {
      // File might be mid-write, skip this read
    }
  }
}

module.exports = { SessionMonitor };

/**
 * KJ Executor Service
 *
 * Spawns Karajan-Code CLI processes and tracks them for cancellation.
 * Each execution gets a unique executionId mapped to a ChildProcess.
 */

const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

class KjExecutor extends EventEmitter {
  /**
   * @param {object} [deps] - Optional dependencies for testing
   * @param {Function} [deps.spawn] - spawn override
   */
  constructor(deps = {}) {
    super();
    this._spawn = deps.spawn || spawn;
    this._processes = new Map(); // executionId → { process, startedAt }
  }

  /**
   * Execute a KJ run command.
   * @param {string} executionId - Unique execution ID
   * @param {object} params
   * @param {string} params.description - Task description for KJ
   * @param {string} params.cwd - Working directory (project repo root)
   * @param {number} [params.maxIterations=3] - Max iterations
   * @param {boolean} [params.sonarEnabled=false] - Enable SonarQube analysis
   * @param {string} [params.kjHome] - KJ home directory
   * @returns {Promise<{ exitCode: number, sessionId: string|null }>}
   */
  execute(executionId, params) {
    const { description, cwd, maxIterations = 3, sonarEnabled = false, kjHome } = params;

    if (this._processes.has(executionId)) {
      throw new Error(`Execution ${executionId} is already running`);
    }

    const args = ['run', description, '--non-interactive', '--max-iterations', String(maxIterations)];
    if (sonarEnabled) args.push('--sonar');

    const env = { ...process.env };
    if (kjHome) env.KJ_HOME = kjHome;

    return new Promise((resolve, reject) => {
      const child = this._spawn('kj', args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this._processes.set(executionId, {
        process: child,
        startedAt: new Date().toISOString(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        this.emit('output', { executionId, stream: 'stdout', data: data.toString() });
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        this.emit('output', { executionId, stream: 'stderr', data: data.toString() });
      });

      child.on('close', (code) => {
        this._processes.delete(executionId);

        // Try to extract session ID from stdout
        const sessionMatch = stdout.match(/session[_-]id[:\s]+(\S+)/i);
        const sessionId = sessionMatch ? sessionMatch[1] : null;

        this.emit('exit', { executionId, exitCode: code, sessionId });
        resolve({ exitCode: code, sessionId });
      });

      child.on('error', (err) => {
        this._processes.delete(executionId);
        this.emit('error', { executionId, error: err.message });
        reject(err);
      });
    });
  }

  /**
   * Cancel a running execution.
   * @param {string} executionId
   * @returns {boolean} True if process was found and killed
   */
  cancel(executionId) {
    const entry = this._processes.get(executionId);
    if (!entry) return false;

    entry.process.kill('SIGTERM');

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (this._processes.has(executionId)) {
        entry.process.kill('SIGKILL');
        this._processes.delete(executionId);
      }
    }, 5000);

    return true;
  }

  /**
   * Check if an execution is currently running.
   * @param {string} executionId
   * @returns {boolean}
   */
  isRunning(executionId) {
    return this._processes.has(executionId);
  }

  /**
   * Get count of running executions.
   * @returns {number}
   */
  getRunningCount() {
    return this._processes.size;
  }

  /**
   * Cancel all running executions.
   */
  cancelAll() {
    for (const executionId of this._processes.keys()) {
      this.cancel(executionId);
    }
  }
}

module.exports = { KjExecutor };

#!/usr/bin/env node
/**
 * KJ Instance Manager
 *
 * Manages Karajan-Code installations and Bridge Server instances
 * for the Planning Game XP ecosystem.
 *
 * Responsibilities:
 *   - Clone/update Karajan-Code repository
 *   - Launch KJ installer (interactive or non-interactive)
 *   - Build/start/stop Bridge Server via Docker Compose
 *   - Register/unregister KJ MCP with Claude
 *   - Track instances via manifest file
 *
 * Directory structure:
 *   ~/.planning-game/kj-instances.json      - Manifest
 *   {kjRepoPath}/                           - KJ repo clone
 *   bridge/ (in PG repo root)               - Bridge Server source
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.planning-game');
const MANIFEST_FILE_NAME = 'kj-instances.json';
const KJ_REPO_URL = 'https://github.com/AgilePlanning-io/karajan-code.git';
const MANIFEST_SCHEMA_VERSION = 1;

class KjInstanceManager {
  /**
   * @param {string} [baseDir] - Base directory for manifest (default: ~/.planning-game)
   * @param {object} [deps] - Optional dependencies for testing
   * @param {Function} [deps.execSync] - execSync override
   * @param {Function} [deps.spawn] - spawn override
   */
  constructor(baseDir, deps = {}) {
    this.baseDir = baseDir || DEFAULT_STATE_DIR;
    this.manifestPath = path.join(this.baseDir, MANIFEST_FILE_NAME);
    this._execSync = deps.execSync || execSync;
    this._spawn = deps.spawn || spawn;
  }

  // ─── Manifest I/O ───────────────────────────────────────────────────────

  /**
   * Load manifest from disk, or return default empty manifest.
   * @returns {object} Manifest object
   */
  loadManifest() {
    try {
      const content = fs.readFileSync(this.manifestPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return this._defaultManifest();
    }
  }

  /**
   * Save manifest to disk. Creates directories if needed.
   * @param {object} manifest
   */
  saveManifest(manifest) {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  // ─── Instance Queries ──────────────────────────────────────────────────

  /**
   * List all KJ instances from manifest.
   * @returns {object[]} Array of instance objects
   */
  listInstances() {
    const manifest = this.loadManifest();
    return Object.values(manifest.instances);
  }

  /**
   * Find instance by name.
   * @param {string} name
   * @returns {object|null}
   */
  findByName(name) {
    const manifest = this.loadManifest();
    return manifest.instances[name] || null;
  }

  /**
   * Check if instance exists.
   * @param {string} name
   * @returns {boolean}
   */
  instanceExists(name) {
    return this.findByName(name) !== null;
  }

  // ─── Repo Management ──────────────────────────────────────────────────

  /**
   * Check if git CLI is available.
   * @returns {boolean}
   */
  isGitAvailable() {
    try {
      this._execSync('git --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if GitHub SSH authentication is available.
   * @returns {boolean}
   */
  hasGithubSshAccess() {
    const command = 'ssh -T -o StrictHostKeyChecking=accept-new git@github.com';
    const isSuccessText = (text) => String(text || '').includes("successfully authenticated");

    try {
      const output = this._execSync(command, { stdio: 'pipe', encoding: 'utf8' });
      return isSuccessText(output);
    } catch (error) {
      return isSuccessText(error?.stdout) || isSuccessText(error?.stderr) || false;
    }
  }

  /**
   * Clone Karajan-Code repository.
   * @param {string} targetDir - Target directory for clone
   * @returns {string} The target directory path
   */
  cloneKjRepo(targetDir) {
    if (this.isKjInstalled(targetDir)) {
      throw new Error(`Karajan-Code already exists at: ${targetDir}`);
    }

    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    this._execSync(`git clone ${KJ_REPO_URL} "${targetDir}"`, { stdio: 'pipe' });
    return targetDir;
  }

  /**
   * Update existing Karajan-Code repository.
   * @param {string} targetDir - KJ repo directory
   */
  updateKjRepo(targetDir) {
    if (!this.isKjInstalled(targetDir)) {
      throw new Error(`Karajan-Code not found at: ${targetDir}`);
    }
    this._execSync('git pull', { cwd: targetDir, stdio: 'pipe' });
  }

  /**
   * Check if KJ is installed at the given directory.
   * @param {string} targetDir - Directory to check
   * @returns {boolean}
   */
  isKjInstalled(targetDir) {
    return fs.existsSync(path.join(targetDir, 'package.json'));
  }

  // ─── Installer Delegation ─────────────────────────────────────────────

  /**
   * Run KJ installer in interactive mode (stdio: 'inherit').
   * Returns a promise that resolves when the installer exits.
   * @param {string} targetDir - KJ repo directory
   * @returns {Promise<number>} Exit code
   */
  runKjInstallerInteractive(targetDir) {
    if (!this.isKjInstalled(targetDir)) {
      throw new Error(`Karajan-Code not found at: ${targetDir}`);
    }

    return new Promise((resolve, reject) => {
      const child = this._spawn('node', ['scripts/setup.js'], {
        cwd: targetDir,
        stdio: 'inherit',
      });

      child.on('close', (code) => resolve(code));
      child.on('error', (err) => reject(err));
    });
  }

  /**
   * Run KJ installer in non-interactive mode with CLI flags.
   * @param {string} targetDir - KJ repo directory
   * @param {object} options - Installer options
   * @param {string} [options.kjHome] - KJ home directory
   * @param {boolean} [options.sonarEnabled] - Enable SonarQube integration
   * @returns {Promise<number>} Exit code
   */
  runKjInstallerNonInteractive(targetDir, options = {}) {
    if (!this.isKjInstalled(targetDir)) {
      throw new Error(`Karajan-Code not found at: ${targetDir}`);
    }

    const args = ['scripts/setup.js', '--non-interactive'];
    if (options.kjHome) args.push('--kj-home', options.kjHome);
    if (options.sonarEnabled) args.push('--sonar');

    return new Promise((resolve, reject) => {
      const child = this._spawn('node', args, {
        cwd: targetDir,
        stdio: 'pipe',
      });

      child.on('close', (code) => resolve(code));
      child.on('error', (err) => reject(err));
    });
  }

  // ─── Bridge Management ─────────────────────────────────────────────────

  /**
   * Build Bridge Server Docker image.
   * @param {string} pgRootDir - Planning Game repo root directory
   * @param {object} config - Bridge configuration
   * @param {string} [config.bridgePort] - Port for Bridge server
   */
  buildBridge(pgRootDir, config = {}) {
    const composeFile = path.join(pgRootDir, 'docker-compose.yml');
    if (!fs.existsSync(composeFile)) {
      throw new Error(`docker-compose.yml not found at: ${pgRootDir}`);
    }

    const bridgeDir = path.join(pgRootDir, 'bridge');
    if (!fs.existsSync(bridgeDir)) {
      throw new Error(`Bridge directory not found at: ${bridgeDir}`);
    }

    this._execSync('docker compose build bridge', { cwd: pgRootDir, stdio: 'pipe' });
  }

  /**
   * Start Bridge Server via Docker Compose.
   * @param {string} pgRootDir - Planning Game repo root directory
   * @param {object} config - Bridge environment config
   * @param {number} [config.bridgePort] - Port for Bridge server
   * @param {string} [config.databaseUrl] - Firebase Database URL
   * @param {string} [config.bridgeApiKey] - API key for Bridge auth
   * @param {string} [config.kjHome] - KJ home directory
   * @param {string} [config.serviceAccountKeyPath] - Path to service account key
   */
  startBridge(pgRootDir, config = {}) {
    const env = {};
    if (config.bridgePort) env.BRIDGE_PORT = String(config.bridgePort);
    if (config.databaseUrl) env.DATABASE_URL = config.databaseUrl;
    if (config.bridgeApiKey) env.BRIDGE_API_KEY = config.bridgeApiKey;
    if (config.kjHome) env.KJ_HOME = config.kjHome;
    if (config.serviceAccountKeyPath) env.SERVICE_ACCOUNT_KEY_PATH = config.serviceAccountKeyPath;

    this._execSync('docker compose up -d bridge', {
      cwd: pgRootDir,
      stdio: 'pipe',
      env: { ...process.env, ...env },
    });
  }

  /**
   * Stop Bridge Server.
   * @param {string} pgRootDir - Planning Game repo root directory
   */
  stopBridge(pgRootDir) {
    this._execSync('docker compose stop bridge', { cwd: pgRootDir, stdio: 'pipe' });
  }

  /**
   * Check if Bridge Server is running.
   * @returns {boolean}
   */
  isBridgeRunning() {
    try {
      const output = this._execSync('docker ps --filter name=planninggame-bridge --format "{{.Status}}"', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return output.trim().toLowerCase().startsWith('up');
    } catch {
      return false;
    }
  }

  /**
   * Wait for Bridge health endpoint to respond.
   * @param {number} port - Bridge port
   * @param {number} [timeout=30000] - Timeout in ms
   * @returns {Promise<boolean>} True if healthy within timeout
   */
  async waitForBridgeHealth(port, timeout = 30000) {
    const start = Date.now();
    const url = `http://localhost:${port}/health`;

    while (Date.now() - start < timeout) {
      try {
        this._execSync(`curl -sf ${url}`, { stdio: 'pipe', timeout: 3000 });
        return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return false;
  }

  // ─── Client Registration ──────────────────────────────────────────────

  /**
   * Register KJ MCP with Claude CLI.
   * @param {string} instanceName - Instance name for the MCP registration
   * @param {string} kjRepoPath - Path to KJ repo
   * @param {string} kjHome - KJ home directory
   */
  registerMcpKj(instanceName, kjRepoPath, kjHome) {
    const mcpName = `karajan-${instanceName}`;
    const args = [
      'mcp', 'add', mcpName,
      '-s', 'user',
      '-e', `KJ_HOME=${kjHome}`,
      '--', 'node', path.join(kjRepoPath, 'mcp-server', 'index.js'),
    ];

    this._execSync(`claude ${args.join(' ')}`, { stdio: 'pipe' });

    const manifest = this.loadManifest();
    if (manifest.instances[instanceName]) {
      if (!manifest.instances[instanceName].registeredClients) {
        manifest.instances[instanceName].registeredClients = [];
      }
      if (!manifest.instances[instanceName].registeredClients.includes('claude')) {
        manifest.instances[instanceName].registeredClients.push('claude');
      }
      manifest.instances[instanceName].updatedAt = new Date().toISOString();
      this.saveManifest(manifest);
    }
  }

  /**
   * Unregister KJ MCP from Claude CLI.
   * @param {string} instanceName - Instance name
   */
  unregisterMcpKj(instanceName) {
    const mcpName = `karajan-${instanceName}`;
    this._execSync(`claude mcp remove ${mcpName}`, { stdio: 'pipe' });

    const manifest = this.loadManifest();
    if (manifest.instances[instanceName]) {
      manifest.instances[instanceName].registeredClients =
        (manifest.instances[instanceName].registeredClients || []).filter(c => c !== 'claude');
      manifest.instances[instanceName].updatedAt = new Date().toISOString();
      this.saveManifest(manifest);
    }
  }

  // ─── Instance Lifecycle ────────────────────────────────────────────────

  /**
   * Create a new KJ instance entry in the manifest.
   * @param {string} name - Instance name
   * @param {object} config - Instance configuration
   * @param {string} config.kjRepoPath - Path to KJ repo
   * @param {string} config.kjHome - KJ home directory
   * @param {number} [config.bridgePort] - Bridge server port
   * @param {string} [config.bridgeApiKey] - Bridge API key
   * @returns {object} The created instance
   */
  createInstance(name, config = {}) {
    if (this.instanceExists(name)) {
      throw new Error(`KJ instance "${name}" already exists.`);
    }

    const instance = {
      name,
      kjRepoPath: config.kjRepoPath || null,
      kjHome: config.kjHome || null,
      bridgePort: config.bridgePort || 3100,
      bridgeApiKey: config.bridgeApiKey || null,
      registeredClients: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const manifest = this.loadManifest();
    manifest.instances[name] = instance;
    this.saveManifest(manifest);

    return instance;
  }

  /**
   * Delete a KJ instance from the manifest.
   * @param {string} name - Instance name
   */
  deleteInstance(name) {
    const instance = this.findByName(name);
    if (!instance) {
      throw new Error(`KJ instance "${name}" not found.`);
    }

    // Try to unregister from Claude
    try {
      this.unregisterMcpKj(name);
    } catch {
      // Ignore unregister errors
    }

    const manifest = this.loadManifest();
    delete manifest.instances[name];
    this.saveManifest(manifest);
  }

  // ─── Docker Detection ─────────────────────────────────────────────────

  /**
   * Check if Docker is available.
   * @returns {boolean}
   */
  isDockerAvailable() {
    try {
      this._execSync('docker --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if Docker Compose is available.
   * @returns {boolean}
   */
  isDockerComposeAvailable() {
    try {
      this._execSync('docker compose version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  _defaultManifest() {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      instances: {},
    };
  }
}

module.exports = { KjInstanceManager, DEFAULT_STATE_DIR, KJ_REPO_URL };

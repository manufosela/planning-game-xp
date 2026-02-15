#!/usr/bin/env node
/**
 * MCP Instance Manager
 *
 * Manages multi-instance MCP server installations for Planning Game XP.
 * Each instance connects to a different Firebase project/environment.
 *
 * Directory structure:
 *   ~/mcp-servers/planning-game/                    - Shared engine (git clone)
 *   ~/mcp-servers/planning-game-instances/           - Instance base dir
 *   ~/mcp-servers/planning-game-instances/instances.json  - Manifest
 *   ~/mcp-servers/planning-game-instances/{name}/    - Instance config dir
 *     ├── serviceAccountKey.json
 *     └── mcp.user.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DEFAULT_INSTANCES_DIR = path.join(os.homedir(), 'mcp-servers', 'planning-game-instances');
const DEFAULT_ENGINE_DIR = path.join(os.homedir(), 'mcp-servers', 'planning-game');
const MCP_REPO_URL = 'https://github.com/AgilePlanning-io/planning-game-mcp.git';

const MANIFEST_SCHEMA_VERSION = 1;

class McpInstanceManager {
  /**
   * @param {string} [instancesDir] - Base directory for instances (default: ~/mcp-servers/planning-game-instances)
   * @param {string} [engineDir] - Engine directory (default: ~/mcp-servers/planning-game)
   * @param {object} [deps] - Optional dependencies for testing
   * @param {Function} [deps.execSync] - execSync function override
   */
  constructor(instancesDir, engineDir, deps = {}) {
    this.instancesDir = instancesDir || DEFAULT_INSTANCES_DIR;
    this.engineDir = engineDir || DEFAULT_ENGINE_DIR;
    this.manifestPath = path.join(this.instancesDir, 'instances.json');
    this._execSync = deps.execSync || execSync;
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
    fs.mkdirSync(this.instancesDir, { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  /**
   * Reconcile manifest with filesystem: discover orphan dirs, mark stale entries.
   * @returns {{ discovered: string[], stale: string[] }}
   */
  reconcileManifest() {
    const manifest = this.loadManifest();
    const result = { discovered: [], stale: [] };

    // Discover dirs not in manifest
    if (fs.existsSync(this.instancesDir)) {
      const entries = fs.readdirSync(this.instancesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !manifest.instances[entry.name]) {
          result.discovered.push(entry.name);
          manifest.instances[entry.name] = {
            name: entry.name,
            directory: path.join(this.instancesDir, entry.name),
            firebaseProjectId: null,
            firebaseDatabaseUrl: null,
            hasServiceAccountKey: fs.existsSync(path.join(this.instancesDir, entry.name, 'serviceAccountKey.json')),
            hasMcpUser: fs.existsSync(path.join(this.instancesDir, entry.name, 'mcp.user.json')),
            registeredClients: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            discoveredByReconcile: true,
          };
        }
      }
    }

    // Mark entries whose directories no longer exist
    for (const [name, instance] of Object.entries(manifest.instances)) {
      const dir = instance.directory || path.join(this.instancesDir, name);
      if (!fs.existsSync(dir)) {
        result.stale.push(name);
        instance.stale = true;
        instance.updatedAt = new Date().toISOString();
      }
    }

    this.saveManifest(manifest);
    return result;
  }

  // ─── Instance Queries ──────────────────────────────────────────────────

  /**
   * List all instances from manifest.
   * @returns {object[]} Array of instance objects
   */
  listInstances() {
    const manifest = this.loadManifest();
    return Object.values(manifest.instances);
  }

  /**
   * Find instance by Firebase project ID.
   * @param {string} projectId
   * @returns {object|null}
   */
  findByFirebaseProject(projectId) {
    const instances = this.listInstances();
    return instances.find(i => i.firebaseProjectId === projectId) || null;
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
   * Check if instance with given name exists.
   * @param {string} name
   * @returns {boolean}
   */
  instanceExists(name) {
    return this.findByName(name) !== null;
  }

  // ─── Engine Management ─────────────────────────────────────────────────

  /**
   * Check if engine is installed (directory exists with package.json).
   * @returns {boolean}
   */
  isEngineInstalled() {
    return fs.existsSync(path.join(this.engineDir, 'package.json'));
  }

  /**
   * Get engine version from package.json.
   * @returns {string|null}
   */
  getEngineVersion() {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.engineDir, 'package.json'), 'utf8'));
      return pkg.version || null;
    } catch {
      return null;
    }
  }

  /**
   * Clone the MCP engine repository and install dependencies.
   */
  cloneEngine() {
    fs.mkdirSync(path.dirname(this.engineDir), { recursive: true });
    this._execSync(`git clone ${MCP_REPO_URL} "${this.engineDir}"`, { stdio: 'pipe' });
    this._execSync('npm install --production', { cwd: this.engineDir, stdio: 'pipe' });

    // Update manifest engine info
    const manifest = this.loadManifest();
    manifest.engine = {
      path: this.engineDir,
      repo: MCP_REPO_URL,
      lastUpdated: new Date().toISOString(),
    };
    this.saveManifest(manifest);
  }

  /**
   * Update the MCP engine (git pull + npm install).
   */
  updateEngine() {
    if (!this.isEngineInstalled()) {
      throw new Error('Engine is not installed. Use cloneEngine() first.');
    }
    this._execSync('git pull', { cwd: this.engineDir, stdio: 'pipe' });
    this._execSync('npm install --production', { cwd: this.engineDir, stdio: 'pipe' });

    const manifest = this.loadManifest();
    manifest.engine = manifest.engine || {};
    manifest.engine.path = this.engineDir;
    manifest.engine.repo = MCP_REPO_URL;
    manifest.engine.lastUpdated = new Date().toISOString();
    this.saveManifest(manifest);
  }

  // ─── Instance Lifecycle ────────────────────────────────────────────────

  /**
   * Create a new instance directory with scaffold.
   * @param {string} name - Instance name (validated)
   * @param {object} config - { firebaseProjectId, firebaseDatabaseUrl }
   * @returns {object} The created instance manifest entry
   */
  createInstance(name, config = {}) {
    const validated = this.validateInstanceName(name);
    if (this.instanceExists(validated)) {
      throw new Error(`Instance "${validated}" already exists.`);
    }

    const instanceDir = path.join(this.instancesDir, validated);
    fs.mkdirSync(instanceDir, { recursive: true });

    // Create .env file with database URL
    if (config.firebaseDatabaseUrl) {
      const envContent = `DATABASE_URL=${config.firebaseDatabaseUrl}\n`;
      fs.writeFileSync(path.join(instanceDir, '.env'), envContent, 'utf8');
    }

    const instance = {
      name: validated,
      directory: instanceDir,
      firebaseProjectId: config.firebaseProjectId || null,
      firebaseDatabaseUrl: config.firebaseDatabaseUrl || null,
      hasServiceAccountKey: false,
      hasMcpUser: false,
      registeredClients: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const manifest = this.loadManifest();
    manifest.instances[validated] = instance;
    this.saveManifest(manifest);

    return instance;
  }

  /**
   * Delete an instance: remove directory, unregister from Claude, remove from manifest.
   * @param {string} name
   */
  deleteInstance(name) {
    const instance = this.findByName(name);
    if (!instance) {
      throw new Error(`Instance "${name}" not found.`);
    }

    // Try to unregister from Claude
    try {
      this.unregisterFromClaude(name);
    } catch {
      // Ignore unregister errors (Claude CLI might not be available)
    }

    // Remove directory
    const instanceDir = instance.directory || path.join(this.instancesDir, name);
    if (fs.existsSync(instanceDir)) {
      fs.rmSync(instanceDir, { recursive: true, force: true });
    }

    // Remove from manifest
    const manifest = this.loadManifest();
    delete manifest.instances[name];
    this.saveManifest(manifest);
  }

  /**
   * Validate and sanitize instance name.
   * Rules: lowercase, alphanumeric + hyphens only, max 30 chars, no leading/trailing hyphens.
   * @param {string} name
   * @returns {string} Sanitized name
   * @throws {Error} If name is empty after sanitization
   */
  validateInstanceName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Instance name is required.');
    }

    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')  // Replace invalid chars with hyphens
      .replace(/-+/g, '-')          // Collapse multiple hyphens
      .replace(/^-|-$/g, '')        // Remove leading/trailing hyphens
      .slice(0, 30);                // Max 30 chars

    if (!sanitized) {
      throw new Error(`Invalid instance name: "${name}". Must contain at least one alphanumeric character.`);
    }

    return sanitized;
  }

  // ─── File Management ───────────────────────────────────────────────────

  /**
   * Copy serviceAccountKey.json into instance directory.
   * @param {string} name - Instance name
   * @param {string} sourcePath - Path to source serviceAccountKey.json
   */
  copyServiceAccountKey(name, sourcePath) {
    const instance = this.findByName(name);
    if (!instance) {
      throw new Error(`Instance "${name}" not found.`);
    }

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    // Validate it's valid JSON
    const content = fs.readFileSync(sourcePath, 'utf8');
    try {
      JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in serviceAccountKey: ${sourcePath}`);
    }

    const destDir = instance.directory || path.join(this.instancesDir, name);
    fs.copyFileSync(sourcePath, path.join(destDir, 'serviceAccountKey.json'));

    // Update manifest
    const manifest = this.loadManifest();
    manifest.instances[name].hasServiceAccountKey = true;
    manifest.instances[name].updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
  }

  /**
   * Write mcp.user.json into instance directory.
   * @param {string} name - Instance name
   * @param {object} userData - { developerId, developerName, developerEmail }
   */
  writeMcpUserConfig(name, userData) {
    const instance = this.findByName(name);
    if (!instance) {
      throw new Error(`Instance "${name}" not found.`);
    }

    const destDir = instance.directory || path.join(this.instancesDir, name);
    fs.writeFileSync(path.join(destDir, 'mcp.user.json'), JSON.stringify(userData, null, 2), 'utf8');

    // Update manifest
    const manifest = this.loadManifest();
    manifest.instances[name].hasMcpUser = true;
    manifest.instances[name].updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
  }

  /**
   * Check if instance has serviceAccountKey.json.
   * @param {string} name
   * @returns {boolean}
   */
  hasServiceAccountKey(name) {
    const instance = this.findByName(name);
    if (!instance) return false;
    const dir = instance.directory || path.join(this.instancesDir, name);
    return fs.existsSync(path.join(dir, 'serviceAccountKey.json'));
  }

  /**
   * Check if instance has mcp.user.json.
   * @param {string} name
   * @returns {boolean}
   */
  hasMcpUser(name) {
    const instance = this.findByName(name);
    if (!instance) return false;
    const dir = instance.directory || path.join(this.instancesDir, name);
    return fs.existsSync(path.join(dir, 'mcp.user.json'));
  }

  // ─── Client Registration ───────────────────────────────────────────────

  /**
   * Register instance with Claude CLI.
   * @param {string} name - Instance name
   * @param {string} dbUrl - Firebase Database URL
   */
  registerWithClaude(name, dbUrl) {
    const instance = this.findByName(name);
    if (!instance) {
      throw new Error(`Instance "${name}" not found.`);
    }

    const instanceDir = instance.directory || path.join(this.instancesDir, name);
    const mcpName = `planning-game-${name}`;

    const args = [
      'mcp', 'add', mcpName,
      '-s', 'user',
      '-e', `DATABASE_URL=${dbUrl}`,
      '-e', `GOOGLE_APPLICATION_CREDENTIALS=${path.join(instanceDir, 'serviceAccountKey.json')}`,
      '-e', `MCP_USER_CONFIG=${path.join(instanceDir, 'mcp.user.json')}`,
      '--', 'node', path.join(this.engineDir, 'index.js'),
    ];

    this._execSync(`claude ${args.join(' ')}`, { stdio: 'pipe' });

    // Update manifest
    const manifest = this.loadManifest();
    if (!manifest.instances[name].registeredClients) {
      manifest.instances[name].registeredClients = [];
    }
    if (!manifest.instances[name].registeredClients.includes('claude')) {
      manifest.instances[name].registeredClients.push('claude');
    }
    manifest.instances[name].updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
  }

  /**
   * Unregister instance from Claude CLI.
   * @param {string} name - Instance name
   */
  unregisterFromClaude(name) {
    const mcpName = `planning-game-${name}`;
    this._execSync(`claude mcp remove ${mcpName}`, { stdio: 'pipe' });

    // Update manifest if instance still exists
    const manifest = this.loadManifest();
    if (manifest.instances[name]) {
      manifest.instances[name].registeredClients =
        (manifest.instances[name].registeredClients || []).filter(c => c !== 'claude');
      manifest.instances[name].updatedAt = new Date().toISOString();
      this.saveManifest(manifest);
    }
  }

  /**
   * Check if Claude CLI is available.
   * @returns {boolean}
   */
  isClaudeAvailable() {
    try {
      this._execSync('which claude', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Detection ─────────────────────────────────────────────────────────

  /**
   * Detect legacy MCP installation (registered as 'planning-game' without instance suffix).
   * @returns {{ found: boolean, dbUrl: string|null, credentialsPath: string|null }}
   */
  detectLegacyInstallation() {
    try {
      const output = this._execSync('claude mcp list', { encoding: 'utf8', stdio: 'pipe' });
      const lines = output.split('\n');

      // Look for 'planning-game' entry that is NOT 'planning-game-{something}'
      for (const line of lines) {
        const trimmed = line.trim();
        // Match 'planning-game' but not 'planning-game-something'
        if (/\bplanning-game\b/.test(trimmed) && !/\bplanning-game-\w/.test(trimmed)) {
          // Try to get details
          let dbUrl = null;
          let credentialsPath = null;

          try {
            const details = this._execSync('claude mcp get planning-game', { encoding: 'utf8', stdio: 'pipe' });
            const dbMatch = details.match(/DATABASE_URL[=:]\s*(.+)/);
            const credMatch = details.match(/GOOGLE_APPLICATION_CREDENTIALS[=:]\s*(.+)/);
            if (dbMatch) dbUrl = dbMatch[1].trim();
            if (credMatch) credentialsPath = credMatch[1].trim();
          } catch {
            // Details not available, that's ok
          }

          return { found: true, dbUrl, credentialsPath };
        }
      }

      return { found: false, dbUrl: null, credentialsPath: null };
    } catch {
      return { found: false, dbUrl: null, credentialsPath: null };
    }
  }

  /**
   * Migrate legacy installation to multi-instance format.
   * Creates a 'pro' instance and re-registers with Claude.
   * @returns {object|null} The migrated instance, or null if no legacy found
   */
  migrateLegacy() {
    const legacy = this.detectLegacyInstallation();
    if (!legacy.found) return null;

    // Create 'pro' instance
    const instance = this.createInstance('pro', {
      firebaseDatabaseUrl: legacy.dbUrl,
    });

    // Copy credentials if found
    if (legacy.credentialsPath && fs.existsSync(legacy.credentialsPath)) {
      this.copyServiceAccountKey('pro', legacy.credentialsPath);
    }

    // Copy mcp.user.json from old location if it exists
    const oldMcpUser = path.join(this.engineDir, 'mcp.user.json');
    if (fs.existsSync(oldMcpUser)) {
      const userData = JSON.parse(fs.readFileSync(oldMcpUser, 'utf8'));
      this.writeMcpUserConfig('pro', userData);
    }

    // Unregister old 'planning-game' entry
    try {
      this._execSync('claude mcp remove planning-game', { stdio: 'pipe' });
    } catch {
      // Ignore if can't unregister
    }

    // Register as 'planning-game-pro'
    if (legacy.dbUrl) {
      try {
        this.registerWithClaude('pro', legacy.dbUrl);
      } catch {
        // Registration might fail if Claude is not available
      }
    }

    return instance;
  }

  /**
   * Scan filesystem for instance directories not tracked in manifest.
   * @returns {string[]} Array of discovered directory names
   */
  scanFilesystem() {
    if (!fs.existsSync(this.instancesDir)) return [];

    const manifest = this.loadManifest();
    const entries = fs.readdirSync(this.instancesDir, { withFileTypes: true });
    const discovered = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !manifest.instances[entry.name]) {
        discovered.push(entry.name);
      }
    }

    return discovered;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  _defaultManifest() {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      engine: {
        path: this.engineDir,
        repo: MCP_REPO_URL,
        lastUpdated: null,
      },
      instances: {},
    };
  }
}

module.exports = { McpInstanceManager, DEFAULT_INSTANCES_DIR, DEFAULT_ENGINE_DIR, MCP_REPO_URL };

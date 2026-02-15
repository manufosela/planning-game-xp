const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.planning-game');
const DEFAULT_INSTANCES_DIR = path.join(os.homedir(), 'planning-game-instances');
const MANIFEST_FILE_NAME = 'app-instances.json';
const INSTANCE_MARKER_FILE = '.planning-game-instance.json';
const MANIFEST_SCHEMA_VERSION = 1;

class AppInstanceManager {
  constructor(baseStateDir, instancesDir, deps = {}) {
    this.baseStateDir = baseStateDir || DEFAULT_STATE_DIR;
    this.instancesDir = instancesDir || DEFAULT_INSTANCES_DIR;
    this.manifestPath = path.join(this.baseStateDir, MANIFEST_FILE_NAME);
    this._execSync = deps.execSync || execSync;
  }

  loadManifest() {
    try {
      return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
    } catch {
      return this._defaultManifest();
    }
  }

  saveManifest(manifest) {
    fs.mkdirSync(this.baseStateDir, { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  listInstances() {
    return Object.values(this.loadManifest().instances || {});
  }

  findByName(name) {
    const key = String(name || '').trim();
    if (!key) return null;
    return this.loadManifest().instances[key] || null;
  }

  instanceExists(name) {
    return this.findByName(name) !== null;
  }

  validateInstanceName(name) {
    const value = String(name || '').trim();
    if (!value) throw new Error('El nombre de instancia no puede estar vacío.');
    if (!/^[a-z0-9-]+$/.test(value)) {
      throw new Error('Nombre inválido. Usa minúsculas, números y guiones.');
    }
    return value;
  }

  resolveSourceRepo(baseRepoDir) {
    const cwd = String(baseRepoDir || '').trim();
    if (!cwd) throw new Error('baseRepoDir is required');
    try {
      const remote = String(this._execSync('git config --get remote.origin.url', { cwd, encoding: 'utf8', stdio: 'pipe' }) || '').trim();
      if (remote) return remote;
    } catch {
      // fallback below
    }
    return cwd;
  }

  createInstance(name, { baseRepoDir, sourceRepoUrl } = {}) {
    const validated = this.validateInstanceName(name);
    if (this.instanceExists(validated)) {
      throw new Error(`La instancia "${validated}" ya existe.`);
    }
    const source = String(sourceRepoUrl || '').trim() || this.resolveSourceRepo(baseRepoDir);
    const targetDir = path.join(this.instancesDir, validated);
    if (fs.existsSync(targetDir)) {
      throw new Error(`El directorio ya existe: ${targetDir}`);
    }

    fs.mkdirSync(this.instancesDir, { recursive: true });
    this._execSync(`git clone "${source}" "${targetDir}"`, { stdio: 'pipe' });
    this.writeInstanceMarker(targetDir, { name: validated, sourceRepo: source });

    const manifest = this.loadManifest();
    const instance = {
      name: validated,
      directory: targetDir,
      sourceRepo: source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    manifest.instances[validated] = instance;
    this.saveManifest(manifest);
    return instance;
  }

  updateInstance(name) {
    const instance = this.findByName(name);
    if (!instance) throw new Error(`Instancia no encontrada: ${name}`);
    this._execSync('git pull --ff-only', { cwd: instance.directory, stdio: 'pipe' });

    const manifest = this.loadManifest();
    manifest.instances[name].updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
    return manifest.instances[name];
  }

  writeInstanceMarker(instanceDir, data = {}) {
    const markerPath = path.join(instanceDir, INSTANCE_MARKER_FILE);
    const payload = {
      app: 'planning-game',
      ...data,
      markerVersion: 1,
    };
    fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  isInstanceDirectory(dirPath) {
    return fs.existsSync(path.join(dirPath, INSTANCE_MARKER_FILE));
  }

  _defaultManifest() {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      instances: {},
    };
  }
}

module.exports = {
  AppInstanceManager,
  DEFAULT_STATE_DIR,
  DEFAULT_INSTANCES_DIR,
  INSTANCE_MARKER_FILE,
};

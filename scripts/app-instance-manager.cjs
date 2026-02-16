const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.planning-game');
const DEFAULT_INSTANCES_DIR = path.join(os.homedir(), 'planning-game-instances');
const MANIFEST_FILE_NAME = 'app-instances.json';
const INSTANCE_MARKER_FILE = '.planning-game-instance.json';
const MANIFEST_SCHEMA_VERSION = 1;
const INSTANCE_COPY_EXCLUDES = new Set([
  '.git',
  'node_modules',
  '.astro',
  'dist',
  'coverage',
  'test-results',
  '.env',
  '.env.dev',
  '.env.pre',
  '.env.prod',
  '.env.test',
  '.env.e2e',
  'functions/.env',
]);

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
    const raw = String(baseRepoDir || '').trim();
    if (!raw) {
      throw new Error('baseRepoDir is required');
    }
    const sourcePath = path.resolve(raw);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
      throw new Error(`Directorio base no válido: ${sourcePath}`);
    }
    return sourcePath;
  }

  shouldExcludeFromCopy(relativePath) {
    const rel = String(relativePath || '').replace(/\\/g, '/');
    if (!rel) return false;
    if (INSTANCE_COPY_EXCLUDES.has(rel)) return true;
    for (const excluded of INSTANCE_COPY_EXCLUDES) {
      if (rel.startsWith(`${excluded}/`)) return true;
    }
    return false;
  }

  copyRepoToInstance(sourceDir, targetDir) {
    fs.cpSync(sourceDir, targetDir, {
      recursive: true,
      filter: (sourcePath) => {
        const rel = path.relative(sourceDir, sourcePath);
        return !this.shouldExcludeFromCopy(rel);
      },
    });
  }

  createInstance(name, { baseRepoDir, sourceRepoUrl } = {}) {
    const validated = this.validateInstanceName(name);
    if (this.instanceExists(validated)) {
      throw new Error(`La instancia "${validated}" ya existe.`);
    }
    const source = this.resolveSourceRepo(baseRepoDir || sourceRepoUrl);
    const targetDir = path.join(this.instancesDir, validated);
    if (fs.existsSync(targetDir)) {
      throw new Error(`El directorio ya existe: ${targetDir}`);
    }

    fs.mkdirSync(this.instancesDir, { recursive: true });
    this.copyRepoToInstance(source, targetDir);
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
    const source = String(instance.sourceRepo || '').trim();
    if (source && fs.existsSync(source) && fs.statSync(source).isDirectory()) {
      this.copyRepoToInstance(source, instance.directory);
    } else {
      this._execSync('git pull --ff-only', { cwd: instance.directory, stdio: 'pipe' });
    }

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

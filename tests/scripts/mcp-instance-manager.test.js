import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { McpInstanceManager } = await import('../../scripts/mcp-instance-manager.cjs');

describe('McpInstanceManager', () => {
  let tmpDir;
  let instancesDir;
  let engineDir;
  let mockExecSync;
  let manager;

  function createManager(execSyncFn) {
    return new McpInstanceManager(instancesDir, engineDir, { execSync: execSyncFn || mockExecSync });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    instancesDir = path.join(tmpDir, 'instances');
    engineDir = path.join(tmpDir, 'engine');
    mockExecSync = vi.fn().mockReturnValue('');
    manager = createManager();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Manifest I/O ───────────────────────────────────────────────────

  describe('loadManifest()', () => {
    it('should return default manifest when file does not exist', () => {
      const manifest = manager.loadManifest();

      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.engine.path).toBe(engineDir);
      expect(manifest.instances).toEqual({});
    });

    it('should read existing manifest from disk', () => {
      fs.mkdirSync(instancesDir, { recursive: true });
      const data = {
        schemaVersion: 1,
        engine: { path: engineDir, repo: 'test', lastUpdated: null },
        instances: {
          pro: { name: 'pro', firebaseProjectId: 'my-project' },
        },
      };
      fs.writeFileSync(path.join(instancesDir, 'instances.json'), JSON.stringify(data));

      const manifest = manager.loadManifest();

      expect(manifest.instances.pro.name).toBe('pro');
      expect(manifest.instances.pro.firebaseProjectId).toBe('my-project');
    });

    it('should return default manifest on invalid JSON', () => {
      fs.mkdirSync(instancesDir, { recursive: true });
      fs.writeFileSync(path.join(instancesDir, 'instances.json'), 'not valid json{{{');

      const manifest = manager.loadManifest();

      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.instances).toEqual({});
    });
  });

  describe('saveManifest()', () => {
    it('should create directories and write manifest', () => {
      const manifest = {
        schemaVersion: 1,
        engine: { path: engineDir },
        instances: { test: { name: 'test' } },
      };

      manager.saveManifest(manifest);

      expect(fs.existsSync(path.join(instancesDir, 'instances.json'))).toBe(true);
      const saved = JSON.parse(fs.readFileSync(path.join(instancesDir, 'instances.json'), 'utf8'));
      expect(saved.instances.test.name).toBe('test');
    });

    it('should overwrite existing manifest', () => {
      const first = { schemaVersion: 1, engine: {}, instances: { a: { name: 'a' } } };
      const second = { schemaVersion: 1, engine: {}, instances: { b: { name: 'b' } } };

      manager.saveManifest(first);
      manager.saveManifest(second);

      const saved = JSON.parse(fs.readFileSync(path.join(instancesDir, 'instances.json'), 'utf8'));
      expect(saved.instances.b).toBeDefined();
      expect(saved.instances.a).toBeUndefined();
    });
  });

  describe('reconcileManifest()', () => {
    it('should discover orphan directories', () => {
      const orphanDir = path.join(instancesDir, 'orphan');
      fs.mkdirSync(orphanDir, { recursive: true });

      const result = manager.reconcileManifest();

      expect(result.discovered).toContain('orphan');
      const manifest = manager.loadManifest();
      expect(manifest.instances.orphan).toBeDefined();
      expect(manifest.instances.orphan.discoveredByReconcile).toBe(true);
    });

    it('should mark stale entries whose directories are missing', () => {
      const manifest = manager.loadManifest();
      manifest.instances.ghost = {
        name: 'ghost',
        directory: path.join(instancesDir, 'ghost'),
      };
      manager.saveManifest(manifest);

      const result = manager.reconcileManifest();

      expect(result.stale).toContain('ghost');
      const updated = manager.loadManifest();
      expect(updated.instances.ghost.stale).toBe(true);
    });

    it('should handle empty instances dir', () => {
      const result = manager.reconcileManifest();

      expect(result.discovered).toEqual([]);
      expect(result.stale).toEqual([]);
    });

    it('should detect serviceAccountKey.json in orphan dirs', () => {
      const orphanDir = path.join(instancesDir, 'with-key');
      fs.mkdirSync(orphanDir, { recursive: true });
      fs.writeFileSync(path.join(orphanDir, 'serviceAccountKey.json'), '{}');

      manager.reconcileManifest();

      const manifest = manager.loadManifest();
      expect(manifest.instances['with-key'].hasServiceAccountKey).toBe(true);
    });
  });

  // ─── Instance Queries ──────────────────────────────────────────────

  describe('listInstances()', () => {
    it('should return empty array when no instances', () => {
      expect(manager.listInstances()).toEqual([]);
    });

    it('should return all instances', () => {
      manager.createInstance('alpha', { firebaseProjectId: 'proj-a' });
      manager.createInstance('beta', { firebaseProjectId: 'proj-b' });

      const instances = manager.listInstances();

      expect(instances).toHaveLength(2);
      expect(instances.map(i => i.name)).toContain('alpha');
      expect(instances.map(i => i.name)).toContain('beta');
    });
  });

  describe('findByFirebaseProject()', () => {
    it('should find instance by project ID', () => {
      manager.createInstance('pro', { firebaseProjectId: 'planning-gamexp' });
      manager.createInstance('dev', { firebaseProjectId: 'planning-gamexp-dev' });

      const found = manager.findByFirebaseProject('planning-gamexp');

      expect(found).not.toBeNull();
      expect(found.name).toBe('pro');
    });

    it('should return null when not found', () => {
      manager.createInstance('pro', { firebaseProjectId: 'planning-gamexp' });

      expect(manager.findByFirebaseProject('nonexistent')).toBeNull();
    });
  });

  describe('findByName()', () => {
    it('should find instance by name', () => {
      manager.createInstance('staging', { firebaseProjectId: 'test' });

      const found = manager.findByName('staging');

      expect(found).not.toBeNull();
      expect(found.name).toBe('staging');
    });

    it('should return null when not found', () => {
      expect(manager.findByName('nonexistent')).toBeNull();
    });
  });

  describe('instanceExists()', () => {
    it('should return true for existing instance', () => {
      manager.createInstance('pro');
      expect(manager.instanceExists('pro')).toBe(true);
    });

    it('should return false for non-existing instance', () => {
      expect(manager.instanceExists('nonexistent')).toBe(false);
    });
  });

  // ─── Engine Management ─────────────────────────────────────────────

  describe('isEngineInstalled()', () => {
    it('should return false when engine dir does not exist', () => {
      expect(manager.isEngineInstalled()).toBe(false);
    });

    it('should return false when dir exists but no package.json', () => {
      fs.mkdirSync(engineDir, { recursive: true });
      expect(manager.isEngineInstalled()).toBe(false);
    });

    it('should return true when package.json exists', () => {
      fs.mkdirSync(engineDir, { recursive: true });
      fs.writeFileSync(path.join(engineDir, 'package.json'), '{"version": "1.0.0"}');
      expect(manager.isEngineInstalled()).toBe(true);
    });
  });

  describe('getEngineVersion()', () => {
    it('should return null when engine not installed', () => {
      expect(manager.getEngineVersion()).toBeNull();
    });

    it('should return version from package.json', () => {
      fs.mkdirSync(engineDir, { recursive: true });
      fs.writeFileSync(path.join(engineDir, 'package.json'), '{"version": "2.5.1"}');

      expect(manager.getEngineVersion()).toBe('2.5.1');
    });
  });

  describe('cloneEngine()', () => {
    it('should execute git clone and npm install', () => {
      manager.cloneEngine();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.objectContaining({ stdio: 'pipe' })
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install --production',
        expect.objectContaining({ cwd: engineDir })
      );
    });

    it('should update manifest engine info', () => {
      manager.cloneEngine();

      const manifest = manager.loadManifest();
      expect(manifest.engine.path).toBe(engineDir);
      expect(manifest.engine.lastUpdated).not.toBeNull();
    });
  });

  describe('updateEngine()', () => {
    it('should throw if engine not installed', () => {
      expect(() => manager.updateEngine()).toThrow('Engine is not installed');
    });

    it('should execute git pull and npm install', () => {
      fs.mkdirSync(engineDir, { recursive: true });
      fs.writeFileSync(path.join(engineDir, 'package.json'), '{"version": "1.0.0"}');

      manager.updateEngine();

      expect(mockExecSync).toHaveBeenCalledWith('git pull', expect.objectContaining({ cwd: engineDir }));
      expect(mockExecSync).toHaveBeenCalledWith('npm install --production', expect.objectContaining({ cwd: engineDir }));
    });
  });

  // ─── Instance Lifecycle ────────────────────────────────────────────

  describe('validateInstanceName()', () => {
    it('should accept valid names', () => {
      expect(manager.validateInstanceName('pro')).toBe('pro');
      expect(manager.validateInstanceName('my-staging')).toBe('my-staging');
      expect(manager.validateInstanceName('dev01')).toBe('dev01');
    });

    it('should convert to lowercase', () => {
      expect(manager.validateInstanceName('PRO')).toBe('pro');
      expect(manager.validateInstanceName('My-Instance')).toBe('my-instance');
    });

    it('should replace invalid characters with hyphens', () => {
      expect(manager.validateInstanceName('my instance')).toBe('my-instance');
      expect(manager.validateInstanceName('my_instance')).toBe('my-instance');
      expect(manager.validateInstanceName('my.instance')).toBe('my-instance');
    });

    it('should collapse multiple hyphens', () => {
      expect(manager.validateInstanceName('my---instance')).toBe('my-instance');
      expect(manager.validateInstanceName('a  b  c')).toBe('a-b-c');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(manager.validateInstanceName('-pro-')).toBe('pro');
      expect(manager.validateInstanceName('--test--')).toBe('test');
    });

    it('should truncate to 30 chars', () => {
      const long = 'a'.repeat(50);
      expect(manager.validateInstanceName(long)).toHaveLength(30);
    });

    it('should throw on empty name', () => {
      expect(() => manager.validateInstanceName('')).toThrow('Instance name is required');
      expect(() => manager.validateInstanceName(null)).toThrow('Instance name is required');
    });

    it('should throw when name becomes empty after sanitization', () => {
      expect(() => manager.validateInstanceName('---')).toThrow('Invalid instance name');
      expect(() => manager.validateInstanceName('!!!')).toThrow('Invalid instance name');
    });
  });

  describe('createInstance()', () => {
    it('should create directory and add to manifest', () => {
      const instance = manager.createInstance('pro', {
        firebaseProjectId: 'planning-gamexp',
        firebaseDatabaseUrl: 'https://planning-gamexp.firebaseio.com',
      });

      expect(instance.name).toBe('pro');
      expect(instance.firebaseProjectId).toBe('planning-gamexp');
      expect(fs.existsSync(path.join(instancesDir, 'pro'))).toBe(true);

      const manifest = manager.loadManifest();
      expect(manifest.instances.pro).toBeDefined();
    });

    it('should create .env file with DATABASE_URL', () => {
      manager.createInstance('dev', {
        firebaseDatabaseUrl: 'https://my-db.firebaseio.com',
      });

      const envContent = fs.readFileSync(path.join(instancesDir, 'dev', '.env'), 'utf8');
      expect(envContent).toContain('DATABASE_URL=https://my-db.firebaseio.com');
    });

    it('should throw if instance already exists', () => {
      manager.createInstance('pro');
      expect(() => manager.createInstance('pro')).toThrow('already exists');
    });

    it('should sanitize the name', () => {
      const instance = manager.createInstance('My Instance');
      expect(instance.name).toBe('my-instance');
    });
  });

  describe('deleteInstance()', () => {
    it('should remove directory and manifest entry', () => {
      manager.createInstance('temp');

      manager.deleteInstance('temp');

      expect(fs.existsSync(path.join(instancesDir, 'temp'))).toBe(false);
      expect(manager.findByName('temp')).toBeNull();
    });

    it('should throw if instance not found', () => {
      expect(() => manager.deleteInstance('nonexistent')).toThrow('not found');
    });

    it('should handle Claude unregister failure gracefully', () => {
      mockExecSync.mockImplementation(() => { throw new Error('claude not found'); });
      // Need to create instance with a fresh manager that doesn't use the throwing mock for everything
      const freshManager = createManager(vi.fn().mockReturnValue(''));
      freshManager.createInstance('temp');

      // Now create a manager that fails on execSync (simulating Claude not available)
      const failingManager = createManager(vi.fn().mockImplementation(() => { throw new Error('not found'); }));
      // Reload manifest from disk for failing manager
      expect(() => failingManager.deleteInstance('temp')).not.toThrow();
    });
  });

  // ─── File Management ───────────────────────────────────────────────

  describe('copyServiceAccountKey()', () => {
    it('should copy file and update manifest', () => {
      manager.createInstance('pro');

      const sourceKey = path.join(tmpDir, 'serviceAccountKey.json');
      fs.writeFileSync(sourceKey, JSON.stringify({ project_id: 'test' }));

      manager.copyServiceAccountKey('pro', sourceKey);

      expect(fs.existsSync(path.join(instancesDir, 'pro', 'serviceAccountKey.json'))).toBe(true);
      const manifest = manager.loadManifest();
      expect(manifest.instances.pro.hasServiceAccountKey).toBe(true);
    });

    it('should throw if source file not found', () => {
      manager.createInstance('pro');
      expect(() => manager.copyServiceAccountKey('pro', '/nonexistent/key.json')).toThrow('Source file not found');
    });

    it('should throw if source is not valid JSON', () => {
      manager.createInstance('pro');
      const badFile = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(badFile, 'not json');

      expect(() => manager.copyServiceAccountKey('pro', badFile)).toThrow('Invalid JSON');
    });

    it('should throw if instance not found', () => {
      expect(() => manager.copyServiceAccountKey('nonexistent', '/some/path')).toThrow('not found');
    });
  });

  describe('writeMcpUserConfig()', () => {
    it('should write mcp.user.json and update manifest', () => {
      manager.createInstance('pro');

      manager.writeMcpUserConfig('pro', {
        developerId: 'dev_001',
        developerName: 'Test User',
        developerEmail: 'test@example.com',
      });

      const userFile = path.join(instancesDir, 'pro', 'mcp.user.json');
      expect(fs.existsSync(userFile)).toBe(true);

      const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
      expect(userData.developerId).toBe('dev_001');

      const manifest = manager.loadManifest();
      expect(manifest.instances.pro.hasMcpUser).toBe(true);
    });

    it('should throw if instance not found', () => {
      expect(() => manager.writeMcpUserConfig('nonexistent', {})).toThrow('not found');
    });
  });

  describe('hasServiceAccountKey()', () => {
    it('should return true when file exists', () => {
      manager.createInstance('pro');
      fs.writeFileSync(path.join(instancesDir, 'pro', 'serviceAccountKey.json'), '{}');

      expect(manager.hasServiceAccountKey('pro')).toBe(true);
    });

    it('should return false when file does not exist', () => {
      manager.createInstance('pro');
      expect(manager.hasServiceAccountKey('pro')).toBe(false);
    });

    it('should return false for non-existing instance', () => {
      expect(manager.hasServiceAccountKey('nonexistent')).toBe(false);
    });
  });

  describe('hasMcpUser()', () => {
    it('should return true when file exists', () => {
      manager.createInstance('pro');
      fs.writeFileSync(path.join(instancesDir, 'pro', 'mcp.user.json'), '{}');

      expect(manager.hasMcpUser('pro')).toBe(true);
    });

    it('should return false when file does not exist', () => {
      manager.createInstance('pro');
      expect(manager.hasMcpUser('pro')).toBe(false);
    });
  });

  // ─── Client Registration ──────────────────────────────────────────

  describe('registerWithClaude()', () => {
    it('should call claude mcp add with correct arguments', () => {
      manager.createInstance('pro');

      manager.registerWithClaude('pro', 'https://my-db.firebaseio.com');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('claude mcp add planning-game-pro'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL=https://my-db.firebaseio.com'),
        expect.any(Object)
      );
    });

    it('should update manifest with registered client', () => {
      manager.createInstance('pro');

      manager.registerWithClaude('pro', 'https://my-db.firebaseio.com');

      const manifest = manager.loadManifest();
      expect(manifest.instances.pro.registeredClients).toContain('claude');
    });

    it('should throw if instance not found', () => {
      expect(() => manager.registerWithClaude('nonexistent', 'url')).toThrow('not found');
    });
  });

  describe('unregisterFromClaude()', () => {
    it('should call claude mcp remove', () => {
      manager.createInstance('pro');

      manager.unregisterFromClaude('pro');

      expect(mockExecSync).toHaveBeenCalledWith(
        'claude mcp remove planning-game-pro',
        expect.any(Object)
      );
    });

    it('should update manifest to remove client', () => {
      manager.createInstance('pro');
      // Add claude to registered clients manually
      const manifest = manager.loadManifest();
      manifest.instances.pro.registeredClients = ['claude'];
      manager.saveManifest(manifest);

      manager.unregisterFromClaude('pro');

      const updated = manager.loadManifest();
      expect(updated.instances.pro.registeredClients).not.toContain('claude');
    });
  });

  describe('isClaudeAvailable()', () => {
    it('should return true when claude CLI is found', () => {
      expect(manager.isClaudeAvailable()).toBe(true);
    });

    it('should return false when claude CLI is not found', () => {
      const failingManager = createManager(vi.fn().mockImplementation(() => {
        throw new Error('not found');
      }));
      expect(failingManager.isClaudeAvailable()).toBe(false);
    });
  });

  // ─── Detection ─────────────────────────────────────────────────────

  describe('detectLegacyInstallation()', () => {
    it('should detect legacy planning-game entry', () => {
      const mockExec = vi.fn().mockImplementation((cmd) => {
        if (cmd === 'claude mcp list') {
          return '  planning-game: node /home/user/mcp-servers/planning-game/index.js\n';
        }
        if (cmd === 'claude mcp get planning-game') {
          return 'DATABASE_URL=https://legacy-db.firebaseio.com\nGOOGLE_APPLICATION_CREDENTIALS=/home/user/key.json\n';
        }
        return '';
      });
      const m = createManager(mockExec);

      const result = m.detectLegacyInstallation();

      expect(result.found).toBe(true);
      expect(result.dbUrl).toBe('https://legacy-db.firebaseio.com');
      expect(result.credentialsPath).toBe('/home/user/key.json');
    });

    it('should not detect planning-game-pro as legacy', () => {
      const mockExec = vi.fn().mockImplementation((cmd) => {
        if (cmd === 'claude mcp list') {
          return '  planning-game-pro: node /home/user/mcp-servers/planning-game/index.js\n';
        }
        return '';
      });
      const m = createManager(mockExec);

      const result = m.detectLegacyInstallation();

      expect(result.found).toBe(false);
    });

    it('should return found=false when claude is not available', () => {
      const m = createManager(vi.fn().mockImplementation(() => {
        throw new Error('not found');
      }));

      const result = m.detectLegacyInstallation();

      expect(result.found).toBe(false);
    });
  });

  describe('scanFilesystem()', () => {
    it('should find directories not in manifest', () => {
      manager.createInstance('tracked');
      fs.mkdirSync(path.join(instancesDir, 'untracked'), { recursive: true });

      const discovered = manager.scanFilesystem();

      expect(discovered).toContain('untracked');
      expect(discovered).not.toContain('tracked');
    });

    it('should return empty array when instances dir does not exist', () => {
      const otherManager = createManager();
      // Use a non-existent dir
      const m = new McpInstanceManager(path.join(tmpDir, 'nonexistent'), engineDir, { execSync: mockExecSync });
      expect(m.scanFilesystem()).toEqual([]);
    });
  });

  // ─── migrateLegacy() ──────────────────────────────────────────────

  describe('migrateLegacy()', () => {
    it('should return null when no legacy installation found', () => {
      const m = createManager(vi.fn().mockImplementation(() => {
        throw new Error('not found');
      }));

      const result = m.migrateLegacy();

      expect(result).toBeNull();
    });

    it('should create pro instance from legacy data', () => {
      const mockExec = vi.fn().mockImplementation((cmd) => {
        if (cmd === 'claude mcp list') {
          return '  planning-game: node index.js\n';
        }
        if (cmd === 'claude mcp get planning-game') {
          return 'DATABASE_URL=https://legacy.firebaseio.com\n';
        }
        return '';
      });
      const m = createManager(mockExec);

      const result = m.migrateLegacy();

      expect(result).not.toBeNull();
      expect(result.name).toBe('pro');
      expect(m.instanceExists('pro')).toBe(true);
    });
  });
});

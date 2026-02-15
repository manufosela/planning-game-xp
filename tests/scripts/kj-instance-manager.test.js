import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { KjInstanceManager, KJ_REPO_URL } = await import('../../scripts/kj-instance-manager.cjs');

describe('KjInstanceManager', () => {
  let tmpDir;
  let baseDir;
  let mockExecSync;
  let mockSpawn;
  let manager;

  function createManager(execSyncFn, spawnFn) {
    return new KjInstanceManager(baseDir, {
      execSync: execSyncFn || mockExecSync,
      spawn: spawnFn || mockSpawn,
    });
  }

  function createMockChild() {
    const child = {
      on: vi.fn((event, callback) => {
        child._callbacks[event] = callback;
        return child;
      }),
      _callbacks: {},
      _emit: (event, ...args) => {
        if (child._callbacks[event]) child._callbacks[event](...args);
      },
    };
    return child;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kj-test-'));
    baseDir = path.join(tmpDir, '.planning-game');
    mockExecSync = vi.fn().mockReturnValue('');
    mockSpawn = vi.fn();
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
      expect(manifest.instances).toEqual({});
    });

    it('should read existing manifest from disk', () => {
      fs.mkdirSync(baseDir, { recursive: true });
      const data = {
        schemaVersion: 1,
        instances: { pro: { name: 'pro', kjRepoPath: '/kj' } },
      };
      fs.writeFileSync(path.join(baseDir, 'kj-instances.json'), JSON.stringify(data));

      const manifest = manager.loadManifest();

      expect(manifest.instances.pro.name).toBe('pro');
    });

    it('should return default manifest on invalid JSON', () => {
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(path.join(baseDir, 'kj-instances.json'), 'not valid json');

      const manifest = manager.loadManifest();

      expect(manifest.instances).toEqual({});
    });
  });

  describe('saveManifest()', () => {
    it('should create directories and write manifest', () => {
      const manifest = { schemaVersion: 1, instances: { test: { name: 'test' } } };

      manager.saveManifest(manifest);

      expect(fs.existsSync(path.join(baseDir, 'kj-instances.json'))).toBe(true);
      const saved = JSON.parse(fs.readFileSync(path.join(baseDir, 'kj-instances.json'), 'utf8'));
      expect(saved.instances.test.name).toBe('test');
    });
  });

  // ─── Instance Queries ──────────────────────────────────────────────

  describe('listInstances()', () => {
    it('should return empty array when no instances', () => {
      expect(manager.listInstances()).toEqual([]);
    });

    it('should return all instances', () => {
      manager.createInstance('alpha', { kjRepoPath: '/alpha' });
      manager.createInstance('beta', { kjRepoPath: '/beta' });

      const instances = manager.listInstances();

      expect(instances).toHaveLength(2);
      expect(instances.map(i => i.name)).toContain('alpha');
      expect(instances.map(i => i.name)).toContain('beta');
    });
  });

  describe('findByName()', () => {
    it('should find instance by name', () => {
      manager.createInstance('pro', { kjRepoPath: '/kj' });

      const found = manager.findByName('pro');

      expect(found).not.toBeNull();
      expect(found.name).toBe('pro');
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

  // ─── Repo Management ─────────────────────────────────────────────

  describe('cloneKjRepo()', () => {
    it('should execute git clone', () => {
      const targetDir = path.join(tmpDir, 'karajan-code');

      manager.cloneKjRepo(targetDir);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.objectContaining({ stdio: 'pipe' })
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(targetDir),
        expect.any(Object)
      );
    });

    it('should throw if KJ already exists at target', () => {
      const targetDir = path.join(tmpDir, 'karajan-code');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'package.json'), '{}');

      expect(() => manager.cloneKjRepo(targetDir)).toThrow('already exists');
    });

    it('should create parent directories', () => {
      const targetDir = path.join(tmpDir, 'deep', 'nested', 'karajan-code');

      manager.cloneKjRepo(targetDir);

      expect(mockExecSync).toHaveBeenCalled();
    });
  });

  describe('updateKjRepo()', () => {
    it('should execute git pull', () => {
      const targetDir = path.join(tmpDir, 'kj');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'package.json'), '{}');

      manager.updateKjRepo(targetDir);

      expect(mockExecSync).toHaveBeenCalledWith('git pull', expect.objectContaining({ cwd: targetDir }));
    });

    it('should throw if KJ not found', () => {
      expect(() => manager.updateKjRepo('/nonexistent')).toThrow('not found');
    });
  });

  describe('isKjInstalled()', () => {
    it('should return true when package.json exists', () => {
      const dir = path.join(tmpDir, 'kj');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');

      expect(manager.isKjInstalled(dir)).toBe(true);
    });

    it('should return false when directory does not exist', () => {
      expect(manager.isKjInstalled('/nonexistent')).toBe(false);
    });

    it('should return false when directory exists but no package.json', () => {
      const dir = path.join(tmpDir, 'empty');
      fs.mkdirSync(dir, { recursive: true });

      expect(manager.isKjInstalled(dir)).toBe(false);
    });
  });

  // ─── Installer Delegation ────────────────────────────────────────

  describe('runKjInstallerInteractive()', () => {
    it('should spawn setup.js with stdio inherit', async () => {
      const targetDir = path.join(tmpDir, 'kj');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'package.json'), '{}');

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);

      const promise = manager.runKjInstallerInteractive(targetDir);

      // Simulate process exit
      mockChild._emit('close', 0);

      const code = await promise;

      expect(code).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith(
        'node',
        ['scripts/setup.js'],
        expect.objectContaining({ cwd: targetDir, stdio: 'inherit' })
      );
    });

    it('should throw if KJ not installed', () => {
      expect(() => manager.runKjInstallerInteractive('/nonexistent')).toThrow('not found');
    });

    it('should reject on spawn error', async () => {
      const targetDir = path.join(tmpDir, 'kj');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'package.json'), '{}');

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);

      const promise = manager.runKjInstallerInteractive(targetDir);
      mockChild._emit('error', new Error('spawn failed'));

      await expect(promise).rejects.toThrow('spawn failed');
    });
  });

  describe('runKjInstallerNonInteractive()', () => {
    it('should spawn with --non-interactive flag', async () => {
      const targetDir = path.join(tmpDir, 'kj');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'package.json'), '{}');

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);

      const promise = manager.runKjInstallerNonInteractive(targetDir, {
        kjHome: '/home/user/.karajan',
        sonarEnabled: true,
      });

      mockChild._emit('close', 0);
      const code = await promise;

      expect(code).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith(
        'node',
        expect.arrayContaining(['--non-interactive', '--kj-home', '/home/user/.karajan', '--sonar']),
        expect.objectContaining({ cwd: targetDir, stdio: 'pipe' })
      );
    });

    it('should throw if KJ not installed', () => {
      expect(() => manager.runKjInstallerNonInteractive('/nonexistent')).toThrow('not found');
    });
  });

  // ─── Bridge Management ────────────────────────────────────────────

  describe('buildBridge()', () => {
    it('should execute docker compose build', () => {
      const pgRoot = path.join(tmpDir, 'pg');
      fs.mkdirSync(path.join(pgRoot, 'bridge'), { recursive: true });
      fs.writeFileSync(path.join(pgRoot, 'docker-compose.yml'), '');

      manager.buildBridge(pgRoot);

      expect(mockExecSync).toHaveBeenCalledWith(
        'docker compose build bridge',
        expect.objectContaining({ cwd: pgRoot })
      );
    });

    it('should throw if docker-compose.yml not found', () => {
      const pgRoot = path.join(tmpDir, 'pg');
      fs.mkdirSync(path.join(pgRoot, 'bridge'), { recursive: true });

      expect(() => manager.buildBridge(pgRoot)).toThrow('docker-compose.yml not found');
    });

    it('should throw if bridge directory not found', () => {
      const pgRoot = path.join(tmpDir, 'pg');
      fs.mkdirSync(pgRoot, { recursive: true });
      fs.writeFileSync(path.join(pgRoot, 'docker-compose.yml'), '');

      expect(() => manager.buildBridge(pgRoot)).toThrow('Bridge directory not found');
    });
  });

  describe('startBridge()', () => {
    it('should execute docker compose up with env vars', () => {
      manager.startBridge('/pg', {
        bridgePort: 3200,
        databaseUrl: 'https://db.firebaseio.com',
        bridgeApiKey: 'test-key',
        kjHome: '/home/user/.karajan',
        serviceAccountKeyPath: '/path/to/key.json',
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        'docker compose up -d bridge',
        expect.objectContaining({
          cwd: '/pg',
          env: expect.objectContaining({
            BRIDGE_PORT: '3200',
            DATABASE_URL: 'https://db.firebaseio.com',
            BRIDGE_API_KEY: 'test-key',
            KJ_HOME: '/home/user/.karajan',
            SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          }),
        })
      );
    });
  });

  describe('stopBridge()', () => {
    it('should execute docker compose stop', () => {
      manager.stopBridge('/pg');

      expect(mockExecSync).toHaveBeenCalledWith(
        'docker compose stop bridge',
        expect.objectContaining({ cwd: '/pg' })
      );
    });
  });

  describe('isBridgeRunning()', () => {
    it('should return true when container is up', () => {
      const m = createManager(vi.fn().mockReturnValue('Up 2 minutes'));

      expect(m.isBridgeRunning()).toBe(true);
    });

    it('should return false when container is not running', () => {
      const m = createManager(vi.fn().mockReturnValue(''));

      expect(m.isBridgeRunning()).toBe(false);
    });

    it('should return false when docker command fails', () => {
      const m = createManager(vi.fn().mockImplementation(() => {
        throw new Error('docker not found');
      }));

      expect(m.isBridgeRunning()).toBe(false);
    });
  });

  // ─── Client Registration ─────────────────────────────────────────

  describe('registerMcpKj()', () => {
    it('should call claude mcp add with correct arguments', () => {
      manager.createInstance('pro', { kjRepoPath: '/kj' });

      manager.registerMcpKj('pro', '/kj', '/home/user/.karajan');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('claude mcp add karajan-pro'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('KJ_HOME=/home/user/.karajan'),
        expect.any(Object)
      );
    });

    it('should update manifest with registered client', () => {
      manager.createInstance('pro', { kjRepoPath: '/kj' });

      manager.registerMcpKj('pro', '/kj', '/home/user/.karajan');

      const manifest = manager.loadManifest();
      expect(manifest.instances.pro.registeredClients).toContain('claude');
    });
  });

  describe('unregisterMcpKj()', () => {
    it('should call claude mcp remove', () => {
      manager.createInstance('pro');

      manager.unregisterMcpKj('pro');

      expect(mockExecSync).toHaveBeenCalledWith(
        'claude mcp remove karajan-pro',
        expect.any(Object)
      );
    });

    it('should update manifest to remove client', () => {
      manager.createInstance('pro');
      const manifest = manager.loadManifest();
      manifest.instances.pro.registeredClients = ['claude'];
      manager.saveManifest(manifest);

      manager.unregisterMcpKj('pro');

      const updated = manager.loadManifest();
      expect(updated.instances.pro.registeredClients).not.toContain('claude');
    });
  });

  // ─── Instance Lifecycle ───────────────────────────────────────────

  describe('createInstance()', () => {
    it('should create instance and save to manifest', () => {
      const instance = manager.createInstance('pro', {
        kjRepoPath: '/home/user/kj',
        kjHome: '/home/user/.karajan',
        bridgePort: 3200,
        bridgeApiKey: 'test-key',
      });

      expect(instance.name).toBe('pro');
      expect(instance.kjRepoPath).toBe('/home/user/kj');
      expect(instance.kjHome).toBe('/home/user/.karajan');
      expect(instance.bridgePort).toBe(3200);
      expect(instance.bridgeApiKey).toBe('test-key');

      const manifest = manager.loadManifest();
      expect(manifest.instances.pro).toBeDefined();
    });

    it('should use default bridge port 3100', () => {
      const instance = manager.createInstance('pro');

      expect(instance.bridgePort).toBe(3100);
    });

    it('should throw if instance already exists', () => {
      manager.createInstance('pro');

      expect(() => manager.createInstance('pro')).toThrow('already exists');
    });
  });

  describe('deleteInstance()', () => {
    it('should remove from manifest', () => {
      manager.createInstance('temp');

      manager.deleteInstance('temp');

      expect(manager.findByName('temp')).toBeNull();
    });

    it('should throw if instance not found', () => {
      expect(() => manager.deleteInstance('nonexistent')).toThrow('not found');
    });

    it('should handle Claude unregister failure gracefully', () => {
      const failingManager = createManager(vi.fn().mockImplementation((cmd) => {
        if (cmd.includes('claude mcp remove')) throw new Error('not found');
        return '';
      }));
      // Create instance with a working manager first
      manager.createInstance('temp');

      expect(() => failingManager.deleteInstance('temp')).not.toThrow();
    });
  });

  // ─── Docker Detection ────────────────────────────────────────────

  describe('isDockerAvailable()', () => {
    it('should return true when docker is available', () => {
      expect(manager.isDockerAvailable()).toBe(true);
    });

    it('should return false when docker is not available', () => {
      const m = createManager(vi.fn().mockImplementation(() => {
        throw new Error('not found');
      }));

      expect(m.isDockerAvailable()).toBe(false);
    });
  });

  describe('isDockerComposeAvailable()', () => {
    it('should return true when docker compose is available', () => {
      expect(manager.isDockerComposeAvailable()).toBe(true);
    });

    it('should return false when docker compose is not available', () => {
      const m = createManager(vi.fn().mockImplementation(() => {
        throw new Error('not found');
      }));

      expect(m.isDockerComposeAvailable()).toBe(false);
    });
  });
});

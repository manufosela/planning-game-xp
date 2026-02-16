import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  AppInstanceManager,
  INSTANCE_MARKER_FILE,
} = await import('../../scripts/app-instance-manager.cjs');

describe('AppInstanceManager', () => {
  let tmpDir;
  let stateDir;
  let instancesDir;
  let templateDir;
  let mockExecSync;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-inst-'));
    stateDir = path.join(tmpDir, '.planning-game');
    instancesDir = path.join(tmpDir, 'planning-game-instances');
    templateDir = path.join(tmpDir, 'template-repo');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'package.json'), '{"name":"planning-game"}');
    fs.mkdirSync(path.join(templateDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'scripts', 'setup.cjs'), 'console.log("setup");');
    fs.mkdirSync(path.join(templateDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'node_modules', 'ignored.txt'), 'x');
    mockExecSync = vi.fn().mockReturnValue('');
    manager = new AppInstanceManager(stateDir, instancesDir, { execSync: mockExecSync });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create an instance and persist marker/manifest', () => {
    const instance = manager.createInstance('personal', {
      baseRepoDir: templateDir,
    });

    expect(instance.name).toBe('personal');
    expect(fs.existsSync(path.join(instance.directory, INSTANCE_MARKER_FILE))).toBe(true);
    expect(fs.existsSync(path.join(instance.directory, 'functions'))).toBe(true);
    expect(fs.existsSync(path.join(instance.directory, 'public'))).toBe(true);
    expect(fs.existsSync(path.join(instance.directory, 'package.json'))).toBe(false);
    expect(manager.instanceExists('personal')).toBe(true);
  });

  it('should resolve source repo to base directory path', () => {
    expect(manager.resolveSourceRepo(templateDir)).toBe(templateDir);
  });

  it('should detect instance directory with marker file', () => {
    const dir = path.join(tmpDir, 'inst');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, INSTANCE_MARKER_FILE), '{}');
    expect(manager.isInstanceDirectory(dir)).toBe(true);
  });

  it('should update existing instance with git pull', () => {
    const instanceDir = path.join(instancesDir, 'personal');
    fs.mkdirSync(instanceDir, { recursive: true });

    const manifest = manager.loadManifest();
    manifest.instances.personal = {
      name: 'personal',
      directory: instanceDir,
      sourceRepo: templateDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    manager.saveManifest(manifest);

    manager.updateInstance('personal');
    expect(fs.existsSync(path.join(instanceDir, 'functions'))).toBe(true);
    expect(fs.existsSync(path.join(instanceDir, 'public'))).toBe(true);
    expect(mockExecSync).not.toHaveBeenCalledWith('git pull --ff-only', expect.anything());
  });
});

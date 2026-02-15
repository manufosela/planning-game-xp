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
  let mockExecSync;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-inst-'));
    stateDir = path.join(tmpDir, '.planning-game');
    instancesDir = path.join(tmpDir, 'planning-game-instances');
    mockExecSync = vi.fn().mockReturnValue('');
    manager = new AppInstanceManager(stateDir, instancesDir, { execSync: mockExecSync });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create an instance and persist marker/manifest', () => {
    mockExecSync.mockImplementation((cmd) => {
      const match = cmd.match(/git clone \"(.+)\" \"(.+)\"/);
      if (match) {
        fs.mkdirSync(match[2], { recursive: true });
        fs.writeFileSync(path.join(match[2], 'package.json'), '{}');
      }
      return '';
    });

    const instance = manager.createInstance('personal', {
      baseRepoDir: '/repo/template',
      sourceRepoUrl: 'git@github.com:org/planning-game-xp.git',
    });

    expect(instance.name).toBe('personal');
    expect(fs.existsSync(path.join(instance.directory, INSTANCE_MARKER_FILE))).toBe(true);
    expect(manager.instanceExists('personal')).toBe(true);
  });

  it('should fallback to base repo path when no origin remote exists', () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd.includes('git config --get remote.origin.url')) throw new Error('no remote');
      return '';
    });
    expect(manager.resolveSourceRepo('/repo/template')).toBe('/repo/template');
  });

  it('should detect instance directory with marker file', () => {
    const dir = path.join(tmpDir, 'inst');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, INSTANCE_MARKER_FILE), '{}');
    expect(manager.isInstanceDirectory(dir)).toBe(true);
  });

  it('should update existing instance with git pull', () => {
    const manifest = manager.loadManifest();
    manifest.instances.personal = {
      name: 'personal',
      directory: '/tmp/personal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    manager.saveManifest(manifest);

    manager.updateInstance('personal');
    expect(mockExecSync).toHaveBeenCalledWith('git pull --ff-only', expect.objectContaining({ cwd: '/tmp/personal' }));
  });
});

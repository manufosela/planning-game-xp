import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  buildInstanceOverlayPairs,
  applyInstanceOverlays,
} = await import('../../scripts/instance-config-overlay.cjs');

describe('instance config overlay', () => {
  let tmpDir;
  let rootDir;
  let instanceDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instance-overlay-'));
    rootDir = path.join(tmpDir, 'repo');
    instanceDir = path.join(tmpDir, 'instance');
    fs.mkdirSync(path.join(rootDir, 'functions'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'functions'), { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'public'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should build expected overlay pairs for instance and root', () => {
    const pairs = buildInstanceOverlayPairs(rootDir, instanceDir);
    const fromPaths = pairs.map((pair) => pair.from);
    const toPaths = pairs.map((pair) => pair.to);

    expect(fromPaths).toContain(path.join(instanceDir, '.env.dev'));
    expect(fromPaths).toContain(path.join(instanceDir, 'functions', '.env'));
    expect(toPaths).toContain(path.join(rootDir, '.env.dev'));
    expect(toPaths).toContain(path.join(rootDir, 'functions', '.env'));
  });

  it('should apply overlays and restore original files', () => {
    const rootEnvPath = path.join(rootDir, '.env.dev');
    const instanceEnvPath = path.join(instanceDir, '.env.dev');
    fs.writeFileSync(rootEnvPath, 'ROOT=1\n', 'utf8');
    fs.writeFileSync(instanceEnvPath, 'INSTANCE=1\n', 'utf8');

    const restore = applyInstanceOverlays(rootDir, instanceDir);
    expect(fs.readFileSync(rootEnvPath, 'utf8')).toBe('INSTANCE=1\n');

    restore();
    expect(fs.readFileSync(rootEnvPath, 'utf8')).toBe('ROOT=1\n');
  });

  it('should remove created destination files on restore when root had none', () => {
    const rootFunctionsEnvPath = path.join(rootDir, 'functions', '.env');
    const instanceFunctionsEnvPath = path.join(instanceDir, 'functions', '.env');
    fs.writeFileSync(instanceFunctionsEnvPath, 'X=1\n', 'utf8');

    const restore = applyInstanceOverlays(rootDir, instanceDir);
    expect(fs.existsSync(rootFunctionsEnvPath)).toBe(true);

    restore();
    expect(fs.existsSync(rootFunctionsEnvPath)).toBe(false);
  });
});

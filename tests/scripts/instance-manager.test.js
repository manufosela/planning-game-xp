import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We test helper functions by importing them from the module.
// The module exports helpers for testability.
let mod;

beforeEach(async () => {
  // Dynamic import to get fresh module (vitest caches, but helpers are pure)
  mod = await import('../../scripts/instance-manager.js');
});

// ---------------------------------------------------------------------------
// Helper: isWindows
// ---------------------------------------------------------------------------
describe('isWindows', () => {
  it('returns a boolean', () => {
    expect(typeof mod.isWindows()).toBe('boolean');
  });

  it('returns true on win32', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(mod.isWindows()).toBe(true);
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  });

  it('returns false on linux', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(mod.isWindows()).toBe(false);
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  });
});

// ---------------------------------------------------------------------------
// Helper: isTTY
// ---------------------------------------------------------------------------
describe('isTTY', () => {
  it('returns a boolean', () => {
    expect(typeof mod.isTTY()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Helper: getEnvVar
// ---------------------------------------------------------------------------
describe('getEnvVar', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the value of a present variable', () => {
    fs.writeFileSync(path.join(tmpDir, '.env.development'), 'PUBLIC_FIREBASE_API_KEY=abc123\nOTHER=xyz\n');
    expect(mod.getEnvVar(tmpDir, '.env.development', 'PUBLIC_FIREBASE_API_KEY')).toBe('abc123');
  });

  it('returns null for a missing variable', () => {
    fs.writeFileSync(path.join(tmpDir, '.env.development'), 'OTHER=xyz\n');
    expect(mod.getEnvVar(tmpDir, '.env.development', 'PUBLIC_FIREBASE_API_KEY')).toBeNull();
  });

  it('returns null for placeholder values containing YOUR_', () => {
    fs.writeFileSync(path.join(tmpDir, '.env.development'), 'PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY\n');
    expect(mod.getEnvVar(tmpDir, '.env.development', 'PUBLIC_FIREBASE_API_KEY')).toBeNull();
  });

  it('returns null if the file does not exist', () => {
    expect(mod.getEnvVar(tmpDir, '.env.missing', 'PUBLIC_FIREBASE_API_KEY')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helper: getProjectIdFromFirebaserc
// ---------------------------------------------------------------------------
describe('getProjectIdFromFirebaserc', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the default project ID', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.firebaserc'),
      JSON.stringify({ projects: { default: 'my-project' } }),
    );
    expect(mod.getProjectIdFromFirebaserc(tmpDir)).toBe('my-project');
  });

  it('returns null for placeholder values', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.firebaserc'),
      JSON.stringify({ projects: { default: 'YOUR_PROJECT_ID' } }),
    );
    expect(mod.getProjectIdFromFirebaserc(tmpDir)).toBeNull();
  });

  it('returns null when file is missing', () => {
    expect(mod.getProjectIdFromFirebaserc(tmpDir)).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    fs.writeFileSync(path.join(tmpDir, '.firebaserc'), 'not json');
    expect(mod.getProjectIdFromFirebaserc(tmpDir)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helper: listInstanceNames
// ---------------------------------------------------------------------------
describe('listInstanceNames', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array if instances dir does not exist', () => {
    const nonExistent = path.join(tmpDir, 'nope');
    expect(mod.listInstanceNames(nonExistent)).toEqual([]);
  });

  it('lists instance directories, ignoring dotfiles', () => {
    const instDir = path.join(tmpDir, 'instances');
    fs.mkdirSync(path.join(instDir, 'alpha'), { recursive: true });
    fs.mkdirSync(path.join(instDir, 'beta'), { recursive: true });
    fs.mkdirSync(path.join(instDir, '.hidden'), { recursive: true });
    fs.writeFileSync(path.join(instDir, 'not-a-dir.txt'), 'file');
    const names = mod.listInstanceNames(instDir);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).not.toContain('.hidden');
    expect(names).not.toContain('not-a-dir.txt');
  });
});

// ---------------------------------------------------------------------------
// Helper: createLink
// ---------------------------------------------------------------------------
describe('createLink', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a symlink for a file', () => {
    const src = path.join(tmpDir, 'source.txt');
    const dest = path.join(tmpDir, 'link.txt');
    fs.writeFileSync(src, 'hello');
    mod.createLink(src, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('hello');
    if (process.platform !== 'win32') {
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);
    }
  });

  it('replaces an existing symlink', () => {
    const src1 = path.join(tmpDir, 'a.txt');
    const src2 = path.join(tmpDir, 'b.txt');
    const dest = path.join(tmpDir, 'link.txt');
    fs.writeFileSync(src1, 'first');
    fs.writeFileSync(src2, 'second');
    mod.createLink(src1, dest);
    mod.createLink(src2, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('second');
  });

  it('creates parent directories if missing', () => {
    const src = path.join(tmpDir, 'source.txt');
    const dest = path.join(tmpDir, 'deep', 'nested', 'link.txt');
    fs.writeFileSync(src, 'deep');
    mod.createLink(src, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('deep');
  });

  it('creates a directory symlink', () => {
    const srcDir = path.join(tmpDir, 'srcdir');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'file.txt'), 'in dir');
    const destDir = path.join(tmpDir, 'linkdir');
    mod.createLink(srcDir, destDir, true);
    expect(fs.readFileSync(path.join(destDir, 'file.txt'), 'utf8')).toBe('in dir');
  });
});

// ---------------------------------------------------------------------------
// Helper: getLastInstance / saveLastInstance
// ---------------------------------------------------------------------------
describe('getLastInstance / saveLastInstance', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no file exists', () => {
    const filePath = path.join(tmpDir, '.last-instance');
    expect(mod.getLastInstance(filePath)).toBeNull();
  });

  it('saves and retrieves an instance name', () => {
    const filePath = path.join(tmpDir, '.last-instance');
    mod.saveLastInstance('my-instance', filePath);
    expect(mod.getLastInstance(filePath)).toBe('my-instance');
  });
});

// ---------------------------------------------------------------------------
// Helper: verifyInstance
// ---------------------------------------------------------------------------
describe('verifyInstance', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports issues for a completely empty instance', () => {
    fs.mkdirSync(path.join(tmpDir, 'empty'), { recursive: true });
    const result = mod.verifyInstance('empty', tmpDir);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.projectId).toBeNull();
  });

  it('reports no issues for a fully configured instance', () => {
    const instDir = path.join(tmpDir, 'good');
    fs.mkdirSync(path.join(instDir, 'functions'), { recursive: true });
    fs.mkdirSync(path.join(instDir, 'emulator-data'), { recursive: true });

    // Required files
    fs.writeFileSync(
      path.join(instDir, '.env.development'),
      [
        'PUBLIC_FIREBASE_API_KEY=real-key',
        'PUBLIC_FIREBASE_AUTH_DOMAIN=proj.firebaseapp.com',
        'PUBLIC_FIREBASE_PROJECT_ID=proj',
        'PUBLIC_FIREBASE_APP_ID=1:123:web:abc',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(instDir, '.env.production'),
      [
        'PUBLIC_FIREBASE_API_KEY=real-key',
        'PUBLIC_FIREBASE_AUTH_DOMAIN=proj.firebaseapp.com',
        'PUBLIC_FIREBASE_PROJECT_ID=proj',
        'PUBLIC_FIREBASE_APP_ID=1:123:web:abc',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(instDir, '.firebaserc'),
      JSON.stringify({ projects: { default: 'proj' } }),
    );
    fs.writeFileSync(path.join(instDir, 'firestore.rules'), 'rules_version = "2";');

    const result = mod.verifyInstance('good', tmpDir);
    expect(result.issues).toEqual([]);
    expect(result.projectId).toBe('proj');
  });

  it('detects missing .firebaserc project ID', () => {
    const instDir = path.join(tmpDir, 'bad-rc');
    fs.mkdirSync(instDir, { recursive: true });
    fs.writeFileSync(
      path.join(instDir, '.firebaserc'),
      JSON.stringify({ projects: { default: 'YOUR_PROJECT' } }),
    );
    // Add other required files to isolate the test
    fs.writeFileSync(path.join(instDir, '.env.development'), 'PUBLIC_FIREBASE_API_KEY=x\nPUBLIC_FIREBASE_AUTH_DOMAIN=x\nPUBLIC_FIREBASE_PROJECT_ID=x\nPUBLIC_FIREBASE_APP_ID=x\n');
    fs.writeFileSync(path.join(instDir, '.env.production'), 'PUBLIC_FIREBASE_PROJECT_ID=x\n');
    fs.writeFileSync(path.join(instDir, 'firestore.rules'), 'rules');
    const result = mod.verifyInstance('bad-rc', tmpDir);
    expect(result.issues.some((i) => i.includes('.firebaserc'))).toBe(true);
  });

  it('detects missing required env vars in .env.development', () => {
    const instDir = path.join(tmpDir, 'bad-env');
    fs.mkdirSync(instDir, { recursive: true });
    fs.writeFileSync(path.join(instDir, '.env.development'), 'PUBLIC_FIREBASE_API_KEY=real\n');
    fs.writeFileSync(path.join(instDir, '.env.production'), 'PUBLIC_FIREBASE_PROJECT_ID=x\n');
    fs.writeFileSync(path.join(instDir, '.firebaserc'), JSON.stringify({ projects: { default: 'proj' } }));
    fs.writeFileSync(path.join(instDir, 'firestore.rules'), 'rules');
    const result = mod.verifyInstance('bad-env', tmpDir);
    expect(result.issues.some((i) => i.includes('PUBLIC_FIREBASE_AUTH_DOMAIN'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Constants: INSTANCE_FILES, REQUIRED_ENV_VARS
// ---------------------------------------------------------------------------
describe('INSTANCE_FILES', () => {
  it('is an array of file definitions', () => {
    expect(Array.isArray(mod.INSTANCE_FILES)).toBe(true);
    expect(mod.INSTANCE_FILES.length).toBeGreaterThan(0);
  });

  it('each entry has src, dest, required, and desc', () => {
    for (const entry of mod.INSTANCE_FILES) {
      expect(typeof entry.src).toBe('string');
      expect(typeof entry.required).toBe('boolean');
      expect(typeof entry.desc).toBe('string');
      // dest can be string or null
      if (entry.dest !== null) {
        expect(typeof entry.dest).toBe('string');
      }
    }
  });

  it('includes .env.development as required', () => {
    const envDev = mod.INSTANCE_FILES.find((f) => f.src === '.env.development');
    expect(envDev).toBeDefined();
    expect(envDev.required).toBe(true);
  });

  it('includes .env.production as required', () => {
    const envProd = mod.INSTANCE_FILES.find((f) => f.src === '.env.production');
    expect(envProd).toBeDefined();
    expect(envProd.required).toBe(true);
  });

  it('includes .firebaserc as required', () => {
    const rc = mod.INSTANCE_FILES.find((f) => f.src === '.firebaserc');
    expect(rc).toBeDefined();
    expect(rc.required).toBe(true);
  });

  it('includes firestore.rules as required', () => {
    const rules = mod.INSTANCE_FILES.find((f) => f.src === 'firestore.rules');
    expect(rules).toBeDefined();
    expect(rules.required).toBe(true);
  });

  it('does NOT include RTDB rules (V2 has no RTDB)', () => {
    const rtdb = mod.INSTANCE_FILES.find((f) => f.src.includes('database.rules'));
    expect(rtdb).toBeUndefined();
  });
});

describe('REQUIRED_ENV_VARS', () => {
  it('includes the 4 required vars', () => {
    expect(mod.REQUIRED_ENV_VARS).toContain('PUBLIC_FIREBASE_API_KEY');
    expect(mod.REQUIRED_ENV_VARS).toContain('PUBLIC_FIREBASE_AUTH_DOMAIN');
    expect(mod.REQUIRED_ENV_VARS).toContain('PUBLIC_FIREBASE_PROJECT_ID');
    expect(mod.REQUIRED_ENV_VARS).toContain('PUBLIC_FIREBASE_APP_ID');
  });

  it('does NOT include DATABASE_URL (V2 has no RTDB)', () => {
    expect(mod.REQUIRED_ENV_VARS).not.toContain('PUBLIC_FIREBASE_DATABASE_URL');
  });
});

// ---------------------------------------------------------------------------
// Helper: generateEnvTemplate
// ---------------------------------------------------------------------------
describe('generateEnvTemplate', () => {
  it('generates a development template with emulator settings', () => {
    const tpl = mod.generateEnvTemplate('development');
    expect(tpl).toContain('PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY');
    expect(tpl).toContain('PUBLIC_FIREBASE_DATABASE_ID=');
    expect(tpl).toContain('development');
  });

  it('generates a production template without emulator settings', () => {
    const tpl = mod.generateEnvTemplate('production');
    expect(tpl).toContain('PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY');
    expect(tpl).toContain('PUBLIC_FIREBASE_DATABASE_ID=(default)');
    expect(tpl).not.toContain('EMULATOR');
  });
});

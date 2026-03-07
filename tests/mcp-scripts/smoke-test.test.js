import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const MCP_DIR = path.resolve(import.meta.dirname, '../../mcp');
const SMOKE_SCRIPT = path.resolve(MCP_DIR, 'scripts/smoke-test.js');

describe('MCP Smoke Test script', () => {
  it('should exist at mcp/scripts/smoke-test.js', () => {
    expect(existsSync(SMOKE_SCRIPT)).toBe(true);
  });

  it('should be a valid ES module with runSmokeTest export', async () => {
    const mod = await import(SMOKE_SCRIPT);
    expect(typeof mod.runSmokeTest).toBe('function');
  });

  it('should export runSmokeTest that returns { passed, failed, errors }', async () => {
    // We can't run the real smoke test in CI (no serviceAccountKey.json),
    // but we can verify the function signature by mocking the environment.
    const mod = await import(SMOKE_SCRIPT);

    // Save and override env to point to a non-existent key
    const originalGAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const originalMID = process.env.MCP_INSTANCE_DIR;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/non-existent-key.json';
    delete process.env.MCP_INSTANCE_DIR;

    // Suppress console output during test
    const origLog = console.log;
    const origErr = console.error;
    console.log = vi.fn();
    console.error = vi.fn();

    try {
      const results = await mod.runSmokeTest();
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('errors');
      expect(typeof results.passed).toBe('number');
      expect(typeof results.failed).toBe('number');
      expect(Array.isArray(results.errors)).toBe(true);
      // With no key, it should fail on first check
      expect(results.failed).toBeGreaterThan(0);
      expect(results.errors[0]).toContain('not found');
    } finally {
      // Restore env
      if (originalGAC !== undefined) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGAC;
      } else {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      if (originalMID !== undefined) {
        process.env.MCP_INSTANCE_DIR = originalMID;
      }
      console.log = origLog;
      console.error = origErr;
    }
  });

  it('should detect missing serviceAccountKey.json and report clear error', async () => {
    const mod = await import(SMOKE_SCRIPT);

    const originalGAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const originalMID = process.env.MCP_INSTANCE_DIR;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/totally-fake-path.json';
    delete process.env.MCP_INSTANCE_DIR;

    const messages = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = vi.fn();
    console.error = (...args) => messages.push(args.join(' '));

    try {
      const results = await mod.runSmokeTest();
      expect(results.failed).toBe(1);
      expect(results.errors).toContain('serviceAccountKey.json not found');

      const allOutput = messages.join('\n');
      expect(allOutput).toContain('Firebase Console');
      expect(allOutput).toContain('npm run mcp:test');
    } finally {
      if (originalGAC !== undefined) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGAC;
      } else {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      if (originalMID !== undefined) {
        process.env.MCP_INSTANCE_DIR = originalMID;
      }
      console.log = origLog;
      console.error = origErr;
    }
  });

  it('should detect invalid JSON in serviceAccountKey.json', async () => {
    const mod = await import(SMOKE_SCRIPT);
    const fs = await import('fs');
    const tmpFile = '/tmp/smoke-test-invalid-key.json';

    fs.writeFileSync(tmpFile, 'not valid json {{{', 'utf8');

    const originalGAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;

    const origLog = console.log;
    const origErr = console.error;
    console.log = vi.fn();
    console.error = vi.fn();

    try {
      const results = await mod.runSmokeTest();
      expect(results.failed).toBeGreaterThan(0);
      expect(results.errors[0]).toContain('Invalid serviceAccountKey.json');
    } finally {
      if (originalGAC !== undefined) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGAC;
      } else {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      console.log = origLog;
      console.error = origErr;
      fs.unlinkSync(tmpFile);
    }
  });

  it('should detect missing project_id in serviceAccountKey.json', async () => {
    const mod = await import(SMOKE_SCRIPT);
    const fs = await import('fs');
    const tmpFile = '/tmp/smoke-test-no-projectid.json';

    fs.writeFileSync(tmpFile, JSON.stringify({ type: 'service_account' }), 'utf8');

    const originalGAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;

    const origLog = console.log;
    const origErr = console.error;
    console.log = vi.fn();
    console.error = vi.fn();

    try {
      const results = await mod.runSmokeTest();
      expect(results.failed).toBeGreaterThan(0);
      expect(results.errors[0]).toContain('Invalid serviceAccountKey.json');
    } finally {
      if (originalGAC !== undefined) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGAC;
      } else {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      console.log = origLog;
      console.error = origErr;
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('npm run mcp:test integration', () => {
  it('should have mcp:test script in package.json', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'));
    expect(pkg.scripts['mcp:test']).toBeDefined();
    expect(pkg.scripts['mcp:test']).toContain('smoke-test.js');
  });
});

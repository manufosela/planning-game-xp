import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  shouldInstallFunctionsDependencies,
  ensureFunctionsDependencies,
  hasBlockingAuditVulnerabilities,
} = await import('../../scripts/functions-deploy-prep-helper.cjs');

describe('functions deploy prep helper', () => {
  it('should request install when firebase-functions is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-prep-'));
    fs.mkdirSync(path.join(root, 'functions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'functions', 'package.json'), JSON.stringify({
      name: 'functions',
      dependencies: { 'firebase-functions': '^7.0.2' },
    }));

    expect(shouldInstallFunctionsDependencies(root)).toBe(true);
  });

  it('should not request install when firebase-functions exists in node_modules', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-prep-'));
    fs.mkdirSync(path.join(root, 'functions', 'node_modules', 'firebase-functions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'functions', 'package.json'), JSON.stringify({
      name: 'functions',
      dependencies: { 'firebase-functions': '^7.0.2' },
    }));

    expect(shouldInstallFunctionsDependencies(root)).toBe(false);
  });

  it('should run npm install in functions when needed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-prep-'));
    fs.mkdirSync(path.join(root, 'functions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'functions', 'package.json'), JSON.stringify({
      name: 'functions',
      dependencies: { 'firebase-functions': '^7.0.2' },
    }));

    const run = vi.fn().mockImplementation((cmd, options) => {
      expect(options.cwd).toBe(path.join(root, 'functions'));
      if (cmd === 'npm install') {
        fs.mkdirSync(path.join(root, 'functions', 'node_modules', 'firebase-functions'), { recursive: true });
        return '';
      }
      if (cmd === 'npm audit --json') {
        return JSON.stringify({
          metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } },
        });
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = ensureFunctionsDependencies(root, { execSync: run });
    expect(result.installed).toBe(true);
    expect(run).toHaveBeenCalledWith('npm install', expect.any(Object));
  });

  it('should run npm audit and npm audit fix when blocking vulnerabilities are found', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-prep-'));
    fs.mkdirSync(path.join(root, 'functions', 'node_modules', 'firebase-functions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'functions', 'package.json'), JSON.stringify({
      name: 'functions',
      dependencies: { 'firebase-functions': '^7.0.2' },
    }));

    const run = vi.fn()
      .mockImplementationOnce((cmd) => {
        expect(cmd).toBe('npm audit --json');
        return JSON.stringify({
          metadata: { vulnerabilities: { low: 0, moderate: 0, high: 2, critical: 0 } },
        });
      })
      .mockImplementationOnce((cmd) => {
        expect(cmd).toBe('npm audit fix');
        return '';
      })
      .mockImplementationOnce((cmd) => {
        expect(cmd).toBe('npm audit --json');
        return JSON.stringify({
          metadata: { vulnerabilities: { low: 1, moderate: 0, high: 0, critical: 0 } },
        });
      });

    const result = ensureFunctionsDependencies(root, { execSync: run });
    expect(result.auditBefore.high).toBe(2);
    expect(result.auditAfter.high).toBe(0);
    expect(result.auditFixApplied).toBe(true);
  });

  it('should detect blocking vulnerabilities', () => {
    expect(hasBlockingAuditVulnerabilities({ low: 2, moderate: 0, high: 0, critical: 0 })).toBe(false);
    expect(hasBlockingAuditVulnerabilities({ low: 0, moderate: 1, high: 0, critical: 0 })).toBe(true);
  });
});

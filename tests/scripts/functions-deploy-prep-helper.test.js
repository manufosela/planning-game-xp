import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  shouldInstallFunctionsDependencies,
  ensureFunctionsDependencies,
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
      expect(cmd).toBe('npm install');
      expect(options.cwd).toBe(path.join(root, 'functions'));
      fs.mkdirSync(path.join(root, 'functions', 'node_modules', 'firebase-functions'), { recursive: true });
      return '';
    });

    const result = ensureFunctionsDependencies(root, { execSync: run });
    expect(result.installed).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

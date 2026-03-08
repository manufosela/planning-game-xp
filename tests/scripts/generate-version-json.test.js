import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const scriptPath = path.resolve('scripts/generate-version-json.cjs');
const pkgPath = path.resolve('package.json');

describe('generate-version-json.cjs', () => {
  let tmpDir;
  let outputPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-json-'));
    outputPath = path.join(tmpDir, 'latest-version.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate valid JSON with correct structure', () => {
    execSync(`node ${scriptPath} --output ${outputPath}`);
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(data.version).toBeDefined();
    expect(data.name).toBe('planning-game');
    expect(data.date).toBeDefined();
    expect(data.repoUrl).toBe('https://github.com/manufosela/planning-game-xp');
    expect(data.releaseUrl).toContain(data.version);
  });

  it('should use version from package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    execSync(`node ${scriptPath} --output ${outputPath}`);
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(data.version).toBe(pkg.version);
  });

  it('should include changelog when provided', () => {
    execSync(`node ${scriptPath} --output ${outputPath} --changelog "Fixed bug XYZ"`);
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(data.changelog).toBe('Fixed bug XYZ');
  });

  it('should default changelog to empty string', () => {
    execSync(`node ${scriptPath} --output ${outputPath}`);
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(data.changelog).toBe('');
  });

  it('should produce valid ISO date', () => {
    execSync(`node ${scriptPath} --output ${outputPath}`);
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    const date = new Date(data.date);
    expect(date.toISOString()).toBe(data.date);
  });

  it('should default output to latest-version.json in cwd', () => {
    execSync(`node ${scriptPath}`, { cwd: tmpDir });
    const defaultPath = path.join(tmpDir, 'latest-version.json');
    expect(fs.existsSync(defaultPath)).toBe(true);
  });
});

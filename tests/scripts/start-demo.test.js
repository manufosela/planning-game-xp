import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('Demo mode configuration', () => {
  it('functions/.env.demo should exist and have DEMO_MODE=true', () => {
    const envDemo = fs.readFileSync(path.join(ROOT, 'functions/.env.demo'), 'utf8');
    expect(envDemo).toContain('DEMO_MODE=true');
  });

  it('functions/.env.demo should have MS_EMAIL_ENABLED=false', () => {
    const envDemo = fs.readFileSync(path.join(ROOT, 'functions/.env.demo'), 'utf8');
    expect(envDemo).toContain('MS_EMAIL_ENABLED=false');
  });

  it('functions/.env.demo should NOT contain API keys or secrets', () => {
    const envDemo = fs.readFileSync(path.join(ROOT, 'functions/.env.demo'), 'utf8');
    expect(envDemo).not.toMatch(/API_KEY\s*=\s*\S+/);
    expect(envDemo).not.toMatch(/SECRET\s*=\s*\S+/);
    expect(envDemo).not.toMatch(/CLIENT_ID\s*=\s*\S+/);
  });

  it('theme-config.demo.json should exist and have demo.enabled=true', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'public/theme-config.demo.json'), 'utf8')
    );
    expect(config.demo).toBeDefined();
    expect(config.demo.enabled).toBe(true);
  });

  it('theme-config.demo.json should have demo limits set', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'public/theme-config.demo.json'), 'utf8')
    );
    expect(config.demo.maxProjects).toBeGreaterThan(0);
    expect(config.demo.maxTasksPerProject).toBeGreaterThan(0);
    expect(config.demo.bannerText).toBeTruthy();
  });

  it('theme-config.demo.json should have required branding fields', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'public/theme-config.demo.json'), 'utf8')
    );
    expect(config.branding).toBeDefined();
    expect(config.branding.appName).toContain('Demo');
    expect(config.tokens).toBeDefined();
  });

  it('start-demo.sh should exist and be executable', () => {
    const scriptPath = path.join(ROOT, 'scripts/start-demo.sh');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const stat = fs.statSync(scriptPath);
    const isExecutable = (stat.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('package.json should have demo script', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
    expect(pkg.scripts.demo).toBeDefined();
    expect(pkg.scripts.demo).toContain('start-demo');
  });
});

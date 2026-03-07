import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const EXAMPLE_DIR = path.resolve(import.meta.dirname, '../../planning-game-instances/example');

describe('Example instance', () => {
  const requiredFiles = [
    'README.md',
    '.env.dev',
    '.env.prod',
    '.firebaserc',
    'database.rules.json',
    'storage.rules',
    'theme-config.json',
    'functions/.env',
  ];

  for (const file of requiredFiles) {
    it(`should have ${file}`, () => {
      expect(fs.existsSync(path.join(EXAMPLE_DIR, file))).toBe(true);
    });
  }

  it('should NOT have serviceAccountKey.json', () => {
    expect(fs.existsSync(path.join(EXAMPLE_DIR, 'serviceAccountKey.json'))).toBe(false);
  });

  it('.env.dev should use placeholder values, not real keys', () => {
    const content = fs.readFileSync(path.join(EXAMPLE_DIR, '.env.dev'), 'utf8');
    expect(content).toContain('YOUR_API_KEY');
    expect(content).toContain('your-project-id');
    expect(content).not.toMatch(/AIza[A-Za-z0-9_-]{30,}/);
  });

  it('.env.prod should use placeholder values', () => {
    const content = fs.readFileSync(path.join(EXAMPLE_DIR, '.env.prod'), 'utf8');
    expect(content).toContain('YOUR_API_KEY');
    expect(content).toContain('your-project-id');
  });

  it('.firebaserc should reference placeholder project', () => {
    const rc = JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, '.firebaserc'), 'utf8'));
    expect(rc.projects.default).toBe('your-project-id');
  });

  it('database.rules.json should reference YOUR_DOMAIN placeholder', () => {
    const content = fs.readFileSync(path.join(EXAMPLE_DIR, 'database.rules.json'), 'utf8');
    expect(content).toContain('YOUR_DOMAIN');
  });

  it('theme-config.json should be valid JSON with branding', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(EXAMPLE_DIR, 'theme-config.json'), 'utf8')
    );
    expect(config.branding).toBeDefined();
    expect(config.tokens).toBeDefined();
  });

  it('functions/.env should have DEMO_MODE=true by default', () => {
    const content = fs.readFileSync(path.join(EXAMPLE_DIR, 'functions/.env'), 'utf8');
    expect(content).toContain('DEMO_MODE=true');
    expect(content).toContain('MS_EMAIL_ENABLED=false');
  });
});

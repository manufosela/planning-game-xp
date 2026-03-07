import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const SETUP_MCP_SCRIPT = path.resolve(ROOT_DIR, 'scripts/setup-mcp.cjs');
const SETUP_SCRIPT = path.resolve(ROOT_DIR, 'scripts/setup.cjs');

describe('MCP multi-instance setup', () => {
  it('setup-mcp.cjs script should exist', () => {
    expect(fs.existsSync(SETUP_MCP_SCRIPT)).toBe(true);
  });

  it('setup-mcp.cjs should be valid JavaScript (CJS)', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('planning-game-');
    expect(content).toContain('MCP_INSTANCE_DIR');
    expect(content).toContain('GOOGLE_APPLICATION_CREDENTIALS');
    expect(content).toContain('FIREBASE_DATABASE_URL');
    expect(content).toContain('claude mcp add');
  });

  it('should generate server name from instance name', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    // Verify the pattern: planning-game-{instanceName}
    expect(content).toContain('`planning-game-${instanceName}`');
  });

  it('should support listing multiple instances', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('planning-game-instances');
    expect(content).toContain('listInstances');
  });

  it('should not modify existing MCP entries when adding new one', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    // Should only remove the specific serverName before re-adding
    expect(content).toContain('claude mcp remove');
    expect(content).toMatch(/remove.*serverName/s);
  });

  it('package.json should have setup:mcp script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    expect(pkg.scripts['setup:mcp']).toBeDefined();
    expect(pkg.scripts['setup:mcp']).toContain('setup-mcp.cjs');
  });

  it('setup.cjs should have full MCP setup in step 9', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf8');
    // Should contain the real implementation, not just a link to docs
    expect(content).toContain('claude mcp add');
    expect(content).toContain('MCP_INSTANCE_DIR');
    expect(content).toContain('smoke-test.js');
    expect(content).toContain('planning-game-');
  });

  it('setup.cjs should derive server name from instance name', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf8');
    expect(content).toContain('`planning-game-${instanceName}`');
  });

  it('setup.cjs should handle missing claude CLI gracefully', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf8');
    expect(content).toContain('which claude');
    expect(content).toContain('printManualMcpConfig');
  });

  it('setup.cjs should verify serviceAccountKey.json before registration', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf8');
    expect(content).toContain('serviceAccountKey.json');
    expect(content).toContain('Firebase Console');
  });
});

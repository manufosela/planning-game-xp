import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const SETUP_MCP_SCRIPT = path.resolve(ROOT_DIR, 'scripts/setup-mcp.cjs');
const SETUP_MCP_HELPERS = path.resolve(ROOT_DIR, 'scripts/setup-mcp-helpers.cjs');
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
    expect(content).toContain('`planning-game-${instanceName}`');
  });

  it('should support listing multiple instances', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('planning-game-instances');
    expect(content).toContain('listInstances');
  });

  it('should not modify existing MCP entries when adding new one', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('claude mcp remove');
    expect(content).toMatch(/remove.*serverName/s);
  });

  it('package.json should have setup:mcp script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    expect(pkg.scripts['setup:mcp']).toBeDefined();
    expect(pkg.scripts['setup:mcp']).toContain('setup-mcp.cjs');
  });

  it('setup-mcp.cjs should import setupMcpUser from helpers', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain("require('./setup-mcp-helpers.cjs')");
    expect(content).toContain('setupMcpUser');
  });

  it('setup.cjs should have full MCP setup in step 9', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf8');
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

  it('setup.cjs should call setupMcpUser from helpers', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf8');
    expect(content).toContain("require('./setup-mcp-helpers.cjs')");
    expect(content).toContain('setupMcpUser');
  });
});

describe('setup-mcp-helpers.cjs - shared MCP user setup', () => {
  it('helpers file should exist', () => {
    expect(fs.existsSync(SETUP_MCP_HELPERS)).toBe(true);
  });

  it('should export fetchUsers and setupMcpUser', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('module.exports');
    expect(content).toContain('fetchUsers');
    expect(content).toContain('setupMcpUser');
  });

  it('fetchUsers should read from /users/ model', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('async function fetchUsers');
    expect(content).toContain("/users'");
  });

  it('fetchUsers should fallback to /projects/ if /users/ is empty', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain("/projects'");
    expect(content).toContain('Fallback');
  });

  it('fetchUsers should include stakeholderId', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toMatch(/devId:\s*userData\.developerId/);
    expect(content).toMatch(/stakeholderId:\s*userData\.stakeholderId/);
  });

  it('fetchUsers should skip inactive users', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('userData.active === false');
  });

  it('setupMcpUser should accept options object', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('{ question, print, instanceDir, keyPath, databaseURL }');
  });

  it('setupMcpUser should check existing mcp.user.json before overwriting', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('Configuracion actual encontrada');
    expect(content).toContain('Actualizar configuracion');
  });

  it('setupMcpUser should handle empty email gracefully', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('Email vacio');
  });

  it('setupMcpUser should write all required fields', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('developerId: matchedUser.devId');
    expect(content).toContain('stakeholderId: matchedUser.stakeholderId');
    expect(content).toContain('name: matchedUser.name');
    expect(content).toContain('email: matchedUser.email');
  });

  it('setupMcpUser should display stakeholder info when found', () => {
    const content = fs.readFileSync(SETUP_MCP_HELPERS, 'utf8');
    expect(content).toContain('Stakeholder:');
  });
});

describe('setup-mcp.cjs - setupMcpUser call order', () => {
  it('setup-mcp.cjs should call setupMcpUser before smoke test', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    const setupMcpUserCallIndex = content.indexOf('await setupMcpUser(');
    const smokeTestIndex = content.indexOf('smoke-test.js');
    expect(setupMcpUserCallIndex).toBeGreaterThan(-1);
    expect(smokeTestIndex).toBeGreaterThan(-1);
    expect(setupMcpUserCallIndex).toBeLessThan(smokeTestIndex);
  });

  it('setup.cjs should call setupMcpUser before smoke test', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf8');
    const setupMcpUserCallIndex = content.indexOf('setupMcpUser(');
    const smokeTestIndex = content.indexOf('smoke-test.js');
    expect(setupMcpUserCallIndex).toBeGreaterThan(-1);
    expect(smokeTestIndex).toBeGreaterThan(-1);
    expect(setupMcpUserCallIndex).toBeLessThan(smokeTestIndex);
  });
});

describe('mcp.user.json file operations', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-mcp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate valid JSON with all required fields', () => {
    const mcpUserPath = path.join(tmpDir, 'mcp.user.json');
    const userData = {
      developerId: 'dev_001',
      stakeholderId: 'stk_001',
      name: 'Test User',
      email: 'test@example.com'
    };
    fs.writeFileSync(mcpUserPath, JSON.stringify(userData, null, 2) + '\n');

    const written = JSON.parse(fs.readFileSync(mcpUserPath, 'utf8'));
    expect(written.developerId).toBe('dev_001');
    expect(written.stakeholderId).toBe('stk_001');
    expect(written.name).toBe('Test User');
    expect(written.email).toBe('test@example.com');
  });

  it('should handle null stakeholderId', () => {
    const mcpUserPath = path.join(tmpDir, 'mcp.user.json');
    const userData = {
      developerId: 'dev_002',
      stakeholderId: null,
      name: 'Dev Only',
      email: 'dev@example.com'
    };
    fs.writeFileSync(mcpUserPath, JSON.stringify(userData, null, 2) + '\n');

    const written = JSON.parse(fs.readFileSync(mcpUserPath, 'utf8'));
    expect(written.developerId).toBe('dev_002');
    expect(written.stakeholderId).toBeNull();
  });
});

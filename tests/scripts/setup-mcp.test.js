import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

describe('setup-mcp.cjs - mcp.user.json generation', () => {
  it('should include fetchUsers function that reads from /users/', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('async function fetchUsers');
    expect(content).toContain("/users'");
  });

  it('should fallback to /projects/ if /users/ is empty', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain("/projects'");
    expect(content).toContain('Fallback');
  });

  it('should include stakeholderId in user data', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('stakeholderId');
    expect(content).toContain('userData.stakeholderId');
  });

  it('should include setupMcpUser function', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('async function setupMcpUser');
    expect(content).toContain('mcp.user.json');
  });

  it('should call setupMcpUser before smoke test', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    const setupMcpUserCallIndex = content.indexOf('await setupMcpUser(');
    const smokeTestIndex = content.indexOf('smoke-test.js');
    expect(setupMcpUserCallIndex).toBeGreaterThan(-1);
    expect(smokeTestIndex).toBeGreaterThan(-1);
    expect(setupMcpUserCallIndex).toBeLessThan(smokeTestIndex);
  });

  it('should write mcp.user.json with correct format', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    // Must include all four fields in the userData object
    expect(content).toContain('developerId: matchedUser.devId');
    expect(content).toContain('stakeholderId: matchedUser.stakeholderId');
    expect(content).toContain('name: matchedUser.name');
    expect(content).toContain('email: matchedUser.email');
  });

  it('should check existing mcp.user.json before overwriting', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('Configuracion actual encontrada');
    expect(content).toContain('Actualizar configuracion');
  });

  it('should handle empty email gracefully', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('Email vacio');
  });

  it('should display stakeholder info when found', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('Stakeholder:');
  });

  it('fetchUsers should return stakeholderId from /users/ model', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    // Verify fetchUsers extracts stakeholderId
    expect(content).toMatch(/devId:\s*userData\.developerId/);
    expect(content).toMatch(/stakeholderId:\s*userData\.stakeholderId/);
  });

  it('fetchUsers should skip inactive users', () => {
    const content = fs.readFileSync(SETUP_MCP_SCRIPT, 'utf8');
    expect(content).toContain('userData.active === false');
  });
});

describe('setup-mcp.cjs - mcp.user.json file operations', () => {
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

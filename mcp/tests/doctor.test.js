import { describe, it, expect, vi } from 'vitest';

// Mock firebase-adapter before importing doctor
vi.mock('../firebase-adapter.js', () => ({
  resolveCredentialsPath: vi.fn(() => '/fake/path/serviceAccountKey.json'),
  getDatabase: vi.fn(() => ({
    ref: () => ({
      once: () => Promise.resolve({
        val: () => ({ ProjectA: {}, ProjectB: {} })
      })
    })
  })),
  getFirebaseProjectId: vi.fn(() => 'test-project-id')
}));

vi.mock('../user.js', () => ({
  resolveUserConfigPath: vi.fn(() => '/fake/path/mcp.user.json'),
  isMcpUserConfigured: vi.fn(() => true),
  getMcpUser: vi.fn(() => ({
    developerId: 'dev_001',
    developerName: 'Test User',
    developerEmail: 'test@example.com'
  }))
}));

vi.mock('../version-check.js', () => ({
  getLocalVersion: vi.fn(() => '1.13.1')
}));

const { pgDoctor } = await import('../tools/doctor.js');

describe('pg_doctor', () => {
  it('should return structured diagnostic report', async () => {
    const result = await pgDoctor();

    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const report = JSON.parse(result.content[0].text);
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('checks');
    expect(report).toHaveProperty('suggestion');
    expect(Array.isArray(report.checks)).toBe(true);
  });

  it('should include all 8 diagnostic checks', async () => {
    const result = await pgDoctor();
    const report = JSON.parse(result.content[0].text);

    expect(report.checks).toHaveLength(8);
    const checkNames = report.checks.map(c => c.name);
    expect(checkNames).toContain('Node.js version');
    expect(checkNames).toContain('serviceAccountKey.json');
    expect(checkNames).toContain('Firebase connectivity');
    expect(checkNames).toContain('MCP dependencies');
    expect(checkNames).toContain('MCP user config');
    expect(checkNames).toContain('MCP version');
    expect(checkNames).toContain('Instance configuration');
    expect(checkNames).toContain('Git');
  });

  it('should report Node.js version as pass for current runtime', async () => {
    const result = await pgDoctor();
    const report = JSON.parse(result.content[0].text);
    const nodeCheck = report.checks.find(c => c.name === 'Node.js version');

    expect(nodeCheck.status).toBe('pass');
    expect(nodeCheck.value).toBe(process.version);
  });

  it('should report serviceAccountKey.json as fail for fake path', async () => {
    const result = await pgDoctor();
    const report = JSON.parse(result.content[0].text);
    const sakCheck = report.checks.find(c => c.name === 'serviceAccountKey.json');

    // Path is /fake/path, so it will fail
    expect(sakCheck.status).toBe('fail');
    expect(sakCheck.path).toBe('/fake/path/serviceAccountKey.json');
  });

  it('should report Firebase connectivity as pass (mocked)', async () => {
    const result = await pgDoctor();
    const report = JSON.parse(result.content[0].text);
    const fbCheck = report.checks.find(c => c.name === 'Firebase connectivity');

    expect(fbCheck.status).toBe('pass');
    expect(fbCheck.projects).toBe(2);
  });

  it('should report MCP version', async () => {
    const result = await pgDoctor();
    const report = JSON.parse(result.content[0].text);
    const versionCheck = report.checks.find(c => c.name === 'MCP version');

    expect(versionCheck.status).toBe('pass');
    expect(versionCheck.value).toBe('1.13.1');
  });

  it('should report user config as configured', async () => {
    const result = await pgDoctor();
    const report = JSON.parse(result.content[0].text);
    const userCheck = report.checks.find(c => c.name === 'MCP user config');

    expect(userCheck.status).toBe('pass');
    expect(userCheck.user.developerId).toBe('dev_001');
  });

  it('should compute overall status based on check results', async () => {
    const result = await pgDoctor();
    const report = JSON.parse(result.content[0].text);

    // Has at least one fail (serviceAccountKey.json path is fake)
    expect(report.status).toBe('UNHEALTHY');
    expect(report.suggestion).toContain('Fix');
  });
});

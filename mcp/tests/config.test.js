import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase-adapter.js', () => ({
  resolveCredentialsPath: vi.fn(() => '/fake/path/serviceAccountKey.json'),
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

const { pgConfig } = await import('../tools/config.js');

describe('pg_config', () => {
  it('should return full config with action "view"', async () => {
    const result = await pgConfig({ action: 'view' });

    expect(result).toHaveProperty('content');
    const config = JSON.parse(result.content[0].text);

    expect(config).toHaveProperty('version', '1.13.1');
    expect(config).toHaveProperty('firebaseProjectId', 'test-project-id');
    expect(config).toHaveProperty('credentialsPath');
    expect(config).toHaveProperty('userConfigPath');
    expect(config).toHaveProperty('userConfigured', true);
    expect(config).toHaveProperty('env');
  });

  it('should include user info when configured', async () => {
    const result = await pgConfig({ action: 'view' });
    const config = JSON.parse(result.content[0].text);

    expect(config.user).toEqual({
      developerId: 'dev_001',
      name: 'Test User',
      email: 'test@example.com'
    });
  });

  it('should return specific key with action "get"', async () => {
    const result = await pgConfig({ action: 'get', key: 'version' });
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual({ version: '1.13.1' });
  });

  it('should return error for unknown key', async () => {
    const result = await pgConfig({ action: 'get', key: 'nonexistent' });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty('error');
    expect(data.error).toContain('nonexistent');
    expect(data).toHaveProperty('availableKeys');
  });

  it('should include environment variables', async () => {
    const result = await pgConfig({ action: 'view' });
    const config = JSON.parse(result.content[0].text);

    expect(config.env).toHaveProperty('MCP_INSTANCE_DIR');
    expect(config.env).toHaveProperty('GOOGLE_APPLICATION_CREDENTIALS');
    expect(config.env).toHaveProperty('FIREBASE_DATABASE_URL');
    expect(config.env).toHaveProperty('NODE_ENV');
  });
});

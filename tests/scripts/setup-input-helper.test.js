import { describe, it, expect } from 'vitest';

const {
  resolveInputPath,
  buildDefaultMcpUserIdentity,
} = await import('../../scripts/setup-input-helper.cjs');

describe('setup input helper', () => {
  it('should expand tilde paths', () => {
    expect(resolveInputPath('~/keys/serviceAccountKey.json', '/home/tester'))
      .toBe('/home/tester/keys/serviceAccountKey.json');
  });

  it('should keep absolute paths intact', () => {
    expect(resolveInputPath('/tmp/key.json', '/home/tester')).toBe('/tmp/key.json');
  });

  it('should build default MCP user identity with dev_001', () => {
    const identity = buildDefaultMcpUserIdentity({
      developerName: 'Manu',
      developerEmail: 'manu@example.com',
    });
    expect(identity.developerId).toBe('dev_001');
    expect(identity.developerName).toBe('Manu');
    expect(identity.developerEmail).toBe('manu@example.com');
  });
});

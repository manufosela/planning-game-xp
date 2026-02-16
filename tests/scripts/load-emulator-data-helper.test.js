import { describe, it, expect } from 'vitest';
import { resolveRtdbEmulatorConfig } from '../../scripts/emulation/load-emulator-data-helper.js';

describe('load-emulator-data-helper', () => {
  it('should use FIREBASE_DATABASE_EMULATOR_HOST from environment', () => {
    const cfg = resolveRtdbEmulatorConfig({
      FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:19001',
      FIREBASE_EMULATOR_PROJECT_ID: 'demo-test',
    });

    expect(cfg.host).toBe('127.0.0.1:19001');
    expect(cfg.databaseURL).toContain('http://127.0.0.1:19001');
  });

  it('should use defaults when no environment is provided', () => {
    const cfg = resolveRtdbEmulatorConfig({});
    expect(cfg.host).toBe('localhost:9001');
    expect(cfg.projectId).toBe('planning-game-template');
    expect(cfg.namespace).toBe('planning-game-template-tests-rtdb');
  });
});

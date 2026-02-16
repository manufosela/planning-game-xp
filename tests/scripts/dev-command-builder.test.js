import { describe, it, expect } from 'vitest';
import {
  buildDevInnerCommand,
  buildEmulatorsExecCommand,
  shouldUseEmulatorsByDefault
} from '../../scripts/dev-command-builder.js';

describe('dev-command-builder', () => {
  it('should build dev inner command with seed and astro dev', () => {
    const cmd = buildDevInnerCommand({
      envFile: '.env.dev',
      seedFile: 'emulator-data/minimal-rtdb-seed.json'
    });

    expect(cmd).toContain('load-emulator-data.js');
    expect(cmd).toContain('.env.dev');
    expect(cmd).toContain('astro dev --mode dev');
  });

  it('should wrap inner command in firebase emulators:exec', () => {
    const wrapped = buildEmulatorsExecCommand('echo hello');
    expect(wrapped).toContain('firebase emulators:exec');
    expect(wrapped).toContain('echo hello');
    expect(wrapped).toContain('--only firestore,database,storage,ui');
  });

  it('should include --config when config path is provided', () => {
    const wrapped = buildEmulatorsExecCommand('echo hello', { configPath: '/tmp/fb.json' });
    expect(wrapped).toContain('--config "/tmp/fb.json"');
  });

  it('should auto-enable emulators for dev runtime', () => {
    expect(shouldUseEmulatorsByDefault('dev', true, null)).toBe(true);
    expect(shouldUseEmulatorsByDefault('dev', true, 'false')).toBe(false);
    expect(shouldUseEmulatorsByDefault('pre', true, null)).toBe(false);
    expect(shouldUseEmulatorsByDefault('dev', false, null)).toBe(false);
  });
});

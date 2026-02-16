import { describe, it, expect, vi } from 'vitest';
import {
  getEmulatorCleanupCommands,
  cleanupEmulatorPorts,
} from '../../scripts/emulator-port-cleanup.js';

describe('emulator-port-cleanup', () => {
  it('should generate cleanup commands for emulator processes only', () => {
    const commands = getEmulatorCleanupCommands();
    expect(commands.some((c) => c.includes('pkill -f "firebase.*emulators"'))).toBe(true);
    expect(commands.some((c) => c.includes('fuser -k -n tcp'))).toBe(false);
  });

  it('should execute cleanup commands with provided runner', () => {
    const run = vi.fn();
    cleanupEmulatorPorts({ run });

    expect(run).toHaveBeenCalled();
    const calledCommands = run.mock.calls.map(([cmd]) => cmd);
    expect(calledCommands.some((cmd) => cmd.includes('pkill'))).toBe(true);
    expect(calledCommands.some((cmd) => cmd.includes('fuser -k -n tcp'))).toBe(false);
  });
});

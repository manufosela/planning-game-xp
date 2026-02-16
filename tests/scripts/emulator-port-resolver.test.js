import { describe, it, expect } from 'vitest';
import {
  getPreferredEmulatorPorts,
  applyEmulatorPorts,
} from '../../scripts/emulator-port-resolver.js';

describe('emulator-port-resolver', () => {
  it('should read preferred emulator ports from firebase config', () => {
    const config = {
      emulators: {
        firestore: { port: 8080 },
        database: { port: 9001 },
        storage: { port: 9199 },
        ui: { port: 4000 },
      },
    };
    expect(getPreferredEmulatorPorts(config)).toEqual({
      firestore: 8080,
      database: 9001,
      storage: 9199,
      ui: 4000,
    });
  });

  it('should apply resolved ports into a cloned config object', () => {
    const source = {
      emulators: {
        firestore: { port: 8080, rules: 'firestore.rules.dev' },
      },
    };
    const updated = applyEmulatorPorts(source, {
      firestore: 18080,
      database: 19001,
    });

    expect(source.emulators.firestore.port).toBe(8080);
    expect(updated.emulators.firestore.port).toBe(18080);
    expect(updated.emulators.database.port).toBe(19001);
  });
});

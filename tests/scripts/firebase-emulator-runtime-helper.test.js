import { describe, it, expect } from 'vitest';
import {
  parseHostPort,
  resolveFirebaseWebEmulatorRuntime,
} from '../../scripts/firebase-emulator-runtime-helper.js';

describe('firebase-emulator-runtime-helper', () => {
  it('should parse host and port from host:port string', () => {
    expect(parseHostPort('127.0.0.1:19001', 9001)).toEqual({
      host: '127.0.0.1',
      port: 19001,
    });
  });

  it('should fallback to default port when value is invalid', () => {
    expect(parseHostPort('', 9001)).toEqual({
      host: 'localhost',
      port: 9001,
    });
  });

  it('should resolve emulator runtime values from environment', () => {
    const runtime = resolveFirebaseWebEmulatorRuntime({
      FIRESTORE_EMULATOR_HOST: 'localhost:18080',
      FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:19001',
      FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:19199',
    });
    expect(runtime.firestore.port).toBe(18080);
    expect(runtime.database.port).toBe(19001);
    expect(runtime.storage.port).toBe(19199);
  });
});

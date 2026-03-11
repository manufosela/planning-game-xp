/**
 * Tests for the realtime module — conflict detection.
 *
 * Note: onSnapshot subscription tests require Firebase emulators
 * and are covered in integration tests. These unit tests cover
 * the pure conflict detection logic.
 */

import { describe, it, expect } from 'vitest';
import { checkConflict } from '@lib/realtime.js';

// ---------------------------------------------------------------------------
// checkConflict
// ---------------------------------------------------------------------------

describe('checkConflict', () => {
  it('returns false when both timestamps are null', () => {
    expect(checkConflict({ updatedAt: null }, null)).toBe(false);
  });

  it('returns false when local updatedAt is null', () => {
    expect(checkConflict({ updatedAt: null }, { seconds: 1000 })).toBe(false);
  });

  it('returns false when server updatedAt is null', () => {
    expect(checkConflict({ updatedAt: { seconds: 1000 } }, null)).toBe(false);
  });

  it('returns false when server and local are equal', () => {
    const ts = { seconds: 1709000000 };
    expect(checkConflict({ updatedAt: ts }, ts)).toBe(false);
  });

  it('returns true when server is newer than local', () => {
    const local = { updatedAt: { seconds: 1709000000 } };
    const server = { seconds: 1709000100 };
    expect(checkConflict(local, server)).toBe(true);
  });

  it('returns false when local is newer than server', () => {
    const local = { updatedAt: { seconds: 1709000100 } };
    const server = { seconds: 1709000000 };
    expect(checkConflict(local, server)).toBe(false);
  });

  it('returns false when updatedAt property is missing from local card', () => {
    expect(checkConflict({}, { seconds: 1000 })).toBe(false);
  });

  it('handles timestamps with seconds = 0', () => {
    const local = { updatedAt: { seconds: 0 } };
    const server = { seconds: 1 };
    expect(checkConflict(local, server)).toBe(true);
  });
});

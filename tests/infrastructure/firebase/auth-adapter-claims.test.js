/**
 * Tests for FirebaseAuthAdapter custom claims extraction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/auth.js', () => ({
  signInWithGoogle: vi.fn(),
  signInWithMicrosoft: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  getCurrentUser: vi.fn(),
  getIdTokenClaims: vi.fn(),
}));

import { FirebaseAuthAdapter } from '../../../src/infrastructure/firebase/auth-adapter.js';
import * as auth from '../../../src/lib/auth.js';

describe('FirebaseAuthAdapter - custom claims', () => {
  let adapter;

  const mockFirebaseUser = {
    uid: 'u1',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://photo.url',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new FirebaseAuthAdapter();
  });

  describe('getCustomClaims', () => {
    it('returns custom claims from token result', async () => {
      auth.getIdTokenClaims.mockResolvedValue({
        instance: 'geniova',
        instanceRole: 'admin',
        platformAdmin: true,
      });

      const claims = await adapter.getCustomClaims(mockFirebaseUser);

      expect(claims).toEqual({
        instance: 'geniova',
        instanceRole: 'admin',
        platformAdmin: true,
      });
    });

    it('returns empty claims when no custom claims exist', async () => {
      auth.getIdTokenClaims.mockResolvedValue({});

      const claims = await adapter.getCustomClaims(mockFirebaseUser);

      expect(claims).toEqual({
        instance: undefined,
        instanceRole: undefined,
        platformAdmin: undefined,
      });
    });

    it('returns null claims when user is null', async () => {
      const claims = await adapter.getCustomClaims(null);

      expect(claims).toEqual({
        instance: undefined,
        instanceRole: undefined,
        platformAdmin: undefined,
      });
      expect(auth.getIdTokenClaims).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/auth.js', () => ({
  signInWithGoogle: vi.fn(),
  signInWithMicrosoft: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { FirebaseAuthAdapter } from '../../../src/infrastructure/firebase/auth-adapter.js';
import * as auth from '../../../src/lib/auth.js';

describe('FirebaseAuthAdapter', () => {
  let adapter;

  const mockFirebaseUser = {
    uid: 'u1',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://photo.url',
  };

  const expectedAuthUser = {
    uid: 'u1',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://photo.url',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new FirebaseAuthAdapter();
  });

  describe('signInWithGoogle', () => {
    it('returns AuthUser from Google sign-in', async () => {
      auth.signInWithGoogle.mockResolvedValue({ user: mockFirebaseUser });

      const result = await adapter.signInWithGoogle();

      expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
      expect(result).toEqual(expectedAuthUser);
    });

    it('handles user with null fields', async () => {
      auth.signInWithGoogle.mockResolvedValue({
        user: { uid: 'u2', email: null, displayName: null, photoURL: null },
      });

      const result = await adapter.signInWithGoogle();

      expect(result).toEqual({
        uid: 'u2',
        email: '',
        displayName: '',
        photoURL: undefined,
      });
    });

    it('propagates errors', async () => {
      auth.signInWithGoogle.mockRejectedValue(new Error('popup-closed'));
      await expect(adapter.signInWithGoogle()).rejects.toThrow('popup-closed');
    });
  });

  describe('signInWithMicrosoft', () => {
    it('returns AuthUser from Microsoft sign-in', async () => {
      auth.signInWithMicrosoft.mockResolvedValue({ user: mockFirebaseUser });

      const result = await adapter.signInWithMicrosoft();

      expect(auth.signInWithMicrosoft).toHaveBeenCalledOnce();
      expect(result).toEqual(expectedAuthUser);
    });
  });

  describe('signOut', () => {
    it('delegates to auth.signOut', async () => {
      auth.signOut.mockResolvedValue(undefined);

      await adapter.signOut();

      expect(auth.signOut).toHaveBeenCalledOnce();
    });
  });

  describe('onAuthStateChanged', () => {
    it('wraps callback to transform Firebase User to AuthUser', () => {
      const unsubscribe = vi.fn();
      auth.onAuthStateChange.mockReturnValue(unsubscribe);
      const callback = vi.fn();

      const unsub = adapter.onAuthStateChanged(callback);

      expect(auth.onAuthStateChange).toHaveBeenCalledOnce();
      // Simulate auth state change
      const wrappedCallback = auth.onAuthStateChange.mock.calls[0][0];
      wrappedCallback(mockFirebaseUser);

      expect(callback).toHaveBeenCalledWith(expectedAuthUser);
      expect(unsub).toBe(unsubscribe);
    });

    it('passes null when user signs out', () => {
      auth.onAuthStateChange.mockReturnValue(vi.fn());
      const callback = vi.fn();

      adapter.onAuthStateChanged(callback);

      const wrappedCallback = auth.onAuthStateChange.mock.calls[0][0];
      wrappedCallback(null);

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('getCurrentUser', () => {
    it('transforms current Firebase User to AuthUser', () => {
      auth.getCurrentUser.mockReturnValue(mockFirebaseUser);

      const result = adapter.getCurrentUser();

      expect(result).toEqual(expectedAuthUser);
    });

    it('returns null when no user authenticated', () => {
      auth.getCurrentUser.mockReturnValue(null);

      const result = adapter.getCurrentUser();

      expect(result).toBeNull();
    });
  });
});

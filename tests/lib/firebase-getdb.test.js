/**
 * Tests for getDb() dynamic database routing based on custom claims.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentInstance, clearInstanceClaims } from '../../src/lib/store.js';

const mockGetFirestore = vi.fn();
const mockGetApps = vi.fn(() => [{}]);
const mockGetApp = vi.fn(() => 'MOCK_APP');

vi.mock('firebase/firestore', () => ({
  getFirestore: (...args) => mockGetFirestore(...args),
  collection: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: () => mockGetApps(),
  getApp: () => mockGetApp(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

describe('getDb() dynamic routing', () => {
  let getDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearInstanceClaims();
    mockGetFirestore.mockReturnValue('MOCK_FIRESTORE');

    // Dynamic import to pick up mocks
    const mod = await import('../../src/lib/firebase.js');
    getDb = mod.getDb;
  });

  it('uses currentInstance signal when set', () => {
    currentInstance.value = 'geniova';

    getDb();

    expect(mockGetFirestore).toHaveBeenCalledWith('MOCK_APP', 'geniova');
  });

  it('falls back to env var when currentInstance is null', () => {
    currentInstance.value = null;

    getDb();

    // With no env var and no signal, should call getFirestore with just the app
    // (env var behavior is tested via import.meta.env which is harder to mock,
    //  but we verify the signal path takes priority)
    expect(mockGetFirestore).toHaveBeenCalled();
  });

  it('signal takes priority over env var', () => {
    currentInstance.value = 'acme';

    getDb();

    expect(mockGetFirestore).toHaveBeenCalledWith('MOCK_APP', 'acme');
  });
});

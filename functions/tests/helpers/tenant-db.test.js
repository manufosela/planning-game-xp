/**
 * Tests for the tenant-db helper.
 * Verifies: getTenantDb, getTenantDbFromEvent, getPlatformDb.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock firebase-admin
// ---------------------------------------------------------------------------

const mockFirestoreInstance = { collection: vi.fn(), doc: vi.fn() };
const mockGetFirestore = vi.fn().mockReturnValue(mockFirestoreInstance);

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: (...args) => mockGetFirestore(...args),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

// Import after mocks
const { getTenantDb, getTenantDbFromEvent, getPlatformDb } = await import(
  '../../src/helpers/tenant-db.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFirestore.mockReturnValue(mockFirestoreInstance);
});

// ---------------------------------------------------------------------------
// getTenantDb
// ---------------------------------------------------------------------------

describe('getTenantDb', () => {
  it('returns Firestore instance for the tenant database from auth claim', () => {
    const request = { auth: { token: { instance: 'acme-corp' } } };
    getTenantDb(request);

    expect(mockGetFirestore).toHaveBeenCalledWith('acme-corp');
  });

  it('throws when request has no auth', () => {
    expect(() => getTenantDb({})).toThrow(/instance/i);
  });

  it('throws when auth token has no instance claim', () => {
    const request = { auth: { token: {} } };
    expect(() => getTenantDb(request)).toThrow(/instance/i);
  });

  it('throws when auth token is null', () => {
    const request = { auth: { token: null } };
    expect(() => getTenantDb(request)).toThrow(/instance/i);
  });

  it('returns the Firestore instance from getFirestore', () => {
    const tenantDb = { id: 'tenant-db' };
    mockGetFirestore.mockReturnValueOnce(tenantDb);
    const request = { auth: { token: { instance: 'test-tenant' } } };

    const result = getTenantDb(request);

    expect(result).toBe(tenantDb);
  });
});

// ---------------------------------------------------------------------------
// getTenantDbFromEvent
// ---------------------------------------------------------------------------

describe('getTenantDbFromEvent', () => {
  it('returns Firestore for the database specified in event', () => {
    const event = { database: 'acme-corp' };
    getTenantDbFromEvent(event);

    expect(mockGetFirestore).toHaveBeenCalledWith('acme-corp');
  });

  it('returns default Firestore when database is "(default)"', () => {
    const event = { database: '(default)' };
    getTenantDbFromEvent(event);

    expect(mockGetFirestore).toHaveBeenCalledWith();
  });

  it('throws when event has no database field', () => {
    expect(() => getTenantDbFromEvent({})).toThrow(/database/i);
  });

  it('returns the Firestore instance from getFirestore', () => {
    const tenantDb = { id: 'event-db' };
    mockGetFirestore.mockReturnValueOnce(tenantDb);
    const event = { database: 'my-tenant' };

    const result = getTenantDbFromEvent(event);

    expect(result).toBe(tenantDb);
  });
});

// ---------------------------------------------------------------------------
// getPlatformDb
// ---------------------------------------------------------------------------

describe('getPlatformDb', () => {
  it('returns default Firestore instance (no arguments)', () => {
    getPlatformDb();

    expect(mockGetFirestore).toHaveBeenCalledWith();
  });

  it('returns the Firestore instance from getFirestore', () => {
    const platformDb = { id: 'platform-db' };
    mockGetFirestore.mockReturnValueOnce(platformDb);

    const result = getPlatformDb();

    expect(result).toBe(platformDb);
  });
});

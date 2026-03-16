import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateName, isPlatformAdmin, initializeTenantDb, registerInstance } from '../../src/callable/create-instance.js';

// Mock firebase-admin
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
  })),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((opts, handler) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

describe('create-instance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateName', () => {
    it('accepts valid names', () => {
      expect(validateName('geniova').valid).toBe(true);
      expect(validateName('my-org').valid).toBe(true);
      expect(validateName('test123').valid).toBe(true);
    });

    it('rejects empty name', () => {
      expect(validateName('').valid).toBe(false);
      expect(validateName(null).valid).toBe(false);
    });

    it('rejects too short/long', () => {
      expect(validateName('a').valid).toBe(false);
      expect(validateName('a'.repeat(31)).valid).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(validateName('MyOrg').valid).toBe(false);
      expect(validateName('123abc').valid).toBe(false);
      expect(validateName('my org').valid).toBe(false);
    });

    it('rejects reserved names', () => {
      expect(validateName('default').valid).toBe(false);
      expect(validateName('platform').valid).toBe(false);
    });
  });

  describe('isPlatformAdmin', () => {
    it('returns true for platform admins', () => {
      expect(isPlatformAdmin({ auth: { token: { platformAdmin: true } } })).toBe(true);
    });

    it('returns false for non-admins', () => {
      expect(isPlatformAdmin({ auth: { token: {} } })).toBe(false);
      expect(isPlatformAdmin({ auth: null })).toBe(false);
    });
  });

  describe('initializeTenantDb', () => {
    it('creates counters and settings', async () => {
      const committed = [];
      const mockDb = {
        doc: vi.fn((path) => ({ path })),
        batch: vi.fn(() => ({
          set: vi.fn((ref, data) => committed.push({ ref, data })),
          commit: vi.fn(() => Promise.resolve()),
        })),
      };

      await initializeTenantDb(mockDb, 'test-org');

      expect(committed).toHaveLength(2);
      expect(committed[0].ref.path).toBe('counters/_default');
      expect(committed[0].data.task).toBe(0);
      expect(committed[1].ref.path).toBe('settings/general');
      expect(committed[1].data.instanceName).toBe('test-org');
    });
  });

  describe('registerInstance', () => {
    it('creates instance in platform DB', async () => {
      const mockDb = {
        collection: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ empty: true })),
          })),
          add: vi.fn(() => Promise.resolve({ id: 'new-id' })),
        })),
      };

      const id = await registerInstance(mockDb, {
        name: 'test-org',
        ownerEmail: 'admin@test.com',
        ownerUid: 'uid-123',
      });

      expect(id).toBe('new-id');
    });

    it('throws on duplicate name', async () => {
      const mockDb = {
        collection: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ empty: false })),
          })),
        })),
      };

      await expect(
        registerInstance(mockDb, {
          name: 'taken',
          ownerEmail: 'a@b.com',
          ownerUid: 'uid',
        }),
      ).rejects.toThrow('already exists');
    });
  });
});

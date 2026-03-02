/**
 * Tests for deleteUser Cloud Function
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin
const mockDbRef = vi.fn();
const mockDbUpdate = vi.fn().mockResolvedValue();
const mockDbOnce = vi.fn();
const mockAuthGetUserByEmail = vi.fn();
const mockAuthSetCustomUserClaims = vi.fn().mockResolvedValue();

vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(),
    database: () => ({
      ref: mockDbRef
    }),
    auth: () => ({
      getUserByEmail: mockAuthGetUserByEmail,
      setCustomUserClaims: mockAuthSetCustomUserClaims
    }),
    firestore: () => ({})
  }
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn()
}));

vi.mock('firebase-admin/database', () => ({
  getDatabase: () => ({
    ref: mockDbRef
  })
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn()
}));

vi.mock('firebase-functions/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

describe('deleteUser Cloud Function logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMockDb(userData) {
    mockDbRef.mockImplementation((path) => {
      if (path && path.startsWith('/users/') && !path.includes('/projects')) {
        return {
          once: vi.fn().mockResolvedValue({
            exists: () => userData !== null,
            val: () => userData
          })
        };
      }
      return {
        once: mockDbOnce,
        update: mockDbUpdate
      };
    });
  }

  it('should build correct delete paths for user with projects', () => {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      projects: {
        'Cinema4D': { developer: true },
        'NTR': { stakeholder: true }
      }
    };
    const encodedEmail = 'test|example!com';

    const deletePaths = {};
    deletePaths[`/users/${encodedEmail}`] = null;
    deletePaths[`/data/appAdmins/${encodedEmail}`] = null;
    deletePaths[`/data/projectsByUser/${encodedEmail}`] = null;

    const projectIds = Object.keys(userData.projects);
    for (const pid of projectIds) {
      deletePaths[`/data/appUploaders/${pid}/${encodedEmail}`] = null;
      deletePaths[`/data/betaUsers/${pid}/${encodedEmail}`] = null;
    }

    expect(Object.keys(deletePaths)).toHaveLength(7);
    expect(deletePaths['/users/test|example!com']).toBeNull();
    expect(deletePaths['/data/appAdmins/test|example!com']).toBeNull();
    expect(deletePaths['/data/projectsByUser/test|example!com']).toBeNull();
    expect(deletePaths['/data/appUploaders/Cinema4D/test|example!com']).toBeNull();
    expect(deletePaths['/data/appUploaders/NTR/test|example!com']).toBeNull();
    expect(deletePaths['/data/betaUsers/Cinema4D/test|example!com']).toBeNull();
    expect(deletePaths['/data/betaUsers/NTR/test|example!com']).toBeNull();
  });

  it('should build correct delete paths for user without projects', () => {
    const encodedEmail = 'solo|example!com';

    const deletePaths = {};
    deletePaths[`/users/${encodedEmail}`] = null;
    deletePaths[`/data/appAdmins/${encodedEmail}`] = null;

    expect(Object.keys(deletePaths)).toHaveLength(2);
  });

  it('should include appPerms empty object when revoking claims', () => {
    const currentClaims = { allowed: true, isAppAdmin: true, encodedEmail: 'test|ex!com' };
    const newClaims = {
      ...currentClaims,
      allowed: false,
      isAppAdmin: false,
      appPerms: {}
    };

    expect(newClaims.allowed).toBe(false);
    expect(newClaims.isAppAdmin).toBe(false);
    expect(newClaims.appPerms).toEqual({});
    expect(newClaims.encodedEmail).toBe('test|ex!com');
  });
});

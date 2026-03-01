/**
 * Tests for OAuth access request logic.
 *
 * Tests the setEncodedEmailClaim behavior when a user is NOT pre-authorized
 * (should record an access request in /accessRequests/{encodedEmail})
 * and the approveAccessRequest Cloud Function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function encodeEmailForFirebase(email) {
  if (!email) return '';
  return email.replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
}

// ==================== Access Request Recording ====================

describe('setEncodedEmailClaim — access request recording', () => {
  /**
   * Simulates the setEncodedEmailClaim logic for recording access requests.
   * In production mode, when a user is NOT pre-authorized, an access request
   * should be written to /accessRequests/{encodedEmail}.
   */
  async function simulateSetEncodedEmailClaim({ email, displayName, providerData, uid, demoMode, isPreAuthorized, dbWrite }) {
    const encodedEmail = encodeEmailForFirebase(email.toLowerCase());
    const newClaims = { encodedEmail };

    if (demoMode) {
      newClaims.allowed = true;
      newClaims.role = 'demo';
    } else {
      if (isPreAuthorized) {
        newClaims.allowed = true;
      } else {
        // Record access request
        await dbWrite(`/accessRequests/${encodedEmail}`, {
          email,
          name: displayName || '',
          provider: providerData?.[0]?.providerId || 'unknown',
          uid,
          status: 'pending',
          requestedAt: expect.any(String),
        });
      }
    }

    return newClaims;
  }

  it('should record access request when user is NOT pre-authorized', async () => {
    const dbWrite = vi.fn().mockResolvedValue(undefined);

    const claims = await simulateSetEncodedEmailClaim({
      email: 'new.user@company.com',
      displayName: 'New User',
      providerData: [{ providerId: 'microsoft.com' }],
      uid: 'uid-123',
      demoMode: false,
      isPreAuthorized: false,
      dbWrite,
    });

    expect(dbWrite).toHaveBeenCalledTimes(1);
    expect(dbWrite).toHaveBeenCalledWith(
      '/accessRequests/new!user|company!com',
      expect.objectContaining({
        email: 'new.user@company.com',
        name: 'New User',
        provider: 'microsoft.com',
        uid: 'uid-123',
        status: 'pending',
      })
    );
    expect(claims.allowed).toBeUndefined();
  });

  it('should NOT record access request when user IS pre-authorized', async () => {
    const dbWrite = vi.fn().mockResolvedValue(undefined);

    const claims = await simulateSetEncodedEmailClaim({
      email: 'authorized@geniova.com',
      displayName: 'Auth User',
      providerData: [{ providerId: 'microsoft.com' }],
      uid: 'uid-456',
      demoMode: false,
      isPreAuthorized: true,
      dbWrite,
    });

    expect(dbWrite).not.toHaveBeenCalled();
    expect(claims.allowed).toBe(true);
  });

  it('should NOT record access request in DEMO_MODE', async () => {
    const dbWrite = vi.fn().mockResolvedValue(undefined);

    const claims = await simulateSetEncodedEmailClaim({
      email: 'demo@test.com',
      displayName: 'Demo User',
      providerData: [{ providerId: 'google.com' }],
      uid: 'uid-789',
      demoMode: true,
      isPreAuthorized: false,
      dbWrite,
    });

    expect(dbWrite).not.toHaveBeenCalled();
    expect(claims.allowed).toBe(true);
    expect(claims.role).toBe('demo');
  });

  it('should use provider from providerData if available', async () => {
    const dbWrite = vi.fn().mockResolvedValue(undefined);

    await simulateSetEncodedEmailClaim({
      email: 'user@test.com',
      displayName: '',
      providerData: [{ providerId: 'google.com' }],
      uid: 'uid-goo',
      demoMode: false,
      isPreAuthorized: false,
      dbWrite,
    });

    expect(dbWrite).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ provider: 'google.com' })
    );
  });

  it('should use "unknown" provider when providerData is empty', async () => {
    const dbWrite = vi.fn().mockResolvedValue(undefined);

    await simulateSetEncodedEmailClaim({
      email: 'user@test.com',
      displayName: '',
      providerData: [],
      uid: 'uid-noprov',
      demoMode: false,
      isPreAuthorized: false,
      dbWrite,
    });

    expect(dbWrite).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ provider: 'unknown' })
    );
  });
});

// ==================== approveAccessRequest ====================

describe('approveAccessRequest', () => {
  let mockDb;
  let mockAuth;
  let requestData;

  beforeEach(() => {
    requestData = {
      email: 'new.user@company.com',
      name: 'New User',
      provider: 'microsoft.com',
      uid: 'uid-123',
      status: 'pending',
      requestedAt: '2026-03-01T10:00:00Z',
    };

    mockDb = {
      read: vi.fn().mockResolvedValue(requestData),
      write: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    mockAuth = {
      getUserByEmail: vi.fn().mockResolvedValue({
        uid: 'uid-123',
        customClaims: { encodedEmail: 'new!user|company!com' },
      }),
      setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    };
  });

  /**
   * Simulates the approveAccessRequest Cloud Function logic.
   */
  async function simulateApproveAccessRequest({ encodedEmail, action, callerIsAdmin, db, auth }) {
    if (!callerIsAdmin) {
      throw new Error('Only AppAdmin users can manage access requests.');
    }

    if (!encodedEmail || !['approve', 'reject'].includes(action)) {
      throw new Error('Missing or invalid encodedEmail / action.');
    }

    const accessRequest = await db.read(`/accessRequests/${encodedEmail}`);
    if (!accessRequest) {
      throw new Error('Access request not found.');
    }

    if (action === 'approve') {
      // Create user record
      await db.write(`/users/${encodedEmail}`, {
        name: accessRequest.name || accessRequest.email,
        email: accessRequest.email,
        projects: {},
      });

      // Set allowed claim
      const userRecord = await auth.getUserByEmail(accessRequest.email);
      const currentClaims = userRecord.customClaims || {};
      await auth.setCustomUserClaims(userRecord.uid, {
        ...currentClaims,
        allowed: true,
      });

      // Remove access request
      await db.remove(`/accessRequests/${encodedEmail}`);

      return { success: true, action: 'approved', email: accessRequest.email };
    }

    if (action === 'reject') {
      await db.update(`/accessRequests/${encodedEmail}`, { status: 'rejected' });
      return { success: true, action: 'rejected', email: accessRequest.email };
    }
  }

  it('should approve: create user, set claims, remove request', async () => {
    const result = await simulateApproveAccessRequest({
      encodedEmail: 'new!user|company!com',
      action: 'approve',
      callerIsAdmin: true,
      db: mockDb,
      auth: mockAuth,
    });

    expect(result).toEqual({
      success: true,
      action: 'approved',
      email: 'new.user@company.com',
    });

    // Verify user record created
    expect(mockDb.write).toHaveBeenCalledWith(
      '/users/new!user|company!com',
      expect.objectContaining({
        name: 'New User',
        email: 'new.user@company.com',
        projects: {},
      })
    );

    // Verify allowed claim set
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(
      'uid-123',
      expect.objectContaining({ allowed: true })
    );

    // Verify access request removed
    expect(mockDb.remove).toHaveBeenCalledWith('/accessRequests/new!user|company!com');
  });

  it('should reject: mark status as rejected', async () => {
    const result = await simulateApproveAccessRequest({
      encodedEmail: 'new!user|company!com',
      action: 'reject',
      callerIsAdmin: true,
      db: mockDb,
      auth: mockAuth,
    });

    expect(result).toEqual({
      success: true,
      action: 'rejected',
      email: 'new.user@company.com',
    });

    expect(mockDb.update).toHaveBeenCalledWith(
      '/accessRequests/new!user|company!com',
      { status: 'rejected' }
    );

    // Should NOT create user or set claims
    expect(mockDb.write).not.toHaveBeenCalled();
    expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('should fail if caller is not AppAdmin', async () => {
    await expect(
      simulateApproveAccessRequest({
        encodedEmail: 'new!user|company!com',
        action: 'approve',
        callerIsAdmin: false,
        db: mockDb,
        auth: mockAuth,
      })
    ).rejects.toThrow('Only AppAdmin users can manage access requests.');
  });

  it('should fail if access request not found', async () => {
    mockDb.read.mockResolvedValue(null);

    await expect(
      simulateApproveAccessRequest({
        encodedEmail: 'nonexistent|email!com',
        action: 'approve',
        callerIsAdmin: true,
        db: mockDb,
        auth: mockAuth,
      })
    ).rejects.toThrow('Access request not found.');
  });

  it('should fail with invalid action', async () => {
    await expect(
      simulateApproveAccessRequest({
        encodedEmail: 'new!user|company!com',
        action: 'invalid',
        callerIsAdmin: true,
        db: mockDb,
        auth: mockAuth,
      })
    ).rejects.toThrow('Missing or invalid encodedEmail / action.');
  });

  it('should preserve existing claims when approving', async () => {
    mockAuth.getUserByEmail.mockResolvedValue({
      uid: 'uid-123',
      customClaims: { encodedEmail: 'new!user|company!com', customField: 'keep' },
    });

    await simulateApproveAccessRequest({
      encodedEmail: 'new!user|company!com',
      action: 'approve',
      callerIsAdmin: true,
      db: mockDb,
      auth: mockAuth,
    });

    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(
      'uid-123',
      expect.objectContaining({
        encodedEmail: 'new!user|company!com',
        customField: 'keep',
        allowed: true,
      })
    );
  });
});

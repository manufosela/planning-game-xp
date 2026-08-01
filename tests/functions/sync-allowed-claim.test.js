/**
 * Regression tests for PLN-BUG-0111 — app admins must always have
 * `allowed=true` custom claim even when they have no active projects yet.
 * This unblocks SuperAdmins in freshly bootstrapped instances (they need to
 * read /projects to be able to create the first one).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  handleSyncUserAllowedClaim,
  handleSyncAppAdminClaim
} = require('../../functions/handlers/admin-permissions.js');

function buildDeps({ userClaims = {}, projects = null, userExists = true } = {}) {
  const setCustomUserClaims = vi.fn().mockResolvedValue();
  const getUserByEmail = vi.fn().mockImplementation(async () => {
    if (!userExists) {
      const err = new Error('not found');
      err.code = 'auth/user-not-found';
      throw err;
    }
    return { uid: 'uid-1', customClaims: userClaims };
  });
  const dbOnce = vi.fn().mockResolvedValue({ val: () => projects });

  return {
    setCustomUserClaims,
    admin: {
      auth: () => ({ setCustomUserClaims, getUserByEmail })
    },
    db: {
      ref: () => ({ once: dbOnce })
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
}

describe('handleSyncUserAllowedClaim — appAdmin bypass (PLN-BUG-0111)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets allowed=true for an appAdmin with NO projects', async () => {
    const deps = buildDeps({
      userClaims: { isAppAdmin: true },
      projects: null
    });
    await handleSyncUserAllowedClaim({ encodedEmail: 'foo@bar_com' }, null, null, deps);
    expect(deps.setCustomUserClaims).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      isAppAdmin: true,
      allowed: true
    }));
  });

  it('sets allowed=true for a regular user WITH an active project', async () => {
    const deps = buildDeps({
      userClaims: {},
      projects: { P1: { developer: true } }
    });
    await handleSyncUserAllowedClaim({ encodedEmail: 'foo@bar_com' }, null, null, deps);
    expect(deps.setCustomUserClaims).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      allowed: true
    }));
  });

  it('sets allowed=false for a regular user with no projects and no appAdmin', async () => {
    const deps = buildDeps({
      userClaims: {},
      projects: null
    });
    await handleSyncUserAllowedClaim({ encodedEmail: 'foo@bar_com' }, null, null, deps);
    // Only writes when it changes. Current claim is undefined, target is false.
    // undefined !== false → writes.
    expect(deps.setCustomUserClaims).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      allowed: false
    }));
  });

  it('no-op when nothing changes (claim already correct)', async () => {
    const deps = buildDeps({
      userClaims: { isAppAdmin: true, allowed: true },
      projects: null
    });
    await handleSyncUserAllowedClaim({ encodedEmail: 'foo@bar_com' }, null, null, deps);
    expect(deps.setCustomUserClaims).not.toHaveBeenCalled();
  });
});

describe('handleSyncAppAdminClaim — grants allowed on admin promotion (PLN-BUG-0111)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets allowed=true when a user is promoted to appAdmin', async () => {
    const deps = buildDeps({ userClaims: {} });
    await handleSyncAppAdminClaim(
      { encodedEmail: 'foo@bar_com' },
      false,   // wasAppAdmin
      true,    // shouldBeAppAdmin
      deps
    );
    expect(deps.setCustomUserClaims).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      isAppAdmin: true,
      allowed: true
    }));
  });

  it('does NOT force allowed on demotion (allowed follows the user-project sync path)', async () => {
    const deps = buildDeps({ userClaims: { isAppAdmin: true, allowed: true } });
    await handleSyncAppAdminClaim(
      { encodedEmail: 'foo@bar_com' },
      true,    // wasAppAdmin
      false,   // shouldBeAppAdmin
      deps
    );
    const writtenClaims = deps.setCustomUserClaims.mock.calls[0][1];
    expect(writtenClaims.isAppAdmin).toBe(false);
    // allowed keeps its previous value (true) — the user-project sync trigger
    // will re-evaluate it when relevant.
    expect(writtenClaims.allowed).toBe(true);
  });
});

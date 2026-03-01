/**
 * Tests for onAuthUserCreated auto-provision logic.
 *
 * Tests the normalizeGmailEmail, isEmailPreAuthorized, hasActiveProject,
 * and generateNextId helpers, plus the setEncodedEmailClaim trigger behavior.
 *
 * isEmailPreAuthorized now reads from /users/{encodedEmail}/projects
 * instead of /data/allowedUsers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== normalizeGmailEmail tests ====================

describe('normalizeGmailEmail', () => {
  function normalizeGmailEmail(email) {
    if (!email) return '';
    const lower = email.trim().toLowerCase();
    const [localPart, domain] = lower.split('@');
    if (!domain) return lower;
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return localPart.replace(/\./g, '') + '@' + domain;
    }
    return lower;
  }

  it('should remove dots from Gmail local part', () => {
    expect(normalizeGmailEmail('jorge.casar@gmail.com')).toBe('jorgecasar@gmail.com');
  });

  it('should remove multiple dots from Gmail', () => {
    expect(normalizeGmailEmail('j.o.r.g.e@gmail.com')).toBe('jorge@gmail.com');
  });

  it('should handle googlemail.com domain', () => {
    expect(normalizeGmailEmail('user.name@googlemail.com')).toBe('username@googlemail.com');
  });

  it('should NOT remove dots from non-Gmail domains', () => {
    expect(normalizeGmailEmail('jorge.casar@geniova.com')).toBe('jorge.casar@geniova.com');
  });

  it('should lowercase the email', () => {
    expect(normalizeGmailEmail('Jorge.Casar@Gmail.com')).toBe('jorgecasar@gmail.com');
  });

  it('should handle empty string', () => {
    expect(normalizeGmailEmail('')).toBe('');
  });

  it('should handle null/undefined', () => {
    expect(normalizeGmailEmail(null)).toBe('');
    expect(normalizeGmailEmail(undefined)).toBe('');
  });

  it('should trim whitespace', () => {
    expect(normalizeGmailEmail(' user@gmail.com ')).toBe('user@gmail.com');
  });

  it('should handle email without domain', () => {
    expect(normalizeGmailEmail('nodomain')).toBe('nodomain');
  });

  it('should handle Gmail without dots (no-op)', () => {
    expect(normalizeGmailEmail('jorgecasar@gmail.com')).toBe('jorgecasar@gmail.com');
  });
});

// ==================== encodeEmailForFirebase tests ====================

describe('encodeEmailForFirebase', () => {
  function encodeEmailForFirebase(email) {
    if (!email) return '';
    return email.replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
  }

  it('should encode @ as |', () => {
    expect(encodeEmailForFirebase('user@gmail.com')).toBe('user|gmail!com');
  });

  it('should encode . as !', () => {
    expect(encodeEmailForFirebase('jorge.casar@geniova.com')).toBe('jorge!casar|geniova!com');
  });

  it('should encode # as -', () => {
    expect(encodeEmailForFirebase('user#ext#@domain.com')).toBe('user-ext-|domain!com');
  });

  it('should handle empty string', () => {
    expect(encodeEmailForFirebase('')).toBe('');
  });
});

// ==================== hasActiveProject tests ====================

describe('hasActiveProject', () => {
  function hasActiveProject(projects) {
    if (!projects || typeof projects !== 'object') return false;
    return Object.values(projects).some(p => p.developer === true || p.stakeholder === true);
  }

  it('should return true when user is developer in at least one project', () => {
    expect(hasActiveProject({
      PlanningGame: { developer: true, stakeholder: false }
    })).toBe(true);
  });

  it('should return true when user is stakeholder in at least one project', () => {
    expect(hasActiveProject({
      Cinema4D: { developer: false, stakeholder: true }
    })).toBe(true);
  });

  it('should return true when user has both roles', () => {
    expect(hasActiveProject({
      PlanningGame: { developer: true, stakeholder: true }
    })).toBe(true);
  });

  it('should return false when all roles are false', () => {
    expect(hasActiveProject({
      PlanningGame: { developer: false, stakeholder: false }
    })).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(hasActiveProject(null)).toBe(false);
    expect(hasActiveProject(undefined)).toBe(false);
  });

  it('should return false for empty projects', () => {
    expect(hasActiveProject({})).toBe(false);
  });

  it('should return true if any project has an active role among multiple', () => {
    expect(hasActiveProject({
      PlanningGame: { developer: false, stakeholder: false },
      Cinema4D: { developer: true, stakeholder: false }
    })).toBe(true);
  });
});

// ==================== Auto-provision logic tests (reads /users/) ====================

describe('setEncodedEmailClaim auto-provision', () => {
  function encodeEmailForFirebase(email) {
    if (!email) return '';
    return email.replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
  }

  function normalizeGmailEmail(email) {
    if (!email) return '';
    const lower = email.trim().toLowerCase();
    const [localPart, domain] = lower.split('@');
    if (!domain) return lower;
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return localPart.replace(/\./g, '') + '@' + domain;
    }
    return lower;
  }

  function hasActiveProject(projects) {
    if (!projects || typeof projects !== 'object') return false;
    return Object.values(projects).some(p => p.developer === true || p.stakeholder === true);
  }

  async function isEmailPreAuthorized(email, dbRef) {
    const normalizedEmail = email.trim().toLowerCase();
    const encodedExact = encodeEmailForFirebase(normalizedEmail);

    const exactVal = await dbRef(`/users/${encodedExact}/projects`);
    if (hasActiveProject(exactVal)) return true;

    const gmailNormalized = normalizeGmailEmail(normalizedEmail);
    if (gmailNormalized !== normalizedEmail) {
      const encodedNormalized = encodeEmailForFirebase(gmailNormalized);
      const normalizedVal = await dbRef(`/users/${encodedNormalized}/projects`);
      if (hasActiveProject(normalizedVal)) return true;
    }

    return false;
  }

  it('should find exact email match in /users/', async () => {
    const dbLookup = vi.fn()
      .mockResolvedValueOnce({ PlanningGame: { developer: true, stakeholder: false } });

    const result = await isEmailPreAuthorized('user@geniova.com', dbLookup);
    expect(result).toBe(true);
    expect(dbLookup).toHaveBeenCalledWith('/users/user|geniova!com/projects');
  });

  it('should find Gmail-normalized match in /users/', async () => {
    const dbLookup = vi.fn()
      .mockResolvedValueOnce(null)  // exact match NOT found
      .mockResolvedValueOnce({ PlanningGame: { developer: true, stakeholder: false } });

    const result = await isEmailPreAuthorized('jorge.casar@gmail.com', dbLookup);
    expect(result).toBe(true);
    expect(dbLookup).toHaveBeenCalledWith('/users/jorge!casar|gmail!com/projects');
    expect(dbLookup).toHaveBeenCalledWith('/users/jorgecasar|gmail!com/projects');
  });

  it('should return false for non-authorized email', async () => {
    const dbLookup = vi.fn().mockResolvedValue(null);

    const result = await isEmailPreAuthorized('unknown@domain.com', dbLookup);
    expect(result).toBe(false);
  });

  it('should return false when user exists but has no active projects', async () => {
    const dbLookup = vi.fn()
      .mockResolvedValueOnce({ PlanningGame: { developer: false, stakeholder: false } });

    const result = await isEmailPreAuthorized('user@geniova.com', dbLookup);
    expect(result).toBe(false);
  });

  it('should not try Gmail normalization for non-Gmail domains', async () => {
    const dbLookup = vi.fn().mockResolvedValueOnce(null);

    const result = await isEmailPreAuthorized('user@company.com', dbLookup);
    expect(result).toBe(false);
    expect(dbLookup).toHaveBeenCalledTimes(1);
  });

  it('should set allowed=true in claims when email is pre-authorized', () => {
    const currentClaims = { encodedEmail: 'old' };
    const isAllowed = true;
    const encodedEmail = 'user|geniova!com';

    const newClaims = { ...currentClaims, encodedEmail };
    if (isAllowed) newClaims.allowed = true;

    expect(newClaims).toEqual({
      encodedEmail: 'user|geniova!com',
      allowed: true,
    });
  });

  it('should NOT set allowed claim when email is NOT pre-authorized', () => {
    const currentClaims = {};
    const isAllowed = false;
    const encodedEmail = 'unknown|domain!com';

    const newClaims = { ...currentClaims, encodedEmail };
    if (isAllowed) newClaims.allowed = true;

    expect(newClaims).toEqual({ encodedEmail: 'unknown|domain!com' });
    expect(newClaims.allowed).toBeUndefined();
  });

  it('should be idempotent for already-allowed users', () => {
    const currentClaims = { encodedEmail: 'user|geniova!com', allowed: true };
    const isAllowed = true;
    const encodedEmail = 'user|geniova!com';

    const newClaims = { ...currentClaims, encodedEmail };
    if (isAllowed) newClaims.allowed = true;

    expect(newClaims).toEqual({
      encodedEmail: 'user|geniova!com',
      allowed: true,
    });
  });
});

// ==================== generateNextId tests ====================

describe('generateNextId', () => {
  async function generateNextId(prefix, field, usersData) {
    let maxNum = 0;
    for (const userData of Object.values(usersData)) {
      const id = userData[field];
      if (id && id.startsWith(prefix)) {
        const num = parseInt(id.replace(prefix, ''), 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  }

  it('should generate dev_001 when no developers exist', async () => {
    const result = await generateNextId('dev_', 'developerId', {});
    expect(result).toBe('dev_001');
  });

  it('should generate next sequential ID', async () => {
    const users = {
      'user1': { developerId: 'dev_001' },
      'user2': { developerId: 'dev_005' },
      'user3': { developerId: 'dev_003' },
    };
    const result = await generateNextId('dev_', 'developerId', users);
    expect(result).toBe('dev_006');
  });

  it('should generate stk_001 when no stakeholders exist', async () => {
    const result = await generateNextId('stk_', 'stakeholderId', {});
    expect(result).toBe('stk_001');
  });

  it('should handle users without the field (skip them)', async () => {
    const users = {
      'user1': { developerId: 'dev_003' },
      'user2': { name: 'No dev ID' },
      'user3': { developerId: 'dev_001' },
    };
    const result = await generateNextId('dev_', 'developerId', users);
    expect(result).toBe('dev_004');
  });

  it('should zero-pad IDs to 3 digits', async () => {
    const users = { 'u': { stakeholderId: 'stk_009' } };
    const result = await generateNextId('stk_', 'stakeholderId', users);
    expect(result).toBe('stk_010');
  });
});

// ==================== DEMO_MODE claim logic tests ====================

describe('DEMO_MODE claim logic', () => {
  function encodeEmailForFirebase(email) {
    if (!email) return '';
    return email.replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
  }

  function buildClaimsForDemo(email, currentClaims = {}) {
    const encodedEmail = encodeEmailForFirebase(email.toLowerCase());
    return {
      ...currentClaims,
      encodedEmail,
      allowed: true,
      role: 'demo',
    };
  }

  function buildClaimsForProduction(email, currentClaims = {}, isAllowed = false) {
    const encodedEmail = encodeEmailForFirebase(email.toLowerCase());
    const newClaims = { ...currentClaims, encodedEmail };
    if (isAllowed) newClaims.allowed = true;
    return newClaims;
  }

  it('should set allowed=true and role=demo in demo mode', () => {
    const claims = buildClaimsForDemo('user@example.com');
    expect(claims.allowed).toBe(true);
    expect(claims.role).toBe('demo');
    expect(claims.encodedEmail).toBe('user|example!com');
  });

  it('should auto-allow any email in demo mode', () => {
    const claims = buildClaimsForDemo('random@unknown-domain.org');
    expect(claims.allowed).toBe(true);
    expect(claims.role).toBe('demo');
  });

  it('should preserve existing claims in demo mode', () => {
    const existing = { someCustom: 'value' };
    const claims = buildClaimsForDemo('user@test.com', existing);
    expect(claims.someCustom).toBe('value');
    expect(claims.allowed).toBe(true);
    expect(claims.role).toBe('demo');
  });

  it('should NOT set role=demo in production mode', () => {
    const claims = buildClaimsForProduction('user@geniova.com', {}, true);
    expect(claims.allowed).toBe(true);
    expect(claims.role).toBeUndefined();
  });

  it('should NOT set allowed in production mode when not pre-authorized', () => {
    const claims = buildClaimsForProduction('user@unknown.com', {}, false);
    expect(claims.allowed).toBeUndefined();
    expect(claims.role).toBeUndefined();
  });
});

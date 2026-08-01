/**
 * Tests for the beforeUserCreated blocking function handler.
 * Guards the domain filter that restricts sign-ups per instance
 * (PUBLIC_ALLOWED_EMAIL_DOMAINS in functions/.env).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  handleBeforeUserCreated,
  parseAllowedDomains,
  extractDomain
} = require('../../functions/handlers/before-user-created.js');

class FakeHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function buildDeps({ allowedDomainsRaw = '', allowedUser = false, appAdmin = false, rtdbThrows = false } = {}) {
  const onceMock = vi.fn().mockImplementation(function () {
    if (rtdbThrows) return Promise.reject(new Error('rtdb down'));
    const path = this.__path;
    if (path.startsWith('/data/allowedUsers/')) return Promise.resolve({ val: () => (allowedUser ? true : null) });
    if (path.startsWith('/data/appAdmins/'))  return Promise.resolve({ val: () => (appAdmin ? true : null) });
    return Promise.resolve({ val: () => null });
  });
  const ref = (path) => {
    const node = { __path: path };
    node.once = onceMock.bind(node);
    return node;
  };
  return {
    allowedDomainsRaw,
    db: { ref },
    HttpsError: FakeHttpsError,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    _onceMock: onceMock
  };
}

describe('parseAllowedDomains', () => {
  it('returns [] for empty / undefined', () => {
    expect(parseAllowedDomains('')).toEqual([]);
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains(null)).toEqual([]);
  });
  it('splits comma list, lowercases, trims, dedupes', () => {
    expect(parseAllowedDomains(' Tribbuapp.com , acme.io ,tribbuapp.com,'))
      .toEqual(['tribbuapp.com', 'acme.io']);
  });
});

describe('extractDomain', () => {
  it('returns lowercased domain', () => {
    expect(extractDomain('Foo@Tribbuapp.COM')).toBe('tribbuapp.com');
  });
  it('returns null on invalid input', () => {
    expect(extractDomain('')).toBe(null);
    expect(extractDomain('nope')).toBe(null);
    expect(extractDomain('missing@')).toBe(null);
    expect(extractDomain(null)).toBe(null);
  });
});

describe('handleBeforeUserCreated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows any email when no allowlist configured (backwards compat)', async () => {
    const deps = buildDeps({ allowedDomainsRaw: '' });
    await expect(
      handleBeforeUserCreated({ data: { email: 'random@stranger.com' } }, deps)
    ).resolves.toBeUndefined();
  });

  it('allows an email whose domain is in the allowlist', async () => {
    const deps = buildDeps({ allowedDomainsRaw: 'tribbuapp.com' });
    await expect(
      handleBeforeUserCreated({ data: { email: 'manu@tribbuapp.com' } }, deps)
    ).resolves.toBeUndefined();
  });

  it('rejects an email whose domain is NOT in the allowlist', async () => {
    const deps = buildDeps({ allowedDomainsRaw: 'tribbuapp.com' });
    await expect(
      handleBeforeUserCreated({ data: { email: 'attacker@evil.com' } }, deps)
    ).rejects.toThrow(/tribbuapp\.com/);
  });

  it('allows a domain mismatch when the email is pre-authorized in /allowedUsers', async () => {
    const deps = buildDeps({
      allowedDomainsRaw: 'tribbuapp.com',
      allowedUser: true
    });
    await expect(
      handleBeforeUserCreated({ data: { email: 'external@partner.com' } }, deps)
    ).resolves.toBeUndefined();
  });

  it('allows a domain mismatch when the email is in /appAdmins', async () => {
    const deps = buildDeps({
      allowedDomainsRaw: 'tribbuapp.com',
      appAdmin: true
    });
    await expect(
      handleBeforeUserCreated({ data: { email: 'ops@vendor.com' } }, deps)
    ).resolves.toBeUndefined();
  });

  it('fails closed when the RTDB pre-auth lookup throws', async () => {
    const deps = buildDeps({
      allowedDomainsRaw: 'tribbuapp.com',
      rtdbThrows: true
    });
    await expect(
      handleBeforeUserCreated({ data: { email: 'external@partner.com' } }, deps)
    ).rejects.toThrow(/permission-denied|tribbuapp/);
  });

  it('rejects when the event has no email', async () => {
    const deps = buildDeps({ allowedDomainsRaw: 'tribbuapp.com' });
    await expect(
      handleBeforeUserCreated({ data: {} }, deps)
    ).rejects.toThrow(/email/i);
  });

  it('is case-insensitive on domain comparison', async () => {
    const deps = buildDeps({ allowedDomainsRaw: 'TribbuApp.com' });
    await expect(
      handleBeforeUserCreated({ data: { email: 'foo@TRIBBUAPP.COM' } }, deps)
    ).resolves.toBeUndefined();
  });

  it('supports multiple allowed domains', async () => {
    const deps = buildDeps({ allowedDomainsRaw: 'acme.io, acme.com' });
    await expect(
      handleBeforeUserCreated({ data: { email: 'a@acme.io' } }, deps)
    ).resolves.toBeUndefined();
    await expect(
      handleBeforeUserCreated({ data: { email: 'b@acme.com' } }, deps)
    ).resolves.toBeUndefined();
    await expect(
      handleBeforeUserCreated({ data: { email: 'c@notacme.com' } }, deps)
    ).rejects.toThrow();
  });
});

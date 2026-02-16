import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('APP_CONSTANTS.AUTH_ALLOWED_EMAIL_DOMAINS', () => {
  beforeEach(() => {
    delete window.allowedEmailDomains;
    vi.resetModules();
  });

  it('should parse comma-separated string domains', async () => {
    window.allowedEmailDomains = 'a.com, b.com ,, c.com';
    const { APP_CONSTANTS } = await import('../../public/js/constants/app-constants.js');
    expect(APP_CONSTANTS.AUTH_ALLOWED_EMAIL_DOMAINS).toEqual(['a.com', 'b.com', 'c.com']);
  });

  it('should accept array domains without throwing', async () => {
    window.allowedEmailDomains = ['a.com', 'b.com', ''];
    const { APP_CONSTANTS } = await import('../../public/js/constants/app-constants.js');
    expect(APP_CONSTANTS.AUTH_ALLOWED_EMAIL_DOMAINS).toEqual(['a.com', 'b.com']);
  });

  it('should return empty list when value is invalid type', async () => {
    window.allowedEmailDomains = { domain: 'a.com' };
    const { APP_CONSTANTS } = await import('../../public/js/constants/app-constants.js');
    expect(APP_CONSTANTS.AUTH_ALLOWED_EMAIL_DOMAINS).toEqual([]);
  });
});

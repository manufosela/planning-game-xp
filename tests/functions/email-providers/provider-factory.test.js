import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('email provider factory', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.MS_CLIENT_ID;
    const { resetEmailProviderForTests } = require('../../../functions/email-providers/provider-factory.js');
    resetEmailProviderForTests();
  });

  it('should default to none provider when EMAIL_PROVIDER is missing', async () => {
    const { getEmailProvider } = require('../../../functions/email-providers/provider-factory.js');
    const provider = getEmailProvider();
    expect(provider.providerName).toBe('none');
  });

  it('should fallback to msgraph for backward compatibility when MS_CLIENT_ID exists', async () => {
    process.env.MS_CLIENT_ID = 'legacy-client-id';
    const { getEmailProvider } = require('../../../functions/email-providers/provider-factory.js');
    const provider = getEmailProvider();
    expect(provider.providerName).toBe('msgraph');
  });

  it('should throw for invalid provider', async () => {
    process.env.EMAIL_PROVIDER = 'invalid-provider';
    const { getEmailProvider } = require('../../../functions/email-providers/provider-factory.js');
    expect(() => getEmailProvider()).toThrow();
  });
});

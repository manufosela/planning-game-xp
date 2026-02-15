import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MsGraphEmailProvider } = require('../../../functions/email-providers/msgraph-provider.js');

describe('MsGraphEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FUNCTIONS_EMULATOR;
  });

  it('should block send in emulator', async () => {
    const mockPost = vi.fn();
    process.env.FUNCTIONS_EMULATOR = 'true';
    const provider = new MsGraphEmailProvider({
      clientId: 'id',
      clientSecret: 'secret',
      tenantId: 'tenant',
      fromEmail: 'noreply@example.com',
      alertEmail: 'it@example.com',
      msalClientFactory: () => ({ acquireTokenByClientCredential: vi.fn() }),
      httpPost: mockPost
    });

    const result = await provider.sendEmail(['a@b.com'], 'Subject', '<p>Body</p>');
    expect(result).toEqual({ ok: true, skipped: true, provider: 'msgraph', reason: 'emulator' });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should send with graph when config is valid', async () => {
    const acquireTokenByClientCredential = vi.fn().mockResolvedValue({ accessToken: 'token-1' });
    const mockPost = vi.fn().mockResolvedValue({ status: 202 });

    const provider = new MsGraphEmailProvider({
      clientId: 'id',
      clientSecret: 'secret',
      tenantId: 'tenant',
      fromEmail: 'noreply@example.com',
      alertEmail: 'it@example.com',
      msalClientFactory: () => ({ acquireTokenByClientCredential }),
      httpPost: mockPost
    });

    await provider.sendEmail(['a@b.com'], 'Subject', '<p>Body</p>');
    expect(acquireTokenByClientCredential).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
const { NoneEmailProvider } = require('../../../functions/email-providers/none-provider.js');

describe('NoneEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only log metadata and return ok', async () => {
    const provider = new NoneEmailProvider();
    const result = await provider.sendEmail(['user@example.com'], 'Subject', '<p>Body</p>');
    expect(result).toEqual({ ok: true, skipped: true, provider: 'none' });
  });
});

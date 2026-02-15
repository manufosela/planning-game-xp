import { describe, it, expect } from 'vitest';

const { BaseEmailProvider } = require('../../../functions/email-providers/base-provider.js');

describe('BaseEmailProvider', () => {
  it('should expose default health check', async () => {
    const provider = new BaseEmailProvider({});
    const result = await provider.healthCheck();
    expect(result).toEqual({ ok: false, provider: 'base' });
  });

  it('should throw when sendEmail is not implemented', async () => {
    const provider = new BaseEmailProvider({});
    await expect(provider.sendEmail(['a@b.com'], 'sub', '<p>x</p>')).rejects.toThrow();
  });
});

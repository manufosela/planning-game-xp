import { describe, it, expect, vi, beforeEach } from 'vitest';

const { SmtpEmailProvider } = require('../../../functions/email-providers/smtp-provider.js');

describe('SmtpEmailProvider', () => {
  const verify = vi.fn().mockResolvedValue(true);
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const nodemailer = {
    createTransport: vi.fn(() => ({ verify, sendMail }))
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should verify transporter in health check', async () => {
    const provider = new SmtpEmailProvider({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user',
      pass: 'pass',
      fromEmail: 'noreply@example.com',
      nodemailer
    });
    const result = await provider.healthCheck();
    expect(result.ok).toBe(true);
    expect(verify).toHaveBeenCalled();
  });

  it('should send email with nodemailer', async () => {
    const provider = new SmtpEmailProvider({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user',
      pass: 'pass',
      fromEmail: 'noreply@example.com',
      nodemailer
    });
    await provider.sendEmail(['a@b.com'], 'Hi', '<p>Body</p>');
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'noreply@example.com',
      to: ['a@b.com'],
      subject: 'Hi',
      html: '<p>Body</p>'
    }));
  });
});

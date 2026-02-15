import { describe, it, expect, vi, beforeEach } from 'vitest';

const { SendGridEmailProvider } = require('../../../functions/email-providers/sendgrid-provider.js');

describe('SendGridEmailProvider', () => {
  const setApiKey = vi.fn();
  const send = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
  const sgMail = { setApiKey, send };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set api key on init', () => {
    new SendGridEmailProvider({
      apiKey: 'SG.key',
      fromEmail: 'noreply@example.com',
      fromName: 'Planning Game XP',
      sgMail
    });
    expect(setApiKey).toHaveBeenCalledWith('SG.key');
  });

  it('should send email with sendgrid', async () => {
    const provider = new SendGridEmailProvider({
      apiKey: 'SG.key',
      fromEmail: 'noreply@example.com',
      fromName: 'Planning Game XP',
      sgMail
    });
    await provider.sendEmail(['a@b.com'], 'Hi', '<p>Body</p>');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['a@b.com'],
      from: { email: 'noreply@example.com', name: 'Planning Game XP' },
      subject: 'Hi',
      html: '<p>Body</p>'
    }));
  });
});

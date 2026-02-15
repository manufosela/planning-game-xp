import { describe, it, expect } from 'vitest';
import {
  normalizeOrgName,
  normalizeEmailSettings,
  buildSystemSettingsUpdateMap,
  buildSecretCommandHints
} from '../../public/js/services/system-settings-service.js';

describe('system-settings-service', () => {
  it('should normalize org name trimming spaces', () => {
    expect(normalizeOrgName('  GENIOVA  ')).toBe('GENIOVA');
    expect(normalizeOrgName('')).toBe('');
  });

  it('should force provider none when email is disabled', () => {
    const result = normalizeEmailSettings(false, 'smtp');
    expect(result).toEqual({ emailEnabled: false, emailProvider: 'none' });
  });

  it('should normalize unknown provider to none', () => {
    const result = normalizeEmailSettings(true, 'invalid');
    expect(result).toEqual({ emailEnabled: true, emailProvider: 'none' });
  });

  it('should build update map for rtdb paths', () => {
    const map = buildSystemSettingsUpdateMap({
      orgName: 'ACME',
      emailEnabled: true,
      emailProvider: 'sendgrid'
    });

    expect(map).toEqual({
      '/data/systemSettings/branding/orgName': 'ACME',
      '/data/systemSettings/notifications/emailEnabled': true,
      '/data/systemSettings/notifications/emailProvider': 'sendgrid'
    });
  });

  it('should return no secret commands when email is disabled', () => {
    const hints = buildSecretCommandHints(false, 'smtp');
    expect(hints.title).toContain('Solo push');
    expect(hints.commands).toEqual([]);
  });

  it('should return provider-specific secret commands for smtp', () => {
    const hints = buildSecretCommandHints(true, 'smtp');
    expect(hints.commands.some((cmd) => cmd.includes('SMTP_HOST'))).toBe(true);
    expect(hints.commands.some((cmd) => cmd.includes('EMAIL_PROVIDER'))).toBe(true);
  });

  it('should return provider-specific secret commands for sendgrid', () => {
    const hints = buildSecretCommandHints(true, 'sendgrid');
    expect(hints.commands.some((cmd) => cmd.includes('SENDGRID_API_KEY'))).toBe(true);
  });
});

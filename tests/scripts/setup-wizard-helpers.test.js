import { describe, it, expect } from 'vitest';

import {
  resolveEmailProviderFromChoice,
  buildSecretSetCommands,
  shouldShowBriefingForAction,
  mergePreClientConfig
} from '../../scripts/setup-wizard-helpers.js';

describe('setup wizard helpers', () => {
  it('should resolve none provider when user chooses push only', () => {
    expect(resolveEmailProviderFromChoice('4')).toBe('none');
  });

  it('should build firebase secret commands', () => {
    const commands = buildSecretSetCommands({
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587'
    });
    expect(commands[0]).toContain('EMAIL_PROVIDER');
    expect(commands.some(cmd => cmd.includes('SMTP_HOST'))).toBe(true);
  });

  it('should show briefing only for full setup action', () => {
    expect(shouldShowBriefingForAction('full')).toBe(true);
    expect(shouldShowBriefingForAction('verify')).toBe(false);
  });

  it('should merge pre client config over base config', () => {
    const base = {
      PUBLIC_FIREBASE_PROJECT_ID: 'prod-project',
      PUBLIC_FIREBASE_DATABASE_URL: 'https://prod-db'
    };
    const pre = {
      PUBLIC_FIREBASE_PROJECT_ID: 'pre-project'
    };

    const merged = mergePreClientConfig(base, pre);
    expect(merged.PUBLIC_FIREBASE_PROJECT_ID).toBe('pre-project');
    expect(merged.PUBLIC_FIREBASE_DATABASE_URL).toBe('https://prod-db');
  });
});

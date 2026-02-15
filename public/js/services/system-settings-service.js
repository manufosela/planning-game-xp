const ALLOWED_EMAIL_PROVIDERS = new Set(['none', 'msgraph', 'smtp', 'sendgrid']);

export function normalizeOrgName(value) {
  return (value || '').toString().trim();
}

export function normalizeEmailSettings(emailEnabled, emailProvider) {
  const enabled = Boolean(emailEnabled);
  const normalizedProvider = (emailProvider || '').toString().trim().toLowerCase();

  if (!enabled) {
    return { emailEnabled: false, emailProvider: 'none' };
  }

  if (!ALLOWED_EMAIL_PROVIDERS.has(normalizedProvider) || normalizedProvider === '') {
    return { emailEnabled: true, emailProvider: 'none' };
  }

  return { emailEnabled: true, emailProvider: normalizedProvider };
}

export function buildSystemSettingsUpdateMap(settings) {
  const orgName = normalizeOrgName(settings.orgName);
  const email = normalizeEmailSettings(settings.emailEnabled, settings.emailProvider);

  return {
    '/data/systemSettings/branding/orgName': orgName,
    '/data/systemSettings/notifications/emailEnabled': email.emailEnabled,
    '/data/systemSettings/notifications/emailProvider': email.emailProvider
  };
}

export function buildSecretCommandHints(emailEnabled, emailProvider) {
  const normalized = normalizeEmailSettings(emailEnabled, emailProvider);

  if (!normalized.emailEnabled || normalized.emailProvider === 'none') {
    return {
      title: 'Solo push activo. No necesitas secretos de email.',
      commands: []
    };
  }

  const commands = [`firebase functions:secrets:set EMAIL_PROVIDER`];

  if (normalized.emailProvider === 'msgraph') {
    commands.push(
      'firebase functions:secrets:set MS_CLIENT_ID',
      'firebase functions:secrets:set MS_CLIENT_SECRET',
      'firebase functions:secrets:set MS_TENANT_ID',
      'firebase functions:secrets:set MS_FROM_EMAIL',
      'firebase functions:secrets:set MS_ALERT_EMAIL'
    );
  }

  if (normalized.emailProvider === 'smtp') {
    commands.push(
      'firebase functions:secrets:set SMTP_HOST',
      'firebase functions:secrets:set SMTP_PORT',
      'firebase functions:secrets:set SMTP_SECURE',
      'firebase functions:secrets:set SMTP_USER',
      'firebase functions:secrets:set SMTP_PASS',
      'firebase functions:secrets:set SMTP_FROM_EMAIL'
    );
  }

  if (normalized.emailProvider === 'sendgrid') {
    commands.push(
      'firebase functions:secrets:set SENDGRID_API_KEY',
      'firebase functions:secrets:set SENDGRID_FROM_EMAIL',
      'firebase functions:secrets:set SENDGRID_FROM_NAME'
    );
  }

  return {
    title: `Comandos recomendados para ${normalized.emailProvider}`,
    commands
  };
}

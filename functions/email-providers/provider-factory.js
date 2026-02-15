const logger = require('firebase-functions/logger');

let instance = null;

function createEmailProvider() {
  const { NoneEmailProvider } = require('./none-provider');
  const providerName = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();

  if (!providerName) {
    if (process.env.MS_CLIENT_ID) {
      logger.warn('EMAIL_PROVIDER not set but MS_* config found. Falling back to "msgraph".');
      const { MsGraphEmailProvider } = require('./msgraph-provider');
      return new MsGraphEmailProvider({
        clientId: process.env.MS_CLIENT_ID,
        clientSecret: process.env.MS_CLIENT_SECRET,
        tenantId: process.env.MS_TENANT_ID,
        fromEmail: process.env.MS_FROM_EMAIL,
        alertEmail: process.env.MS_ALERT_EMAIL
      });
    }
    return new NoneEmailProvider();
  }

  switch (providerName) {
    case 'none':
      return new NoneEmailProvider();
    case 'msgraph':
      const { MsGraphEmailProvider } = require('./msgraph-provider');
      return new MsGraphEmailProvider({
        clientId: process.env.MS_CLIENT_ID,
        clientSecret: process.env.MS_CLIENT_SECRET,
        tenantId: process.env.MS_TENANT_ID,
        fromEmail: process.env.MS_FROM_EMAIL,
        alertEmail: process.env.MS_ALERT_EMAIL
      });
    case 'smtp':
      const { SmtpEmailProvider } = require('./smtp-provider');
      return new SmtpEmailProvider({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        fromEmail: process.env.SMTP_FROM_EMAIL
      });
    case 'sendgrid':
      const { SendGridEmailProvider } = require('./sendgrid-provider');
      return new SendGridEmailProvider({
        apiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.SENDGRID_FROM_EMAIL,
        fromName: process.env.SENDGRID_FROM_NAME
      });
    default:
      throw new Error(`Unknown email provider: ${providerName}`);
  }
}

function getEmailProvider() {
  if (!instance) {
    instance = createEmailProvider();
  }
  return instance;
}

function resetEmailProviderForTests() {
  instance = null;
}

module.exports = { createEmailProvider, getEmailProvider, resetEmailProviderForTests };

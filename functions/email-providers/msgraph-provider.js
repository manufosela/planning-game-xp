const axios = require('axios');
const logger = require('firebase-functions/logger');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { BaseEmailProvider } = require('./base-provider');

class MsGraphEmailProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.providerName = 'msgraph';
    this.msalClientFactory = config.msalClientFactory || ((msalConfig) => new ConfidentialClientApplication(msalConfig));
    this.httpPost = config.httpPost || axios.post;
  }

  getMsalConfig() {
    return {
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`
      }
    };
  }

  async getGraphAccessToken() {
    const cca = this.msalClientFactory(this.getMsalConfig());
    const response = await cca.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });
    return response.accessToken;
  }

  async sendGraphMessage(accessToken, data) {
    return this.httpPost(
      `https://graph.microsoft.com/v1.0/users/${this.config.fromEmail}/sendMail`,
      data,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  async sendEmail(toEmails, subject, htmlContent) {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      logger.info('[EMAIL:msgraph] Email skipped in emulator', { to: toEmails, subject });
      return { ok: true, skipped: true, provider: this.providerName, reason: 'emulator' };
    }

    const accessToken = await this.getGraphAccessToken();

    if ((htmlContent || '').includes('localhost')) {
      logger.error('[EMAIL:msgraph] Blocked localhost URL in content', { to: toEmails, subject });
      const alertTo = this.config.alertEmail || this.config.fromEmail;
      try {
        await this.sendGraphMessage(accessToken, {
          message: {
            subject: '[ALERTA] Cloud Function intentó enviar email con localhost',
            body: {
              contentType: 'HTML',
              content: `<p>Email bloqueado por localhost. Subject: ${subject}</p>`
            },
            toRecipients: [{ emailAddress: { address: alertTo } }]
          },
          saveToSentItems: true
        });
      } catch (alertError) {
        logger.error('[EMAIL:msgraph] Failed to send alert email', { error: alertError.message });
      }
      throw new Error('Email blocked: contains localhost URLs.');
    }

    await this.sendGraphMessage(accessToken, {
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: htmlContent
        },
        toRecipients: (toEmails || []).map(email => ({ emailAddress: { address: email } }))
      },
      saveToSentItems: true
    });

    logger.info('[EMAIL:msgraph] Email sent', { to: toEmails, subject });
    return { ok: true, provider: this.providerName };
  }

  async healthCheck() {
    try {
      await this.getGraphAccessToken();
      return { ok: true, provider: this.providerName };
    } catch (error) {
      return { ok: false, provider: this.providerName, error: error.message };
    }
  }
}

module.exports = { MsGraphEmailProvider };

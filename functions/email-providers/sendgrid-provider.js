const logger = require('firebase-functions/logger');
const { BaseEmailProvider } = require('./base-provider');

class SendGridEmailProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.providerName = 'sendgrid';
    // Lazy require so installations without SendGrid deps keep working.
    this.sgMail = config.sgMail || require('@sendgrid/mail');
    this.sgMail.setApiKey(config.apiKey);
  }

  async sendEmail(toEmails, subject, htmlContent) {
    await this.sgMail.send({
      to: toEmails,
      from: {
        email: this.config.fromEmail,
        name: this.config.fromName || 'Planning Game XP'
      },
      subject,
      html: htmlContent
    });
    logger.info('[EMAIL:sendgrid] Email sent', { to: toEmails, subject });
    return { ok: true, provider: this.providerName };
  }

  async healthCheck() {
    if (!this.config.apiKey) {
      return { ok: false, provider: this.providerName, error: 'SENDGRID_API_KEY missing' };
    }
    return { ok: true, provider: this.providerName };
  }
}

module.exports = { SendGridEmailProvider };

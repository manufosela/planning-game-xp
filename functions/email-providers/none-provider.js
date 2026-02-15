const logger = require('firebase-functions/logger');
const { BaseEmailProvider } = require('./base-provider');

class NoneEmailProvider extends BaseEmailProvider {
  constructor() {
    super({});
    this.providerName = 'none';
  }

  async sendEmail(toEmails, subject) {
    logger.info('[EMAIL:none] Email skipped (metadata only)', {
      to: Array.isArray(toEmails) ? toEmails : [],
      subject: subject || ''
    });
    return { ok: true, skipped: true, provider: this.providerName };
  }

  async healthCheck() {
    return { ok: true, provider: this.providerName };
  }
}

module.exports = { NoneEmailProvider };

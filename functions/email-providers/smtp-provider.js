const logger = require('firebase-functions/logger');
const { BaseEmailProvider } = require('./base-provider');

class SmtpEmailProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.providerName = 'smtp';
    // Lazy require so installations without SMTP deps keep working.
    const nodemailer = config.nodemailer || require('nodemailer');
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port || 587),
      secure: String(config.secure).toLowerCase() === 'true',
      auth: {
        user: config.user,
        pass: config.pass
      }
    });
  }

  async sendEmail(toEmails, subject, htmlContent) {
    await this.transporter.sendMail({
      from: this.config.fromEmail,
      to: toEmails,
      subject,
      html: htmlContent
    });
    logger.info('[EMAIL:smtp] Email sent', { to: toEmails, subject });
    return { ok: true, provider: this.providerName };
  }

  async healthCheck() {
    try {
      await this.transporter.verify();
      return { ok: true, provider: this.providerName };
    } catch (error) {
      return { ok: false, provider: this.providerName, error: error.message };
    }
  }
}

module.exports = { SmtpEmailProvider };

class BaseEmailProvider {
  constructor(config = {}) {
    this.config = config;
    this.providerName = 'base';
  }

  async initialize() {}

  async sendEmail() {
    throw new Error('sendEmail() must be implemented by subclass');
  }

  async healthCheck() {
    return { ok: false, provider: this.providerName };
  }
}

module.exports = { BaseEmailProvider };

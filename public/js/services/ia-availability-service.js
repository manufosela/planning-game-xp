import { dalService } from './dal-service.js';

class IaAvailabilityService {
  constructor() {
    this.available = false;
    this.initialized = false;
    this._initPromise = null;
  }

  isAvailable() {
    return this.available;
  }

  async ensureInitialized() {
    if (this.initialized) {
      return this.available;
    }
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._loadAvailability();
    return this._initPromise;
  }

  async _loadAvailability() {
    const enabled = await dalService.config.getIAEnabled();
    this.available = enabled;
    this.initialized = true;
    return this.available;
  }
}

export const iaAvailabilityService = new IaAvailabilityService();

import { dalService } from './dal-service.js';
import { IA_CONFIG } from '../../ia-config.js';
class IaAvailabilityService {
  constructor() {
    this.available = IA_CONFIG?.fallbackEnabled || true;
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
    try {
      const enabled = await dalService.config.getIAEnabled();
      this.available = enabled;
      this.initialized = true;
    } catch (err) {
      this.available = IA_CONFIG?.fallbackEnabled || true;
      this.initialized = true;
    }
    return this.available;
  }
}

export const iaAvailabilityService = new IaAvailabilityService();

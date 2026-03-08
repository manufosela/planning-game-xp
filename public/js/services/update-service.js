/**
 * Update Service - Checks for new versions of Planning Game
 * Fetches latest-version.json from GitHub Releases and compares with local version.
 * Opt-out: set checkUpdates=false in CLIENT_CONFIG.updates to disable.
 */
import { version as currentVersion } from '../version.js';
import { CLIENT_CONFIG } from '../config/client-config.js';

const LATEST_VERSION_URL = 'https://github.com/manufosela/planning-game-xp/releases/latest/download/latest-version.json';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const DISMISSED_KEY = 'pg-update-dismissed-version';

export class UpdateService {
  constructor() {
    this.currentVersion = currentVersion;
    this.latestVersion = null;
    this.latestInfo = null;
    this.lastCheck = null;
    this._checkInterval = null;
    this._initPromise = null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    const updatesEnabled = CLIENT_CONFIG?.updates?.enabled !== false;
    if (!updatesEnabled) return;

    // Check on init, then every 24h
    await this.checkForUpdates();
    this._checkInterval = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL);
  }

  stopChecker() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  }

  async checkForUpdates() {
    try {
      const response = await fetch(LATEST_VERSION_URL, { cache: 'no-store' });
      if (!response.ok) return null;

      const info = await response.json();
      this.latestVersion = info.version;
      this.latestInfo = info;
      this.lastCheck = new Date().toISOString();

      if (this._isNewer(info.version, this.currentVersion)) {
        // Don't notify if user already dismissed this version
        const dismissed = localStorage.getItem(DISMISSED_KEY);
        if (dismissed === info.version) return null;

        document.dispatchEvent(new CustomEvent('update-available', {
          detail: {
            currentVersion: this.currentVersion,
            version: info.version,
            date: info.date,
            changelog: info.changelog,
            repoUrl: info.repoUrl,
            releaseUrl: info.releaseUrl
          }
        }));
        return info;
      }
      return null;
    } catch {
      return null;
    }
  }

  dismissVersion(version) {
    localStorage.setItem(DISMISSED_KEY, version);
  }

  /**
   * Compare semver strings. Returns true if latest > current.
   */
  _isNewer(latest, current) {
    if (!latest || !current) return false;
    const l = latest.split('.').map(Number);
    const c = current.split('.').map(Number);
    for (let i = 0; i < Math.max(l.length, c.length); i++) {
      const lv = l[i] || 0;
      const cv = c[i] || 0;
      if (lv > cv) return true;
      if (lv < cv) return false;
    }
    return false;
  }

  getStatus() {
    return {
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      lastCheck: this.lastCheck,
      updateAvailable: this.latestVersion ? this._isNewer(this.latestVersion, this.currentVersion) : false
    };
  }
}

// Singleton
export const updateService = new UpdateService();
updateService.init();

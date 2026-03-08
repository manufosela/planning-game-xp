/**
 * Version Check Service - Monitors Firebase RTDB for version changes
 * When a new version is deployed, notifies users in real-time to refresh
 */
import { dalService } from './dal-service.js';

/**
 * Compare two semver strings. Returns:
 *  1 if a > b, -1 if a < b, 0 if equal.
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

class VersionCheckService {
  constructor() {
    this._currentVersion = null;
    this._unsubscribe = null;
    this._initialized = false;
  }

  /**
   * Initialize the service and start listening for version changes
   * @param {string} currentVersion - The current app version from build
   */
  init(currentVersion) {
    if (this._initialized) return;

    this._currentVersion = currentVersion;
    this._initialized = true;

    this._startListening();
  }

  /**
   * Start listening to version changes in Firebase RTDB
   */
  _startListening() {
    // First, get initial value to avoid false positive on first load
    dalService.config.getCurrentVersion().then((serverVersion) => {
      // If server version doesn't exist yet, set it from client
      if (!serverVersion) {
        console.warn('[VersionCheckService] No server version found, setting from client:', this._currentVersion);
        this._updateServerVersion(this._currentVersion);
        return;
      }

      // Auto-heal: if client is NEWER than server, update RTDB
      // This handles the case where deploy scripts fail to update the version
      if (compareSemver(this._currentVersion, serverVersion) > 0) {
        console.log(`[VersionCheckService] Client version (${this._currentVersion}) is newer than server (${serverVersion}). Updating RTDB.`);
        this._updateServerVersion(this._currentVersion);
        return;
      }

      // If server version is newer, user has an outdated version
      // Show the update modal immediately
      if (compareSemver(serverVersion, this._currentVersion) > 0) {
        console.log(`[VersionCheckService] Version mismatch on load: local=${this._currentVersion}, server=${serverVersion}`);
        this._notifyNewVersion(serverVersion);
      }

      // Now start listening for changes
      this._unsubscribe = dalService.config.subscribeToCurrentVersion((newVersion) => {
        if (!newVersion) return;

        // Check if version changed from what we know
        if (newVersion !== this._currentVersion) {
          console.log(`[VersionCheckService] New version detected: ${newVersion} (current: ${this._currentVersion})`);
          this._notifyNewVersion(newVersion);
        }
      });
    }).catch((error) => {
      console.error('[VersionCheckService] Error getting initial version:', error);
    });
  }

  /**
   * Update the server version in RTDB (auto-heal mechanism).
   * When a client detects it has a newer version than the server,
   * it updates RTDB so other clients get notified.
   */
  _updateServerVersion(version) {
    dalService.config.setCurrentVersion(version)
      .then(() => console.log(`[VersionCheckService] RTDB version updated to ${version}`))
      .catch((error) => console.warn('[VersionCheckService] Could not update server version:', error.message));
  }

  /**
   * Notify the app that a new version is available
   * @param {string} newVersion - The new version string
   */
  _notifyNewVersion(newVersion) {
    document.dispatchEvent(new CustomEvent('app-version-update-required', {
      detail: {
        currentVersion: this._currentVersion,
        newVersion: newVersion,
        timestamp: Date.now()
      }
    }));
  }

  /**
   * Stop listening for version changes
   */
  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._initialized = false;
  }

  /**
   * Get the current version
   */
  get currentVersion() {
    return this._currentVersion;
  }
}

// Singleton instance
export const versionCheckService = new VersionCheckService();

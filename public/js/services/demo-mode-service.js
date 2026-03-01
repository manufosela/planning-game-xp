/**
 * Demo Mode Service
 *
 * Reads demo configuration from theme-config.json (via ThemeLoaderService)
 * and renders a persistent banner when demo.enabled === true.
 *
 * Configuration (in theme-config.json):
 * ```json
 * {
 *   "demo": {
 *     "enabled": true,
 *     "maxProjects": 1,
 *     "maxTasksPerProject": 20,
 *     "bannerText": "Demo Instance — Limited features"
 *   }
 * }
 * ```
 */

import { ThemeLoaderService } from './theme-loader-service.js';

const BANNER_ID = 'demo-mode-bar';
const INSTALL_URL = 'https://github.com/manufosela/planning-game-xp#readme';

class DemoMode {
  constructor() {
    this._config = null;
    this._initialized = false;
  }

  /**
   * Initialize demo mode: read config and show banner if enabled.
   * Safe to call multiple times (idempotent).
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    this._config = ThemeLoaderService.getConfigValue('demo') || null;

    if (this.isDemo()) {
      this._showBanner();
    }
  }

  /**
   * @returns {boolean} True if the current instance is a demo
   */
  isDemo() {
    return this._config?.enabled === true;
  }

  /**
   * @returns {number} Max projects allowed (0 = unlimited)
   */
  get maxProjects() {
    return this._config?.maxProjects || 0;
  }

  /**
   * @returns {number} Max tasks per project (0 = unlimited)
   */
  get maxTasksPerProject() {
    return this._config?.maxTasksPerProject || 0;
  }

  /**
   * @returns {string} Banner text
   */
  get bannerText() {
    return this._config?.bannerText || 'Demo Instance';
  }

  /**
   * Show a limit-reached notification using SlideNotification.
   * @param {string} limitType - What limit was reached (e.g., 'projects', 'tasks')
   */
  showLimitReached(limitType) {
    const messages = {
      projects: `Demo limit: max ${this.maxProjects} project(s). Install your own instance for unlimited projects.`,
      tasks: `Demo limit: max ${this.maxTasksPerProject} tasks per project. Install your own instance for unlimited tasks.`,
    };

    const notification = document.createElement('slide-notification');
    notification.message = messages[limitType] || `Demo limit reached for ${limitType}.`;
    notification.type = 'warning';
    document.body.appendChild(notification);
  }

  /**
   * Show a feature-disabled notification.
   * @param {string} featureName - Name of the disabled feature
   */
  showFeatureDisabled(featureName) {
    const notification = document.createElement('slide-notification');
    notification.message = `"${featureName}" is not available in demo mode. Install your own instance for full features.`;
    notification.type = 'info';
    document.body.appendChild(notification);
  }

  /** @private */
  _showBanner() {
    if (document.getElementById(BANNER_ID)) return;

    const bar = document.createElement('div');
    bar.id = BANNER_ID;
    bar.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'height: 32px',
      'background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'color: white',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'gap: 8px',
      'font-family: system-ui, -apple-system, sans-serif',
      'font-size: 13px',
      'font-weight: 600',
      'z-index: 99999',
      'box-shadow: 0 2px 4px rgba(0,0,0,0.15)',
    ].join(';');

    const text = document.createElement('span');
    text.textContent = `⚠ ${this.bannerText}`;

    const link = document.createElement('a');
    link.href = INSTALL_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Install your own →';
    link.style.cssText = [
      'color: white',
      'text-decoration: underline',
      'font-size: 12px',
      'opacity: 0.9',
    ].join(';');

    bar.append(text, link);
    document.body.appendChild(bar);

    // Offset content below the banner, accounting for possible emulator bar
    const existingPadding = parseInt(document.body.style.paddingTop || '0', 10);
    document.body.style.paddingTop = `${existingPadding + 32}px`;
  }
}

export const demoModeService = new DemoMode();

/**
 * Theme Loader Service
 *
 * Loads theme configuration from Firebase RTDB (/config/theme) with
 * fallback to static /theme-config.json. Supports real-time updates
 * via onValue listener and saving config back to RTDB.
 *
 * Configuration structure:
 * ```json
 * {
 *   "tokens": {
 *     "brand": { "primary": "#4a9eff", "secondary": "#ec3e95" },
 *     "status": { "todo": "#449bd3", "inProgress": "#cce500" }
 *   },
 *   "branding": {
 *     "appName": "Planning Game XP",
 *     "logo": "/images/icono_PGame.png",
 *     "primaryColor": "#4a9eff"
 *   },
 *   "features": { "darkMode": true }
 * }
 * ```
 *
 * Usage:
 * ```js
 * import { ThemeLoaderService } from './services/theme-loader-service.js';
 *
 * // Load from RTDB (or fallback) and apply
 * await ThemeLoaderService.loadAndApply();
 *
 * // Save config to RTDB
 * await ThemeLoaderService.saveConfig(newConfig);
 *
 * // Get branding info
 * const branding = ThemeLoaderService.getBranding();
 * ```
 */

import { ThemeManagerService } from './theme-manager-service.js';
import { getContrastColor } from '../utils/color-utils.js';
import { database, ref, get, set, onValue } from '../../firebase-config.js';

const CONFIG_PATH = '/theme-config.json';
const RTDB_PATH = '/config/theme';

class ThemeLoader {
  constructor() {
    this.config = null;
    this.configLoadedAt = null;
    this.loading = null;
    this._unsubscribe = null;
    this._rtdbListenerActive = false;
  }

  /**
   * Load configuration from RTDB, falling back to static JSON
   * @returns {Promise<Object|null>} Configuration object or null if not found
   */
  async loadConfig() {
    if (this.config && this.configLoadedAt) {
      return this.config;
    }

    if (this.loading) {
      return this.loading;
    }

    this.loading = this._loadFromSources();

    try {
      this.config = await this.loading;
      this.configLoadedAt = Date.now();
      return this.config;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Try RTDB first, then fall back to static JSON
   * @returns {Promise<Object|null>}
   */
  async _loadFromSources() {
    // Try RTDB first
    try {
      const snapshot = await get(ref(database, RTDB_PATH));
      if (snapshot.exists()) {
        return snapshot.val();
      }
    } catch {
      // RTDB unavailable, fall through to static fallback
    }

    // Fallback to static JSON
    try {
      const response = await fetch(CONFIG_PATH);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Static file also unavailable
    }

    return null;
  }

  /**
   * Save configuration to RTDB
   * @param {Object} config - Configuration object to persist
   * @returns {Promise<void>}
   */
  async saveConfig(config) {
    await set(ref(database, RTDB_PATH), config);
    this.config = config;
    this.configLoadedAt = Date.now();
  }

  /**
   * Set up real-time listener for config changes
   */
  _setupRealtimeListener() {
    if (this._rtdbListenerActive) {
      return;
    }

    const configRef = ref(database, RTDB_PATH);
    this._unsubscribe = onValue(configRef, (snapshot) => {
      if (snapshot.exists()) {
        this.config = snapshot.val();
        this.configLoadedAt = Date.now();
        this.applyConfig(this.config);
      }
    });
    this._rtdbListenerActive = true;
  }

  /**
   * Apply configuration to the application
   * @param {Object} config - Configuration object
   */
  applyConfig(config) {
    if (!config) {
      return;
    }

    const tokens = this.flattenTokens(config.tokens);
    this.applyTokensToRoot(tokens);

    if (config.features?.darkMode === false) {
      ThemeManagerService.applyTheme('light');
    }

    if (config.branding) {
      this.applyBranding(config.branding);
    }
  }

  /**
   * Flatten nested token structure to CSS custom properties
   * @param {Object} tokens - Nested token object
   * @param {string} prefix - Property prefix
   * @returns {Object} Flat object with CSS property names
   */
  flattenTokens(tokens, prefix = '') {
    const result = {};

    if (!tokens) {
      return result;
    }

    for (const [key, value] of Object.entries(tokens)) {
      const propertyName = prefix ? `--${prefix}-${this.kebabCase(key)}` : `--${this.kebabCase(key)}`;

      if (typeof value === 'object' && value !== null) {
        Object.assign(result, this.flattenTokens(value, prefix ? `${prefix}-${this.kebabCase(key)}` : this.kebabCase(key)));
      } else {
        result[propertyName] = value;
      }
    }

    return result;
  }

  /**
   * Convert camelCase to kebab-case
   * @param {string} str - Input string
   * @returns {string} Kebab-case string
   */
  kebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Apply tokens to :root element
   * @param {Object} tokens - Token key-value pairs
   */
  applyTokensToRoot(tokens) {
    const root = document.documentElement;
    const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

    for (const [property, value] of Object.entries(tokens)) {
      root.style.setProperty(property, value);

      // Auto-calculate contrast text color for status tokens
      if (property.startsWith('--status-') && !property.endsWith('-text') && HEX_RE.test(value)) {
        root.style.setProperty(`${property}-text`, getContrastColor(value));
      }
    }
  }

  /**
   * Apply branding configuration
   * @param {Object} branding - Branding configuration
   */
  applyBranding(branding) {
    if (branding.appName) {
      document.title = branding.appName;
      this.updateMetaTag('application-name', branding.appName);
    }

    if (branding.logo) {
      this.updateFavicon(branding.logo);
    }

    if (branding.primaryColor) {
      this.updateMetaTag('theme-color', branding.primaryColor);
    }
  }

  /**
   * Update or create a meta tag
   * @param {string} name - Meta tag name
   * @param {string} content - Meta tag content
   */
  updateMetaTag(name, content) {
    let meta = document.querySelector(`meta[name="${name}"]`);

    if (!meta) {
      meta = document.createElement('meta');
      meta.name = name;
      document.head.appendChild(meta);
    }

    meta.content = content;
  }

  /**
   * Update favicon
   * @param {string} logoPath - Path to logo/favicon
   */
  updateFavicon(logoPath) {
    let link = document.querySelector('link[rel="icon"]');

    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    link.href = logoPath;
  }

  /**
   * Load and apply configuration, then set up real-time listener
   * @returns {Promise<Object|null>} Applied configuration
   */
  async loadAndApply() {
    const config = await this.loadConfig();

    if (config) {
      this.applyConfig(config);
    }

    this._setupRealtimeListener();

    return config;
  }

  /**
   * Get branding information
   * @returns {Object|null} Branding configuration
   */
  getBranding() {
    return this.config?.branding || null;
  }

  /**
   * Get feature flags
   * @returns {Object} Feature flags with defaults
   */
  getFeatures() {
    return {
      darkMode: true,
      ...this.config?.features,
    };
  }

  /**
   * Check if a feature is enabled
   * @param {string} featureName - Feature name
   * @returns {boolean} True if feature is enabled
   */
  isFeatureEnabled(featureName) {
    const features = this.getFeatures();
    return features[featureName] === true;
  }

  /**
   * Get custom configuration value
   * @param {string} path - Dot-separated path (e.g., 'branding.appName')
   * @returns {*} Configuration value or undefined
   */
  getConfigValue(path) {
    if (!this.config) {
      return undefined;
    }

    const parts = path.split('.');
    let current = this.config;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Force reload configuration
   * @returns {Promise<Object|null>} Fresh configuration
   */
  async reloadConfig() {
    this.config = null;
    this.configLoadedAt = null;
    return this.loadAndApply();
  }

  /**
   * Clear cached configuration
   */
  clearCache() {
    this.config = null;
    this.configLoadedAt = null;
  }
}

export const ThemeLoaderService = new ThemeLoader();

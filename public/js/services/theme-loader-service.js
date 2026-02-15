/**
 * Theme Loader Service
 *
 * Loads external theme configuration from /theme-config.json
 * This allows third parties to customize the application appearance
 * without modifying the source code.
 *
 * Configuration file structure:
 * ```json
 * {
 *   "tokens": {
 *     "brand": {
 *       "primary": "#4a9eff",
 *       "secondary": "#ec3e95"
 *     },
 *     "colors": { ... }
 *   },
 *   "branding": {
 *     "appName": "Planning Game XP",
 *     "logo": "/assets/logo.svg"
 *   },
 *   "features": {
 *     "darkMode": true
 *   }
 * }
 * ```
 *
 * Usage:
 * ```js
 * import { ThemeLoaderService } from './services/theme-loader-service.js';
 *
 * // Load and apply configuration
 * await ThemeLoaderService.loadAndApply();
 *
 * // Get branding info
 * const branding = ThemeLoaderService.getBranding();
 * ```
 */

import { ThemeManagerService } from './theme-manager-service.js';

const CONFIG_PATH = '/theme-config.json';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class ThemeLoader {
  constructor() {
    this.config = null;
    this.configLoadedAt = null;
    this.loading = null;
  }

  /**
   * Load configuration from external file
   * @returns {Promise<Object|null>} Configuration object or null if not found
   */
  async loadConfig() {
    if (this.config && this.isCacheValid()) {
      return this.config;
    }

    if (this.loading) {
      return this.loading;
    }

    this.loading = this.fetchConfig();

    try {
      this.config = await this.loading;
      this.configLoadedAt = Date.now();
      return this.config;
    } catch {
      // Theme config is optional - silently use defaults if not found
      return null;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Fetch configuration from server
   * @returns {Promise<Object>} Configuration object
   */
  async fetchConfig() {
    const response = await fetch(CONFIG_PATH);

    if (!response.ok) {
      throw new Error(`Failed to load theme config: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Check if cached config is still valid
   * @returns {boolean} True if cache is valid
   */
  isCacheValid() {
    if (!this.configLoadedAt) {
      return false;
    }
    return Date.now() - this.configLoadedAt < CACHE_DURATION;
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

    for (const [property, value] of Object.entries(tokens)) {
      root.style.setProperty(property, value);
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

    const orgNameEl = document.getElementById('org-name');
    if (orgNameEl) {
      const runtimeOrgName = (window.orgName || '').trim();
      const brandingOrgName = (branding.orgName || '').trim();
      orgNameEl.textContent = runtimeOrgName || brandingOrgName || '';
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
   * Load and apply configuration in one step
   * @returns {Promise<Object|null>} Applied configuration
   */
  async loadAndApply() {
    const config = await this.loadConfig();

    if (config) {
      this.applyConfig(config);
    }

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
   * Force reload configuration from server
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

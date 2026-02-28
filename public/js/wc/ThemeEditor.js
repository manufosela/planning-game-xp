import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { ThemeEditorStyles } from './theme-editor-styles.js';
import { ThemeLoaderService } from '../services/theme-loader-service.js';
import { getContrastColor } from '../utils/color-utils.js';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const DEFAULT_CONFIG = {
  tokens: {
    brand: { primary: '#4a9eff', primaryHover: '#3a8eef', secondary: '#ec3e95', secondaryHover: '#d81b60' },
    text: { onPrimary: '#ffffff', onSecondary: '#ffffff' },
    status: { todo: '#449bd3', inProgress: '#cce500', toValidate: '#ff6600', done: '#d4edda', blocked: '#f8d7da', expedited: '#ec3e95' }
  },
  branding: { appName: 'Planning Game XP', logo: '/images/icono_PGame.png', primaryColor: '#4a9eff' },
  features: { darkMode: true }
};

const BRAND_COLOR_LABELS = {
  primary: 'Primary',
  primaryHover: 'Primary Hover',
  secondary: 'Secondary',
  secondaryHover: 'Secondary Hover'
};

const TEXT_COLOR_LABELS = {
  onPrimary: 'Text on Primary',
  onSecondary: 'Text on Secondary'
};

const STATUS_COLOR_LABELS = {
  todo: 'To Do',
  inProgress: 'In Progress',
  toValidate: 'To Validate',
  done: 'Done',
  blocked: 'Blocked',
  expedited: 'Expedited'
};

/**
 * ThemeEditor - Visual theme configuration editor
 *
 * Allows admins to edit brand colors, status colors, branding and features
 * with live preview and RTDB persistence via ThemeLoaderService.
 *
 * @element theme-editor
 * @fires theme-saved - Fired when theme is saved successfully
 */
export class ThemeEditor extends LitElement {
  static properties = {
    _config: { type: Object, state: true },
    _originalConfig: { type: Object, state: true },
    _isLoading: { type: Boolean, state: true },
    _isSaving: { type: Boolean, state: true },
    _isDirty: { type: Boolean, state: true },
    _livePreview: { type: Boolean, state: true }
  };

  static styles = ThemeEditorStyles;

  constructor() {
    super();
    this._config = null;
    this._originalConfig = null;
    this._isLoading = false;
    this._isSaving = false;
    this._isDirty = false;
    this._livePreview = true;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._loadConfig();
  }

  async _loadConfig() {
    this._isLoading = true;
    try {
      const config = await ThemeLoaderService.loadConfig();
      const merged = this._mergeWithDefaults(config || {});
      this._config = structuredClone(merged);
      this._originalConfig = structuredClone(merged);
    } catch (error) {
      console.error('Failed to load theme config:', error);
      this._config = structuredClone(DEFAULT_CONFIG);
      this._originalConfig = structuredClone(DEFAULT_CONFIG);
    }
    this._isLoading = false;
  }

  _mergeWithDefaults(config) {
    return {
      tokens: {
        brand: { ...DEFAULT_CONFIG.tokens.brand, ...config.tokens?.brand },
        text: { ...DEFAULT_CONFIG.tokens.text, ...config.tokens?.text },
        status: { ...DEFAULT_CONFIG.tokens.status, ...config.tokens?.status },
      },
      branding: { ...DEFAULT_CONFIG.branding, ...config.branding },
      features: { ...DEFAULT_CONFIG.features, ...config.features },
    };
  }

  // --- Color change handlers ---

  _handleColorChange(section, key, value) {
    if (!this._config?.tokens?.[section]) return;

    this._config.tokens[section][key] = value;
    this._isDirty = true;

    if (this._livePreview) {
      const cssVar = `--${ThemeLoaderService.kebabCase(section)}-${ThemeLoaderService.kebabCase(key)}`;
      document.documentElement.style.setProperty(cssVar, value);

      // Also propagate text color aliases for live preview
      if (section === 'text' && key === 'onPrimary') {
        document.documentElement.style.setProperty('--text-on-primary', value);
        document.documentElement.style.setProperty('--footer-text', value);
      } else if (section === 'text' && key === 'onSecondary') {
        document.documentElement.style.setProperty('--text-on-secondary', value);
      }
    }

    this.requestUpdate();
  }

  _handleBrandingChange(field, value) {
    if (!this._config?.branding) return;

    this._config.branding[field] = value;
    this._isDirty = true;
    this.requestUpdate();
  }

  _handleFeatureChange(feature, enabled) {
    if (!this._config?.features) return;

    this._config.features[feature] = enabled;
    this._isDirty = true;
    this.requestUpdate();
  }

  // --- Actions ---

  async _handleSave() {
    if (!this._validateConfig()) {
      this._showNotification('Invalid color values detected. Fix errors before saving.', 'error');
      return;
    }

    this._isSaving = true;
    try {
      await ThemeLoaderService.saveConfig(this._config);
      ThemeLoaderService.applyConfig(this._config);
      this._originalConfig = structuredClone(this._config);
      this._isDirty = false;
      this._showNotification('Theme saved successfully', 'success');
      this.dispatchEvent(new CustomEvent('theme-saved', {
        detail: { config: this._config },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('Failed to save theme:', error);
      this._showNotification('Failed to save theme configuration', 'error');
    }
    this._isSaving = false;
  }

  _handleDiscard() {
    this._config = structuredClone(this._originalConfig);
    this._isDirty = false;

    if (this._livePreview) {
      ThemeLoaderService.applyConfig(this._config);
    }

    this.requestUpdate();
    this._showNotification('Changes discarded', 'info');
  }

  async _handleResetDefaults() {
    try {
      let defaults = DEFAULT_CONFIG;
      try {
        const response = await fetch('/theme-config.json');
        if (response.ok) {
          defaults = await response.json();
        }
      } catch { /* use built-in defaults */ }
      this._config = structuredClone(this._mergeWithDefaults(defaults));
      this._isDirty = true;

      if (this._livePreview) {
        ThemeLoaderService.applyConfig(this._config);
      }

      this.requestUpdate();
      this._showNotification('Default values restored. Save to apply permanently.', 'info');
    } catch (error) {
      console.error('Failed to load defaults:', error);
      this._showNotification('Could not load default configuration', 'error');
    }
  }

  // --- Validation ---

  _validateConfig() {
    if (!this._config?.tokens?.brand || !this._config?.tokens?.status) return false;

    const { brand, text, status } = this._config.tokens;
    for (const color of Object.values(brand)) {
      if (!HEX_COLOR_REGEX.test(color)) return false;
    }
    if (text) {
      for (const color of Object.values(text)) {
        if (!HEX_COLOR_REGEX.test(color)) return false;
      }
    }
    for (const color of Object.values(status)) {
      if (!HEX_COLOR_REGEX.test(color)) return false;
    }
    return true;
  }

  _isValidHex(value) {
    return HEX_COLOR_REGEX.test(value);
  }

  // --- Notification ---

  _showNotification(message, type) {
    const notification = document.createElement('slide-notification');
    notification.message = message;
    notification.type = type;
    document.body.append(notification);
  }

  // --- Render ---

  render() {
    if (this._isLoading) {
      return html`<div class="loading">Loading theme configuration...</div>`;
    }

    if (!this._config) {
      return html`<div class="error-message">Could not load theme configuration.</div>`;
    }

    return html`
      <div class="editor-header">
        <h2>Theme Editor</h2>
        <div class="header-actions">
          ${this._isDirty ? html`<span class="dirty-badge">Unsaved changes</span>` : ''}
          <label class="preview-toggle-label">
            <input
              type="checkbox"
              .checked=${this._livePreview}
              @change=${(e) => { this._livePreview = e.target.checked; }}
            />
            Live preview
          </label>
          <button
            class="btn btn-secondary"
            @click=${this._handleDiscard}
            ?disabled=${!this._isDirty || this._isSaving}
          >Discard</button>
          <button
            class="btn btn-danger"
            @click=${this._handleResetDefaults}
            ?disabled=${this._isSaving}
          >Reset Defaults</button>
          <button
            class="btn btn-primary"
            @click=${this._handleSave}
            ?disabled=${!this._isDirty || this._isSaving}
          >${this._isSaving ? 'Saving...' : 'Save Theme'}</button>
        </div>
      </div>

      <color-tabs active-tab="brand">
        <color-tab name="brand" label="Brand" color="var(--brand-primary)">
          <div class="tab-content">
            ${this._renderBrandColors()}
          </div>
        </color-tab>
        <color-tab name="status" label="Status" color="var(--status-in-progress)">
          <div class="tab-content">
            ${this._renderStatusColors()}
          </div>
        </color-tab>
        <color-tab name="branding" label="Branding" color="var(--brand-secondary)">
          <div class="tab-content">
            ${this._renderBranding()}
          </div>
        </color-tab>
        <color-tab name="features" label="Features" color="var(--color-info, #17a2b8)">
          <div class="tab-content">
            ${this._renderFeatures()}
          </div>
        </color-tab>
      </color-tabs>
    `;
  }

  _renderColorPicker(section, key, label, currentValue) {
    const isValid = this._isValidHex(currentValue);
    return html`
      <div class="color-picker-group">
        <label>${label}</label>
        <div class="color-input-wrapper">
          <input
            type="color"
            .value=${isValid ? currentValue : '#000000'}
            @input=${(e) => this._handleColorChange(section, key, e.target.value)}
          />
          <input
            type="text"
            class="hex-input ${isValid ? '' : 'invalid'}"
            .value=${currentValue}
            @input=${(e) => {
              const val = e.target.value;
              if (this._isValidHex(val)) {
                this._handleColorChange(section, key, val);
              } else {
                this._config.tokens[section][key] = val;
                this._isDirty = true;
                this.requestUpdate();
              }
            }}
            placeholder="#000000"
            maxlength="7"
          />
          <div
            class="color-swatch"
            style="background: ${isValid ? currentValue : '#fff'}"
          ></div>
        </div>
      </div>
    `;
  }

  _renderBrandColors() {
    const brand = this._config?.tokens?.brand;
    if (!brand) return html`<p class="error-message">Brand colors not configured.</p>`;
    return html`
      <h3 class="section-title">Brand Colors</h3>
      <div class="color-grid">
        ${Object.entries(BRAND_COLOR_LABELS).map(([key, label]) =>
          this._renderColorPicker('brand', key, label, brand[key])
        )}
      </div>
      ${this._renderTextColors()}
    `;
  }

  _renderTextColors() {
    const text = this._config?.tokens?.text;
    if (!text) return '';
    return html`
      <h3 class="section-title">Text Colors</h3>
      <p class="section-hint">Colors for text rendered on top of brand colors. Use "Auto" to calculate contrast automatically.</p>
      <div class="color-grid">
        ${Object.entries(TEXT_COLOR_LABELS).map(([key, label]) => html`
          <div class="color-picker-group">
            <label>${label}</label>
            <div class="color-input-wrapper">
              <input
                type="color"
                .value=${this._isValidHex(text[key]) ? text[key] : '#000000'}
                @input=${(e) => this._handleColorChange('text', key, e.target.value)}
              />
              <input
                type="text"
                class="hex-input ${this._isValidHex(text[key]) ? '' : 'invalid'}"
                .value=${text[key]}
                @input=${(e) => {
                  const val = e.target.value;
                  if (this._isValidHex(val)) {
                    this._handleColorChange('text', key, val);
                  } else {
                    this._config.tokens.text[key] = val;
                    this._isDirty = true;
                    this.requestUpdate();
                  }
                }}
                placeholder="#000000"
                maxlength="7"
              />
              <div
                class="color-swatch"
                style="background: ${this._isValidHex(text[key]) ? text[key] : '#fff'}"
              ></div>
              <button
                class="btn btn-auto"
                @click=${() => this._autoCalculateTextColor(key)}
                title="Auto-calculate contrast color"
              >Auto</button>
            </div>
          </div>
        `)}
      </div>
      <div class="preview-section">
        <h4>Preview</h4>
        <div class="text-preview-cards">
          <div class="text-preview-card" style="background: ${this._config.tokens.brand.primary}; color: ${text.onPrimary}">
            <span class="text-preview-label">Primary</span>
            <span class="text-preview-text">Sample Text</span>
          </div>
          <div class="text-preview-card" style="background: ${this._config.tokens.brand.secondary}; color: ${text.onSecondary}">
            <span class="text-preview-label">Secondary</span>
            <span class="text-preview-text">Sample Text</span>
          </div>
        </div>
      </div>
    `;
  }

  _autoCalculateTextColor(key) {
    const brandKey = key === 'onPrimary' ? 'primary' : 'secondary';
    const brandColor = this._config?.tokens?.brand?.[brandKey];
    if (!brandColor || !this._isValidHex(brandColor)) return;

    const contrast = getContrastColor(brandColor);
    this._handleColorChange('text', key, contrast);
  }

  _renderStatusColors() {
    const status = this._config?.tokens?.status;
    if (!status) return html`<p class="error-message">Status colors not configured.</p>`;
    return html`
      <h3 class="section-title">Status Colors</h3>
      <div class="color-grid">
        ${Object.entries(STATUS_COLOR_LABELS).map(([key, label]) =>
          this._renderColorPicker('status', key, label, status[key])
        )}
      </div>
      <div class="preview-section">
        <h4>Preview</h4>
        <div class="preview-status-pills">
          ${Object.entries(STATUS_COLOR_LABELS).map(([key, label]) => html`
            <span class="status-pill" style="background: ${status[key]}; color: ${this._isValidHex(status[key]) ? getContrastColor(status[key]) : '#fff'}">${label}</span>
          `)}
        </div>
      </div>
    `;
  }

  _renderBranding() {
    const branding = this._config?.branding || {};
    return html`
      <h3 class="section-title">App Branding</h3>
      <div class="form-group">
        <label>Application Name</label>
        <input
          type="text"
          .value=${branding.appName || ''}
          @input=${(e) => this._handleBrandingChange('appName', e.target.value)}
        />
      </div>
      <div class="form-group">
        <label>Logo URL</label>
        <input
          type="url"
          .value=${branding.logo || ''}
          @input=${(e) => this._handleBrandingChange('logo', e.target.value)}
          placeholder="/images/logo.png"
        />
      </div>
      ${this._renderBrandingColorPicker(branding)}
    `;
  }

  _renderBrandingColorPicker(branding) {
    const value = branding.primaryColor || '#4a9eff';
    const isValid = this._isValidHex(value);
    return html`
      <div class="color-picker-group">
        <label>Theme Color (meta)</label>
        <div class="color-input-wrapper">
          <input
            type="color"
            .value=${isValid ? value : '#000000'}
            @input=${(e) => this._handleBrandingChange('primaryColor', e.target.value)}
          />
          <input
            type="text"
            class="hex-input ${isValid ? '' : 'invalid'}"
            .value=${value}
            @input=${(e) => {
              this._handleBrandingChange('primaryColor', e.target.value);
            }}
            placeholder="#000000"
            maxlength="7"
          />
          <div
            class="color-swatch"
            style="background: ${isValid ? value : '#fff'}"
          ></div>
        </div>
      </div>
    `;
  }

  _renderFeatures() {
    const features = this._config?.features || {};
    return html`
      <h3 class="section-title">Feature Flags</h3>
      <div class="feature-toggle">
        <input
          type="checkbox"
          id="feature-darkMode"
          .checked=${features.darkMode}
          @change=${(e) => this._handleFeatureChange('darkMode', e.target.checked)}
        />
        <div>
          <label for="feature-darkMode">Dark Mode</label>
          <div class="feature-description">Enable dark mode theme support</div>
        </div>
      </div>
    `;
  }
}

customElements.define('theme-editor', ThemeEditor);

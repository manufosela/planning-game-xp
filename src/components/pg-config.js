/**
 * Global configuration management component.
 * Tabs by config type. CRUD, version history, restore.
 *
 * @element pg-config
 * @property {Array} configs - All global config entries
 * @fires config-create - detail: { data }
 * @fires config-update - detail: { configId, data }
 * @fires config-delete - detail: { configId }
 * @fires config-restore - detail: { configId, versionId }
 * @fires config-load-versions - detail: { configId }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-tabs.js';

/** @type {Array<{id: string, label: string}>} */
const CONFIG_TABS = [
  { id: 'agent', label: 'Agents' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'instruction', label: 'Instructions' },
  { id: 'guideline', label: 'Guidelines' },
];

class PgConfig extends LitElement {
  static properties = {
    configs: { type: Array },
    versions: { type: Array },
    _activeTab: { state: true },
    _showForm: { state: true },
    _editingId: { state: true },
    _formData: { state: true },
    _showVersions: { state: true },
    _versionsConfigId: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-md, 0.75rem);
    }

    .header h3 {
      font-size: 1rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      margin: 0;
    }

    .btn {
      padding: var(--space-xs, 0.25rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .btn:hover { background: var(--color-surface-sunken, #f1f5f9); }

    .btn-primary {
      background: var(--color-primary, #4f46e5);
      color: var(--color-primary-text, #fff);
      border-color: var(--color-primary, #4f46e5);
    }

    .btn-primary:hover { background: var(--color-primary-hover, #4338ca); }

    .btn-sm {
      padding: var(--space-2xs, 0.125rem) var(--space-sm, 0.5rem);
      font-size: 0.75rem;
    }

    .btn-danger {
      color: var(--color-error, #dc2626);
      border-color: var(--color-error, #dc2626);
    }

    .btn-danger:hover { background: var(--color-error-subtle, #fef2f2); }

    .tab-section {
      margin-top: var(--space-md, 0.75rem);
    }

    /* Config list */
    .config-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 0.5rem);
    }

    .config-item {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
    }

    .config-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xs, 0.25rem);
    }

    .config-name {
      font-size: 0.875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
    }

    .config-actions {
      display: flex;
      gap: var(--space-xs, 0.25rem);
    }

    .config-desc {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #64748b);
      line-height: 1.5;
    }

    .config-meta {
      display: flex;
      gap: var(--space-md, 0.75rem);
      margin-top: var(--space-xs, 0.25rem);
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
    }

    /* Form */
    .form-panel {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-lg, 1rem);
      margin-bottom: var(--space-lg, 1rem);
    }

    .form-panel h4 {
      font-size: 0.875rem;
      font-weight: var(--font-weight-semibold, 600);
      margin: 0 0 var(--space-md, 0.75rem);
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 0.125rem);
      margin-bottom: var(--space-md, 0.75rem);
    }

    .field-label {
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    input[type="text"],
    textarea {
      width: 100%;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      box-sizing: border-box;
    }

    input:focus, textarea:focus {
      outline: none;
      border-color: var(--color-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    textarea {
      min-height: 10rem;
      resize: vertical;
      font-family: var(--font-mono);
      font-size: 0.75rem;
    }

    .form-row {
      display: flex;
      gap: var(--space-md, 0.75rem);
    }

    .form-row .field-group { flex: 1; }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
      padding-top: var(--space-md, 0.75rem);
      border-top: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    /* Versions panel */
    .versions-panel {
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-md, 0.75rem);
      margin-top: var(--space-sm, 0.5rem);
    }

    .versions-panel h5 {
      font-size: 0.75rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-text-muted, #94a3b8);
      margin: 0 0 var(--space-sm, 0.5rem);
    }

    .version-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-xs, 0.25rem) 0;
      font-size: 0.75rem;
      color: var(--color-text-secondary, #64748b);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .version-item:last-child { border-bottom: none; }

    .empty-msg {
      text-align: center;
      padding: var(--space-xl, 1.5rem);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }
  `;

  constructor() {
    super();
    /** @type {Array<import('../lib/types.d.ts').GlobalConfig & { id: string }>} */
    this.configs = [];
    /** @type {Array<import('../lib/types.d.ts').ConfigVersion & { id: string }>} */
    this.versions = [];
    /** @type {string} */
    this._activeTab = 'agent';
    /** @type {boolean} */
    this._showForm = false;
    /** @type {string | null} */
    this._editingId = null;
    /** @type {Record<string, any>} */
    this._formData = this._defaultForm();
    /** @type {boolean} */
    this._showVersions = false;
    /** @type {string | null} */
    this._versionsConfigId = null;
  }

  _defaultForm() {
    return { name: '', description: '', content: '', category: '', targetFile: '' };
  }

  /** @returns {Array<import('../lib/types.d.ts').GlobalConfig & { id: string }>} */
  get _filteredConfigs() {
    return this.configs.filter((c) => c.type === this._activeTab);
  }

  _openCreate() {
    this._formData = this._defaultForm();
    this._editingId = null;
    this._showForm = true;
  }

  /** @param {import('../lib/types.d.ts').GlobalConfig & { id: string }} config */
  _openEdit(config) {
    this._formData = {
      name: config.name,
      description: config.description,
      content: config.content,
      category: config.category ?? '',
      targetFile: config.targetFile ?? '',
    };
    this._editingId = config.id;
    this._showForm = true;
  }

  _cancelForm() {
    this._showForm = false;
    this._editingId = null;
  }

  _submitForm() {
    if (!this._formData.name.trim()) return;

    const data = {
      type: this._activeTab,
      name: this._formData.name.trim(),
      description: this._formData.description.trim(),
      content: this._formData.content,
      category: this._formData.category.trim() || undefined,
      targetFile: this._formData.targetFile.trim() || undefined,
    };

    if (this._editingId) {
      this.dispatchEvent(new CustomEvent('config-update', {
        detail: { configId: this._editingId, data },
        bubbles: true, composed: true,
      }));
    } else {
      this.dispatchEvent(new CustomEvent('config-create', {
        detail: { data },
        bubbles: true, composed: true,
      }));
    }
    this._showForm = false;
    this._editingId = null;
  }

  /** @param {string} configId */
  _deleteConfig(configId) {
    this.dispatchEvent(new CustomEvent('config-delete', {
      detail: { configId },
      bubbles: true, composed: true,
    }));
  }

  /** @param {string} configId */
  _toggleVersions(configId) {
    if (this._versionsConfigId === configId && this._showVersions) {
      this._showVersions = false;
      this._versionsConfigId = null;
    } else {
      this._versionsConfigId = configId;
      this._showVersions = true;
      this.dispatchEvent(new CustomEvent('config-load-versions', {
        detail: { configId },
        bubbles: true, composed: true,
      }));
    }
  }

  /**
   * @param {string} configId
   * @param {string} versionId
   */
  _restoreVersion(configId, versionId) {
    this.dispatchEvent(new CustomEvent('config-restore', {
      detail: { configId, versionId },
      bubbles: true, composed: true,
    }));
  }

  render() {
    const tabsData = CONFIG_TABS.map((t) => ({
      ...t,
      count: this.configs.filter((c) => c.type === t.id).length,
    }));

    return html`
      <div class="header">
        <h3>Global Configuration</h3>
        ${!this._showForm ? html`
          <button class="btn btn-primary btn-sm" @click=${this._openCreate}>+ New Config</button>
        ` : nothing}
      </div>

      <pg-tabs .tabs=${tabsData} .active=${this._activeTab}
        @tab-change=${(/** @type {CustomEvent} */ e) => { this._activeTab = e.detail.tab; this._showVersions = false; }}
      ></pg-tabs>

      <div class="tab-section">
        ${this._showForm ? this._renderForm() : nothing}

        ${this._filteredConfigs.length === 0 && !this._showForm ? html`
          <div class="empty-msg">No ${this._activeTab} configs yet.</div>
        ` : nothing}

        <div class="config-list">
          ${this._filteredConfigs.map((config) => this._renderConfigItem(config))}
        </div>
      </div>
    `;
  }

  /** @param {import('../lib/types.d.ts').GlobalConfig & { id: string }} config */
  _renderConfigItem(config) {
    const showVersions = this._showVersions && this._versionsConfigId === config.id;
    const isGuideline = config.type === 'guideline';

    return html`
      <div class="config-item">
        <div class="config-item-header">
          <span class="config-name">${config.name}</span>
          <div class="config-actions">
            ${isGuideline ? html`
              <button class="btn btn-sm" @click=${() => this._toggleVersions(config.id)}>
                ${showVersions ? 'Hide History' : 'History'}
              </button>
            ` : nothing}
            <button class="btn btn-sm" @click=${() => this._openEdit(config)}>Edit</button>
            <button class="btn btn-sm btn-danger" @click=${() => this._deleteConfig(config.id)}>Delete</button>
          </div>
        </div>
        ${config.description ? html`<div class="config-desc">${config.description}</div>` : nothing}
        <div class="config-meta">
          ${config.category ? html`<span>Category: ${config.category}</span>` : nothing}
          ${isGuideline ? html`<span>v${config.version ?? 1}</span>` : nothing}
          ${config.targetFile ? html`<span>File: ${config.targetFile}</span>` : nothing}
        </div>

        ${showVersions ? html`
          <div class="versions-panel">
            <h5>Version History</h5>
            ${this.versions.length === 0 ? html`<div style="font-size: 0.75rem; color: var(--color-text-muted)">No previous versions.</div>` : nothing}
            ${this.versions.map((v) => html`
              <div class="version-item">
                <span>v${v.version}</span>
                <button class="btn btn-sm" @click=${() => this._restoreVersion(config.id, v.id)}>Restore</button>
              </div>
            `)}
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderForm() {
    const f = this._formData;
    return html`
      <div class="form-panel">
        <h4>${this._editingId ? 'Edit Config' : `New ${this._activeTab} Config`}</h4>
        <div class="field-group">
          <label class="field-label">Name</label>
          <input type="text" .value=${f.name}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, name: /** @type {HTMLInputElement} */ (e.target).value }; }} />
        </div>
        <div class="field-group">
          <label class="field-label">Description</label>
          <input type="text" .value=${f.description}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, description: /** @type {HTMLInputElement} */ (e.target).value }; }} />
        </div>
        <div class="form-row">
          <div class="field-group">
            <label class="field-label">Category</label>
            <input type="text" .value=${f.category}
              @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, category: /** @type {HTMLInputElement} */ (e.target).value }; }} />
          </div>
          <div class="field-group">
            <label class="field-label">Target File</label>
            <input type="text" .value=${f.targetFile}
              @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, targetFile: /** @type {HTMLInputElement} */ (e.target).value }; }} />
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Content (markdown)</label>
          <textarea .value=${f.content}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, content: /** @type {HTMLTextAreaElement} */ (e.target).value }; }}
            placeholder="Configuration content..."></textarea>
        </div>
        <div class="form-actions">
          <button class="btn" @click=${this._cancelForm}>Cancel</button>
          <button class="btn btn-primary" @click=${this._submitForm}>${this._editingId ? 'Save' : 'Create'}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('pg-config', PgConfig);

export { PgConfig };

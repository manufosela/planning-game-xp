/**
 * Global Config List Component
 * Displays a list of global configs with sidebar for type selection
 */
import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { GlobalConfigListStyles } from './global-config-list-styles.js';
import { globalConfigService, CONFIG_TYPES, CONFIG_CATEGORIES } from '../services/global-config-service.js';
import { demoModeService } from '../services/demo-mode-service.js';
import './GlobalConfigCard.js';

export class GlobalConfigList extends LitElement {
  static get properties() {
    return {
      activeType: { type: String, attribute: 'active-type' },
      configs: { type: Array },
      typeCounts: { type: Object },
      loading: { type: Boolean },
      categoryFilter: { type: String },
      canEdit: { type: Boolean, attribute: 'can-edit' }
    };
  }

  static get styles() {
    return [GlobalConfigListStyles];
  }

  constructor() {
    super();
    this.activeType = 'agents';
    this.configs = [];
    this.typeCounts = { agents: 0, prompts: 0, instructions: 0 };
    this.loading = false;
    this.categoryFilter = '';
    this.canEdit = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadAllCounts();
    this.loadConfigs();
  }

  /**
   * Load counts for all types
   */
  async loadAllCounts() {
    for (const type of CONFIG_TYPES) {
      try {
        const items = await globalConfigService.getAllConfigs(type);
        this.typeCounts = {
          ...this.typeCounts,
          [type]: items.length
        };
      } catch (error) {
        console.error(`Error loading count for ${type}:`, error);
      }
    }
    this.requestUpdate();
  }

  /**
   * Load configs for active type
   */
  async loadConfigs() {
    this.loading = true;
    try {
      this.configs = await globalConfigService.getAllConfigs(this.activeType);
      this.typeCounts = {
        ...this.typeCounts,
        [this.activeType]: this.configs.length
      };
    } catch (error) {
      console.error('Error loading configs:', error);
      this.configs = [];
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get filtered configs
   */
  get filteredConfigs() {
    if (!this.categoryFilter) {
      return this.configs;
    }
    return this.configs.filter(c => c.category === this.categoryFilter);
  }

  /**
   * Get type icon
   */
  _getTypeIcon(type) {
    switch (type) {
      case 'agents': return '🤖';
      case 'prompts': return '💬';
      case 'instructions': return '📋';
      default: return '📄';
    }
  }

  /**
   * Get type label
   */
  _getTypeLabel(type) {
    switch (type) {
      case 'agents': return 'Agents';
      case 'prompts': return 'Prompts';
      case 'instructions': return 'Instructions';
      default: return type;
    }
  }

  /**
   * Handle type change
   */
  _handleTypeChange(type) {
    this.activeType = type;
    this.categoryFilter = '';
    this.loadConfigs();
  }

  /**
   * Handle category filter change
   */
  _handleCategoryFilter(e) {
    this.categoryFilter = e.target.value;
  }

  /**
   * Create new config
   */
  async _createNew() {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('config creation'); return; }
    const singularType = this.activeType.slice(0, -1);
    try {
      const newConfig = await globalConfigService.saveConfig(this.activeType, {
        name: `New ${singularType}`,
        description: '',
        content: '',
        category: 'development'
      });

      await this.loadConfigs();
      await this.loadAllCounts();

      this.dispatchEvent(new CustomEvent('config-created', {
        detail: { config: newConfig },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('Error creating config:', error);
    }
  }

  /**
   * Handle save event from card
   */
  async _handleSave(e) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('config editing'); return; }
    const { configId, configType, name, description, content, category } = e.detail;

    try {
      await globalConfigService.saveConfig(configType, {
        id: configId,
        name,
        description,
        content,
        category
      });

      await this.loadConfigs();

      this.dispatchEvent(new CustomEvent('config-saved', {
        detail: e.detail,
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  /**
   * Handle delete event from card
   */
  async _handleDelete(e) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('config deletion'); return; }
    const { configId, configType, name } = e.detail;

    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await globalConfigService.deleteConfig(configType, configId);

      await this.loadConfigs();
      await this.loadAllCounts();

      this.dispatchEvent(new CustomEvent('config-deleted', {
        detail: e.detail,
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('Error deleting config:', error);
    }
  }

  render() {
    const singularType = this.activeType.slice(0, -1);

    return html`
      <div class="config-list-container">
        <aside class="sidebar">
          <div class="sidebar-title">Configuration Types</div>
          <div class="type-tabs">
            ${CONFIG_TYPES.map(type => html`
              <button
                class="type-tab ${this.activeType === type ? 'active' : ''}"
                @click=${() => this._handleTypeChange(type)}
              >
                <span>${this._getTypeIcon(type)}</span>
                <span>${this._getTypeLabel(type)}</span>
                <span class="type-count">${this.typeCounts[type] || 0}</span>
              </button>
            `)}
          </div>
        </aside>

        <main class="main-content">
          <div class="content-header">
            <h2 class="content-title">
              ${this._getTypeIcon(this.activeType)} ${this._getTypeLabel(this.activeType)}
            </h2>
            <div class="content-actions">
              <select class="filter-select" @change=${this._handleCategoryFilter}>
                <option value="">All categories</option>
                ${CONFIG_CATEGORIES.map(cat => html`
                  <option value=${cat}>${cat}</option>
                `)}
              </select>
              ${this.canEdit ? html`
                <button class="btn-new" @click=${this._createNew}>
                  <span>+</span> New ${singularType}
                </button>
              ` : ''}
            </div>
          </div>

          ${this.loading ? html`
            <div class="loading">Loading ${this.activeType}...</div>
          ` : this.filteredConfigs.length === 0 ? html`
            <div class="empty-state">
              <div class="empty-icon">${this._getTypeIcon(this.activeType)}</div>
              <div class="empty-text">
                ${this.configs.length === 0
                  ? `No ${this.activeType} configured yet.`
                  : `No ${this.activeType} in category "${this.categoryFilter}".`}
              </div>
              ${this.canEdit && this.configs.length === 0 ? html`
                <button class="btn-new" @click=${this._createNew}>
                  Create your first ${singularType}
                </button>
              ` : ''}
            </div>
          ` : html`
            ${this.filteredConfigs.map(config => html`
              <global-config-card
                config-id=${config.id}
                config-type=${this.activeType}
                .name=${config.name}
                .description=${config.description}
                .content=${config.content}
                .category=${config.category}
                .createdAt=${config.createdAt}
                .createdBy=${config.createdBy}
                .updatedAt=${config.updatedAt}
                .updatedBy=${config.updatedBy}
                ?can-edit=${this.canEdit}
                @config-save=${this._handleSave}
                @config-delete=${this._handleDelete}
              ></global-config-card>
            `)}
          `}
        </main>
      </div>
    `;
  }
}

customElements.define('global-config-list', GlobalConfigList);

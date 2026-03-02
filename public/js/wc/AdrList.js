/**
 * ADR List Component
 * Displays a list of Architecture Decision Records for a project
 */
import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { AdrListStyles } from './adr-list-styles.js';
import { adrService, ADR_STATUSES } from '../services/adr-service.js';
import { demoModeService } from '../services/demo-mode-service.js';
import './AdrCard.js';

export class AdrList extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id' },
      adrs: { type: Array },
      loading: { type: Boolean },
      statusFilter: { type: String },
      canEdit: { type: Boolean, attribute: 'can-edit' }
    };
  }

  static get styles() {
    return [AdrListStyles];
  }

  constructor() {
    super();
    this.projectId = '';
    this.adrs = [];
    this.loading = false;
    this.statusFilter = '';
    this.canEdit = true;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.projectId) {
      this.loadAdrs();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('projectId') && this.projectId) {
      this.loadAdrs();
    }
  }

  /**
   * Load ADRs from service
   */
  async loadAdrs() {
    if (!this.projectId) return;

    this.loading = true;
    try {
      this.adrs = await adrService.getAllAdrs(this.projectId);
    } catch (error) {
      console.error('Error loading ADRs:', error);
      this.adrs = [];
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get filtered ADRs
   */
  get filteredAdrs() {
    if (!this.statusFilter) {
      return this.adrs;
    }
    return this.adrs.filter(adr => adr.status === this.statusFilter);
  }

  /**
   * Get stats by status
   */
  get stats() {
    const stats = {};
    for (const status of ADR_STATUSES) {
      stats[status] = this.adrs.filter(adr => adr.status === status).length;
    }
    return stats;
  }

  /**
   * Handle filter change
   */
  _handleFilterChange(e) {
    this.statusFilter = e.target.value;
  }

  /**
   * Create new ADR
   */
  async _createNew() {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('ADR creation'); return; }
    try {
      const newAdr = await adrService.saveAdr(this.projectId, {
        title: 'New Architecture Decision',
        context: '',
        decision: '',
        consequences: '',
        status: 'proposed'
      });

      // Reload list and expand the new one
      await this.loadAdrs();

      // Dispatch event for parent to handle
      this.dispatchEvent(new CustomEvent('adr-created', {
        detail: { adr: newAdr },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('Error creating ADR:', error);
    }
  }

  /**
   * Handle save event from card
   */
  async _handleSave(e) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('ADR editing'); return; }
    const { adrId, projectId, title, context, decision, consequences, status } = e.detail;

    try {
      await adrService.saveAdr(projectId, {
        id: adrId,
        title,
        context,
        decision,
        consequences,
        status
      });

      // Reload to get updated data
      await this.loadAdrs();

      this.dispatchEvent(new CustomEvent('adr-saved', {
        detail: e.detail,
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('Error saving ADR:', error);
    }
  }

  /**
   * Handle delete event from card
   */
  async _handleDelete(e) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('ADR deletion'); return; }
    const { adrId, projectId, title } = e.detail;

    // Confirm deletion using modal service
    if (window.modalService?.confirm) {
      const confirmed = await window.modalService.confirm(`Are you sure you want to delete "${title}"?`);
      if (!confirmed) return;
    }

    try {
      await adrService.deleteAdr(projectId, adrId);

      // Reload list
      await this.loadAdrs();

      this.dispatchEvent(new CustomEvent('adr-deleted', {
        detail: e.detail,
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('Error deleting ADR:', error);
    }
  }

  render() {
    return html`
      <div class="adr-list-container">
        <div class="adr-list-header">
          <h2 class="adr-list-title">Architecture Decision Records</h2>
          <div class="adr-list-actions">
            <select class="adr-filter" @change=${this._handleFilterChange}>
              <option value="">All statuses</option>
              ${ADR_STATUSES.map(status => html`
                <option value=${status}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>
              `)}
            </select>
            ${this.canEdit ? html`
              <button class="btn-new-adr" @click=${this._createNew}>
                <span>+</span> New ADR
              </button>
            ` : ''}
          </div>
        </div>

        ${this.adrs.length > 0 ? html`
          <div class="adr-stats">
            ${Object.entries(this.stats).map(([status, count]) => html`
              <div class="adr-stat ${status}">
                <span class="adr-stat-count">${count}</span>
                <span class="adr-stat-label">${status}</span>
              </div>
            `)}
          </div>
        ` : ''}

        ${this.loading ? html`
          <div class="loading-indicator">Loading ADRs...</div>
        ` : this.filteredAdrs.length === 0 ? html`
          <div class="adr-list-empty">
            <div class="adr-list-empty-icon">📋</div>
            <div class="adr-list-empty-text">
              ${this.adrs.length === 0
                ? 'No ADRs recorded for this project yet.'
                : `No ADRs with status "${this.statusFilter}".`}
            </div>
            ${this.canEdit && this.adrs.length === 0 ? html`
              <button class="btn-new-adr" @click=${this._createNew}>
                Create your first ADR
              </button>
            ` : ''}
          </div>
        ` : html`
          ${this.filteredAdrs.map(adr => html`
            <adr-card
              adr-id=${adr.id}
              project-id=${this.projectId}
              .title=${adr.title}
              .context=${adr.context}
              .decision=${adr.decision}
              .consequences=${adr.consequences}
              .status=${adr.status}
              .supersededBy=${adr.supersededBy}
              .createdAt=${adr.createdAt}
              .createdBy=${adr.createdBy}
              .updatedAt=${adr.updatedAt}
              .updatedBy=${adr.updatedBy}
              ?can-edit=${this.canEdit}
              @adr-save=${this._handleSave}
              @adr-delete=${this._handleDelete}
            ></adr-card>
          `)}
        `}
      </div>
    `;
  }
}

customElements.define('adr-list', AdrList);

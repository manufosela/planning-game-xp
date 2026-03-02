/**
 * EntityDirectoryManager
 *
 * Admin UI component for managing global developers and stakeholders.
 * Uses entity-directory-service for CRUD operations.
 * Only visible to SuperAdmin users.
 */
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { EntityDirectoryManagerStyles } from './entity-directory-manager-styles.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { modalService } from '../services/modal-service.js';

class EntityDirectoryManager extends LitElement {
  static get properties() {
    return {
      developers: { type: Array, state: true },
      stakeholders: { type: Array, state: true },
      teams: { type: Array, state: true },
      loading: { type: Boolean, state: true },
      // Form state
      _showDevForm: { type: Boolean, state: true },
      _showStkForm: { type: Boolean, state: true },
      _editingDevId: { type: String, state: true },
      _editingStkId: { type: String, state: true },
      // Form field values
      _devName: { type: String, state: true },
      _devEmail: { type: String, state: true },
      _devActive: { type: Boolean, state: true },
      _stkName: { type: String, state: true },
      _stkEmail: { type: String, state: true },
      _stkTeamId: { type: String, state: true },
      _stkActive: { type: Boolean, state: true },
    };
  }

  static get styles() {
    return [EntityDirectoryManagerStyles];
  }

  constructor() {
    super();
    this.developers = [];
    this.stakeholders = [];
    this.teams = [];
    this.loading = false;
    this._showDevForm = false;
    this._showStkForm = false;
    this._editingDevId = null;
    this._editingStkId = null;
    this._resetDevForm();
    this._resetStkForm();
    this._removeChangeListener = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
    this._removeChangeListener = entityDirectoryService.addChangeListener((type) => {
      if (type === 'developers' || type === 'stakeholders' || type === 'teams') {
        this._refreshData();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._removeChangeListener) {
      this._removeChangeListener();
      this._removeChangeListener = null;
    }
  }

  async _loadData() {
    this.loading = true;
    try {
      await entityDirectoryService.waitForInit();
      this._refreshData();
    } catch (error) {
      console.error('Error loading entity directory data:', error);
    } finally {
      this.loading = false;
    }
  }

  _refreshData() {
    this.developers = entityDirectoryService.getAllDevelopers()
      .sort((a, b) => a.id.localeCompare(b.id));
    this.stakeholders = entityDirectoryService.getAllStakeholders()
      .sort((a, b) => a.id.localeCompare(b.id));
    this.teams = entityDirectoryService.getAllTeams();
  }

  // ==================== DEVELOPER CRUD ====================

  _resetDevForm() {
    this._devName = '';
    this._devEmail = '';
    this._devActive = true;
    this._editingDevId = null;
  }

  _openNewDevForm() {
    this._resetDevForm();
    this._showDevForm = true;
  }

  _openEditDevForm(dev) {
    this._editingDevId = dev.id;
    this._devName = dev.name || '';
    this._devEmail = dev.email || '';
    this._devActive = dev.active !== false;
    this._showDevForm = true;
  }

  _cancelDevForm() {
    this._showDevForm = false;
    this._resetDevForm();
  }

  async _saveDeveloper() {
    const name = this._devName.trim();
    const email = this._devEmail.trim();
    if (!name || !email) return;

    try {
      if (this._editingDevId) {
        await entityDirectoryService.saveDeveloper(this._editingDevId, {
          name,
          email,
          active: this._devActive,
          emails: entityDirectoryService.getDeveloper(this._editingDevId)?.emails || [],
        });
      } else {
        await entityDirectoryService.createDeveloper(email, name);
      }
      this._showDevForm = false;
      this._resetDevForm();
      this._refreshData();
    } catch (error) {
      console.error('Error saving developer:', error);
    }
  }

  async _deleteDeveloper(dev) {
    const confirmed = await modalService.confirm(
      `Delete developer "${dev.name}" (${dev.id})?`,
      'This action cannot be undone. The developer will be removed from the global directory.'
    );
    if (!confirmed) return;

    try {
      await entityDirectoryService.deleteDeveloper(dev.id);
      this._refreshData();
    } catch (error) {
      console.error('Error deleting developer:', error);
    }
  }

  // ==================== STAKEHOLDER CRUD ====================

  _resetStkForm() {
    this._stkName = '';
    this._stkEmail = '';
    this._stkTeamId = '';
    this._stkActive = true;
    this._editingStkId = null;
  }

  _openNewStkForm() {
    this._resetStkForm();
    this._showStkForm = true;
  }

  _openEditStkForm(stk) {
    this._editingStkId = stk.id;
    this._stkName = stk.name || '';
    this._stkEmail = stk.email || '';
    this._stkTeamId = stk.teamId || '';
    this._stkActive = stk.active !== false;
    this._showStkForm = true;
  }

  _cancelStkForm() {
    this._showStkForm = false;
    this._resetStkForm();
  }

  async _saveStakeholder() {
    const name = this._stkName.trim();
    const email = this._stkEmail.trim();
    if (!name || !email) return;

    try {
      if (this._editingStkId) {
        await entityDirectoryService.saveStakeholder(this._editingStkId, {
          name,
          email,
          teamId: this._stkTeamId || null,
          active: this._stkActive,
        });
      } else {
        const id = entityDirectoryService.generateStakeholderId();
        await entityDirectoryService.saveStakeholder(id, {
          name,
          email,
          teamId: this._stkTeamId || null,
          active: true,
        });
      }
      this._showStkForm = false;
      this._resetStkForm();
      this._refreshData();
    } catch (error) {
      console.error('Error saving stakeholder:', error);
    }
  }

  async _deleteStakeholder(stk) {
    const confirmed = await modalService.confirm(
      `Delete stakeholder "${stk.name}" (${stk.id})?`,
      'This action cannot be undone. The stakeholder will be removed from the global directory.'
    );
    if (!confirmed) return;

    try {
      await entityDirectoryService.deleteStakeholder(stk.id);
      this._refreshData();
    } catch (error) {
      console.error('Error deleting stakeholder:', error);
    }
  }

  // ==================== RENDER ====================

  render() {
    if (this.loading) {
      return html`<div class="loading-message">Loading entity directory</div>`;
    }

    return html`
      <div class="entity-manager-container">
        <color-tabs active-tab="developers">
          <color-tab name="developers" label="Developers (${this.developers.length})" color="var(--brand-primary, #3b82f6)">
            ${this._renderDevelopersSection()}
          </color-tab>
          <color-tab name="stakeholders" label="Stakeholders (${this.stakeholders.length})" color="var(--brand-secondary, #ec3e95)">
            ${this._renderStakeholdersSection()}
          </color-tab>
        </color-tabs>
      </div>
    `;
  }

  _renderDevelopersSection() {
    return html`
      <div class="entity-section-header">
        <span class="entity-count">${this.developers.length} developers in directory</span>
        <button class="btn btn-primary btn-sm" @click=${this._openNewDevForm}>+ Add Developer</button>
      </div>

      ${this._showDevForm ? this._renderDevForm() : nothing}

      ${this.developers.length === 0
        ? html`<div class="empty-message">No developers found</div>`
        : html`
          <table class="entity-table">
            <thead>
              <tr>
                <th class="col-id">ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Alt. Emails</th>
                <th>Active</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.developers.map(dev => this._renderDevRow(dev))}
            </tbody>
          </table>
        `}
    `;
  }

  _renderDevRow(dev) {
    const altEmailCount = (dev.emails || []).filter(e => e !== dev.email).length;
    return html`
      <tr>
        <td class="col-id">${dev.id}</td>
        <td>${dev.name}</td>
        <td>${dev.email}</td>
        <td>
          ${altEmailCount > 0
            ? html`<span class="badge badge-count">${altEmailCount}</span>`
            : html`<span style="color: var(--text-tertiary, #9ca3af);">—</span>`}
        </td>
        <td>
          <span class="badge ${dev.active ? 'badge-active' : 'badge-inactive'}">
            ${dev.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td class="col-actions">
          <div class="actions-cell">
            <button class="btn btn-secondary btn-sm" @click=${() => this._openEditDevForm(dev)} title="Edit">✏️</button>
            <button class="btn btn-danger btn-sm" @click=${() => this._deleteDeveloper(dev)} title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }

  _renderDevForm() {
    const isEditing = Boolean(this._editingDevId);
    return html`
      <div class="entity-form">
        <h4 class="form-title">${isEditing ? `Edit Developer (${this._editingDevId})` : 'New Developer'}</h4>
        <div class="form-grid">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" .value=${this._devName}
              @input=${(e) => { this._devName = e.target.value; }}
              placeholder="Full name" required>
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" .value=${this._devEmail}
              @input=${(e) => { this._devEmail = e.target.value; }}
              placeholder="email@example.com" required>
          </div>
          <div class="form-group form-checkbox">
            <input type="checkbox" id="devActiveCheck" .checked=${this._devActive}
              @change=${(e) => { this._devActive = e.target.checked; }}>
            <label for="devActiveCheck">Active</label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click=${this._cancelDevForm}>Cancel</button>
          <button class="btn btn-primary" @click=${this._saveDeveloper}
            ?disabled=${!this._devName.trim() || !this._devEmail.trim()}>
            ${isEditing ? 'Save Changes' : 'Create Developer'}
          </button>
        </div>
      </div>
    `;
  }

  _renderStakeholdersSection() {
    return html`
      <div class="entity-section-header">
        <span class="entity-count">${this.stakeholders.length} stakeholders in directory</span>
        <button class="btn btn-primary btn-sm" @click=${this._openNewStkForm}>+ Add Stakeholder</button>
      </div>

      ${this._showStkForm ? this._renderStkForm() : nothing}

      ${this.stakeholders.length === 0
        ? html`<div class="empty-message">No stakeholders found</div>`
        : html`
          <table class="entity-table">
            <thead>
              <tr>
                <th class="col-id">ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Team</th>
                <th>Active</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.stakeholders.map(stk => this._renderStkRow(stk))}
            </tbody>
          </table>
        `}
    `;
  }

  _renderStkRow(stk) {
    const teamName = stk.teamId
      ? (entityDirectoryService.getTeam(stk.teamId)?.name || stk.teamId)
      : '—';
    return html`
      <tr>
        <td class="col-id">${stk.id}</td>
        <td>${stk.name}</td>
        <td>${stk.email}</td>
        <td>${teamName}</td>
        <td>
          <span class="badge ${stk.active ? 'badge-active' : 'badge-inactive'}">
            ${stk.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td class="col-actions">
          <div class="actions-cell">
            <button class="btn btn-secondary btn-sm" @click=${() => this._openEditStkForm(stk)} title="Edit">✏️</button>
            <button class="btn btn-danger btn-sm" @click=${() => this._deleteStakeholder(stk)} title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }

  _renderStkForm() {
    const isEditing = Boolean(this._editingStkId);
    return html`
      <div class="entity-form">
        <h4 class="form-title">${isEditing ? `Edit Stakeholder (${this._editingStkId})` : 'New Stakeholder'}</h4>
        <div class="form-grid">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" .value=${this._stkName}
              @input=${(e) => { this._stkName = e.target.value; }}
              placeholder="Full name" required>
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" .value=${this._stkEmail}
              @input=${(e) => { this._stkEmail = e.target.value; }}
              placeholder="email@example.com" required>
          </div>
          <div class="form-group">
            <label>Team</label>
            <select .value=${this._stkTeamId}
              @change=${(e) => { this._stkTeamId = e.target.value; }}>
              <option value="">— No team —</option>
              ${this.teams.map(t => html`
                <option value=${t.id} ?selected=${this._stkTeamId === t.id}>${t.name}</option>
              `)}
            </select>
          </div>
          <div class="form-group form-checkbox">
            <input type="checkbox" id="stkActiveCheck" .checked=${this._stkActive}
              @change=${(e) => { this._stkActive = e.target.checked; }}>
            <label for="stkActiveCheck">Active</label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click=${this._cancelStkForm}>Cancel</button>
          <button class="btn btn-primary" @click=${this._saveStakeholder}
            ?disabled=${!this._stkName.trim() || !this._stkEmail.trim()}>
            ${isEditing ? 'Save Changes' : 'Create Stakeholder'}
          </button>
        </div>
      </div>
    `;
  }
  // ==================== ALLOWED USERS RENDER ====================

}

customElements.define('entity-directory-manager', EntityDirectoryManager);

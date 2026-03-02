/**
 * PlanProposalsList Component
 * Displays a list of plan proposals with CRUD operations.
 * Allows filtering by status, creating/editing proposals,
 * and generating plans from planned proposals.
 */
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { PlanProposalsListStyles } from './plan-proposals-list-styles.js';
import { planProposalService, PROPOSAL_STATUSES } from '../services/plan-proposal-service.js';
import { demoModeService } from '../services/demo-mode-service.js';

export class PlanProposalsList extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id' },
      proposals: { type: Array },
      loading: { type: Boolean },
      statusFilter: { type: String },
      currentView: { type: String },
      editingProposal: { type: Object },
      formTags: { type: Array },
      formError: { type: String }
    };
  }

  static get styles() {
    return [PlanProposalsListStyles];
  }

  constructor() {
    super();
    this.projectId = '';
    this.proposals = [];
    this.loading = false;
    this.statusFilter = '';
    this.currentView = 'list';
    this.editingProposal = null;
    this.formTags = [];
    this.formError = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.projectId) {
      this.loadProposals();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('projectId') && this.projectId) {
      this.loadProposals();
    }
  }

  async loadProposals() {
    if (!this.projectId) return;
    this.loading = true;
    try {
      this.proposals = await planProposalService.getAll(this.projectId);
    } catch (error) {
      console.error('Error loading proposals:', error);
      this.proposals = [];
    } finally {
      this.loading = false;
    }
  }

  get filteredProposals() {
    if (!this.statusFilter) return this.proposals;
    return this.proposals.filter(p => p.status === this.statusFilter);
  }

  _handleFilterChange(e) {
    this.statusFilter = e.target.value;
  }

  _showForm(proposal = null) {
    this.editingProposal = proposal;
    this.formTags = proposal?.tags ? [...proposal.tags] : [];
    this.formError = '';
    this.currentView = 'form';
  }

  _cancelForm() {
    this.editingProposal = null;
    this.formTags = [];
    this.formError = '';
    this.currentView = 'list';
  }

  _addTag(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = e.target.value.trim().replace(/,/g, '');
      if (value && !this.formTags.includes(value)) {
        this.formTags = [...this.formTags, value];
      }
      e.target.value = '';
    }
  }

  _removeTag(tag) {
    this.formTags = this.formTags.filter(t => t !== tag);
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('proposal editing'); return; }
    const form = e.target;
    const title = form.querySelector('#proposalTitle').value.trim();
    const description = form.querySelector('#proposalDescription').value.trim();
    const status = form.querySelector('#proposalStatus').value;
    const sourceDocumentUrl = form.querySelector('#proposalSourceUrl').value.trim();

    if (!title) {
      this.formError = 'Title is required.';
      return;
    }
    if (title.length > 200) {
      this.formError = 'Title must be 200 characters or less.';
      return;
    }
    if (description.length > 5000) {
      this.formError = 'Description must be 5000 characters or less.';
      return;
    }

    this.formError = '';

    try {
      await planProposalService.save(this.projectId, {
        id: this.editingProposal?.id,
        title,
        description,
        status,
        tags: this.formTags,
        sourceDocumentUrl
      });
      this._cancelForm();
      await this.loadProposals();
    } catch (error) {
      this.formError = error.message;
    }
  }

  async _handleDelete(proposal) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('proposal deletion'); return; }
    if (window.modalService?.confirm) {
      const confirmed = await window.modalService.confirm(`Are you sure you want to delete "${proposal.title}"?`);
      if (!confirmed) return;
    }

    try {
      await planProposalService.delete(this.projectId, proposal.id);
      await this.loadProposals();
    } catch (error) {
      console.error('Error deleting proposal:', error);
    }
  }

  _handleGeneratePlan(proposal) {
    this.dispatchEvent(new CustomEvent('generate-plan-from-proposal', {
      detail: {
        proposalId: proposal.id,
        title: proposal.title,
        description: proposal.description
      },
      bubbles: true,
      composed: true
    }));
  }

  _renderList() {
    if (this.loading) {
      return html`<div class="loading-indicator">Loading proposals...</div>`;
    }

    if (this.filteredProposals.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">
            ${this.proposals.length === 0
              ? 'No proposals yet.'
              : `No proposals with status "${this.statusFilter}".`}
          </div>
          ${this.proposals.length === 0 ? html`
            <button class="btn-primary" @click=${() => this._showForm()}>
              Create your first proposal
            </button>
          ` : nothing}
        </div>
      `;
    }

    return html`
      <table class="proposals-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Title</th>
            <th>Tags</th>
            <th>Plans</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.filteredProposals.map(p => this._renderRow(p))}
        </tbody>
      </table>
    `;
  }

  _renderRow(proposal) {
    const statusClass = `status-${proposal.status}`;
    const statusLabel = proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1);
    const createdDate = proposal.createdAt
      ? new Date(proposal.createdAt).toLocaleDateString('es-ES')
      : '';
    const planCount = (proposal.planIds || []).length;

    return html`
      <tr @click=${(e) => { if (!e.target.closest('.action-btn')) this._showForm(proposal); }}>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td class="title-cell" title=${proposal.description || ''}>${proposal.title}</td>
        <td>${(proposal.tags || []).map(t => html`<span class="tag">${t}</span>`)}</td>
        <td class="center-cell">${planCount > 0 ? planCount : '-'}</td>
        <td class="date-cell">${createdDate}</td>
        <td class="actions-cell">
          <button class="action-btn" @click=${() => this._showForm(proposal)} title="Edit">✏️</button>
          ${proposal.status === 'planned' || proposal.status === 'pending' ? html`
            <button class="action-btn" @click=${() => this._handleGeneratePlan(proposal)} title="Generate Plan">⚡</button>
          ` : nothing}
          <button class="action-btn" @click=${() => this._handleDelete(proposal)} title="Delete">🗑</button>
        </td>
      </tr>
    `;
  }

  _renderForm() {
    const isEdit = !!this.editingProposal;
    const proposal = this.editingProposal || {};

    return html`
      <div class="form-container">
        <div class="form-header">
          <h2>${isEdit ? 'Edit Proposal' : 'New Proposal'}</h2>
          <button class="btn-secondary" @click=${this._cancelForm}>Cancel</button>
        </div>
        ${this.formError ? html`<div class="error-message">${this.formError}</div>` : nothing}
        <form @submit=${this._handleSubmit}>
          <div class="form-field">
            <label for="proposalTitle">Title *</label>
            <input type="text" id="proposalTitle" required maxlength="200"
              .value=${proposal.title || ''}
              placeholder="e.g. Notification system for task changes" />
            <div class="char-count"><span>${(proposal.title || '').length}</span>/200</div>
          </div>
          <div class="form-field">
            <label for="proposalDescription">Description</label>
            <textarea id="proposalDescription" rows="6" maxlength="5000"
              .value=${proposal.description || ''}
              placeholder="Describe the proposal in detail..."></textarea>
            <div class="char-count"><span>${(proposal.description || '').length}</span>/5000</div>
          </div>
          <div class="form-field">
            <label for="proposalStatus">Status</label>
            <select id="proposalStatus" .value=${proposal.status || 'pending'}>
              ${PROPOSAL_STATUSES.map(s => html`
                <option value=${s} ?selected=${(proposal.status || 'pending') === s}>
                  ${s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              `)}
            </select>
          </div>
          <div class="form-field">
            <label>Tags</label>
            <div class="tags-input-container" @click=${(e) => e.currentTarget.querySelector('.tags-text-input')?.focus()}>
              ${this.formTags.map(tag => html`
                <span class="tag-chip">
                  ${tag}
                  <button type="button" class="tag-chip-remove" @click=${() => this._removeTag(tag)}>×</button>
                </span>
              `)}
              <input type="text" class="tags-text-input"
                placeholder=${this.formTags.length === 0 ? 'Type and press Enter...' : ''}
                @keydown=${this._addTag} />
            </div>
            <div class="tags-hint">Press Enter or comma to add a tag</div>
          </div>
          <div class="form-field">
            <label for="proposalSourceUrl">Source Document URL</label>
            <input type="url" id="proposalSourceUrl"
              .value=${proposal.sourceDocumentUrl || ''}
              placeholder="https://..." />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Proposal'}</button>
            <button type="button" class="btn-secondary" @click=${this._cancelForm}>Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  render() {
    if (this.currentView === 'form') {
      return html`<div class="proposals-container">${this._renderForm()}</div>`;
    }

    return html`
      <div class="proposals-container">
        <div class="proposals-header">
          <h2>Plan Proposals</h2>
          <div class="proposals-actions">
            <select class="filter-select" @change=${this._handleFilterChange}>
              <option value="">All statuses</option>
              ${PROPOSAL_STATUSES.map(s => html`
                <option value=${s}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>
              `)}
            </select>
            <button class="btn-primary" @click=${() => this._showForm()}>
              + New Proposal
            </button>
          </div>
        </div>
        ${this._renderList()}
      </div>
    `;
  }
}

customElements.define('plan-proposals-list', PlanProposalsList);

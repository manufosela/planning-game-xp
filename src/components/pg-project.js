/**
 * Project management component — list, create, edit, archive projects.
 *
 * @element pg-project
 * @property {Array} projects - List of projects
 * @property {boolean} loading
 * @fires project-select - detail: { project }
 * @fires project-create - detail: { data }
 * @fires project-update - detail: { id, data }
 * @fires project-archive - detail: { id }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';
import './pg-modal.js';

class PgProject extends LitElement {
  static properties = {
    projects: { type: Array },
    loading: { type: Boolean },
    _showForm: { state: true },
    _formData: { state: true },
    _editingId: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xl, 1.5rem);
    }

    .header h1 {
      font-size: 1.5rem;
      font-weight: var(--font-weight-bold, 700);
      letter-spacing: var(--tracking-tight, -0.01em);
      color: var(--color-text, #0f172a);
    }

    .create-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
      padding: var(--space-sm, 0.5rem) var(--space-lg, 1rem);
      background: var(--color-primary, #4f46e5);
      color: var(--color-primary-text, #fff);
      border: none;
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .create-btn:hover {
      background: var(--color-primary-hover, #4338ca);
    }

    .create-btn svg {
      width: 1rem;
      height: 1rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    /* Project grid */
    .project-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
      gap: var(--space-lg, 1rem);
    }

    /* Project card */
    .project-card {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-lg, 0.75rem);
      padding: var(--space-lg, 1rem);
      cursor: pointer;
      transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
    }

    .project-card:hover {
      box-shadow: var(--shadow-md);
      border-color: var(--color-border-strong, #cbd5e1);
    }

    .project-card.archived {
      opacity: 0.6;
    }

    .project-card .card-header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      margin-bottom: var(--space-sm, 0.5rem);
    }

    .project-card .abbr {
      width: 2.25rem;
      height: 2.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-primary-subtle, #eef2ff);
      color: var(--color-primary, #4f46e5);
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-bold, 700);
      letter-spacing: var(--tracking-wide, 0.025em);
      flex-shrink: 0;
    }

    .project-card .card-title {
      font-size: 0.9375rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .project-card .card-actions {
      display: flex;
      gap: var(--space-2xs);
      flex-shrink: 0;
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    .project-card:hover .card-actions {
      opacity: 1;
    }

    .project-card .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border: none;
      background: transparent;
      color: var(--color-text-muted, #94a3b8);
      cursor: pointer;
      border-radius: var(--radius-sm, 0.25rem);
      padding: 0;
    }

    .project-card .action-btn:hover {
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text, #0f172a);
    }

    .project-card .action-btn svg {
      width: 0.875rem;
      height: 0.875rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .project-card .card-desc {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #64748b);
      line-height: 1.4;
      margin-bottom: var(--space-md, 0.75rem);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .project-card .card-meta {
      display: flex;
      align-items: center;
      gap: var(--space-lg, 1rem);
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
    }

    .project-card .meta-item {
      display: flex;
      align-items: center;
      gap: var(--space-2xs, 0.125rem);
    }

    .project-card .meta-item svg {
      width: 0.875rem;
      height: 0.875rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    /* Create form */
    .form-overlay {
      position: fixed;
      inset: 0;
      background: var(--color-surface-overlay, rgba(15, 23, 42, 0.6));
      z-index: var(--z-modal, 400);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-lg);
      animation: fade-in 150ms ease;
    }

    .form-card {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xl);
      padding: var(--space-xl, 1.5rem);
      max-width: 28rem;
      width: 100%;
    }

    .form-card h2 {
      font-size: 1.125rem;
      font-weight: var(--font-weight-semibold, 600);
      margin-bottom: var(--space-lg, 1rem);
      color: var(--color-text, #0f172a);
    }

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 0.75rem);
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 0.125rem);
    }

    .field-label {
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
    }

    input,
    textarea,
    select {
      width: 100%;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
    }

    input:focus,
    textarea:focus,
    select:focus {
      outline: none;
      border-color: var(--color-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    textarea {
      min-height: 3rem;
      resize: vertical;
    }

    .row {
      display: flex;
      gap: var(--space-md);
    }

    .row .field-group {
      flex: 1;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
      margin-top: var(--space-lg, 1rem);
    }

    .btn {
      padding: var(--space-sm, 0.5rem) var(--space-lg, 1rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .btn:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .btn-primary {
      background: var(--color-primary, #4f46e5);
      color: var(--color-primary-text, #fff);
      border-color: var(--color-primary, #4f46e5);
    }

    .btn-primary:hover {
      background: var(--color-primary-hover, #4338ca);
    }

    /* Loading */
    .loading {
      text-align: center;
      padding: var(--space-3xl);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-4xl, 4rem) var(--space-lg, 1rem);
      text-align: center;
    }

    .empty-icon {
      width: 3rem;
      height: 3rem;
      color: var(--color-text-muted, #94a3b8);
      margin-bottom: var(--space-lg);
    }

    .empty-icon svg {
      width: 100%;
      height: 100%;
      stroke: currentColor;
      stroke-width: 1.5;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .empty-state h2 {
      font-size: 1.125rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      margin-bottom: var(--space-xs);
    }

    .empty-state p {
      font-size: 0.875rem;
      color: var(--color-text-muted, #94a3b8);
      margin-bottom: var(--space-xl);
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  constructor() {
    super();
    /** @type {Array<import('../lib/types.d.ts').Project & { id: string }>} */
    this.projects = [];
    this.loading = false;
    this._showForm = false;
    this._editingId = null;
    this._formData = { name: '', abbreviation: '', description: '', scoringSystem: '1-5', repoUrl: '' };
  }

  _openCreateForm() {
    this._editingId = null;
    this._formData = { name: '', abbreviation: '', description: '', scoringSystem: '1-5', repoUrl: '' };
    this._showForm = true;
  }

  /** @param {import('../lib/types.d.ts').Project & { id: string }} project */
  _openEditForm(project) {
    this._editingId = project.id;
    this._formData = {
      name: project.name,
      abbreviation: project.abbreviation,
      description: project.description ?? '',
      scoringSystem: project.scoringSystem,
      repoUrl: project.repoUrl ?? '',
    };
    this._showForm = true;
  }

  _closeForm() {
    this._showForm = false;
    this._editingId = null;
  }

  /** @param {Event} e */
  _submitForm(e) {
    e.preventDefault();
    if (this._editingId) {
      this.dispatchEvent(new CustomEvent('project-update', {
        detail: { id: this._editingId, data: { ...this._formData } },
        bubbles: true, composed: true,
      }));
    } else {
      this.dispatchEvent(new CustomEvent('project-create', {
        detail: { data: { ...this._formData } },
        bubbles: true, composed: true,
      }));
    }
    this._closeForm();
  }

  /** @param {import('../lib/types.d.ts').Project & { id: string }} project */
  _selectProject(project) {
    this.dispatchEvent(new CustomEvent('project-select', {
      detail: { project },
      bubbles: true, composed: true,
    }));
  }

  /** @param {string} id */
  async _archiveProject(id) {
    const { PgModal } = await import('./pg-modal.js');
    const confirmed = await PgModal.confirm({
      title: 'Archive project',
      message: 'This project will be hidden from the main list. You can unarchive it later.',
      confirmText: 'Archive',
      variant: 'danger',
    });
    if (confirmed) {
      this.dispatchEvent(new CustomEvent('project-archive', {
        detail: { id },
        bubbles: true, composed: true,
      }));
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">Loading projects...</div>`;
    }

    const active = this.projects.filter((p) => !p.archived);
    const archived = this.projects.filter((p) => p.archived);

    return html`
      <div class="header">
        <h1>Projects</h1>
        <button class="create-btn" @click=${this._openCreateForm}>
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New project
        </button>
      </div>

      ${active.length === 0 && archived.length === 0
        ? html`
          <div class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h2>No projects yet</h2>
            <p>Create your first project to get started.</p>
            <button class="create-btn" @click=${this._openCreateForm}>
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create project
            </button>
          </div>
        `
        : html`
          <div class="project-grid">
            ${active.map((p) => this._renderProjectCard(p))}
            ${archived.map((p) => this._renderProjectCard(p))}
          </div>
        `
      }

      ${this._showForm ? this._renderForm() : nothing}
    `;
  }

  /** @param {import('../lib/types.d.ts').Project & { id: string }} project */
  _renderProjectCard(project) {
    return html`
      <div class="project-card ${project.archived ? 'archived' : ''}" @click=${() => this._selectProject(project)}>
        <div class="card-header">
          <div class="abbr">${project.abbreviation}</div>
          <div class="card-title">${project.name}</div>
          <div class="card-actions">
            <button class="action-btn" @click=${(/** @type {Event} */ e) => { e.stopPropagation(); this._openEditForm(project); }} aria-label="Edit project">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${!project.archived ? html`
              <button class="action-btn" @click=${(/** @type {Event} */ e) => { e.stopPropagation(); this._archiveProject(project.id); }} aria-label="Archive project">
                <svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
              </button>
            ` : nothing}
          </div>
        </div>
        ${project.description ? html`<div class="card-desc">${project.description}</div>` : nothing}
        <div class="card-meta">
          <span class="meta-item">
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${project.developerCount ?? 0} devs
          </span>
          <span class="meta-item">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${project.stakeholderCount ?? 0} stk
          </span>
          ${project.archived ? html`<pg-badge text="Archived" variant="status"></pg-badge>` : nothing}
        </div>
      </div>
    `;
  }

  _renderForm() {
    return html`
      <div class="form-overlay" @click=${(/** @type {MouseEvent} */ e) => { if (/** @type {HTMLElement} */ (e.target).classList.contains('form-overlay')) this._closeForm(); }}>
        <div class="form-card">
          <h2>${this._editingId ? 'Edit project' : 'New project'}</h2>
          <form @submit=${this._submitForm}>
            <div class="form-fields">
              <div class="row">
                <div class="field-group" style="flex:2">
                  <label class="field-label">Name</label>
                  <input type="text" .value=${this._formData.name} @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, name: /** @type {HTMLInputElement} */ (e.target).value }; }} required placeholder="Project name" />
                </div>
                <div class="field-group" style="flex:1">
                  <label class="field-label">Abbreviation</label>
                  <input type="text" .value=${this._formData.abbreviation} @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, abbreviation: /** @type {HTMLInputElement} */ (e.target).value.toUpperCase() }; }} required placeholder="PLN" maxlength="4" />
                </div>
              </div>
              <div class="field-group">
                <label class="field-label">Description</label>
                <textarea .value=${this._formData.description} @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, description: /** @type {HTMLTextAreaElement} */ (e.target).value }; }} placeholder="Project description..."></textarea>
              </div>
              <div class="field-group">
                <label class="field-label">Scoring System</label>
                <select .value=${this._formData.scoringSystem} @change=${(/** @type {Event} */ e) => { this._formData = { ...this._formData, scoringSystem: /** @type {HTMLSelectElement} */ (e.target).value }; }}>
                  <option value="1-5">Linear (1-5)</option>
                  <option value="fibonacci">Fibonacci</option>
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Repository URL</label>
                <input type="url" .value=${this._formData.repoUrl} @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, repoUrl: /** @type {HTMLInputElement} */ (e.target).value }; }} placeholder="https://github.com/..." />
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn" @click=${this._closeForm}>Cancel</button>
              <button type="submit" class="btn btn-primary">${this._editingId ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

customElements.define('pg-project', PgProject);

export { PgProject };

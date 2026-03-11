/**
 * Admin console with tabs for Users, Trash, and Reports.
 *
 * @element pg-admin
 * @property {Array} users - User list
 * @property {Array} trash - Trashed cards
 * @property {Array} projects - Available projects
 * @property {Array} hoursReport - Hours report rows
 * @property {Array} pointsReport - Points report rows
 * @property {string} selectedProject - Currently selected project for trash/reports
 * @fires user-provision - detail: { data }
 * @fires user-delete - detail: { userId }
 * @fires trash-restore - detail: { projectId, cardId }
 * @fires trash-delete - detail: { projectId, cardId }
 * @fires load-trash - detail: { projectId }
 * @fires load-reports - detail: { projectId }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-tabs.js';
import './pg-badge.js';
import './pg-select.js';

class PgAdmin extends LitElement {
  static properties = {
    users: { type: Array },
    trash: { type: Array },
    projects: { type: Array },
    hoursReport: { type: Array, attribute: 'hours-report' },
    pointsReport: { type: Array, attribute: 'points-report' },
    selectedProject: { type: String, attribute: 'selected-project' },
    _activeTab: { state: true },
    _showUserForm: { state: true },
    _userForm: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .tab-section {
      margin-top: var(--space-lg, 1rem);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-md, 0.75rem);
      gap: var(--space-md, 0.75rem);
      flex-wrap: wrap;
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

    .btn-success {
      color: var(--color-success, #16a34a);
      border-color: var(--color-success, #16a34a);
    }

    .btn-success:hover { background: var(--color-success-subtle, #f0fdf4); }

    /* Table styles */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }

    .data-table th {
      text-align: left;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
      border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .data-table td {
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      color: var(--color-text, #0f172a);
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .data-table tr:hover td {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .data-table .actions-cell {
      text-align: right;
      white-space: nowrap;
    }

    .data-table .actions-cell .btn + .btn {
      margin-left: var(--space-xs, 0.25rem);
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

    .form-row {
      display: flex;
      gap: var(--space-md, 0.75rem);
      margin-bottom: var(--space-md, 0.75rem);
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 0.125rem);
      flex: 1;
    }

    .field-label {
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    input[type="text"],
    input[type="email"],
    select {
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

    input:focus, select:focus {
      outline: none;
      border-color: var(--color-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
      padding-top: var(--space-md, 0.75rem);
      border-top: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .project-filter {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
    }

    .project-filter label {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #64748b);
      font-weight: var(--font-weight-medium, 500);
    }

    .project-filter pg-select {
      min-width: 12rem;
    }

    .empty-msg {
      text-align: center;
      padding: var(--space-xl, 1.5rem);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }

    @media (max-width: 640px) {
      .form-row { flex-direction: column; }
      .data-table { font-size: 0.75rem; }
      .data-table th, .data-table td { padding: var(--space-xs) var(--space-sm); }
    }
  `;

  constructor() {
    super();
    /** @type {Array<import('../lib/types.d.ts').User & { id: string }>} */
    this.users = [];
    /** @type {Array<import('../lib/types.d.ts').TrashedCard & { id: string }>} */
    this.trash = [];
    /** @type {Array<import('../lib/types.d.ts').Project & { id: string }>} */
    this.projects = [];
    /** @type {import('../lib/types.d.ts').HoursReportRow[]} */
    this.hoursReport = [];
    /** @type {import('../lib/types.d.ts').PointsReportRow[]} */
    this.pointsReport = [];
    /** @type {string} */
    this.selectedProject = '';
    /** @type {string} */
    this._activeTab = 'users';
    /** @type {boolean} */
    this._showUserForm = false;
    /** @type {Record<string, string>} */
    this._userForm = { name: '', email: '', role: 'user' };
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _projectOptions() {
    return this.projects.map((p) => ({ value: p.id, label: p.name }));
  }

  _provisionUser() {
    const { name, email, role } = this._userForm;
    if (!name.trim() || !email.trim()) return;

    this.dispatchEvent(new CustomEvent('user-provision', {
      detail: { data: { name: name.trim(), email: email.trim(), role } },
      bubbles: true, composed: true,
    }));
    this._showUserForm = false;
    this._userForm = { name: '', email: '', role: 'user' };
  }

  /** @param {string} userId */
  _deleteUser(userId) {
    this.dispatchEvent(new CustomEvent('user-delete', {
      detail: { userId },
      bubbles: true, composed: true,
    }));
  }

  /**
   * @param {string} cardId
   * @param {'restore'|'delete'} action
   */
  _trashAction(cardId, action) {
    const event = action === 'restore' ? 'trash-restore' : 'trash-delete';
    this.dispatchEvent(new CustomEvent(event, {
      detail: { projectId: this.selectedProject, cardId },
      bubbles: true, composed: true,
    }));
  }

  /** @param {string} projectId */
  _onProjectChange(projectId) {
    this.selectedProject = projectId;
    if (this._activeTab === 'trash') {
      this.dispatchEvent(new CustomEvent('load-trash', {
        detail: { projectId },
        bubbles: true, composed: true,
      }));
    } else if (this._activeTab === 'reports') {
      this.dispatchEvent(new CustomEvent('load-reports', {
        detail: { projectId },
        bubbles: true, composed: true,
      }));
    }
  }

  _exportCSV() {
    const report = this._activeTab === 'reports' ? this.hoursReport : [];
    if (report.length === 0) return;

    const headers = Object.keys(report[0]);
    const rows = report.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  render() {
    const tabs = [
      { id: 'users', label: 'Users', count: this.users.length },
      { id: 'trash', label: 'Trash', count: this.trash.length },
      { id: 'reports', label: 'Reports' },
    ];

    return html`
      <pg-tabs .tabs=${tabs} .active=${this._activeTab}
        @tab-change=${(/** @type {CustomEvent} */ e) => { this._activeTab = e.detail.tab; }}
      ></pg-tabs>

      <div class="tab-section">
        ${this._activeTab === 'users' ? this._renderUsers() : nothing}
        ${this._activeTab === 'trash' ? this._renderTrash() : nothing}
        ${this._activeTab === 'reports' ? this._renderReports() : nothing}
      </div>
    `;
  }

  _renderUsers() {
    return html`
      <div class="section-header">
        <span></span>
        ${!this._showUserForm ? html`
          <button class="btn btn-primary btn-sm" @click=${() => { this._showUserForm = true; }}>+ Provision User</button>
        ` : nothing}
      </div>

      ${this._showUserForm ? html`
        <div class="form-panel">
          <h4>Provision New User</h4>
          <div class="form-row">
            <div class="field-group">
              <label class="field-label">Name</label>
              <input type="text" .value=${this._userForm.name}
                @input=${(/** @type {InputEvent} */ e) => { this._userForm = { ...this._userForm, name: /** @type {HTMLInputElement} */ (e.target).value }; }} />
            </div>
            <div class="field-group">
              <label class="field-label">Email</label>
              <input type="email" .value=${this._userForm.email}
                @input=${(/** @type {InputEvent} */ e) => { this._userForm = { ...this._userForm, email: /** @type {HTMLInputElement} */ (e.target).value }; }} />
            </div>
            <div class="field-group">
              <label class="field-label">Role</label>
              <select .value=${this._userForm.role}
                @change=${(/** @type {Event} */ e) => { this._userForm = { ...this._userForm, role: /** @type {HTMLSelectElement} */ (e.target).value }; }}>
                <option value="user">User</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn" @click=${() => { this._showUserForm = false; }}>Cancel</button>
            <button class="btn btn-primary" @click=${this._provisionUser}>Create</button>
          </div>
        </div>
      ` : nothing}

      ${this.users.length === 0 ? html`<div class="empty-msg">No users found.</div>` : html`
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.users.map((u) => html`
              <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><pg-badge text=${u.role} variant="type"></pg-badge></td>
                <td class="actions-cell">
                  <button class="btn btn-sm btn-danger" @click=${() => this._deleteUser(u.id)}>Delete</button>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
    `;
  }

  _renderTrash() {
    return html`
      <div class="section-header">
        <div class="project-filter">
          <label>Project:</label>
          <pg-select
            .options=${this._projectOptions}
            .value=${this.selectedProject}
            placeholder="Select project"
            @change=${(/** @type {CustomEvent} */ e) => this._onProjectChange(e.detail.value)}
          ></pg-select>
        </div>
      </div>

      ${!this.selectedProject ? html`<div class="empty-msg">Select a project to view trashed cards.</div>` :
        this.trash.length === 0 ? html`<div class="empty-msg">No trashed cards in this project.</div>` : html`
        <table class="data-table">
          <thead>
            <tr>
              <th>Card ID</th>
              <th>Title</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.trash.map((c) => html`
              <tr>
                <td style="font-family: var(--font-mono); font-size: 0.75rem;">${c.cardId}</td>
                <td>${c.title}</td>
                <td><pg-badge text=${c.type} variant="type"></pg-badge></td>
                <td class="actions-cell">
                  <button class="btn btn-sm btn-success" @click=${() => this._trashAction(c.id, 'restore')}>Restore</button>
                  <button class="btn btn-sm btn-danger" @click=${() => this._trashAction(c.id, 'delete')}>Permanently Delete</button>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
    `;
  }

  _renderReports() {
    return html`
      <div class="section-header">
        <div class="project-filter">
          <label>Project:</label>
          <pg-select
            .options=${this._projectOptions}
            .value=${this.selectedProject}
            placeholder="Select project"
            @change=${(/** @type {CustomEvent} */ e) => this._onProjectChange(e.detail.value)}
          ></pg-select>
        </div>
        ${this.hoursReport.length > 0 ? html`
          <button class="btn btn-sm" @click=${this._exportCSV}>Export CSV</button>
        ` : nothing}
      </div>

      ${!this.selectedProject ? html`<div class="empty-msg">Select a project to view reports.</div>` : html`
        <h4 style="font-size: 0.875rem; font-weight: var(--font-weight-semibold, 600); margin-bottom: var(--space-md, 0.75rem);">Hours Report</h4>
        ${this.hoursReport.length === 0 ? html`<div class="empty-msg">No completed tasks with time data.</div>` : html`
          <table class="data-table">
            <thead>
              <tr>
                <th>Developer</th>
                <th>Card</th>
                <th>Title</th>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              ${this.hoursReport.map((r) => html`
                <tr>
                  <td>${r.developer}</td>
                  <td style="font-family: var(--font-mono); font-size: 0.75rem;">${r.cardId}</td>
                  <td>${r.title}</td>
                  <td>${r.startDate}</td>
                  <td>${r.endDate}</td>
                  <td>${r.durationHours}h</td>
                </tr>
              `)}
            </tbody>
          </table>
        `}

        <h4 style="font-size: 0.875rem; font-weight: var(--font-weight-semibold, 600); margin: var(--space-xl, 1.5rem) 0 var(--space-md, 0.75rem);">Points Report</h4>
        ${this.pointsReport.length === 0 ? html`<div class="empty-msg">No completed points data.</div>` : html`
          <table class="data-table">
            <thead>
              <tr>
                <th>Developer</th>
                <th>Sprint</th>
                <th>Completed Points</th>
              </tr>
            </thead>
            <tbody>
              ${this.pointsReport.map((r) => html`
                <tr>
                  <td>${r.developer}</td>
                  <td>${r.sprint}</td>
                  <td>${r.completedPoints}</td>
                </tr>
              `)}
            </tbody>
          </table>
        `}
      `}
    `;
  }
}

customElements.define('pg-admin', PgAdmin);

export { PgAdmin };

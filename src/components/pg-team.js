/**
 * Team management component — list, add, remove team members.
 *
 * @element pg-team
 * @property {Array} members - List of team members
 * @property {string} projectId
 * @fires team-add - detail: { member }
 * @fires team-remove - detail: { memberId }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';
import './pg-modal.js';

class PgTeam extends LitElement {
  static properties = {
    members: { type: Array },
    projectId: { type: String, attribute: 'project-id' },
    _showForm: { state: true },
    _formData: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-lg, 1rem);
    }

    .header h2 {
      font-size: 1rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
    }

    .member-count {
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
      margin-left: var(--space-sm);
    }

    .add-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
      padding: var(--space-xs, 0.25rem) var(--space-md, 0.75rem);
      background: var(--color-primary, #4f46e5);
      color: var(--color-primary-text, #fff);
      border: none;
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .add-btn:hover {
      background: var(--color-primary-hover, #4338ca);
    }

    .add-btn svg {
      width: 0.875rem;
      height: 0.875rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    /* Member list */
    .member-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 0.25rem);
    }

    .member-row {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      transition: background var(--transition-fast);
    }

    .member-row:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .member-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: var(--radius-full);
      background: var(--color-primary-subtle, #eef2ff);
      color: var(--color-primary, #4f46e5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      flex-shrink: 0;
    }

    .member-info {
      flex: 1;
      min-width: 0;
    }

    .member-name {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
    }

    .member-email {
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
    }

    .member-role {
      flex-shrink: 0;
    }

    .member-inactive {
      opacity: 0.5;
    }

    .remove-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border: none;
      background: transparent;
      color: var(--color-text-muted, #94a3b8);
      cursor: pointer;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      opacity: 0;
      transition: opacity var(--transition-fast), color var(--transition-fast);
    }

    .member-row:hover .remove-btn {
      opacity: 1;
    }

    .remove-btn:hover {
      color: var(--color-error, #dc2626);
      background: var(--color-error-subtle, #fef2f2);
    }

    .remove-btn svg {
      width: 0.875rem;
      height: 0.875rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    /* Inline add form */
    .add-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-md, 0.75rem);
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-md, 0.5rem);
      margin-bottom: var(--space-md, 0.75rem);
    }

    .add-form .form-row {
      display: flex;
      gap: var(--space-sm, 0.5rem);
    }

    .add-form input,
    .add-form select {
      flex: 1;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
    }

    .add-form input:focus,
    .add-form select:focus {
      outline: none;
      border-color: var(--color-primary, #4f46e5);
    }

    .add-form .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs, 0.25rem);
    }

    .btn {
      padding: var(--space-xs, 0.25rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.75rem;
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

    /* Empty */
    .empty {
      text-align: center;
      padding: var(--space-xl);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.8125rem;
    }
  `;

  constructor() {
    super();
    /** @type {Array<import('../lib/types.d.ts').TeamMember & { id: string }>} */
    this.members = [];
    this.projectId = '';
    this._showForm = false;
    this._formData = { name: '', email: '', role: 'developer' };
  }

  _toggleForm() {
    this._showForm = !this._showForm;
    this._formData = { name: '', email: '', role: 'developer' };
  }

  /** @param {Event} e */
  _submitForm(e) {
    e.preventDefault();
    if (!this._formData.name || !this._formData.email) return;

    this.dispatchEvent(new CustomEvent('team-add', {
      detail: { member: { ...this._formData, active: true } },
      bubbles: true, composed: true,
    }));
    this._showForm = false;
    this._formData = { name: '', email: '', role: 'developer' };
  }

  /** @param {string} memberId */
  async _removeMember(memberId) {
    const { PgModal } = await import('./pg-modal.js');
    const confirmed = await PgModal.confirm({
      title: 'Remove team member',
      message: 'This member will be removed from the project.',
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (confirmed) {
      this.dispatchEvent(new CustomEvent('team-remove', {
        detail: { memberId },
        bubbles: true, composed: true,
      }));
    }
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  _initials(name) {
    return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  /** @param {string} role */
  _roleLabel(role) {
    return role === 'both' ? 'Dev + Stk' : role === 'developer' ? 'Developer' : 'Stakeholder';
  }

  render() {
    const active = this.members.filter((m) => m.active !== false);
    const inactive = this.members.filter((m) => m.active === false);

    return html`
      <div class="header">
        <h2>Team <span class="member-count">${this.members.length} members</span></h2>
        <button class="add-btn" @click=${this._toggleForm}>
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add member
        </button>
      </div>

      ${this._showForm ? html`
        <form class="add-form" @submit=${this._submitForm}>
          <div class="form-row">
            <input type="text" .value=${this._formData.name} @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, name: /** @type {HTMLInputElement} */ (e.target).value }; }} placeholder="Name" required />
            <input type="email" .value=${this._formData.email} @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, email: /** @type {HTMLInputElement} */ (e.target).value }; }} placeholder="Email" required />
          </div>
          <div class="form-row">
            <select .value=${this._formData.role} @change=${(/** @type {Event} */ e) => { this._formData = { ...this._formData, role: /** @type {HTMLSelectElement} */ (e.target).value }; }}>
              <option value="developer">Developer</option>
              <option value="stakeholder">Stakeholder</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="button" class="btn" @click=${this._toggleForm}>Cancel</button>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      ` : nothing}

      ${this.members.length === 0
        ? html`<div class="empty">No team members yet. Add your first member above.</div>`
        : html`
          <div class="member-list">
            ${active.map((m) => this._renderMember(m, false))}
            ${inactive.map((m) => this._renderMember(m, true))}
          </div>
        `
      }
    `;
  }

  /**
   * @param {import('../lib/types.d.ts').TeamMember & { id: string }} member
   * @param {boolean} isInactive
   */
  _renderMember(member, isInactive) {
    return html`
      <div class="member-row ${isInactive ? 'member-inactive' : ''}">
        <div class="member-avatar">${this._initials(member.name)}</div>
        <div class="member-info">
          <div class="member-name">${member.name}</div>
          <div class="member-email">${member.email}</div>
        </div>
        <div class="member-role">
          <pg-badge text=${this._roleLabel(member.role)} variant="type"></pg-badge>
        </div>
        <button class="remove-btn" @click=${() => this._removeMember(member.id)} aria-label="Remove member">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
  }
}

customElements.define('pg-team', PgTeam);

export { PgTeam };

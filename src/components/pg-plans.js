/**
 * Development plans management component.
 * Lists, creates, edits, and deletes plans for a project.
 *
 * @element pg-plans
 * @property {string} projectId - The project ID
 * @property {Array} plans - List of plans
 * @fires plan-create - detail: { data }
 * @fires plan-update - detail: { planId, data }
 * @fires plan-delete - detail: { planId }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';

class PgPlans extends LitElement {
  static properties = {
    projectId: { type: String, attribute: 'project-id' },
    plans: { type: Array },
    _showForm: { state: true },
    _editingId: { state: true },
    _formData: { state: true },
    _expandedPhases: { state: true },
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

    .btn-danger:hover {
      background: var(--color-error-subtle, #fef2f2);
    }

    /* Plan list */
    .plan-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 0.75rem);
    }

    .plan-item {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-lg, 1rem);
    }

    .plan-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-sm, 0.5rem);
    }

    .plan-title {
      font-size: 0.875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
    }

    .plan-actions {
      display: flex;
      gap: var(--space-xs, 0.25rem);
    }

    .plan-objective {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #64748b);
      margin-bottom: var(--space-md, 0.75rem);
      line-height: 1.5;
    }

    .plan-phases {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 0.25rem);
    }

    .phase-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-sm, 0.25rem);
      cursor: pointer;
      user-select: none;
    }

    .phase-header:hover {
      background: var(--color-border-subtle, #f1f5f9);
    }

    .phase-title {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
    }

    .phase-points {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
    }

    .phase-body {
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #64748b);
      line-height: 1.5;
    }

    .phase-tasks {
      margin-top: var(--space-xs, 0.25rem);
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
    }

    .chevron {
      display: inline-block;
      transition: transform var(--transition-fast);
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
    }

    .chevron.open { transform: rotate(90deg); }

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
    input[type="number"],
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

    textarea { min-height: 3rem; resize: vertical; }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
      padding-top: var(--space-md, 0.75rem);
      border-top: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .phase-form-row {
      display: flex;
      gap: var(--space-sm, 0.5rem);
      align-items: flex-end;
      margin-bottom: var(--space-xs, 0.25rem);
    }

    .phase-form-row .field-group { flex: 1; margin-bottom: 0; }
    .phase-form-row .field-group.small { max-width: 5rem; }

    .add-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
      padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-primary, #4f46e5);
      background: transparent;
      border: 1px dashed var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      cursor: pointer;
    }

    .add-btn:hover {
      background: var(--color-primary-subtle, #eef2ff);
      border-color: var(--color-primary, #4f46e5);
    }

    .remove-btn {
      flex-shrink: 0;
      width: 1.5rem;
      height: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--color-text-muted, #94a3b8);
      cursor: pointer;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
    }

    .remove-btn:hover {
      color: var(--color-error, #dc2626);
      background: var(--color-error-subtle, #fef2f2);
    }

    .empty-msg {
      text-align: center;
      padding: var(--space-xl, 1.5rem);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }
  `;

  constructor() {
    super();
    /** @type {string} */
    this.projectId = '';
    /** @type {Array<import('../lib/types.d.ts').Plan & { id: string }>} */
    this.plans = [];
    /** @type {boolean} */
    this._showForm = false;
    /** @type {string | null} */
    this._editingId = null;
    /** @type {Record<string, any>} */
    this._formData = this._defaultForm();
    /** @type {Set<string>} */
    this._expandedPhases = new Set();
  }

  _defaultForm() {
    return {
      title: '',
      objective: '',
      status: 'draft',
      phases: [{ title: '', description: '', estimatedPoints: 1 }],
    };
  }

  _openCreateForm() {
    this._formData = this._defaultForm();
    this._editingId = null;
    this._showForm = true;
  }

  /** @param {import('../lib/types.d.ts').Plan & { id: string }} plan */
  _openEditForm(plan) {
    this._formData = {
      title: plan.title,
      objective: plan.objective,
      status: plan.status,
      phases: plan.phases?.map((p) => ({ ...p })) ?? [{ title: '', description: '', estimatedPoints: 1 }],
    };
    this._editingId = plan.id;
    this._showForm = true;
  }

  _cancelForm() {
    this._showForm = false;
    this._editingId = null;
  }

  _submitForm() {
    if (!this._formData.title.trim()) return;

    const data = {
      title: this._formData.title.trim(),
      objective: this._formData.objective.trim(),
      status: this._formData.status,
      phases: this._formData.phases.filter((p) => p.title.trim()),
    };

    if (this._editingId) {
      this.dispatchEvent(new CustomEvent('plan-update', {
        detail: { planId: this._editingId, data },
        bubbles: true, composed: true,
      }));
    } else {
      this.dispatchEvent(new CustomEvent('plan-create', {
        detail: { data },
        bubbles: true, composed: true,
      }));
    }
    this._showForm = false;
    this._editingId = null;
  }

  /** @param {string} planId */
  _deletePlan(planId) {
    this.dispatchEvent(new CustomEvent('plan-delete', {
      detail: { planId },
      bubbles: true, composed: true,
    }));
  }

  /** @param {string} key */
  _togglePhase(key) {
    const next = new Set(this._expandedPhases);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._expandedPhases = next;
  }

  _addPhase() {
    this._formData = {
      ...this._formData,
      phases: [...this._formData.phases, { title: '', description: '', estimatedPoints: 1 }],
    };
  }

  /** @param {number} index */
  _removePhase(index) {
    this._formData = {
      ...this._formData,
      phases: this._formData.phases.filter((_, i) => i !== index),
    };
  }

  /**
   * @param {number} index
   * @param {string} field
   * @param {any} value
   */
  _updatePhase(index, field, value) {
    const phases = [...this._formData.phases];
    phases[index] = { ...phases[index], [field]: value };
    this._formData = { ...this._formData, phases };
  }

  /** @param {string} status */
  _statusVariant(status) {
    switch (status) {
      case 'accepted': return 'success';
      case 'rejected': return 'error';
      default: return 'default';
    }
  }

  render() {
    return html`
      <div class="header">
        <h3>Development Plans</h3>
        ${!this._showForm ? html`
          <button class="btn btn-primary btn-sm" @click=${this._openCreateForm}>+ New Plan</button>
        ` : nothing}
      </div>

      ${this._showForm ? this._renderForm() : nothing}

      ${this.plans.length === 0 && !this._showForm ? html`
        <div class="empty-msg">No plans yet. Create one to get started.</div>
      ` : nothing}

      <div class="plan-list">
        ${this.plans.map((plan) => this._renderPlan(plan))}
      </div>
    `;
  }

  /** @param {import('../lib/types.d.ts').Plan & { id: string }} plan */
  _renderPlan(plan) {
    return html`
      <div class="plan-item">
        <div class="plan-item-header">
          <span class="plan-title">${plan.title}</span>
          <div class="plan-actions">
            <pg-badge text=${plan.status} variant="status"></pg-badge>
            <button class="btn btn-sm" @click=${() => this._openEditForm(plan)}>Edit</button>
            <button class="btn btn-sm btn-danger" @click=${() => this._deletePlan(plan.id)}>Delete</button>
          </div>
        </div>
        ${plan.objective ? html`<div class="plan-objective">${plan.objective}</div>` : nothing}
        ${plan.phases?.length ? html`
          <div class="plan-phases">
            ${plan.phases.map((phase, i) => {
              const key = `${plan.id}-${i}`;
              const expanded = this._expandedPhases.has(key);
              return html`
                <div>
                  <div class="phase-header" @click=${() => this._togglePhase(key)}>
                    <span class="phase-title">
                      <span class="chevron ${expanded ? 'open' : ''}">&#9654;</span>
                      ${phase.title}
                    </span>
                    <span class="phase-points">${phase.estimatedPoints} pts</span>
                  </div>
                  ${expanded ? html`
                    <div class="phase-body">
                      ${phase.description}
                      ${phase.taskIds?.length ? html`
                        <div class="phase-tasks">Linked: ${phase.taskIds.join(', ')}</div>
                      ` : nothing}
                    </div>
                  ` : nothing}
                </div>
              `;
            })}
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderForm() {
    const f = this._formData;
    return html`
      <div class="form-panel">
        <h4>${this._editingId ? 'Edit Plan' : 'New Plan'}</h4>
        <div class="field-group">
          <label class="field-label">Title</label>
          <input type="text" .value=${f.title}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, title: /** @type {HTMLInputElement} */ (e.target).value }; }} />
        </div>
        <div class="field-group">
          <label class="field-label">Objective</label>
          <textarea .value=${f.objective}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, objective: /** @type {HTMLTextAreaElement} */ (e.target).value }; }}></textarea>
        </div>

        <div class="field-label" style="margin-bottom: var(--space-sm)">Phases</div>
        ${f.phases.map((phase, i) => html`
          <div class="phase-form-row">
            <div class="field-group">
              <input type="text" .value=${phase.title} placeholder="Phase title"
                @input=${(/** @type {InputEvent} */ e) => this._updatePhase(i, 'title', /** @type {HTMLInputElement} */ (e.target).value)} />
            </div>
            <div class="field-group">
              <input type="text" .value=${phase.description} placeholder="Description"
                @input=${(/** @type {InputEvent} */ e) => this._updatePhase(i, 'description', /** @type {HTMLInputElement} */ (e.target).value)} />
            </div>
            <div class="field-group small">
              <input type="number" min="1" .value=${String(phase.estimatedPoints)}
                @input=${(/** @type {InputEvent} */ e) => this._updatePhase(i, 'estimatedPoints', Number(/** @type {HTMLInputElement} */ (e.target).value))} />
            </div>
            ${f.phases.length > 1 ? html`<button type="button" class="remove-btn" @click=${() => this._removePhase(i)}>&times;</button>` : nothing}
          </div>
        `)}
        <button type="button" class="add-btn" @click=${this._addPhase}>+ Add Phase</button>

        <div class="form-actions">
          <button class="btn" @click=${this._cancelForm}>Cancel</button>
          <button class="btn btn-primary" @click=${this._submitForm}>${this._editingId ? 'Save' : 'Create'}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('pg-plans', PgPlans);

export { PgPlans };

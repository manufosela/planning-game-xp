/**
 * Dynamic form builder driven by card type.
 * Generates form fields based on the card type schema.
 *
 * @element pg-form
 * @property {string} type - Card type (task, bug, epic, sprint, proposal, qa)
 * @property {Object} card - Existing card data (for editing) or null (for creation)
 * @property {Array} teamMembers - Available team members for developer/validator selects
 * @property {Array} sprints - Available sprints
 * @property {Array} epics - Available epics
 * @property {Array} tagRegistry - Available tags with colors
 * @fires form-submit - Dispatched with validated data: detail { data, type }
 * @fires form-cancel - Dispatched when cancel is clicked
 */

import { LitElement, html, css, nothing } from 'lit';
import { validateCard, validatePartialCard, getStatusesForType, BUG_PRIORITIES } from '../schemas/cards.js';
import './pg-select.js';
import './pg-badge.js';

class PgForm extends LitElement {
  static properties = {
    type: { type: String },
    card: { type: Object },
    teamMembers: { type: Array, attribute: 'team-members' },
    sprints: { type: Array },
    epics: { type: Array },
    tagRegistry: { type: Array, attribute: 'tag-registry' },
    _errors: { state: true },
    _formData: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-lg, 1rem);
    }

    /* Field group */
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
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    .field-label.required::after {
      content: ' *';
      color: var(--color-error, #dc2626);
    }

    /* Inputs */
    input[type="text"],
    input[type="number"],
    input[type="date"],
    input[type="color"],
    textarea {
      width: 100%;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      transition: border-color var(--transition-fast);
    }

    input:focus,
    textarea:focus {
      outline: none;
      border-color: var(--color-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    textarea {
      min-height: 4rem;
      resize: vertical;
    }

    input[type="color"] {
      height: 2.25rem;
      padding: var(--space-2xs);
      cursor: pointer;
    }

    /* Error state */
    .field-error {
      font-size: 0.75rem;
      color: var(--color-error, #dc2626);
      margin-top: var(--space-2xs, 0.125rem);
    }

    input.error,
    textarea.error {
      border-color: var(--color-error, #dc2626);
    }

    /* Section divider */
    .section-divider {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
      padding-top: var(--space-md, 0.75rem);
      border-top: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    /* User Story group */
    .story-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 0.5rem);
      background: var(--color-surface-sunken, #f1f5f9);
      padding: var(--space-md, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
    }

    .story-group .story-prefix {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-primary, #4f46e5);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    .story-group input {
      background: var(--color-surface-raised, #fff);
    }

    /* Acceptance criteria list */
    .ac-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 0.75rem);
    }

    .ac-item {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 0.25rem);
      background: var(--color-surface-sunken, #f1f5f9);
      padding: var(--space-md, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      position: relative;
    }

    .ac-item .ac-prefix {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    .ac-item input {
      background: var(--color-surface-raised, #fff);
    }

    .ac-remove-btn {
      position: absolute;
      top: var(--space-xs);
      right: var(--space-xs);
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

    .ac-remove-btn:hover {
      color: var(--color-error, #dc2626);
      background: var(--color-error-subtle, #fef2f2);
    }

    /* Add button (inline) */
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
      transition: background var(--transition-fast), border-color var(--transition-fast);
    }

    .add-btn:hover {
      background: var(--color-primary-subtle, #eef2ff);
      border-color: var(--color-primary, #4f46e5);
    }

    /* Points row */
    .points-row {
      display: flex;
      gap: var(--space-lg, 1rem);
    }

    .points-row .field-group {
      flex: 1;
    }

    .points-row input[type="number"] {
      text-align: center;
      -moz-appearance: textfield;
    }

    .points-row input[type="number"]::-webkit-outer-spin-button,
    .points-row input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
    }

    /* Date row */
    .date-row {
      display: flex;
      gap: var(--space-lg, 1rem);
    }

    .date-row .field-group {
      flex: 1;
    }

    /* Form actions */
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
      padding-top: var(--space-lg, 1rem);
      border-top: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .btn {
      padding: var(--space-sm, 0.5rem) var(--space-xl, 1.5rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast);
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
      border-color: var(--color-primary-hover, #4338ca);
    }

    /* Sprint goals list */
    .goals-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }

    .goal-row {
      display: flex;
      gap: var(--space-xs);
      align-items: center;
    }

    .goal-row input {
      flex: 1;
    }

    .goal-remove {
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

    .goal-remove:hover {
      color: var(--color-error);
      background: var(--color-error-subtle);
    }
  `;

  constructor() {
    super();
    /** @type {string} */
    this.type = 'task';
    /** @type {Record<string, any> | null} */
    this.card = null;
    /** @type {Array<{id: string, name: string, email: string, role: string}>} */
    this.teamMembers = [];
    /** @type {Array<{cardId: string, title: string}>} */
    this.sprints = [];
    /** @type {Array<{cardId: string, title: string}>} */
    this.epics = [];
    /** @type {import('../lib/types.d.ts').TagRegistryEntry[]} */
    this.tagRegistry = [];
    /** @type {Record<string, string>} */
    this._errors = {};
    /** @type {Record<string, any>} */
    this._formData = {};
  }

  /** @param {Map<string, unknown>} changed */
  willUpdate(changed) {
    if (changed.has('card') || changed.has('type')) {
      this._initFormData();
    }
  }

  _initFormData() {
    if (this.card) {
      this._formData = { ...this.card };
    } else {
      this._formData = this._getDefaults();
    }
  }

  /** @returns {Record<string, any>} */
  _getDefaults() {
    const base = {
      title: '',
      description: '',
      status: getStatusesForType(this.type)[0] ?? '',
      year: new Date().getFullYear(),
      epic: '',
      sprint: '',
      tags: [],
      notes: '',
    };

    switch (this.type) {
      case 'task':
        return {
          ...base,
          status: 'To Do',
          userStory: { role: '', goal: '', benefit: '' },
          acceptanceCriteria: [{ given: '', when: '', then: '' }],
          devPoints: 1,
          businessPoints: 1,
        };
      case 'bug':
        return {
          ...base,
          status: 'Created',
          bugPriority: 'USER EXPERIENCE ISSUE',
        };
      case 'epic':
        return { ...base, status: 'Active', color: '#6366f1' };
      case 'sprint':
        return { ...base, startDate: '', endDate: '', locked: false, goals: [''] };
      case 'proposal':
        return { ...base, status: 'Pending', userStory: { role: '', goal: '', benefit: '' } };
      case 'qa':
        return { ...base, status: 'Pending', suite: '', steps: [''], expectedResult: '' };
      default:
        return base;
    }
  }

  /**
   * @param {string} field
   * @param {any} value
   */
  _updateField(field, value) {
    this._formData = { ...this._formData, [field]: value };
    // Clear error for this field
    if (this._errors[field]) {
      const next = { ...this._errors };
      delete next[field];
      this._errors = next;
    }
  }

  /**
   * @param {string} parent - e.g., 'userStory'
   * @param {string} field - e.g., 'role'
   * @param {any} value
   */
  _updateNestedField(parent, field, value) {
    this._formData = {
      ...this._formData,
      [parent]: { ...(this._formData[parent] ?? {}), [field]: value },
    };
  }

  /**
   * @param {number} index
   * @param {string} field
   * @param {string} value
   */
  _updateAC(index, field, value) {
    const acs = [...(this._formData.acceptanceCriteria ?? [])];
    acs[index] = { ...acs[index], [field]: value };
    this._formData = { ...this._formData, acceptanceCriteria: acs };
  }

  _addAC() {
    const acs = [...(this._formData.acceptanceCriteria ?? []), { given: '', when: '', then: '' }];
    this._formData = { ...this._formData, acceptanceCriteria: acs };
  }

  /** @param {number} index */
  _removeAC(index) {
    const acs = (this._formData.acceptanceCriteria ?? []).filter((_, i) => i !== index);
    this._formData = { ...this._formData, acceptanceCriteria: acs };
  }

  /**
   * @param {number} index
   * @param {string} value
   */
  _updateGoal(index, value) {
    const goals = [...(this._formData.goals ?? [])];
    goals[index] = value;
    this._formData = { ...this._formData, goals };
  }

  _addGoal() {
    this._formData = { ...this._formData, goals: [...(this._formData.goals ?? []), ''] };
  }

  /** @param {number} index */
  _removeGoal(index) {
    const goals = (this._formData.goals ?? []).filter((_, i) => i !== index);
    this._formData = { ...this._formData, goals };
  }

  /**
   * @param {number} index
   * @param {string} value
   */
  _updateStep(index, value) {
    const steps = [...(this._formData.steps ?? [])];
    steps[index] = value;
    this._formData = { ...this._formData, steps };
  }

  _addStep() {
    this._formData = { ...this._formData, steps: [...(this._formData.steps ?? []), ''] };
  }

  /** @param {number} index */
  _removeStep(index) {
    const steps = (this._formData.steps ?? []).filter((_, i) => i !== index);
    this._formData = { ...this._formData, steps };
  }

  /** @param {Event} e */
  _onSubmit(e) {
    e.preventDefault();

    const data = { ...this._formData, type: this.type };
    const isEditing = !!this.card;

    // Validate
    const result = isEditing
      ? validatePartialCard(this.type, data)
      : validateCard(data);

    if (!result.success) {
      /** @type {Record<string, string>} */
      const errors = {};
      for (const issue of result.errors.issues) {
        const path = issue.path.join('.');
        errors[path] = issue.message;
      }
      this._errors = errors;
      return;
    }

    this.dispatchEvent(new CustomEvent('form-submit', {
      detail: { data: result.data, type: this.type },
      bubbles: true,
      composed: true,
    }));
  }

  _onCancel() {
    this.dispatchEvent(new CustomEvent('form-cancel', { bubbles: true, composed: true }));
  }

  // ---------------------------------------------------------------------------
  // Field helpers
  // ---------------------------------------------------------------------------

  /** @returns {Array<{value: string, label: string}>} */
  get _developerOptions() {
    return this.teamMembers
      .filter((m) => m.role === 'developer' || m.role === 'both')
      .map((m) => ({ value: m.id, label: m.name }));
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _stakeholderOptions() {
    return this.teamMembers
      .filter((m) => m.role === 'stakeholder' || m.role === 'both')
      .map((m) => ({ value: m.id, label: m.name }));
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _sprintOptions() {
    return this.sprints.map((s) => ({ value: s.cardId, label: `${s.cardId} - ${s.title}` }));
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _epicOptions() {
    return this.epics.map((e) => ({ value: e.cardId, label: `${e.cardId} - ${e.title}` }));
  }

  /** @returns {Array<{value: string, label: string, color?: string}>} */
  get _tagOptions() {
    return this.tagRegistry.map((t) => ({ value: t.name, label: t.name, color: t.color }));
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _statusOptions() {
    return getStatusesForType(this.type).map((s) => ({ value: s, label: s }));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  render() {
    return html`
      <form class="form" @submit=${this._onSubmit}>
        <!-- Common fields -->
        ${this._renderCommonFields()}

        <!-- Type-specific fields -->
        ${this._renderTypeFields()}

        <!-- Tags -->
        ${this._renderTagsField()}

        <!-- Notes -->
        <div class="field-group">
          <label class="field-label">Notes</label>
          <textarea
            .value=${this._formData.notes ?? ''}
            @input=${(/** @type {InputEvent} */ e) => this._updateField('notes', /** @type {HTMLTextAreaElement} */ (e.target).value)}
            placeholder="Additional notes..."
          ></textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="btn" @click=${this._onCancel}>Cancel</button>
          <button type="submit" class="btn btn-primary">${this.card ? 'Save' : 'Create'}</button>
        </div>
      </form>
    `;
  }

  _renderCommonFields() {
    return html`
      <div class="field-group">
        <label class="field-label required">Title</label>
        <input
          type="text"
          class="${this._errors['title'] ? 'error' : ''}"
          .value=${this._formData.title ?? ''}
          @input=${(/** @type {InputEvent} */ e) => this._updateField('title', /** @type {HTMLInputElement} */ (e.target).value)}
          placeholder="Card title"
          required
        />
        ${this._errors['title'] ? html`<span class="field-error">${this._errors['title']}</span>` : nothing}
      </div>

      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea
          .value=${this._formData.description ?? ''}
          @input=${(/** @type {InputEvent} */ e) => this._updateField('description', /** @type {HTMLTextAreaElement} */ (e.target).value)}
          placeholder="Description..."
        ></textarea>
      </div>

      <div class="field-group">
        <label class="field-label required">Status</label>
        <pg-select
          .options=${this._statusOptions}
          .value=${this._formData.status ?? ''}
          placeholder="Select status"
          @change=${(/** @type {CustomEvent} */ e) => this._updateField('status', e.detail.value)}
        ></pg-select>
      </div>

      <div class="field-group">
        <label class="field-label">Epic</label>
        <pg-select
          .options=${this._epicOptions}
          .value=${this._formData.epic ?? ''}
          placeholder="Select epic"
          searchable
          @change=${(/** @type {CustomEvent} */ e) => this._updateField('epic', e.detail.value)}
        ></pg-select>
      </div>

      <div class="field-group">
        <label class="field-label">Sprint</label>
        <pg-select
          .options=${this._sprintOptions}
          .value=${this._formData.sprint ?? ''}
          placeholder="Select sprint"
          searchable
          @change=${(/** @type {CustomEvent} */ e) => this._updateField('sprint', e.detail.value)}
        ></pg-select>
      </div>
    `;
  }

  _renderTypeFields() {
    switch (this.type) {
      case 'task': return this._renderTaskFields();
      case 'bug': return this._renderBugFields();
      case 'epic': return this._renderEpicFields();
      case 'sprint': return this._renderSprintFields();
      case 'proposal': return this._renderProposalFields();
      case 'qa': return this._renderQAFields();
      default: return nothing;
    }
  }

  _renderTaskFields() {
    const story = this._formData.userStory ?? { role: '', goal: '', benefit: '' };
    const acs = this._formData.acceptanceCriteria ?? [];

    return html`
      <div class="section-divider">User Story</div>
      <div class="story-group">
        <div>
          <span class="story-prefix">As a</span>
          <input type="text" .value=${story.role} @input=${(/** @type {InputEvent} */ e) => this._updateNestedField('userStory', 'role', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="user role..." />
        </div>
        <div>
          <span class="story-prefix">I want to</span>
          <input type="text" .value=${story.goal} @input=${(/** @type {InputEvent} */ e) => this._updateNestedField('userStory', 'goal', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="action/goal..." />
        </div>
        <div>
          <span class="story-prefix">So that</span>
          <input type="text" .value=${story.benefit} @input=${(/** @type {InputEvent} */ e) => this._updateNestedField('userStory', 'benefit', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="business benefit..." />
        </div>
      </div>

      <div class="section-divider">Acceptance Criteria</div>
      <div class="ac-list">
        ${acs.map((ac, i) => html`
          <div class="ac-item">
            ${acs.length > 1 ? html`<button type="button" class="ac-remove-btn" @click=${() => this._removeAC(i)}>&times;</button>` : nothing}
            <div><span class="ac-prefix">Given</span>
              <input type="text" .value=${ac.given} @input=${(/** @type {InputEvent} */ e) => this._updateAC(i, 'given', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="precondition..." />
            </div>
            <div><span class="ac-prefix">When</span>
              <input type="text" .value=${ac.when} @input=${(/** @type {InputEvent} */ e) => this._updateAC(i, 'when', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="action..." />
            </div>
            <div><span class="ac-prefix">Then</span>
              <input type="text" .value=${ac.then} @input=${(/** @type {InputEvent} */ e) => this._updateAC(i, 'then', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="expected result..." />
            </div>
          </div>
        `)}
        <button type="button" class="add-btn" @click=${this._addAC}>+ Add criterion</button>
      </div>

      <div class="section-divider">Estimation</div>
      <div class="points-row">
        <div class="field-group">
          <label class="field-label required">Dev Points</label>
          <input type="number" min="1" max="5" .value=${String(this._formData.devPoints ?? 1)} @input=${(/** @type {InputEvent} */ e) => this._updateField('devPoints', Number(/** @type {HTMLInputElement} */ (e.target).value))} />
        </div>
        <div class="field-group">
          <label class="field-label required">Business Points</label>
          <input type="number" min="1" max="5" .value=${String(this._formData.businessPoints ?? 1)} @input=${(/** @type {InputEvent} */ e) => this._updateField('businessPoints', Number(/** @type {HTMLInputElement} */ (e.target).value))} />
        </div>
      </div>

      <div class="section-divider">People</div>
      <div class="field-group">
        <label class="field-label">Developer</label>
        <pg-select
          .options=${this._developerOptions}
          .value=${this._formData.developer?.id ?? ''}
          placeholder="Assign developer"
          searchable
          @change=${(/** @type {CustomEvent} */ e) => {
            const member = this.teamMembers.find((m) => m.id === e.detail.value);
            if (member) this._updateField('developer', { id: member.id, name: member.name, email: member.email });
          }}
        ></pg-select>
      </div>
      <div class="field-group">
        <label class="field-label">Validator</label>
        <pg-select
          .options=${this._stakeholderOptions}
          .value=${this._formData.validator?.id ?? ''}
          placeholder="Assign validator"
          searchable
          @change=${(/** @type {CustomEvent} */ e) => {
            const member = this.teamMembers.find((m) => m.id === e.detail.value);
            if (member) this._updateField('validator', { id: member.id, name: member.name, email: member.email });
          }}
        ></pg-select>
      </div>
    `;
  }

  _renderBugFields() {
    const priorityOpts = BUG_PRIORITIES.map((p) => ({ value: p, label: p }));

    return html`
      <div class="section-divider">Bug Details</div>
      <div class="field-group">
        <label class="field-label required">Priority</label>
        <pg-select
          .options=${priorityOpts}
          .value=${this._formData.bugPriority ?? ''}
          placeholder="Select priority"
          @change=${(/** @type {CustomEvent} */ e) => this._updateField('bugPriority', e.detail.value)}
        ></pg-select>
      </div>

      <div class="field-group">
        <label class="field-label">Developer</label>
        <pg-select
          .options=${this._developerOptions}
          .value=${this._formData.developer?.id ?? ''}
          placeholder="Assign developer"
          searchable
          @change=${(/** @type {CustomEvent} */ e) => {
            const member = this.teamMembers.find((m) => m.id === e.detail.value);
            if (member) this._updateField('developer', { id: member.id, name: member.name, email: member.email });
          }}
        ></pg-select>
      </div>

      <div class="field-group">
        <label class="field-label">Root Cause</label>
        <textarea
          .value=${this._formData.rootCause ?? ''}
          @input=${(/** @type {InputEvent} */ e) => this._updateField('rootCause', /** @type {HTMLTextAreaElement} */ (e.target).value)}
          placeholder="Root cause analysis..."
        ></textarea>
      </div>

      <div class="field-group">
        <label class="field-label">Resolution</label>
        <textarea
          .value=${this._formData.resolution ?? ''}
          @input=${(/** @type {InputEvent} */ e) => this._updateField('resolution', /** @type {HTMLTextAreaElement} */ (e.target).value)}
          placeholder="How the bug was resolved..."
        ></textarea>
      </div>
    `;
  }

  _renderEpicFields() {
    return html`
      <div class="section-divider">Epic Settings</div>
      <div class="field-group">
        <label class="field-label">Color</label>
        <input
          type="color"
          .value=${this._formData.color ?? '#6366f1'}
          @input=${(/** @type {InputEvent} */ e) => this._updateField('color', /** @type {HTMLInputElement} */ (e.target).value)}
        />
      </div>
    `;
  }

  _renderSprintFields() {
    const goals = this._formData.goals ?? [];
    return html`
      <div class="section-divider">Sprint Details</div>
      <div class="date-row">
        <div class="field-group">
          <label class="field-label required">Start Date</label>
          <input
            type="date"
            .value=${this._formData.startDate ?? ''}
            @input=${(/** @type {InputEvent} */ e) => this._updateField('startDate', /** @type {HTMLInputElement} */ (e.target).value)}
          />
        </div>
        <div class="field-group">
          <label class="field-label required">End Date</label>
          <input
            type="date"
            .value=${this._formData.endDate ?? ''}
            @input=${(/** @type {InputEvent} */ e) => this._updateField('endDate', /** @type {HTMLInputElement} */ (e.target).value)}
          />
        </div>
      </div>

      <div class="field-group">
        <label class="field-label">Goals</label>
        <div class="goals-list">
          ${goals.map((g, i) => html`
            <div class="goal-row">
              <input type="text" .value=${g} @input=${(/** @type {InputEvent} */ e) => this._updateGoal(i, /** @type {HTMLInputElement} */ (e.target).value)} placeholder="Sprint goal..." />
              ${goals.length > 1 ? html`<button type="button" class="goal-remove" @click=${() => this._removeGoal(i)}>&times;</button>` : nothing}
            </div>
          `)}
          <button type="button" class="add-btn" @click=${this._addGoal}>+ Add goal</button>
        </div>
      </div>
    `;
  }

  _renderProposalFields() {
    const story = this._formData.userStory ?? { role: '', goal: '', benefit: '' };
    return html`
      <div class="section-divider">User Story</div>
      <div class="story-group">
        <div>
          <span class="story-prefix">As a</span>
          <input type="text" .value=${story.role} @input=${(/** @type {InputEvent} */ e) => this._updateNestedField('userStory', 'role', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="user role..." />
        </div>
        <div>
          <span class="story-prefix">I want to</span>
          <input type="text" .value=${story.goal} @input=${(/** @type {InputEvent} */ e) => this._updateNestedField('userStory', 'goal', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="action/goal..." />
        </div>
        <div>
          <span class="story-prefix">So that</span>
          <input type="text" .value=${story.benefit} @input=${(/** @type {InputEvent} */ e) => this._updateNestedField('userStory', 'benefit', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="business benefit..." />
        </div>
      </div>
    `;
  }

  _renderQAFields() {
    const steps = this._formData.steps ?? [];
    return html`
      <div class="section-divider">QA Details</div>
      <div class="field-group">
        <label class="field-label required">Suite</label>
        <input type="text" .value=${this._formData.suite ?? ''} @input=${(/** @type {InputEvent} */ e) => this._updateField('suite', /** @type {HTMLInputElement} */ (e.target).value)} placeholder="Test suite name..." />
      </div>

      <div class="field-group">
        <label class="field-label required">Steps</label>
        <div class="goals-list">
          ${steps.map((s, i) => html`
            <div class="goal-row">
              <input type="text" .value=${s} @input=${(/** @type {InputEvent} */ e) => this._updateStep(i, /** @type {HTMLInputElement} */ (e.target).value)} placeholder="Step ${i + 1}..." />
              ${steps.length > 1 ? html`<button type="button" class="goal-remove" @click=${() => this._removeStep(i)}>&times;</button>` : nothing}
            </div>
          `)}
          <button type="button" class="add-btn" @click=${this._addStep}>+ Add step</button>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label required">Expected Result</label>
        <textarea
          .value=${this._formData.expectedResult ?? ''}
          @input=${(/** @type {InputEvent} */ e) => this._updateField('expectedResult', /** @type {HTMLTextAreaElement} */ (e.target).value)}
          placeholder="Expected result..."
        ></textarea>
      </div>

      <div class="field-group">
        <label class="field-label">Actual Result</label>
        <textarea
          .value=${this._formData.actualResult ?? ''}
          @input=${(/** @type {InputEvent} */ e) => this._updateField('actualResult', /** @type {HTMLTextAreaElement} */ (e.target).value)}
          placeholder="Actual result (fill during testing)..."
        ></textarea>
      </div>
    `;
  }

  _renderTagsField() {
    return html`
      <div class="field-group">
        <label class="field-label">Tags</label>
        <pg-select
          .options=${this._tagOptions}
          .value=${this._formData.tags ?? []}
          multiple
          searchable
          placeholder="Select tags..."
          @change=${(/** @type {CustomEvent} */ e) => this._updateField('tags', e.detail.value)}
        ></pg-select>
      </div>
    `;
  }
}

customElements.define('pg-form', PgForm);

export { PgForm };

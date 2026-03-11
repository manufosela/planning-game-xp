/**
 * Polymorphic card component.
 * Renders all card types (task, bug, epic, sprint, proposal, qa) based on `card.type`.
 *
 * Modes:
 * - collapsed: one-line row (for table views)
 * - preview: card format (for kanban/list views)
 * - full: all fields (rendered inside pg-card-panel)
 *
 * @element pg-card
 * @property {Object} card - Card data object
 * @property {'collapsed'|'preview'|'full'} mode
 * @property {Array} tagRegistry - Tag registry from project for color lookup
 * @fires card-click - In collapsed/preview modes when clicked
 * @fires card-update - In full mode when a field is edited
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';

class PgCard extends LitElement {
  static properties = {
    card: { type: Object },
    mode: { type: String },
    tagRegistry: { type: Array, attribute: 'tag-registry' },
  };

  static styles = css`
    :host {
      display: block;
    }

    /* ---- COLLAPSED MODE (table row) ---- */
    .collapsed {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      cursor: pointer;
      transition: background var(--transition-fast);
      font-size: 0.8125rem;
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .collapsed:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .collapsed .card-id {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
      flex-shrink: 0;
      min-width: 7rem;
    }

    .collapsed .card-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
    }

    .collapsed .card-meta {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      flex-shrink: 0;
    }

    .collapsed .developer-name {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #64748b);
    }

    .collapsed .points {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted, #94a3b8);
      background: var(--color-surface-sunken, #f1f5f9);
      padding: 0 var(--space-xs, 0.25rem);
      border-radius: var(--radius-sm, 0.25rem);
      line-height: 1.375rem;
    }

    .collapsed .tags-row {
      display: flex;
      gap: 0.125rem;
      flex-shrink: 0;
    }

    /* ---- PREVIEW MODE (kanban card) ---- */
    .preview {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-md, 0.75rem);
      cursor: pointer;
      transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
      border-left: 3px solid var(--type-color, var(--color-border));
    }

    .preview:hover {
      box-shadow: var(--shadow-md);
      border-color: var(--color-border-strong, #cbd5e1);
      border-left-color: var(--type-color);
    }

    .preview .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xs, 0.25rem);
    }

    .preview .card-id {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
    }

    .preview .points {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-secondary, #64748b);
      background: var(--color-surface-sunken, #f1f5f9);
      padding: 0 var(--space-xs, 0.25rem);
      border-radius: var(--radius-sm, 0.25rem);
      line-height: 1.25rem;
    }

    .preview .card-title {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
      margin-bottom: var(--space-sm, 0.5rem);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .preview .preview-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-xs, 0.25rem);
    }

    .preview .preview-left {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      min-width: 0;
    }

    .preview .developer-name {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview .preview-context {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      margin-top: var(--space-xs, 0.25rem);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview .tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.125rem;
      margin-top: var(--space-sm, 0.5rem);
    }

    /* ---- FULL MODE (panel editing) ---- */
    .full {
      padding: 0;
    }

    .full .section {
      padding: var(--space-lg, 1rem) 0;
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .full .section:last-child {
      border-bottom: none;
    }

    .full .section-title {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
      margin-bottom: var(--space-sm, 0.5rem);
    }

    .full .field-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-xs, 0.25rem) 0;
    }

    .full .field-label {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #64748b);
      min-width: 7rem;
      flex-shrink: 0;
    }

    .full .field-value {
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      flex: 1;
      min-width: 0;
    }

    .full .user-story {
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-md, 0.75rem);
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    .full .user-story .story-label {
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-primary, #4f46e5);
    }

    .full .ac-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 0.5rem);
    }

    .full .ac-item {
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    .full .ac-item .ac-keyword {
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-secondary, #64748b);
      text-transform: uppercase;
      font-size: 0.6875rem;
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    .full .points-display {
      display: flex;
      gap: var(--space-lg, 1rem);
    }

    .full .point-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2xs, 0.125rem);
    }

    .full .point-number {
      font-size: 1.25rem;
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text, #0f172a);
    }

    .full .point-label {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
    }

    .full .description-text {
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .full .member-info {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
    }

    .full .member-avatar {
      width: 1.25rem;
      height: 1.25rem;
      border-radius: var(--radius-full);
      background: var(--color-primary-subtle, #eef2ff);
      color: var(--color-primary, #4f46e5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.5rem;
      font-weight: var(--font-weight-semibold, 600);
      flex-shrink: 0;
    }

    .full .sprint-goals {
      list-style: none;
      padding: 0;
    }

    .full .sprint-goals li {
      padding: var(--space-2xs, 0.125rem) 0;
      font-size: 0.8125rem;
      color: var(--color-text);
    }

    .full .sprint-goals li::before {
      content: '\\2022';
      color: var(--color-text-muted);
      margin-right: var(--space-sm);
    }

    .full .bug-priority-badge {
      display: inline-block;
      padding: var(--space-2xs) var(--space-sm);
      border-radius: var(--radius-sm);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold);
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
      background: var(--color-error-subtle, #fef2f2);
      color: var(--color-error, #dc2626);
    }

    .full .tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 0.25rem);
    }

    .full .qa-steps {
      counter-reset: step;
      list-style: none;
      padding: 0;
    }

    .full .qa-steps li {
      counter-increment: step;
      padding: var(--space-xs) 0;
      font-size: 0.8125rem;
    }

    .full .qa-steps li::before {
      content: counter(step) '.';
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
      margin-right: var(--space-sm);
    }
  `;

  constructor() {
    super();
    /** @type {import('../lib/types.d.ts').Card | null} */
    this.card = null;
    /** @type {'collapsed'|'preview'|'full'} */
    this.mode = 'preview';
    /** @type {import('../lib/types.d.ts').TagRegistryEntry[]} */
    this.tagRegistry = [];
  }

  /** @param {string} tagName */
  _getTagColor(tagName) {
    const entry = this.tagRegistry?.find((t) => t.name === tagName);
    return entry?.color ?? '';
  }

  /** @returns {string} CSS variable for the card type accent color */
  get _typeColor() {
    if (!this.card) return '';
    return `var(--color-type-${this.card.type})`;
  }

  /** @returns {string} Developer display name */
  get _developerName() {
    const card = /** @type {any} */ (this.card);
    return card?.developer?.name ?? '';
  }

  /** @returns {number | null} Points display (devPoints for tasks) */
  get _points() {
    const card = /** @type {any} */ (this.card);
    return card?.devPoints ?? null;
  }

  _onClick() {
    if (this.mode === 'full') return;
    this.dispatchEvent(new CustomEvent('card-click', {
      detail: { card: this.card },
      bubbles: true,
      composed: true,
    }));
  }

  // ---------------------------------------------------------------------------
  // Render modes
  // ---------------------------------------------------------------------------

  render() {
    if (!this.card) return nothing;

    switch (this.mode) {
      case 'collapsed': return this._renderCollapsed();
      case 'full': return this._renderFull();
      default: return this._renderPreview();
    }
  }

  _renderCollapsed() {
    const c = this.card;
    return html`
      <div class="collapsed" @click=${this._onClick}>
        <span class="card-id">${c.cardId}</span>
        <span class="card-title">${c.title}</span>
        <div class="card-meta">
          <pg-badge text=${c.status} variant="status"></pg-badge>
          ${this._developerName ? html`<span class="developer-name">@${this._developerName}</span>` : nothing}
          ${this._points ? html`<span class="points">${this._points}pts</span>` : nothing}
          ${c.tags?.length ? html`
            <div class="tags-row">
              ${c.tags.map((t) => html`<pg-badge text=${t} variant="tag" color=${this._getTagColor(t)}></pg-badge>`)}
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  _renderPreview() {
    const c = this.card;
    const context = [c.sprint, c.epic].filter(Boolean).join(' \u00B7 ');

    return html`
      <div class="preview" style="--type-color: ${this._typeColor}" @click=${this._onClick}>
        <div class="preview-header">
          <span class="card-id">${c.cardId}</span>
          ${this._points ? html`<span class="points">${this._points} pts</span>` : nothing}
        </div>
        <div class="card-title">${c.title}</div>
        <div class="preview-footer">
          <div class="preview-left">
            <pg-badge text=${c.status} variant="status"></pg-badge>
            ${this._developerName ? html`<span class="developer-name">@${this._developerName}</span>` : nothing}
          </div>
        </div>
        ${context ? html`<div class="preview-context">${context}</div>` : nothing}
        ${c.tags?.length ? html`
          <div class="tags-row">
            ${c.tags.map((t) => html`<pg-badge text=${t} variant="tag" color=${this._getTagColor(t)}></pg-badge>`)}
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderFull() {
    const c = this.card;
    return html`
      <div class="full">
        <!-- Common fields -->
        <div class="section">
          <div class="section-title">Details</div>
          <div class="field-row">
            <span class="field-label">Status</span>
            <span class="field-value"><pg-badge text=${c.status} variant="status"></pg-badge></span>
          </div>
          <div class="field-row">
            <span class="field-label">Type</span>
            <span class="field-value"><pg-badge text=${c.type} variant="type"></pg-badge></span>
          </div>
          <div class="field-row">
            <span class="field-label">Year</span>
            <span class="field-value">${c.year}</span>
          </div>
          ${c.epic ? html`
            <div class="field-row">
              <span class="field-label">Epic</span>
              <span class="field-value">${c.epic}</span>
            </div>
          ` : nothing}
          ${c.sprint ? html`
            <div class="field-row">
              <span class="field-label">Sprint</span>
              <span class="field-value">${c.sprint}</span>
            </div>
          ` : nothing}
        </div>

        ${c.description ? html`
          <div class="section">
            <div class="section-title">Description</div>
            <div class="description-text">${c.description}</div>
          </div>
        ` : nothing}

        <!-- Type-specific fields -->
        ${this._renderTypeFields()}

        <!-- Tags -->
        ${c.tags?.length ? html`
          <div class="section">
            <div class="section-title">Tags</div>
            <div class="tags-row">
              ${c.tags.map((t) => html`<pg-badge text=${t} variant="tag" color=${this._getTagColor(t)}></pg-badge>`)}
            </div>
          </div>
        ` : nothing}

        <!-- Notes -->
        ${c.notes ? html`
          <div class="section">
            <div class="section-title">Notes</div>
            <div class="description-text">${c.notes}</div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Type-specific sections
  // ---------------------------------------------------------------------------

  _renderTypeFields() {
    if (!this.card) return nothing;
    switch (this.card.type) {
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
    const task = /** @type {import('../lib/types.d.ts').Task} */ (this.card);

    return html`
      <!-- User Story -->
      ${task.userStory ? html`
        <div class="section">
          <div class="section-title">User Story</div>
          <div class="user-story">
            <span class="story-label">As a</span> ${task.userStory.role}<br/>
            <span class="story-label">I want to</span> ${task.userStory.goal}<br/>
            <span class="story-label">So that</span> ${task.userStory.benefit}
          </div>
        </div>
      ` : nothing}

      <!-- Acceptance Criteria -->
      ${task.acceptanceCriteria?.length ? html`
        <div class="section">
          <div class="section-title">Acceptance Criteria</div>
          <div class="ac-list">
            ${task.acceptanceCriteria.map((ac) => html`
              <div class="ac-item">
                <span class="ac-keyword">Given</span> ${ac.given}<br/>
                <span class="ac-keyword">When</span> ${ac.when}<br/>
                <span class="ac-keyword">Then</span> ${ac.then}
              </div>
            `)}
          </div>
        </div>
      ` : nothing}

      <!-- Points -->
      <div class="section">
        <div class="section-title">Estimation</div>
        <div class="points-display">
          <div class="point-box">
            <span class="point-number">${task.devPoints ?? '-'}</span>
            <span class="point-label">Dev</span>
          </div>
          <div class="point-box">
            <span class="point-number">${task.businessPoints ?? '-'}</span>
            <span class="point-label">Business</span>
          </div>
          <div class="point-box">
            <span class="point-number">${task.priority ?? '-'}</span>
            <span class="point-label">Priority</span>
          </div>
        </div>
      </div>

      <!-- People -->
      <div class="section">
        <div class="section-title">People</div>
        ${this._renderMemberField('Developer', task.developer)}
        ${this._renderMemberField('Co-developer', task.codeveloper)}
        ${this._renderMemberField('Validator', task.validator)}
        ${this._renderMemberField('Co-validator', task.covalidator)}
      </div>

      <!-- Pipeline -->
      ${task.pipeline ? html`
        <div class="section">
          <div class="section-title">Pipeline</div>
          ${task.pipeline.branch ? html`
            <div class="field-row">
              <span class="field-label">Branch</span>
              <span class="field-value" style="font-family: var(--font-mono); font-size: 0.75rem;">${task.pipeline.branch}</span>
            </div>
          ` : nothing}
          ${task.pipeline.prUrl ? html`
            <div class="field-row">
              <span class="field-label">PR</span>
              <span class="field-value"><a href="${task.pipeline.prUrl}" target="_blank">#${task.pipeline.prNumber}</a></span>
            </div>
          ` : nothing}
        </div>
      ` : nothing}
    `;
  }

  _renderBugFields() {
    const bug = /** @type {import('../lib/types.d.ts').Bug} */ (this.card);

    return html`
      <div class="section">
        <div class="section-title">Bug Details</div>
        <div class="field-row">
          <span class="field-label">Priority</span>
          <span class="field-value"><span class="bug-priority-badge">${bug.bugPriority}</span></span>
        </div>
        ${this._renderMemberField('Developer', bug.developer)}
        ${this._renderMemberField('Validator', bug.validator)}
        ${bug.rootCause ? html`
          <div class="field-row">
            <span class="field-label">Root Cause</span>
            <span class="field-value">${bug.rootCause}</span>
          </div>
        ` : nothing}
        ${bug.resolution ? html`
          <div class="field-row">
            <span class="field-label">Resolution</span>
            <span class="field-value">${bug.resolution}</span>
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderEpicFields() {
    const epic = /** @type {import('../lib/types.d.ts').Epic} */ (this.card);
    return html`
      ${epic.color ? html`
        <div class="section">
          <div class="section-title">Color</div>
          <div class="field-row">
            <span class="field-label">Accent</span>
            <span class="field-value">
              <span style="display:inline-block;width:1rem;height:1rem;border-radius:var(--radius-sm);background:${epic.color};vertical-align:middle;margin-right:var(--space-xs)"></span>
              <code>${epic.color}</code>
            </span>
          </div>
        </div>
      ` : nothing}
    `;
  }

  _renderSprintFields() {
    const sprint = /** @type {import('../lib/types.d.ts').Sprint} */ (this.card);
    return html`
      <div class="section">
        <div class="section-title">Sprint Details</div>
        <div class="field-row">
          <span class="field-label">Start Date</span>
          <span class="field-value">${this._formatDate(sprint.startDate)}</span>
        </div>
        <div class="field-row">
          <span class="field-label">End Date</span>
          <span class="field-value">${this._formatDate(sprint.endDate)}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Locked</span>
          <span class="field-value">${sprint.locked ? 'Yes' : 'No'}</span>
        </div>
        ${sprint.goals?.length ? html`
          <div class="field-row">
            <span class="field-label">Goals</span>
            <span class="field-value">
              <ul class="sprint-goals">
                ${sprint.goals.map((g) => html`<li>${g}</li>`)}
              </ul>
            </span>
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderProposalFields() {
    const proposal = /** @type {import('../lib/types.d.ts').Proposal} */ (this.card);
    return html`
      ${proposal.userStory ? html`
        <div class="section">
          <div class="section-title">User Story</div>
          <div class="user-story">
            <span class="story-label">As a</span> ${proposal.userStory.role}<br/>
            <span class="story-label">I want to</span> ${proposal.userStory.goal}<br/>
            <span class="story-label">So that</span> ${proposal.userStory.benefit}
          </div>
        </div>
      ` : nothing}
      ${proposal.convertedToTaskId ? html`
        <div class="section">
          <div class="section-title">Conversion</div>
          <div class="field-row">
            <span class="field-label">Task</span>
            <span class="field-value" style="font-family: var(--font-mono);">${proposal.convertedToTaskId}</span>
          </div>
        </div>
      ` : nothing}
    `;
  }

  _renderQAFields() {
    const qa = /** @type {import('../lib/types.d.ts').QA} */ (this.card);
    return html`
      <div class="section">
        <div class="section-title">QA Details</div>
        <div class="field-row">
          <span class="field-label">Suite</span>
          <span class="field-value">${qa.suite}</span>
        </div>
        ${qa.steps?.length ? html`
          <div class="field-row">
            <span class="field-label">Steps</span>
            <span class="field-value">
              <ol class="qa-steps">
                ${qa.steps.map((s) => html`<li>${s}</li>`)}
              </ol>
            </span>
          </div>
        ` : nothing}
        <div class="field-row">
          <span class="field-label">Expected</span>
          <span class="field-value">${qa.expectedResult}</span>
        </div>
        ${qa.actualResult ? html`
          <div class="field-row">
            <span class="field-label">Actual</span>
            <span class="field-value">${qa.actualResult}</span>
          </div>
        ` : nothing}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * @param {string} label
   * @param {import('../lib/types.d.ts').TeamMemberRef | undefined} member
   */
  _renderMemberField(label, member) {
    if (!member) return nothing;
    const initials = member.name?.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() ?? '?';
    return html`
      <div class="field-row">
        <span class="field-label">${label}</span>
        <span class="field-value">
          <span class="member-info">
            <span class="member-avatar">${initials}</span>
            ${member.name}
          </span>
        </span>
      </div>
    `;
  }

  /**
   * Format a Firestore Timestamp or date string.
   * @param {any} ts
   * @returns {string}
   */
  _formatDate(ts) {
    if (!ts) return '-';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

customElements.define('pg-card', PgCard);

export { PgCard };

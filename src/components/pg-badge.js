/**
 * Reusable badge component for status, type, priority, and tag labels.
 *
 * @element pg-badge
 * @property {string} text - Badge label
 * @property {'status'|'priority'|'type'|'tag'} variant - Badge visual variant
 * @property {string} color - Optional hex color override (used for tags)
 */

import { LitElement, html, css } from 'lit';

/** @type {Record<string, string>} */
const STATUS_CSS_MAP = {
  'To Do':          'var(--color-status-todo)',
  'In Progress':    'var(--color-status-inprogress)',
  'To Validate':    'var(--color-status-tovalidate)',
  'Done':           'var(--color-status-done)',
  'Done&Validated': 'var(--color-status-donevalidated)',
  'Blocked':        'var(--color-status-blocked)',
  'Reopened':       'var(--color-status-reopened)',
  'Created':        'var(--color-status-created)',
  'Assigned':       'var(--color-status-assigned)',
  'Fixed':          'var(--color-status-fixed)',
  'Verified':       'var(--color-status-verified)',
  'Closed':         'var(--color-status-closed)',
  'Active':         'var(--color-status-inprogress)',
  'Completed':      'var(--color-status-done)',
  'Archived':       'var(--color-status-closed)',
  'Planned':        'var(--color-status-inprogress)',
  'Pending':        'var(--color-status-todo)',
  'Rejected':       'var(--color-status-blocked)',
  'Passed':         'var(--color-status-done)',
  'Failed':         'var(--color-status-blocked)',
};

/** @type {Record<string, string>} */
const TYPE_CSS_MAP = {
  task:     'var(--color-type-task)',
  bug:      'var(--color-type-bug)',
  epic:     'var(--color-type-epic)',
  sprint:   'var(--color-type-sprint)',
  proposal: 'var(--color-type-proposal)',
  qa:       'var(--color-type-qa)',
};

class PgBadge extends LitElement {
  static properties = {
    text: { type: String },
    variant: { type: String },
    color: { type: String },
  };

  static styles = css`
    :host {
      display: inline-flex;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2xs, 0.125rem);
      padding: 0.0625rem var(--space-sm, 0.5rem);
      border-radius: var(--radius-full, 9999px);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-medium, 500);
      letter-spacing: var(--tracking-wide, 0.025em);
      line-height: 1.375rem;
      white-space: nowrap;
      text-transform: uppercase;
      user-select: none;
    }

    /* Status variant: dot + label */
    .badge.status {
      background: transparent;
      padding-left: 0;
      padding-right: 0;
      color: var(--color-text-secondary, #64748b);
    }

    .badge.status .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-full, 9999px);
      flex-shrink: 0;
    }

    /* Type variant: filled subtle background */
    .badge.type {
      color: var(--badge-color);
      background: color-mix(in srgb, var(--badge-color) 12%, transparent);
    }

    /* Priority variant: filled prominent */
    .badge.priority {
      color: var(--badge-color, var(--color-text-inverse));
      background: color-mix(in srgb, var(--badge-color) 15%, transparent);
    }

    /* Tag variant: custom color or default */
    .badge.tag {
      color: var(--badge-color, var(--color-primary));
      background: color-mix(in srgb, var(--badge-color, var(--color-primary)) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--badge-color, var(--color-primary)) 25%, transparent);
      text-transform: none;
      font-weight: var(--font-weight-normal, 400);
      font-size: 0.75rem;
    }
  `;

  constructor() {
    super();
    /** @type {string} */
    this.text = '';
    /** @type {'status'|'priority'|'type'|'tag'} */
    this.variant = 'status';
    /** @type {string} */
    this.color = '';
  }

  /** @returns {string} Resolved CSS color for the badge */
  get _resolvedColor() {
    if (this.color) return this.color;
    if (this.variant === 'status') return STATUS_CSS_MAP[this.text] ?? 'var(--color-text-muted)';
    if (this.variant === 'type') return TYPE_CSS_MAP[this.text?.toLowerCase()] ?? 'var(--color-text-muted)';
    return 'var(--color-text-muted)';
  }

  render() {
    const color = this._resolvedColor;

    if (this.variant === 'status') {
      return html`
        <span class="badge status">
          <span class="dot" style="background: ${color}"></span>
          ${this.text}
        </span>
      `;
    }

    return html`
      <span class="badge ${this.variant}" style="--badge-color: ${color}">
        ${this.text}
      </span>
    `;
  }
}

customElements.define('pg-badge', PgBadge);

export { PgBadge };

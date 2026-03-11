/**
 * Right-side slide panel for card editing.
 * Contains pg-card in full mode + action buttons.
 *
 * @element pg-card-panel
 * @property {Object} card - Card data
 * @property {boolean} open - Whether the panel is open
 * @property {Array} tagRegistry - Tag registry from project
 * @fires panel-close - When panel is closed
 * @fires panel-save - When save is clicked, detail: { card }
 * @fires panel-delete - When delete is clicked, detail: { card }
 * @fires panel-edit - When edit mode is requested, detail: { card }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-card.js';

class PgCardPanel extends LitElement {
  static properties = {
    card: { type: Object },
    open: { type: Boolean, reflect: true },
    tagRegistry: { type: Array, attribute: 'tag-registry' },
    _animating: { state: true },
  };

  static styles = css`
    :host {
      display: contents;
    }

    /* Backdrop overlay */
    .backdrop {
      position: fixed;
      inset: 0;
      background: var(--color-surface-overlay, rgba(15, 23, 42, 0.6));
      z-index: var(--z-overlay, 300);
      opacity: 0;
      transition: opacity var(--transition-base, 200ms ease);
      pointer-events: none;
    }

    .backdrop.visible {
      opacity: 1;
      pointer-events: auto;
    }

    /* Panel */
    .panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 38rem;
      max-width: 100vw;
      background: var(--color-surface-raised, #fff);
      border-left: 1px solid var(--color-border, #e2e8f0);
      box-shadow: var(--shadow-xl);
      z-index: var(--z-modal, 400);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform var(--transition-slow, 300ms ease);
    }

    .panel.open {
      transform: translateX(0);
    }

    /* Panel header */
    .panel-header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      flex-shrink: 0;
    }

    .panel-header .card-id {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
      flex-shrink: 0;
    }

    .panel-header .card-title {
      flex: 1;
      min-width: 0;
      font-size: 0.9375rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-header .type-indicator {
      width: 3px;
      height: 1.25rem;
      border-radius: var(--radius-full);
      flex-shrink: 0;
    }

    .close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: var(--radius-md, 0.5rem);
      border: none;
      background: transparent;
      color: var(--color-text-secondary, #64748b);
      cursor: pointer;
      flex-shrink: 0;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .close-btn:hover {
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text, #0f172a);
    }

    .close-btn svg {
      width: 1.125rem;
      height: 1.125rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Panel body (scrollable) */
    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 1rem);
    }

    /* Panel footer */
    .panel-footer {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
      border-top: 1px solid var(--color-border, #e2e8f0);
      flex-shrink: 0;
    }

    .panel-footer .spacer {
      flex: 1;
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

    .btn-danger {
      color: var(--color-error, #dc2626);
      border-color: transparent;
      background: transparent;
    }

    .btn-danger:hover {
      background: var(--color-error-subtle, #fef2f2);
    }

    /* Mobile: full width */
    @media (max-width: 640px) {
      .panel {
        width: 100vw;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .panel,
      .backdrop {
        transition-duration: 0.01ms;
      }
    }
  `;

  constructor() {
    super();
    /** @type {import('../lib/types.d.ts').Card | null} */
    this.card = null;
    this.open = false;
    /** @type {import('../lib/types.d.ts').TagRegistryEntry[]} */
    this.tagRegistry = [];
    this._animating = false;

    this._onKeyDown = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape' && this.open) {
        this._close();
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
  }

  /** @param {Map<string, unknown>} changed */
  updated(changed) {
    if (changed.has('open') && this.open) {
      // Prevent body scroll when panel is open
      document.body.style.overflow = 'hidden';
    } else if (changed.has('open') && !this.open) {
      document.body.style.overflow = '';
    }
  }

  _close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true, composed: true }));
  }

  _edit() {
    this.dispatchEvent(new CustomEvent('panel-edit', {
      detail: { card: this.card },
      bubbles: true,
      composed: true,
    }));
  }

  _save() {
    this.dispatchEvent(new CustomEvent('panel-save', {
      detail: { card: this.card },
      bubbles: true,
      composed: true,
    }));
  }

  _delete() {
    this.dispatchEvent(new CustomEvent('panel-delete', {
      detail: { card: this.card },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const typeColor = this.card ? `var(--color-type-${this.card.type})` : '';

    return html`
      <div class="backdrop ${this.open ? 'visible' : ''}" @click=${this._close}></div>

      <div class="panel ${this.open ? 'open' : ''}">
        ${this.card ? html`
          <div class="panel-header">
            <span class="type-indicator" style="background: ${typeColor}"></span>
            <span class="card-id">${this.card.cardId}</span>
            <span class="card-title">${this.card.title}</span>
            <button class="close-btn" @click=${this._close} aria-label="Close panel">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="panel-body">
            <pg-card
              .card=${this.card}
              mode="full"
              .tagRegistry=${this.tagRegistry}
            ></pg-card>
          </div>

          <div class="panel-footer">
            <button class="btn btn-danger" @click=${this._delete}>Delete</button>
            <div class="spacer"></div>
            <button class="btn" @click=${this._close}>Close</button>
            <button class="btn btn-primary" @click=${this._edit}>Edit</button>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('pg-card-panel', PgCardPanel);

export { PgCardPanel };

/**
 * Toast notification system.
 *
 * Usage:
 *   import './pg-toast.js';
 *   PgToast.show('Saved successfully', 'success');
 *
 * @element pg-toast
 */

import { LitElement, html, css } from 'lit';

/** Maximum number of visible toasts at a time. */
const MAX_VISIBLE = 5;

/** Default auto-dismiss duration in ms. */
const DEFAULT_DURATION = 5000;

/**
 * @typedef {'success' | 'error' | 'warning' | 'info'} ToastType
 * @typedef {{ id: number; message: string; type: ToastType; removing: boolean }} ToastItem
 */

class PgToast extends LitElement {
  static properties = {
    _toasts: { state: true },
  };

  static styles = css`
    :host {
      position: fixed;
      bottom: var(--space-lg, 1rem);
      right: var(--space-lg, 1rem);
      z-index: var(--z-toast, 500);
      display: flex;
      flex-direction: column-reverse;
      gap: var(--space-sm, 0.5rem);
      pointer-events: none;
      max-width: 24rem;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
      border-radius: var(--radius-md, 0.5rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      box-shadow: var(--shadow-lg);
      font: var(--text-sm, 0.875rem / 1.25rem);
      color: var(--color-text, #0f172a);
      pointer-events: auto;
      animation: toast-in 200ms ease forwards;
      max-width: 100%;
    }

    .toast.removing {
      animation: toast-out 150ms ease forwards;
    }

    .toast .indicator {
      width: 0.375rem;
      height: 0.375rem;
      border-radius: var(--radius-full, 9999px);
      flex-shrink: 0;
    }

    .toast.success .indicator { background: var(--color-success, #16a34a); }
    .toast.error .indicator   { background: var(--color-error, #dc2626); }
    .toast.warning .indicator { background: var(--color-warning, #d97706); }
    .toast.info .indicator    { background: var(--color-info, #2563eb); }

    .toast .message {
      flex: 1;
      min-width: 0;
      word-break: break-word;
    }

    .toast .close {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.25rem;
      height: 1.25rem;
      border-radius: var(--radius-sm, 0.25rem);
      background: transparent;
      border: none;
      color: var(--color-text-muted, #94a3b8);
      cursor: pointer;
      font-size: 0.875rem;
      line-height: 1;
      transition: color var(--transition-fast, 150ms ease);
    }

    .toast .close:hover {
      color: var(--color-text, #0f172a);
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(0.5rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes toast-out {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(0.5rem);
      }
    }
  `;

  constructor() {
    super();
    /** @type {ToastItem[]} */
    this._toasts = [];
    this._nextId = 0;
  }

  /**
   * Add a toast notification.
   * @param {string} message
   * @param {ToastType} type
   * @param {number} [duration]
   */
  addToast(message, type = 'info', duration = DEFAULT_DURATION) {
    const id = this._nextId++;
    this._toasts = [...this._toasts, { id, message, type, removing: false }];

    // Trim to max visible
    if (this._toasts.length > MAX_VISIBLE) {
      this._dismiss(this._toasts[0].id);
    }

    // Auto-dismiss
    if (duration > 0) {
      globalThis.setTimeout(() => this._dismiss(id), duration);
    }
  }

  /**
   * Start removal animation, then remove from list.
   * @param {number} id
   */
  _dismiss(id) {
    this._toasts = this._toasts.map((t) =>
      t.id === id ? { ...t, removing: true } : t
    );
    // Remove after animation
    globalThis.setTimeout(() => {
      this._toasts = this._toasts.filter((t) => t.id !== id);
    }, 150);
  }

  render() {
    return html`
      ${this._toasts.map(
        (t) => html`
          <div class="toast ${t.type} ${t.removing ? 'removing' : ''}">
            <span class="indicator"></span>
            <span class="message">${t.message}</span>
            <button class="close" @click=${() => this._dismiss(t.id)} aria-label="Dismiss">&times;</button>
          </div>
        `
      )}
    `;
  }

  /* -----------------------------------------------------------------------
   * Static API — uses a singleton <pg-toast> element appended to body.
   * ----------------------------------------------------------------------- */

  /** @type {PgToast | null} */
  static _instance = null;

  /** @returns {PgToast} */
  static _getInstance() {
    if (!PgToast._instance) {
      PgToast._instance = /** @type {PgToast} */ (document.createElement('pg-toast'));
      document.body.append(PgToast._instance);
    }
    return PgToast._instance;
  }

  /**
   * Show a toast notification (global static method).
   * @param {string} message
   * @param {ToastType} [type='info']
   * @param {number} [duration=5000]
   */
  static show(message, type = 'info', duration = DEFAULT_DURATION) {
    PgToast._getInstance().addToast(message, type, duration);
  }
}

customElements.define('pg-toast', PgToast);

export { PgToast };

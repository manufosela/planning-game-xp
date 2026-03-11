/**
 * Lightweight modal for confirmations and quick dialogs.
 * NOT for card editing (use pg-card-panel for that).
 *
 * Usage:
 *   const confirmed = await PgModal.confirm({ title: 'Delete?', message: 'This cannot be undone.' });
 *
 * @element pg-modal
 * @property {string} title
 * @property {string} message
 * @property {string} confirmText
 * @property {string} cancelText
 * @property {'default'|'danger'} variant
 * @fires modal-confirm
 * @fires modal-cancel
 */

import { LitElement, html, css } from 'lit';

class PgModal extends LitElement {
  static properties = {
    title: { type: String },
    message: { type: String },
    confirmText: { type: String, attribute: 'confirm-text' },
    cancelText: { type: String, attribute: 'cancel-text' },
    variant: { type: String },
    _visible: { state: true },
  };

  static styles = css`
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: var(--color-surface-overlay, rgba(15, 23, 42, 0.6));
      z-index: var(--z-modal, 400);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-lg, 1rem);
      animation: fade-in 150ms ease forwards;
    }

    .backdrop[hidden] {
      display: none;
    }

    .dialog {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-lg, 0.75rem);
      box-shadow: var(--shadow-xl);
      max-width: 26rem;
      width: 100%;
      padding: var(--space-xl, 1.5rem);
      animation: scale-in 150ms ease forwards;
    }

    .dialog-title {
      font-size: 1rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      margin-bottom: var(--space-sm, 0.5rem);
    }

    .dialog-message {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #64748b);
      line-height: 1.5;
      margin-bottom: var(--space-xl, 1.5rem);
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
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

    .btn-confirm {
      background: var(--color-primary, #4f46e5);
      color: var(--color-primary-text, #fff);
      border-color: var(--color-primary, #4f46e5);
    }

    .btn-confirm:hover {
      background: var(--color-primary-hover, #4338ca);
      border-color: var(--color-primary-hover, #4338ca);
    }

    .btn-confirm.danger {
      background: var(--color-error, #dc2626);
      border-color: var(--color-error, #dc2626);
    }

    .btn-confirm.danger:hover {
      background: var(--color-error, #b91c1c);
      border-color: var(--color-error, #b91c1c);
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes scale-in {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
  `;

  constructor() {
    super();
    this.title = '';
    this.message = '';
    this.confirmText = 'Confirm';
    this.cancelText = 'Cancel';
    /** @type {'default'|'danger'} */
    this.variant = 'default';
    this._visible = false;

    /** @type {((value: boolean) => void) | null} */
    this._resolver = null;

    this._onKeyDown = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape' && this._visible) {
        this._cancel();
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

  /**
   * Show the modal and return a promise that resolves to true (confirm) or false (cancel).
   * @returns {Promise<boolean>}
   */
  open() {
    this._visible = true;
    // Trap focus
    this.updateComplete.then(() => {
      this.shadowRoot?.querySelector('.btn-confirm')?.focus();
    });
    return new Promise((resolve) => {
      this._resolver = resolve;
    });
  }

  _confirm() {
    this._visible = false;
    this._resolver?.(true);
    this._resolver = null;
    this.dispatchEvent(new CustomEvent('modal-confirm', { bubbles: true, composed: true }));
  }

  _cancel() {
    this._visible = false;
    this._resolver?.(false);
    this._resolver = null;
    this.dispatchEvent(new CustomEvent('modal-cancel', { bubbles: true, composed: true }));
  }

  /** @param {MouseEvent} e */
  _onBackdropClick(e) {
    if (/** @type {HTMLElement} */ (e.target).classList.contains('backdrop')) {
      this._cancel();
    }
  }

  render() {
    return html`
      <div class="backdrop" ?hidden=${!this._visible} @click=${this._onBackdropClick}>
        <div class="dialog" role="alertdialog" aria-labelledby="modal-title" aria-describedby="modal-message">
          ${this.title ? html`<div class="dialog-title" id="modal-title">${this.title}</div>` : ''}
          ${this.message ? html`<div class="dialog-message" id="modal-message">${this.message}</div>` : ''}
          <div class="dialog-actions">
            <button class="btn" @click=${this._cancel}>${this.cancelText}</button>
            <button class="btn btn-confirm ${this.variant}" @click=${this._confirm}>${this.confirmText}</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Static API — singleton pattern
  // ---------------------------------------------------------------------------

  /** @type {PgModal | null} */
  static _instance = null;

  /** @returns {PgModal} */
  static _getInstance() {
    if (!PgModal._instance) {
      PgModal._instance = /** @type {PgModal} */ (document.createElement('pg-modal'));
      document.body.append(PgModal._instance);
    }
    return PgModal._instance;
  }

  /**
   * Show a confirmation dialog.
   * @param {{ title: string; message: string; confirmText?: string; cancelText?: string; variant?: 'default'|'danger' }} opts
   * @returns {Promise<boolean>}
   */
  static confirm(opts) {
    const modal = PgModal._getInstance();
    modal.title = opts.title;
    modal.message = opts.message;
    modal.confirmText = opts.confirmText ?? 'Confirm';
    modal.cancelText = opts.cancelText ?? 'Cancel';
    modal.variant = opts.variant ?? 'default';
    return modal.open();
  }
}

customElements.define('pg-modal', PgModal);

export { PgModal };

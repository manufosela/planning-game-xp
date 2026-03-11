/**
 * Theme toggle — cycles system -> light -> dark -> system.
 * Persists to localStorage, sets data-theme on documentElement,
 * and updates the store signal.
 *
 * @element pg-theme-toggle
 */

import { LitElement, html, css } from 'lit';
import { theme as themeSignal } from '../lib/store.js';

/** @type {Array<import('../lib/types.d.ts').ThemeMode>} */
const MODES = ['system', 'light', 'dark'];
const STORAGE_KEY = 'pg-theme';

class PgThemeToggle extends LitElement {
  static properties = {
    _mode: { state: true },
  };

  static styles = css`
    :host {
      display: inline-flex;
    }

    button {
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
      transition: background var(--transition-fast, 150ms ease),
                  color var(--transition-fast, 150ms ease);
    }

    button:hover {
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text, #0f172a);
    }

    svg {
      width: 1.125rem;
      height: 1.125rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `;

  constructor() {
    super();
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    /** @type {import('../lib/types.d.ts').ThemeMode} */
    this._mode = MODES.includes(/** @type {any} */ (stored)) ? /** @type {import('../lib/types.d.ts').ThemeMode} */ (stored) : 'system';
    this._apply();
  }

  /** Cycle to the next mode. */
  _toggle() {
    const idx = MODES.indexOf(this._mode);
    this._mode = MODES[(idx + 1) % MODES.length];
    globalThis.localStorage?.setItem(STORAGE_KEY, this._mode);
    this._apply();
  }

  /** Apply the current mode to the DOM and signal store. */
  _apply() {
    const root = globalThis.document?.documentElement;
    if (!root) return;

    if (this._mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', this._mode);
    }
    themeSignal.value = this._mode;
  }

  /** @returns {import('lit').TemplateResult} */
  _icon() {
    if (this._mode === 'light') {
      // Sun icon
      return html`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    }
    if (this._mode === 'dark') {
      // Moon icon
      return html`<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
    // System (monitor) icon
    return html`<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
  }

  /** @returns {string} */
  _label() {
    const labels = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };
    return labels[this._mode];
  }

  render() {
    return html`
      <button
        @click=${this._toggle}
        aria-label=${this._label()}
        title=${this._label()}
      >
        ${this._icon()}
      </button>
    `;
  }
}

customElements.define('pg-theme-toggle', PgThemeToggle);

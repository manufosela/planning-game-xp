/**
 * Year selector with left/right arrows.
 * Persists selection in localStorage and updates the filters signal.
 *
 * @element pg-year
 * @property {number} value - Current year
 * @fires year-change - Dispatched with detail: { year: number }
 */

import { LitElement, html, css } from 'lit';

const STORAGE_KEY = 'pg-year';

class PgYear extends LitElement {
  static properties = {
    value: { type: Number },
  };

  static styles = css`
    :host {
      display: inline-flex;
    }

    .year-selector {
      display: inline-flex;
      align-items: center;
      gap: 0;
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-2xs, 0.125rem);
    }

    .arrow-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border: none;
      background: transparent;
      border-radius: var(--radius-sm, 0.25rem);
      color: var(--color-text-muted, #94a3b8);
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .arrow-btn:hover {
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
    }

    .arrow-btn svg {
      width: 0.875rem;
      height: 0.875rem;
    }

    .year-value {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      min-width: 3rem;
      text-align: center;
      user-select: none;
    }
  `;

  constructor() {
    super();
    const stored = localStorage.getItem(STORAGE_KEY);
    /** @type {number} */
    this.value = stored ? parseInt(stored, 10) : new Date().getFullYear();
  }

  /** @param {number} delta */
  _changeYear(delta) {
    this.value += delta;
    localStorage.setItem(STORAGE_KEY, String(this.value));
    this.dispatchEvent(new CustomEvent('year-change', {
      detail: { year: this.value },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="year-selector" role="group" aria-label="Year selector">
        <button class="arrow-btn" aria-label="Previous year" @click=${() => this._changeYear(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="year-value">${this.value}</span>
        <button class="arrow-btn" aria-label="Next year" @click=${() => this._changeYear(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    `;
  }
}

customElements.define('pg-year', PgYear);

export { PgYear };

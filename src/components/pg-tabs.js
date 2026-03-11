/**
 * Horizontal tab navigation component.
 *
 * @element pg-tabs
 * @property {Array<{id: string, label: string, count?: number, color?: string}>} tabs
 * @property {string} active - Currently active tab id
 * @fires tab-change - Dispatched with detail: { tab: string }
 */

import { LitElement, html, css, nothing } from 'lit';

class PgTabs extends LitElement {
  static properties = {
    tabs: { type: Array },
    active: { type: String },
  };

  static styles = css`
    :host {
      display: block;
    }

    .tab-bar {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      overflow-x: auto;
      scrollbar-width: none;
    }

    .tab-bar::-webkit-scrollbar {
      display: none;
    }

    .tab {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
      padding: var(--space-sm, 0.5rem) var(--space-lg, 1rem);
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #64748b);
      background: transparent;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      transition: color var(--transition-fast);
    }

    .tab:hover {
      color: var(--color-text, #0f172a);
    }

    .tab.active {
      color: var(--color-text, #0f172a);
    }

    .tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: var(--space-lg, 1rem);
      right: var(--space-lg, 1rem);
      height: 2px;
      background: var(--tab-accent, var(--color-primary, #4f46e5));
      border-radius: 1px 1px 0 0;
    }

    .count {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-medium, 500);
      padding: 0 var(--space-xs, 0.25rem);
      min-width: 1.25rem;
      height: 1.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text-muted, #94a3b8);
      line-height: 1;
    }

    .tab.active .count {
      background: color-mix(in srgb, var(--tab-accent, var(--color-primary)) 12%, transparent);
      color: var(--tab-accent, var(--color-primary));
    }
  `;

  constructor() {
    super();
    /** @type {Array<{id: string, label: string, count?: number, color?: string}>} */
    this.tabs = [];
    /** @type {string} */
    this.active = '';
  }

  /** @param {string} tabId */
  _selectTab(tabId) {
    if (tabId === this.active) return;
    this.active = tabId;
    this.dispatchEvent(new CustomEvent('tab-change', {
      detail: { tab: tabId },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="tab-bar" role="tablist">
        ${this.tabs.map((tab) => html`
          <button
            class="tab ${tab.id === this.active ? 'active' : ''}"
            role="tab"
            aria-selected=${tab.id === this.active}
            style=${tab.color ? `--tab-accent: ${tab.color}` : ''}
            @click=${() => this._selectTab(tab.id)}
          >
            ${tab.label}
            ${tab.count != null ? html`<span class="count">${tab.count}</span>` : nothing}
          </button>
        `)}
      </div>
    `;
  }
}

customElements.define('pg-tabs', PgTabs);

export { PgTabs };

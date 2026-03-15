/**
 * Command palette component.
 * Opens with Cmd+K / Ctrl+K. Provides fuzzy search over available actions.
 *
 * @element pg-command
 * @module presentation/pg-command
 */

import { LitElement, html, css } from 'lit';

// ---------------------------------------------------------------------------
// Fuzzy matching (pure, testable)
// ---------------------------------------------------------------------------

/**
 * Simple fuzzy match — checks if all characters in `query` appear in `text`
 * in order (case-insensitive).
 * @param {string} query
 * @param {string} text
 * @returns {boolean}
 */
export function fuzzyMatch(query, text) {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ---------------------------------------------------------------------------
// Default actions
// ---------------------------------------------------------------------------

/**
 * @typedef {{ id: string; label: string; category: string; shortcut?: string }} CommandAction
 */

/** @type {CommandAction[]} */
export const DEFAULT_ACTIONS = [
  { id: 'search-cards', label: 'Search cards', category: 'Navigation', shortcut: '/' },
  { id: 'switch-project', label: 'Switch project', category: 'Navigation' },
  { id: 'create-card', label: 'Create card', category: 'Actions', shortcut: 'C' },
  { id: 'jump-to-card', label: 'Jump to card ID', category: 'Navigation' },
  { id: 'change-view', label: 'Change view', category: 'View', shortcut: '1-4' },
  { id: 'go-dashboard', label: 'Go to dashboard', category: 'Navigation' },
  { id: 'go-wip', label: 'Go to WIP', category: 'Navigation' },
  { id: 'go-admin', label: 'Go to admin', category: 'Navigation' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class PgCommand extends LitElement {
  static properties = {
    _open: { state: true },
    _query: { state: true },
    _selectedIndex: { state: true },
  };

  static styles = css`
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: var(--z-overlay, 300);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 20vh;
    }

    .palette {
      width: min(32rem, 90vw);
      background: var(--color-surface-raised, #fff);
      border-radius: var(--radius-lg, 0.75rem);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
    }

    .search {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
      border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .search svg {
      width: 1rem;
      height: 1rem;
      color: var(--color-text-muted, #94a3b8);
      flex-shrink: 0;
    }

    .search input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: 0.875rem;
      color: var(--color-text, #0f172a);
      font-family: inherit;
    }

    .search input::placeholder {
      color: var(--color-text-muted, #94a3b8);
    }

    .results {
      max-height: 20rem;
      overflow-y: auto;
      padding: var(--space-xs, 0.25rem);
    }

    .category {
      padding: var(--space-xs, 0.25rem) var(--space-md, 0.75rem);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .action {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-sm, 0.25rem);
      cursor: pointer;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      transition: background var(--transition-fast, 150ms ease);
    }

    .action:hover,
    .action[aria-selected='true'] {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .action .shortcut {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      padding: 0.125rem 0.375rem;
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-sm, 0.25rem);
      border: 1px solid var(--color-border-subtle, #e2e8f0);
    }

    .empty {
      padding: var(--space-lg, 1rem);
      text-align: center;
      font-size: 0.8125rem;
      color: var(--color-text-muted, #94a3b8);
    }

    @media (prefers-reduced-motion: reduce) {
      .backdrop, .palette, .action {
        transition: none;
      }
    }
  `;

  constructor() {
    super();
    this._open = false;
    this._query = '';
    this._selectedIndex = 0;

    /** @type {(e: KeyboardEvent) => void} */
    this._globalKeyHandler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._globalKeyHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._globalKeyHandler);
  }

  /** Toggle the palette open/closed. */
  toggle() {
    this._open = !this._open;
    if (this._open) {
      this._query = '';
      this._selectedIndex = 0;
      this.updateComplete.then(() => {
        this.shadowRoot?.querySelector('input')?.focus();
      });
    }
  }

  /** Close the palette. */
  close() {
    this._open = false;
  }

  /** @returns {CommandAction[]} */
  get _filteredActions() {
    return DEFAULT_ACTIONS.filter((a) => fuzzyMatch(this._query, a.label));
  }

  /**
   * Handle keyboard navigation within the palette.
   * @param {KeyboardEvent} e
   */
  _onKeyDown(e) {
    const actions = this._filteredActions;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._selectedIndex = Math.min(
          this._selectedIndex + 1,
          actions.length - 1
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (actions[this._selectedIndex]) {
          this._execute(actions[this._selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
    }
  }

  /**
   * Execute a command action.
   * @param {CommandAction} action
   */
  _execute(action) {
    this.close();
    this.dispatchEvent(
      new CustomEvent('pg-command', {
        detail: { actionId: action.id, action },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Handle search input.
   * @param {Event} e
   */
  _onInput(e) {
    this._query = /** @type {HTMLInputElement} */ (e.target).value;
    this._selectedIndex = 0;
  }

  render() {
    if (!this._open) return html``;

    const actions = this._filteredActions;

    // Group actions by category
    /** @type {Map<string, CommandAction[]>} */
    const grouped = new Map();
    for (const action of actions) {
      const list = grouped.get(action.category) || [];
      list.push(action);
      grouped.set(action.category, list);
    }

    let flatIndex = 0;

    return html`
      <div class="backdrop" @click=${this.close}>
        <div class="palette" @click=${(/** @type {Event} */ e) => e.stopPropagation()} @keydown=${this._onKeyDown}>
          <div class="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              placeholder="Type a command..."
              .value=${this._query}
              @input=${this._onInput}
              aria-label="Command search"
            />
          </div>

          <div class="results" role="listbox">
            ${actions.length === 0
              ? html`<div class="empty">No results found</div>`
              : html`${[...grouped.entries()].map(
                  ([category, items]) => html`
                    <div class="category">${category}</div>
                    ${items.map((action) => {
                      const idx = flatIndex++;
                      return html`
                        <div
                          class="action"
                          role="option"
                          aria-selected=${idx === this._selectedIndex}
                          @click=${() => this._execute(action)}
                        >
                          <span>${action.label}</span>
                          ${action.shortcut
                            ? html`<span class="shortcut">${action.shortcut}</span>`
                            : ''}
                        </div>
                      `;
                    })}
                  `
                )}`}
          </div>
        </div>
      </div>
    `;
  }
}

if (typeof customElements !== 'undefined') {
  customElements.define('pg-command', PgCommand);
}

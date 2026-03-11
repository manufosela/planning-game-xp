/**
 * View mode switcher with icon buttons.
 *
 * @element pg-view-switcher
 * @property {'table'|'kanban'|'sprint'|'gantt'|'list'} current
 * @fires view-change - Dispatched with detail: { view: string }
 */

import { LitElement, html, css } from 'lit';

/**
 * SVG icon paths for each view mode.
 * Using simple inline SVGs for zero-dependency icons.
 * @type {Record<string, import('lit').TemplateResult>}
 */
const VIEW_ICONS = {
  table: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
  </svg>`,
  kanban: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="5" height="14" rx="1"/><rect x="10" y="3" width="5" height="18" rx="1"/><rect x="17" y="3" width="5" height="10" rx="1"/>
  </svg>`,
  sprint: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
  </svg>`,
  gantt: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="6" x2="14" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="16" y2="18"/>
  </svg>`,
  list: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>
  </svg>`,
};

/** @type {Record<string, string>} */
const VIEW_LABELS = {
  table: 'Table',
  kanban: 'Kanban',
  sprint: 'Sprint',
  gantt: 'Gantt',
  list: 'List',
};

class PgViewSwitcher extends LitElement {
  static properties = {
    current: { type: String },
  };

  static styles = css`
    :host {
      display: inline-flex;
    }

    .switcher {
      display: inline-flex;
      gap: 0;
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-2xs, 0.125rem);
    }

    .view-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: none;
      background: transparent;
      border-radius: var(--radius-sm, 0.25rem);
      color: var(--color-text-muted, #94a3b8);
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .view-btn:hover {
      color: var(--color-text-secondary, #64748b);
    }

    .view-btn.active {
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
      box-shadow: var(--shadow-sm);
    }

    .view-btn svg {
      width: 1rem;
      height: 1rem;
    }
  `;

  constructor() {
    super();
    /** @type {'table'|'kanban'|'sprint'|'gantt'|'list'} */
    this.current = 'table';
  }

  connectedCallback() {
    super.connectedCallback();
    // Read from URL params
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam && VIEW_ICONS[viewParam]) {
      this.current = /** @type {'table'|'kanban'|'sprint'|'gantt'|'list'} */ (viewParam);
    }
  }

  /** @param {string} view */
  _selectView(view) {
    if (view === this.current) return;
    this.current = /** @type {'table'|'kanban'|'sprint'|'gantt'|'list'} */ (view);

    // Persist in URL search params
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.replaceState(null, '', url.toString());

    this.dispatchEvent(new CustomEvent('view-change', {
      detail: { view },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const views = ['table', 'kanban', 'sprint', 'gantt', 'list'];

    return html`
      <div class="switcher" role="radiogroup" aria-label="View mode">
        ${views.map((v) => html`
          <button
            class="view-btn ${v === this.current ? 'active' : ''}"
            role="radio"
            aria-checked=${v === this.current}
            aria-label=${VIEW_LABELS[v]}
            title=${VIEW_LABELS[v]}
            @click=${() => this._selectView(v)}
          >
            ${VIEW_ICONS[v]}
          </button>
        `)}
      </div>
    `;
  }
}

customElements.define('pg-view-switcher', PgViewSwitcher);

export { PgViewSwitcher };

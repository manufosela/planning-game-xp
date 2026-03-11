/**
 * Sortable data table for cards.
 *
 * @element pg-table
 * @property {Array} cards - Card data array
 * @property {Array} columns - Column definitions
 * @property {string} sortBy - Current sort column key
 * @property {'asc'|'desc'} sortDir - Current sort direction
 * @property {Array} tagRegistry - Tag registry for color lookup
 * @fires card-select - When a row is clicked, detail: { card }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';

/**
 * @typedef {Object} ColumnDef
 * @property {string} key - Data key on card object
 * @property {string} label - Column header text
 * @property {string} [width] - Optional CSS width
 * @property {boolean} [sortable] - Whether the column is sortable (default true)
 */

/** @type {ColumnDef[]} */
const DEFAULT_COLUMNS = [
  { key: 'cardId', label: 'ID', width: '7.5rem' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status', width: '8rem' },
  { key: 'developer', label: 'Developer', width: '8rem' },
  { key: 'devPoints', label: 'Pts', width: '3.5rem' },
  { key: 'sprint', label: 'Sprint', width: '7rem' },
  { key: 'epic', label: 'Epic', width: '7rem' },
  { key: 'tags', label: 'Tags', width: '8rem', sortable: false },
  { key: 'updatedAt', label: 'Updated', width: '6.5rem' },
];

class PgTable extends LitElement {
  static properties = {
    cards: { type: Array },
    columns: { type: Array },
    sortBy: { type: String, attribute: 'sort-by' },
    sortDir: { type: String, attribute: 'sort-dir' },
    tagRegistry: { type: Array, attribute: 'tag-registry' },
  };

  static styles = css`
    :host {
      display: block;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.8125rem;
    }

    /* Header */
    thead th {
      position: sticky;
      top: 0;
      background: var(--color-surface, #f8fafc);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      text-align: left;
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      white-space: nowrap;
      user-select: none;
    }

    thead th.sortable {
      cursor: pointer;
    }

    thead th.sortable:hover {
      color: var(--color-text-secondary, #64748b);
    }

    .sort-arrow {
      display: inline-block;
      margin-left: var(--space-2xs, 0.125rem);
      opacity: 0.4;
      font-size: 0.625rem;
    }

    thead th.sorted .sort-arrow {
      opacity: 1;
      color: var(--color-primary, #4f46e5);
    }

    /* Body */
    tbody tr {
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    tbody tr:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--color-surface-sunken) 40%, transparent);
    }

    tbody tr:nth-child(even):hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    tbody td {
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
      color: var(--color-text, #0f172a);
      vertical-align: middle;
    }

    /* Cell styles */
    .cell-id {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
    }

    .cell-title {
      font-weight: var(--font-weight-medium, 500);
      max-width: 20rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cell-developer {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #64748b);
    }

    .cell-points {
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      text-align: center;
      color: var(--color-text-secondary, #64748b);
    }

    .cell-sprint,
    .cell-epic {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #64748b);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cell-tags {
      display: flex;
      gap: 0.125rem;
      flex-wrap: nowrap;
      overflow: hidden;
    }

    .cell-date {
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
      white-space: nowrap;
    }

    /* Empty state */
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-4xl, 4rem) var(--space-lg, 1rem);
      text-align: center;
    }

    .empty-icon {
      width: 2.5rem;
      height: 2.5rem;
      color: var(--color-text-muted, #94a3b8);
      margin-bottom: var(--space-md, 0.75rem);
    }

    .empty-icon svg {
      width: 100%;
      height: 100%;
    }

    .empty h3 {
      font-size: 0.875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-secondary, #64748b);
      margin: 0 0 var(--space-xs, 0.25rem);
    }

    .empty p {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #94a3b8);
      margin: 0;
    }
  `;

  constructor() {
    super();
    /** @type {import('../lib/types.d.ts').Card[]} */
    this.cards = [];
    /** @type {ColumnDef[]} */
    this.columns = DEFAULT_COLUMNS;
    /** @type {string} */
    this.sortBy = 'updatedAt';
    /** @type {'asc'|'desc'} */
    this.sortDir = 'desc';
    /** @type {import('../lib/types.d.ts').TagRegistryEntry[]} */
    this.tagRegistry = [];
  }

  /** @param {string} tagName */
  _getTagColor(tagName) {
    const entry = this.tagRegistry?.find((t) => t.name === tagName);
    return entry?.color ?? '';
  }

  /** @param {string} key */
  _toggleSort(key) {
    const col = this.columns.find((c) => c.key === key);
    if (col?.sortable === false) return;

    if (this.sortBy === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = key;
      this.sortDir = 'asc';
    }
    this.requestUpdate();
  }

  /** @returns {import('../lib/types.d.ts').Card[]} */
  get _sortedCards() {
    const sorted = [...this.cards];
    const key = this.sortBy;
    const dir = this.sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let aVal = this._getCellRawValue(a, key);
      let bVal = this._getCellRawValue(b, key);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * dir;
      }

      return String(aVal).localeCompare(String(bVal)) * dir;
    });

    return sorted;
  }

  /**
   * Get raw value for sorting.
   * @param {import('../lib/types.d.ts').Card} card
   * @param {string} key
   * @returns {string | number | null}
   */
  _getCellRawValue(card, key) {
    const c = /** @type {any} */ (card);
    switch (key) {
      case 'developer':
        return c.developer?.name ?? null;
      case 'updatedAt':
        return c.updatedAt?.toDate ? c.updatedAt.toDate().getTime() : (c.updatedAt ? new Date(c.updatedAt).getTime() : null);
      case 'devPoints':
        return c.devPoints ?? null;
      default:
        return c[key] ?? null;
    }
  }

  /**
   * Format a Firestore Timestamp or date string.
   * @param {any} ts
   * @returns {string}
   */
  _formatDate(ts) {
    if (!ts) return '-';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  /** @param {import('../lib/types.d.ts').Card} card */
  _onRowClick(card) {
    this.dispatchEvent(new CustomEvent('card-select', {
      detail: { card },
      bubbles: true,
      composed: true,
    }));
  }

  /**
   * Render a cell value based on column key.
   * @param {import('../lib/types.d.ts').Card} card
   * @param {string} key
   */
  _renderCell(card, key) {
    const c = /** @type {any} */ (card);

    switch (key) {
      case 'cardId':
        return html`<span class="cell-id">${card.cardId}</span>`;
      case 'title':
        return html`<span class="cell-title">${card.title}</span>`;
      case 'status':
        return html`<pg-badge text=${card.status} variant="status"></pg-badge>`;
      case 'developer':
        return html`<span class="cell-developer">${c.developer?.name ?? '-'}</span>`;
      case 'devPoints':
        return html`<span class="cell-points">${c.devPoints ?? '-'}</span>`;
      case 'sprint':
        return html`<span class="cell-sprint">${card.sprint ?? '-'}</span>`;
      case 'epic':
        return html`<span class="cell-epic">${card.epic ?? '-'}</span>`;
      case 'tags':
        return card.tags?.length
          ? html`<div class="cell-tags">${card.tags.map((t) => html`<pg-badge text=${t} variant="tag" color=${this._getTagColor(t)}></pg-badge>`)}</div>`
          : html`<span class="cell-developer">-</span>`;
      case 'updatedAt':
        return html`<span class="cell-date">${this._formatDate(c.updatedAt)}</span>`;
      default:
        return html`<span>${c[key] ?? '-'}</span>`;
    }
  }

  render() {
    if (!this.cards || this.cards.length === 0) {
      return html`
        <div class="empty">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </div>
          <h3>No cards found</h3>
          <p>Try adjusting your filters or create a new card.</p>
        </div>
      `;
    }

    const sorted = this._sortedCards;

    return html`
      <table>
        <thead>
          <tr>
            ${this.columns.map((col) => {
              const isSortable = col.sortable !== false;
              const isSorted = this.sortBy === col.key;
              const arrow = isSorted ? (this.sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2';
              return html`
                <th
                  class="${isSortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''}"
                  style=${col.width ? `width: ${col.width}` : ''}
                  @click=${isSortable ? () => this._toggleSort(col.key) : nothing}
                >
                  ${col.label}
                  ${isSortable ? html`<span class="sort-arrow">${arrow}</span>` : nothing}
                </th>
              `;
            })}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((card) => html`
            <tr @click=${() => this._onRowClick(card)}>
              ${this.columns.map((col) => html`
                <td>${this._renderCell(card, col.key)}</td>
              `)}
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}

customElements.define('pg-table', PgTable);

export { PgTable };

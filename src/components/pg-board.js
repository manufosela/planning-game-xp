/**
 * Kanban / Sprint board with drag-drop.
 *
 * @element pg-board
 * @property {Array} cards - Card data array
 * @property {'status'|'sprint'} mode - Board mode
 * @property {Array} sprints - Sprint list (used in sprint mode)
 * @property {Array} tagRegistry - Tag registry for pg-card color lookup
 * @fires card-select - When a card is clicked, detail: { card }
 * @fires card-move - When a card is dropped on a new column, detail: { cardId, field, value }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-card.js';
import './pg-badge.js';

/**
 * @typedef {Object} BoardColumn
 * @property {string} id - Column identifier (status value or sprint id)
 * @property {string} label - Column display label
 * @property {string} color - CSS color for column top border
 * @property {string} field - Card field that maps to this column ('status' or 'sprint')
 */

/** @type {BoardColumn[]} */
const STATUS_COLUMNS = [
  { id: 'To Do', label: 'To Do', color: 'var(--color-status-todo)', field: 'status' },
  { id: 'In Progress', label: 'In Progress', color: 'var(--color-status-inprogress)', field: 'status' },
  { id: 'To Validate', label: 'To Validate', color: 'var(--color-status-tovalidate)', field: 'status' },
  { id: 'Done', label: 'Done', color: 'var(--color-status-done)', field: 'status' },
  { id: 'Blocked', label: 'Blocked', color: 'var(--color-status-blocked)', field: 'status' },
];

class PgBoard extends LitElement {
  static properties = {
    cards: { type: Array },
    mode: { type: String },
    sprints: { type: Array },
    tagRegistry: { type: Array, attribute: 'tag-registry' },
    _dragOverColumn: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      overflow-x: auto;
    }

    .board {
      display: flex;
      gap: var(--space-md, 0.75rem);
      min-height: 24rem;
      padding-bottom: var(--space-md, 0.75rem);
    }

    /* Column */
    .column {
      flex: 1;
      min-width: 15rem;
      max-width: 20rem;
      display: flex;
      flex-direction: column;
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-lg, 0.75rem);
      border-top: 3px solid var(--column-color, var(--color-border));
      overflow: hidden;
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md, 0.75rem) var(--space-md, 0.75rem) var(--space-sm, 0.5rem);
    }

    .column-title {
      font-size: 0.75rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-secondary, #64748b);
    }

    .column-count {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted, #94a3b8);
      background: var(--color-surface-raised, #fff);
      padding: 0 var(--space-xs, 0.25rem);
      border-radius: var(--radius-full, 9999px);
      min-width: 1.25rem;
      height: 1.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    /* Cards container (scrollable) */
    .column-cards {
      flex: 1;
      overflow-y: auto;
      padding: 0 var(--space-sm, 0.5rem) var(--space-sm, 0.5rem);
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 0.5rem);
      min-height: 3rem;
      scrollbar-width: thin;
    }

    .column-cards::-webkit-scrollbar {
      width: 4px;
    }

    .column-cards::-webkit-scrollbar-thumb {
      background: var(--color-border, #e2e8f0);
      border-radius: var(--radius-full);
    }

    /* Drag-drop */
    .column.drag-over .column-cards {
      background: color-mix(in srgb, var(--column-color, var(--color-primary)) 6%, transparent);
      border-radius: var(--radius-md, 0.5rem);
      outline: 2px dashed color-mix(in srgb, var(--column-color, var(--color-primary)) 40%, transparent);
      outline-offset: -2px;
    }

    pg-card {
      cursor: grab;
    }

    pg-card[dragging] {
      opacity: 0.4;
      cursor: grabbing;
    }

    /* Drop placeholder */
    .drop-ghost {
      height: 3rem;
      border: 2px dashed var(--color-border-strong, #cbd5e1);
      border-radius: var(--radius-md, 0.5rem);
      background: color-mix(in srgb, var(--color-primary) 5%, transparent);
    }

    /* Empty column */
    .column-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-xl, 1.5rem) var(--space-md, 0.75rem);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.75rem;
      text-align: center;
      font-style: italic;
    }

    /* Empty board */
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

    /* Responsive */
    @media (max-width: 640px) {
      .board {
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
      }

      .column {
        min-width: 80vw;
        max-width: 80vw;
        scroll-snap-align: start;
        flex-shrink: 0;
      }
    }
  `;

  constructor() {
    super();
    /** @type {import('../lib/types.d.ts').Card[]} */
    this.cards = [];
    /** @type {'status'|'sprint'} */
    this.mode = 'status';
    /** @type {Array<{cardId: string, title: string, startDate?: any, endDate?: any}>} */
    this.sprints = [];
    /** @type {import('../lib/types.d.ts').TagRegistryEntry[]} */
    this.tagRegistry = [];
    /** @type {string | null} */
    this._dragOverColumn = null;
    /** @type {string | null} */
    this._dragCardId = null;
  }

  /** @returns {BoardColumn[]} */
  get _columns() {
    if (this.mode === 'sprint') {
      /** @type {BoardColumn[]} */
      const cols = [
        { id: '', label: 'Backlog', color: 'var(--color-text-muted)', field: 'sprint' },
      ];
      for (const s of this.sprints) {
        cols.push({
          id: s.cardId,
          label: s.title || s.cardId,
          color: 'var(--color-type-sprint)',
          field: 'sprint',
        });
      }
      return cols;
    }
    return STATUS_COLUMNS;
  }

  /**
   * Group cards by column.
   * @returns {Map<string, import('../lib/types.d.ts').Card[]>}
   */
  get _groupedCards() {
    const groups = new Map();
    const columns = this._columns;
    const field = this.mode === 'sprint' ? 'sprint' : 'status';

    for (const col of columns) {
      groups.set(col.id, []);
    }

    for (const card of this.cards) {
      const val = card[field] ?? '';
      if (groups.has(val)) {
        groups.get(val).push(card);
      } else {
        // Card has a value not matching any column; put in first column
        const firstKey = columns[0]?.id ?? '';
        groups.get(firstKey)?.push(card);
      }
    }

    return groups;
  }

  // ---------------------------------------------------------------------------
  // Drag and drop handlers
  // ---------------------------------------------------------------------------

  /**
   * @param {DragEvent} e
   * @param {import('../lib/types.d.ts').Card} card
   */
  _onDragStart(e, card) {
    this._dragCardId = card.cardId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.cardId);
    /** @type {HTMLElement} */ (e.target).setAttribute('dragging', '');
  }

  /** @param {DragEvent} e */
  _onDragEnd(e) {
    this._dragCardId = null;
    this._dragOverColumn = null;
    /** @type {HTMLElement} */ (e.target).removeAttribute('dragging');
  }

  /**
   * @param {DragEvent} e
   * @param {string} columnId
   */
  _onDragOver(e, columnId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (this._dragOverColumn !== columnId) {
      this._dragOverColumn = columnId;
    }
  }

  /** @param {DragEvent} e */
  _onDragLeave(e) {
    // Only clear if leaving the column (not entering a child)
    const related = /** @type {HTMLElement | null} */ (e.relatedTarget);
    if (!related || !/** @type {HTMLElement} */ (e.currentTarget).contains(related)) {
      this._dragOverColumn = null;
    }
  }

  /**
   * @param {DragEvent} e
   * @param {BoardColumn} column
   */
  _onDrop(e, column) {
    e.preventDefault();
    this._dragOverColumn = null;

    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;

    const card = this.cards.find((c) => c.cardId === cardId);
    if (!card) return;

    // Check if actually moved to a different column
    const currentValue = card[column.field] ?? '';
    if (currentValue === column.id) return;

    this.dispatchEvent(new CustomEvent('card-move', {
      detail: {
        cardId,
        field: column.field,
        value: column.id,
      },
      bubbles: true,
      composed: true,
    }));
  }

  /** @param {import('../lib/types.d.ts').Card} card */
  _onCardClick(card) {
    this.dispatchEvent(new CustomEvent('card-select', {
      detail: { card },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.cards || this.cards.length === 0) {
      return html`
        <div class="empty">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="5" height="14" rx="1"/><rect x="10" y="3" width="5" height="18" rx="1"/><rect x="17" y="3" width="5" height="10" rx="1"/>
            </svg>
          </div>
          <h3>No cards to display</h3>
          <p>Create cards or adjust filters to see your board.</p>
        </div>
      `;
    }

    const columns = this._columns;
    const grouped = this._groupedCards;

    return html`
      <div class="board">
        ${columns.map((col) => {
          const colCards = grouped.get(col.id) ?? [];
          const isDragOver = this._dragOverColumn === col.id;

          return html`
            <div
              class="column ${isDragOver ? 'drag-over' : ''}"
              style="--column-color: ${col.color}"
              @dragover=${(/** @type {DragEvent} */ e) => this._onDragOver(e, col.id)}
              @dragleave=${this._onDragLeave}
              @drop=${(/** @type {DragEvent} */ e) => this._onDrop(e, col)}
            >
              <div class="column-header">
                <span class="column-title">${col.label}</span>
                <span class="column-count">${colCards.length}</span>
              </div>
              <div class="column-cards">
                ${colCards.length === 0
                  ? html`<div class="column-empty">No cards</div>`
                  : colCards.map((card) => html`
                    <pg-card
                      .card=${card}
                      mode="preview"
                      .tagRegistry=${this.tagRegistry}
                      draggable="true"
                      @dragstart=${(/** @type {DragEvent} */ e) => this._onDragStart(e, card)}
                      @dragend=${this._onDragEnd}
                      @card-click=${() => this._onCardClick(card)}
                    ></pg-card>
                  `)
                }
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }
}

customElements.define('pg-board', PgBoard);

export { PgBoard };

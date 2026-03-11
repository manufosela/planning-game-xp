/**
 * Gantt chart for timeline visualization using CSS Grid.
 *
 * @element pg-gantt
 * @property {Array} cards - Card data array (should include tasks with dates)
 * @property {string} startDate - Chart start date (ISO string or Date)
 * @property {string} endDate - Chart end date (ISO string or Date)
 * @fires card-select - When a bar is clicked, detail: { card }
 */

import { LitElement, html, css, nothing } from 'lit';

/** Number of milliseconds in a day */
const MS_PER_DAY = 86400000;

class PgGantt extends LitElement {
  static properties = {
    cards: { type: Array },
    startDate: { type: String, attribute: 'start-date' },
    endDate: { type: String, attribute: 'end-date' },
    _hoveredCard: { state: true },
    _tooltipX: { state: true },
    _tooltipY: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      overflow-x: auto;
    }

    .gantt {
      min-width: 100%;
      position: relative;
    }

    /* Header row with date markers */
    .gantt-header {
      display: flex;
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--color-surface, #f8fafc);
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      min-height: 2rem;
    }

    .gantt-header .label-col {
      flex-shrink: 0;
      width: 14rem;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
      border-right: 1px solid var(--color-border, #e2e8f0);
    }

    .gantt-header .timeline-header {
      flex: 1;
      display: flex;
      position: relative;
    }

    .month-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      padding-left: var(--space-xs, 0.25rem);
      font-size: 0.625rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-text-muted, #94a3b8);
      border-left: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    /* Body */
    .gantt-body {
      position: relative;
    }

    /* Epic group header */
    .epic-group {
      margin-bottom: var(--space-2xs, 0.125rem);
    }

    .epic-header {
      display: flex;
      align-items: center;
      min-height: 1.75rem;
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .epic-header .label-col {
      flex-shrink: 0;
      width: 14rem;
      padding: var(--space-2xs, 0.125rem) var(--space-md, 0.75rem);
      font-size: 0.75rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-secondary, #64748b);
      border-right: 1px solid var(--color-border, #e2e8f0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .epic-header .timeline-area {
      flex: 1;
      height: 100%;
    }

    /* Card row */
    .card-row {
      display: flex;
      align-items: center;
      min-height: 2rem;
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .card-row:hover {
      background: color-mix(in srgb, var(--color-surface-sunken) 50%, transparent);
    }

    .card-row .label-col {
      flex-shrink: 0;
      width: 14rem;
      padding: var(--space-2xs, 0.125rem) var(--space-md, 0.75rem);
      padding-left: var(--space-xl, 1.5rem);
      font-size: 0.75rem;
      color: var(--color-text, #0f172a);
      border-right: 1px solid var(--color-border, #e2e8f0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-row .label-col .card-id {
      font-family: var(--font-mono);
      font-size: 0.625rem;
      color: var(--color-text-muted, #94a3b8);
      margin-right: var(--space-xs, 0.25rem);
    }

    .card-row .timeline-area {
      flex: 1;
      position: relative;
      height: 1.25rem;
    }

    /* Gantt bar */
    .gantt-bar {
      position: absolute;
      top: 0.125rem;
      height: 1rem;
      border-radius: var(--radius-sm, 0.25rem);
      cursor: pointer;
      transition: opacity var(--transition-fast);
      min-width: 4px;
    }

    .gantt-bar:hover {
      opacity: 0.85;
      box-shadow: var(--shadow-sm);
    }

    /* Today line */
    .today-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--color-error, #dc2626);
      z-index: 1;
      pointer-events: none;
    }

    .today-line::before {
      content: 'Today';
      position: absolute;
      top: -1rem;
      left: var(--space-xs, 0.25rem);
      font-size: 0.5625rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-error, #dc2626);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      white-space: nowrap;
    }

    /* Tooltip */
    .tooltip {
      position: fixed;
      z-index: var(--z-toast, 500);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      box-shadow: var(--shadow-lg);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      font-size: 0.75rem;
      pointer-events: none;
      max-width: 16rem;
    }

    .tooltip .tt-title {
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      margin-bottom: var(--space-2xs, 0.125rem);
    }

    .tooltip .tt-dates {
      color: var(--color-text-muted, #94a3b8);
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
    /** @type {string} */
    this.startDate = '';
    /** @type {string} */
    this.endDate = '';
    /** @type {import('../lib/types.d.ts').Card | null} */
    this._hoveredCard = null;
    this._tooltipX = 0;
    this._tooltipY = 0;
  }

  /** @type {Record<string, string>} */
  static STATUS_COLORS = {
    'To Do': 'var(--color-status-todo)',
    'In Progress': 'var(--color-status-inprogress)',
    'To Validate': 'var(--color-status-tovalidate)',
    'Done': 'var(--color-status-done)',
    'Done&Validated': 'var(--color-status-donevalidated)',
    'Blocked': 'var(--color-status-blocked)',
    'Reopened': 'var(--color-status-reopened)',
    'Created': 'var(--color-status-created)',
    'Assigned': 'var(--color-status-assigned)',
    'Fixed': 'var(--color-status-fixed)',
    'Verified': 'var(--color-status-verified)',
    'Closed': 'var(--color-status-closed)',
    'Active': 'var(--color-status-inprogress)',
    'Pending': 'var(--color-status-todo)',
    'Passed': 'var(--color-status-done)',
    'Failed': 'var(--color-status-blocked)',
  };

  // ---------------------------------------------------------------------------
  // Date helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert Firestore Timestamp or string to Date.
   * @param {any} val
   * @returns {Date | null}
   */
  _toDate(val) {
    if (!val) return null;
    if (val.toDate) return val.toDate();
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Get chart boundaries.
   * @returns {{ start: Date, end: Date, totalDays: number }}
   */
  get _chartRange() {
    let start = this._toDate(this.startDate);
    let end = this._toDate(this.endDate);

    // Auto-compute from cards if not provided
    if (!start || !end) {
      const dates = [];
      for (const card of this._datedCards) {
        const s = this._getCardStart(card);
        const e = this._getCardEnd(card);
        if (s) dates.push(s);
        if (e) dates.push(e);
      }
      if (dates.length === 0) {
        const now = new Date();
        start = start ?? new Date(now.getFullYear(), now.getMonth(), 1);
        end = end ?? new Date(now.getFullYear(), now.getMonth() + 3, 0);
      } else {
        const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
        start = start ?? new Date(sorted[0].getTime() - 7 * MS_PER_DAY);
        end = end ?? new Date(sorted[sorted.length - 1].getTime() + 7 * MS_PER_DAY);
      }
    }

    const totalDays = Math.max(Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY), 1);
    return { start, end, totalDays };
  }

  /** @returns {import('../lib/types.d.ts').Card[]} */
  get _datedCards() {
    return this.cards.filter((c) => {
      const card = /** @type {any} */ (c);
      return this._toDate(card.startDate) || this._toDate(card.endDate) || this._toDate(c.createdAt);
    });
  }

  /**
   * @param {import('../lib/types.d.ts').Card} card
   * @returns {Date | null}
   */
  _getCardStart(card) {
    const c = /** @type {any} */ (card);
    return this._toDate(c.startDate) ?? this._toDate(c.createdAt);
  }

  /**
   * @param {import('../lib/types.d.ts').Card} card
   * @returns {Date | null}
   */
  _getCardEnd(card) {
    const c = /** @type {any} */ (card);
    return this._toDate(c.endDate) ?? this._toDate(c.startDate) ?? this._toDate(c.createdAt);
  }

  /**
   * Get bar position as percentage.
   * @param {import('../lib/types.d.ts').Card} card
   * @returns {{ left: string, width: string } | null}
   */
  _getBarPosition(card) {
    const { start, totalDays } = this._chartRange;
    const cardStart = this._getCardStart(card);
    const cardEnd = this._getCardEnd(card);
    if (!cardStart) return null;

    const end = cardEnd ?? cardStart;
    const startDay = Math.max(0, (cardStart.getTime() - start.getTime()) / MS_PER_DAY);
    const endDay = Math.max(startDay + 1, (end.getTime() - start.getTime()) / MS_PER_DAY + 1);

    const left = (startDay / totalDays) * 100;
    const width = Math.max(0.5, ((endDay - startDay) / totalDays) * 100);

    return { left: `${left}%`, width: `${width}%` };
  }

  /**
   * Get today line position as percentage.
   * @returns {string | null}
   */
  get _todayPosition() {
    const { start, totalDays } = this._chartRange;
    const now = new Date();
    const dayOffset = (now.getTime() - start.getTime()) / MS_PER_DAY;
    if (dayOffset < 0 || dayOffset > totalDays) return null;
    return `${(dayOffset / totalDays) * 100}%`;
  }

  /**
   * Get month markers for the header.
   * @returns {Array<{label: string, left: string}>}
   */
  get _monthMarkers() {
    const { start, end, totalDays } = this._chartRange;
    const markers = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

    while (cursor <= end) {
      const dayOffset = (cursor.getTime() - start.getTime()) / MS_PER_DAY;
      const pct = (dayOffset / totalDays) * 100;
      markers.push({
        label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        left: `${Math.max(0, pct)}%`,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return markers;
  }

  /**
   * Group cards by epic.
   * @returns {Map<string, import('../lib/types.d.ts').Card[]>}
   */
  get _cardsByEpic() {
    const groups = new Map();
    for (const card of this._datedCards) {
      const epicKey = card.epic || 'No Epic';
      if (!groups.has(epicKey)) groups.set(epicKey, []);
      groups.get(epicKey).push(card);
    }
    return groups;
  }

  _formatDateShort(d) {
    if (!d) return '-';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /**
   * @param {MouseEvent} e
   * @param {import('../lib/types.d.ts').Card} card
   */
  _onBarHover(e, card) {
    this._hoveredCard = card;
    this._tooltipX = e.clientX + 12;
    this._tooltipY = e.clientY - 8;
  }

  _onBarLeave() {
    this._hoveredCard = null;
  }

  /** @param {import('../lib/types.d.ts').Card} card */
  _onBarClick(card) {
    this.dispatchEvent(new CustomEvent('card-select', {
      detail: { card },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const datedCards = this._datedCards;

    if (datedCards.length === 0) {
      return html`
        <div class="empty">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="6" x2="14" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="16" y2="18"/>
            </svg>
          </div>
          <h3>No timeline data</h3>
          <p>Cards need start and end dates to appear on the Gantt chart.</p>
        </div>
      `;
    }

    const monthMarkers = this._monthMarkers;
    const todayPos = this._todayPosition;
    const cardsByEpic = this._cardsByEpic;

    return html`
      <div class="gantt">
        <!-- Header -->
        <div class="gantt-header">
          <div class="label-col">Card</div>
          <div class="timeline-header" style="width: calc(100% - 14rem); min-width: 30rem;">
            ${monthMarkers.map((m) => html`
              <div class="month-marker" style="left: ${m.left}">${m.label}</div>
            `)}
          </div>
        </div>

        <!-- Body -->
        <div class="gantt-body">
          ${Array.from(cardsByEpic.entries()).map(([epicName, epicCards]) => html`
            <div class="epic-group">
              <div class="epic-header">
                <div class="label-col">${epicName}</div>
                <div class="timeline-area"></div>
              </div>
              ${epicCards.map((card) => {
                const pos = this._getBarPosition(card);
                const color = PgGantt.STATUS_COLORS[card.status] ?? 'var(--color-text-muted)';
                return html`
                  <div class="card-row">
                    <div class="label-col">
                      <span class="card-id">${card.cardId}</span>
                      ${card.title}
                    </div>
                    <div class="timeline-area">
                      ${pos ? html`
                        <div
                          class="gantt-bar"
                          style="left: ${pos.left}; width: ${pos.width}; background: ${color};"
                          @click=${() => this._onBarClick(card)}
                          @mouseenter=${(/** @type {MouseEvent} */ e) => this._onBarHover(e, card)}
                          @mouseleave=${this._onBarLeave}
                        ></div>
                      ` : nothing}
                      ${todayPos ? html`<div class="today-line" style="left: ${todayPos}"></div>` : nothing}
                    </div>
                  </div>
                `;
              })}
            </div>
          `)}
        </div>
      </div>

      <!-- Tooltip -->
      ${this._hoveredCard ? html`
        <div class="tooltip" style="left: ${this._tooltipX}px; top: ${this._tooltipY}px;">
          <div class="tt-title">${this._hoveredCard.title}</div>
          <div class="tt-dates">
            ${this._formatDateShort(this._getCardStart(this._hoveredCard))}
            \u2192
            ${this._formatDateShort(this._getCardEnd(this._hoveredCard))}
          </div>
        </div>
      ` : nothing}
    `;
  }
}

customElements.define('pg-gantt', PgGantt);

export { PgGantt };

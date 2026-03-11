/**
 * WIP (Work In Progress) dashboard component.
 *
 * Shows all "In Progress" tasks grouped by developer,
 * with WIP violation indicators and backlog lists.
 *
 * @element pg-wip
 * @property {Array} wipCards - All In Progress cards
 * @property {Array} backlogCards - All To Do cards with assigned developer
 * @property {'wip' | 'backlog'} activeTab - Currently visible tab
 * @fires card-navigate - When a task is clicked, detail: { projectId, cardId }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';
import './pg-tabs.js';

class PgWip extends LitElement {
  static properties = {
    wipCards: { type: Array, attribute: 'wip-cards' },
    backlogCards: { type: Array, attribute: 'backlog-cards' },
    activeTab: { type: String, attribute: 'active-tab' },
  };

  static styles = css`
    :host {
      display: block;
    }

    /* Developer group */
    .dev-group {
      margin-bottom: var(--space-lg, 1rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      overflow: hidden;
    }

    .dev-header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
      background: var(--color-surface-sunken, #f8fafc);
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .dev-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-primary-subtle, #eef2ff);
      color: var(--color-primary, #4f46e5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: var(--font-weight-semibold, 600);
      flex-shrink: 0;
    }

    .dev-info {
      flex: 1;
      min-width: 0;
    }

    .dev-name {
      font-size: 0.875rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
    }

    .dev-meta {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      display: flex;
      gap: var(--space-md, 0.75rem);
    }

    /* WIP violation */
    .wip-violation {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2xs, 0.125rem);
      padding: 0.0625rem var(--space-sm, 0.5rem);
      border-radius: var(--radius-full, 9999px);
      background: var(--color-error-subtle, #fef2f2);
      color: var(--color-error, #dc2626);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      flex-shrink: 0;
    }

    .wip-violation svg {
      width: 0.75rem;
      height: 0.75rem;
      stroke: currentColor;
      stroke-width: 2.5;
      fill: none;
    }

    /* Card row */
    .card-row {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-sm, 0.5rem) var(--space-lg, 1rem);
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
      cursor: pointer;
      transition: background var(--transition-fast, 150ms ease);
    }

    .card-row:last-child {
      border-bottom: none;
    }

    .card-row:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .card-type-indicator {
      width: 3px;
      height: 1.5rem;
      border-radius: var(--radius-full);
      flex-shrink: 0;
    }

    .card-id {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
      flex-shrink: 0;
      min-width: 7rem;
    }

    .card-title {
      flex: 1;
      min-width: 0;
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-project {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      background: var(--color-surface-sunken, #f1f5f9);
      padding: 0 var(--space-xs, 0.25rem);
      border-radius: var(--radius-sm, 0.25rem);
      line-height: 1.375rem;
      flex-shrink: 0;
    }

    .card-points {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted, #94a3b8);
      flex-shrink: 0;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-3xl, 3rem) var(--space-lg, 1rem);
      text-align: center;
    }

    .empty-state svg {
      width: 3rem;
      height: 3rem;
      stroke: var(--color-text-muted, #94a3b8);
      stroke-width: 1.5;
      fill: none;
      margin-bottom: var(--space-md, 0.75rem);
    }

    .empty-state .empty-title {
      font-size: 0.9375rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-secondary, #64748b);
      margin-bottom: var(--space-xs, 0.25rem);
    }

    .empty-state .empty-desc {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #94a3b8);
    }

    /* Backlog order number */
    .backlog-order {
      width: 1.25rem;
      height: 1.25rem;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.625rem;
      font-weight: var(--font-weight-semibold, 600);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* Summary stats */
    .summary-bar {
      display: flex;
      gap: var(--space-lg, 1rem);
      margin-bottom: var(--space-lg, 1rem);
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2xs, 0.125rem);
    }

    .stat-number {
      font-size: 1.5rem;
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text, #0f172a);
    }

    .stat-label {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    .stat-number.violation {
      color: var(--color-error, #dc2626);
    }
  `;

  constructor() {
    super();
    /** @type {Array<Record<string, unknown>>} */
    this.wipCards = [];
    /** @type {Array<Record<string, unknown>>} */
    this.backlogCards = [];
    /** @type {'wip' | 'backlog'} */
    this.activeTab = 'wip';
  }

  /**
   * Group cards by developer ID.
   * @param {Array<Record<string, unknown>>} cardList
   * @returns {Map<string, { name: string; cards: Array<Record<string, unknown>> }>}
   */
  _groupByDeveloper(cardList) {
    /** @type {Map<string, { name: string; cards: Array<Record<string, unknown>> }>} */
    const groups = new Map();

    for (const card of cardList) {
      const dev = /** @type {{ id?: string; name?: string } | undefined} */ (card.developer);
      if (!dev?.id) continue;

      const existing = groups.get(dev.id);
      if (existing) {
        existing.cards.push(card);
      } else {
        groups.set(dev.id, {
          name: dev.name ?? 'Unknown',
          cards: [card],
        });
      }
    }

    return groups;
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  _getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  /** @param {Record<string, unknown>} card */
  _onCardClick(card) {
    this.dispatchEvent(new CustomEvent('card-navigate', {
      detail: {
        projectId: card.projectId ?? '',
        cardId: card.cardId,
      },
      bubbles: true,
      composed: true,
    }));
  }

  /** @param {CustomEvent} e */
  _onTabChange(e) {
    this.activeTab = e.detail.tab;
  }

  render() {
    const wipGroups = this._groupByDeveloper(this.wipCards);
    const backlogGroups = this._groupByDeveloper(this.backlogCards);

    const violations = [...wipGroups.values()].filter((g) => g.cards.length > 1).length;

    const tabs = [
      { id: 'wip', label: 'In Progress', count: this.wipCards.length },
      { id: 'backlog', label: 'Backlog by Developer', count: this.backlogCards.length },
    ];

    return html`
      <div class="summary-bar">
        <div class="stat">
          <span class="stat-number">${this.wipCards.length}</span>
          <span class="stat-label">In Progress</span>
        </div>
        <div class="stat">
          <span class="stat-number">${wipGroups.size}</span>
          <span class="stat-label">Developers Active</span>
        </div>
        <div class="stat">
          <span class="stat-number ${violations > 0 ? 'violation' : ''}">${violations}</span>
          <span class="stat-label">WIP Violations</span>
        </div>
        <div class="stat">
          <span class="stat-number">${this.backlogCards.length}</span>
          <span class="stat-label">In Backlog</span>
        </div>
      </div>

      <pg-tabs
        .tabs=${tabs}
        active=${this.activeTab}
        @tab-change=${this._onTabChange}
      ></pg-tabs>

      ${this.activeTab === 'wip'
        ? this._renderWipTab(wipGroups)
        : this._renderBacklogTab(backlogGroups)
      }
    `;
  }

  /**
   * @param {Map<string, { name: string; cards: Array<Record<string, unknown>> }>} groups
   */
  _renderWipTab(groups) {
    if (groups.size === 0) {
      return html`
        <div class="empty-state">
          <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
          <div class="empty-title">No tasks in progress</div>
          <div class="empty-desc">When developers start working on tasks, they will appear here.</div>
        </div>
      `;
    }

    return html`
      ${[...groups.entries()].map(([devId, group]) => html`
        <div class="dev-group">
          <div class="dev-header">
            <div class="dev-avatar">${this._getInitials(group.name)}</div>
            <div class="dev-info">
              <div class="dev-name">${group.name}</div>
              <div class="dev-meta">
                <span>${group.cards.length} task${group.cards.length !== 1 ? 's' : ''} in progress</span>
              </div>
            </div>
            ${group.cards.length > 1 ? html`
              <span class="wip-violation">
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                WIP Violation
              </span>
            ` : nothing}
          </div>
          ${group.cards.map((card) => this._renderCardRow(card))}
        </div>
      `)}
    `;
  }

  /**
   * @param {Map<string, { name: string; cards: Array<Record<string, unknown>> }>} groups
   */
  _renderBacklogTab(groups) {
    if (groups.size === 0) {
      return html`
        <div class="empty-state">
          <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          <div class="empty-title">No developer backlogs</div>
          <div class="empty-desc">Assign tasks to developers and they will appear in their backlog.</div>
        </div>
      `;
    }

    return html`
      ${[...groups.entries()].map(([devId, group]) => html`
        <div class="dev-group">
          <div class="dev-header">
            <div class="dev-avatar">${this._getInitials(group.name)}</div>
            <div class="dev-info">
              <div class="dev-name">${group.name}</div>
              <div class="dev-meta">
                <span>${group.cards.length} task${group.cards.length !== 1 ? 's' : ''} in backlog</span>
              </div>
            </div>
          </div>
          ${group.cards.map((card, i) => html`
            <div class="card-row" @click=${() => this._onCardClick(card)}>
              <span class="backlog-order">${i + 1}</span>
              ${this._renderCardContent(card)}
            </div>
          `)}
        </div>
      `)}
    `;
  }

  /** @param {Record<string, unknown>} card */
  _renderCardRow(card) {
    return html`
      <div class="card-row" @click=${() => this._onCardClick(card)}>
        ${this._renderCardContent(card)}
      </div>
    `;
  }

  /** @param {Record<string, unknown>} card */
  _renderCardContent(card) {
    const typeColor = `var(--color-type-${card.type})`;
    const devPoints = /** @type {number | undefined} */ (card.devPoints);

    return html`
      <span class="card-type-indicator" style="background: ${typeColor}"></span>
      <span class="card-id">${card.cardId}</span>
      <span class="card-title">${card.title}</span>
      ${card.projectId ? html`<span class="card-project">${card.projectId}</span>` : nothing}
      ${devPoints ? html`<span class="card-points">${devPoints}pts</span>` : nothing}
      <pg-badge text=${/** @type {string} */ (card.status)} variant="status"></pg-badge>
    `;
  }
}

customElements.define('pg-wip', PgWip);

export { PgWip };

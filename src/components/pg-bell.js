/**
 * Notification bell with unread count badge and dropdown list.
 *
 * Subscribes to the `notifications` and `unreadCount` store signals.
 * Displays the most recent 20 notifications in a dropdown panel.
 *
 * @element pg-bell
 * @fires notification-click - When a notification is clicked, detail: { notification }
 */

import { LitElement, html, css, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { notifications, unreadCount } from '../lib/store.js';

class PgBell extends SignalWatcher(LitElement) {
  static properties = {
    _open: { state: true },
  };

  static styles = css`
    :host {
      display: inline-flex;
      position: relative;
    }

    .bell-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
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

    .bell-btn:hover {
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text, #0f172a);
    }

    .bell-btn svg {
      width: 1.125rem;
      height: 1.125rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Unread badge */
    .badge {
      position: absolute;
      top: 0.125rem;
      right: 0.125rem;
      min-width: 0.875rem;
      height: 0.875rem;
      padding: 0 0.1875rem;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-error, #dc2626);
      color: #fff;
      font-size: 0.5625rem;
      font-weight: var(--font-weight-bold, 700);
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      pointer-events: none;
    }

    /* Dropdown panel */
    .dropdown {
      position: absolute;
      top: calc(100% + var(--space-xs, 0.25rem));
      right: 0;
      width: 22rem;
      max-height: 28rem;
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      box-shadow: var(--shadow-lg);
      z-index: var(--z-dropdown, 100);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .dropdown[hidden] {
      display: none;
    }

    .dropdown-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .dropdown-header h3 {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      margin: 0;
    }

    .mark-all-btn {
      font-size: 0.6875rem;
      color: var(--color-primary, #4f46e5);
      background: transparent;
      border: none;
      cursor: pointer;
      padding: var(--space-2xs, 0.125rem) var(--space-xs, 0.25rem);
      border-radius: var(--radius-sm, 0.25rem);
      font-weight: var(--font-weight-medium, 500);
      transition: background var(--transition-fast, 150ms ease);
    }

    .mark-all-btn:hover {
      background: var(--color-primary-subtle, #eef2ff);
    }

    .notification-list {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-2xs, 0.125rem) 0;
    }

    .notification-item {
      display: flex;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      cursor: pointer;
      transition: background var(--transition-fast, 150ms ease);
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
      color: var(--color-text, #0f172a);
    }

    .notification-item:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .notification-item.unread {
      background: color-mix(in srgb, var(--color-primary) 4%, transparent);
    }

    .notification-item.unread:hover {
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    }

    .unread-dot {
      width: 0.375rem;
      height: 0.375rem;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-primary, #4f46e5);
      flex-shrink: 0;
      margin-top: 0.375rem;
    }

    .read-dot {
      width: 0.375rem;
      flex-shrink: 0;
    }

    .notification-content {
      flex: 1;
      min-width: 0;
    }

    .notification-title {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .notification-message {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #64748b);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-top: 0.0625rem;
    }

    .notification-time {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      margin-top: 0.125rem;
    }

    .empty-state {
      padding: var(--space-xl, 1.5rem);
      text-align: center;
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.8125rem;
    }

    .empty-state svg {
      width: 2rem;
      height: 2rem;
      stroke: var(--color-text-muted, #94a3b8);
      stroke-width: 1.5;
      fill: none;
      margin-bottom: var(--space-sm, 0.5rem);
    }

    @media (max-width: 640px) {
      .dropdown {
        width: calc(100vw - 2rem);
        right: -0.5rem;
      }
    }
  `;

  constructor() {
    super();
    this._open = false;

    /** @param {MouseEvent} e */
    this._handleOutsideClick = (e) => {
      if (this._open && !this.shadowRoot?.querySelector('.bell-btn')?.contains(/** @type {Node} */ (e.composedPath()[0]))
        && !this.shadowRoot?.querySelector('.dropdown')?.contains(/** @type {Node} */ (e.composedPath()[0]))) {
        this._open = false;
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._handleOutsideClick, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick, true);
  }

  _toggleDropdown() {
    this._open = !this._open;
  }

  /** @param {import('../lib/types.d.ts').Notification & { id: string }} notification */
  _onNotificationClick(notification) {
    this.dispatchEvent(new CustomEvent('notification-click', {
      detail: { notification },
      bubbles: true,
      composed: true,
    }));
    this._open = false;
  }

  _markAllRead() {
    this.dispatchEvent(new CustomEvent('mark-all-read', {
      bubbles: true,
      composed: true,
    }));
  }

  /**
   * Format a Firestore Timestamp to relative time string.
   * @param {unknown} ts
   * @returns {string}
   */
  _timeAgo(ts) {
    if (!ts) return '';
    const date = /** @type {{ toDate?: () => Date }} */ (ts)?.toDate?.() ?? new Date(/** @type {string} */ (ts));
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  render() {
    const count = unreadCount.get();
    const items = notifications.get().slice(0, 20);

    return html`
      <button class="bell-btn" @click=${this._toggleDropdown} aria-label="Notifications">
        <svg viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        ${count > 0 ? html`<span class="badge">${count > 99 ? '99+' : count}</span>` : nothing}
      </button>

      <div class="dropdown" ?hidden=${!this._open}>
        <div class="dropdown-header">
          <h3>Notifications</h3>
          ${count > 0 ? html`
            <button class="mark-all-btn" @click=${this._markAllRead}>Mark all read</button>
          ` : nothing}
        </div>

        <div class="notification-list">
          ${items.length === 0 ? html`
            <div class="empty-state">
              <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <div>No notifications</div>
            </div>
          ` : items.map((n) => html`
            <button
              class="notification-item ${n.read ? '' : 'unread'}"
              @click=${() => this._onNotificationClick(n)}
            >
              <span class="${n.read ? 'read-dot' : 'unread-dot'}"></span>
              <div class="notification-content">
                <div class="notification-title">${n.title}</div>
                <div class="notification-message">${n.message}</div>
                <div class="notification-time">${this._timeAgo(n.createdAt)}</div>
              </div>
            </button>
          `)}
        </div>
      </div>
    `;
  }
}

customElements.define('pg-bell', PgBell);

export { PgBell };

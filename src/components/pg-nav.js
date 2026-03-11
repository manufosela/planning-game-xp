/**
 * Top navigation bar.
 *
 * Displays app name, theme toggle, and user menu.
 * Fires 'pg-signout' event when user clicks logout.
 *
 * @element pg-nav
 */

import { LitElement, html, css } from 'lit';
import './pg-theme-toggle.js';

class PgNav extends LitElement {
  static properties = {
    userName: { type: String, attribute: 'user-name' },
    userPhoto: { type: String, attribute: 'user-photo' },
    _menuOpen: { state: true },
    _mobileOpen: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    nav {
      display: flex;
      align-items: center;
      height: 3.25rem;
      padding: 0 var(--space-lg, 1rem);
      background: var(--color-surface-raised, #fff);
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      position: sticky;
      top: 0;
      z-index: var(--z-sticky, 200);
    }

    /* Brand */
    .brand {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      font-weight: var(--font-weight-semibold, 600);
      font-size: 0.9375rem;
      color: var(--color-text, #0f172a);
      text-decoration: none;
      letter-spacing: var(--tracking-tight, -0.01em);
    }

    .brand:hover {
      text-decoration: none;
    }

    .brand svg {
      width: 1.375rem;
      height: 1.375rem;
      color: var(--color-primary, #4f46e5);
    }

    /* Spacer */
    .spacer {
      flex: 1;
    }

    /* Actions area */
    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
    }

    /* User menu */
    .user-menu {
      position: relative;
    }

    .user-btn {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
      border-radius: var(--radius-md, 0.5rem);
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--color-text, #0f172a);
      transition: background var(--transition-fast, 150ms ease);
    }

    .user-btn:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .avatar {
      width: 1.75rem;
      height: 1.75rem;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-primary-subtle, #eef2ff);
      color: var(--color-primary, #4f46e5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: var(--font-weight-semibold, 600);
      overflow: hidden;
      flex-shrink: 0;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .user-name {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      max-width: 10rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Dropdown */
    .dropdown {
      position: absolute;
      top: calc(100% + var(--space-xs, 0.25rem));
      right: 0;
      min-width: 10rem;
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      box-shadow: var(--shadow-lg);
      padding: var(--space-xs, 0.25rem);
      z-index: var(--z-dropdown, 100);
    }

    .dropdown[hidden] {
      display: none;
    }

    .dropdown button {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      width: 100%;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-sm, 0.25rem);
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      text-align: left;
      transition: background var(--transition-fast, 150ms ease);
    }

    .dropdown button:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .dropdown .danger {
      color: var(--color-error, #dc2626);
    }

    .dropdown .danger:hover {
      background: var(--color-error-subtle, #fef2f2);
    }

    /* Hamburger (mobile) */
    .hamburger {
      display: none;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: var(--radius-md, 0.5rem);
      border: none;
      background: transparent;
      color: var(--color-text-secondary, #64748b);
      cursor: pointer;
    }

    .hamburger svg {
      width: 1.25rem;
      height: 1.25rem;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Responsive: show hamburger, hide user name on small screens */
    @media (max-width: 640px) {
      .user-name {
        display: none;
      }

      .hamburger {
        display: inline-flex;
      }
    }
  `;

  constructor() {
    super();
    this.userName = '';
    this.userPhoto = '';
    this._menuOpen = false;
    this._mobileOpen = false;

    // Close dropdown on outside click
    this._handleOutsideClick = (/** @type {MouseEvent} */ e) => {
      if (this._menuOpen && !this.shadowRoot?.querySelector('.user-menu')?.contains(/** @type {Node} */ (e.composedPath()[0]))) {
        this._menuOpen = false;
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

  /** @returns {string} */
  get _initials() {
    if (!this.userName) return '?';
    return this.userName
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  _toggleMenu() {
    this._menuOpen = !this._menuOpen;
  }

  _signOut() {
    this._menuOpen = false;
    this.dispatchEvent(new CustomEvent('pg-signout', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <nav>
        <button class="hamburger" @click=${() => { this._mobileOpen = !this._mobileOpen; }} aria-label="Menu">
          <svg viewBox="0 0 24 24">
            ${this._mobileOpen
              ? html`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`
              : html`<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>`
            }
          </svg>
        </button>

        <a href="/" class="brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Planning Game
        </a>

        <div class="spacer"></div>

        <div class="actions">
          <pg-theme-toggle></pg-theme-toggle>

          <div class="user-menu">
            <button class="user-btn" @click=${this._toggleMenu} aria-label="User menu">
              <div class="avatar">
                ${this.userPhoto
                  ? html`<img src=${this.userPhoto} alt="" />`
                  : this._initials}
              </div>
              <span class="user-name">${this.userName}</span>
            </button>

            <div class="dropdown" ?hidden=${!this._menuOpen}>
              <button class="danger" @click=${this._signOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>
    `;
  }
}

customElements.define('pg-nav', PgNav);

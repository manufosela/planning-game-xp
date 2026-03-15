/**
 * Root application shell component.
 * Handles auth gate, routing, and layout composition.
 *
 * @element pg-app
 * @module presentation/pg-app
 */

import { LitElement, html, css } from 'lit';
import { currentRoute, initRouter, navigate } from './router.js';
import { registerShortcuts, unregisterShortcuts } from './keyboard-shortcuts.js';

// ---------------------------------------------------------------------------
// Route-to-component mapping (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Maps route names to component tag names.
 * @type {Record<string, string>}
 */
export const ROUTE_COMPONENTS = {
  projects: 'pg-projects-view',
  project: 'pg-project-view',
  dashboard: 'pg-dashboard-view',
  wip: 'pg-wip-view',
  admin: 'pg-admin-view',
  login: 'pg-login-view',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class PgApp extends LitElement {
  static properties = {
    _authenticated: { state: true },
    _routeName: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--color-surface, #fff);
      color: var(--color-text, #0f172a);
    }

    .app-layout {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    main {
      flex: 1;
      padding: var(--space-lg, 1rem);
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }
  `;

  constructor() {
    super();
    this._authenticated = false;
    this._routeName = 'projects';

    /** @type {(() => void) | null} */
    this._unsubRoute = null;
  }

  connectedCallback() {
    super.connectedCallback();
    initRouter();
    registerShortcuts();

    // Subscribe to route changes by polling the signal
    // (In a real Lit + signals setup, SignalWatcher handles this automatically)
    this._routeName = currentRoute.get().name;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    unregisterShortcuts();
  }

  /**
   * Set authentication state.
   * @param {boolean} authenticated
   */
  setAuthenticated(authenticated) {
    this._authenticated = authenticated;
    if (!authenticated) {
      navigate('/login');
    }
  }

  /**
   * Render the content for the current route.
   * @returns {import('lit').TemplateResult}
   */
  _renderRoute() {
    const route = currentRoute.get();
    const tag = ROUTE_COMPONENTS[route.name];
    if (!tag) {
      return html`<div>Page not found</div>`;
    }
    // Use unsafeStatic for dynamic tag names in a real app.
    // Here we use a slot-based approach for simplicity.
    return html`<slot name=${route.name}></slot>`;
  }

  render() {
    if (!this._authenticated) {
      return html`<slot name="login"></slot>`;
    }

    return html`
      <div class="app-layout">
        <pg-nav></pg-nav>
        <main>
          ${this._renderRoute()}
        </main>
        <pg-toast></pg-toast>
        <pg-command></pg-command>
      </div>
    `;
  }
}

if (typeof customElements !== 'undefined') {
  customElements.define('pg-app', PgApp);
}

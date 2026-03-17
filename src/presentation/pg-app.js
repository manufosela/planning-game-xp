/**
 * Root application shell component.
 * Handles auth gate, routing, and layout composition.
 *
 * @element pg-app
 * @module presentation/pg-app
 */

import { LitElement, html, css, nothing } from 'lit';
import { currentRoute, initRouter, navigate } from './router.js';
import { registerShortcuts, unregisterShortcuts } from './keyboard-shortcuts.js';
import { currentInstance } from '../lib/store.js';

// Import ALL existing components so they register their custom elements
import '../components/pg-nav.js';
import '../components/pg-toast.js';
import '../components/pg-project.js';
import '../components/pg-table.js';
import '../components/pg-board.js';
import '../components/pg-gantt.js';
import '../components/pg-filters.js';
import '../components/pg-view-switcher.js';
import '../components/pg-tabs.js';
import '../components/pg-card.js';
import '../components/pg-card-panel.js';
import '../components/pg-dashboard.js';
import '../components/pg-chart.js';
import '../components/pg-wip.js';
import '../components/pg-admin.js';
import '../components/pg-team.js';
import '../components/pg-config.js';
import '../components/pg-plans.js';
import '../components/pg-adrs.js';
import '../components/pg-bell.js';
import '../components/pg-form.js';
import '../components/pg-select.js';
import '../components/pg-modal.js';
import '../components/pg-badge.js';
import '../components/pg-theme-toggle.js';
import '../components/pg-upload.js';
import '../components/pg-year.js';
import '../components/pg-status-transition.js';
import './pg-command.js';

// ---------------------------------------------------------------------------
// Route-to-component mapping (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Maps route names to component tag names.
 * @type {Record<string, string>}
 */
export const ROUTE_COMPONENTS = {
  projects: 'pg-project',
  project: 'pg-project',
  dashboard: 'pg-dashboard',
  wip: 'pg-wip',
  admin: 'pg-admin',
  login: 'pg-login-view',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class PgApp extends LitElement {
  static properties = {
    _authenticated: { state: true },
    _hasInstance: { state: true },
    _routeName: { state: true },
    _currentView: { state: true },
    _projectId: { state: true },
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

    .project-toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-md, 0.5rem);
      margin-bottom: var(--space-md, 0.5rem);
    }

    .view-container {
      position: relative;
      flex: 1;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }

    .instance-gate {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: var(--space-md, 0.75rem);
      padding: var(--space-xl, 2rem);
      text-align: center;
    }

    .instance-gate h2 {
      font-size: var(--font-size-xl, 1.25rem);
      font-weight: 600;
      color: var(--color-text, #0f172a);
      margin: 0;
    }

    .instance-gate p {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-muted, #64748b);
      margin: 0;
      max-width: 28rem;
      line-height: 1.5;
    }

    .instance-gate .icon {
      font-size: 2.5rem;
      opacity: 0.6;
    }
  `;

  constructor() {
    super();
    this._authenticated = false;
    this._hasInstance = false;
    this._routeName = 'projects';
    this._currentView = 'table';
    this._projectId = '';

    /** @type {number | null} */
    this._rafId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    initRouter();
    registerShortcuts();
    this._syncRoute();
    this._startRoutePolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    unregisterShortcuts();
    this._stopRoutePolling();
  }

  /** Sync internal state from currentRoute signal. */
  _syncRoute() {
    const route = currentRoute.get();
    this._routeName = route.name;
    this._projectId = route.params?.id || '';
  }

  /** Poll currentRoute signal via rAF to detect changes. */
  _startRoutePolling() {
    if (typeof globalThis.requestAnimationFrame === 'undefined') return;
    const poll = () => {
      const route = currentRoute.get();
      if (route.name !== this._routeName || (route.params?.id || '') !== this._projectId) {
        this._syncRoute();
      }
      this._rafId = globalThis.requestAnimationFrame(poll);
    };
    this._rafId = globalThis.requestAnimationFrame(poll);
  }

  _stopRoutePolling() {
    if (this._rafId != null && typeof globalThis.cancelAnimationFrame !== 'undefined') {
      globalThis.cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Set authentication state.
   * @param {boolean} authenticated
   */
  setAuthenticated(authenticated) {
    this._authenticated = authenticated;
    if (!authenticated) {
      this._hasInstance = false;
      navigate('/login');
      return;
    }
    // Check instance: signal from claims OR fallback to env var
    const instance = currentInstance.get();
    const envDb = import.meta.env.PUBLIC_FIREBASE_DATABASE_ID;
    this._hasInstance = !!(instance || (envDb && envDb !== '(default)'));
  }

  /** Handle view-change events from pg-view-switcher. */
  _onViewChange(/** @type {CustomEvent} */ e) {
    this._currentView = e.detail?.view || 'table';
  }

  /**
   * Render the current card view (table, board, or gantt).
   * @returns {import('lit').TemplateResult}
   */
  _renderCardView() {
    switch (this._currentView) {
      case 'board':
        return html`<pg-board .projectId=${this._projectId}></pg-board>`;
      case 'gantt':
        return html`<pg-gantt .projectId=${this._projectId}></pg-gantt>`;
      default:
        return html`<pg-table .projectId=${this._projectId}></pg-table>`;
    }
  }

  /**
   * Render the content for the current route.
   * @returns {import('lit').TemplateResult}
   */
  _renderRoute() {
    switch (this._routeName) {
      case 'projects':
        return html`<pg-project></pg-project>`;

      case 'project':
        return html`
          <pg-tabs .projectId=${this._projectId}></pg-tabs>
          <div class="project-toolbar">
            <pg-filters .projectId=${this._projectId}></pg-filters>
            <pg-view-switcher
              .current=${this._currentView}
              @view-change=${this._onViewChange}
            ></pg-view-switcher>
          </div>
          <div class="view-container">
            ${this._renderCardView()}
          </div>
          <pg-card-panel .projectId=${this._projectId}></pg-card-panel>
        `;

      case 'dashboard':
        return html`<pg-dashboard .projectId=${this._projectId}></pg-dashboard>`;

      case 'wip':
        return html`<pg-wip .projectId=${this._projectId}></pg-wip>`;

      case 'admin':
        return html`<pg-admin></pg-admin>`;

      default:
        return html`<div>Page not found</div>`;
    }
  }

  /** Render the "no instance" gate screen. */
  _renderInstanceGate() {
    return html`
      <div class="instance-gate">
        <span class="icon" aria-hidden="true">&#x1f512;</span>
        <h2>Pending instance assignment</h2>
        <p>
          Your account is authenticated but has no instance assigned yet.
          Please contact your administrator to get access, or wait for your
          request to be approved.
        </p>
      </div>
    `;
  }

  render() {
    if (!this._authenticated) {
      return html`<div class="loading">Authenticating…</div>`;
    }

    if (!this._hasInstance) {
      return this._renderInstanceGate();
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

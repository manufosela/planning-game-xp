import { LitElement, html, nothing } from 'https://unpkg.com/lit@3/index.js?module';
import { dalService } from '../services/dal-service.js';
import { sanitizeEmailForFirebase } from '../utils/email-sanitizer.js';
import { QuickAccessIconsStyles } from './quick-access-icons-styles.js';

class QuickAccessIcons extends LitElement {
  static properties = {
    backlogCount: { type: Number },
    toValidateCount: { type: Number },
    _developerId: { type: String, state: true },
    _stakeholderId: { type: String, state: true },
    _userProjects: { type: Object, state: true },
  };

  static get styles() {
    return QuickAccessIconsStyles;
  }

  constructor() {
    super();
    this.backlogCount = 0;
    this.toValidateCount = 0;
    this._developerId = '';
    this._stakeholderId = '';
    this._userProjects = {};
    this._unsubscribers = [];
    this._currentUser = null;
  }

  connectedCallback() {
    super.connectedCallback();

    this._boundOnAuth = (e) => {
      this._currentUser = e.detail.user;
      this._initialize();
    };
    this._boundOnSignOut = () => this._cleanup();

    document.addEventListener('user-authenticated', this._boundOnAuth);
    document.addEventListener('user-signed-out', this._boundOnSignOut);

    if (window.currentUser) {
      this._currentUser = window.currentUser;
      this._initialize();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('user-authenticated', this._boundOnAuth);
    document.removeEventListener('user-signed-out', this._boundOnSignOut);
    this._cleanup();
  }

  _cleanup() {
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
    this._currentUser = null;
    this._developerId = '';
    this._stakeholderId = '';
    this._userProjects = {};
    this.backlogCount = 0;
    this.toValidateCount = 0;
  }

  async _initialize() {
    if (!this._currentUser?.email) return;

    const encodedEmail = sanitizeEmailForFirebase(this._currentUser.email, false);
    if (!encodedEmail) return;

    try {
      const userData = await dalService.entities.getUser(encodedEmail);
      if (!userData) return;
      this._developerId = userData.developerId || '';
      this._stakeholderId = userData.stakeholderId || '';
      this._userProjects = userData.projects || {};

      if (this._developerId) {
        this._subscribeBacklog();
      }
      if (this._stakeholderId) {
        this._subscribeToValidate();
      }
    } catch (error) {
      console.error('[QuickAccessIcons] Failed to load user data:', error.code || error.message);
    }
  }

  _subscribeBacklog() {
    const unsub = dalService.backlogs.subscribeToBacklogItems(this._developerId, (items) => {
      this.backlogCount = items && typeof items === 'object' ? Object.keys(items).length : 0;
    });
    this._unsubscribers.push(unsub);
  }

  _subscribeToValidate() {
    const projectIds = Object.keys(this._userProjects).filter(
      (pid) => this._userProjects[pid]?.stakeholder === true
    );

    // Store per-project counts so subscriptions can update independently
    this._toValidateCounts = {};

    for (const projectId of projectIds) {
      const unsubTask = dalService.cards.subscribeToSection(projectId, 'task', (tasks) => {
        const count = tasks
          ? Object.values(tasks).filter(
            (t) => t.status === 'To Validate' && t.validator === this._stakeholderId
          ).length
          : 0;
        this._toValidateCounts[`${projectId}-task`] = count;
        this._updateToValidateTotal();
      });
      this._unsubscribers.push(unsubTask);

      const unsubBug = dalService.cards.subscribeToSection(projectId, 'bug', (bugs) => {
        const count = bugs
          ? Object.values(bugs).filter(
            (b) => b.status === 'To Validate' && b.validator === this._stakeholderId
          ).length
          : 0;
        this._toValidateCounts[`${projectId}-bug`] = count;
        this._updateToValidateTotal();
      });
      this._unsubscribers.push(unsubBug);
    }
  }

  _updateToValidateTotal() {
    this.toValidateCount = Object.values(this._toValidateCounts || {}).reduce((sum, c) => sum + c, 0);
  }

  _navigateBacklog() {
    window.location.href = '/wip';
  }

  _navigateToValidate() {
    const projectId = new URLSearchParams(window.location.search).get('projectId') || '';
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    params.set('filterStatus', 'To Validate');
    window.location.href = `/?${params.toString()}`;
  }

  render() {
    const showDev = !!this._developerId;
    const showStk = !!this._stakeholderId;

    if (!showDev && !showStk) return nothing;

    return html`
      ${showDev ? html`
        <div class="quick-icon" title="Mi backlog (${this.backlogCount} tareas)" @click=${this._navigateBacklog}>
          <svg viewBox="0 0 24 24">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z"/>
            <path d="M8 14h8v2H8zm0-3h8v2H8z"/>
          </svg>
          ${this.backlogCount > 0 ? html`
            <span class="badge">${this.backlogCount > 99 ? '99+' : this.backlogCount}</span>
          ` : nothing}
        </div>
      ` : nothing}
      ${showStk ? html`
        <div class="quick-icon" title="Pendientes de validar (${this.toValidateCount})" @click=${this._navigateToValidate}>
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          ${this.toValidateCount > 0 ? html`
            <span class="badge">${this.toValidateCount > 99 ? '99+' : this.toValidateCount}</span>
          ` : nothing}
        </div>
      ` : nothing}
    `;
  }
}

customElements.define('quick-access-icons', QuickAccessIcons);

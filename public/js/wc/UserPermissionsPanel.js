import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { userPermissionsPanelStyles } from './user-permissions-panel-styles.js';
import { database, ref, get, set } from '/firebase-config.js';

/**
 * <user-permissions-panel> — SuperAdmin-only matrix to manage per-project
 * section visibility (tasks, bugs, proposals, epics, sprints, qa) and app
 * permissions (view, download, upload, edit, approve) for every user.
 *
 * Data model:
 *   /users/{encodedEmail}/projects/{projectId}/sectionPermissions/{key}
 *   /users/{encodedEmail}/projects/{projectId}/appPermissions/{key}
 *
 * Each toggle persists immediately via a single RTDB set(). The component
 * picks up the active project from window.currentProjectId / dataset.
 */

const SECTION_KEYS = [
  { key: 'tasks',     label: 'Tasks' },
  { key: 'bugs',      label: 'Bugs' },
  { key: 'proposals', label: 'Proposals' },
  { key: 'epics',     label: 'Epics' },
  { key: 'sprints',   label: 'Sprints' },
  { key: 'qa',        label: 'QA' }
];

const APP_KEYS = [
  { key: 'view',     label: 'View' },
  { key: 'download', label: 'Download' },
  { key: 'upload',   label: 'Upload' },
  { key: 'edit',     label: 'Edit' },
  { key: 'approve',  label: 'Approve' }
];

function encodeEmail(email) {
  return String(email || '').toLowerCase().trim()
    .replace(/\./g, '_')
    .replace(/#/g, '_')
    .replace(/\$/g, '_')
    .replace(/\[/g, '_')
    .replace(/\]/g, '_');
}

export class UserPermissionsPanel extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id', reflect: true },
      users: { state: true },
      query: { state: true },
      status: { state: true },
      loadError: { state: true }
    };
  }

  static get styles() {
    return [userPermissionsPanelStyles];
  }

  constructor() {
    super();
    this.projectId = window.currentProjectId || document.body?.dataset?.projectId || '';
    this.users = [];
    this.query = '';
    this.status = '';
    this.loadError = '';
    this._projectChangedHandler = (e) => {
      const next = e.detail?.projectId || '';
      if (next && next !== this.projectId) {
        this.projectId = next;
        this._load();
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('project-changed', this._projectChangedHandler);
    this._load();
  }

  disconnectedCallback() {
    document.removeEventListener('project-changed', this._projectChangedHandler);
    super.disconnectedCallback();
  }

  async _load() {
    if (!this.projectId) {
      this.users = [];
      return;
    }
    this.status = 'Cargando usuarios...';
    this.loadError = '';
    try {
      const snap = await get(ref(database, '/users'));
      const raw = snap.val() || {};
      const all = Object.entries(raw).map(([encoded, data]) => ({
        encoded,
        email: data?.email || '',
        name: data?.name || data?.email || encoded,
        projects: data?.projects || {}
      }));
      this.users = all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.status = '';
    } catch (err) {
      console.error('[UserPermissionsPanel] load failed', err);
      this.loadError = err?.message || 'Error cargando usuarios';
      this.users = [];
      this.status = '';
    }
  }

  _onSearch(e) {
    this.query = (e.target.value || '').toLowerCase();
  }

  _isAllowed(user, group, key) {
    const projectEntry = user.projects?.[this.projectId];
    if (!projectEntry) return false;
    return projectEntry?.[group]?.[key] === true;
  }

  async _togglePerm(user, group, key, checked) {
    const path = `/users/${user.encoded}/projects/${this.projectId}/${group}/${key}`;
    try {
      await set(ref(database, path), Boolean(checked));
      // Update local cache so the row reflects immediately.
      const next = { ...user.projects };
      next[this.projectId] = next[this.projectId] || {};
      next[this.projectId][group] = { ...(next[this.projectId][group] || {}) };
      next[this.projectId][group][key] = Boolean(checked);
      user.projects = next;
      this.requestUpdate();
      this.status = `Guardado ${user.name} · ${group}.${key} = ${checked ? 'on' : 'off'}`;
      window.setTimeout(() => { this.status = ''; this.requestUpdate(); }, 1500);
    } catch (err) {
      console.error('[UserPermissionsPanel] toggle failed', err);
      this.status = `Error guardando ${user.name} · ${group}.${key}`;
      // Force re-render so the checkbox reverts to its previous state.
      this.requestUpdate();
    }
  }

  _renderToggle(user, group, key) {
    const checked = this._isAllowed(user, group, key);
    const id = `${user.encoded}-${group}-${key}`;
    return html`
      <td class="col-toggle">
        <input
          type="checkbox"
          id=${id}
          .checked=${checked}
          @change=${(e) => this._togglePerm(user, group, key, e.target.checked)}
          aria-label="${user.name} ${group} ${key}"
        />
      </td>
    `;
  }

  render() {
    if (!this.projectId) {
      return html`<div class="state-empty">Selecciona un proyecto para gestionar sus permisos.</div>`;
    }
    if (this.loadError) {
      return html`<div class="state-error">${this.loadError}</div>`;
    }

    const visible = this.users.filter((u) => {
      if (!this.query) return true;
      return (u.name || '').toLowerCase().includes(this.query)
        || (u.email || '').toLowerCase().includes(this.query);
    });

    return html`
      <div class="panel">
        <div class="panel-toolbar">
          <input
            type="search"
            placeholder="Buscar usuario por nombre o email..."
            .value=${this.query}
            @input=${this._onSearch}
            aria-label="Filtrar usuarios"
          />
          <span class="panel-status">${this.status || `${visible.length} usuario(s)`}</span>
        </div>

        ${this.users.length === 0 && !this.status
          ? html`<div class="state-empty">No hay usuarios registrados en /users/.</div>`
          : visible.length === 0
            ? html`<div class="state-empty">Ningún usuario coincide con "${this.query}".</div>`
            : html`
              <table class="perm-table">
                <thead>
                  <tr>
                    <th rowspan="2">Usuario</th>
                    <th class="col-group-section" colspan="${SECTION_KEYS.length}">Secciones del proyecto</th>
                    <th class="col-group-app" colspan="${APP_KEYS.length}">Apps</th>
                  </tr>
                  <tr>
                    ${SECTION_KEYS.map((s) => html`<th class="col-section col-group-section">${s.label}</th>`)}
                    ${APP_KEYS.map((a) => html`<th class="col-app col-group-app">${a.label}</th>`)}
                  </tr>
                </thead>
                <tbody>
                  ${visible.map((user) => html`
                    <tr>
                      <td>
                        <div class="user-name">${user.name}</div>
                        <div class="user-email">${user.email}</div>
                      </td>
                      ${SECTION_KEYS.map((s) => this._renderToggle(user, 'sectionPermissions', s.key))}
                      ${APP_KEYS.map((a) => this._renderToggle(user, 'appPermissions', a.key))}
                    </tr>
                  `)}
                </tbody>
              </table>
            `}

        <div class="panel-footer">
          Cada toggle persiste inmediatamente en
          <code>/users/{email}/projects/${this.projectId}/{sectionPermissions|appPermissions}/{key}</code>.
          El enforcement de los permisos lo hacen el resto de componentes de la app.
        </div>
      </div>
    `;
  }
}

if (!customElements.get('user-permissions-panel')) {
  customElements.define('user-permissions-panel', UserPermissionsPanel);
}

export { encodeEmail, SECTION_KEYS, APP_KEYS };

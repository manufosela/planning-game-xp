/**
 * UserPermissionsPanel
 *
 * Admin UI component for managing per-project user permissions.
 * Displays a matrix of users x permissions for the currently selected project.
 * Only visible to users with isAppAdmin custom claim.
 *
 * Permissions managed:
 * - Section permissions: tasks, bugs, proposals, epics, sprints, qa
 * - App permissions: view, download, upload, edit, approve
 *
 * Data is stored at /users/{encodedEmail}/projects/{projectId}/
 *   - sectionPermissions/{section} = boolean
 *   - appPermissions/{perm} = boolean
 *
 * Uses the updateAppPermissions Cloud Function for appPermissions,
 * and direct Firebase writes for sectionPermissions (through a new CF).
 */
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { UserPermissionsPanelStyles } from './user-permissions-panel-styles.js';
import { functions, database, ref, get, set, httpsCallable } from '/firebase-config.js';
import { encodeEmailForFirebase } from '/js/utils/email-sanitizer.js';

const SECTION_PERMISSIONS = ['tasks', 'bugs', 'proposals', 'epics', 'sprints', 'qa'];
const APP_PERMISSIONS = ['view', 'download', 'upload', 'edit', 'approve'];

const SECTION_LABELS = {
  tasks: 'Tasks',
  bugs: 'Bugs',
  proposals: 'Proposals',
  epics: 'Epics',
  sprints: 'Sprints',
  qa: 'QA',
};

const APP_LABELS = {
  view: 'View',
  download: 'Download',
  upload: 'Upload',
  edit: 'Edit',
  approve: 'Approve',
};

class UserPermissionsPanel extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id' },
      _users: { type: Array, state: true },
      _loading: { type: Boolean, state: true },
      _saving: { type: Boolean, state: true },
      _searchQuery: { type: String, state: true },
      _pendingChanges: { type: Object, state: true },
    };
  }

  static get styles() {
    return [UserPermissionsPanelStyles];
  }

  constructor() {
    super();
    this.projectId = '';
    this._users = [];
    this._loading = false;
    this._saving = false;
    this._searchQuery = '';
    this._pendingChanges = {};
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.projectId) {
      this._loadUsers();
    }
  }

  updated(changedProps) {
    if (changedProps.has('projectId') && this.projectId) {
      this._pendingChanges = {};
      this._loadUsers();
    }
  }

  // ==================== DATA LOADING ====================

  async _loadUsers() {
    if (!this.projectId) return;

    this._loading = true;
    try {
      const listUsersFn = httpsCallable(functions, 'listUsers');
      const result = await listUsersFn();
      const allUsers = result.data?.users || [];

      // Filter to users that belong to this project
      this._users = allUsers
        .filter((user) => user.projects && user.projects[this.projectId])
        .map((user) => {
          const projectData = user.projects[this.projectId] || {};
          return {
            email: user.email,
            name: user.name || user.email,
            sectionPermissions: this._normalizeSectionPerms(projectData.sectionPermissions),
            appPermissions: this._normalizeAppPerms(projectData.appPermissions),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error loading users for permissions:', error);
      this._notify('Error loading users', 'error');
    } finally {
      this._loading = false;
    }
  }

  _normalizeSectionPerms(perms) {
    const result = {};
    for (const key of SECTION_PERMISSIONS) {
      result[key] = perms?.[key] === true;
    }
    return result;
  }

  _normalizeAppPerms(perms) {
    const result = {};
    for (const key of APP_PERMISSIONS) {
      result[key] = perms?.[key] === true;
    }
    return result;
  }

  // ==================== PERMISSION CHANGES ====================

  _handleToggle(userEmail, permType, permKey, currentValue) {
    const changeKey = `${userEmail}::${permType}::${permKey}`;
    const newValue = !currentValue;

    // Update local user state for immediate UI feedback
    const userIndex = this._users.findIndex((u) => u.email === userEmail);
    if (userIndex === -1) return;

    const updatedUsers = [...this._users];
    const user = { ...updatedUsers[userIndex] };

    if (permType === 'section') {
      user.sectionPermissions = { ...user.sectionPermissions, [permKey]: newValue };
    } else {
      user.appPermissions = { ...user.appPermissions, [permKey]: newValue };
    }
    updatedUsers[userIndex] = user;
    this._users = updatedUsers;

    // Track pending change
    this._pendingChanges = {
      ...this._pendingChanges,
      [changeKey]: { userEmail, permType, permKey, value: newValue },
    };
  }

  get _hasPendingChanges() {
    return Object.keys(this._pendingChanges).length > 0;
  }

  async _saveChanges() {
    if (!this._hasPendingChanges || this._saving) return;

    this._saving = true;
    try {
      const changes = Object.values(this._pendingChanges);

      // Group changes by user
      const changesByUser = {};
      for (const change of changes) {
        if (!changesByUser[change.userEmail]) {
          changesByUser[change.userEmail] = { section: {}, app: {} };
        }
        changesByUser[change.userEmail][change.permType][change.permKey] = change.value;
      }

      // Save each user's changes
      const promises = [];
      for (const [email, perms] of Object.entries(changesByUser)) {
        const encodedEmail = encodeEmailForFirebase(email.toLowerCase());

        // Save section permissions directly to Firebase
        if (Object.keys(perms.section).length > 0) {
          for (const [key, value] of Object.entries(perms.section)) {
            const permRef = ref(
              database,
              `/users/${encodedEmail}/projects/${this.projectId}/sectionPermissions/${key}`
            );
            promises.push(set(permRef, value));
          }
        }

        // Save app permissions via Cloud Function
        if (Object.keys(perms.app).length > 0) {
          const user = this._users.find((u) => u.email === email);
          if (user) {
            const updatePermsFn = httpsCallable(functions, 'updateAppPermissions');
            promises.push(
              updatePermsFn({
                email,
                projectId: this.projectId,
                permissions: user.appPermissions,
              })
            );
          }
        }
      }

      await Promise.all(promises);
      this._pendingChanges = {};
      this._notify('Permissions saved successfully', 'success');
    } catch (error) {
      console.error('Error saving permissions:', error);
      this._notify(`Error saving permissions: ${error.message}`, 'error');
    } finally {
      this._saving = false;
    }
  }

  _discardChanges() {
    this._pendingChanges = {};
    this._loadUsers();
  }

  // ==================== BULK OPERATIONS ====================

  _toggleAllSections(userEmail, enable) {
    for (const key of SECTION_PERMISSIONS) {
      const user = this._users.find((u) => u.email === userEmail);
      if (user && user.sectionPermissions[key] !== enable) {
        this._handleToggle(userEmail, 'section', key, user.sectionPermissions[key]);
      }
    }
  }

  // ==================== NOTIFICATIONS ====================

  _notify(message, type = 'info') {
    this.dispatchEvent(
      new CustomEvent('show-slide-notification', {
        bubbles: true,
        composed: true,
        detail: { message, type },
      })
    );
  }

  // ==================== FILTERING ====================

  get _filteredUsers() {
    if (!this._searchQuery) return this._users;
    const q = this._searchQuery.toLowerCase();
    return this._users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }

  // ==================== RENDER ====================

  render() {
    if (!this.projectId) {
      return html`<div class="no-project"><p>Select a project to manage permissions.</p></div>`;
    }

    if (this._loading) {
      return html`
        <div class="loading-container">
          <div class="spinner"></div>
          <p>Loading users...</p>
        </div>
      `;
    }

    const users = this._filteredUsers;

    return html`
      <div class="panel-container">
        <div class="panel-header">
          <h3>User Permissions <span class="user-count">(${this._users.length} users)</span></h3>
        </div>

        <div class="search-bar">
          <input
            type="text"
            class="search-input"
            placeholder="Search by name or email..."
            .value=${this._searchQuery}
            @input=${(e) => { this._searchQuery = e.target.value; }}
          />
        </div>

        ${users.length === 0
          ? html`<div class="empty-state"><p>No users found for this project.</p></div>`
          : this._renderPermissionsTable(users)
        }

        <div class="save-bar ${this._hasPendingChanges ? '' : 'hidden'}">
          <button class="btn btn-secondary" @click=${this._discardChanges} ?disabled=${this._saving}>
            Discard
          </button>
          <button class="btn btn-primary" @click=${this._saveChanges} ?disabled=${this._saving}>
            ${this._saving ? 'Saving...' : `Save Changes (${Object.keys(this._pendingChanges).length})`}
          </button>
        </div>
      </div>
    `;
  }

  _renderPermissionsTable(users) {
    return html`
      <div style="overflow-x: auto;">
        <table class="permissions-table">
          <thead>
            <tr>
              <th class="user-col" rowspan="2">User</th>
              <th colspan="${SECTION_PERMISSIONS.length}" class="section-group">Section Access</th>
              <th colspan="${APP_PERMISSIONS.length}" class="app-group">App Permissions</th>
              <th rowspan="2">Actions</th>
            </tr>
            <tr>
              ${SECTION_PERMISSIONS.map(
                (key) => html`<th class="section-group">${SECTION_LABELS[key]}</th>`
              )}
              ${APP_PERMISSIONS.map(
                (key) => html`<th class="app-group">${APP_LABELS[key]}</th>`
              )}
            </tr>
          </thead>
          <tbody>
            ${users.map((user) => this._renderUserRow(user))}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderUserRow(user) {
    const allSectionsEnabled = SECTION_PERMISSIONS.every((k) => user.sectionPermissions[k]);

    return html`
      <tr>
        <td class="user-col">
          <div class="user-info">
            <span class="user-name">${user.name}</span>
            <span class="user-email">${user.email}</span>
          </div>
        </td>
        ${SECTION_PERMISSIONS.map(
          (key) => html`
            <td>
              <label class="toggle">
                <input
                  type="checkbox"
                  .checked=${user.sectionPermissions[key]}
                  @change=${() => this._handleToggle(user.email, 'section', key, user.sectionPermissions[key])}
                  ?disabled=${this._saving}
                />
                <span class="toggle-slider"></span>
              </label>
            </td>
          `
        )}
        ${APP_PERMISSIONS.map(
          (key) => html`
            <td>
              <label class="toggle">
                <input
                  type="checkbox"
                  .checked=${user.appPermissions[key]}
                  @change=${() => this._handleToggle(user.email, 'app', key, user.appPermissions[key])}
                  ?disabled=${this._saving}
                />
                <span class="toggle-slider"></span>
              </label>
            </td>
          `
        )}
        <td>
          <button
            class="btn btn-sm ${allSectionsEnabled ? 'btn-secondary' : 'btn-primary'}"
            @click=${() => this._toggleAllSections(user.email, !allSectionsEnabled)}
            ?disabled=${this._saving}
            title=${allSectionsEnabled ? 'Disable all sections' : 'Enable all sections'}
          >
            ${allSectionsEnabled ? 'None' : 'All'}
          </button>
        </td>
      </tr>
    `;
  }
}

customElements.define('user-permissions-panel', UserPermissionsPanel);

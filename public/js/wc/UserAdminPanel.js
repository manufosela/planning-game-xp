/**
 * UserAdminPanel
 *
 * Admin UI component for managing application users.
 * Calls Firebase Cloud Functions (listUsers, createOrUpdateUser, removeUserFromProject)
 * to manage users stored at /users/{encodedEmail} in Realtime Database.
 * Only visible to users with isAppAdmin custom claim.
 */
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { UserAdminPanelStyles } from './user-admin-panel-styles.js';
import { functions, database, ref, get, query, orderByChild, limitToLast, httpsCallable } from '/firebase-config.js';
import { encodeEmailForFirebase } from '/js/utils/email-sanitizer.js';
import { modalService } from '../services/modal-service.js';
import './MultiSelect.js';

class UserAdminPanel extends LitElement {
  static get properties() {
    return {
      users: { type: Array, state: true },
      projects: { type: Array, state: true },
      loading: { type: Boolean, state: true },
      _showForm: { type: Boolean, state: true },
      _editingEmail: { type: String, state: true },
      _formName: { type: String, state: true },
      _formEmail: { type: String, state: true },
      _formProjectIds: { type: Array, state: true },
      _formDeveloper: { type: Boolean, state: true },
      _formStakeholder: { type: Boolean, state: true },
      _searchQuery: { type: String, state: true },
      _onboardingSteps: { type: Array, state: true },
      _onboardingActive: { type: Boolean, state: true },
      _showPermissionsModal: { type: Boolean, state: true },
      _permissionsUser: { type: Object, state: true },
      _permissionsProject: { type: String, state: true },
      _permissionsData: { type: Object, state: true },
      _showLoginHistoryModal: { type: Boolean, state: true },
      _loginHistoryUser: { type: Object, state: true },
      _loginHistoryEntries: { type: Array, state: true },
      _loginHistoryLoading: { type: Boolean, state: true },
    };
  }

  static get styles() {
    return [UserAdminPanelStyles];
  }

  constructor() {
    super();
    this.users = [];
    this.projects = [];
    this.loading = false;
    this._showForm = false;
    this._editingEmail = null;
    this._searchQuery = '';
    this._onboardingSteps = [];
    this._onboardingActive = false;
    this._showPermissionsModal = false;
    this._permissionsUser = null;
    this._permissionsProject = '';
    this._permissionsData = { view: false, download: false, upload: false, edit: false, approve: false };
    this._showLoginHistoryModal = false;
    this._loginHistoryUser = null;
    this._loginHistoryEntries = [];
    this._loginHistoryLoading = false;
    this._projectsWithApps = new Set();
    this._resetForm();
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
  }

  // ==================== DATA LOADING ====================

  async _loadData() {
    this.loading = true;
    try {
      await Promise.all([
        this._loadUsers(),
        this._loadProjects(),
      ]);
    } catch (error) {
      console.error('Error loading user admin data:', error);
      this._notify('Error loading data', 'error');
    } finally {
      this.loading = false;
    }
  }

  async _loadUsers() {
    const listUsersFn = httpsCallable(functions, 'listUsers');
    const result = await listUsersFn();
    this.users = result.data?.users || [];
  }

  async _loadProjects() {
    const projectsRef = ref(database, '/projects');
    const snapshot = await get(projectsRef);
    if (snapshot.exists()) {
      const projectsData = snapshot.val();
      this.projects = Object.keys(projectsData).sort();
      this._projectsWithApps = new Set(
        Object.entries(projectsData)
          .filter(([, data]) => data.allowExecutables === true)
          .map(([name]) => name)
      );
    } else {
      this.projects = [];
      this._projectsWithApps = new Set();
    }
  }

  // ==================== FORM MANAGEMENT ====================

  _resetForm() {
    this._formName = '';
    this._formEmail = '';
    this._formProjectIds = [];
    this._formDeveloper = true;
    this._formStakeholder = false;
    this._editingEmail = null;
    this._onboardingSteps = [];
    this._onboardingActive = false;
  }

  _openNewForm() {
    this._resetForm();
    this._showForm = true;
  }

  _openEditForm(user) {
    this._editingEmail = user.email;
    this._formName = user.name || '';
    this._formEmail = user.email || '';
    this._formProjectIds = Object.keys(user.projects || {});
    this._formDeveloper = true;
    this._formStakeholder = false;
    this._showForm = true;
  }

  _cancelForm() {
    this._showForm = false;
    this._resetForm();
  }

  // ==================== CRUD OPERATIONS ====================

  _checkExistingUser() {
    const email = this._formEmail.trim().toLowerCase();
    if (!email || this._editingEmail) return null;
    return this.users.find((u) => u.email.toLowerCase() === email);
  }

  _buildOnboardingSteps(projectIds) {
    const existing = this._checkExistingUser();
    const steps = [];

    if (existing) {
      steps.push({ id: 'user', label: `User record (${existing.email})`, status: 'done' });
      if (existing.developerId) {
        steps.push({ id: 'dev', label: `Developer ID: ${existing.developerId}`, status: 'done' });
      } else if (this._formDeveloper) {
        steps.push({ id: 'dev', label: 'Assign Developer ID', status: 'pending' });
      }
      if (existing.stakeholderId) {
        steps.push({ id: 'stk', label: `Stakeholder ID: ${existing.stakeholderId}`, status: 'done' });
      } else if (this._formStakeholder) {
        steps.push({ id: 'stk', label: 'Assign Stakeholder ID', status: 'pending' });
      }
    } else {
      steps.push({ id: 'user', label: 'Create user record', status: 'pending' });
      if (this._formDeveloper) {
        steps.push({ id: 'dev', label: 'Assign Developer ID', status: 'pending' });
      }
      if (this._formStakeholder) {
        steps.push({ id: 'stk', label: 'Assign Stakeholder ID', status: 'pending' });
      }
    }

    const existingProjects = existing ? Object.keys(existing.projects || {}) : [];
    for (const pid of projectIds) {
      if (existingProjects.includes(pid)) {
        steps.push({ id: `proj-${pid}`, label: `Project: ${pid}`, status: 'done' });
      } else {
        steps.push({ id: `proj-${pid}`, label: `Add project: ${pid}`, status: 'pending' });
      }
    }

    steps.push({ id: 'claims', label: 'Sync auth claims', status: 'pending' });
    return steps;
  }

  _updateStep(stepId, status) {
    this._onboardingSteps = this._onboardingSteps.map((s) =>
      s.id === stepId ? { ...s, status } : s
    );
  }

  async _saveUser() {
    const name = this._formName.trim();
    const email = this._formEmail.trim();
    const allSelected = this._formProjectIds;

    if (!name || !email) return;
    if (allSelected.length === 0) {
      this._notify('Please select at least one project', 'warning');
      return;
    }

    // Only process projects not yet assigned
    const existing = this._checkExistingUser();
    const existingProjectIds = existing ? Object.keys(existing.projects || {}) : [];
    const projectIds = allSelected.filter((p) => !existingProjectIds.includes(p));

    if (projectIds.length === 0 && existing) {
      this._notify('No new projects selected', 'info');
      return;
    }

    // If no new projects but user doesn't exist, use allSelected
    const projectsToProcess = projectIds.length > 0 ? projectIds : allSelected;

    this._onboardingSteps = this._buildOnboardingSteps(projectsToProcess);
    this._onboardingActive = true;

    const createOrUpdateUserFn = httpsCallable(functions, 'createOrUpdateUser');
    let hasError = false;

    // First call creates/updates user + assigns first project (also generates dev/stk IDs)
    const firstProject = projectsToProcess[0];
    this._updateStep('user', 'running');
    if (this._formDeveloper) this._updateStep('dev', 'running');
    if (this._formStakeholder) this._updateStep('stk', 'running');
    this._updateStep(`proj-${firstProject}`, 'running');

    try {
      await createOrUpdateUserFn({
        email,
        name,
        projectId: firstProject,
        developer: this._formDeveloper,
        stakeholder: this._formStakeholder,
      });
      this._updateStep('user', 'done');
      if (this._formDeveloper) this._updateStep('dev', 'done');
      if (this._formStakeholder) this._updateStep('stk', 'done');
      this._updateStep(`proj-${firstProject}`, 'done');
    } catch (error) {
      console.error('Error creating user:', error);
      this._updateStep('user', 'error');
      this._updateStep(`proj-${firstProject}`, 'error');
      this._notify(`Error creating user: ${error.message}`, 'error');
      this._onboardingActive = false;
      return;
    }

    // Remaining projects (if any) — one call per project
    for (let i = 1; i < projectsToProcess.length; i++) {
      const pid = projectsToProcess[i];
      this._updateStep(`proj-${pid}`, 'running');
      try {
        await createOrUpdateUserFn({
          email,
          name,
          projectId: pid,
          developer: this._formDeveloper,
          stakeholder: this._formStakeholder,
        });
        this._updateStep(`proj-${pid}`, 'done');
      } catch (error) {
        console.error(`Error adding project ${pid}:`, error);
        this._updateStep(`proj-${pid}`, 'error');
        hasError = true;
      }
    }

    // Claims sync happens server-side within createOrUpdateUser
    this._updateStep('claims', 'done');

    await this._loadUsers();

    if (hasError) {
      this._notify('User created but some projects failed', 'warning');
    } else {
      this._showForm = false;
      this._notify(
        this._editingEmail ? 'User updated successfully' : 'User onboarded successfully',
        'success'
      );
      this._resetForm();
    }
  }

  // ==================== APP PERMISSIONS ====================

  _openAppPermissions(user, projectId) {
    const projectData = user.projects?.[projectId] || {};
    const currentPerms = projectData.appPermissions || {};
    this._permissionsUser = user;
    this._permissionsProject = projectId;
    this._permissionsData = {
      view: currentPerms.view === true,
      download: currentPerms.download === true,
      upload: currentPerms.upload === true,
      edit: currentPerms.edit === true,
      approve: currentPerms.approve === true,
    };
    this._showPermissionsModal = true;
  }

  _closePermissionsModal() {
    this._showPermissionsModal = false;
    this._permissionsUser = null;
    this._permissionsProject = '';
  }

  async _saveAppPermissions() {
    if (!this._permissionsUser || !this._permissionsProject) return;

    try {
      const updatePermsFn = httpsCallable(functions, 'updateAppPermissions');
      await updatePermsFn({
        email: this._permissionsUser.email,
        projectId: this._permissionsProject,
        permissions: this._permissionsData,
      });

      this._closePermissionsModal();
      await this._loadUsers();
      this._notify('App permissions updated', 'success');
    } catch (error) {
      console.error('Error updating app permissions:', error);
      this._notify(`Error updating permissions: ${error.message}`, 'error');
    }
  }

  _renderAppPermissionsModal() {
    if (!this._showPermissionsModal || !this._permissionsUser) return nothing;

    const permLabels = [
      { key: 'view', label: 'View' },
      { key: 'download', label: 'Download' },
      { key: 'upload', label: 'Upload' },
      { key: 'edit', label: 'Edit' },
      { key: 'approve', label: 'Approve' },
    ];

    return html`
      <div class="modal-overlay" @click=${this._closePermissionsModal}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <h4 class="modal-title">
            App Permissions: ${this._permissionsUser.name} — ${this._permissionsProject}
          </h4>
          <div class="permissions-checkboxes">
            ${permLabels.map(({ key, label }) => html`
              <label class="form-checkbox">
                <input
                  type="checkbox"
                  .checked=${this._permissionsData[key]}
                  @change=${(e) => {
                    this._permissionsData = { ...this._permissionsData, [key]: e.target.checked };
                  }}
                />
                <span>${label}</span>
              </label>
            `)}
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click=${this._closePermissionsModal}>Cancel</button>
            <button class="btn btn-primary" @click=${this._saveAppPermissions}>Save</button>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== LOGIN HISTORY ====================

  async _openLoginHistory(user) {
    this._loginHistoryUser = user;
    this._loginHistoryEntries = [];
    this._loginHistoryLoading = true;
    this._showLoginHistoryModal = true;

    try {
      const encodedEmail = encodeEmailForFirebase(user.email.toLowerCase());
      const historyRef = query(
        ref(database, `/loginHistory/${encodedEmail}`),
        orderByChild('timestamp'),
        limitToLast(50)
      );
      const snapshot = await get(historyRef);
      if (snapshot.exists()) {
        const entries = [];
        snapshot.forEach((child) => {
          entries.push({ id: child.key, ...child.val() });
        });
        this._loginHistoryEntries = entries.reverse();
      }
    } catch (error) {
      console.error('Error loading login history:', error);
      this._notify('Error loading login history', 'error');
    } finally {
      this._loginHistoryLoading = false;
    }
  }

  _closeLoginHistory() {
    this._showLoginHistoryModal = false;
    this._loginHistoryUser = null;
    this._loginHistoryEntries = [];
  }

  _formatLoginDate(isoString) {
    if (!isoString) return '\u2014';
    const date = new Date(isoString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  _getLoginTypeBadge(loginType) {
    switch (loginType) {
      case 'oauth': return 'OAuth';
      case 'email': return 'Email';
      case 'session-restore': return 'Session';
      case 'first-login': return 'First Login';
      default: return loginType || 'Unknown';
    }
  }

  _renderLoginHistoryModal() {
    if (!this._showLoginHistoryModal || !this._loginHistoryUser) return nothing;

    return html`
      <div class="modal-overlay" @click=${this._closeLoginHistory}>
        <div class="modal-content modal-wide" @click=${(e) => e.stopPropagation()}>
          <h4 class="modal-title">
            Login History: ${this._loginHistoryUser.name} (${this._loginHistoryUser.email})
          </h4>
          ${this._loginHistoryLoading
            ? html`<div class="loading-message">Loading login history...</div>`
            : this._loginHistoryEntries.length === 0
              ? html`<div class="empty-message">No login history found</div>`
              : html`
                <div class="table-container login-history-list">
                  <table class="entity-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Provider</th>
                        <th>User Agent</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this._loginHistoryEntries.map((entry) => html`
                        <tr>
                          <td>${this._formatLoginDate(entry.timestamp)}</td>
                          <td><span class="badge badge-login-type">${this._getLoginTypeBadge(entry.loginType)}</span></td>
                          <td>${entry.provider || '\u2014'}</td>
                          <td class="col-ua" title="${entry.userAgent || ''}">${(entry.userAgent || '').substring(0, 60)}${(entry.userAgent || '').length > 60 ? '...' : ''}</td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              `}
          <div class="form-actions">
            <button class="btn btn-secondary" @click=${this._closeLoginHistory}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== USER OPERATIONS ====================

  async _deleteUser(user) {
    const confirmed = await modalService.confirm(
      'Delete user',
      `Are you sure you want to delete "${user.name}" (${user.email})? This will remove all project assignments and revoke permissions.`
    );
    if (!confirmed) return;

    try {
      const deleteUserFn = httpsCallable(functions, 'deleteUser');
      await deleteUserFn({ email: user.email });

      await this._loadUsers();
      this._notify(`User "${user.name}" deleted successfully`, 'success');
    } catch (error) {
      console.error('Error deleting user:', error);
      this._notify(`Error deleting user: ${error.message}`, 'error');
    }
  }

  async _removeProject(user, projectId) {
    const confirmed = await modalService.confirm(
      'Remove project assignment',
      `Remove "${projectId}" from user "${user.name}" (${user.email})?`
    );
    if (!confirmed) return;

    try {
      const removeUserFromProjectFn = httpsCallable(functions, 'removeUserFromProject');
      await removeUserFromProjectFn({
        email: user.email,
        projectId,
      });

      await this._loadUsers();
      this._notify(`Project "${projectId}" removed from user`, 'success');
    } catch (error) {
      console.error('Error removing project from user:', error);
      this._notify(`Error removing project: ${error.message}`, 'error');
    }
  }

  _toggleProject(projectId) {
    if (this._formProjectIds.includes(projectId)) {
      this._formProjectIds = this._formProjectIds.filter((p) => p !== projectId);
    } else {
      this._formProjectIds = [...this._formProjectIds, projectId];
    }
  }

  // ==================== HELPERS ====================

  _notify(message, type = 'info') {
    this.dispatchEvent(new CustomEvent('show-slide-notification', {
      bubbles: true,
      composed: true,
      detail: { options: { message, type } },
    }));
  }

  get _filteredUsers() {
    if (!this._searchQuery.trim()) return this.users;

    const query = this._searchQuery.toLowerCase().trim();
    return this.users.filter((user) => {
      const name = (user.name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }

  _getAuthStatusBadgeClass(status) {
    switch (status) {
      case 'active': return 'badge-active';
      case 'not_registered': return 'badge-not-registered';
      case 'disabled': return 'badge-disabled';
      default: return 'badge-inactive';
    }
  }

  _getAuthStatusLabel(status) {
    switch (status) {
      case 'active': return 'Active';
      case 'not_registered': return 'Pending';
      case 'disabled': return 'Disabled';
      default: return status || 'Unknown';
    }
  }

  _getAuthStatusTitle(status) {
    switch (status) {
      case 'active': return 'User has logged in and is active';
      case 'not_registered': return 'User has not logged in yet';
      case 'disabled': return 'User account is disabled';
      default: return '';
    }
  }

  // ==================== RENDER ====================

  render() {
    if (this.loading) {
      return html`<div class="loading-message">Loading users</div>`;
    }

    const filteredUsers = this._filteredUsers;

    return html`
      <div class="user-admin-container">
        ${this._renderHeader(filteredUsers)}
        ${this._showForm ? this._renderForm() : nothing}
        ${this._renderTable(filteredUsers)}
        ${this._renderAppPermissionsModal()}
        ${this._renderLoginHistoryModal()}
      </div>
    `;
  }

  _renderHeader(filteredUsers) {
    return html`
      <div class="user-admin-header">
        <div class="header-left">
          <span class="user-count">
            ${filteredUsers.length === this.users.length
              ? `${this.users.length} users`
              : `${filteredUsers.length} of ${this.users.length} users`}
          </span>
        </div>
        <div class="header-actions">
          <div class="search-box">
            <input
              type="text"
              placeholder="Search by name or email..."
              .value=${this._searchQuery}
              @input=${(e) => { this._searchQuery = e.target.value; }}
            />
          </div>
          <button class="btn btn-primary btn-sm" @click=${this._openNewForm}>+ Add User</button>
        </div>
      </div>
    `;
  }

  _renderForm() {
    const isEditing = Boolean(this._editingEmail);
    const existingUser = this._checkExistingUser();
    const existingProjectIds = existingUser ? Object.keys(existingUser.projects || {}) : [];

    return html`
      <div class="entity-form">
        <h4 class="form-title">${isEditing ? `Add project to: ${this._editingEmail}` : 'Onboard User'}</h4>

        ${existingUser && !isEditing ? html`
          <div class="existing-user-notice">
            User "${existingUser.name}" already exists.
            ${existingUser.developerId ? html`Dev: <strong>${existingUser.developerId}</strong>` : nothing}
            ${existingUser.stakeholderId ? html`Stk: <strong>${existingUser.stakeholderId}</strong>` : nothing}
            — Select additional projects to assign.
          </div>
        ` : nothing}

        <div class="form-grid">
          <div class="form-group">
            <label for="userName">Name *</label>
            <input
              type="text"
              id="userName"
              .value=${this._formName}
              @input=${(e) => { this._formName = e.target.value; }}
              placeholder="Full name"
              ?disabled=${isEditing || this._onboardingActive}
              required
            />
          </div>
          <div class="form-group">
            <label for="userEmail">Email *</label>
            <input
              type="email"
              id="userEmail"
              .value=${this._formEmail}
              @input=${(e) => { this._formEmail = e.target.value; }}
              placeholder="email@example.com"
              ?disabled=${isEditing || this._onboardingActive}
              required
            />
          </div>
          <div class="form-group form-group-full">
            <label>Projects * (select one or more)</label>
            <multi-select
              .options=${this.projects
                .sort((a, b) => a.localeCompare(b))
                .map((p) => ({ value: p, label: p }))}
              .selectedValues=${this._formProjectIds}
              placeholder="Select projects..."
              ?disabled=${this._onboardingActive}
              @change=${(e) => { this._formProjectIds = [...e.detail.selectedValues]; }}
            ></multi-select>
          </div>
          <div class="form-row-checkboxes">
            <div class="form-checkbox">
              <input
                type="checkbox"
                id="userDeveloper"
                .checked=${this._formDeveloper}
                ?disabled=${this._onboardingActive}
                @change=${(e) => { this._formDeveloper = e.target.checked; }}
              />
              <label for="userDeveloper">Developer</label>
            </div>
            <div class="form-checkbox">
              <input
                type="checkbox"
                id="userStakeholder"
                .checked=${this._formStakeholder}
                ?disabled=${this._onboardingActive}
                @change=${(e) => { this._formStakeholder = e.target.checked; }}
              />
              <label for="userStakeholder">Stakeholder</label>
            </div>
          </div>
        </div>

        ${this._onboardingSteps.length > 0 ? this._renderOnboardingChecklist() : nothing}

        <div class="form-actions">
          <button class="btn btn-secondary" @click=${this._cancelForm} ?disabled=${this._onboardingActive}>Cancel</button>
          <button
            class="btn btn-primary"
            @click=${this._saveUser}
            ?disabled=${!this._formName.trim() || !this._formEmail.trim() || this._formProjectIds.length === 0 || this._onboardingActive}
          >
            ${this._onboardingActive ? 'Processing...' : (isEditing ? 'Add Projects' : 'Onboard User')}
          </button>
        </div>
      </div>
    `;
  }

  _renderOnboardingChecklist() {
    const statusIcon = (status) => {
      switch (status) {
        case 'done': return html`<span class="step-icon step-done">&#10003;</span>`;
        case 'running': return html`<span class="step-icon step-running"></span>`;
        case 'error': return html`<span class="step-icon step-error">&#10007;</span>`;
        default: return html`<span class="step-icon step-pending">&#9711;</span>`;
      }
    };

    return html`
      <div class="onboarding-checklist">
        <h5 class="checklist-title">Onboarding Progress</h5>
        <ul class="checklist">
          ${this._onboardingSteps.map((step) => html`
            <li class="checklist-item checklist-${step.status}">
              ${statusIcon(step.status)}
              <span>${step.label}</span>
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  _renderTable(filteredUsers) {
    if (filteredUsers.length === 0) {
      return html`<div class="empty-message">
        ${this._searchQuery.trim() ? 'No users match the search' : 'No users found'}
      </div>`;
    }

    return html`
      <div class="table-container">
        <table class="entity-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th class="col-id">Dev ID</th>
              <th class="col-id">Stk ID</th>
              <th class="col-projects">Projects</th>
              <th>Auth Status</th>
              <th class="col-lastlogin">Last Login</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredUsers.map((user) => this._renderUserRow(user))}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderUserRow(user) {
    const projectIds = user.projects ? Object.keys(user.projects) : [];
    const authStatus = user.authStatus || 'not_registered';

    return html`
      <tr>
        <td>${user.name || ''}</td>
        <td>${user.email || ''}</td>
        <td class="col-id">${user.developerId || '\u2014'}</td>
        <td class="col-id">${user.stakeholderId || '\u2014'}</td>
        <td class="col-projects">
          ${projectIds.length > 0
            ? html`
              <div class="project-badges">
                ${projectIds.map((pid) => html`
                  <span class="project-badge">
                    ${pid}
                    ${this._projectsWithApps.has(pid) ? html`
                      <button
                        class="perms-project"
                        title="App permissions for ${pid}"
                        @click=${() => this._openAppPermissions(user, pid)}
                      >&#9881;</button>
                    ` : nothing}
                    <button
                      class="remove-project"
                      title="Remove ${pid}"
                      @click=${() => this._removeProject(user, pid)}
                    >&times;</button>
                  </span>
                `)}
              </div>
            `
            : html`<span class="no-projects">No projects</span>`}
        </td>
        <td>
          <span
            class="badge ${this._getAuthStatusBadgeClass(authStatus)}"
            title="${this._getAuthStatusTitle(authStatus)}"
          >
            ${this._getAuthStatusLabel(authStatus)}
          </span>
        </td>
        <td class="col-lastlogin">
          <button
            class="btn-link"
            @click=${() => this._openLoginHistory(user)}
            title="View login history"
          >
            ${user.lastLoginAt ? this._formatLoginDate(user.lastLoginAt) : '\u2014'}
          </button>
        </td>
        <td class="col-actions">
          <div class="actions-cell">
            <button
              class="btn btn-secondary btn-sm"
              @click=${() => this._openEditForm(user)}
              title="Add project assignment"
            >+</button>
            <button
              class="btn btn-danger btn-icon btn-sm"
              @click=${() => this._deleteUser(user)}
              title="Delete user"
            >&times;</button>
          </div>
        </td>
      </tr>
    `;
  }
}

customElements.define('user-admin-panel', UserAdminPanel);

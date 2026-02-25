import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { FirebaseService } from '../services/firebase-service.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { encodeEmailForFirebase } from '../utils/email-sanitizer.js';
/**
 * Component for uploading documents and generating tasks/bugs using AI
 * Visible to superadmin, admins, developers and stakeholders
 * Uses the current project from adminproject page context
 *
 * Dark mode: This component does NOT include ThemeVariables in static styles.
 * CSS variables are inherited from :root where ThemeManagerService sets them.
 * Including ThemeVariables would re-declare primitives on :host, overriding
 * the dark theme values applied as inline styles on :root.
 */
export class AiDocumentUploader extends LitElement {
  static properties = {
    projectId: { type: String, attribute: 'project-id' },
    stakeholders: { type: Array },
    developers: { type: Array },
    sprints: { type: Array },
    generatedItems: { type: Array },
    existingEpics: { type: Array },
    loading: { type: Boolean },
    uploading: { type: Boolean },
    error: { type: String },
    success: { type: String },
    fileName: { type: String },
    selectedValidator: { type: String },
    selectedCoValidator: { type: String },
    selectedSprint: { type: String },
    selectedDeveloper: { type: String },
    isCurrentUserStakeholder: { type: Boolean },
    currentUserStakeholderName: { type: String },
    scoringSystem: { type: String },
    inputMode: { type: String },
    textInput: { type: String },
    savedPrompts: { type: Array },
    draftStatus: { type: String },
    showSavedPrompts: { type: Boolean },
    showSaveInput: { type: Boolean },
    savePromptName: { type: String }
  };

  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .header h3 {
      margin: 0;
      color: var(--text-primary);
    }

    .header p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.25rem;
      box-shadow: var(--card-shadow);
    }

    .config-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-group label {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .form-group select {
      padding: 0.6rem;
      border: 1px solid var(--input-border);
      border-radius: 8px;
      font-size: 0.9rem;
      background: var(--input-bg);
      color: var(--input-text);
    }

    .project-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--color-info-light);
      color: var(--color-info-dark);
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
    }

    /* Input mode toggle */
    .input-mode-toggle {
      display: flex;
      gap: 0;
      border: 1px solid var(--border-default);
      border-radius: 8px;
      overflow: hidden;
      width: fit-content;
    }

    .input-mode-toggle button {
      padding: 0.5rem 1rem;
      border: none;
      background: var(--bg-primary);
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .input-mode-toggle button:not(:last-child) {
      border-right: 1px solid var(--border-default);
    }

    .input-mode-toggle button.active {
      background: var(--brand-primary);
      color: var(--text-inverse);
    }

    .input-mode-toggle button:hover:not(.active) {
      background: var(--bg-secondary);
    }

    /* Text input area */
    .text-input-area {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .text-input-area textarea {
      width: 100%;
      min-height: 200px;
      padding: 1rem;
      border: 2px solid var(--border-subtle);
      border-radius: 12px;
      font-size: 0.9rem;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
      background: var(--input-bg);
      color: var(--input-text);
      transition: border-color 0.2s;
    }

    .text-input-area textarea:focus {
      outline: none;
      border-color: var(--brand-primary);
    }

    .text-input-area textarea::placeholder {
      color: var(--text-placeholder);
    }

    .text-input-hint {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .generate-btn-container {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.5rem;
    }

    .dropzone {
      border: 2px dashed var(--border-default);
      border-radius: 12px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--bg-subtle);
    }

    .dropzone:hover {
      border-color: var(--brand-primary);
      background: var(--color-info-light);
    }

    .dropzone.is-disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .dropzone input {
      display: none;
    }

    .dropzone-icon {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    .dropzone-title {
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 0.25rem;
    }

    .dropzone-subtitle {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin: 0;
    }

    .file-types {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      margin-top: 0.75rem;
    }

    .file-type-badge {
      background: var(--color-info-light);
      color: var(--color-info-dark);
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .loading-indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border-subtle);
      border-top-color: var(--brand-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .items-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .items-header h4 {
      margin: 0;
      color: var(--text-primary);
    }

    .items-count {
      display: flex;
      gap: 0.75rem;
    }

    .count-badge {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .count-badge.tasks {
      background: var(--color-info-light);
      color: var(--color-info-dark);
    }

    .count-badge.bugs {
      background: var(--color-error-light);
      color: var(--color-error-dark);
    }

    .count-badge.proposals {
      background: var(--color-warning-light);
      color: var(--color-warning-dark);
    }

    .item-card {
      background: var(--card-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 1rem;
      transition: box-shadow 0.2s;
    }

    .item-card:hover {
      box-shadow: var(--card-shadow-hover);
    }

    .item-card.task {
      border-left: 4px solid var(--brand-primary);
    }

    .item-card.bug {
      border-left: 4px solid var(--color-error);
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .item-type-badge {
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .item-type-badge.task {
      background: var(--color-info-light);
      color: var(--color-info-dark);
    }

    .item-type-badge.bug {
      background: var(--color-error-light);
      color: var(--color-error-dark);
    }

    .item-type-badge.proposal {
      background: var(--color-warning-light);
      color: var(--color-warning-dark);
    }

    .item-card.proposal {
      border-left: 4px solid var(--color-warning);
    }

    .item-actions {
      display: flex;
      gap: 0.5rem;
    }

    .item-actions button {
      background: none;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.35rem 0.6rem;
      cursor: pointer;
      font-size: 0.8rem;
      color: var(--text-primary);
      transition: all 0.2s;
    }

    .item-actions button:hover {
      background: var(--bg-secondary);
    }

    .item-actions button.delete:hover {
      background: var(--color-error-light);
      border-color: var(--color-error);
      color: var(--color-error-dark);
    }

    .item-field {
      margin-bottom: 0.75rem;
    }

    .item-field label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
      text-transform: uppercase;
    }

    .item-field input,
    .item-field textarea,
    .item-field select {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-size: 0.9rem;
      font-family: inherit;
      box-sizing: border-box;
      background: var(--input-bg);
      color: var(--input-text);
    }

    .item-field textarea {
      min-height: 80px;
      resize: vertical;
    }

    .item-field .epic-new {
      color: var(--color-success);
      font-style: italic;
    }

    .actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid var(--border-subtle);
    }

    .btn {
      padding: 0.65rem 1.5rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-primary {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
    }

    .btn-primary:hover {
      background: var(--btn-primary-hover-bg);
    }

    .btn-primary:disabled {
      background: var(--text-disabled);
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
    }

    .btn-secondary:hover {
      background: var(--bg-secondary);
    }

    .message {
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .message.error {
      background: var(--color-error-light);
      color: var(--color-error-dark);
      border: 1px solid var(--color-error);
    }

    .message.success {
      background: var(--color-success-light);
      color: var(--color-success-dark);
      border: 1px solid var(--color-success);
    }

    .no-project {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
    }

    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }

    .overlay-content {
      background: var(--card-bg);
      padding: 2rem 3rem;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      max-width: 400px;
    }

    .overlay-content .spinner {
      width: 50px;
      height: 50px;
      margin: 0 auto 1rem;
    }

    .overlay-content h4 {
      margin: 0 0 0.5rem;
      color: var(--text-primary);
      font-size: 1.1rem;
    }

    .overlay-content p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    /* Prompt toolbar */
    .prompt-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .prompt-toolbar-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .prompt-toolbar-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .draft-indicator {
      font-size: 0.8rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .draft-indicator.saved {
      color: var(--color-success);
    }

    .btn-icon {
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      background: var(--bg-primary);
      color: var(--text-secondary);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .btn-icon:hover {
      background: var(--bg-secondary);
      border-color: var(--border-default);
    }

    .btn-icon.active {
      background: var(--color-info-light);
      border-color: var(--brand-primary);
      color: var(--brand-primary);
    }

    .save-input-group {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .save-input-group select,
    .save-input-group input {
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--border-default);
      border-radius: 6px;
      font-size: 0.8rem;
      background: var(--input-bg);
      color: var(--input-text);
    }

    .save-input-group input {
      width: 160px;
    }

    .save-input-group select {
      max-width: 180px;
    }

    .save-input-group select:focus,
    .save-input-group input:focus {
      outline: none;
      border-color: var(--brand-primary);
    }

    .save-input-group .btn-icon {
      padding: 0.35rem 0.6rem;
    }

    /* Saved prompts panel */
    .saved-prompts-panel {
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 0.75rem;
      max-height: 300px;
      overflow-y: auto;
    }

    .saved-prompts-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .saved-prompts-header h5 {
      margin: 0;
      font-size: 0.85rem;
      color: var(--text-primary);
    }

    .saved-prompts-empty {
      text-align: center;
      padding: 1rem;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .saved-prompt-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.5rem;
      border-radius: 6px;
      transition: background 0.15s;
    }

    .saved-prompt-item:hover {
      background: var(--bg-secondary);
    }

    .saved-prompt-info {
      flex: 1;
      min-width: 0;
    }

    .saved-prompt-name {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .saved-prompt-name-input {
      font-size: 0.85rem;
      font-weight: 500;
      padding: 0.15rem 0.35rem;
      border: 1px solid var(--brand-primary);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--input-text);
      width: 100%;
      max-width: 250px;
    }

    .saved-prompt-date {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .saved-prompt-actions {
      display: flex;
      gap: 0.25rem;
      flex-shrink: 0;
      margin-left: 0.5rem;
    }

    .saved-prompt-actions button {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      background: var(--bg-primary);
      color: var(--text-secondary);
      transition: all 0.15s;
    }

    .saved-prompt-actions button:hover {
      background: var(--bg-secondary);
    }

    .saved-prompt-actions button.load:hover {
      background: var(--color-info-light);
      border-color: var(--brand-primary);
      color: var(--brand-primary);
    }

    .saved-prompt-actions button.delete:hover {
      background: var(--color-error-light);
      border-color: var(--color-error);
      color: var(--color-error-dark);
    }
  `;

  constructor() {
    super();
    this.projectId = '';
    this.stakeholders = [];
    this.developers = [];
    this.sprints = [];
    this.generatedItems = [];
    this.existingEpics = [];
    this.loading = false;
    this.uploading = false;
    this.error = '';
    this.success = '';
    this.fileName = '';
    this.selectedValidator = '';
    this.selectedCoValidator = '';
    this.selectedSprint = '';
    this.selectedDeveloper = '';
    this.isCurrentUserStakeholder = false;
    this.currentUserStakeholderName = '';
    this.scoringSystem = '1-5';
    this.inputMode = 'text';
    this.textInput = '';
    this.savedPrompts = [];
    this.draftStatus = '';
    this.showSavedPrompts = false;
    this.showSaveInput = false;
    this.savePromptName = '';
    this._draftTimer = null;
    this._saveTargetId = '';
    this._activePromptId = '';
    this._activePromptName = '';
    this._projectChangeHandler = this._handleProjectChange.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this._syncProjectId();
    this._checkIfCurrentUserIsStakeholder();
    document.addEventListener('project-change-reload', this._projectChangeHandler);
  }

  /**
   * Check if the current user is a stakeholder and set validator automatically
   */
  async _checkIfCurrentUserIsStakeholder() {
    const userEmail = (document.body.dataset.userEmail || '').toLowerCase().trim();
    if (!userEmail) return;

    try {
      await entityDirectoryService.init();
      const stakeholderId = entityDirectoryService.resolveStakeholderId(userEmail);

      if (stakeholderId) {
        // User is a stakeholder - auto-assign as validator regardless of being also a developer
        this.isCurrentUserStakeholder = true;
        this.currentUserStakeholderName = entityDirectoryService.getStakeholderDisplayName(stakeholderId) || userEmail;
        this.selectedValidator = stakeholderId;
      }
    } catch (error) {
      // Silently fail - user can still use the dropdown
    }
  }

  disconnectedCallback() {
    document.removeEventListener('project-change-reload', this._projectChangeHandler);
    if (this._draftTimer) clearTimeout(this._draftTimer);
    super.disconnectedCallback();
  }

  _handleProjectChange(event) {
    const newProjectId = event.detail?.newProjectId;
    if (newProjectId && newProjectId !== this.projectId) {
      this.projectId = newProjectId;
      this._clearAll();
      this._loadProjectData();
    }
  }

  _syncProjectId() {
    const derived =
      document.body?.dataset?.projectId ||
      window.currentProjectId ||
      this._getProjectFromUrl();
    if (derived && derived !== this.projectId) {
      this.projectId = derived;
      this._loadProjectData();
    }
  }

  /**
   * Load all project data (stakeholders, developers, sprints, scoring system)
   */
  async _loadProjectData() {
    this._loadStakeholders();
    this._loadDevelopers();
    this._loadSprints();
    this._loadProjectScoringSystem();
    this._loadDraft();
  }

  async _loadProjectScoringSystem() {
    if (!this.projectId) {
      this.scoringSystem = '1-5';
      return;
    }
    try {
      const projectRef = FirebaseService.getRef(`/projects/${this.projectId}`);
      const { get } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js');
      const snapshot = await get(projectRef);
      if (snapshot.exists()) {
        const projectData = snapshot.val();
        this.scoringSystem = projectData.scoringSystem || '1-5';
      } else {
        this.scoringSystem = '1-5';
      }
    } catch (error) {
      console.error('Error loading project scoring system:', error);
      this.scoringSystem = '1-5';
    }
  }

  _getProjectFromUrl() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('projectId') || '';
    } catch {
      return '';
    }
  }

  async _loadStakeholders() {
    if (!this.projectId) {
      this.stakeholders = [];
      return;
    }
    try {
      await entityDirectoryService.waitForInit();
      // Use entityDirectoryService to get stakeholders with correct IDs (stk_XXX)
      const stakeholdersData = await entityDirectoryService.getProjectStakeholders(this.projectId);
      if (stakeholdersData && Array.isArray(stakeholdersData)) {
        this.stakeholders = stakeholdersData
          .filter(s => s && s.id)
          .map(s => ({
            id: s.id, // stk_XXX format
            name: s.name || entityDirectoryService.getStakeholderDisplayName(s.id) || s.id,
            email: s.email || ''
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } else {
        this.stakeholders = [];
      }
    } catch (error) {
      console.error('Error loading stakeholders:', error);
      this.stakeholders = [];
    }
  }

  async _loadDevelopers() {
    if (!this.projectId) {
      this.developers = [];
      return;
    }
    try {
      await entityDirectoryService.waitForInit();
      const developersData = await entityDirectoryService.getProjectDevelopers(this.projectId);
      if (developersData && Array.isArray(developersData)) {
        this.developers = developersData
          .filter(d => d && d.id)
          .map(d => ({
            id: d.id, // dev_XXX format
            name: d.name || entityDirectoryService.getDeveloperDisplayName(d.id) || d.id
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } else {
        this.developers = [];
      }
    } catch (error) {
      console.error('Error loading developers:', error);
      this.developers = [];
    }
  }

  async _loadSprints() {
    if (!this.projectId) {
      this.sprints = [];
      return;
    }
    try {
      const sprintsData = await FirebaseService.getSprintList(this.projectId);
      const currentYear = new Date().getFullYear();
      if (sprintsData && typeof sprintsData === 'object') {
        this.sprints = Object.entries(sprintsData)
          .map(([id, sprint]) => ({
            id: sprint.cardId || id,
            name: sprint.title || sprint.cardId || id,
            year: sprint.year
          }))
          // Filter by current year
          .filter(s => !s.year || s.year === currentYear)
          .sort((a, b) => a.name.localeCompare(b.name));
      } else {
        this.sprints = [];
      }
    } catch (error) {
      console.error('Error loading sprints:', error);
      this.sprints = [];
    }
  }

  _setInputMode(mode) {
    this.inputMode = mode;
  }

  async _handleTextGenerate() {
    if (!this.textInput || this.textInput.trim().length < 10) {
      this.error = 'El texto debe tener al menos 10 caracteres.';
      return;
    }

    if (!this.projectId) {
      this.error = 'No hay proyecto seleccionado.';
      return;
    }

    this.error = '';
    this.success = '';
    this.generatedItems = [];
    this.loading = true;

    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const parseDocument = httpsCallable(functions, 'parseDocumentForCards');

      const result = await parseDocument({
        projectId: this.projectId,
        documentContent: this.textInput.trim(),
        fileName: 'text-input',
        scoringSystem: this.scoringSystem
      });

      if (result.data?.status === 'ok') {
        this.generatedItems = result.data.items.map((item, index) => ({
          ...item,
          id: `item-${index}`,
          selected: true
        }));
        this.existingEpics = result.data.existingEpics || [];
        this.success = `Se generaron ${this.generatedItems.length} items del texto.`;
      } else {
        throw new Error('No se pudieron generar items del texto.');
      }
    } catch (error) {
      console.error('Error processing text:', error);
      this.error = error.message || 'Error al procesar el texto.';
    } finally {
      this.loading = false;
    }
  }

  async _handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.error = '';
    this.success = '';
    this.generatedItems = [];
    this.fileName = file.name;

    if (!this.projectId) {
      this.error = 'No hay proyecto seleccionado.';
      return;
    }

    // Check file type
    const allowedTypes = ['.txt', '.md', '.pdf', '.doc', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      this.error = `Tipo de archivo no soportado. Usa: ${allowedTypes.join(', ')}`;
      return;
    }

    this.loading = true;

    try {
      let textContent = '';

      if (fileExtension === '.txt' || fileExtension === '.md') {
        textContent = await file.text();
      } else if (fileExtension === '.pdf') {
        textContent = await this._extractPdfText(file);
      } else if (fileExtension === '.doc' || fileExtension === '.docx') {
        textContent = await this._extractWordText(file);
      }

      if (!textContent || textContent.trim().length < 10) {
        throw new Error('El documento está vacío o no se pudo extraer el texto.');
      }

      // Call Cloud Function
      const functions = getFunctions(undefined, 'europe-west1');
      const parseDocument = httpsCallable(functions, 'parseDocumentForCards');

      const result = await parseDocument({
        projectId: this.projectId,
        documentContent: textContent,
        fileName: file.name,
        scoringSystem: this.scoringSystem
      });

      if (result.data?.status === 'ok') {
        this.generatedItems = result.data.items.map((item, index) => ({
          ...item,
          id: `item-${index}`,
          selected: true
        }));
        this.existingEpics = result.data.existingEpics || [];
        this.success = `Se generaron ${this.generatedItems.length} items del documento.`;
      } else {
        throw new Error('No se pudieron generar items del documento.');
      }
    } catch (error) {
      console.error('Error processing document:', error);
      this.error = error.message || 'Error al procesar el documento.';
    } finally {
      this.loading = false;
      event.target.value = '';
    }
  }

  async _extractPdfText(file) {
    // Load PDF.js dynamically
    if (!window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  }

  async _extractWordText(file) {
    // Load mammoth.js dynamically
    if (!window.mammoth) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  _handleItemChange(itemId, field, value) {
    this.generatedItems = this.generatedItems.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    );
  }

  _removeItem(itemId) {
    this.generatedItems = this.generatedItems.filter(item => item.id !== itemId);
  }

  _toggleItemType(itemId) {
    const typeOrder = ['task', 'bug', 'proposal'];
    this.generatedItems = this.generatedItems.map(item => {
      if (item.id !== itemId) return item;
      const currentIndex = typeOrder.indexOf(item.type);
      const nextIndex = (currentIndex + 1) % typeOrder.length;
      return { ...item, type: typeOrder[nextIndex] };
    });
  }

  _getNextTypeName(currentType) {
    const typeNames = { task: 'Bug', bug: 'Proposal', proposal: 'Task' };
    return typeNames[currentType] || 'Task';
  }

  _getTypeBadgeLabel(type) {
    const labels = { task: 'TASK', bug: 'BUG', proposal: 'PROPOSAL' };
    return labels[type] || 'TASK';
  }

  /**
   * Get business points options based on project scoring system
   * @returns {Array<{value: number, label: string}>} Options for the select
   */
  _getBusinessPointsOptions() {
    if (this.scoringSystem === 'fibonacci') {
      return [
        { value: 1, label: '1 - Muy bajo' },
        { value: 2, label: '2 - Bajo' },
        { value: 3, label: '3 - Medio' },
        { value: 5, label: '5 - Alto' },
        { value: 8, label: '8 - Muy alto' },
        { value: 13, label: '13 - Crítico' }
      ];
    }
    // Default 1-5 scale
    return [
      { value: 1, label: '1 - Muy bajo' },
      { value: 2, label: '2 - Bajo' },
      { value: 3, label: '3 - Medio' },
      { value: 4, label: '4 - Alto' },
      { value: 5, label: '5 - Crítico' }
    ];
  }

  async _createAllCards() {
    if (!this.projectId || this.generatedItems.length === 0) return;

    this.uploading = true;
    this.error = '';
    this.success = '';

    let createdCards = 0;
    let createdEpics = 0;
    let failed = 0;

    try {
      // Step 1: Identify and create new epics first
      const newEpicNames = new Set();
      const existingEpicTitles = new Set(this.existingEpics.map(e => e.title));

      for (const item of this.generatedItems) {
        if (item.epic && item.epicSuggested && !existingEpicTitles.has(item.epic)) {
          newEpicNames.add(item.epic);
        }
      }

      // Create the new epics
      for (const epicName of newEpicNames) {
        try {
          const epicData = {
            title: epicName,
            description: `Épica generada automáticamente desde documento: ${this.fileName || 'sin nombre'}`,
            projectId: this.projectId,
            cardType: 'epic-card',
            group: 'epics',
            section: 'epics',
            year: new Date().getFullYear(),
            status: 'Active'
          };

          await FirebaseService.saveCard(epicData, { silent: true });
          createdEpics++;
          // Add to existing epics so we don't try to create it again
          existingEpicTitles.add(epicName);
        } catch (error) {
          console.error('Error creating epic:', epicName, error);
          // Continue with cards even if epic creation fails
        }
      }

      // Step 2: Create all the cards
      for (const item of this.generatedItems) {
        try {
          const cardData = {
            title: item.title,
            projectId: this.projectId,
            epic: item.epic || '',
            validator: this.selectedValidator,
            coValidator: this.selectedCoValidator,
            sprint: this.selectedSprint || '',
            developer: this.selectedDeveloper || '',
            year: new Date().getFullYear()
          };

          if (item.type === 'task') {
            cardData.cardType = 'task-card';
            cardData.group = 'tasks';
            cardData.section = 'tasks';
            cardData.status = 'To Do';
            // Tasks use businessPoints for priority (1-5 or Fibonacci based on project scoringSystem)
            // businessPoints represents business value/importance from stakeholder perspective
            cardData.businessPoints = item.businessPoints || 3; // Default to medium (3)
            // Tasks use descriptionStructured with role/goal/benefit format
            cardData.descriptionStructured = [{
              role: item.como || '',
              goal: item.quiero || '',
              benefit: item.para || '',
              legacy: ''
            }];
          } else if (item.type === 'bug') {
            cardData.cardType = 'bug-card';
            cardData.group = 'bugs';
            cardData.section = 'bugs';
            cardData.status = 'Created';
            cardData.priority = item.priority || 'User Experience Issue';
            cardData.description = item.description || '';
          } else if (item.type === 'proposal') {
            cardData.cardType = 'proposal-card';
            cardData.group = 'proposals';
            cardData.section = 'proposals';
            // Proposals use descriptionStructured with role/goal/benefit format
            cardData.descriptionStructured = [{
              role: item.como || '',
              goal: item.quiero || '',
              benefit: item.para || '',
              legacy: ''
            }];
          }

          await FirebaseService.saveCard(cardData, { silent: true });
          createdCards++;
        } catch (error) {
          console.error('Error creating card:', error);
          failed++;
        }
      }

      if (createdCards > 0 || createdEpics > 0) {
        let message = '';
        if (createdEpics > 0) {
          message += `Se crearon ${createdEpics} épicas nuevas. `;
        }
        message += `Se crearon ${createdCards} cards correctamente.`;
        if (failed > 0) {
          message += ` ${failed} fallaron.`;
        }
        this.success = message;
        this.generatedItems = [];
        this.fileName = '';

        // Show slide notification
        this._showNotification(message, 'success');

        // Dispatch event to refresh the cards view
        this.dispatchEvent(new CustomEvent('cards-created', {
          bubbles: true,
          composed: true,
          detail: { projectId: this.projectId, count: createdCards, epicsCount: createdEpics }
        }));
      } else {
        this.error = 'No se pudo crear ninguna card.';
      }
    } catch (error) {
      this.error = error.message || 'Error al crear las cards.';
    } finally {
      this.uploading = false;
    }
  }

  _clearAll() {
    this.generatedItems = [];
    this.fileName = '';
    this.textInput = '';
    this.error = '';
    this.success = '';
    this.existingEpics = [];
    this.showSavedPrompts = false;
    this.showSaveInput = false;
    this._clearDraft();
  }

  // === Prompt Persistence Methods ===

  _getUserEmail() {
    return (document.body.dataset.userEmail || '').toLowerCase().trim();
  }

  _getUserPromptsPath() {
    const email = this._getUserEmail();
    if (!email || !this.projectId) return '';
    const encodedEmail = encodeEmailForFirebase(email);
    return `/data/userPrompts/${encodedEmail}/${this.projectId}`;
  }

  async _getDbModule() {
    if (!this._dbModule) {
      this._dbModule = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js');
    }
    return this._dbModule;
  }

  _scheduleDraftSave() {
    if (this._draftTimer) clearTimeout(this._draftTimer);
    this.draftStatus = '';
    this._draftTimer = setTimeout(() => this._saveDraft(), 2000);
  }

  async _saveDraft() {
    const path = this._getUserPromptsPath();
    if (!path || !this.textInput.trim()) {
      this.draftStatus = '';
      return;
    }

    this.draftStatus = 'saving';
    try {
      const { set } = await this._getDbModule();
      const draftRef = FirebaseService.getRef(`${path}/draft`);
      await set(draftRef, {
        content: this.textInput,
        updatedAt: new Date().toISOString()
      });
      this.draftStatus = 'saved';
    } catch (error) {
      console.error('Error saving draft:', error);
      this.draftStatus = '';
    }
  }

  async _loadDraft() {
    const path = this._getUserPromptsPath();
    if (!path) return;

    try {
      const { get } = await this._getDbModule();
      const draftRef = FirebaseService.getRef(`${path}/draft`);
      const snapshot = await get(draftRef);
      if (snapshot.exists()) {
        const draft = snapshot.val();
        if (draft.content) {
          this.textInput = draft.content;
          this.draftStatus = 'saved';
        }
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  }

  async _clearDraft() {
    const path = this._getUserPromptsPath();
    if (!path) return;

    try {
      const { set } = await this._getDbModule();
      const draftRef = FirebaseService.getRef(`${path}/draft`);
      await set(draftRef, null);
      this.draftStatus = '';
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }

  async _toggleSaveInput() {
    this.showSaveInput = !this.showSaveInput;
    if (this.showSaveInput) {
      this.savePromptName = '';
      this._saveTargetId = this._activePromptId || '';
      await this._loadSavedPrompts();
      this.updateComplete.then(() => {
        if (!this._saveTargetId) {
          const input = this.shadowRoot.querySelector('.save-input-group input');
          if (input) input.focus();
        }
      });
    }
  }

  _onSaveTargetChange(e) {
    this._saveTargetId = e.target.value;
    this.requestUpdate();
    if (!this._saveTargetId) {
      this.updateComplete.then(() => {
        const input = this.shadowRoot.querySelector('.save-input-group input');
        if (input) input.focus();
      });
    }
  }

  async _handleSavePrompt() {
    if (!this.textInput.trim()) return;

    const path = this._getUserPromptsPath();
    if (!path) return;

    const isOverwrite = !!this._saveTargetId;
    const existingPrompt = isOverwrite
      ? this.savedPrompts.find(p => p.id === this._saveTargetId)
      : null;

    if (!isOverwrite) {
      const name = this.savePromptName.trim();
      if (!name) return;
    }

    try {
      if (isOverwrite && existingPrompt) {
        const { update } = await this._getDbModule();
        const promptRef = FirebaseService.getRef(`${path}/saved/${this._saveTargetId}`);
        await update(promptRef, {
          content: this.textInput,
          updatedAt: new Date().toISOString()
        });

        this._activePromptId = this._saveTargetId;
        this._activePromptName = existingPrompt.name;
        this.showSaveInput = false;
        this._showNotification(`Prompt "${existingPrompt.name}" actualizado`, 'success');
      } else {
        const name = this.savePromptName.trim();
        const { push, set } = await this._getDbModule();
        const savedRef = FirebaseService.getRef(`${path}/saved`);
        const newRef = push(savedRef);
        await set(newRef, {
          name,
          content: this.textInput,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        this._activePromptId = newRef.key;
        this._activePromptName = name;
        this.showSaveInput = false;
        this.savePromptName = '';
        this._showNotification(`Prompt "${name}" guardado`, 'success');
      }

      if (this.showSavedPrompts) {
        this._loadSavedPrompts();
      }
    } catch (error) {
      console.error('Error saving prompt:', error);
      this._showNotification('Error al guardar el prompt', 'error');
    }
  }

  _handleSaveKeydown(e) {
    if (e.key === 'Enter') {
      this._handleSavePrompt();
    } else if (e.key === 'Escape') {
      this.showSaveInput = false;
    }
  }

  async _toggleSavedPrompts() {
    this.showSavedPrompts = !this.showSavedPrompts;
    if (this.showSavedPrompts) {
      await this._loadSavedPrompts();
    }
  }

  async _loadSavedPrompts() {
    const path = this._getUserPromptsPath();
    if (!path) {
      this.savedPrompts = [];
      return;
    }

    try {
      const { get } = await this._getDbModule();
      const savedRef = FirebaseService.getRef(`${path}/saved`);
      const snapshot = await get(savedRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        this.savedPrompts = Object.entries(data)
          .map(([id, prompt]) => ({ id, ...prompt }))
          .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
      } else {
        this.savedPrompts = [];
      }
    } catch (error) {
      console.error('Error loading saved prompts:', error);
      this.savedPrompts = [];
    }
  }

  _loadPrompt(prompt) {
    this.textInput = prompt.content;
    this._activePromptId = prompt.id;
    this._activePromptName = prompt.name;
    this.showSavedPrompts = false;
    this._scheduleDraftSave();
  }

  async _deletePrompt(promptId) {
    const path = this._getUserPromptsPath();
    if (!path) return;

    try {
      const { set } = await this._getDbModule();
      const promptRef = FirebaseService.getRef(`${path}/saved/${promptId}`);
      await set(promptRef, null);
      this.savedPrompts = this.savedPrompts.filter(p => p.id !== promptId);
      this._showNotification('Prompt eliminado', 'info');
    } catch (error) {
      console.error('Error deleting prompt:', error);
      this._showNotification('Error al eliminar el prompt', 'error');
    }
  }

  async _renamePrompt(promptId, newName) {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const path = this._getUserPromptsPath();
    if (!path) return;

    try {
      const { update } = await this._getDbModule();
      const promptRef = FirebaseService.getRef(`${path}/saved/${promptId}`);
      await update(promptRef, {
        name: trimmed,
        updatedAt: new Date().toISOString()
      });
      this.savedPrompts = this.savedPrompts.map(p =>
        p.id === promptId ? { ...p, name: trimmed } : p
      );
    } catch (error) {
      console.error('Error renaming prompt:', error);
    }
  }

  _handleRenameBlur(e, promptId) {
    const newName = e.target.value.trim();
    if (newName) {
      this._renamePrompt(promptId, newName);
    }
    this._editingPromptId = null;
    this.requestUpdate();
  }

  _handleRenameKeydown(e, promptId) {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      this._editingPromptId = null;
      this.requestUpdate();
    }
  }

  _startRename(promptId) {
    this._editingPromptId = promptId;
    this.requestUpdate();
    this.updateComplete.then(() => {
      const input = this.shadowRoot.querySelector('.saved-prompt-name-input');
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  _formatPromptDate(isoDate) {
    if (!isoDate) return '';
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diff = now - date;
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return 'Ahora mismo';
      if (minutes < 60) return `Hace ${minutes} min`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `Hace ${hours}h`;
      const days = Math.floor(hours / 24);
      if (days === 1) return 'Ayer';
      if (days < 7) return `Hace ${days} días`;
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  _showNotification(message, type = 'success') {
    const notification = document.createElement('slide-notification');
    notification.message = message;
    notification.type = type;
    document.body.appendChild(notification);
  }

  render() {
    if (!this.projectId) {
      return html`
        <div class="container">
          <div class="no-project">
            <p>Selecciona un proyecto en el selector superior para comenzar.</p>
          </div>
        </div>
      `;
    }

    const taskCount = this.generatedItems.filter(i => i.type === 'task').length;
    const bugCount = this.generatedItems.filter(i => i.type === 'bug').length;
    const proposalCount = this.generatedItems.filter(i => i.type === 'proposal').length;
    const canCreate = this.generatedItems.length > 0 && !this.uploading;

    return html`
      <div class="container">
        <div class="header">
          <h3>Tasks Generator</h3>
          <p>Escribe texto o sube un documento y la IA extraerá las tareas y bugs necesarios.</p>
        </div>

        ${this.error ? html`<div class="message error">${this.error}</div>` : null}
        ${this.success ? html`<div class="message success">${this.success}</div>` : null}

        <div class="card">
          <div class="config-section">
            <div class="form-group">
              <label>Proyecto</label>
              <div class="project-badge">
                📁 ${this.projectId}
              </div>
            </div>

            <div class="form-group">
              <label>Quien lo solicita (Validator)</label>
              ${this.isCurrentUserStakeholder ? html`
                <div class="project-badge">
                  👤 ${this.currentUserStakeholderName}
                </div>
              ` : html`
                <select
                  @change=${e => this.selectedValidator = e.target.value}
                  .value=${this.selectedValidator}
                  ?disabled=${this.loading || this.uploading}
                >
                  <option value="">Selecciona validator</option>
                  ${this.stakeholders.map(s => html`
                    <option value=${s.id}>${s.name}</option>
                  `)}
                </select>
              `}
            </div>

            <div class="form-group">
              <label>Co-Validator (opcional)</label>
              <select
                @change=${e => this.selectedCoValidator = e.target.value}
                .value=${this.selectedCoValidator}
                ?disabled=${this.loading || this.uploading}
              >
                <option value="">Ninguno</option>
                ${this.stakeholders
                  .filter(s => s.id !== this.selectedValidator)
                  .map(s => html`
                    <option value=${s.id}>${s.name}</option>
                  `)}
              </select>
            </div>

            <div class="form-group">
              <label>Sprint (opcional)</label>
              <select
                @change=${e => this.selectedSprint = e.target.value}
                .value=${this.selectedSprint}
                ?disabled=${this.loading || this.uploading}
              >
                <option value="">Sin sprint</option>
                ${this.sprints.map(s => html`
                  <option value=${s.id}>${s.name}</option>
                `)}
              </select>
            </div>

            <div class="form-group">
              <label>Developer (opcional)</label>
              <select
                @change=${e => this.selectedDeveloper = e.target.value}
                .value=${this.selectedDeveloper}
                ?disabled=${this.loading || this.uploading}
              >
                <option value="">Sin asignar</option>
                ${this.developers.map(d => html`
                  <option value=${d.id}>${d.name}</option>
                `)}
              </select>
            </div>
          </div>
        </div>

        ${!this.loading ? html`
          <div class="input-mode-toggle">
            <button
              class=${this.inputMode === 'text' ? 'active' : ''}
              @click=${() => this._setInputMode('text')}
            >Escribir texto</button>
            <button
              class=${this.inputMode === 'document' ? 'active' : ''}
              @click=${() => this._setInputMode('document')}
            >Subir documento</button>
          </div>

          ${this.inputMode === 'text' ? html`
            <div class="text-input-area">
              <textarea
                .value=${this.textInput}
                @input=${e => { this.textInput = e.target.value; this._scheduleDraftSave(); }}
                placeholder="Describe las funcionalidades, requisitos o problemas que quieres convertir en tareas y bugs. Cuanto más detalle incluyas, mejores serán los resultados..."
                ?disabled=${this.uploading}
              ></textarea>
              <div class="prompt-toolbar">
                <div class="prompt-toolbar-left">
                  <span class="text-input-hint">${this.textInput.length} caracteres</span>
                  ${this.draftStatus === 'saving' ? html`
                    <span class="draft-indicator">Guardando...</span>
                  ` : this.draftStatus === 'saved' ? html`
                    <span class="draft-indicator saved">Borrador guardado</span>
                  ` : null}
                </div>
                <div class="prompt-toolbar-right">
                  ${this.showSaveInput ? html`
                    <div class="save-input-group">
                      ${this.savedPrompts.length > 0 ? html`
                        <select @change=${e => this._onSaveTargetChange(e)}
                          .value=${this._saveTargetId}>
                          <option value="">Nuevo prompt...</option>
                          ${this.savedPrompts.map(p => html`
                            <option value=${p.id} ?selected=${p.id === this._saveTargetId}>${p.name}</option>
                          `)}
                        </select>
                      ` : null}
                      ${!this._saveTargetId ? html`
                        <input
                          type="text"
                          placeholder="Nombre del prompt..."
                          .value=${this.savePromptName}
                          @input=${e => { this.savePromptName = e.target.value; }}
                          @keydown=${e => this._handleSaveKeydown(e)}
                        />
                      ` : null}
                      <button class="btn-icon" @click=${this._handleSavePrompt}
                        ?disabled=${!this.textInput.trim() || (!this._saveTargetId && !this.savePromptName.trim())}>
                        ${this._saveTargetId ? 'Sobrescribir' : 'Guardar'}
                      </button>
                      <button class="btn-icon" @click=${() => { this.showSaveInput = false; }}>
                        ✕
                      </button>
                    </div>
                  ` : html`
                    <button class="btn-icon" @click=${this._toggleSaveInput}
                      ?disabled=${!this.textInput.trim()}>
                      Guardar prompt
                    </button>
                  `}
                  <button class="btn-icon ${this.showSavedPrompts ? 'active' : ''}"
                    @click=${this._toggleSavedPrompts}>
                    Prompts${this.showSavedPrompts && this.savedPrompts.length > 0
                      ? ` (${this.savedPrompts.length})` : ''}
                  </button>
                </div>
              </div>
              ${this.showSavedPrompts ? html`
                <div class="saved-prompts-panel">
                  <div class="saved-prompts-header">
                    <h5>Prompts guardados</h5>
                    <button class="btn-icon" @click=${() => { this.showSavedPrompts = false; }}>✕</button>
                  </div>
                  ${this.savedPrompts.length === 0 ? html`
                    <div class="saved-prompts-empty">No hay prompts guardados para este proyecto.</div>
                  ` : this.savedPrompts.map(prompt => html`
                    <div class="saved-prompt-item">
                      <div class="saved-prompt-info">
                        ${this._editingPromptId === prompt.id ? html`
                          <input class="saved-prompt-name-input"
                            type="text"
                            .value=${prompt.name}
                            @blur=${e => this._handleRenameBlur(e, prompt.id)}
                            @keydown=${e => this._handleRenameKeydown(e, prompt.id)}
                          />
                        ` : html`
                          <div class="saved-prompt-name"
                            @dblclick=${() => this._startRename(prompt.id)}
                            title="Doble clic para renombrar">${prompt.name}</div>
                        `}
                        <div class="saved-prompt-date">${this._formatPromptDate(prompt.updatedAt || prompt.createdAt)}</div>
                      </div>
                      <div class="saved-prompt-actions">
                        <button class="load" @click=${() => this._loadPrompt(prompt)}>Cargar</button>
                        <button class="delete" @click=${() => this._deletePrompt(prompt.id)}>Eliminar</button>
                      </div>
                    </div>
                  `)}
                </div>
              ` : null}
              <div class="generate-btn-container">
                <button
                  class="btn btn-primary"
                  @click=${this._handleTextGenerate}
                  ?disabled=${this.uploading || this.textInput.trim().length < 10}
                >Generar tareas</button>
              </div>
            </div>
          ` : html`
            <label class="dropzone">
              <input
                type="file"
                accept=".txt,.md,.pdf,.doc,.docx"
                @change=${this._handleFileChange}
                ?disabled=${this.loading || this.uploading}
              />
              <div class="dropzone-icon">📄</div>
              <p class="dropzone-title">
                ${this.fileName || 'Haz clic o arrastra tu documento'}
              </p>
              <p class="dropzone-subtitle">
                La IA analizará el contenido y generará tareas y bugs automáticamente.
              </p>
              <div class="file-types">
                <span class="file-type-badge">TXT</span>
                <span class="file-type-badge">MD</span>
                <span class="file-type-badge">PDF</span>
                <span class="file-type-badge">DOCX</span>
              </div>
            </label>
          `}
        ` : null}

        ${this.generatedItems.length > 0 ? html`
          <div class="card items-list">
            <div class="items-header">
              <h4>Items generados</h4>
              <div class="items-count">
                ${taskCount > 0 ? html`
                  <span class="count-badge tasks">${taskCount} Tasks</span>
                ` : null}
                ${bugCount > 0 ? html`
                  <span class="count-badge bugs">${bugCount} Bugs</span>
                ` : null}
                ${proposalCount > 0 ? html`
                  <span class="count-badge proposals">${proposalCount} Proposals</span>
                ` : null}
              </div>
            </div>

            ${this.generatedItems.map(item => html`
              <div class="item-card ${item.type}">
                <div class="item-header">
                  <span class="item-type-badge ${item.type}">
                    ${this._getTypeBadgeLabel(item.type)}
                  </span>
                  <div class="item-actions">
                    <button @click=${() => this._toggleItemType(item.id)} title="Cambiar tipo">
                      ↔ ${this._getNextTypeName(item.type)}
                    </button>
                    <button class="delete" @click=${() => this._removeItem(item.id)} title="Eliminar">
                      ✕
                    </button>
                  </div>
                </div>

                <div class="item-field">
                  <label>Título</label>
                  <input
                    type="text"
                    .value=${item.title}
                    @input=${e => this._handleItemChange(item.id, 'title', e.target.value)}
                  />
                </div>

                ${item.type === 'bug' ? html`
                  <div class="item-field">
                    <label>Descripción</label>
                    <textarea
                      .value=${item.description || ''}
                      @input=${e => this._handleItemChange(item.id, 'description', e.target.value)}
                    ></textarea>
                  </div>
                ` : html`
                  <div class="item-field">
                    <label>Como (rol de usuario)</label>
                    <input
                      type="text"
                      .value=${item.como || ''}
                      @input=${e => this._handleItemChange(item.id, 'como', e.target.value)}
                      placeholder="usuario registrado, administrador..."
                    />
                  </div>
                  <div class="item-field">
                    <label>Quiero (acción)</label>
                    <textarea
                      .value=${item.quiero || ''}
                      @input=${e => this._handleItemChange(item.id, 'quiero', e.target.value)}
                      placeholder="poder hacer..."
                    ></textarea>
                  </div>
                  <div class="item-field">
                    <label>Para (beneficio)</label>
                    <input
                      type="text"
                      .value=${item.para || ''}
                      @input=${e => this._handleItemChange(item.id, 'para', e.target.value)}
                      placeholder="conseguir..."
                    />
                  </div>
                `}

                ${item.type === 'bug' ? html`
                  <div class="item-field">
                    <label>Prioridad</label>
                    <select
                      .value=${item.priority || 'User Experience Issue'}
                      @change=${e => this._handleItemChange(item.id, 'priority', e.target.value)}
                    >
                      <option value="Application Blocker">Application Blocker</option>
                      <option value="Department Blocker">DEPARTMENT BLOCKER</option>
                      <option value="Individual Blocker">INDIVIDUAL BLOCKER</option>
                      <option value="User Experience Issue">User Experience Issue</option>
                      <option value="Workflow Improvement">WORKFLOW IMPROVEMENT</option>
                      <option value="Workaround Available Issue">WORKAROUND AVAILABLE ISSUE</option>
                    </select>
                  </div>
                ` : html`
                  <div class="item-field">
                    <label>Business Points (Valor de negocio)</label>
                    <select
                      .value=${String(item.businessPoints || 3)}
                      @change=${e => this._handleItemChange(item.id, 'businessPoints', parseInt(e.target.value, 10))}
                    >
                      ${this._getBusinessPointsOptions().map(opt => html`
                        <option value=${opt.value} ?selected=${opt.value === (item.businessPoints || 3)}>${opt.label}</option>
                      `)}
                    </select>
                  </div>
                `}

                <div class="item-field">
                  <label>
                    Épica
                    ${item.epicSuggested ? html`<span class="epic-new">(nueva sugerida)</span>` : ''}
                  </label>
                  <select
                    .value=${item.epic}
                    @change=${e => this._handleItemChange(item.id, 'epic', e.target.value)}
                  >
                    <option value="">Sin épica</option>
                    ${this.existingEpics.map(e => html`
                      <option value=${e.title} ?selected=${e.title === item.epic}>${e.title}</option>
                    `)}
                    ${item.epicSuggested && item.epic && !this.existingEpics.find(e => e.title === item.epic) ? html`
                      <option value=${item.epic} selected>${item.epic} (nueva)</option>
                    ` : null}
                  </select>
                </div>
              </div>
            `)}

            <div class="actions-bar">
              <button class="btn btn-secondary" @click=${this._clearAll}>
                Limpiar todo
              </button>
              <button
                class="btn btn-primary"
                @click=${this._createAllCards}
                ?disabled=${!canCreate}
              >
                ${this.uploading ? 'Creando...' : `Crear ${this.generatedItems.length} Cards`}
              </button>
            </div>
          </div>
        ` : null}
      </div>

      ${this.loading ? html`
        <div class="overlay">
          <div class="overlay-content">
            <div class="spinner"></div>
            <h4>Analizando ${this.inputMode === 'text' ? 'texto' : 'documento'} con IA...</h4>
            <p>Este proceso puede durar varios minutos</p>
          </div>
        </div>
      ` : null}

      ${this.uploading ? html`
        <div class="overlay">
          <div class="overlay-content">
            <div class="spinner"></div>
            <h4>Creando cards...</h4>
            <p>Guardando ${this.generatedItems.length} elementos en Firebase</p>
          </div>
        </div>
      ` : null}
    `;
  }
}

customElements.define('ai-document-uploader', AiDocumentUploader);

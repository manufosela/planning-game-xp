import { html, css, unsafeCSS } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { BaseCard } from './base-card.js';
import { NotesManagerMixin } from '../mixins/notes-manager-mixin.js';
import { CommitsDisplayMixin } from '../mixins/commits-display-mixin.js';
import { AiUsageDisplayMixin } from '../mixins/ai-usage-display-mixin.js';
import { format, parse, isValid } from 'https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm';
import { TaskCardStyles } from './task-card-styles.js';
import { NotesStyles } from '../ui/styles/notes-styles.js';
import { CommitsListStyles } from './commits-list-styles.js';
import { AiUsageStyles } from './ai-usage-styles.js';
import { ref, onValue, get, set as dbSet, database, auth, firebaseConfig, functions, httpsCallable } from '../../firebase-config.js';
import { KANBAN_STATUS_COLORS_CSS } from '../config/theme-config.js';
import { permissionService } from '../services/permission-service.js';
import { normalizeDeveloperEntries, normalizeDeveloperEntry, getDeveloperKey } from '../utils/developer-normalizer.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { userDirectoryService } from '../services/user-directory-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { isCurrentUserSuperAdmin } from '../utils/super-admin-check.js';
import { openScenarioModal } from '../utils/scenario-modal.js';
import { getPriorityDisplay } from '../utils/priority-utils.js';
import { stateTransitionService } from '../services/state-transition-service.js';
import { TASK_SCHEMA } from '../schemas/card-field-schemas.js';
import { generateTimestamp, extractDateTimeLocal } from '../utils/timestamp-utils.js';
import { demoModeService } from '../services/demo-mode-service.js';
import './FirebaseStorageUploader.js';
import 'https://cdn.jsdelivr.net/npm/@manufosela/loading-layer@2.0.1/+esm';

export class TaskCard extends AiUsageDisplayMixin(CommitsDisplayMixin(NotesManagerMixin(BaseCard))) {
  static PLAN_STATUS_CONFIG = {
    pending:     { label: 'Plan',       color: '#6b7280', textColor: '#fff' },
    proposed:    { label: 'Plan: Prop', color: '#3b82f6', textColor: '#fff' },
    validated:   { label: 'Plan: Val',  color: '#8b5cf6', textColor: '#fff' },
    in_progress: { label: 'Plan: WIP',  color: '#f59e0b', textColor: '#000' },
    completed:   { label: 'Plan: OK',   color: '#10b981', textColor: '#fff' }
  };

  // Static cache for project stakeholders to avoid redundant Firebase calls
  static _stakeholderCache = new Map();
  static _loadingPromises = new Map();
  static _cacheTimeout = 5 * 60 * 1000; // 5 minutes
  static _lastCleanup = Date.now();

  static get properties() {
    return {
      ...super.properties,
      // TaskCard specific properties
      acceptanceCriteria: { type: String },
      descriptionStructured: { type: Array },
      acceptanceCriteriaStructured: { type: Array },
      businessPoints: { type: Number },
      devPoints: { type: Number },
      startDate: { type: String },
      endDate: { type: String },
      validatedAt: { type: String },
      reopenCount: { type: Number },
      reopenCycles: { type: Array },
      sprint: {
        type: String,
        reflect: true,
        hasChanged(newVal, oldVal) {
          return newVal !== oldVal;
        }
      },
      spike: { type: Boolean },
      expedited: { type: Boolean },
      status: { type: String },
      statusList: { type: Array },
      developer: { type: String },
      coDeveloper: { type: String },
      epic: { type: String },
      validator: { type: String },
      coValidator: { type: String },
      blockedByBusiness: { type: Boolean },
      blockedByDevelopment: { type: Boolean },
      bbbWhy: { type: String },
      bbbWho: { type: String },
      bbdWhy: { type: String },
      bbdWho: { type: String },
      // Note: userEmail property removed - it was a legacy field from Firebase
      // that contaminated current user detection. Use _getCurrentUserEmail() instead.
      isEditable: { type: Boolean },
      expanded: { type: Boolean, reflect: true },
      globalSprintList: { type: Object },
      group: { type: String },
      projectId: { type: String },
      projectStakeholders: { type: Array },
      stakeholders: { type: Array },
      developers: { type: Array },
      developerName: { type: String },
      attachment: { type: String },
      relatedTasks: { type: Array },
      implementationPlan: { type: Object },
      implementationNotes: { type: String },
      projectScoringSystem: { type: String },
      invalidFields: { type: Array },
      isSuperAdmin: { type: Boolean },
      // Tab activo
      activeTab: { type: String },
      // Repository label (para proyectos con múltiples repos)
      repositoryLabel: { type: String },
      projectRepositories: { type: Array },
      // Year for filtering tasks by year
      year: { type: Number },
      // Warning when projectId doesn't match URL
      _projectIdMismatch: { type: Boolean, state: true },
      // Converting legacy description to user story
      _isConvertingDescription: { type: Boolean, state: true },
      // Time tracking for Pausado status
      timeLog: { type: Array },
      totalElapsedTime: { type: Number },
      effectiveWorkTime: { type: Number },
      totalPausedTime: { type: Number }
    };
  }

  static get styles() {
    return [
      TaskCardStyles,
      NotesStyles,
      CommitsListStyles,
      AiUsageStyles,
      css`${unsafeCSS(KANBAN_STATUS_COLORS_CSS)}`,
      css`
        .copy-link-button {
          background: transparent;
          border: none;
          box-shadow: none;
          color: inherit;
          font-size: 1.3em;
          cursor: pointer;
          padding: 0 0.2em;
          margin-right: 0.2em;
          transition: background 0.2s;
        }
        .copy-link-button:focus {
          outline: 2px solid var(--brand-primary, #6366f1);
        }
        .copy-link-button:hover {
          background: rgba(0,0,0,0.05);
        }

        .ia-link-button {
          background: transparent;
          border: none;
          box-shadow: none;
          color: inherit;
          font-size: 0.95em;
          cursor: pointer;
          padding: 0 0.35em;
          margin-left: 0.3em;
          transition: background 0.2s;
        }
        .ia-link-button:hover {
          background: rgba(0,0,0,0.05);
        }

        .expanded-footer.ia-footer {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .footer-left,
        .footer-right {
          display: flex;
          align-items: center;
        }

        .footer-right {
          justify-content: flex-start;
          gap: 0.35rem;
        }

        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.8rem;
          height: 1.8rem;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
        }

        .icon-btn:hover {
          background: rgba(0,0,0,0.08);
          border-radius: 4px;
        }

        .save-button {
          margin: 0 auto;
          display: inline-block;
        }

        /* Ensure text is visible in color-tabs panels */
        .description-panel,
        .acceptance-criteria-panel,
        .notes-panel,
        .attachment-panel,
        .related-tasks-panel,
        .history-panel {
          color: var(--text-primary, #333);
        }

        .attachment-section {
          padding: 1rem;
          border: 1px solid var(--border-default, #e0e0e0);
          border-radius: 4px;
          background: var(--bg-secondary, #f9f9f9);
        }

        .attachment-section label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: var(--text-primary, #333);
        }

        firebase-storage-uploader {
          display: inline-block;
          width: auto;
        }
        
        .invalid-field {
          border: 2px solid #f43f5e !important;
          box-shadow: 0 0 0 0.25rem rgba(255, 68, 68, 0.3) !important;
          background-color: rgba(255, 68, 68, 0.05) !important;
        }
        
        .invalid-field:focus {
          border-color: #f43f5e !important;
          box-shadow: 0 0 0 0.25rem rgba(255, 68, 68, 0.5) !important;
          background-color: rgba(255, 68, 68, 0.08) !important;
        }

        .tab-button.invalid-field {
          border: 2px solid #f43f5e !important;
          color: #f43f5e !important;
          background-color: rgba(255, 68, 68, 0.08) !important;
        }

        .structured-description input,
        .structured-description textarea,
        .scenario-block input,
        .scenario-block textarea {
          width: 100%;
          margin-bottom: 0.5rem;
          padding: 0.5rem;
          border: 1px solid var(--border-default, #ccc);
          border-radius: 4px;
        }

        .structured-description label,
        .scenario-block label {
          font-weight: 600;
          margin-bottom: 0.25rem;
          display: block;
          color: var(--text-primary, #333);
          text-align: left;
        }

        .scenario-block {
          border: 1px solid var(--border-default, #e0e0e0);
          padding: 0.75rem;
          border-radius: 6px;
          margin-bottom: 0.75rem;
          background: var(--bg-secondary, #f9f9f9);
        }

        .scenario-title {
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .scenario-actions {
          margin-top: 0.5rem;
        }

        .legacy-description textarea {
          width: 100%;
          min-height: 80px;
          resize: vertical;
        }

        .legacy-description label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .convert-ia-btn {
          width: 2rem;
          height: 1rem;
          background: rgba(230, 0, 126, 0.5);
          border: none;
          padding: 0;
          font-size: 0.6rem;
          font-weight: bold;
          color: #000;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-shadow: 1px 0px #FFF;
        }

        .convert-ia-btn:hover:not(.disabled) {
          background: rgba(230, 0, 126, 1);
          color: var(--text-inverse, white);
          text-shadow: 1px 0px #000;
        }

        .convert-ia-btn.disabled {
          cursor: wait;
          opacity: 0.6;
        }

        .improve-ia-button {
          margin-top: 0.75rem;
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, var(--brand-primary, #6366f1) 0%, var(--brand-primary-strong, #4f46e5) 100%);
          border: none;
          border-radius: 6px;
          color: var(--text-inverse, white);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .improve-ia-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .improve-ia-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .improve-ia-button:disabled,
        .improve-ia-button.disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .secondary-button.danger {
          color: var(--color-error, #f43f5e);
          border-color: var(--color-error, #f43f5e);
        }

        .scenario-table-wrapper {
          margin-top: 0.5rem;
        }

        .scenario-table {
          width: 100%;
          border-collapse: collapse;
        }

        .scenario-table th,
        .scenario-table td {
          border: 1px solid var(--border-default, #e0e0e0);
          padding: 0.2rem 0.3rem;
          vertical-align: middle;
          line-height: 1.2;
          color: var(--text-primary, #333);
        }

        .scenario-table th {
          background: var(--bg-secondary, #f8f9fa);
        }

        .scenario-table .ellipsis {
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .scenario-table td.actions {
          width: 70px;
          display: flex;
          gap: 0.25rem;
          justify-content: flex-start;
          align-items: center;
        }

        .scenario-table th.actions-col {
          width: 70px;
          text-align: left;
        }

        .icon-button {
          border: 1px solid var(--border-default, #ccc);
          background: var(--bg-primary, #fff);
          padding: 0.1rem 0.25rem;
          border-radius: 4px;
          cursor: pointer;
          line-height: 1;
          margin: 0 !important;
        }

        .icon-button.danger {
          border-color: var(--color-error, #f43f5e);
          color: var(--color-error, #f43f5e);
        }
        
        .attachment-indicator {
          font-size: 1.2em;
          margin-right: 0.3em;
          color: var(--brand-primary, #6366f1);
          cursor: help;
        }
        
        .related-tasks-section {
          padding: 1rem;
          border: 1px solid var(--border-default, #e0e0e0);
          border-radius: 4px;
          background: var(--bg-secondary, #f9f9f9);
        }
        
        .related-tasks-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .related-tasks-header label {
          font-weight: 500;
          color: var(--text-primary, #333);
        }
        
        .add-related-task-btn {
          background: var(--brand-primary, #6366f1);
          color: var(--text-inverse, white);
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          font-size: 0.9em;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .add-related-task-btn:hover {
          background: var(--brand-primary-strong, #4f46e5);
        }
        
        .related-tasks-list {
          max-height: 200px;
          overflow-y: auto;
        }
        
        .related-task-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem;
          margin-bottom: 0.5rem;
          background: var(--bg-primary, white);
          border: 1px solid var(--border-default, #ddd);
          border-radius: 4px;
        }
        
        .related-task-link {
          cursor: pointer;
          color: var(--brand-primary, #6366f1);
          text-decoration: underline;
          flex: 1;
        }
        
        .related-task-link:hover {
          color: var(--brand-primary-strong, #4f46e5);
        }
        
        .remove-related-task-btn {
          background: none;
          border: none;
          color: var(--color-error, #f43f5e);
          font-size: 1.1em;
          cursor: pointer;
          padding: 0.2rem 0.5rem;
          border-radius: 50%;
          transition: background 0.2s;
        }
        
        .remove-related-task-btn:hover {
          background: var(--color-error-bg, #ffeaea);
        }
        
        .no-related-tasks {
          text-align: center;
          color: var(--text-secondary, #666);
          font-style: italic;
          padding: 1rem;
        }
        
        .related-tasks-indicator {
          font-size: 1.2em;
          margin-right: 0.3em;
          color: var(--color-success, #10b981);
          cursor: help;
        }
      `
    ];
  }

  constructor() {
    super();
    this.id = '';
    this.cardId = 0;
    this.title = '';
    this.description = '';
    this.businessPoints = 0;
    this.devPoints = 0;
    this.statusList = ['No Status Loaded'];
    this.status = 'To Do'; // Estado por defecto para nuevas tareas
    this.sprint = '';
    this.epicList = ['No Epics Loaded'];
    this.epic = '';
    this.developerList = ['No developers loaded'];
    // Legacy support - will be migrated
    this.developer = '';
    this.coDeveloper = '';
    this.developerName = '';
    this.previousDeveloper = ''; // Track previous developer for notifications
    this.stakeholders = [];
    this.developers = [];
    this.validator = '';
    this.coValidator = '';
    this.previousValidator = ''; // Track previous validator for notifications
    this.developerHistory = [];
    this.originalStatus = '';
    this.startDate = '';
    this.endDate = '';
    this.notes = '';
    this.acceptanceCriteria = '';
    this.descriptionStructured = [{ role: '', goal: '', benefit: '', legacy: '' }];
    this.acceptanceCriteriaStructured = [];
    this.blockedByBusiness = false;
    this.blockedByDevelopment = false;
    this.bbbWhy = '';
    this.bbdWhy = '';
    this.bbbWho = '';
    this.bbdWho = '';
    this.blockedHistory = [];
    this.user = null;
    // userEmail removed - use _getCurrentUserEmail() getter instead
    this.createdBy = '';
    this.group = null;
    this.section = null;
    this.projectId = null;
    this.projectStakeholders = [];
    this.projectScoringSystem = '1-5'; // Default scoring system
    this.acceptanceCriteriaStructured = [];
    this.spike = false;
    this.expedited = false;
    this.isEditable = true;
    this.isSuperAdmin = false;
    this.selected = false;
    this.expanded = false;
    this._reopenCyclesExpanded = false;
    this.globalSprintList = {};
    this._originalTitle = '';
    this.attachment = '';
    this.relatedTasks = []; // Array de objetos {id: string, title: string}

    this.implementationPlan = null;
    this.implementationNotes = '';

    this.activeTab = 'description';
    this.cardType = this.tagName.toLowerCase();

    // Repository label (para proyectos con múltiples repos)
    this.repositoryLabel = '';
    this.projectRepositories = []; // Array de {url, label} del proyecto

    // Year for filtering - default to selected year or current year
    this.year = this._getSelectedYear();

    // Initialize permissions version for caching
    this._permissionsVersion = 0;

    // State for converting legacy description
    this._isConvertingDescription = false;

    // Migrar datos antiguos de relatedTasks si es necesario
    this._migrateRelatedTasksData();

    this.showDeleteModal = this.showDeleteModal.bind(this);
    this._confirmDelete = this._confirmDelete.bind(this);
    this._handleSprintChange = this._handleSprintChange.bind(this);
    this._handleAttachmentUploaded = this._handleAttachmentUploaded.bind(this);
    this._handleAttachmentDeleted = this._handleAttachmentDeleted.bind(this);
    this._handleAddRelatedTask = this._handleAddRelatedTask.bind(this);
    this._handleRemoveRelatedTask = this._handleRemoveRelatedTask.bind(this);
    this._handleRelatedTaskClick = this._handleRelatedTaskClick.bind(this);

  }

  /**
   * Get the current user's email from the application context.
   * This replaces the legacy userEmail property that was being contaminated by Firebase data.
   * @returns {string} The current user's email or empty string
   */
  _getCurrentUserEmail() {
    return document.body.dataset.userEmail || globalThis.currentUser?.email || auth?.currentUser?.email || '';
  }

  requestUpdate(name, oldValue, options) {
    // Si se está expandiendo la card, pedir permisos después del render
    if (name === 'expanded' && this.expanded && !oldValue) {
      this.updateComplete.then(() => this._requestPermissions());

      // Emitir evento genérico de expansión
      document.dispatchEvent(new CustomEvent('card-expanded', {
        bubbles: true,
        composed: true,
        detail: {
          tagName: this.tagName.toLowerCase(),
          cardId: this.cardId,
          elementId: this.id
        }
      }));
    }

    return super.requestUpdate(name, oldValue, options);
  }

  /**
   * Solicita permisos específicos para esta TaskCard
   */
  _requestPermissions() {
// Emitir evento solicitando permisos específicos para esta task
    const permissionRequest = new CustomEvent('request-task-permissions', {
      detail: {
        cardId: this.cardId,
        cardType: 'task-card',
        userEmail: this._getCurrentUserEmail(),
        createdBy: this.createdBy,
        callback: (permissions) => {
this.canEditPermission = permissions.canEdit || false;
          this.requestUpdate();
        }
      },
      bubbles: true
    });

    document.dispatchEvent(permissionRequest);
  }

  connectedCallback() {
    super.connectedCallback();
    this.originalStatus = this.status;
    this._resolveSuperAdmin();

    // Si la card se conecta como expandida, pedir permisos inmediatamente
    if (this.expanded) {
      this._requestPermissions();
      // Inicializar la pestaña por defecto (wait for color-tabs to be upgraded)
      customElements.whenDefined('color-tabs').then(() => {
        if (this.shadowRoot) {
          this._setActiveTab(this.activeTab || 'description');
        }
      });
    }
    this._previousState = {};
    const declaredProps = Object.keys(this.constructor.properties || {});
    for (const key of declaredProps) {
      this._previousState[key] = this[key];
    }

    // Escuchar cambios de permisos cuando cambia el modo de vista
    this._handlePermissionsUpdated = () => {
      this._loadPermissions();
    };
    document.addEventListener('permissions-updated', this._handlePermissionsUpdated);

    // Initialize DOM element cache
    this._cachedElements = new Map();

    // Periodic cache cleanup
    TaskCard._cleanupCacheIfNeeded();

    // Initialize previousDeveloper with current developer value
    if (this.developer && !this.previousDeveloper) {
      this.previousDeveloper = this.developer;
    }

    // Cargar épicas y stakeholders del proyecto cuando el componente se conecta
    if (this.projectId) {
      this._loadEpics();
      this._loadProjectStakeholders();
    } else {
      // Para nuevas tareas, obtener el projectId del contexto global
      this._attemptToLoadProjectFromContext();
    }

    // Escuchar el evento de respuesta para todos los datos de la tarjeta
    this._onProvideTaskCardData = (e) => {
      if (e.detail?.cardId === this.cardId && e.detail?.cardType === 'task-card') {

        // Solo usar developerList global si no tenemos datos específicos del proyecto
        if (!this.developers || this.developers.length === 0) {
          const normalizedDevelopers = this._normalizeContactEntries(e.detail.developerList || [], { normalizeDevelopers: true });
          this.developerList = normalizedDevelopers;
          this.developers = normalizedDevelopers;
        }

        // Solo usar stakeholders globales si no tenemos datos específicos del proyecto
        if (!this.projectStakeholders || this.projectStakeholders.length === 0) {
          this.stakeholders = Array.isArray(e.detail.stakeholders) ? e.detail.stakeholders : [];
        }
        this.sprintList = e.detail.sprintList || {};
        // Asegurar que statusList siempre sea un array
        let statusListReceived = e.detail.statusList || this.statusList;
        if (Array.isArray(statusListReceived)) {
          this.statusList = statusListReceived;
        } else if (typeof statusListReceived === 'object' && statusListReceived !== null) {
          this.statusList = Object.keys(statusListReceived);
        } else {
          this.statusList = [];
        }

        this.epicList = e.detail.epicList || this.epicList;
// Fallback si statusList está vacío
        if (!this.statusList || this.statusList.length === 0) {
const fallbackStatusList = window.statusTasksList || {};
          this.statusList = Object.keys(fallbackStatusList);
}
        if (!this.statusListArray.includes(this.status)) {
          this.status = this.statusListArray.find(s => s.toLowerCase() === 'to do') || this.statusListArray[0] || 'To Do';
        }

        // Initialize previousDeveloper with current developer if not already set
        if (!this.previousDeveloper && this.developer) {
          this.previousDeveloper = this.developer;
        }

        // No cargar mappings globales - usar solo datos del proyecto

        this.requestUpdate();
      }
    };
    document.addEventListener('provide-taskcard-data', this._onProvideTaskCardData);
    document.addEventListener('add-reciprocal-relation', this._handleAddReciprocalRelation);
    document.addEventListener('remove-reciprocal-relation', this._handleRemoveReciprocalRelation);

    // Escuchar cambios de permisos cuando cambia el modo de vista
    this._handlePermissionsUpdated = () => {
      this._permissionsVersion = (this._permissionsVersion || 0) + 1;
      this.requestUpdate();
    };
    document.addEventListener('permissions-updated', this._handlePermissionsUpdated);

    // Escuchar eventos de guardado exitoso para actualizar UI
    this._handleCardSavedSuccessfully = (e) => {
      if (e.detail.cardId === this.cardId) {
        this._refreshRelatedTasksUI();
        // Forzar re-render para actualizar badge y otros elementos
        this.requestUpdate();
      }
    };
    document.addEventListener('card-saved-successfully', this._handleCardSavedSuccessfully);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('provide-taskcard-data', this._onProvideTaskCardData);
    document.removeEventListener('add-reciprocal-relation', this._handleAddReciprocalRelation);
    document.removeEventListener('remove-reciprocal-relation', this._handleRemoveReciprocalRelation);
    document.removeEventListener('permissions-updated', this._handlePermissionsUpdated);
    document.removeEventListener('card-saved-successfully', this._handleCardSavedSuccessfully);

    // Clear cached DOM references
    this._cachedElements = null;
  }

  // Performance optimization: shouldUpdate implementation
  shouldUpdate(changedProperties) {
    // Only update if critical properties changed
    const criticalProps = [
      'title', 'status', 'developer', 'expanded', 'businessPoints', 'devPoints', 'sprint', 'epic',
      'description', 'descriptionStructured', 'acceptanceCriteria', 'acceptanceCriteriaStructured', 'canEditPermission', 'isEditable',
      'projectStakeholders', 'stakeholders', 'validator', 'startDate', 'endDate',
      'spike', 'expedited', 'blockedByBusiness', 'blockedByDevelopment', 'group', 'projectId', 'createdBy', 'notes',
      'relatedTasks', 'repositoryLabel', 'projectRepositories'
    ];
    return Array.from(changedProperties.keys()).some(prop => criticalProps.includes(prop));
  }

  // Static method to cleanup old cache entries
  static _cleanupCacheIfNeeded() {
    const now = Date.now();
    if (now - TaskCard._lastCleanup > TaskCard._cacheTimeout) {
      TaskCard._cleanupCache();
      TaskCard._lastCleanup = now;
    }
  }

  static _cleanupCache() {
    const now = Date.now();
    for (const [key, data] of TaskCard._stakeholderCache.entries()) {
      if (data.timestamp && (now - data.timestamp) > TaskCard._cacheTimeout) {
        TaskCard._stakeholderCache.delete(key);
      }
    }
    // Clear old loading promises
    TaskCard._loadingPromises.clear();
  }

  /**
   * Limpia manualmente la caché para forzar recarga de datos
   * @param {string} projectId - ID del proyecto (opcional, si no se especifica limpia toda la caché)
   */
  static clearCache(projectId = null) {
    if (projectId) {
      TaskCard._stakeholderCache.delete(projectId);
      TaskCard._loadingPromises.delete(projectId);
} else {
      TaskCard._stakeholderCache.clear();
      TaskCard._loadingPromises.clear();
}
  }

  // Performance optimization: cached DOM element getter
  _getCachedElement(selector) {
    if (!this._cachedElements) {
      this._cachedElements = new Map();
    }

    if (!this._cachedElements.has(selector)) {
      const element = this.shadowRoot?.querySelector(selector);
      if (element) {
        this._cachedElements.set(selector, element);
      }
    }

    return this._cachedElements.get(selector);
  }

  // Performance optimization: debounced input handler
  _createDebouncedHandler(handler, delay = 300) {
    let timeoutId;
    return (event) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handler.call(this, event);
      }, delay);
    };
  }

  // Performance optimization: requestIdleCallback for non-critical updates
  _scheduleNonCriticalUpdate(callback) {
    if (window.requestIdleCallback) {
      requestIdleCallback(() => {
        callback.call(this);
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        callback.call(this);
      }, 16);
    }
  }

  /**
   * Cuando la tarjeta se expande, solicita todos los datos necesarios.
   */
  updated(changedProperties) {
    // Call parent but skip its initial state capture - we'll do it ourselves after hydration
    const wasExpanded = changedProperties.has('expanded') && this.expanded;

    // Temporarily set _initialState to prevent BaseCard from capturing
    const hadInitialState = this._initialState;
    if (wasExpanded && !hadInitialState) {
      this._initialState = 'pending'; // Prevent BaseCard from capturing
    }

    super.updated(changedProperties);

    if (wasExpanded) {
      /**
       * Evento para solicitar todos los datos de la tarjeta.
       * @event request-taskcard-data
       * @property {string} cardId - El id de la tarjeta que solicita los datos
       * @property {string} cardType - El tipo de componente que solicita los datos
       */
      document.dispatchEvent(new CustomEvent('request-taskcard-data', {
        detail: { cardId: this.cardId, cardType: 'task-card' },
        bubbles: true,
        composed: true
      }));

      // Validate projectId matches URL
      this._validateProjectIdMatch();
    }
    if (changedProperties.has('projectId')) {
      this._loadEpics();
      this._loadProjectStakeholders();
      if (this.group) {
        this.group = this.group.replace(/_.*$/, `_${this.projectId}`);
      }
      if (this.section) {
        this.section = this.section.replace(/_.*$/, `_${this.projectId}`);
      }
      // Only use window.globalSprintList if this.globalSprintList is not already set
      // (e.g., when opening from backlog, globalSprintList is pre-loaded for the specific project)
      if (!this.globalSprintList || Object.keys(this.globalSprintList).length === 0) {
        this.globalSprintList = window.globalSprintList || {};
      }
    }
    if (changedProperties.has('sprint')) {
      this.requestUpdate();
    }

    if (changedProperties.has('developer')) {
      this._normalizeDeveloperField();
    }
    if (changedProperties.has('developers') && this.developer) {
      this._normalizeDeveloperField();
    }

    if (changedProperties.has('description') && !this._hasStructuredDescriptionData()) {
      this._hydrateStructuredDescription();
    }

    if (changedProperties.has('acceptanceCriteria') && (!this.acceptanceCriteriaStructured || this.acceptanceCriteriaStructured.length === 0)) {
      this._hydrateStructuredAcceptance();
    }

    // Capture initial state AFTER all hydration is complete
    if (wasExpanded && !hadInitialState) {
      // Use requestAnimationFrame + setTimeout to ensure all updates are complete
      requestAnimationFrame(() => {
        setTimeout(() => {
          this._initialState = null; // Reset the pending flag
          this.captureInitialState();
        }, 50);
      });
    }
  }

  /**
   * Carga las épicas del proyecto desde la base de datos
   * @private
   */
  async _loadEpics() {
    try {
      const epicsRef = ref(database, `/cards/${this.projectId}/EPICS_${this.projectId}`);
      onValue(epicsRef, (snapshot) => {
        const epicsData = snapshot.val() || {};
        const allEpics = Object.entries(epicsData).map(this._mapEpicData.bind(this));
        // Filter epics by year
        let filteredEpics = this._filterEpicsByYear(allEpics);

        // Ensure current epic is included even if filtered out (to not lose reference)
        if (this.selectedEpicId) {
          const currentEpicInList = filteredEpics.find(e => e.id === this.selectedEpicId);
          if (!currentEpicInList) {
            const currentEpic = allEpics.find(e => e.id === this.selectedEpicId);
            if (currentEpic) {
              filteredEpics = [...filteredEpics, { ...currentEpic, name: `${currentEpic.name} (otro año)` }];
            }
          }
        }

        // Add "Sin épica" option at the beginning
        this.epicList = [{ id: '', name: 'Sin épica' }, ...filteredEpics];
        this.requestUpdate('epic');
      }, (error) => {
this.epicList = [{ id: '', name: 'Error al cargar épicas' }];
        this.requestUpdate('epic');
      });
    } catch (error) {
this.epicList = [{ id: '', name: 'Error al cargar épicas' }];
      this.requestUpdate('epic');
    }
  }

  /**
   * Carga el mapeo de nombres de desarrolladores a emails desde Firebase
   * @private
   */
  // Función eliminada - no usar mappings globales

  /**
   * Carga el mapeo de nombres de stakeholders a emails desde Firebase
   * @private
   */
  // Función eliminada - no usar mappings globales

  /**
   * Intenta obtener el projectId desde el contexto global para nuevas tareas
   * @private
   */
  _attemptToLoadProjectFromContext() {
    // Intentar obtener projectId de diferentes fuentes
    let contextProjectId = null;

    // 1. Desde globalThis.currentProject
    if (globalThis.currentProject) {
      contextProjectId = globalThis.currentProject;
    }

    // 1.1 Desde globalThis.currentProjectId
    if (!contextProjectId && globalThis.currentProjectId) {
      contextProjectId = globalThis.currentProjectId;
    }

    // 2. Desde la URL
    if (!contextProjectId) {
      const urlParams = new URLSearchParams(window.location.search);
      contextProjectId = urlParams.get('projectId') || urlParams.get('project');
    }

    // 3. Desde el dataset del body
    if (!contextProjectId) {
      contextProjectId = document.body.dataset.projectId || document.body.dataset.currentProject;
    }

    // 4. Desde localStorage
    if (!contextProjectId) {
      contextProjectId = localStorage.getItem('currentProject');
    }

    if (contextProjectId) {
      this.projectId = contextProjectId;
      this._loadEpics();
      this._loadProjectStakeholders();
    }
  }

  /**
   * Validates that the task's projectId matches the current URL projectId.
   * Shows a warning if there's a mismatch (indicates data inconsistency).
   * @private
   */
  _validateProjectIdMatch() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlProjectId = urlParams.get('projectId') || urlParams.get('project') || window.currentProjectId;

    // Show project badge when viewing task from different project (e.g., in WIP/Backlog)
    this._projectIdMismatch = !!(urlProjectId && this.projectId && urlProjectId !== this.projectId);
  }

  /**
   * Carga los stakeholders del proyecto usando caché estático para evitar llamadas redundantes.
   * @private
   */
  async _loadProjectStakeholders() {
    try {
      if (!this.projectId) {
return;
      }
// Check if project data is already cached
      if (TaskCard._stakeholderCache.has(this.projectId)) {
        const projectData = TaskCard._stakeholderCache.get(this.projectId);
        this.stakeholders = projectData.stakeholders;
        this.projectStakeholders = projectData.stakeholders || [];
        this.developers = projectData.developers || [];
        this._normalizeDeveloperField();
        this.projectScoringSystem = projectData.scoringSystem || '1-5';
        this.projectRepositories = projectData.repositories || [];
        this.requestUpdate();
        return;
      }

      // Check if a loading promise already exists for this project
      if (TaskCard._loadingPromises.has(this.projectId)) {
        const projectData = await TaskCard._loadingPromises.get(this.projectId);
        this.stakeholders = projectData.stakeholders;
        this.projectStakeholders = projectData.stakeholders || [];
        this.developers = projectData.developers || [];
        this._normalizeDeveloperField();
        this.projectScoringSystem = projectData.scoringSystem || '1-5';
        this.projectRepositories = projectData.repositories || [];
        this.requestUpdate();
        return;
      }

      // Create and cache the loading promise
      const loadingPromise = this._fetchProjectData();
      TaskCard._loadingPromises.set(this.projectId, loadingPromise);

      try {
        const projectData = await loadingPromise;
        this.stakeholders = projectData.stakeholders;
        this.projectStakeholders = projectData.stakeholders || [];
        this.developers = projectData.developers || [];
        this._normalizeDeveloperField();
        this.projectScoringSystem = projectData.scoringSystem || '1-5';
        this.projectRepositories = projectData.repositories || [];
// Cache the result
        TaskCard._stakeholderCache.set(this.projectId, projectData);
        this.requestUpdate();
      } finally {
        // Remove the loading promise once completed
        TaskCard._loadingPromises.delete(this.projectId);
      }
    } catch (error) {
this.stakeholders = [];
      this.projectStakeholders = [];
      this.developers = [];
      this.projectRepositories = [];
      TaskCard._loadingPromises.delete(this.projectId);
    }
  }

  /**
   * Fetches project data including stakeholders and developers from Firebase (used by the caching mechanism).
   * @private
   */
  async _fetchProjectData() {
    const projectRef = ref(database, `/projects/${this.projectId}`);

    try {
      // Use entityDirectoryService for developers and stakeholders with proper IDs
      await entityDirectoryService.waitForInit();

      const [projectSnapshot, projectDevelopers, projectStakeholders] = await Promise.all([
        get(projectRef),
        entityDirectoryService.getProjectDevelopers(this.projectId),
        entityDirectoryService.getProjectStakeholders(this.projectId)
      ]);

      // Convert to expected format
      let developers = projectDevelopers.map(dev => ({
        id: dev.id,
        name: dev.name,
        email: dev.email
      }));

      let stakeholders = projectStakeholders.map(stk => ({
        id: stk.id,
        name: stk.name,
        email: stk.email
      }));

      // Get scoring system and repositories from project
      let scoringSystem = '1-5';
      let repositories = [];
      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        scoringSystem = projectData.scoringSystem || '1-5';

        // Extract repositories: string (1 repo) or array (multiple)
        const repoUrl = projectData.repoUrl;
        if (Array.isArray(repoUrl) && repoUrl.length > 1) {
          repositories = repoUrl; // [{url, label}, ...]
        }
      }

      // Warn if entityDirectoryService returned empty — data in /users/ may need sync
      if (developers.length === 0) {
        console.warn(`[TaskCard] No developers found for project "${this.projectId}". Run sync-users-project-roles.js to fix /users/ data.`);
      }
      if (stakeholders.length === 0) {
        console.warn(`[TaskCard] No stakeholders found for project "${this.projectId}". Run sync-users-project-roles.js to fix /users/ data.`);
      }

      return { stakeholders, developers, scoringSystem, repositories };
    } catch (error) {
return { stakeholders: [], developers: [], scoringSystem: '1-5', repositories: [] };
    }
  }

  /**
   * Resolve entity ID (dev_/stk_) to display name
   */
  _resolveEntityDisplay(ref) {
    if (ref.startsWith('dev_')) {
      const dev = entityDirectoryService.getDeveloper(ref);
      if (dev?.name) return dev.name;
      if (dev?.email) return dev.email.split('@')[0];
    }
    if (ref.startsWith('stk_')) {
      const stk = entityDirectoryService.getStakeholder(ref);
      if (stk?.name) return stk.name;
      if (stk?.email) return stk.email.split('@')[0];
    }
    return null;
  }

  /**
   * Resolve ref from contact list
   */
  _resolveFromContactList(ref, contacts) {
    const normalized = this._normalizeContactEntries(contacts || [], {
      normalizeDevelopers: contacts === this.developers
    });
    const found = normalized.find(contact =>
      (contact.id && contact.id === ref) ||
      (contact.email && contact.email.toLowerCase() === ref.toLowerCase())
    );
    return found?.name || null;
  }

  _getContactDisplayName(idOrEmail, contacts) {
    if (!idOrEmail) return '';

    const ref = idOrEmail.toString().trim();

    // Try entity ID resolution
    const entityResult = this._resolveEntityDisplay(ref);
    if (entityResult) return entityResult;

    // Try directory service
    try {
      const fromDirectory = userDirectoryService.resolveDisplayName(ref);
      if (fromDirectory) return fromDirectory;
    } catch {
      // ignore if fails
    }

    // Try contact list
    const fromContacts = this._resolveFromContactList(ref, contacts);
    if (fromContacts) return fromContacts;

    // Extract email username if applicable
    if (typeof ref === 'string' && ref.includes('@')) {
      return ref.split('@')[0];
    }

    return String(ref);
  }

  /**
   * Get developer display text for readonly view
   */
  _getDeveloperDisplayText() {
    if (!this.developer || APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer)) {
      return APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES;
    }
    return this._getContactDisplayName(this.developer, this.developers);
  }

  /**
   * Get co-developer display text for readonly view
   */
  _getCoDeveloperDisplayText() {
    if (!this.coDeveloper) return 'Sin CoDev';
    return this._getContactDisplayName(this.coDeveloper, this.developers);
  }

  /**
   * Check if task status is not done&validated
   */
  _isNotDone() {
    return (this.status || '').toLowerCase() !== 'done&validated';
  }

  /**
   * Check if task status is Blocked
   */
  _isStatusBlocked() {
    return (this.status || '').toLowerCase() === 'blocked';
  }

  /**
   * Check if project has IA enabled
   */
  _projectHasIa() {
    const project = globalThis.projects?.[this.projectId];
    return project?.useIa === true || project?.iaEnabled === true;
  }

  /**
   * Genera un color basado en el hash de un string (para badges de repo)
   * @param {string} label - Etiqueta del repositorio
   * @returns {string} Color en formato HSL
   */
  _getRepoColor(label) {
    if (!label) return 'hsl(0, 0%, 60%)';
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 45%)`;
  }

  /**
   * Obtiene la etiqueta de repo efectiva (la asignada o la por defecto)
   * @returns {string} Etiqueta del repositorio
   */
  _getEffectiveRepoLabel() {
    if (this.repositoryLabel) return this.repositoryLabel;
    if (this.projectRepositories.length > 0) return this.projectRepositories[0]?.label || '';
    return '';
  }

  /**
   * Renderiza el badge de repositorio si hay múltiples repos
   * @returns {TemplateResult|string} Badge HTML o string vacío
   */
  _renderRepoBadge() {
if (this.projectRepositories.length < 2) return '';
    const label = this._getEffectiveRepoLabel();
    if (!label) return '';
    const color = this._getRepoColor(label);
    return html`<span class="repo-badge" style="background-color: ${color};" title="Repositorio: ${label}">${label}</span>`;
  }

  /**
   * Renders the implementation plan status badge
   * @returns {TemplateResult|string} Badge HTML or empty string
   */
  _renderPlanBadge() {
    if (!this.implementationPlan) return '';
    const status = this.implementationPlan.planStatus || 'pending';
    const config = TaskCard.PLAN_STATUS_CONFIG[status] || TaskCard.PLAN_STATUS_CONFIG.pending;
    return html`<span class="plan-badge" style="background-color: ${config.color}; color: ${config.textColor};" title="Plan: ${config.label}">${config.label}</span>`;
  }

  /**
   * Resuelve un ID de entidad (dev_XXX, stk_XXX) a objeto {id, name, email}
   * @param {string} entityId - ID de entidad
   * @returns {{id: string, name: string, email: string}|null}
   */
  _resolveEntityId(entityId) {
    if (!entityId || typeof entityId !== 'string') return null;

    const trimmed = entityId.trim();

    // Resolver developer ID
    if (trimmed.startsWith('dev_')) {
      const dev = entityDirectoryService.getDeveloper(trimmed);
      if (dev) {
        return { id: trimmed, name: dev.name || '', email: dev.email || '' };
      }
    }

    // Resolver stakeholder ID
    if (trimmed.startsWith('stk_')) {
      const stk = entityDirectoryService.getStakeholder(trimmed);
      if (stk) {
        return { id: trimmed, name: stk.name || '', email: stk.email || '' };
      }
    }

    return null;
  }

  /**
   * Normaliza diferentes estructuras de datos a objetos { name, email, id }
   * Soporta entity IDs (dev_XXX, stk_XXX), emails, y objetos {name, email}
   * @param {unknown} rawData - Datos crudos obtenidos desde Firebase
   * @returns {Array<{name: string, email: string, id?: string}>}
   */
  _normalizeContactEntries(rawData, options = {}) {
    const { normalizeDevelopers = false } = options;

    if (!rawData) {
      return [];
    }

    const normalized = [];

    const addEntry = (email, name, fallbackKey = '', entityId = '') => {
      const trimmedEmail = (email || '').trim();
      const trimmedKey = (fallbackKey || '').toString().trim();
      const isEntityKey = trimmedKey.startsWith('dev_') || trimmedKey.startsWith('stk_');
      const trimmedId = (entityId || '').trim() || (isEntityKey ? trimmedKey : '');

      // Si no hay email ni ID, no añadir
      if (!trimmedEmail && !trimmedId) {
        return;
      }

      let resolvedName = (name || '').trim();
      if (!resolvedName) {
        try {
          const fromDirectory = userDirectoryService.resolveDisplayName(trimmedEmail);
          if (fromDirectory) {
            resolvedName = fromDirectory;
          }
        } catch {
          // ignore
        }
      }
      if (!resolvedName && trimmedEmail) {
        resolvedName = this._deriveNameFromEmail(trimmedEmail) || (isEntityKey ? '' : trimmedKey);
      }

      const entry = { name: resolvedName, email: trimmedEmail };
      if (trimmedId) {
        entry.id = trimmedId;
      }
      normalized.push(entry);
    };

    if (Array.isArray(rawData)) {
      rawData.forEach((item, index) => {
        if (!item) return;

        // Si es un string que parece entity ID (dev_XXX o stk_XXX)
        if (typeof item === 'string' && (item.startsWith('dev_') || item.startsWith('stk_'))) {
          const resolved = this._resolveEntityId(item);
          if (resolved) {
            addEntry(resolved.email, resolved.name, '', resolved.id);
          }
          return;
        }

        if (typeof item === 'object') {
          addEntry(item.email || item.mail || item.value || '', item.name || item.display || item.label || '', String(index), item.id || '');
        } else if (typeof item === 'string') {
          addEntry(item, '', String(index));
        }
      });
    } else if (typeof rawData === 'object') {
      Object.entries(rawData).forEach(([key, value]) => {
        if (!value) return;

        // Si el value es un entity ID
        if (typeof value === 'string' && (value.startsWith('dev_') || value.startsWith('stk_'))) {
          const resolved = this._resolveEntityId(value);
          if (resolved) {
            addEntry(resolved.email, resolved.name, '', resolved.id);
          }
          return;
        }

        if (typeof value === 'object') {
          addEntry(value.email || value.mail || value.value || value.id || '', value.name || value.display || value.label || value.fullName || '', key, value.id || '');
        } else if (typeof value === 'string') {
          // Si value es string con @, es email y key es el nombre
          // Si value es string sin @, key podría ser el email
          if (value.includes('@')) {
            addEntry(value, key, key); // value=email, key=nombre
          } else if (key.includes('@')) {
            addEntry(key, value, value); // key=email, value=nombre
          } else {
            addEntry(value, '', key);
          }
        }
      });
    }

    if (normalizeDevelopers) {
      const developerEntries = normalizeDeveloperEntries(normalized);
      return developerEntries
        .filter(entry => !entry.isUnassigned)
        .map(entry => {
          // Buscar el id original en normalized
          const original = normalized.find(n => n.email === entry.email || n.email === entry.sourceEmail);
          return {
            name: entry.name,
            email: entry.email || entry.sourceEmail || '',
            id: original?.id || ''
          };
        });
    }

    // Deduplicar por email
    const deduped = [];
    const seen = new Set();
    normalized.forEach((entry) => {
      const key = entry.email || entry.name;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry);
      }
    });

    return deduped;
  }

  /**
   * Devuelve un nombre legible a partir del email
   * @param {string} email
   * @returns {string}
   */
  _deriveNameFromEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return '';
    }
    return email.split('@')[0];
  }

  get priority() {
    return this.devPoints ? ((this.businessPoints / this.devPoints).toFixed(2)) * 100 : 0;
  }

  /**
   * Gets the available point values based on the project's scoring system.
   * @returns {Array<number>} Array of point values
   */
  getPointsOptions() {
    const scoringSystem = this.projectScoringSystem || '1-5';

    if (scoringSystem === 'fibonacci') {
      return [0, 1, 2, 3, 5, 8, 13, 21];
    } else {
      // Default to 1-5 system
      return [0, 1, 2, 3, 4, 5];
    }
  }

  /**
   * Renders a points option for the select dropdown.
   * @param {string} pointsType - 'businessPoints' or 'devPoints'
   * @param {number} value - The point value
   * @returns {TemplateResult} The option element
   */
  _renderPointsOption(pointsType, value) {
    const isSelected = this[pointsType] === value;
    return html`<option value=${value} ?selected=${isSelected}>${value}</option>`;
  }

  get canSave() {
    // Permitimos guardar siempre que haya título y permisos de edición o sea validator en "To Validate".
    return (this.canEdit || this.canEditStatus) && this.title.trim();
  }

  async _handleSave() {
    if (!this.canSave) {
      console.warn('[TaskCard] Cannot save: canSave=false', {
        canEdit: this.canEdit,
        isEditable: this.isEditable,
        canEditPermission: this.canEditPermission,
        hasTitle: !!this.title?.trim(),
        isSaving: this.isSaving
      });
      this._showNotification('No se puede guardar: datos inválidos o sin permisos', 'error');
      return;
    }

    // Demo mode: block saves early (before IA generation)
    if (demoModeService.isDemo()) {
      demoModeService.showFeatureDisabled('editing');
      return;
    }

    this.isSaving = true;
    this._syncStructuredFields();

    // Generar acceptance criteria primero si no existe (con su propio loading)
    // Solo generar si los 3 campos de descripción estructurada están completos
    const hasAcceptance = this._hasAcceptanceCriteria();
    if (!hasAcceptance && this._hasCompleteDescriptionStructured()) {
      const generated = await this._generateAcceptanceCriteriaWithIa({ force: false, usePayload: true });
      if (!generated) {
        this.isSaving = false;
        return;
      }
    }

    // Mostrar saving overlay después de generar acceptance criteria
    this._showSavingOverlay();

    const requiredFields = this._getRequiredFieldsByStatus(this.status);
    const missing = this._getMissingRequiredFields(requiredFields);
    if (missing.length > 0) {
      console.warn('[TaskCard] Missing required fields for status:', {
        cardId: this.cardId,
        status: this.status,
        missingFields: missing
      });
      this.invalidFields = missing;
      this._applyInvalidClasses(missing);
      this.isSaving = false;
      this._hideSavingOverlay();

      const normalizedStatus = (this.status || '').toLowerCase();
      const messageByStatus = {
        'in progress': 'Para pasar a "In Progress", rellena los campos: ',
        'to validate': 'Para pasar a "To validate", rellena los campos: ',
        'done&validated': 'Para completar la tarea, rellena los campos: ',
        'blocked': 'Para pasar a "Blocked", rellena los campos: '
      };
      const baseMessage = messageByStatus[normalizedStatus] || 'Para guardar la tarea, rellena los campos: ';
      this._showNotification(`${baseMessage}${missing.join(', ')}`, 'warning');
      return;
    }

    this.invalidFields = [];
    this._clearInvalidClasses();

    // Validación de campos de bloqueo
    const blockValidation = this._validateBlockedFields();
    if (!blockValidation.valid) {
      this.isSaving = false;
      this._hideSavingOverlay();
      this._showNotification(blockValidation.message, 'warning');
      return;
    }

    // Clear blocked fields if status is NOT "Blocked" (data consistency)
    // This ensures orphan blocked flags don't persist when status changes
    if (!this._isBlockedStatus()) {
      this._clearBlockedFields();
    }

    super._handleSave();
  }

  /**
   * Check if current status is "Blocked"
   * @returns {boolean}
   */
  _isBlockedStatus() {
    return (this.status || '').toLowerCase() === 'blocked';
  }

  /**
   * Clear all blocked-related fields
   * Used when status changes away from "Blocked" to ensure data consistency
   */
  _clearBlockedFields() {
    this.blockedByBusiness = false;
    this.blockedByDevelopment = false;
    this.bbbWho = '';
    this.bbbWhy = '';
    this.bbdWho = '';
    this.bbdWhy = '';
  }

  /**
   * Validates that blocked fields are properly filled when task is blocked
   * @returns {{valid: boolean, message: string}}
   */
  _validateBlockedFields() {
    // Only validate if status is "Blocked"
    if (!this._isBlockedStatus()) {
      return { valid: true, message: '' };
    }

    // At least one blocker type must be set
    if (!this.blockedByBusiness && !this.blockedByDevelopment) {
      return {
        valid: false,
        message: 'Para bloquear, marca "Bloqueado por Negocio" o "Bloqueado por Desarrollo"'
      };
    }

    const missingFields = [];

    if (this.blockedByBusiness) {
      if (!this.bbbWho?.trim()) {
        missingFields.push('Quién bloquea (Negocio)');
      }
      if (!this.bbbWhy?.trim()) {
        missingFields.push('Razón del bloqueo (Negocio)');
      }
    }

    if (this.blockedByDevelopment) {
      if (!this.bbdWho?.trim()) {
        missingFields.push('Quién bloquea (Desarrollo)');
      }
      if (!this.bbdWhy?.trim()) {
        missingFields.push('Razón del bloqueo (Desarrollo)');
      }
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        message: `Para marcar como bloqueada, rellena: ${missingFields.join(', ')}`
      };
    }

    return { valid: true, message: '' };
  }

  _hasAcceptanceCriteria() {
    const scenarios = this._getAcceptanceCriteriaStructuredList();
    return scenarios.some((scenario) => {
      return Boolean((scenario.given || '').trim() || (scenario.when || '').trim() || (scenario.then || '').trim());
    });
  }

  _getRequiredFieldsByStatus(status) {
    const normalizedStatus = (status || '').toLowerCase();
    let requiredFields;
    switch (normalizedStatus) {
      case 'in progress':
        requiredFields = ['title', 'epic', 'sprint', 'acceptanceCriteria', 'businessPoints', 'devPoints', 'startDate', 'developer', 'validator'];
        break;
      case 'to validate':
        requiredFields = ['title', 'epic', 'sprint', 'acceptanceCriteria', 'businessPoints', 'devPoints', 'startDate', 'developer', 'validator'];
        break;
      case 'done':
        requiredFields = ['title', 'epic', 'sprint', 'acceptanceCriteria', 'businessPoints', 'devPoints', 'startDate', 'endDate', 'developer', 'validator'];
        break;
      default:
        requiredFields = ['title']; // Solo title es requerido para otros estados
    }
    // Para Spikes, devPoints no es obligatorio
    if (this.spike) {
      requiredFields = requiredFields.filter(f => f !== 'devPoints');
    }
    return requiredFields;
  }

  /**
   * Check if a field is required based on current status
   * @param {string} fieldName - The field name to check
   * @returns {boolean} True if field is required
   */
  _isFieldRequired(fieldName) {
    const requiredFields = this._getRequiredFieldsByStatus(this.status);
    return requiredFields.includes(fieldName);
  }

  /**
   * Get CSS class for label based on required status
   * @param {string} fieldName - The field name
   * @returns {string} 'required' if field is required, empty string otherwise
   */
  _getLabelClass(fieldName) {
    return this._isFieldRequired(fieldName) ? 'required' : '';
  }

  _getMissingRequiredFields(requiredFields) {
    const missing = [];
    requiredFields.forEach(field => {
      const value = this[field];
      const stringValue = (value || '').toString().trim().toLowerCase();

      const isEmptyString = typeof value === 'string' && value.trim() === '';
      const isZeroNumber = typeof value === 'number' && value === 0;
      const isDeveloperMissing = field === 'developer' && (!value ||
        stringValue === 'no developer assigned' ||
        stringValue === 'sin asignar');
      const isValidatorMissing = field === 'validator' && (!value ||
        stringValue === 'no-validator' ||
        stringValue === 'sin validator');

      const developerResolved = field === 'developer' && !isDeveloperMissing
        ? entityDirectoryService.resolveDeveloperId(value)
        : null;
      const validatorResolved = field === 'validator' && !isValidatorMissing
        ? entityDirectoryService.resolveStakeholderId(value)
        : null;

      const isDeveloperUnresolved = field === 'developer' && !isDeveloperMissing && !developerResolved;
      const isValidatorUnresolved = field === 'validator' && !isValidatorMissing && !validatorResolved;

      if (!value || isEmptyString || isZeroNumber ||
        isDeveloperMissing || isValidatorMissing ||
        isDeveloperUnresolved || isValidatorUnresolved) {
        missing.push(field);
      }
    });
    return missing;
  }

  /**
   * Check if object has description structured fields
   */
  _hasDescriptionFields(obj) {
    return 'role' in obj || 'goal' in obj || 'benefit' in obj || 'legacy' in obj;
  }

  /**
   * Check if description entry has any data
   */
  _entryHasData(value) {
    return (value.role || '').trim() ||
      (value.goal || '').trim() ||
      (value.benefit || '').trim() ||
      (value.legacy || '').trim();
  }

  /**
   * Extract entry from object with numeric keys
   */
  _extractFromNumericKeys(raw, base) {
    const numericKeys = Object.keys(raw).filter(key => String(Number(key)) === key);
    if (numericKeys.length === 0) return null;

    const sortedKeys = numericKeys.toSorted((a, b) => Number(a) - Number(b));
    const entry = raw[sortedKeys[0]];
    return (entry && typeof entry === 'object') ? { ...base, ...entry } : null;
  }

  /**
   * Extract entry from object candidates
   */
  _extractFromCandidates(raw, base) {
    const candidates = Object.values(raw).filter(value => value && typeof value === 'object');
    const withData = candidates.find(value => this._entryHasData(value));
    if (withData) return { ...base, ...withData };
    if (candidates.length > 0) return { ...base, ...candidates[0] };
    return null;
  }

  _getDescriptionStructuredEntry() {
    const base = { role: '', goal: '', benefit: '', legacy: '' };

    if (Array.isArray(this.descriptionStructured)) {
      const entry = this.descriptionStructured[0];
      return (entry && typeof entry === 'object') ? { ...base, ...entry } : base;
    }

    if (!this.descriptionStructured || typeof this.descriptionStructured !== 'object') {
      return base;
    }

    const raw = this.descriptionStructured;
    if (this._hasDescriptionFields(raw)) {
      return { ...base, ...raw };
    }

    return this._extractFromNumericKeys(raw, base) ||
      this._extractFromCandidates(raw, base) ||
      base;
  }

  _hasStructuredDescriptionData() {
    const entry = this._getDescriptionStructuredEntry();
    return Boolean((entry.role || '').trim() ||
      (entry.goal || '').trim() ||
      (entry.benefit || '').trim() ||
      (entry.legacy || '').trim());
  }

  /**
   * Verifica si los 3 campos de descripción estructurada están completos (role, goal, benefit)
   * Se usa para determinar si se puede generar automáticamente AC con IA
   * @returns {boolean} true si los 3 campos tienen contenido
   */
  _hasCompleteDescriptionStructured() {
    const entry = this._getDescriptionStructuredEntry();
    return Boolean(
      (entry.role || '').trim() &&
      (entry.goal || '').trim() &&
      (entry.benefit || '').trim()
    );
  }

  _setDescriptionStructuredEntry(patch, options = {}) {
    const { replace = false } = options;
    const base = replace ? { role: '', goal: '', benefit: '', legacy: '' } : this._getDescriptionStructuredEntry();
    const updated = { ...base, ...patch };
    if (Array.isArray(this.descriptionStructured)) {
      const rest = this.descriptionStructured.length > 1 ? this.descriptionStructured.slice(1) : [];
      this.descriptionStructured = [updated, ...rest];
      return;
    }
    this.descriptionStructured = [updated];
  }

  /**
   * Convert legacy description to user story format using AI
   */
  async _convertLegacyDescription() {
    // Prevent multiple clicks
    if (this._isConvertingDescription) return;

    const entry = this._getDescriptionStructuredEntry();
    const legacyDescription = (entry.legacy || '').trim();

    if (!legacyDescription) {
      this._showNotification('No hay descripción para convertir', 'warning');
      return;
    }

    this._isConvertingDescription = true;
    this._showSavingOverlay('Generando descripción...');

    try {
      const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
      const functions = getFunctions(undefined, 'europe-west1');
      const convertDescription = httpsCallable(functions, 'convertDescriptionToUserStory');

      const result = await convertDescription({
        description: legacyDescription,
        title: this.title || ''
      });

      if (result.data?.status === 'ok') {
        // Update the structured description with the converted values
        this._setDescriptionStructuredEntry({
          role: result.data.como,
          goal: result.data.quiero,
          benefit: result.data.para,
          legacy: '' // Clear the legacy description
        });

        this._showNotification('Descripción convertida correctamente', 'success');
        this.requestUpdate();
      } else {
        throw new Error('No se pudo convertir la descripción');
      }
    } catch (error) {
      console.error('Error converting description:', error);
      this._showNotification(error.message || 'Error al convertir la descripción', 'error');
    } finally {
      this._isConvertingDescription = false;
      this._hideSavingOverlay();
    }
  }

  /**
   * Improve description with IA - optimizes existing description
   * Works with both legacy and structured descriptions
   */
  async _improveDescriptionWithIa() {
    if (this._isConvertingDescription) return;

    const entry = this._getDescriptionStructuredEntry();

    // Build current description text
    let currentDescription = '';
    if (entry.role || entry.goal || entry.benefit) {
      // Has structured fields - combine them
      currentDescription = [
        entry.role ? `Como ${entry.role}` : '',
        entry.goal ? `Quiero ${entry.goal}` : '',
        entry.benefit ? `Para ${entry.benefit}` : ''
      ].filter(Boolean).join('\n');
    } else if (entry.legacy) {
      // Only legacy description
      currentDescription = entry.legacy;
    }

    if (!currentDescription || currentDescription.trim().length < 10) {
      this._showNotification('Escribe una descripción más detallada primero (mínimo 10 caracteres)', 'warning');
      return;
    }

    this._isConvertingDescription = true;
    this._showSavingOverlay('Optimizando descripción con IA...');
    this.requestUpdate();

    try {
      const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
      const functions = getFunctions(undefined, 'europe-west1');
      const convertDescription = httpsCallable(functions, 'convertDescriptionToUserStory');

      const result = await convertDescription({
        description: currentDescription,
        title: this.title || ''
      });

      if (result.data?.status === 'ok') {
        const newRole = (result.data.como || '').trim();
        const newGoal = (result.data.quiero || '').trim();
        const newBenefit = (result.data.para || '').trim();

        // Check if there are actual changes
        const hasChanges =
          newRole !== (entry.role || '').trim() ||
          newGoal !== (entry.goal || '').trim() ||
          newBenefit !== (entry.benefit || '').trim();

        if (!hasChanges) {
          this._showNotification('La descripción ya está optimizada, no hay cambios necesarios', 'info');
        } else {
          this._setDescriptionStructuredEntry({
            role: newRole,
            goal: newGoal,
            benefit: newBenefit,
            legacy: '' // Clear legacy since we now have structured
          });
          this._showNotification('Descripción optimizada correctamente', 'success');
        }
      } else {
        throw new Error('Respuesta inesperada de la IA');
      }
    } catch (error) {
      console.error('Error improving description with IA:', error);
      this._showNotification(`Error al optimizar: ${error?.message || 'Error desconocido'}`, 'error');
    } finally {
      this._isConvertingDescription = false;
      this._hideSavingOverlay();
    }
  }

  _getDescriptionStructuredForSave() {
    if (Array.isArray(this.descriptionStructured)) {
      return this.descriptionStructured.length > 0 ? this.descriptionStructured : [this._getDescriptionStructuredEntry()];
    }
    if (this.descriptionStructured && typeof this.descriptionStructured === 'object') {
      return [this._getDescriptionStructuredEntry()];
    }
    return [this._getDescriptionStructuredEntry()];
  }

  _getAcceptanceCriteriaStructuredList() {
    const raw = this.acceptanceCriteriaStructured;
    if (Array.isArray(raw)) {
      return raw.filter(item => item && typeof item === 'object');
    }
    if (raw && typeof raw === 'object') {
      const hasScenarioFields = 'given' in raw || 'when' in raw || 'then' in raw || 'raw' in raw;
      if (hasScenarioFields) {
        return [raw];
      }
      const numericKeys = Object.keys(raw).filter(key => String(Number(key)) === key);
      if (numericKeys.length > 0) {
        return numericKeys
          .toSorted((a, b) => Number(a) - Number(b))
          .map(key => raw[key])
          .filter(item => item && typeof item === 'object');
      }
      const candidates = Object.values(raw).filter(value => value && typeof value === 'object');
      const filtered = candidates.filter(value => (
        (value.given || '').trim() ||
        (value.when || '').trim() ||
        (value.then || '').trim() ||
        (value.raw || '').trim()
      ));
      if (filtered.length > 0) {
        return filtered;
      }
      return candidates;
    }
    return [];
  }

  _getAcceptanceCriteriaStructuredForSave() {
    const list = this._getAcceptanceCriteriaStructuredList();
    if (list.length > 0) {
      return list;
    }
    if (Array.isArray(this.acceptanceCriteriaStructured)) {
      return this.acceptanceCriteriaStructured;
    }
    return [];
  }

  _hydrateStructuredDescription() {
    if (this.description && typeof this.description === 'object' && !Array.isArray(this.description)) {
      const { role = '', goal = '', benefit = '', legacy = '' } = this.description;
      this._setDescriptionStructuredEntry({ role, goal, benefit, legacy }, { replace: true });
      return;
    }
    const text = (this.description || '').toString();
    const role = (/como\s+([^\n]+)/i.exec(text) || [])[1] || '';
    const goal = (/quiero\s+([^\n]+)/i.exec(text) || [])[1] || '';
    const benefit = (/para\s+([^\n]+)/i.exec(text) || [])[1] || '';
    this._setDescriptionStructuredEntry({
      role: role.trim(),
      goal: goal.trim(),
      benefit: benefit.trim(),
      legacy: text.trim()
    }, { replace: true });
  }

  _hydrateStructuredAcceptance() {
    const normalized = this._getAcceptanceCriteriaStructuredList();
    if (normalized.length > 0) {
      if (!Array.isArray(this.acceptanceCriteriaStructured)) {
        this.acceptanceCriteriaStructured = normalized;
      }
      return;
    }

    const scenarios = [];
    const raw = (this.acceptanceCriteria || '').toString().trim();
    if (raw) {
      scenarios.push({
        given: '',
        when: '',
        then: raw, // NOSONAR - Gherkin scenario field, not a thenable
        raw
      });
    }
    this.acceptanceCriteriaStructured = scenarios.length ? scenarios : [{
      given: '',
      when: '',
      then: '', // NOSONAR - Gherkin scenario field, not a thenable
      raw: ''
    }];
  }

  _buildDescriptionText() {
    const { role = '', goal = '', benefit = '', legacy = '' } = this._getDescriptionStructuredEntry();
    if (role || goal || benefit) {
      return [
        role ? `Como ${role}` : '',
        goal ? `Quiero ${goal}` : '',
        benefit ? `Para ${benefit}` : ''
      ].filter(Boolean).join('\n');
    }
    return legacy || (this.description || '').toString();
  }

  _buildAcceptanceText() {
    const scenariosList = this._getAcceptanceCriteriaStructuredList();
    if (scenariosList.length === 0) {
      return this.acceptanceCriteria || '';
    }
    const parts = scenariosList.map((scenario, index) => {
      const givenParts = (scenario.given || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
      const thenParts = (scenario.then || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

      const givenLines = givenParts.map((line, idx) => idx === 0 ? `Dado ${line}` : `Y ${line}`);
      const thenLines = thenParts.map((line, idx) => idx === 0 ? `Entonces ${line}` : `Y ${line}`);
      const whenLine = scenario.when ? `Cuando ${scenario.when}` : '';

      const allLines = [...givenLines, whenLine, ...thenLines].filter(Boolean);
      const title = scenariosList.length > 1 ? `Escenario ${index + 1}:\n` : '';
      return `${title}${allLines.join('\n')}`;
    });
    return parts.filter(Boolean).join('\n\n');
  }

  _syncStructuredFields() {
    if (!this._hasStructuredDescriptionData()) {
      this._hydrateStructuredDescription();
    }
    const normalizedScenarios = this._getAcceptanceCriteriaStructuredList();
    if (!Array.isArray(this.acceptanceCriteriaStructured) && normalizedScenarios.length > 0) {
      this.acceptanceCriteriaStructured = normalizedScenarios;
    }
    if (normalizedScenarios.length === 0) {
      this._hydrateStructuredAcceptance();
    }
    this.description = this._buildDescriptionText();
    this.acceptanceCriteria = this._buildAcceptanceText();
  }

  /**
   * Carga permisos asíncronamente para actualizar la UI
   * NUEVO: Para soportar renders síncronos con datos async
   */
  async _loadPermissions() {
    try {
      const canDelete = await this.canDelete();
      if (this._canDeletePermission !== canDelete) {
        this._canDeletePermission = canDelete;
        this.requestUpdate(); // Forzar re-render si cambiaron los permisos
      }
    } catch (error) {
this._canDeletePermission = false;
    }
  }

  async _resolveSuperAdmin() {
    try {
      const email = this._getCurrentUserEmail();
      this.isSuperAdmin = await isCurrentUserSuperAdmin(email);
    } catch (error) {
this.isSuperAdmin = false;
    }
  }

  /**
   * Determina si el select de status debe estar habilitado.
   * Además de canEdit (admin en modo gestión), se habilita para
   * validators/covalidators cuando la tarea está en "To Validate".
   */
  get canEditStatus() {
    if (this.canEdit) return true;
    const normalized = (this.status || '').toLowerCase().replace(/&/g, '').replace(/\s+/g, '');
    if (normalized === 'tovalidate' && this.canSetDoneValidated) return true;
    return false;
  }

  /**
   * Determina si el usuario actual puede establecer el estado "Done&Validated"
   * Solo pueden: SuperAdmin, Validator asignado, o CoValidator asignado
   */
  get canSetDoneValidated() {
    // SuperAdmin siempre puede
    if (this.isSuperAdmin) return true;

    // Obtener email del usuario actual
    const currentEmail = this._getCurrentUserEmail().toLowerCase().trim();
    if (!currentEmail) return false;

    // Resolver IDs para comparación
    const currentStkId = entityDirectoryService.resolveStakeholderId(currentEmail);

    // Verificar si es el Validator asignado
    if (this.validator) {
      const validatorId = entityDirectoryService.resolveStakeholderId(this.validator);
      const validatorEmail = (entityDirectoryService.resolveStakeholderEmail(this.validator) || '').toLowerCase().trim();
      if ((currentStkId && validatorId && currentStkId === validatorId) ||
          (currentEmail && validatorEmail && currentEmail === validatorEmail)) {
        return true;
      }
    }

    // Verificar si es el CoValidator asignado
    if (this.coValidator) {
      const coValidatorId = entityDirectoryService.resolveStakeholderId(this.coValidator);
      const coValidatorEmail = (entityDirectoryService.resolveStakeholderEmail(this.coValidator) || '').toLowerCase().trim();
      if ((currentStkId && coValidatorId && currentStkId === coValidatorId) ||
          (currentEmail && coValidatorEmail && currentEmail === coValidatorEmail)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determina si una opción de status debe estar deshabilitada
   * @param {string} statusOption - El estado a evaluar
   * @returns {boolean} - true si debe estar deshabilitada
   */
  _isStatusOptionDisabled(statusOption) {
    const normalized = (statusOption || '').toLowerCase().replace(/&/g, '').replace(/\s+/g, '');
    if (normalized === 'donevalidated') {
      return !this.canSetDoneValidated;
    }
    return false;
  }

  /**
   * Determines if the current user can edit the developer field
   * - SuperAdmin: always can edit
   * - Current developer assigned: can edit (to unassign themselves)
   * - No developer assigned: can edit (to self-assign)
   * - Others (validators, etc): cannot edit, only view
   */
  _canEditDeveloperField() {
    if (this.isSuperAdmin) return true;

    // If no developer assigned, anyone can self-assign
    if (!this.developer || APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer)) {
      return true;
    }

    // Check if current user is the assigned developer
    const currentEmail = this._getCurrentUserEmail();
    const currentDevId = entityDirectoryService.resolveDeveloperId(currentEmail);
    const assignedDevId = entityDirectoryService.resolveDeveloperId(this.developer);

    // User can edit if they are the assigned developer
    return this.developer === currentEmail ||
           this.developer === currentDevId ||
           assignedDevId === currentDevId ||
           assignedDevId === currentEmail;
  }

  _getDeveloperOptionsForRole(options) {
    const list = Array.isArray(options) ? options : [];
    if (this.isSuperAdmin) return list;

    const currentEmail = this._getCurrentUserEmail();
    const currentDevId = entityDirectoryService.resolveDeveloperId(currentEmail);

    // Si el usuario no tiene ID resuelto, usar su email como valor
    const devValue = currentDevId || currentEmail;
    if (!devValue) return [];

    const displayName = currentDevId
      ? (entityDirectoryService.getDeveloperDisplayName(currentDevId) || currentEmail || 'Yo')
      : (currentEmail.split('@')[0] || 'Yo');

    // Base options: unassigned + current user
    const result = [
      { value: APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE, display: APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES },
      { value: devValue, display: displayName }
    ];

    // IMPORTANT: If the task has a different developer assigned, include them as an option
    // so the current value is visible (even though the user can only self-assign)
    if (this.developer && !APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer)) {
      const assignedDevId = entityDirectoryService.resolveDeveloperId(this.developer) || this.developer;
      const isCurrentUser = assignedDevId === devValue || this.developer === currentEmail;

      if (!isCurrentUser) {
        // Find the assigned developer's display name from the full list
        const assignedDev = list.find(dev => dev.value === this.developer || dev.value === assignedDevId);
        const assignedDisplayName = assignedDev
          ? assignedDev.display
          : (entityDirectoryService.getDeveloperDisplayName(assignedDevId) || this.developer);

        // Add the assigned developer as the first option (after unassigned)
        result.splice(1, 0, { value: this.developer, display: assignedDisplayName });
      }
    }

    return result;
  }

  /**
   * Override de BaseCard: Actualiza datos de la tarjeta antes de operaciones
   * MIGRADO: Implementación específica para TaskCard
   */
  updateCardData() {
    // Si hay múltiples repos y no tiene etiqueta, usar el default (primero)
    let repoLabel = this.repositoryLabel || '';
    if (this.projectRepositories.length > 1 && !repoLabel) {
      repoLabel = this.projectRepositories[0]?.label || '';
    }

    this.card = {
      id: this.id,
      cardId: this.cardId,
      cardType: 'task-card',
      title: this.title,
      description: this.description,
      businessPoints: this.businessPoints,
      devPoints: this.devPoints,
      status: this.status,
      sprint: this.sprint,
      epic: this.epic,
      developer: this.developer,
      coDeveloper: this.coDeveloper,
      validator: this.validator,
      coValidator: this.coValidator,
      createdBy: this.createdBy,
      // userEmail removed - legacy field that should not be persisted
      blockedByBusiness: this.blockedByBusiness,
      blockedByDevelopment: this.blockedByDevelopment,
      bbbWhy: this.bbbWhy,
      bbbWho: this.bbbWho,
      bbdWhy: this.bbdWhy,
      bbdWho: this.bbdWho,
      group: this.group,
      section: this.section,
      projectId: this.projectId,
      stakeholders: this.stakeholders,
      attachment: this.attachment,
      relatedTasks: this.relatedTasks,
      spike: this.spike,
      expedited: this.expedited,
      notes: this.notes,
      repositoryLabel: repoLabel
    };
  }

  /**
   * Override de BaseCard: Obtiene datos actuales de la tarjeta
   * MIGRADO: Implementación específica para TaskCard
   */
  getCardData() {
    this.updateCardData();
    return this.card;
  }

  // Propiedad computada para asegurar que statusList siempre sea un array
  get statusListArray() {
    let statusArray = [];
    if (Array.isArray(this.statusList)) {
      statusArray = this.statusList;
    } else if (typeof this.statusList === 'object' && this.statusList !== null) {
      statusArray = Object.keys(this.statusList);
    } else {
      statusArray = [];
    }

    // Ordenar en el orden lógico
    return this.sortStatusList(statusArray);
  }

  // Método para ordenar los estados en el orden lógico
  sortStatusList(statusArray) {
    const order = ['To Do', 'In Progress', 'Pausado', 'To Validate', 'Done&Validated', 'Blocked', 'Reopened'];

    // Ensure Reopened is available if Done&Validated exists (task workflow)
    let extendedArray = [...statusArray];
    if (extendedArray.includes('Done&Validated') && !extendedArray.includes('Reopened')) {
      extendedArray.push('Reopened');
    }

    const sorted = [];

    // Agregar estados en el orden predefinido
    order.forEach(status => {
      if (extendedArray.includes(status)) {
        sorted.push(status);
      }
    });

    // Agregar cualquier estado adicional que no esté en el orden predefinido
    extendedArray.forEach(status => {
      if (!order.includes(status)) {
        sorted.push(status);
      }
    });

    return sorted;
  }

  /**
   * Formatea una fecha ISO 8601 al formato día-mes-año.
   * Si la cadena está vacía, devuelve una cadena vacía.
   * Si la fecha no es válida, devuelve "Invalid Date".
   *
   * @param {string} isoDate - La fecha en formato ISO (ej: "2024-06-04T22:00:00.000Z").
   * @returns {string} La fecha formateada en formato "dd-mm-yyyy", cadena vacía o "Invalid Date".
   */
  formatDate(_inputDate) {
    if (!_inputDate) return ''; // Si la fecha es vacía, no procesar
    const inputDate = _inputDate.split('T')[0]; // Solo tomar la parte de la fecha

    const possibleFormats = ['d/M/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'M/d/yyyy', 'MM/dd/yyyy'];

    let parsedDate = null;

    for (const fmt of possibleFormats) {
      parsedDate = parse(inputDate, fmt, new Date());
      if (isValid(parsedDate)) break; // Si el parseo es válido, salir del bucle
    }

    // Si ninguna conversión fue válida, retornar vacío o un mensaje de error
    if (!isValid(parsedDate)) return 'Invalid Date';

    return format(parsedDate, 'dd/MM/yyyy'); // Formato de salida uniforme
  }

  /**
   * Formats an ISO date string to a short readable format (dd/MM/yyyy HH:mm)
   * @param {string} isoString - ISO date string
   * @returns {string} Formatted date string or empty if invalid
   */
  _formatDateTimeShort(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
      return '';
    }
  }

  /**
   * Toggles the expanded state of the reopen cycles list
   */
  _toggleReopenCycles() {
    this._reopenCyclesExpanded = !this._reopenCyclesExpanded;
    this.requestUpdate();
  }

  _isFieldInvalid(fieldName) {
    const isInvalid = this.invalidFields?.includes(fieldName);
    return isInvalid;
  }

  _getFieldClass(fieldName, baseClass = '') {
    const invalidClass = this._isFieldInvalid(fieldName) ? 'invalid-field' : '';
    const finalClass = baseClass ? `${baseClass} ${invalidClass}`.trim() : invalidClass;
    return finalClass;
  }

  _applyInvalidClasses(fields) {
    // Primero limpiar cualquier clase invalid anterior
    this._clearInvalidClasses();

    // Esperar un momento para asegurar que el DOM está renderizado
    setTimeout(() => {
      // Buscar todos los selects y inputs en el componente
      const allSelects = this.shadowRoot.querySelectorAll('select');
      const allInputs = this.shadowRoot.querySelectorAll('input[type="date"]');

      // Marcar campos según el contenido del label anterior
      fields.forEach(field => {
        let found = false;

      // Buscar selects por el label que los precede
      allSelects.forEach(select => {
        const parent = select.parentElement;
        if (parent) {
          const label = parent.querySelector('label');
          if (label) {
            const labelText = label.textContent.toLowerCase().replace(':', '').trim();

            // Mapear los nombres de campos a las etiquetas
            const fieldToLabel = {
              'epic': 'epic',
              'sprint': 'sprint',
              'businessPoints': 'business points',
              'devPoints': 'dev points',
              'developer': 'developer',
              'validator': 'validator',
              'acceptanceCriteria': 'acceptance criteria'
            };

            if (fieldToLabel[field] === labelText) {
              select.classList.add('invalid-field');
              found = true;
            }
          }
        }
      });

        // Buscar inputs de fecha
        if (field === 'startDate' || field === 'endDate') {
          allInputs.forEach(input => {
            const parent = input.parentElement;
            if (parent) {
              const label = parent.querySelector('label');
              if (label) {
                const labelText = label.textContent.toLowerCase().replace(':', '').trim();
                if ((field === 'startDate' && labelText === 'start date') ||
                  (field === 'endDate' && labelText === 'end date')) {
                  input.classList.add('invalid-field');
                  found = true;
                }
              }
            }
          });
        }

        if (!found) {
          // Marcar textareas específicos
          if (field === 'acceptanceCriteria') {
            const acceptanceTextarea = this.shadowRoot.querySelector('.acceptance-criteria-panel textarea');
            if (acceptanceTextarea) {
              acceptanceTextarea.classList.add('invalid-field');
              found = true;
            }

            // Mark the tab as invalid using ColorTabs method (check method exists in case element not upgraded yet)
            const colorTabs = this.shadowRoot.querySelector('color-tabs');
            if (colorTabs?.setTabInvalid) {
              colorTabs.setTabInvalid('acceptanceCriteria', true);
              found = true;
            }
          }
        }
      });

      // Scroll al primer campo inválido
      this._scrollToFirstInvalidField();
    }, 50);
  }

  /**
   * Scroll smoothly to the first invalid field
   */
  _scrollToFirstInvalidField() {
    const firstInvalid = this.shadowRoot.querySelector('.invalid-field');
    if (firstInvalid) {
      firstInvalid.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      // Focus the element if it's focusable
      if (firstInvalid.focus) {
        setTimeout(() => firstInvalid.focus(), 300);
      }
    }
  }

  _clearInvalidClasses() {
    const invalidElements = this.shadowRoot.querySelectorAll('.invalid-field');
    invalidElements.forEach(element => {
      element.classList.remove('invalid-field');
    });

    // Clear invalid states on ColorTabs (check method exists in case element not upgraded yet)
    const colorTabs = this.shadowRoot.querySelector('color-tabs');
    if (colorTabs?.clearAllInvalid) {
      colorTabs.clearAllInvalid();
    }
  }

  /**
   * Render priority info for compact view
   * Shows "Prioridad X" label with color intensity based on rank
   * Badge shows calculated value (e.g., 67, 100, 500)
   */
  _renderPriorityInfo() {
    const priorityInfo = getPriorityDisplay(this.businessPoints, this.devPoints);

    if (!priorityInfo.hasPriority) {
      return html`
        <div class="priority-container no-priority">
          <span class="priority-label">${priorityInfo.label}</span>
        </div>
      `;
    }

    return html`
      <div class="priority-container" title="${priorityInfo.label} (${this.businessPoints}/${this.devPoints} = ${priorityInfo.value})">
        <span class="priority-label" style="background-color: ${priorityInfo.backgroundColor}">${priorityInfo.label}</span>
        <span class="priority-badge">${priorityInfo.badge}</span>
      </div>
    `;
  }

  render() {
    if (this.expanded) {
      return this.renderExpanded();
    }
    if (this.viewMode === 'ultra-compact') {
      return this.renderUltraCompact();
    }
    return this.renderCompact();
  }

  renderCompactHeader() {
    return html`
      <div class="card-header">
        <div class="title-row">
          <div class="title" title="${this.title || ''}">${this.title || ''}</div>
          ${this._renderPlanBadge()}
        </div>
        <div class="card-id-row">
          <div class="cardid" title="Click para copiar ID" style="cursor:pointer" @click=${this._copyCardId}>${this.cardId || ''}${this._renderRepoBadge()}${this._renderPipelineBadges()}</div>
          <div class="card-actions">
            ${this.attachment ? html`<span class="attachment-indicator" title="Tiene archivo adjunto">📎</span>` : ''}
            <button class="copy-link-button" title="Copiar enlace" @click=${this.copyCardUrl}>🔗</button>
            ${this._projectHasIa() ? html`<button class="ia-link-button" title="Generar enlace IA (1 uso, 15 min)" @click=${(e) => { e.stopPropagation(); this._generateIaLink(); }}>🤖</button>` : ''}
            ${this.canMoveToProject ? html`<button class="move-project-button" title="Mover a otro proyecto" @click=${(e) => { e.stopPropagation(); this._handleMoveToProject(e); }}>📦</button>` : ''}
            ${this.canDelete ? html`<button class="delete-button" @click=${this.showDeleteModal}>🗑️</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderExpandedHeader() {
    return html`
      <div class="card-header">
        <section style="display:flex; flex-direction:row; width:100%; justify-content:center; gap: 1rem; align-items:center;">
          ${this.projectId ? html`<span class="project-badge" title="Proyecto: ${this.projectId}">${this.projectId}</span>` : ''}
          <input
            for="title"
            type="text"
            class="title"
            .value=${this.title}
            title=${this.title}
            @input=${this._handleTitleChange}
            placeholder="Escriba aquí el título..."
            autofocus
            aria-label="Title"
            ?disabled=${!this.isEditable}
          />
          <span class="cardid-badge" title="Click para copiar ID" style="cursor:pointer" @click=${this._copyCardId}>${this.cardId || ''}</span>
          ${this._renderPlanBadge()}
          ${this._renderPipelineBadges()}
        </section>
      </div>
    `;
  }

  renderCompact() {
    const statusClass = this.status ? this.status.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '') : '';
    // Usar developerName si está disponible, sino resolver con _getContactDisplayName
    const developerDisplay = this.developerName || (this.developer ? this._getContactDisplayName(this.developer, this.developers) : '');
    const coDeveloperDisplay = this.coDeveloper ? this._getContactDisplayName(this.coDeveloper, this.developers) : '';
    const businessBlockedBy = this.bbbWho ? this._getContactDisplayName(this.bbbWho, this.stakeholders) : '';
    const developmentBlockedBy = this.bbdWho ? this._getContactDisplayName(this.bbdWho, this.developers) : '';

    return html`
      <div class="card-container ${this.selected ? 'selected' : ''} ${this.expedited ? 'expedited' : ''} ${this.spike ? 'spike' : ''}" @click=${this._handleClick}>
        ${this.spike ? html`<span class="spike-badge" title="Spike - Investigación técnica" aria-label="Spike">SPIKE</span>` : ''}
        ${this.expedited ? html`<span class="expedit-badge" title="Tarea urgente" aria-label="Tarea urgente">EXPEDIT</span>` : ''}
        ${this.renderCompactHeader()}
        <div class="card-body">
          ${this.sprint ? html`
            <div class="sprint-info">
              <span class="sprint-label"></span>
              <span class="sprint-value">${this.sprintTitle}</span>
            </div>
          ` : ''}
          <div class="points-info">
            <span class="points business-points" title="Business Points">B:${this.businessPoints || 0}</span>
            <span class="points dev-points" title="Development Points">D:${this.devPoints || 0}</span>
            ${this._renderPriorityInfo()}
          </div>
          ${this._isBlockedStatus() && (this.blockedByBusiness || this.blockedByDevelopment) ? html`
            <div class="blocked-info">
              ${this.blockedByBusiness ? html`
                <span class="blocked-compact business has-tooltip">
                  🔴 <span style="font-size: 0.75em;">Bus Blocked</span>
                  <div class="custom-tooltip">
                    <strong>BUSINESS BLOCKED</strong>
                    ${this.bbbWhy ? html`<div style="margin-top: 0.5rem;">Razón: ${this.bbbWhy}</div>` : ''}
                    ${businessBlockedBy ? html`<div style="margin-top: 0.3rem;">Responsable: ${businessBlockedBy}</div>` : ''}
                  </div>
                </span>
              ` : ''}
              ${this.blockedByDevelopment ? html`
                <span class="blocked-compact development has-tooltip">
                  🔵 <span style="font-size: 0.75em;">Dev Blocked</span>
                  <div class="custom-tooltip">
                    <strong>DEVELOPMENT BLOCKED</strong>
                    ${this.bbdWhy ? html`<div style="margin-top: 0.5rem;">Razón: ${this.bbdWhy}</div>` : ''}
                    ${developmentBlockedBy ? html`<div style="margin-top: 0.3rem;">Responsable: ${developmentBlockedBy}</div>` : ''}
                  </div>
                </span>
              ` : ''}
            </div>
          ` : ''}
        </div>
        <div class="card-footer">
          <div class="status ${statusClass}">${this.status || ''}</div>
          ${developerDisplay ? html`<div class="developer">${developerDisplay}${coDeveloperDisplay ? html` <span class="co-developer" title="Co-Developer: ${coDeveloperDisplay}">+ ${coDeveloperDisplay.split(' ')[0]}</span>` : ''}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Vista ultra-compacta para Kanban
   */
  renderUltraCompact() {
    const statusClass = this.status ? this.status.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '') : '';
    const truncatedTitle = this.title?.length > 35 ? this.title.substring(0, 35) + '...' : this.title;

    // Obtener información de prioridad descriptiva
    const priorityInfo = getPriorityDisplay(this.businessPoints, this.devPoints);

    // Iniciales del developer
    const developerDisplay = this.developerName || (this.developer ? this._getContactDisplayName(this.developer, this.developers) : '');
    const initials = developerDisplay ? developerDisplay.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '';

    // Iniciales del co-developer
    const coDeveloperDisplay = this.coDeveloper ? this._getContactDisplayName(this.coDeveloper, this.developers) : '';
    const coDevInitials = coDeveloperDisplay ? coDeveloperDisplay.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '';

    // Indicadores de bloqueo (only show if status is actually "Blocked")
    const isBlocked = this._isBlockedStatus();
    const hasBusinessBlock = isBlocked && this.blockedByBusiness;
    const hasDevBlock = isBlocked && this.blockedByDevelopment;

    return html`
      <div class="card-container ultra-compact ${this.selected ? 'selected' : ''} ${this.expedited ? 'expedited' : ''} ${this.spike ? 'spike' : ''}" @click=${this._handleClick}>
        <div class="uc-row-top">
          <span class="uc-cardid">${this.cardId || ''}${this._renderPipelineBadges()}</span>
          <span class="uc-priority ${priorityInfo.hasPriority ? '' : 'no-priority'}" style="${priorityInfo.hasPriority ? `background-color: ${priorityInfo.backgroundColor}` : ''}" title="${priorityInfo.hasPriority ? `${priorityInfo.label} (${this.businessPoints}/${this.devPoints} = ${priorityInfo.value})` : priorityInfo.label}">${priorityInfo.shortLabel}</span>
        </div>
        <div class="uc-title" title="${this.title || ''}">${truncatedTitle || ''}</div>
        <div class="uc-row-bottom">
          <div class="uc-indicators">
            ${hasBusinessBlock ? html`<span class="uc-blocked-biz" title="Business Blocked">🔴</span>` : ''}
            ${hasDevBlock ? html`<span class="uc-blocked-dev" title="Dev Blocked">🔵</span>` : ''}
            ${this.spike ? html`<span class="uc-spike" title="Spike">⚡</span>` : ''}
            ${this.expedited ? html`<span class="uc-expedited" title="Expedited">🚀</span>` : ''}
          </div>
          ${initials ? html`<span class="uc-developer" title="${developerDisplay}">${initials}</span>` : ''}
          ${coDevInitials ? html`<span class="uc-co-developer" title="Co-Dev: ${coDeveloperDisplay}">+${coDevInitials}</span>` : ''}
          <div class="uc-status ${statusClass}">${this.status || ''}</div>
        </div>
      </div>
    `;
  }

  _setActiveTab(tab) {
    this.activeTab = tab;

    // Use ColorTabs component method if available (check method exists in case element not upgraded yet)
    const colorTabs = this.shadowRoot.querySelector('color-tabs');
    if (colorTabs?.setActiveTab) {
      colorTabs.setActiveTab(tab);
      colorTabs.scrollIntoView({ behavior: 'smooth' });
    }
  }

  _handleTabChanged(e) {
    this.activeTab = e.detail.name;
  }

  renderExpanded() {
    const developerOptions = this._getDeveloperOptionsForRole(this.getProcessedDeveloperList());
    const developerValue = this.developer || '';
    const descriptionEntry = this._getDescriptionStructuredEntry();
    const hasStructuredFields = Boolean(descriptionEntry.role || descriptionEntry.goal || descriptionEntry.benefit);
    const acceptanceScenarios = this._getAcceptanceCriteriaStructuredList();
    return html`
      <div class="expanded-badge-container">
        ${this.spike ? html`<span class="spike-badge" title="Spike - Investigación técnica" aria-label="Spike">SPIKE</span>` : ''}
        ${this.expedited ? html`<span class="expedit-badge" title="Tarea urgente" aria-label="Tarea urgente">EXPEDIT</span>` : ''}
      </div>
      ${this.renderExpandedHeader()}
      <!-- Fila 1: Estado, Flags y Puntos -->
      <div class="form-row compact-row">
        <div class="form-field inline">
          <label>Status</label>
          <select class="status-select ${this._getFieldClass('status')}" .value=${this.status} @change=${this._handleStatusChange} ?disabled=${!this.canEditStatus}>
            ${this.statusListArray.map(status => html`
              <option
                value="${status}"
                ?selected=${this.status === status}
                ?disabled=${this._isStatusOptionDisabled(status)}
                title=${this._isStatusOptionDisabled(status) ? 'Solo Validator o CoValidator pueden marcar como validado' : ''}
              >${status}</option>
            `)}
          </select>
        </div>
        <div class="form-field checkbox-field">
          <input type="checkbox" id="spike" ?checked=${this.spike} @change=${this._handleSpikeChange} ?disabled=${!this.canEdit}>
          <label for="spike">Spike</label>
        </div>
        <div class="form-field checkbox-field">
          <input type="checkbox" id="expedited" ?checked=${this.expedited} @change=${this._handleExpeditedChange} ?disabled=${!this.canEdit}>
          <label for="expedited">Expedited</label>
        </div>
        <div class="form-field inline">
          <label class="${this._getLabelClass('businessPoints')}" title="Business Points">Bus. Points</label>
          <select class="points-select ${this._getFieldClass('businessPoints')}" .value=${String(this.businessPoints)} @change=${this._handleBusinessPointsChange} ?disabled=${!this.canEdit}>
            ${this.getPointsOptions().map(this._renderPointsOption.bind(this, 'businessPoints'))}
          </select>
        </div>
        <div class="form-field inline">
          <label class="${this._getLabelClass('devPoints')}" title="Development Points">Dev. Points</label>
          <select class="points-select ${this._getFieldClass('devPoints')}" .value=${String(this.devPoints)} @change=${this._handleDevPointsChange} ?disabled=${!this.canEdit || this.spike} title=${this.spike ? 'No aplica para Spikes' : ''}>
            ${this.getPointsOptions().map(this._renderPointsOption.bind(this, 'devPoints'))}
          </select>
        </div>
      </div>

      <!-- Fila 2: Personas -->
      <div class="form-row compact-row">
        <div class="form-field inline">
          <label class="${this._getLabelClass('developer')}">Developer</label>
          ${this.canEdit ? html`
            <select
              class="${this._getFieldClass('developer')}"
              .value=${developerValue}
              @change=${this._handleDeveloperChange}
              ?disabled=${!this._canEditDeveloperField()}
              title=${!this._canEditDeveloperField() ? 'Solo el developer asignado o SuperAdmin pueden cambiar este campo' : ''}
            >
              ${developerOptions
                .filter(dev => APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(dev.value) || !this._isCoDeveloperSelected(dev.value))
                .map(dev => html`
                  <option value=${dev.value} ?selected=${this._isDeveloperSelected(dev.value)}>${dev.display}</option>
                `)}
            </select>
          ` : html`
            <div class="readonly-field"><span>${this._getDeveloperDisplayText()}</span></div>
          `}
        </div>
        <div class="form-field inline">
          <label>CoDev</label>
          ${this.canEdit ? html`
            <select class="${this._getFieldClass('coDeveloper')}" .value=${this.coDeveloper || ''} @change=${this._handleCoDeveloperChange}>
              <option value="" ?selected=${!this.coDeveloper}>Sin CoDev</option>
              ${this.getProcessedDeveloperList()
                .filter(dev => !APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(dev.value) && !this._isDeveloperSelected(dev.value))
                .map(dev => html`
                  <option value=${dev.value} ?selected=${this._isCoDeveloperSelected(dev.value)}>${dev.display}</option>
                `)}
            </select>
          ` : html`
            <div class="readonly-field"><span>${this._getCoDeveloperDisplayText()}</span></div>
          `}
        </div>
        <div class="form-field inline">
          <label class="${this._getLabelClass('validator')}">Validator</label>
          <select class="${this._getFieldClass('validator')}" .value=${this.validator || ''} @change=${this._handleValidatorChange} ?disabled=${!this.canEdit}>
            ${this.getProcessedStakeholderList().map(stakeholder => html`
              <option value=${stakeholder.value} ?selected=${this._isValidatorSelected(stakeholder.value)}>${stakeholder.display || 'Sin validator'}</option>
            `)}
          </select>
        </div>
        <div class="form-field inline">
          <label>CoValidator</label>
          <select class="${this._getFieldClass('coValidator')}" .value=${this.coValidator || ''} @change=${this._handleCoValidatorChange} ?disabled=${!this.canEdit}>
            ${this._getCoValidatorStakeholderList().map(stakeholder => html`
              <option value=${stakeholder.value} ?selected=${this._isCoValidatorSelected(stakeholder.value)}>${stakeholder.display || 'Sin CoValidator'}</option>
            `)}
          </select>
        </div>
      </div>

      <!-- Fila 3: Categorización y Fechas -->
      <div class="form-row compact-row">
        <div class="form-field inline">
          <label class="${this._getLabelClass('epic')}">Epic</label>
          <select class="${this._getFieldClass('epic')}" @change=${this._handleEpicChange} ?disabled=${!this.canEdit}>
            ${this.epicList.map(epic => html`
              <option value=${epic.id} ?selected=${this.selectedEpicId === epic.id}>${epic.name}</option>
            `)}
          </select>
        </div>
        <div class="form-field inline">
          <label class="${this._getLabelClass('sprint')}">Sprint</label>
          <select class="${this._getFieldClass('sprint')}" @change=${this._handleSprintChange} ?disabled=${!this.canEdit}>
            <option value="">No Sprint</option>
            ${Object.entries(this._filterSprintsByYear(this.globalSprintList || {})).map(this._renderSprintOption.bind(this))}
          </select>
        </div>
        ${this.projectRepositories.length > 1 ? html`
          <div class="form-field inline">
            <label>Repo</label>
            <select class="${this._getFieldClass('repositoryLabel')}"
                    .value=${this._getEffectiveRepoLabel()}
                    @change=${this._handleRepositoryLabelChange}
                    ?disabled=${!this.canEdit}>
              ${this.projectRepositories.map(repo => html`
                <option value=${repo.label} ?selected=${this._getEffectiveRepoLabel() === repo.label}>${repo.label}</option>
              `)}
            </select>
          </div>
        ` : ''}
        <div class="form-field inline">
          <label class="${this._getLabelClass('startDate')}">Start</label>
          <input type="datetime-local" class="${this._getFieldClass('startDate')}" .value=${extractDateTimeLocal(this.startDate, 'start')} @change=${this._handleStartDateChange} ?disabled=${!this.canEdit || !!this.startDate}>
        </div>
        <div class="form-field inline">
          <label class="${this._getLabelClass('endDate')}">End</label>
          <input type="datetime-local" class="${this._getFieldClass('endDate')}" .value=${extractDateTimeLocal(this.endDate, 'end')} @change=${this._handleEndDateChange} ?disabled=${!this.canEdit}>
        </div>
        ${this.validatedAt ? html`
        <div class="form-field inline">
          <label>Validated</label>
          <input type="datetime-local" .value=${extractDateTimeLocal(this.validatedAt)} disabled>
        </div>
        ` : ''}
        ${this._renderTimeMetrics()}
      </div>
      ${this.reopenCount > 0 ? html`
      <div class="reopen-info">
        <div class="reopen-header" @click=${this._toggleReopenCycles}>
          <span class="reopen-badge">🔄 Reabierta ${this.reopenCount} ${this.reopenCount === 1 ? 'vez' : 'veces'}</span>
          <span class="reopen-toggle">${this._reopenCyclesExpanded ? '▼' : '▶'}</span>
        </div>
        ${this._reopenCyclesExpanded && Array.isArray(this.reopenCycles) ? html`
        <div class="reopen-cycles-list">
          ${this.reopenCycles.map((cycle, idx) => html`
          <div class="reopen-cycle-item">
            <strong>Ciclo #${cycle.cycle || idx + 1}</strong>
            <span>Reabierta: ${this._formatDateTimeShort(cycle.reopenedAt)}</span>
            <span>Por: ${cycle.reopenedBy || 'N/A'}</span>
            <span>Estado anterior: ${cycle.previousStatus || 'N/A'}</span>
            ${cycle.previousEndDate ? html`<span>End anterior: ${cycle.previousEndDate}</span>` : ''}
          </div>
          `)}
        </div>
        ` : ''}
      </div>
      ` : ''}

      ${this._isStatusBlocked() ? html`
        <div class="blocked-fields-row">
          <div class="blocked-field-group">
            <div class="blocked-field-header">
              <input type="checkbox" id="blockedBusiness" ?checked=${this.blockedByBusiness} @change=${this._handleBusinessBlockChange} ?disabled=${!this.canEdit}>
              <label for="blockedBusiness">🔴 Business Blocked</label>
              <select @change=${this._handleBbbWhoChange} ?disabled=${!this.canEdit || !this.blockedByBusiness}>
                <option value="">Quién bloquea...</option>
                ${(Array.isArray(this.stakeholders) ? this.stakeholders : []).map(stakeholder => {
                  const stakeholderName = typeof stakeholder === 'object' && stakeholder.name ? stakeholder.name : stakeholder;
                  const stakeholderValue = typeof stakeholder === 'object' && stakeholder.email ? stakeholder.email : stakeholder;
                  return html`<option value=${stakeholderValue} ?selected=${this.bbbWho === stakeholderValue}>${stakeholderName}</option>`;
                })}
              </select>
            </div>
            <textarea
              rows="3"
              placeholder="Razón del bloqueo..."
              .value=${this.bbbWhy || ''}
              @input=${this._handleBbbWhyChange}
              ?disabled=${!this.canEdit || !this.blockedByBusiness}
            ></textarea>
          </div>

          <div class="blocked-field-group">
            <div class="blocked-field-header">
              <input type="checkbox" id="blockedDev" ?checked=${this.blockedByDevelopment} @change=${this._handleDevelopmentBlockChange} ?disabled=${!this.canEdit}>
              <label for="blockedDev">🔵 Dev Blocked</label>
              <select @change=${this._handleBbdWhoChange} ?disabled=${!this.canEdit || !this.blockedByDevelopment}>
                <option value="">Quién bloquea...</option>
                ${(Array.isArray(this.developers) ? this.developers : []).map(dev => {
                  const devName = typeof dev === 'object' && dev.name ? dev.name : dev;
                  const devValue = typeof dev === 'object' && dev.email ? dev.email : dev;
                  return html`<option value=${devValue} ?selected=${this.bbdWho === devValue}>${devName}</option>`;
                })}
              </select>
            </div>
            <textarea
              rows="3"
              placeholder="Razón del bloqueo..."
              .value=${this.bbdWhy || ''}
              @input=${this._handleBbdWhyChange}
              ?disabled=${!this.canEdit || !this.blockedByDevelopment}
            ></textarea>
          </div>
        </div>
      ` : ''}

      <color-tabs active-tab=${this.activeTab} @tab-changed=${this._handleTabChanged}>
        <color-tab name="description" label="Description" color="var(--description-color)">
          <div class="description-panel">
          <div class="structured-description">
            <label>Como (rol/persona):</label>
            <input
              type="text"
              class="${this._getFieldClass('description')}"
              placeholder="Ej: usuario de negocio"
              .value=${descriptionEntry.role || ''}
              @input=${this._handleRoleChange}
              ?disabled=${!this.canEdit}
            />
            <label>Quiero (acción/funcionalidad):</label>
            <input
              type="text"
              class="${this._getFieldClass('description')}"
              placeholder="Ej: gestionar mis proyectos"
              .value=${descriptionEntry.goal || ''}
              @input=${this._handleGoalChange}
              ?disabled=${!this.canEdit}
            />
            <label>Para (beneficio/valor):</label>
            <input
              type="text"
              class="${this._getFieldClass('description')}"
              placeholder="Ej: optimizar el tiempo de entrega"
              .value=${descriptionEntry.benefit || ''}
              @input=${this._handleBenefitChange}
              ?disabled=${!this.canEdit}
            />
            ${this.canEdit ? html`
              <button
                type="button"
                class="improve-ia-button ${this._isConvertingDescription ? 'disabled' : ''}"
                @click=${this._improveDescriptionWithIa}
                ?disabled=${this._isConvertingDescription}
                title="Optimizar descripción con IA"
              >${this._isConvertingDescription ? '⏳ Optimizando...' : '✨ Mejorar con IA'}</button>
            ` : ''}
            ${descriptionEntry.legacy && !hasStructuredFields ? html`
              <div class="legacy-description">
                <label>
                  Descripción existente
                  ${this.canEdit ? html`
                    <span
                      class="convert-ia-btn ${this._isConvertingDescription ? 'disabled' : ''}"
                      role="button"
                      tabindex="0"
                      @click=${this._convertLegacyDescription}
                      @keydown=${(e) => (e.key === 'Enter' || e.key === ' ') && this._convertLegacyDescription()}
                      title="Convertir a Como/Quiero/Para con IA"
                    >${this._isConvertingDescription ? '⏳' : 'IA'}</span>
                  ` : ''}
                </label>
                <textarea disabled>${descriptionEntry.legacy}</textarea>
              </div>
            ` : ''}
          </div>
        </div>
        </color-tab>
        <color-tab name="acceptanceCriteria" label="Acceptance Criteria" color="var(--acceptanceCriteria-color)">
        <div class="acceptance-criteria-panel">
          <div class="scenario-table-wrapper">
            <table class="scenario-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dado</th>
                  <th>Cuando</th>
                  <th>Entonces</th>
                  <th class="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${(acceptanceScenarios.length > 0 ? acceptanceScenarios : [{ given: '', when: '', then: '', raw: '' }]).map((scenario, idx) => html` ${/* NOSONAR - Gherkin scenario */ ''}
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="ellipsis" title=${scenario.given || ''}>${scenario.given || ''}</td>
                    <td class="ellipsis" title=${scenario.when || ''}>${scenario.when || ''}</td>
                    <td class="ellipsis" title=${scenario.then || ''}>${scenario.then || ''}</td>
                    <td class="actions">
                      <span class="icon-button" role="button" title="Editar" @click=${() => this._openScenarioModal(idx)} aria-label="Editar escenario">✏️</span>
                      ${this.acceptanceCriteriaStructured.length > 1 ? html`
                        <span class="icon-button danger" role="button" title="Eliminar" @click=${() => this._removeScenario(idx)} aria-label="Eliminar escenario">🗑️</span>
                      ` : ''}
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
            <div class="scenario-actions">
              <button class="secondary-button" type="button" @click=${this._showRegenerateAcceptanceModal} ?disabled=${!this.canEdit}>Regenerar con IA</button>
              <button class="secondary-button" type="button" @click=${() => this._openScenarioModal(null)} ?disabled=${!this.canEdit}>+ Añadir escenario</button>
            </div>
          </div>
        </div>
        </color-tab>
        <color-tab name="notes" label="${this._getNotesTabLabel()}" color="var(--notes-color)">
        <div class="notes-panel">
          ${this.renderNotesPanel()}
        </div>
        </color-tab>
        <color-tab name="attachment" label="Adjunto" color="var(--color-pink-700)">
        <div class="attachment-panel">
          <div class="attachment-section">
            <label>Archivo adjunto:</label>
            <firebase-storage-uploader
              storage-path="task-attachments/${this.projectId}/${this.cardId}"
              filename-template="task_${this.cardId}_attachment"
              file-url=${this.attachment || ''}
              @file-uploaded=${this._handleAttachmentUploaded}
              @file-deleted=${this._handleAttachmentDeleted}
            ></firebase-storage-uploader>
          </div>
        </div>
        </color-tab>
        <color-tab name="relatedTasks" label="Related Tasks" color="var(--color-gray-600)">
        <div class="related-tasks-panel">
          <div class="related-tasks-section">
            <div class="related-tasks-header">
              <label>Tareas relacionadas:</label>
              <button class="add-related-task-btn" @click=${this._handleAddRelatedTask}>
                + Añadir tarea
              </button>
            </div>
            <div class="related-tasks-list">
              ${this.relatedTasks && this.relatedTasks.length > 0 ? (() => {
return html`${this.relatedTasks.map(this._renderRelatedTaskItem.bind(this))}`;
      })() : (() => {
return html`<div class="no-related-tasks">No hay tareas relacionadas</div>`;
      })()}
            </div>
          </div>
        </div>
        </color-tab>
        <color-tab name="implementationPlan" label="Plan" color="#9333ea">
        ${this._renderSpecsAndPlanTab()}
        </color-tab>
        ${this.implementationNotes ? html`
        <color-tab name="implementationNotes" label="Dev Notes" color="#16a34a">
        <div class="implementation-notes-panel">
          <div class="implementation-notes-content">
            <pre class="implementation-notes-text">${this.implementationNotes}</pre>
          </div>
        </div>
        </color-tab>
        ` : ''}
        <color-tab name="commits" label="${this._getCommitsTabLabel()}" color="#0ea5e9">
        ${this.renderCommitsPanel()}
        </color-tab>
        ${this._getAiUsageArray().length > 0 ? html`
        <color-tab name="aiUsage" label="${this._getAiUsageTabLabel()}" color="#8b5cf6">
        ${this.renderAiUsagePanel()}
        </color-tab>
        ` : ''}
        <color-tab name="history" label="Histórico" color="var(--color-orange-800)">
        <div class="history-panel">
          <card-history-viewer
            .projectId=${this.projectId}
            .cardType=${this.cardType}
            .cardId=${this.cardId}>
          </card-history-viewer>
        </div>
        </color-tab>
      </color-tabs>

      ${this.scenarioModalOpen ? html`
        <!-- Escenario modal manejado vía AppModal -->
      ` : ''}

      <div class="expanded-footer ia-footer">
        <div class="footer-left"></div>
        <div style="display:flex; justify-content:center;">
          <button class="save-button" @click=${this._handleSave} ?disabled=${!this.canSave}>Save</button>
        </div>
        <div class="footer-right">
          <span class="icon-btn" role="button" title="Copiar enlace" @click=${(e) => { e.stopPropagation(); this.copyCardUrl(); }}>🔗</span>
          <span class="icon-btn" role="button" title="Historial de tiempos" @click=${(e) => { e.stopPropagation(); this._showStateHistory(); }}>⏱️</span>
          ${this.canMoveToProject ? html`
            <span class="icon-btn" role="button" title="Mover a otro proyecto" @click=${(e) => { e.stopPropagation(); this._handleMoveToProject(e); }}>📦</span>
          ` : ''}
          ${this.canDelete ? html`
            <span class="icon-btn" role="button" title="Eliminar" @click=${(e) => { e.stopPropagation(); this.showDeleteModal(); }}>🗑️</span>
          ` : ''}
          ${this._projectHasIa() && this._isNotDone() ? html`
            <span class="icon-btn" role="button" title="Generar enlace IA (1 uso, 15 min)" @click=${(e) => { e.stopPropagation(); this._generateIaLink(); }}>🤖</span>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * The _updateDeveloperHistory function adds a new entry with the developer and timestamp to the
   * developerHistory array.
   */
  _updateDeveloperHistory() {
    if (!this.developerHistory) {
      this.developerHistory = [];
    }

    const lastEntry = this.developerHistory.length > 0 ? this.developerHistory[this.developerHistory.length - 1] : null;

    // Solo agregar si el valor de developer es diferente al último registrado
    if (!lastEntry || lastEntry.developer !== this.developer) {
      this.developerHistory.push({
        developer: this.developer,
        timestamp: new Date().toISOString()
      });
    }
  }

  _updateBlockHistory() {
    const blockHistory = [...(this.blockedHistory || [])];
    this.originalStatus = this.status;
    const currentUserEmail = this._getCurrentUserEmail();

    if (this.blockedByBusiness && !this.bbbWho) {
      this.bbbWho = currentUserEmail;
      blockHistory.push({ type: 'Business', action: 'Blocked', by: currentUserEmail, date: new Date().toISOString() });
    } else if (!this.blockedByBusiness && this.bbbWho) {
      blockHistory.push({ type: 'Business', action: 'Unblocked', by: currentUserEmail, date: new Date().toISOString() });
      this.bbbWho = '';
      this.bbbWhy = '';
    }

    if (this.blockedByDevelopment && !this.bbdWho) {
      this.bbdWho = currentUserEmail;
      blockHistory.push({ type: 'Development', action: 'Blocked', by: currentUserEmail, date: new Date().toISOString() });
    } else if (!this.blockedByDevelopment && this.bbdWho) {
      blockHistory.push({ type: 'Development', action: 'Unblocked', by: currentUserEmail, date: new Date().toISOString() });
      this.bbdWho = '';
      this.bbdWhy = '';
    }
  }

  getFormatedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Asegura dos dígitos en el mes
    const day = String(date.getDate()).padStart(2, '0'); // Asegura dos dígitos en el día
    return `${year}-${month}-${day}`;
  }

  // ============================
  // Specs & Plan tab methods
  // ============================

  _getNormalizedPlan() {
    const empty = { approach: '', steps: [], dataModelChanges: '', apiChanges: '', risks: '', outOfScope: '', planStatus: 'pending' };
    if (!this.implementationPlan) {
      return empty;
    }
    // Legacy: if string (old MCP data), migrate to structured object
    if (typeof this.implementationPlan === 'string') {
      return { ...empty, approach: this.implementationPlan, planStatus: 'proposed' };
    }
    return { ...empty, ...this.implementationPlan };
  }

  _updatePlanField(field, value) {
    const plan = this._getNormalizedPlan();
    plan[field] = value;
    this.implementationPlan = { ...plan };
  }

  _handlePlanStatusChange(e) {
    this._updatePlanField('planStatus', e.target.value);
  }

  _addPlanStep() {
    const plan = this._getNormalizedPlan();
    plan.steps = [...plan.steps, { description: '', files: '', status: 'pending' }];
    this.implementationPlan = { ...plan };
  }

  _updatePlanStep(index, field, value) {
    const plan = this._getNormalizedPlan();
    plan.steps = plan.steps.map((s, i) => i === index ? { ...s, [field]: value } : s);
    this.implementationPlan = { ...plan };
  }

  _removePlanStep(index) {
    const plan = this._getNormalizedPlan();
    plan.steps = plan.steps.filter((_, i) => i !== index);
    this.implementationPlan = { ...plan };
  }

  _renderPlanSteps(steps) {
    if (!steps || steps.length === 0) {
      return html`<div class="empty-steps">No hay pasos definidos</div>`;
    }
    return html`
      <div class="plan-steps-list">
        ${steps.map((step, i) => html`
          <div class="plan-step ${step.status}">
            <div class="step-header">
              <span class="step-number">#${i + 1}</span>
              <select .value=${step.status} @change=${(e) => this._updatePlanStep(i, 'status', e.target.value)}
                ?disabled=${!this.canSave}>
                <option value="pending">Pendiente</option>
                <option value="in_progress">En curso</option>
                <option value="done">Hecho</option>
              </select>
              ${this.canSave ? html`
                <button type="button" class="remove-step-btn" @click=${() => this._removePlanStep(i)}>×</button>
              ` : ''}
            </div>
            <textarea .value=${step.description} @input=${(e) => this._updatePlanStep(i, 'description', e.target.value)}
              placeholder="Descripción del paso" rows="2" ?disabled=${!this.canSave}></textarea>
            <input type="text" .value=${step.files || ''} @input=${(e) => this._updatePlanStep(i, 'files', e.target.value)}
              placeholder="Ficheros afectados (separados por comas)" ?disabled=${!this.canSave} />
          </div>
        `)}
      </div>
    `;
  }

  _renderSpecsAndPlanTab() {
    const plan = this._getNormalizedPlan();

    return html`
      <div class="specs-plan-container">
        <div class="plan-section">
          <div class="plan-header">
            <h4>Plan de Implementación</h4>
            <select class="plan-status-select" .value=${plan.planStatus}
              @change=${this._handlePlanStatusChange} ?disabled=${!this.canSave}>
              <option value="pending">Pendiente</option>
              <option value="proposed">Propuesto</option>
              <option value="validated">Validado</option>
              <option value="in_progress">En ejecución</option>
              <option value="completed">Completado</option>
            </select>
          </div>

          <div class="plan-field">
            <label>Enfoque técnico</label>
            <textarea .value=${plan.approach} @input=${(e) => this._updatePlanField('approach', e.target.value)}
              placeholder="Describe el enfoque técnico para resolver esta tarea" rows="3"
              ?disabled=${!this.canSave}></textarea>
          </div>

          <div class="plan-field">
            <label>Pasos de implementación</label>
            ${this._renderPlanSteps(plan.steps)}
            ${this.canSave ? html`
              <button type="button" class="add-step-btn" @click=${this._addPlanStep}>+ Añadir paso</button>
            ` : ''}
          </div>

          <div class="plan-two-col">
            <div class="plan-field">
              <label>Cambios en modelo de datos</label>
              <textarea .value=${plan.dataModelChanges} @input=${(e) => this._updatePlanField('dataModelChanges', e.target.value)}
                placeholder="Campos nuevos, migraciones..." rows="2" ?disabled=${!this.canSave}></textarea>
            </div>
            <div class="plan-field">
              <label>Cambios en API</label>
              <textarea .value=${plan.apiChanges} @input=${(e) => this._updatePlanField('apiChanges', e.target.value)}
                placeholder="Endpoints, Cloud Functions..." rows="2" ?disabled=${!this.canSave}></textarea>
            </div>
          </div>

          <div class="plan-two-col">
            <div class="plan-field">
              <label>Riesgos</label>
              <textarea .value=${plan.risks} @input=${(e) => this._updatePlanField('risks', e.target.value)}
                placeholder="Riesgos identificados" rows="2" ?disabled=${!this.canSave}></textarea>
            </div>
            <div class="plan-field">
              <label>Fuera de alcance</label>
              <textarea .value=${plan.outOfScope} @input=${(e) => this._updatePlanField('outOfScope', e.target.value)}
                placeholder="Lo que NO se hará" rows="2" ?disabled=${!this.canSave}></textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getWCProps() {
    this._syncStructuredFields();

    const props = this._buildPersistentProps(TASK_SCHEMA.PERSISTENT_FIELDS);

    // Task-specific transformations (structured fields use custom serializers)
    props.descriptionStructured = this._getDescriptionStructuredForSave();
    props.acceptanceCriteriaStructured = this._getAcceptanceCriteriaStructuredForSave();

    // Defaults for array/value fields
    props.developerHistory = this.developerHistory || [];
    props.blockedHistory = this.blockedHistory || [];
    props.relatedTasks = this.relatedTasks || [];
    props.repositoryLabel = this.repositoryLabel || '';
    props.year = this.year || this._getSelectedYear();
    props.commits = this.commits || [];
    props.validatedAt = this.validatedAt || '';
    props.reopenCycles = this.reopenCycles || [];
    props.reopenCount = this.reopenCount || 0;
    props.implementationNotes = this.implementationNotes || '';
    if (this.pipelineStatus) props.pipelineStatus = this.pipelineStatus;

    // Validate status
    if (!props.status || props.status.trim() === '') {
      props.status = (this.statusList && this.statusList.length > 0) ? this.statusList[0] : 'To Do';
    }

    return props;
  }

  _confirmDelete() {
    const cardProps = this.getWCProps();
    document.dispatchEvent(new CustomEvent('delete-card', {
      detail: {
        cardData: cardProps,
        confirmed: true
      }
    }));
  }

  _showRegenerateAcceptanceModal() {
    // If no existing criteria, regenerate directly without confirmation
    const hasExistingCriteria = Array.isArray(this.acceptanceCriteriaStructured) &&
      this.acceptanceCriteriaStructured.length > 0;

    if (!hasExistingCriteria) {
      this._regenerateAcceptanceCriteria();
      return;
    }

    // Show confirmation only when there are existing criteria to replace
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Regenerar Acceptance Criteria',
          message: 'Esto reemplazará los criterios actuales por una versión generada con IA. ¿Quieres continuar?',
          button1Text: 'Regenerar',
          button2Text: 'Cancelar',
          button1css: 'background-color: #6366f1; color: white;',
          button2css: 'background-color: #6b7280; color: white;',
          button1Action: () => this._regenerateAcceptanceCriteria(),
          button2Action: () => { }
        }
      }
    }));
  }

  async _regenerateAcceptanceCriteria() {
    const generated = await this._generateAcceptanceCriteriaWithIa({ force: true });
    if (generated) {
      this._showNotification('Acceptance Criteria regenerados con IA', 'success');
    }
  }

  async _generateAcceptanceCriteriaWithIa({ force = false, usePayload = false } = {}) {
    // Show loading layer
    const loadingLayer = this._showAcceptanceLoading();

    try {
      if (!this.projectId) {
        this._attemptToLoadProjectFromContext();
      }
      const projectId = this.projectId;
      const taskId = this.getIdForFirebase();
      if (!projectId || (!taskId && !usePayload)) {
        if (!usePayload) {
          this._hideAcceptanceLoading(loadingLayer);
          this._showNotification('Falta projectId o ID de Firebase para generar criterios', 'error');
          return false;
        }
        if (!projectId) {
          this._hideAcceptanceLoading(loadingLayer);
          this._showNotification('Falta projectId para generar criterios', 'error');
          return false;
        }
      }

      const callable = httpsCallable(functions, 'generateAcceptanceCriteria');
      const payload = {
        projectId,
        taskId,
        force
      };
      if (usePayload) {
        payload.task = {
          title: this.title,
          description: this.description,
          descriptionStructured: this._getDescriptionStructuredForSave(),
          notes: this.notes,
          acceptanceCriteriaStructured: this._getAcceptanceCriteriaStructuredForSave()
        };
      }
      const response = await callable(payload);
      const responsePayload = response?.data || {};

      // Hide loading layer
      this._hideAcceptanceLoading(loadingLayer);

      if (!Array.isArray(responsePayload.acceptanceCriteriaStructured)) {
const reason = responsePayload?.error || responsePayload?.message || 'Respuesta sin escenarios';
        this._showNotification(`No se pudo generar Acceptance Criteria con IA: ${reason}`, 'error');
        return false;
      }

      this.acceptanceCriteriaStructured = responsePayload.acceptanceCriteriaStructured;
      this.acceptanceCriteria = responsePayload.acceptanceCriteria || this._buildAcceptanceText();
      this.requestUpdate();
      return true;
    } catch (error) {
      // Hide loading layer on error
      this._hideAcceptanceLoading(loadingLayer);

      const reason = typeof error?.details === 'string'
        ? error.details
        : (error?.message || 'Error desconocido');
this._showNotification(`No se pudo generar Acceptance Criteria con IA: ${reason}`, 'error');
      return false;
    }
  }

  /**
   * Show loading layer for acceptance criteria generation
   * @returns {HTMLElement} The loading layer element
   */
  _showAcceptanceLoading() {
    const loading = document.createElement('loading-layer');
    loading.setAttribute('color', '#6366f1');
    loading.setAttribute('message', 'Generando Acceptance tests. Esta acción puede tardar más de un minuto');
    loading.setAttribute('size', '80');
    loading.setAttribute('stroke-width', '6');
    loading.setAttribute('visible', '');
    // Asegurar posicionamiento fijo y z-index por encima del saving-overlay (10000) y modales
    loading.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; z-index: 10001 !important;';
    document.body.appendChild(loading);
    return loading;
  }

  /**
   * Hide and remove loading layer
   * @param {HTMLElement} loadingLayer - The loading layer element to remove
   */
  _hideAcceptanceLoading(loadingLayer) {
    if (loadingLayer?.parentNode) {
      loadingLayer.removeAttribute('visible');
      // Small delay to allow animation before removing
      setTimeout(() => {
        loadingLayer.remove();
      }, 300);
    }
  }

  showDeleteModal(event) {
    event?.stopPropagation(); // Evita que el evento de clic se propague al contenedor
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'WARNING!',
          message: `Are you sure you want to delete <b>${this.title}</b>?`,
          button1Text: 'Yes',
          button2Text: 'No',
          button1css: 'background-color: #10b981',
          button2css: 'background-color: #f43f5e',
          button1Action: () => this._confirmDelete(),
          button2Action: () => { } // Just close the modal
        }
      }
    }));
  }

  // Input handlers

  _handleBusinessPointsChange(e) {
    const previousPoints = this.businessPoints;
    const newPoints = Number(e.target.value);

    this.businessPoints = newPoints;

    // Usar el sistema de BaseCard para trackear cambios
    this.handleStatusPriorityChange('businessPoints', newPoints, previousPoints);
  }

  _handleDevPointsChange(e) {
    const previousPoints = this.devPoints;
    const newPoints = Number(e.target.value);

    this.devPoints = newPoints;

    // Usar el sistema de BaseCard para trackear cambios
    this.handleStatusPriorityChange('devPoints', newPoints, previousPoints);
  }

  _handleStartDateChange(e) {
    this.startDate = generateTimestamp(e.target.value, 'start');
    this._enforceDateCoherence();
  }

  _handleEndDateChange(e) {
    const newEnd = generateTimestamp(e.target.value, 'end');
    if (!this._validateEndDateChange(newEnd)) {
      e.target.value = this.endDate ? extractDateTimeLocal(this.endDate, 'end') : '';
      return;
    }
    this.endDate = newEnd;
  }
  _handleSprintChange(e) {
    const newValue = e.target.value;
    if (this.sprint !== newValue) {
      this.sprint = newValue;

      // Update year based on sprint's year
      if (newValue) {
        const sprintList = window.globalSprintList || this.globalSprintList || this.sprintList || {};
        const selectedSprint = sprintList[newValue];
        if (selectedSprint?.year) {
          const sprintYear = Number(selectedSprint.year);
          if (sprintYear && this.year !== sprintYear) {
            this.year = sprintYear;
            this.requestUpdate('year', null);
          }
        }
      }

      // Forzar la actualización del componente
      this.requestUpdate('sprint', null);
    }
  }
  _handleSpikeChange(e) { this.spike = e.target.checked; }
  _handleExpeditedChange(e) { this.expedited = e.target.checked; }
  _handleBbdWhyChange(e) { this.bbdWhy = e.target.value; }
  _handleBbbWhyChange(e) { this.bbbWhy = e.target.value; }
  _handleDeveloperChange(e) {
    const previousDeveloper = this.developer;
    const newDeveloper = e.target.value;
    const isUnassigned = !newDeveloper || APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(newDeveloper);

    let canonicalValue;
    let canonicalName;

    if (isUnassigned) {
      canonicalValue = APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE;
      canonicalName = APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES;
    } else if (newDeveloper.startsWith('dev_')) {
      // Es un entity ID - usar entityDirectoryService
      canonicalValue = newDeveloper;
      const selectText = e.target.selectedOptions[0]?.textContent?.trim?.();
      canonicalName = selectText || entityDirectoryService.getDeveloperDisplayName(newDeveloper) || newDeveloper;
    } else {
      // Formato legacy (email o nombre)
      const normalizedInfo = normalizeDeveloperEntry(newDeveloper);
      canonicalValue = normalizedInfo.email || normalizedInfo.sourceEmail || newDeveloper;
      canonicalName = normalizedInfo.name ||
        e.target.selectedOptions[0]?.textContent?.trim?.() ||
        (canonicalValue?.includes('@') ? this._formatNameFromEmail(canonicalValue) : canonicalValue);
    }

    this.developer = canonicalValue;
    this.developerName = canonicalName;

    // Usar el sistema de BaseCard para trackear cambios
    this.handleUserFieldChange('developer', canonicalValue, previousDeveloper);
  }
  _handleCoDeveloperChange(e) {
    const previousCoDeveloper = this.coDeveloper;
    const newCoDeveloper = e.target.value;
// Guardar el valor directamente (ya es un entity ID o vacío)
    this.coDeveloper = newCoDeveloper || '';

    // Usar el sistema de BaseCard para trackear cambios
    this.handleUserFieldChange('coDeveloper', this.coDeveloper, previousCoDeveloper);
  }
  _handleEpicChange(e) { this.epic = e.target.value; }
  _handleValidatorChange(e) {
    const previousValidator = this.validator;
    const newValidator = e.target.value;
    this.validator = newValidator;

    // Si el nuevo validator es el mismo que el coValidator, limpiar coValidator
    if (this.coValidator && this.coValidator === newValidator) {
      this.coValidator = '';
    }

    // Usar el sistema de BaseCard para trackear cambios
    this.handleUserFieldChange('validator', newValidator, previousValidator);
  }

  _handleCoValidatorChange(e) {
    const previousCoValidator = this.coValidator;
    const newCoValidator = e.target.value;
    this.coValidator = newCoValidator;

    // Usar el sistema de BaseCard para trackear cambios
    this.handleUserFieldChange('coValidator', newCoValidator, previousCoValidator);
  }

  _handleRepositoryLabelChange(e) {
    const newLabel = e.target.value;
this.repositoryLabel = newLabel;
    this.requestUpdate();
  }

  _handleRoleChange(e) {
    this._setDescriptionStructuredEntry({ role: e.target.value });
    this.description = this._buildDescriptionText();
  }

  _handleGoalChange(e) {
    this._setDescriptionStructuredEntry({ goal: e.target.value });
    this.description = this._buildDescriptionText();
  }

  _handleBenefitChange(e) {
    this._setDescriptionStructuredEntry({ benefit: e.target.value });
    this.description = this._buildDescriptionText();
  }

  _updateScenarioField(index, field, value) {
    const scenarios = [...this._getAcceptanceCriteriaStructuredList()];
    if (!scenarios[index]) {
      scenarios[index] = { given: '', when: '', then: '', raw: '' }; // NOSONAR - Gherkin scenario
    }
    scenarios[index] = { ...scenarios[index], [field]: value, raw: '' };
    this.acceptanceCriteriaStructured = scenarios;
    this.acceptanceCriteria = this._buildAcceptanceText();
  }

  _openScenarioModal(index = null) {
    this._hydrateStructuredAcceptance();

    const scenarios = this._getAcceptanceCriteriaStructuredList();
    if (!Array.isArray(this.acceptanceCriteriaStructured) && scenarios.length > 0) {
      this.acceptanceCriteriaStructured = scenarios;
    }
    const existing = index !== null && scenarios[index] ? scenarios[index] : null;

    openScenarioModal({
      existing,
      isNew: index === null,
      onSave: (scenario) => {
        const scenariosUpdated = [...this._getAcceptanceCriteriaStructuredList()];
        if (index === null || index === undefined) {
          scenariosUpdated.push(scenario);
        } else {
          scenariosUpdated[index] = scenario;
        }
        this.acceptanceCriteriaStructured = scenariosUpdated;
        this.acceptanceCriteria = this._buildAcceptanceText();
        this.requestUpdate();
      }
    });
  }

  _removeScenario(index) {
    const scenarios = this._getAcceptanceCriteriaStructuredList();
    if (scenarios.length <= 1) {
      this.acceptanceCriteriaStructured = [{ given: '', when: '', then: '', raw: '' }]; // NOSONAR - Gherkin scenario
      this.acceptanceCriteria = this._buildAcceptanceText();
      return;
    }
    const updated = [...scenarios];
    updated.splice(index, 1);
    this.acceptanceCriteriaStructured = updated;
    this.acceptanceCriteria = this._buildAcceptanceText();
  }
  async _handleStatusChange(e) {
    const previousStatus = this.status;
    const newStatus = e.target.value;
    const normalizedNewStatus = (newStatus || '').toLowerCase();
    const normalizedPrevStatus = (previousStatus || '').toLowerCase();

    if (newStatus === previousStatus) {
      return;
    }

    // Validar permisos para "Done&Validated"
    if (normalizedNewStatus === 'done&validated' && !this.canSetDoneValidated) {
      const notification = document.createElement('slide-notification');
      notification.message = 'Solo el Validator o CoValidator asignado pueden marcar como validado';
      notification.type = 'error';
      document.body.appendChild(notification);
      e.target.value = previousStatus;
      return;
    }

    if (normalizedNewStatus === 'in progress' && normalizedPrevStatus !== 'in progress') {
      // Validar campos requeridos para estado "In Progress" (sin startDate porque se auto-rellena)
      let requiredFields = ['epic', 'sprint', 'acceptanceCriteria', 'businessPoints', 'devPoints', 'developer', 'validator'];
      // Para Spikes, devPoints no es obligatorio
      if (this.spike) {
        requiredFields = requiredFields.filter(f => f !== 'devPoints');
      }
      const missing = this._getMissingRequiredFields(requiredFields);

      if (missing.length > 0) {
        this.invalidFields = missing;

        // Mostrar notificación con campos faltantes
        const notification = document.createElement('slide-notification');
        notification.message = `Para pasar a "In Progress", rellena los campos: ${missing.join(', ')}`;
        notification.type = 'warning';
        document.body.appendChild(notification);

        // Revertir el cambio de estado
        e.target.value = previousStatus;

        // Aplicar clases de invalid directamente al DOM
        this._applyInvalidClasses(missing);

        return;
      }

      this.invalidFields = [];
      this._clearInvalidClasses();

      const validationResult = await this._validateDeveloperInProgressLimit();
      if (!validationResult.allowed) {
        const userChoice = await this._showInProgressLimitWarning(validationResult);

        if (userChoice.action === 'cancel' || !userChoice.action) {
          e.target.value = previousStatus;
          this.status = previousStatus;
          return;
        }

        // El usuario eligió una acción para la tarea existente
        if (userChoice.existingTask && userChoice.action !== 'cancel') {
          await this._updateExistingTaskStatus(userChoice.existingTask, userChoice.action);
        }
      }

      // Auto-rellenar startDate solo si nunca se ha establecido (firstInProgressDate)
      // IMPORTANTE: startDate es INMUTABLE - una vez establecido, nunca se borra
      const firstInProgress = await stateTransitionService.getFirstInProgressDate(
        this.projectId, this.cardType || 'task-card', this.cardId
      );
      if (!firstInProgress && !this.startDate) {
        this.startDate = generateTimestamp(new Date(), 'start');
      }
    }
    // NOTE: startDate is IMMUTABLE - never cleared when returning to To Do

    if (normalizedNewStatus === 'done&validated' && normalizedPrevStatus !== 'done&validated') {
      // Auto-rellenar validatedAt (fecha de validación)
      this.validatedAt = generateTimestamp(new Date(), 'end');

      // Si no hay endDate (caso raro), también lo rellenamos
      if (!this.endDate) {
        this.endDate = generateTimestamp(new Date(), 'end');
      }

      // Validar campos requeridos para estado "Done&Validated" (sin endDate/validatedAt porque se auto-rellenan)
      const requiredFields = ['title', 'epic', 'sprint', 'acceptanceCriteria', 'businessPoints', 'devPoints', 'startDate', 'developer', 'validator'];
      const missing = this._getMissingRequiredFields(requiredFields);

      if (missing.length > 0) {
        this.invalidFields = missing;

        // Mostrar notificación con campos faltantes
        const notification = document.createElement('slide-notification');
        notification.message = `Para completar la tarea, rellena los campos: ${missing.join(', ')}`;
        notification.type = 'warning';
        document.body.appendChild(notification);

        // Revertir el cambio de estado
        e.target.value = previousStatus;

        // Aplicar clases de invalid directamente al DOM
        this._applyInvalidClasses(missing);

        return;
      } else {
        this.invalidFields = [];
        this._clearInvalidClasses();
      }
    } else if (normalizedNewStatus !== 'done&validated' && normalizedPrevStatus === 'done&validated') {
      // Only clear dates if NOT going to Reopened (Reopened handles its own date clearing)
      if (normalizedNewStatus !== 'reopened') {
        this.endDate = '';
        this.validatedAt = '';
      }
      this.invalidFields = [];
      this._clearInvalidClasses();
    }

    // Validación estricta para estado "To validate"
    if (normalizedNewStatus === 'to validate' && normalizedPrevStatus !== 'to validate') {
      // Validar campos requeridos para estado "To validate" (incluye todos los de "In Progress" + developer y validator)
      const requiredFields = ['title', 'epic', 'sprint', 'acceptanceCriteria', 'businessPoints', 'devPoints', 'startDate', 'developer', 'validator'];
      const missing = this._getMissingRequiredFields(requiredFields);

      if (missing.length > 0) {
        this.invalidFields = missing;

        // Mostrar notificación con campos faltantes
        const notification = document.createElement('slide-notification');
        notification.message = `Para pasar a "To validate", rellena los campos: ${missing.join(', ')}`;
        notification.type = 'warning';
        document.body.appendChild(notification);

        // Revertir el cambio de estado
        e.target.value = previousStatus;

        // Aplicar clases de invalid directamente al DOM
        this._applyInvalidClasses(missing);

        return;
      } else {
        this.invalidFields = [];
        this._clearInvalidClasses();
      }

      // Always update endDate when transitioning to "To Validate" (marks end of development).
      // This must change on every transition because the Cloud Function validates
      // that endDate was updated in the same write.
      this.endDate = generateTimestamp(new Date(), 'end');
    }

    // Handle "Reopened" status - task needs rework after validation
    if (normalizedNewStatus === 'reopened') {
      // Only allow reopening from "To Validate" or "Done&Validated"
      if (normalizedPrevStatus !== 'to validate' && normalizedPrevStatus !== 'done&validated') {
        const notification = document.createElement('slide-notification');
        notification.message = 'Solo se puede reabrir desde "To Validate" o "Done&Validated"';
        notification.type = 'error';
        document.body.appendChild(notification);
        e.target.value = previousStatus;
        return;
      }

      // Increment reopen count
      const currentReopenCount = this.reopenCount || 0;
      this.reopenCount = currentReopenCount + 1;

      // Add entry to reopenCycles array
      const reopenCycles = Array.isArray(this.reopenCycles) ? [...this.reopenCycles] : [];
      const reopenEntry = {
        cycle: this.reopenCount,
        reopenedAt: new Date().toISOString(),
        reopenedBy: this._getCurrentUserEmail(),
        previousStatus: previousStatus,
        previousEndDate: this.endDate || null,
        previousValidatedAt: this.validatedAt || null
      };
      reopenCycles.push(reopenEntry);
      this.reopenCycles = reopenCycles;

      // Add note with [REOPEN #N] tag - user should add reason manually
      const reopenTag = `[REOPEN #${this.reopenCount}]`;
      const reopenNote = `${reopenTag} Tarea reabierta desde "${previousStatus}" el ${this.getFormatedDate(new Date())}`;

      // Prepend to notes if they exist, otherwise create new
      if (this.notes) {
        this.notes = `${reopenNote}\n\n${this.notes}`;
      } else {
        this.notes = reopenNote;
      }

      // Clear endDate and validatedAt for the new development cycle
      this.endDate = '';
      this.validatedAt = '';
    }

    // TimeLog tracking for Pausado status
    if (normalizedNewStatus === 'pausado' && normalizedPrevStatus === 'in progress') {
      const timeLog = Array.isArray(this.timeLog) ? [...this.timeLog] : [];
      timeLog.push({ event: 'paused', timestamp: new Date().toISOString(), by: this._getCurrentUserEmail() });
      this.timeLog = timeLog;
    }
    if (normalizedNewStatus === 'in progress' && normalizedPrevStatus === 'pausado') {
      const timeLog = Array.isArray(this.timeLog) ? [...this.timeLog] : [];
      timeLog.push({ event: 'resumed', timestamp: new Date().toISOString(), by: this._getCurrentUserEmail() });
      this.timeLog = timeLog;
      this._calculateTimeMetrics();
    }

    // NOTE: "Blocked" validation moved to _handleSave()
    // Selecting "Blocked" shows the blocked fields section, validation happens on save

    // Clear blocked fields when transitioning OUT of "Blocked" status
    if (normalizedPrevStatus === 'blocked' && normalizedNewStatus !== 'blocked') {
      // Save blocked info to notes before clearing
      const blockedInfo = [];
      if (this.blockedByBusiness && this.bbbWho) {
        const businessBlocker = this._getContactDisplayName(this.bbbWho, this.stakeholders);
        blockedInfo.push(`Negocio (${businessBlocker}): ${this.bbbWhy || 'Sin razón especificada'}`);
      }
      if (this.blockedByDevelopment && this.bbdWho) {
        const devBlocker = this._getContactDisplayName(this.bbdWho, this.developers);
        blockedInfo.push(`Desarrollo (${devBlocker}): ${this.bbdWhy || 'Sin razón especificada'}`);
      }

      if (blockedInfo.length > 0) {
        const unblockedNote = `[DESBLOQUEADO ${this.getFormatedDate(new Date())}]\nBloqueo resuelto:\n- ${blockedInfo.join('\n- ')}`;
        if (this.notes) {
          this.notes = `${unblockedNote}\n\n${this.notes}`;
        } else {
          this.notes = unblockedNote;
        }
      }

      // Clear all blocked fields
      this.blockedByBusiness = false;
      this.blockedByDevelopment = false;
      this.bbbWho = '';
      this.bbbWhy = '';
      this.bbdWho = '';
      this.bbdWhy = '';
    }

    this.status = newStatus;

    // Record state transition for temporal tracking
    stateTransitionService.recordTransition(
      { projectId: this.projectId, cardType: this.cardType || 'task-card', cardId: this.cardId },
      previousStatus,
      newStatus,
      this._getCurrentUserEmail()
    );

    // Usar el sistema de BaseCard para trackear cambios
    this.handleStatusPriorityChange('status', newStatus, previousStatus);
    this._emitStatusUpdated(previousStatus, newStatus);
  }

  /**
   * Opens the state history viewer modal
   */
  _showStateHistory() {
    const modal = document.createElement('state-history-viewer');
    modal.projectId = this.projectId;
    modal.cardType = this.cardType || 'task-card';
    modal.cardId = this.cardId;
    modal.cardTitle = this.title;
    document.body.appendChild(modal);
  }

  /**
   * Calculate time metrics from timeLog (pause/resume events)
   */
  _calculateTimeMetrics() {
    const timeLog = Array.isArray(this.timeLog) ? this.timeLog : [];
    if (timeLog.length === 0) return;

    let totalPaused = 0;
    let lastPausedAt = null;

    for (const entry of timeLog) {
      if (entry.event === 'paused') {
        lastPausedAt = new Date(entry.timestamp).getTime();
      } else if (entry.event === 'resumed' && lastPausedAt) {
        totalPaused += new Date(entry.timestamp).getTime() - lastPausedAt;
        lastPausedAt = null;
      }
    }

    // If currently paused (no matching resume), count time until now
    if (lastPausedAt) {
      totalPaused += Date.now() - lastPausedAt;
    }

    this.totalPausedTime = totalPaused;

    // Calculate total elapsed time from startDate to now (or endDate)
    if (this.startDate) {
      const start = new Date(this.startDate).getTime();
      const end = this.endDate ? new Date(this.endDate).getTime() : Date.now();
      this.totalElapsedTime = end - start;
      this.effectiveWorkTime = this.totalElapsedTime > 0 ? this.totalElapsedTime - totalPaused : 0;
    }
  }

  /**
   * Format milliseconds to human-readable duration
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  _formatDuration(ms) {
    if (!ms || ms <= 0) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);

    return parts.length > 0 ? parts.join(' ') : '< 1m';
  }

  /**
   * Render time metrics (paused time, effective work time) if timeLog exists
   */
  _renderTimeMetrics() {
    const timeLog = Array.isArray(this.timeLog) ? this.timeLog : [];
    if (timeLog.length === 0) return '';

    this._calculateTimeMetrics();

    return html`
      <div class="form-field inline" style="gap: 0.5rem; flex-wrap: wrap;">
        ${this.totalPausedTime > 0 ? html`
          <span style="font-size: 0.85em; color: var(--color-warning, #f59e0b);" title="Tiempo total en pausa">
            ⏸ Pausado: ${this._formatDuration(this.totalPausedTime)}
          </span>
        ` : ''}
        ${this.effectiveWorkTime > 0 ? html`
          <span style="font-size: 0.85em; color: var(--color-success, #10b981);" title="Tiempo efectivo de trabajo">
            ⏱ Efectivo: ${this._formatDuration(this.effectiveWorkTime)}
          </span>
        ` : ''}
      </div>
    `;
  }

  _emitStatusUpdated(previousStatus, newStatus) {
    const detail = {
      projectId: this.projectId,
      cardId: this.cardId || this.id,
      status: newStatus,
      previousStatus,
      developer: this.developer,
      validator: this.validator,
      coValidator: this.coValidator,
      title: this.title,
      notes: this.notes,
      acceptanceCriteria: this.acceptanceCriteria,
      description: this.description,
      spike: this.spike,
      expedited: this.expedited
    };

    document.dispatchEvent(new CustomEvent('task-status-updated', {
      detail,
      bubbles: true,
      composed: true
    }));
  }

  async _generateIaLink() {
    try {
      const firebaseId = this.firebaseId;
      if (!this.projectId || !firebaseId) {
        this._showNotification('Falta projectId o ID de Firebase para generar el enlace IA', 'error');
        return;
      }

      const projectSnap = await get(ref(database, `/projects/${this.projectId}`));
      if (!projectSnap.exists() || !projectSnap.val().iaEnabled) {
        this._showNotification('La IA no está habilitada para este proyecto', 'warning');
        return;
      }

      const token = this._generateSecureToken();
      const now = Date.now();
      const expiresAt = now + 15 * 60 * 1000; // 15 minutos
      const createdBy = this._getCurrentUserEmail().trim();

      const linkData = {
        token,
        projectId: this.projectId,
        taskId: firebaseId,
        firebaseId,
        cardId: this.cardId || '',
        createdBy: createdBy || 'unknown',
        createdAt: now,
        expiresAt,
        used: false
      };

      await dbSet(ref(database, `/ia/links/${token}`), linkData);

      const url = this._buildIaLinkUrl(token);
      this._copyTaskUrl(url);
      this._showNotification('Enlace IA generado y copiado (1 uso, 15 min)', 'success');
    } catch (error) {
this._showNotification('No se pudo generar el enlace IA', 'error');
    }
  }

  _buildIaLinkUrl(token) {
    const region = 'europe-west1';
    const projectId = firebaseConfig?.projectId;
    if (!projectId) {
      console.error('firebaseConfig.projectId is not configured');
      return '';
    }
    return `https://${region}-${projectId}.cloudfunctions.net/getIaContext/${token}`;
  }

  _generateSecureToken() {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('');
  }

  async _validateDeveloperInProgressLimit() {
    const developer = (this.developer || '').trim();
    if (!developer) {
      return {
        allowed: false,
        reason: 'missingDeveloper'
      };
    }

    const tasks = await this._fetchProjectTasksForDeveloper();
    if (!tasks || tasks.length === 0) {
      return { allowed: true };
    }

    const normalizedId = (this.cardId || this.id || '').trim();

    const developerTasks = tasks.filter(task => {
      const taskDeveloper = (task.developer || '').trim();
      if (taskDeveloper !== developer) return false;

      const taskId = (task.cardId || task.id || '').trim();
      return taskId !== normalizedId;
    });

    if (developerTasks.length === 0) {
      return { allowed: true };
    }

    const inProgressTasks = developerTasks.filter(task => (task.status || '').toLowerCase() === 'in progress');

    if (inProgressTasks.length === 0) {
      return { allowed: true };
    }

    // En lugar de bloquear, permitimos pero pedimos acción sobre las tareas existentes
    return {
      allowed: false,
      reason: 'hasExistingInProgress',
      tasks: inProgressTasks,
      requiresAction: true
    };
  }

  async _fetchProjectTasksForDeveloper() {
    const projectId = this.projectId || document.body.dataset.projectId;
    if (!projectId) {
return [];
    }

    return new Promise((resolve) => {
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (!settled) {
settled = true;
          resolve([]);
        }
      }, 4000);

      document.dispatchEvent(new CustomEvent('request-project-tasks', {
        detail: {
          projectId,
          fullData: true,
          callback: (tasks) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            resolve(Array.isArray(tasks) ? tasks : []);
          }
        },
        bubbles: true,
        composed: true
      }));
    });
  }

  /**
   * Actualiza el estado de una tarea existente cuando el usuario elige una acción
   * @param {Object} task - La tarea a actualizar
   * @param {string} newStatus - El nuevo estado (Done&Validated, To Validate, To Do, Blocked)
   */
  async _updateExistingTaskStatus(task, newStatus) {
    try {
      const taskId = task.id || task.firebaseId;
      if (!taskId) {
return;
      }

      // Preparar los datos actualizados
      const updatedTask = {
        ...task,
        status: newStatus
      };

      // Si pasa a Done&Validated, añadir endDate
      if (newStatus === 'Done&Validated') {
        updatedTask.endDate = generateTimestamp(new Date(), 'end');
      }

      // Si vuelve a To Do, limpiar startDate
      if (newStatus === 'To Do') {
        updatedTask.startDate = '';
        updatedTask.endDate = '';
      }

      // Guardar usando FirebaseService
      document.dispatchEvent(new CustomEvent('request-card-action', {
        detail: {
          requestId: `update-task-${Date.now()}`,
          action: 'save',
          cardData: updatedTask,
          options: { silent: true, skipHistory: false }
        },
        bubbles: true,
        composed: true
      }));

      // Mostrar notificación de éxito
      const taskLabel = task.cardId || taskId;
      this._showNotification(`Tarea ${taskLabel} actualizada a "${newStatus}"`, 'success');
} catch (error) {
this._showNotification('Error al actualizar la tarea existente', 'error');
    }
  }

  _isTaskBlocked(task) {
    if (!task) return false;
    const status = (task.status || '').toLowerCase();
    // Only consider blocked if status is "Blocked" - ignore orphan blocked flags
    return status === 'blocked';
  }

  async _showInProgressLimitWarning(validationResult) {
    const developerName = entityDirectoryService.getDeveloperDisplayName(this.developer) ||
      (this.developer || '').trim() || APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES;

    if (validationResult.reason === 'missingDeveloper') {
      this._showNotification('Asigna un developer antes de mover la tarea a "In Progress".', 'warning');
      return { action: 'cancel' };
    }

    const tasks = validationResult.tasks || [];
    if (tasks.length === 0) {
      return { action: 'proceed' };
    }

    const existingTask = tasks[0]; // Tomamos la primera tarea en progreso
    const taskId = existingTask.cardId || existingTask.id || 'Sin ID';
    const taskTitle = existingTask.title || 'Sin título';

    try {
      const { modalService } = await import('../services/modal-service.js');
      const content = this._createInProgressWarningContent(developerName, taskId, taskTitle);

      return new Promise((resolve) => {
        let modalInstance = null;
        const buttons = content.querySelectorAll('.action-btn');

        buttons.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (modalInstance) {
              modalInstance.remove();
            }
            resolve({
              action,
              existingTask,
              existingTaskId: existingTask.id || existingTask.firebaseId
            });
          });
        });

        modalService.createModal({
          title: 'Tarea en progreso existente',
          content,
          maxWidth: '460px',
          maxHeight: '80vh',
          showCloseButton: false,
          onClose: () => {
            resolve({ action: 'cancel' });
          }
        }).then(instance => {
          modalInstance = instance;
        });
      });
    } catch (error) {
this._showNotification(`${developerName} ya tiene una tarea en progreso: ${taskId}. Finalízala antes de iniciar otra.`, 'warning');
      return { action: 'cancel' };
    }
  }

  /**
   * Create content element for in-progress warning modal
   */
  _createInProgressWarningContent(developerName, taskId, taskTitle) {
    const content = document.createElement('div');
    content.innerHTML = `
      <p><strong>${developerName}</strong> ya tiene una tarea en progreso:</p>
      <div class="existing-task-info">
        <strong>${taskId}</strong> — ${taskTitle}
      </div>
      <p style="margin-top: 1rem;">¿Qué deseas hacer con esa tarea?</p>
      <div class="action-buttons">
        <button class="action-btn done-btn" data-action="Done&Validated">✓ Marcar como Done&Validated</button>
        <button class="action-btn validate-btn" data-action="To Validate">→ Pasar a To Validate</button>
        <button class="action-btn todo-btn" data-action="To Do">← Volver a To Do</button>
        <button class="action-btn cancel-btn" data-action="cancel">✕ Cancelar</button>
      </div>
    `;

    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .existing-task-info {
        background: var(--bg-secondary, #f8f9fa);
        color: var(--text-primary, #212529);
        border-left: 4px solid var(--primary-color);
        padding: 0.75rem 1rem;
        margin: 0.75rem 0;
        border-radius: 0 4px 4px 0;
      }
      .action-buttons {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 1rem;
      }
      .action-btn {
        padding: 0.75rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.95rem;
        transition: background 0.2s, transform 0.1s;
        text-align: left;
      }
      .action-btn:hover {
        transform: translateX(4px);
      }
      .done-btn {
        background: var(--color-success-bg, #d4edda);
        color: var(--color-success-text, #155724);
      }
      .done-btn:hover {
        background: var(--color-success-hover, #c3e6cb);
      }
      .validate-btn {
        background: var(--color-warning-bg, #fff3cd);
        color: var(--color-warning-text, #856404);
      }
      .validate-btn:hover {
        background: var(--color-warning-hover, #ffe69c);
      }
      .todo-btn {
        background: var(--color-info-bg, #cce5ff);
        color: var(--color-info-text, #004085);
      }
      .todo-btn:hover {
        background: var(--color-info-hover, #b8daff);
      }
      .cancel-btn {
        background: var(--color-error-bg, #f8d7da);
        color: var(--color-error-text, #721c24);
      }
      .cancel-btn:hover {
        background: var(--color-error-hover, #f5c6cb);
      }
    `;
    content.appendChild(styleElement);
    return content;
  }

  _handleBusinessBlockChange(e) {
    this.blockedByBusiness = e.target.checked;
    if (!this.blockedByBusiness) {
      this.bbbWhy = '';
      this.bbbWho = '';
    }
  }
  _handleDevelopmentBlockChange(e) {
    this.blockedByDevelopment = e.target.checked;
    if (!this.blockedByDevelopment) {
      this.bbdWhy = '';
      this.bbdWho = '';
    }
  }

  /**
   * Obtiene el título del sprint actual basado en el ID del sprint asignado a la tarea.
   * Utiliza la lista global de sprints para hacer la búsqueda.
   * @returns {string} El título del sprint o una cadena vacía si no hay sprint asignado.
   */
  get sprintTitle() {
    if (!this.sprint) return '';
    // Asegurarnos de usar la lista más actualizada
    const globalSprintList = window.globalSprintList || this.globalSprintList || {};
    const sprint = globalSprintList[this.sprint];
    return sprint ? sprint.title : '';
  }

  /**
   * Renderiza el selector de sprints usando la lista global de sprints.
   * Muestra una opción por defecto "No Sprint" y solo los sprints del año seleccionado.
   * @returns {TemplateResult} El template HTML del selector de sprints.
   */
  renderSprintSelector() {
    // Asegurarnos de usar la lista más actualizada
    const sprintList = window.globalSprintList || this.globalSprintList || {};
    const filteredSprints = this._filterSprintsByYear(sprintList);

    return html`
      <select
        class="sprint-selector"
        @change=${this._handleSprintChange}
        ?disabled=${!this.canEdit}
      >
        <option value="">No Sprint</option>
        ${Object.entries(filteredSprints).map(this._renderSprintSelectorOption.bind(this))}
      </select>
    `;
  }

  _handleClick(e) {
    if (!this.expanded) {
      this._originalTitle = this.title;  // Guardamos el título original
      document.dispatchEvent(new CustomEvent('show-expanded-card', {
        detail: {
          cardElement: this
        }
      }));
      // modal-closed listener is already set up in base-card connectedCallback
    }
  }

  _handleBbbWhoChange(e) {
    this.bbbWho = e.target.value;
  }

  _handleBbdWhoChange(e) {
    this.bbdWho = e.target.value;
  }

  /**
   * Devuelve la lista de developers a usar en el selector.
   * @returns {Array<string>} Lista de developers
   */
  /**
   * Determina si un desarrollador está seleccionado
   * @param {string} devName - Nombre del desarrollador a verificar
   * @returns {boolean} True si el desarrollador está seleccionado
   */
  isDeveloperSelected(devValue) {
    // devValue es el email del option (dev.value)
    if (!this.developer || APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer)) {
      return APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(devValue);
    }

    if (this.developer === devValue) {
      return true;
    }

    const normalizedValue = this._normalizeValue(devValue);
    const normalizedCurrent = this._normalizeValue(this.developer);
    if (normalizedValue === normalizedCurrent) {
      return true;
    }

    if (this.developerName && normalizedValue === this._normalizeValue(this.developerName)) {
      return true;
    }

    return false;
  }

  /**
   * Determina si un validator/stakeholder está seleccionado
   * @param {string} validatorValue - Email del validator a verificar
   * @returns {boolean} True si el validator está seleccionado
   */
  isValidatorSelected(validatorValue) {
    // validatorValue es el email del option (stakeholder.value)
    if (!this.validator) return validatorValue === '';

    // Comparación directa: this.validator contiene email, validatorValue es el email del option
    return this.validator === validatorValue;
  }

  /**
   * Convierte una lista de emails a nombres usando los datos de Firebase
   * @param {Array<string>} emailList - Lista de emails
   * @returns {Array<string>} Lista de nombres
   */
  convertEmailsToNames(emailList) {
    if (!emailList || !Array.isArray(emailList)) return [];

    return emailList.map(item => {
      // Si es un objeto con estructura {name, email}
      if (typeof item === 'object' && item.name) {
        return item.name;
      }

      // Si es string y no contiene @, es un nombre - devolverlo tal como está
      if (typeof item === 'string' && !item.includes('@')) {
        return item;
      }

      // Si es un email, buscar el nombre en los datos del proyecto
      if (typeof item === 'string' && item.includes('@')) {
        // No usar mapeos globales - crear mapeo desde los datos del proyecto
        if (Array.isArray(this.developers)) {
          for (const dev of this.developers) {
            if (typeof dev === 'object' && dev.name && dev.email && dev.email === item) {
              return dev.name;
            }
          }
        }
        // Si no se encuentra en el proyecto, devolver email sin dominio
        return item.split('@')[0];
      }

      // Por defecto devolver el item como string
      return String(item);
    });
  }

  get effectiveDeveloperList() {
    // Solo usar developers del proyecto actual
    let rawList = this.developers || [];

    // Si no hay developers del proyecto, lista vacía con opción de no asignado
    if (!rawList || rawList.length === 0) {
      return [APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE];
    }

    // Convertir emails a nombres
    const namesList = this.convertEmailsToNames(rawList);

    // Filtrar elementos no deseados (incluyendo todos los alias de no asignado)
    const filteredList = namesList.filter(dev =>
      !APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(dev) &&
      dev !== 'Loading developers...'
    );

    // Añadir opción de no asignado como primera opción siempre
    return [APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE, ...filteredList];
  }

  /**
   * Checks if a developer option should be selected
   * Handles comparison between different value formats (entity ID, email, name)
   * @param {string} optionValue - The value of the option to check
   * @returns {boolean}
   */
  _isDeveloperSelected(optionValue) {
    // If no developer assigned - check using aliases
    const isCurrentUnassigned = !this.developer || APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer);
    const isOptionUnassigned = APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(optionValue);
    if (isCurrentUnassigned) {
      return isOptionUnassigned;
    }
    // Direct match
    if (this.developer === optionValue) {
      return true;
    }
    // Compare by resolving both to entity ID
    const currentDevId = entityDirectoryService.resolveDeveloperId(this.developer);
    const optionDevId = entityDirectoryService.resolveDeveloperId(optionValue);
    if (currentDevId && optionDevId && currentDevId === optionDevId) {
      return true;
    }
    // Fallback: compare by email
    const currentEmail = entityDirectoryService.resolveDeveloperEmail(this.developer);
    const optionEmail = entityDirectoryService.resolveDeveloperEmail(optionValue);
    if (currentEmail && optionEmail && currentEmail.toLowerCase() === optionEmail.toLowerCase()) {
      return true;
    }
    return false;
  }

  /**
   * Checks if a co-developer option should be selected
   * Handles comparison between different value formats (entity ID, email, name)
   * @param {string} optionValue - The value of the option to check
   * @returns {boolean}
   */
  _isCoDeveloperSelected(optionValue) {
    // If no co-developer assigned
    if (!this.coDeveloper) {
      return !optionValue || optionValue === '';
    }
    // Direct match
    if (this.coDeveloper === optionValue) {
      return true;
    }
    // Compare by resolving both to entity ID
    const currentDevId = entityDirectoryService.resolveDeveloperId(this.coDeveloper);
    const optionDevId = entityDirectoryService.resolveDeveloperId(optionValue);
    if (currentDevId && optionDevId && currentDevId === optionDevId) {
      return true;
    }
    // Fallback: compare by email
    const currentEmail = entityDirectoryService.resolveDeveloperEmail(this.coDeveloper);
    const optionEmail = entityDirectoryService.resolveDeveloperEmail(optionValue);
    if (currentEmail && optionEmail && currentEmail.toLowerCase() === optionEmail.toLowerCase()) {
      return true;
    }
    return false;
  }

  /**
   * Checks if a stakeholder/validator option should be selected
   * Handles comparison between different value formats (entity ID, email, name)
   * @param {string} optionValue - The value of the option to check
   * @returns {boolean}
   */
  _isValidatorSelected(optionValue) {
    // If no validator assigned
    if (!this.validator) {
      return !optionValue || optionValue === '';
    }
    // Direct match
    if (this.validator === optionValue) {
      return true;
    }
    // Compare by resolving both to entity ID
    const currentStkId = entityDirectoryService.resolveStakeholderId(this.validator);
    const optionStkId = entityDirectoryService.resolveStakeholderId(optionValue);
    if (currentStkId && optionStkId && currentStkId === optionStkId) {
      return true;
    }
    // Fallback: compare by email
    const currentEmail = entityDirectoryService.resolveStakeholderEmail(this.validator);
    const optionEmail = entityDirectoryService.resolveStakeholderEmail(optionValue);
    if (currentEmail && optionEmail && currentEmail.toLowerCase() === optionEmail.toLowerCase()) {
      return true;
    }
    return false;
  }

  /**
   * Verifica si un valor dado corresponde al CoValidator actual
   * @param {string} optionValue - The value of the option to check
   * @returns {boolean}
   */
  _isCoValidatorSelected(optionValue) {
    // If no coValidator assigned
    if (!this.coValidator) {
      return !optionValue || optionValue === '';
    }
    // Direct match
    if (this.coValidator === optionValue) {
      return true;
    }
    // Compare by resolving both to entity ID
    const currentStkId = entityDirectoryService.resolveStakeholderId(this.coValidator);
    const optionStkId = entityDirectoryService.resolveStakeholderId(optionValue);
    if (currentStkId && optionStkId && currentStkId === optionStkId) {
      return true;
    }
    // Fallback: compare by email
    const currentEmail = entityDirectoryService.resolveStakeholderEmail(this.coValidator);
    const optionEmail = entityDirectoryService.resolveStakeholderEmail(optionValue);
    if (currentEmail && optionEmail && currentEmail.toLowerCase() === optionEmail.toLowerCase()) {
      return true;
    }
    return false;
  }

  /**
   * Obtiene la lista de stakeholders para CoValidator (excluyendo el Validator seleccionado)
   * @returns {Array} Lista de stakeholders filtrada
   */
  _getCoValidatorStakeholderList() {
    const fullList = this.getProcessedStakeholderList();
    if (!this.validator) {
      return fullList;
    }
    // Filtrar excluyendo el validator seleccionado
    const validatorId = entityDirectoryService.resolveStakeholderId(this.validator);
    return fullList.filter(stk => {
      if (!stk.value) return true; // Mantener opción vacía
      const stkId = entityDirectoryService.resolveStakeholderId(stk.value);
      return stkId !== validatorId;
    });
  }

  /**
   * Obtiene la lista de developers procesada para mostrar en el selector
   * Retorna objetos con {value: email, display: name}
   */
  getProcessedDeveloperList() {
    const rawList = this.developers || [];
    const unassignedOption = {
      value: APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE,
      display: APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES
    };

    if (!rawList || rawList.length === 0) {
      return [unassignedOption];
    }

    const resolvedIds = new Set();
    rawList.forEach((entry) => {
      const candidate = typeof entry === 'object'
        ? (entry.id || entry.email || entry.name || entry.value || '')
        : entry;
      const resolvedId = entityDirectoryService.resolveDeveloperId(candidate);
      if (resolvedId) {
        resolvedIds.add(resolvedId);
      }
    });

    const options = Array.from(resolvedIds).map((id) => ({
      value: id,
      display: entityDirectoryService.getDeveloperDisplayName(id) || id
    }));

    return [unassignedOption, ...options];
  }

  /**
   * Obtiene la lista de stakeholders procesada para mostrar en el selector
   * Retorna objetos con {value: id|email, display: name}
   */
  getProcessedStakeholderList() {
    const rawStakeholders = this.stakeholders || [];
    if (!rawStakeholders || rawStakeholders.length === 0) {
      return [{ value: '', display: '' }];
    }

    const resolvedIds = new Set();
    rawStakeholders.forEach((entry) => {
      const candidate = typeof entry === 'object'
        ? (entry.id || entry.email || entry.name || entry.value || '')
        : entry;
      const resolvedId = entityDirectoryService.resolveStakeholderId(candidate);
      if (resolvedId) {
        resolvedIds.add(resolvedId);
      }
    });

    const options = Array.from(resolvedIds).map((id) => ({
      value: id,
      display: entityDirectoryService.getStakeholderDisplayName(id) || id
    }));

    return [{ value: '', display: '' }, ...options];
  }

  /**
   * Convierte una lista de stakeholders (objetos o emails) a nombres para mostrar
   * @param {Array} stakeholderList - Lista de stakeholders
   * @returns {Array<string>} Lista de nombres
   */
  convertStakeholdersToNames(stakeholderList) {
    if (!stakeholderList || !Array.isArray(stakeholderList)) return [];

    return stakeholderList.map(item => {
      // Si es un objeto con estructura {name, email}
      if (typeof item === 'object' && item.name) {
        return item.name;
      }
      // Si es solo un email, buscar el nombre en los datos del proyecto
      if (typeof item === 'string' && item.includes('@')) {
        // No usar mapeos globales - crear mapeo desde los datos del proyecto
        if (Array.isArray(this.stakeholders)) {
          for (const stakeholder of this.stakeholders) {
            if (typeof stakeholder === 'object' && stakeholder.name && stakeholder.email && stakeholder.email === item) {
              return stakeholder.name;
            }
          }
        }
        // Si no se encuentra en el proyecto, devolver email sin dominio
        return item.split('@')[0];
      }
      // Si ya es un nombre
      return item;
    });
  }

  /**
   * Devuelve la lista de stakeholders a usar en el selector de validator.
   * Prioriza los stakeholders del proyecto, luego los globales.
   * @returns {Array<string>} Lista de stakeholders
   */
  get effectiveStakeholders() {
    // Solo usar stakeholders del proyecto actual
    let rawStakeholders = this.stakeholders || [];

    // Si no hay stakeholders del proyecto, lista vacía
    if (!rawStakeholders || rawStakeholders.length === 0) {
      return [''];
    }

    // Convertir a nombres para mostrar
    const converted = this.convertStakeholdersToNames(rawStakeholders);
    return ['', ...converted.filter(name => name !== '')];
  }

  _normalizeDeveloperField() {
    if (!this.developer) {
      this.developerName = '';
      return;
    }

    const current = this.developer.toString().trim();

    // Si es un entity ID (dev_XXX), mantenerlo y resolver el nombre
    if (current.startsWith('dev_')) {
      // Solo actualizar el nombre si:
      // 1. No tenemos nombre
      // 2. El nombre actual es el mismo ID (dev_XXX)
      // 3. El nombre actual parece un email (contiene @)
      const hasValidName = this.developerName &&
        !this.developerName.startsWith('dev_') &&
        !this.developerName.includes('@');

      if (!hasValidName) {
        const name = entityDirectoryService.getDeveloperDisplayName(current);
        this.developerName = name || current;
      }
      // Mantener el ID como developer
      return;
    }

    const normalizedInfo = normalizeDeveloperEntry(current);

    if (normalizedInfo.isUnassigned) {
      this.developer = APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE;
      this.developerName = APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES;
      return;
    }

    const developerEntries = Array.isArray(this.developers) ? this.developers : [];
    const targetKey = getDeveloperKey(current);

    let resolvedEmail = normalizedInfo.email || normalizedInfo.sourceEmail || '';
    let resolvedName = normalizedInfo.name || '';

    if (!resolvedEmail && developerEntries.length > 0) {
      for (const entry of developerEntries) {
        const normalizedEntry = normalizeDeveloperEntry(entry);
        const entryKey = getDeveloperKey(normalizedEntry.email || normalizedEntry.name);
        if (entryKey && entryKey === targetKey) {
          resolvedEmail = normalizedEntry.email || normalizedEntry.sourceEmail || resolvedEmail;
          resolvedName = normalizedEntry.name || resolvedName;
          break;
        }
      }
    }

    if (!resolvedEmail && typeof current === 'string' && current.includes('@')) {
      resolvedEmail = current.toLowerCase();
    }

    if (!resolvedName) {
      resolvedName = resolvedEmail ? this._formatNameFromEmail(resolvedEmail) : current;
    }

    this.developer = resolvedEmail || resolvedName;
    this.developerName = resolvedName;
  }

  _formatNameFromEmail(email) {
    if (!email || typeof email !== 'string') {
      return email || '';
    }

    const localPart = email.split('@')[0] || email;
    let cleaned = localPart.replace(/#ext#/gi, '');
    cleaned = cleaned.replace(/[._-]+/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return email;
    }
    return cleaned.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  _normalizeValue(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : value;
  }

  /**
   * Devuelve el id de la épica seleccionada, resolviendo si el valor guardado es nombre o id.
   * Es robusto ante diferencias de mayúsculas, espacios y tipos.
   * @returns {string}
   */
  get selectedEpicId() {
    if (!this.epicList || !Array.isArray(this.epicList)) return '';
    const epicValue = (this.epic || '').toString().trim().toLowerCase();
    // Buscar por id
    const byId = this.epicList.find(e => (e.id || '').toString().trim().toLowerCase() === epicValue);
    if (byId) return byId.id;
    // Buscar por nombre (caso antiguo)
    const byName = this.epicList.find(e => (e.name || '').toString().trim().toLowerCase() === epicValue);
    return byName ? byName.id : '';
  }

  // Setter vacío para evitar error al asignar desde datos de Firebase
  // El valor real se computa desde this.epic
  set selectedEpicId(_value) {
    // Ignorar - es una propiedad computada
  }

  /**
   * Get the label for the Notes tab, including count badge if there are notes
   * @returns {string} Tab label with optional count
   */
  _getNotesTabLabel() {
    const notesArray = this._getNotesArray();
    if (notesArray.length > 0) {
      return `Notes (${notesArray.length})`;
    }
    return 'Notes';
  }

  /**
   * Maneja el evento cuando se sube un archivo adjunto.
   * @param {CustomEvent} e - Evento con la información del archivo subido
   */
  _handleAttachmentUploaded(e) {
    if (e.detail?.url) {
      this.attachment = e.detail.url;
// Mostrar notificación de éxito
      const notification = document.createElement('slide-notification');
      notification.message = 'Archivo adjunto subido correctamente';
      notification.type = 'success';
      document.body.appendChild(notification);
    }
  }

  /**
   * Maneja el evento cuando se elimina un archivo adjunto.
   * @param {CustomEvent} e - Evento con la información del archivo eliminado
   */
  _handleAttachmentDeleted(e) {
    this.attachment = '';
// Mostrar notificación de éxito
    const notification = document.createElement('slide-notification');
    notification.message = 'Archivo adjunto eliminado correctamente';
    notification.type = 'success';
    document.body.appendChild(notification);
  }

  /**
   * Handles the copy link button click event.
   * @param {string} url - URL to copy
   * @param {Event} e - The click event
   */
  _handleCopyLinkClick(url, e) {
    e.stopPropagation();
    this._copyTaskUrl(url);
  }

  /**
   * Renders a related task item.
   * @param {Object} task - The related task object
   * @returns {TemplateResult} The related task item template
   */
  _renderRelatedTaskItem(task) {
    return html`
      <div class="related-task-item">
        <span class="related-task-link" @click=${this._handleRelatedTaskLinkClick.bind(this, task.id, task.projectId)}>
          📋 Tarea ${task.id} - ${task.title}
          ${task.projectId && task.projectId !== this.projectId ? html`<span style="color: var(--text-secondary, #666); font-size: 0.9em;"> (${task.projectId})</span>` : ''}
        </span>
        <button class="remove-related-task-btn" @click=${this._handleRemoveRelatedTaskClick.bind(this, task.id)} title="Eliminar asociación">
          ✖
        </button>
      </div>
    `;
  }

  /**
   * Handles the related task link click.
   * @param {string} taskId - The task ID
   * @param {string} projectId - The project ID
   */
  _handleRelatedTaskLinkClick(taskId, projectId) {
    this._handleRelatedTaskClick(taskId, projectId);
  }

  /**
   * Handles the remove related task button click.
   * @param {string} taskId - The task ID to remove
   */
  _handleRemoveRelatedTaskClick(taskId) {
    this._handleRemoveRelatedTask(taskId);
  }

  /**
   * Timeout callback for handling reciprocal relations.
   */
  _handleReciprocalRelationsTimeout() {
    this._handleReciprocalRelations();
  }

  /**
   * Focuses the project selector element.
   * @param {HTMLSelectElement} projectSelect - The project selector element
   */
  _focusProjectSelector(projectSelect) {
    projectSelect.focus();
  }

  /**
   * Maps epic data from Firebase entry to component format.
   * @param {Array} entry - [id, epic] entry from Object.entries()
   * @returns {Object} Mapped epic object
   */
  _mapEpicData([id, epic]) {
    return {
      id: epic.cardId || id,
      name: epic.title || (epic.cardId || id),
      description: epic.description || '',
      year: epic.year,
      endDate: epic.endDate
    };
  }

  /**
   * Filter epics by selected year
   * Shows epics that:
   * - Match the selected year, OR
   * - Have no year field (backwards compatibility), OR
   * - Are "active" (no endDate or endDate is in the future)
   * @param {Array} epics - List of epic objects
   * @returns {Array} Filtered epics
   */
  _filterEpicsByYear(epics) {
    const selectedYear = this._getSelectedYearFromSelector();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return epics.filter(epic => {
      // Always show "Sin épica" option
      if (!epic.id) return true;

      // If epic has no year field, show it (backwards compatibility)
      if (!epic.year) return true;

      // Show epic if it matches selected year
      if (Number(epic.year) === selectedYear) return true;

      // Also show epic if it's still active (no endDate or endDate is in the future)
      if (!epic.endDate) return true;
      const epicEndDate = new Date(epic.endDate);
      if (epicEndDate >= today) return true;

      return false;
    });
  }

  /**
   * Renders a sprint option for the sprint selector.
   * @param {Array} entry - [id, sprint] entry from Object.entries()
   * @returns {TemplateResult} Sprint option template
   */
  _renderSprintOption([id, sprint]) {
    // Usar cardId del sprint como valor, no el Firebase ID
    return html`<option value=${sprint.cardId} ?selected=${this.sprint === sprint.cardId}>${sprint.title}</option>`;
  }

  /**
   * Renders a sprint option for the sprint selector in renderSprintSelector.
   * @param {Array} entry - [id, sprint] entry from Object.entries()
   * @returns {TemplateResult} Sprint option template
   */
  _renderSprintSelectorOption([id, sprint]) {
    return html`
      <option 
        value=${sprint.cardId} 
        ?selected=${this.sprint === sprint.cardId}
      >${sprint.title}</option>
    `;
  }

  /**
   * Copia la URL de la tarea al portapapeles y muestra una notificación.
   * @param {string} url - URL a copiar
   */
  _copyTaskUrl(url) {
    navigator.clipboard.writeText(url)
      .then(this._handleClipboardSuccess.bind(this))
      .catch(this._handleClipboardError.bind(this));
  }

  /**
   * Handles successful clipboard copy.
   */
  _handleClipboardSuccess() {
    const notification = document.createElement('slide-notification');
    notification.message = 'Enlace de la tarea copiado al portapapeles';
    notification.type = 'success';
    document.body.appendChild(notification);
  }

  /**
   * Handles clipboard copy error.
   */
  _handleClipboardError() {
    const notification = document.createElement('slide-notification');
    notification.message = 'No se pudo copiar el enlace';
    notification.type = 'error';
    document.body.appendChild(notification);
  }

  _handleAddRelatedTask() {
    // Solicitar la lista de proyectos disponibles primero
    document.dispatchEvent(new CustomEvent('request-available-projects', {
      detail: {
        currentProjectId: this.projectId,
        callback: (projects) => this._showProjectAndTaskSelectionModal(projects)
      },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Muestra un modal para seleccionar proyecto y tarea relacionada
   * @param {Object} projects - Lista de proyectos disponibles
   */
  _showProjectAndTaskSelectionModal(projects) {
    if (!projects || Object.keys(projects).length === 0) {
      const notification = document.createElement('slide-notification');
      notification.message = 'No hay proyectos disponibles';
      notification.type = 'warning';
      document.body.appendChild(notification);
      return;
    }

    // Crear modal personalizado con selectores de proyecto y tarea
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: var(--bg-primary, white);
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      min-width: 500px;
      max-width: 700px;
      position: relative;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 15px;
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0.5rem;
      border-radius: 50%;
      transition: all 0.2s;
    `;
    closeBtn.onclick = () => modal.remove();

    const title = document.createElement('h3');
    title.textContent = 'Seleccionar tarea relacionada';
    title.style.cssText = `
      margin: 0 0 1rem 0;
      color: var(--text-primary, #333);
      font-size: 1.2rem;
    `;

    const message = document.createElement('p');
    message.textContent = `Selecciona un proyecto y una tarea para asociar con la tarea ${this.cardId}:`;
    message.style.cssText = `
      margin: 0 0 1rem 0;
      color: var(--text-secondary, #666);
    `;

    // Contenedor para el selector de proyecto
    const projectContainer = document.createElement('div');
    projectContainer.style.cssText = `
      margin-bottom: 1rem;
    `;

    const projectLabel = document.createElement('label');
    projectLabel.textContent = 'Proyecto:';
    projectLabel.style.cssText = `
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-primary, #333);
    `;

    const projectSelect = document.createElement('select');
    projectSelect.style.cssText = `
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border-default, #ddd);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--bg-primary, white);
    `;

    // Añadir opciones de proyectos
    Object.entries(projects).forEach(([projectId, projectData]) => {
      const option = document.createElement('option');
      // Usar el nombre del proyecto como value en lugar del ID
      option.value = projectData.name || projectId;
      option.textContent = projectData.name || projectId;
      // Seleccionar por defecto el proyecto actual (comparar con el nombre)
      if (projectData.name === this.projectId || projectId === this.projectId) {
        option.selected = true;
      }
      projectSelect.appendChild(option);
    });

    // Contenedor para el selector de tareas
    const taskContainer = document.createElement('div');
    taskContainer.style.cssText = `
      margin-bottom: 1.5rem;
    `;

    const taskLabel = document.createElement('label');
    taskLabel.textContent = 'Tarea:';
    taskLabel.style.cssText = `
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-primary, #333);
    `;

    const taskSelect = document.createElement('select');
    taskSelect.style.cssText = `
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border-default, #ddd);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--bg-primary, white);
    `;

    // Añadir opción por defecto
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Selecciona una tarea --';
    taskSelect.appendChild(defaultOption);

    // Función para cargar tareas del proyecto seleccionado
    const loadTasksForProject = async (projectId) => {
// Limpiar opciones existentes (excepto la primera)
      while (taskSelect.children.length > 1) {
        taskSelect.removeChild(taskSelect.lastChild);
      }

      // Mostrar indicador de carga
      const loadingOption = document.createElement('option');
      loadingOption.value = '';
      loadingOption.textContent = 'Cargando tareas...';
      loadingOption.disabled = true;
      taskSelect.appendChild(loadingOption);

      try {
        // Solicitar tareas del proyecto
        document.dispatchEvent(new CustomEvent('request-project-tasks', {
          detail: {
            projectId: projectId,
            currentTaskId: this.cardId,
            callback: (tasks) => {

              // Remover opción de carga
              if (taskSelect.lastChild?.textContent === 'Cargando tareas...') {
                taskSelect.removeChild(taskSelect.lastChild);
              }

              if (!tasks || tasks.length === 0) {
                const noTasksOption = document.createElement('option');
                noTasksOption.value = '';
                noTasksOption.textContent = 'No hay tareas disponibles';
                noTasksOption.disabled = true;
                taskSelect.appendChild(noTasksOption);
                return;
              }

              // Filtrar tareas que ya están relacionadas
              const availableTasks = tasks.filter(task =>
                task.cardId !== this.cardId &&
                !this.relatedTasks.some(relatedTask => relatedTask.id === task.cardId)
              );

              if (availableTasks.length === 0) {
                const noAvailableOption = document.createElement('option');
                noAvailableOption.value = '';
                noAvailableOption.textContent = 'Todas las tareas ya están asociadas';
                noAvailableOption.disabled = true;
                taskSelect.appendChild(noAvailableOption);
                return;
              }

              // Añadir opciones de tareas
              availableTasks.forEach(task => {
                const option = document.createElement('option');
                option.value = `${task.cardId} - ${task.title}`;
                option.textContent = `${task.cardId} - ${task.title}`;
                taskSelect.appendChild(option);
              });
            }
          },
          bubbles: true,
          composed: true
        }));
      } catch (error) {
// Remover opción de carga y mostrar error
        if (taskSelect.lastChild?.textContent === 'Cargando tareas...') {
          taskSelect.removeChild(taskSelect.lastChild);
        }
        const errorOption = document.createElement('option');
        errorOption.value = '';
        errorOption.textContent = 'Error al cargar tareas';
        errorOption.disabled = true;
        taskSelect.appendChild(errorOption);
      }
    };

    // Cargar tareas del proyecto seleccionado por defecto
    loadTasksForProject(this.projectId);

    // Evento para cambiar de proyecto
    projectSelect.addEventListener('change', (e) => {
      const selectedProjectName = e.target.value;
if (selectedProjectName) {
        loadTasksForProject(selectedProjectName);
      }
    });

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.cssText = `
      padding: 0.5rem 1rem;
      border: 1px solid var(--border-default, #ddd);
      border-radius: 4px;
      background: var(--bg-secondary, #f8f9fa);
      color: var(--text-primary, #333);
      cursor: pointer;
      font-size: 1rem;
    `;
    cancelBtn.onclick = () => modal.remove();

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Asociar';
    confirmBtn.style.cssText = `
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      background: var(--brand-primary, #6366f1);
      color: var(--text-inverse, white);
      cursor: pointer;
      font-size: 1rem;
    `;
    confirmBtn.onclick = () => {
      if (taskSelect.value) {
        const selectedProjectId = projectSelect.value;
        this._addRelatedTask(taskSelect.value, selectedProjectId);
        modal.remove();
      } else {
        const notification = document.createElement('slide-notification');
        notification.message = 'Debes seleccionar una tarea';
        notification.type = 'warning';
        document.body.appendChild(notification);
      }
    };

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);

    projectContainer.appendChild(projectLabel);
    projectContainer.appendChild(projectSelect);
    taskContainer.appendChild(taskLabel);
    taskContainer.appendChild(taskSelect);

    modalContent.appendChild(closeBtn);
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modalContent.appendChild(projectContainer);
    modalContent.appendChild(taskContainer);
    modalContent.appendChild(buttonContainer);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Cerrar al hacer clic fuera del modal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Cerrar con ESC
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Enfocar el selector de proyecto
    setTimeout(this._focusProjectSelector.bind(this, projectSelect), 100);
  }

  _handleRemoveRelatedTask(taskId) {
    // Confirmar eliminación
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Eliminar asociación',
          message: `¿Estás seguro de que quieres eliminar la asociación con la tarea ${taskId}?`,
          button1Text: 'Sí, eliminar',
          button2Text: 'Cancelar',
          button1css: 'background-color: #f43f5e; color: white;',
          button2css: 'background-color: #6b7280; color: #fff;',
          button1Action: () => this._removeRelatedTask(taskId),
          button2Action: () => { }
        }
      }
    }));
  }

  /**
   * Añade una tarea relacionada
   * @param {string} selectedValue - Valor seleccionado del modal (formato: "cardId - title")
   */
  _addRelatedTask(selectedValue, projectId) {
    const [taskId, ...titleParts] = selectedValue.split(' - ');
    const title = titleParts.join(' - '); // Reconstruir el título en caso de que contenga guiones
// Verificar si ya existe la tarea
    const existingTask = this.relatedTasks.find(task => task.id === taskId);
    if (!existingTask) {
      // Por ahora, asumimos que la tarea es del proyecto actual
      // En el futuro, podríamos añadir el projectId a la estructura de relatedTasks
      this.relatedTasks = [...this.relatedTasks, { id: taskId, title: title, projectId: projectId }];
// NO añadir la relación recíproca aquí - se hará cuando se guarde la tarea
      // La relación recíproca se manejará en el método _handleSave

      const notification = document.createElement('slide-notification');
      notification.message = `Tarea ${taskId} asociada correctamente`;
      notification.type = 'success';
      document.body.appendChild(notification);
    }
  }

  /**
   * Elimina una tarea relacionada
   * @param {string} taskId - ID de la tarea a eliminar de las relacionadas
   */
  _removeRelatedTask(taskId) {
    this.relatedTasks = this.relatedTasks.filter(task => task.id !== taskId);
// Buscar y actualizar directamente la tarea relacionada en el DOM
    const taskElements = document.querySelectorAll(`task-card[card-id="${taskId}"]`);

    if (taskElements.length > 0) {
      taskElements.forEach(taskElement => {
        taskElement.relatedTasks = (taskElement.relatedTasks || []).filter(task => task.id !== this.cardId);
taskElement.requestUpdate();
      });
    } else {
// Fallback: usar evento
      document.dispatchEvent(new CustomEvent('remove-reciprocal-relation', {
        detail: {
          taskId: taskId,
          relatedTaskId: this.cardId,
          projectId: this.projectId
        },
        bubbles: true,
        composed: true
      }));
    }

    const notification = document.createElement('slide-notification');
    notification.message = `Asociación con tarea ${taskId} eliminada`;
    notification.type = 'success';
    document.body.appendChild(notification);
  }

  /**
   * Refresca la UI de related tasks después de un guardado exitoso
   */
  _refreshRelatedTasksUI() {
    // Forzar re-render si estamos en el tab de related tasks
    if (this.activeTab === 'relatedTasks') {
this.requestUpdate();
    }
  }

  _handleRelatedTaskClick(taskId, projectId) {
    // Usar el projectId de la tarea relacionada o el proyecto actual como fallback
    const targetProjectId = projectId || this.projectId;

    // Solicitar que se cargue y expanda la tarea relacionada
    document.dispatchEvent(new CustomEvent('load-and-expand-task', {
      detail: {
        taskId: taskId,
        projectId: targetProjectId
      },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Maneja la adición de una relación recíproca
   * @param {CustomEvent} e - Evento con los detalles de la relación
   */
  _handleAddReciprocalRelation(e) {
    const { taskId, relatedTaskId, relatedTaskTitle } = e.detail;
    // Solo procesar si es para esta tarea
    if (taskId === this.cardId) {
      const existingTask = this.relatedTasks.find(task => task.id === relatedTaskId);
      if (!existingTask) {
        this.relatedTasks = [...this.relatedTasks, { id: relatedTaskId, title: relatedTaskTitle || relatedTaskId }];
        // Forzar actualización visual
        this.requestUpdate();
      }
    }
  }

  /**
   * Maneja la eliminación de una relación recíproca
   * @param {CustomEvent} e - Evento con los detalles de la relación
   */
  _handleRemoveReciprocalRelation(e) {
    const { taskId, relatedTaskId } = e.detail;
    // Solo procesar si es para esta tarea
    if (taskId === this.cardId) {
      this.relatedTasks = this.relatedTasks.filter(task => task.id !== relatedTaskId);
      // Forzar actualización visual
      this.requestUpdate();
    }
  }

  /**
   * Get selected year from localStorage or YearSelector, fallback to current year
   * @returns {number} The selected year
   */
  _getSelectedYear() {
    // First check if this card already has a year (loaded from Firebase)
    if (this.year && this.year > 0) {
      return this.year;
    }
    // Try to get from localStorage (set by YearSelector)
    const savedYear = localStorage.getItem('selectedYear');
    if (savedYear) {
      return Number(savedYear);
    }
    // Fallback to current year
    return new Date().getFullYear();
  }

  /**
   * Filter sprints by selected year
   * @param {Object} sprintList - Object with sprint entries
   * @returns {Object} Filtered sprint list containing only sprints from selected year
   */
  _filterSprintsByYear(sprintList) {
    const selectedYear = this._getSelectedYearFromSelector();
    const filtered = {};

    Object.entries(sprintList).forEach(([id, sprint]) => {
      // If sprint has no year field, show it (backwards compatibility)
      if (!sprint.year) {
        filtered[id] = sprint;
        return;
      }
      // Show sprint if it matches selected year
      if (Number(sprint.year) === selectedYear) {
        filtered[id] = sprint;
      }
    });

    return filtered;
  }

  /**
   * Get the currently selected year from YearSelector (localStorage)
   * @returns {number} The selected year from YearSelector
   */
  _getSelectedYearFromSelector() {
    const savedYear = localStorage.getItem('selectedYear');
    return savedYear ? Number(savedYear) : new Date().getFullYear();
  }

  // Migrar datos antiguos de relatedTasks si es necesario
  _migrateRelatedTasksData() {
    if (this.relatedTasks && Array.isArray(this.relatedTasks)) {
      // Si relatedTasks es un array de strings (formato antiguo), convertirlo a objetos
      const needsMigration = this.relatedTasks.length > 0 && typeof this.relatedTasks[0] === 'string';

      if (needsMigration) {
        this.relatedTasks = this.relatedTasks.map(taskId => ({
          id: taskId,
          title: taskId, // Usar el ID como título temporal
          projectId: this.projectId // Asumir que el projectId es el mismo para todas las tareas
        }));
}
    }
  }

  /**
   * Maneja la adición de relaciones recíprocas después de guardar la tarea
   */
  _handleReciprocalRelations() {
    // Obtener las tareas relacionadas que estaban guardadas anteriormente
    const originalRelatedTasks = this._previousState.relatedTasks || [];
    const currentRelatedTasks = this.relatedTasks || [];
// Encontrar tareas que se añadieron (están en current pero no en original)
    const addedTasks = currentRelatedTasks.filter(current =>
      !originalRelatedTasks.some(original => original.id === current.id)
    );

    // Encontrar tareas que se eliminaron (están en original pero no en current)
    const removedTasks = originalRelatedTasks.filter(original =>
      !currentRelatedTasks.some(current => current.id === original.id)
    );

    // Buscar y actualizar directamente las tareas relacionadas en el DOM
    addedTasks.forEach(relatedTask => {
// Buscar la tarea en el DOM (tanto en vista compacta como expandida)
      const taskElements = document.querySelectorAll(`task-card[card-id="${relatedTask.id}"]`);

      if (taskElements.length > 0) {
        taskElements.forEach(taskElement => {
          const existingTask = taskElement.relatedTasks?.find(task => task.id === this.cardId);
          if (!existingTask) {
            // Añadir esta tarea a la lista de tareas relacionadas
            taskElement.relatedTasks = [...(taskElement.relatedTasks || []), {
              id: this.cardId,
              title: this.title || this.cardId,
              projectId: this.projectId
            }];
            taskElement.requestUpdate();
          }
        });
      } else {
// Fallback: usar evento
        document.dispatchEvent(new CustomEvent('add-reciprocal-relation', {
          detail: {
            taskId: relatedTask.id,
            relatedTaskId: this.cardId,
            relatedTaskTitle: this.title,
            projectId: this.projectId
          },
          bubbles: true,
          composed: true
        }));
      }
    });

    // Eliminar relaciones recíprocas para las tareas removidas
    removedTasks.forEach(relatedTask => {
// Buscar la tarea en el DOM
      const taskElements = document.querySelectorAll(`task-card[card-id="${relatedTask.id}"]`);

      if (taskElements.length > 0) {
        taskElements.forEach(taskElement => {
          taskElement.relatedTasks = (taskElement.relatedTasks || []).filter(task => task.id !== this.cardId);
taskElement.requestUpdate();
        });
      } else {
// Fallback: usar evento
        document.dispatchEvent(new CustomEvent('remove-reciprocal-relation', {
          detail: {
            taskId: relatedTask.id,
            relatedTaskId: this.cardId,
            projectId: this.projectId
          },
          bubbles: true,
          composed: true
        }));
      }
    });
  }

  get canDelete() {
    // La versión de permisos fuerza el recálculo cuando cambia
    const version = this._permissionsVersion || 0;

    if (this._cachedCanDelete !== undefined && this._cachedCanDeleteVersion === version) {
      return this._cachedCanDelete;
    }

    // Usar viewMode de la propiedad reactiva si está disponible
    const currentUser = document.body.dataset.userEmail;
    const userRole = window.currentUserRole || { isResponsable: false };
    const viewMode = this.currentViewMode || window.currentViewMode || 'consultation';

    // Limpiar cache para asegurar recálculo con datos actuales
    permissionService.clearCache();
    permissionService.init(
      { email: currentUser },
      userRole,
      viewMode
    );

    const permissions = permissionService.getCardPermissions(this, 'task');
    // Si el año es de solo lectura, no se puede borrar
    const canDeleteResult = permissions.canDelete && !this.isYearReadOnly;

    this._cachedCanDelete = canDeleteResult;
    this._cachedCanDeleteVersion = version;

    return canDeleteResult;
  }

  /**
   * Override: Campos editables específicos de TaskCard
   * @returns {Object} Estado actual de campos editables
   */
  _getEditableState() {
    return {
      ...super._getEditableState(),
      acceptanceCriteria: this.acceptanceCriteria || '',
      descriptionStructured: JSON.stringify(this.descriptionStructured || []),
      acceptanceCriteriaStructured: JSON.stringify(this.acceptanceCriteriaStructured || []),
      businessPoints: this.businessPoints || 0,
      devPoints: this.devPoints || 0,
      startDate: this.startDate || '',
      endDate: this.endDate || '',
      sprint: this.sprint || '',
      developer: this.developer || '',
      coDeveloper: this.coDeveloper || '',
      epic: this.epic || '',
      validator: this.validator || '',
      coValidator: this.coValidator || '',
      spike: this.spike || false,
      expedited: this.expedited || false,
      blockedByBusiness: this.blockedByBusiness || false,
      blockedByDevelopment: this.blockedByDevelopment || false,
      bbbWhy: this.bbbWhy || '',
      bbbWho: this.bbbWho || '',
      bbdWhy: this.bbdWhy || '',
      bbdWho: this.bbdWho || '',
      attachment: this.attachment || '',
      relatedTasks: JSON.stringify(this.relatedTasks || [])
    };
  }
}

// Exponer función de limpieza de caché globalmente para debugging
if (typeof window !== 'undefined') {
  window.clearTaskCardCache = TaskCard.clearCache;
}

customElements.define('task-card', TaskCard);

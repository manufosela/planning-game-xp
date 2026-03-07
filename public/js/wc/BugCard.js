import { html, css, unsafeCSS } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { format, isValid, parse } from 'https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm';
import { BaseCard } from './base-card.js';
import { NotesManagerMixin } from '../mixins/notes-manager-mixin.js';
import { CommitsDisplayMixin } from '../mixins/commits-display-mixin.js';
import { AiUsageDisplayMixin } from '../mixins/ai-usage-display-mixin.js';
import { BugCardStyles } from './bug-card-styles.js';
import { NotesStyles } from '../ui/styles/notes-styles.js';
import { CommitsListStyles } from './commits-list-styles.js';
import { AiUsageStyles } from './ai-usage-styles.js';
import { KANBAN_STATUS_COLORS_CSS } from '../config/theme-config.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { permissionService } from '../services/permission-service.js';
import { database, ref, get, functions, httpsCallable, set as dbSet, auth, firebaseConfig } from '../../firebase-config.js';
import { normalizeDeveloperEntries, normalizeDeveloperEntry, buildDeveloperSelectOptions, getDeveloperKey } from '../utils/developer-normalizer.js';
import { developerDirectory } from '../config/developer-directory.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { openScenarioModal } from '../utils/scenario-modal.js';
import { BUG_SCHEMA } from '../schemas/card-field-schemas.js';
import { generateTimestamp, extractDateTimeLocal } from '../utils/timestamp-utils.js';
import { demoModeService } from '../services/demo-mode-service.js';
import './FirebaseStorageUploader.js';

export class BugCard extends AiUsageDisplayMixin(CommitsDisplayMixin(NotesManagerMixin(BaseCard))) {
  // Static cache for project developers to avoid redundant Firebase calls
  static _developerCache = new Map();
  static _loadingPromises = new Map();
  static _cacheTimeout = 5 * 60 * 1000; // 5 minutes

  static get properties() {
    return {
      ...super.properties,

      // Core bug properties
      status: { type: String },
      priority: { type: String },
      developer: { type: String },
      coDeveloper: { type: String },
      registerDate: { type: String },
      acceptanceCriteria: { type: String },
      bugType: { type: String },
      attachment: { type: String },

      // Lists for selects
      statusList: { type: Array },
      priorityList: { type: Array },
      developerList: { type: Array },
      bugTypeList: { type: Array },
      userAuthorizedEmails: { type: Array },

      // UI state properties
      activeTab: { type: String },
      acceptanceCriteriaColor: { type: String },
      descriptionColor: { type: String },
      notesColor: { type: String },
      originalStatus: { type: String },

      // EXTRA FIELDS FOR TYPE C4D
      cinemaFile: { type: String },
      exportedFile: { type: String },
      importedFile: { type: String },
      plugin: { type: String },
      pluginVersion: { type: String },
      treatmentType: { type: String },
      originalFiles: { type: Object },

      // Validation
      invalidFields: { type: Array },

      // Repository label (para proyectos con múltiples repos)
      repositoryLabel: { type: String },
      projectRepositories: { type: Array },
      // Year for filtering bugs by year
      year: { type: Number },

      // IA Features - Acceptance Criteria structured
      acceptanceCriteriaStructured: { type: Array },
      isAnalyzingDescription: { type: Boolean },
      iaEnabled: { type: Boolean }
    };
  }

  static get styles() {
    return [
      BugCardStyles,
      NotesStyles,
      CommitsListStyles,
      AiUsageStyles,
      css`${unsafeCSS(KANBAN_STATUS_COLORS_CSS)}`
    ];
  }

  constructor() {
    super();

    // Inicializar notas para el sistema genérico de notas
    this.notes = '';

    // Establecer grupo por defecto para BugCard
    this.group = 'bugs';

    this.bugType = 'default';
    this.bugTypeList = ['default', 'c4d'];
    // Inicializar con lista vacía - se cargará desde GlobalDataManager
    this.priorityList = [];
    this.priority = '';

    // Intentar usar la lista global si está disponible
    if (window.globalBugPriorityList && Array.isArray(window.globalBugPriorityList) && window.globalBugPriorityList.length > 0) {
      this.priorityList = window.globalBugPriorityList;
      this.priority = this.priorityList[0];
    }
    this.statusList = window.statusBugList ? this._getOrderedStatusList(window.statusBugList) : ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed'];
    this.status = 'Created'; // Bug nuevo siempre empieza en Created
    this.registerDate = new Date().toISOString(); // Fecha de creación por defecto
    this.userAuthorizedEmails = [];
    this.developerList = this._normalizeDevelopersList(
      (Array.isArray(window.globalDeveloperList) && window.globalDeveloperList.length > 0)
        ? window.globalDeveloperList
        : developerDirectory
    );
    this.activeTab = 'description';

    this.descriptionColor = "#10b981";
    this.acceptanceCriteriaColor = "#3b82f6";
    this.notesColor = "#f59e0b";

    // EXTRA FIELDS FOR TYPE C4D
    this.cinemaFile = '';
    this.exportedFile = '';
    this.importedFile = '';
    this.plugin = '';
    this.pluginVersion = '';
    this.treatmentType = '';
    this.originalFiles = {
      cinemaFile: '',
      exportedFile: '',
      importedFile: ''
    };

    // Repository label (para proyectos con múltiples repos)
    this.repositoryLabel = '';
    this.projectRepositories = []; // Array de {url, label} del proyecto

    // Year for filtering - default to selected year or current year
    this.year = this._getSelectedYear();

    // IA Features
    this.acceptanceCriteriaStructured = [];
    this.isAnalyzingDescription = false;
    this.iaEnabled = false; // Will be loaded from project settings

    this.showDeleteModal = this.showDeleteModal.bind(this);
    this._confirmDelete = this._confirmDelete.bind(this);
    this._handleAttachmentUploaded = this._handleAttachmentUploaded.bind(this);
    this._handleAttachmentDeleted = this._handleAttachmentDeleted.bind(this);
  }

  /**
   * Aplica el orden lógico a la lista de estados usando APP_CONSTANTS
   * @param {Object|Array} statusList - Lista de estados desde Firebase
   * @returns {Array} Lista ordenada lógicamente
   */
  _getOrderedStatusList(statusList) {
    // Convertir a array si es necesario
    const availableStatuses = Array.isArray(statusList) ? statusList : Object.keys(statusList);

    // Aplicar orden lógico usando constantes
    const orderedStatuses = APP_CONSTANTS.BUG_STATUS_ORDER.filter(status => availableStatuses.includes(status));

    // Agregar estados adicionales no definidos en el orden predeterminado
    const remainingStatuses = availableStatuses.filter(status => !APP_CONSTANTS.BUG_STATUS_ORDER.includes(status));

    return [...orderedStatuses, ...remainingStatuses];
  }

  _normalizeDevelopersList(rawData) {
    if (!rawData) {
      return [];
    }

    const entries = [];

    const pushEntry = (nameCandidate, emailCandidate, idCandidate) => {
      const entry = {};
      if (nameCandidate !== undefined) {
        entry.name = nameCandidate;
      }
      if (emailCandidate !== undefined) {
        entry.email = emailCandidate;
      }
      if (idCandidate !== undefined) {
        entry.id = idCandidate;
      }
      entries.push(entry);
    };

    // Helper to resolve entity ID to display name
    const resolveEntityId = (entityId) => {
      if (typeof entityId === 'string' && entityId.startsWith('dev_')) {
        if (window.entityDirectoryService?.isInitialized?.()) {
          const displayName = window.entityDirectoryService.getDeveloperDisplayName(entityId);
          if (displayName && displayName !== entityId) {
            return { name: displayName, id: entityId };
          }
        }
        return { name: entityId, id: entityId }; // Fallback: use ID as name
      }
      return null;
    };

    if (Array.isArray(rawData)) {
      rawData.forEach(item => {
        if (!item) return;
        if (typeof item === 'object') {
          pushEntry(item.name || item.display || item.label, item.email || item.mail || item.value, item.id);
        } else if (typeof item === 'string') {
          // Check if it's an entity ID
          const resolved = resolveEntityId(item);
          if (resolved) {
            pushEntry(resolved.name, '', resolved.id);
          } else {
            pushEntry('', item);
          }
        }
      });
    } else if (typeof rawData === 'object') {
      Object.entries(rawData).forEach(([name, value]) => {
        if (!value && value !== 0) return;
        const keyIsId = typeof name === 'string' && name.startsWith('dev_');
        if (typeof value === 'object') {
          pushEntry(value.name || value.display || value.label || name, value.email || value.mail || value.value, value.id || (keyIsId ? name : ''));
        } else if (typeof value === 'string') {
          // Check if value is an entity ID
          const resolved = resolveEntityId(value);
          if (resolved) {
            pushEntry(resolved.name, '', resolved.id);
          } else {
            pushEntry(keyIsId ? '' : name, value, keyIsId ? name : undefined);
          }
        }
      });
    } else if (typeof rawData === 'string') {
      const resolved = resolveEntityId(rawData);
      if (resolved) {
        pushEntry(resolved.name, '', resolved.id);
      } else {
        pushEntry('', rawData);
      }
    }

    const normalized = normalizeDeveloperEntries(entries);
    return normalized
      .filter(entry => !entry.isUnassigned)
      .map(entry => ({
        name: entry.name,
        email: entry.email || entry.sourceEmail || '',
        id: entries.find(e => e.name === entry.name || e.email === entry.email)?.id || ''
      }));
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

  _normalizeDeveloperField() {
    const currentValue = (this.developer || '').toString().trim();
    if (!currentValue) {
      return;
    }

    const normalizedInfo = normalizeDeveloperEntry(currentValue);
    if (normalizedInfo.isUnassigned) {
      this.developer = '';
      return;
    }

    let resolvedEmail = normalizedInfo.email || normalizedInfo.sourceEmail || '';
    let resolvedName = normalizedInfo.name || '';
    const targetKey = getDeveloperKey(currentValue);

    if ((!resolvedEmail || !resolvedName) && Array.isArray(this.developerList)) {
      for (const entry of this.developerList) {
        const normalizedEntry = normalizeDeveloperEntry(entry);
        const entryKey = getDeveloperKey(normalizedEntry.email || normalizedEntry.name);
        if (entryKey && entryKey === targetKey) {
          resolvedEmail = resolvedEmail || normalizedEntry.email || normalizedEntry.sourceEmail || '';
          resolvedName = resolvedName || normalizedEntry.name || '';
          break;
        }
      }
    }

    if (!resolvedEmail && typeof currentValue === 'string' && currentValue.includes('@')) {
      resolvedEmail = currentValue.toLowerCase();
    }

    if (!resolvedName) {
      resolvedName = resolvedEmail ? this._formatNameFromEmail(resolvedEmail) : currentValue;
    }

    this.developer = resolvedEmail || resolvedName;
  }

  get developerSelectOptions() {
    return buildDeveloperSelectOptions(this.developerList || [], { includeUnassigned: false });
  }

  /**
   * Compara si un valor de option coincide con el developer asignado
   * Maneja diferentes formatos: entity ID (dev_XXX), email, nombre
   */
  _isDeveloperSelected(optionValue) {
    if (!this.developer || !optionValue) {
      return false;
    }

    // Comparación directa
    if (optionValue === this.developer) {
      return true;
    }

    // Si ambos son entity IDs, comparar directamente
    if (optionValue.startsWith('dev_') && this.developer.startsWith('dev_')) {
      return optionValue === this.developer;
    }

    // Resolver ambos a entity ID usando entityDirectoryService
    if (window.entityDirectoryService?.isInitialized?.()) {
      const optionEntityId = window.entityDirectoryService.resolveDeveloperId(optionValue);
      const developerEntityId = window.entityDirectoryService.resolveDeveloperId(this.developer);

      if (optionEntityId && developerEntityId && optionEntityId === developerEntityId) {
        return true;
      }

      // Comparar por email como fallback
      const optionEmail = window.entityDirectoryService.resolveDeveloperEmail(optionValue);
      const developerEmail = window.entityDirectoryService.resolveDeveloperEmail(this.developer);

      if (optionEmail && developerEmail && optionEmail === developerEmail) {
        return true;
      }
    }

    // Fallback: usar getDeveloperKey para comparación normalizada
    const optionKey = getDeveloperKey(optionValue);
    const developerKey = getDeveloperKey(this.developer);

    return optionKey && developerKey && optionKey === developerKey;
  }

  /**
   * Check if the given option value matches the current coDeveloper.
   */
  _isCoDeveloperSelected(optionValue) {
    if (!this.coDeveloper || !optionValue) {
      return false;
    }

    // Direct comparison
    if (optionValue === this.coDeveloper) {
      return true;
    }

    // If both are entity IDs, compare directly
    if (optionValue.startsWith('dev_') && this.coDeveloper.startsWith('dev_')) {
      return optionValue === this.coDeveloper;
    }

    // Resolve both to entity ID using entityDirectoryService
    if (window.entityDirectoryService?.isInitialized?.()) {
      const optionEntityId = window.entityDirectoryService.resolveDeveloperId(optionValue);
      const coDeveloperEntityId = window.entityDirectoryService.resolveDeveloperId(this.coDeveloper);

      if (optionEntityId && coDeveloperEntityId && optionEntityId === coDeveloperEntityId) {
        return true;
      }
    }

    // Fallback: use getDeveloperKey for normalized comparison
    const optionKey = getDeveloperKey(optionValue);
    const coDeveloperKey = getDeveloperKey(this.coDeveloper);

    return optionKey && coDeveloperKey && optionKey === coDeveloperKey;
  }

  /**
   * Request data from GlobalDataManager
   */
  _requestBugCardData() {
document.dispatchEvent(new CustomEvent('request-bugcard-data', {
      detail: {
        cardId: this.cardId,
        cardType: 'bug-card'
      }
    }));
  }

  connectedCallback() {
    super.connectedCallback();
    this.originalStatus = this.status;

    // Inicializar projectId desde atributos HTML si no está definido
    if (!this.projectId) {
      this.projectId = this.getAttribute('projectid') || this.getAttribute('project-id') || '';
    }

    // Load iaEnabled from project settings
    this._loadIaEnabled();

    // Si la card se conecta como expandida, pedir permisos después del render
    if (this.expanded) {
      this.updateComplete.then(() => this._requestPermissions());
    }

    // Initialize DOM element cache and debounced handlers
    this._cachedElements = new Map();
    this._setupDebouncedHandlers();

    // Listener para recibir listas de estado, prioridad y developers
    this._onProvideBugCardData = (e) => {
      if (e.detail?.cardId === this.cardId && e.detail?.cardType === 'bug-card') {
        // Validate arrays before assignment to prevent undefined.map() errors
        // Apply logical ordering to status list
        if (Array.isArray(e.detail.statusList) && e.detail.statusList.length > 0) {
          this.statusList = this._getOrderedStatusList(e.detail.statusList);
        } else if (e.detail.statusList && typeof e.detail.statusList === 'object') {
          this.statusList = this._getOrderedStatusList(e.detail.statusList);
        }

        // Priority list with fallback to global variable and protection against undefined
        if (Array.isArray(e.detail.priorityList) && e.detail.priorityList.length > 0) {
          this.priorityList = e.detail.priorityList;
        } else if (window.globalBugPriorityList && window.globalBugPriorityList.length > 0) {
          this.priorityList = window.globalBugPriorityList;
        } else {
          // Si no hay datos válidos, mantener lo que tenemos
}

        if (Array.isArray(e.detail.developerList) && e.detail.developerList.length > 0) {
          this.developerList = this._normalizeDevelopersList(e.detail.developerList);
        } else if (e.detail.developerList && typeof e.detail.developerList === 'object' && Object.keys(e.detail.developerList).length > 0) {
          this.developerList = this._normalizeDevelopersList(e.detail.developerList);
        } // si viene vacío, conservamos la lista actual (constructor/fallbacks)
        this.userAuthorizedEmails = e.detail.userAuthorizedEmails || [];
        this._normalizeDeveloperField();

        // Reset unsaved changes flag when data is loaded for first time

        this.requestUpdate();
      }
    };
    document.addEventListener('provide-bugcard-data', this._onProvideBugCardData);

    // Request data from GlobalDataManager if we need it
    if (this.expanded) {
      this._requestBugCardData();
    }

    // Listener para responder a verificaciones de cambios sin guardar
    this._onCheckUnsavedChanges = (e) => {
      if (e.detail.contentElementId === this.id && e.detail.contentElementType === 'bug-card') {

        // Usar sistema de checksum para detectar cambios
        const hasChanges = this.expanded && this.hasChanges();
        e.detail.hasUnsavedChanges = hasChanges;
      }
    };
    document.addEventListener('check-unsaved-changes', this._onCheckUnsavedChanges);

    // Escuchar eventos de guardado exitoso para actualizar UI (badge, etc.)
    this._handleCardSavedSuccessfully = (e) => {
      if (e.detail.cardId === this.cardId) {
        // Forzar re-render para actualizar badge y otros elementos
        this.requestUpdate();
      }
    };
    document.addEventListener('card-saved-successfully', this._handleCardSavedSuccessfully);

    // Load project-specific developers from /projects
    this._loadProjectDevelopers();
  }

  /**
   * Load developers from /projects/{projectId}/developers using static cache
   * @private
   */
  async _loadProjectDevelopers() {
    if (!this.projectId) {
      return;
    }

    // Check cache first
    const cached = BugCard._developerCache.get(this.projectId);
    if (cached && (Date.now() - cached.timestamp) < BugCard._cacheTimeout) {
      this.developerList = Array.isArray(cached.data) ? [...cached.data] : [];
      this.projectRepositories = cached.repositories || [];
      this._normalizeDeveloperField();
      this.requestUpdate();
      return;
    }

    // Check if already loading to avoid duplicate requests
    if (BugCard._loadingPromises.has(this.projectId)) {
      const data = await BugCard._loadingPromises.get(this.projectId);
      this.developerList = Array.isArray(data) ? [...data] : [];
      // Repositories se cargan en _fetchProjectDevelopers
      this._normalizeDeveloperField();
      this.requestUpdate();
      return;
    }

    // Load from Firebase
    const loadPromise = this._fetchProjectDevelopers();
    BugCard._loadingPromises.set(this.projectId, loadPromise);

    try {
      const data = await loadPromise;
      this.developerList = Array.isArray(data) ? [...data] : [];
      this._normalizeDeveloperField();
      this.requestUpdate();
    } finally {
      BugCard._loadingPromises.delete(this.projectId);
    }
  }

  async _fetchProjectDevelopers() {
    try {
      // Use entityDirectoryService to get developers with proper dev_XXX IDs
      await entityDirectoryService.waitForInit();
      const [developers, projectSnapshot] = await Promise.all([
        entityDirectoryService.getProjectDevelopers(this.projectId),
        get(ref(database, `/projects/${this.projectId}`))
      ]);

      // Convert to the format expected by the component
      let normalizedList = developers.map(dev => ({
        id: dev.id,
        name: dev.name,
        email: dev.email
      }));

      // Extract repositories from project
      let repositories = [];
      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        const repoUrl = projectData.repoUrl;
        if (Array.isArray(repoUrl) && repoUrl.length > 1) {
          repositories = repoUrl; // [{url, label}, ...]
        }
      }
      this.projectRepositories = repositories;

      // Warn if entityDirectoryService returned empty — data in /users/ may need sync
      if (normalizedList.length === 0) {
        console.warn(`[BugCard] No developers found for project "${this.projectId}". Run sync-users-project-roles.js to fix /users/ data.`);
      }

      // Cache the result
      if (normalizedList.length > 0) {
        BugCard._developerCache.set(this.projectId, {
          data: normalizedList,
          repositories: repositories,
          timestamp: Date.now()
        });
      } else {
        BugCard._developerCache.delete(this.projectId);
      }

      return normalizedList;
    } catch (error) {
return [];
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('provide-bugcard-data', this._onProvideBugCardData);
    document.removeEventListener('check-unsaved-changes', this._onCheckUnsavedChanges);
    document.removeEventListener('card-saved-successfully', this._handleCardSavedSuccessfully);

    // Clear cached elements and cleanup
    this._cachedElements = null;
    this._cleanupDebouncedHandlers();
  }

  // Performance optimization: shouldUpdate implementation
  shouldUpdate(changedProperties) {
    // Only update if critical properties changed
    const criticalProps = [
      'title', 'status', 'priority', 'developer', 'expanded', 'description', 'bugType',
      'canEditPermission', 'isEditable', 'userEmail', 'acceptanceCriteria', 'registerDate',
      'attachment', 'group', 'projectId', 'activeTab', 'createdBy', 'notes',
      'repositoryLabel', 'projectRepositories', 'acceptanceCriteriaStructured', 'isAnalyzingDescription'
    ];
    return Array.from(changedProperties.keys()).some(prop => criticalProps.includes(prop));
  }

  // Setup debounced input handlers for better performance
  _setupDebouncedHandlers() {
    this._debouncedTitleChange = this._createDebouncedHandler(this._handleTitleChangeOriginal, 300);
    this._debouncedDescriptionChange = this._createDebouncedHandler(this._handleDescriptionChangeOriginal, 500);
  }

  _cleanupDebouncedHandlers() {
    // Clear any pending timeouts
    if (this._debouncedTitleChange?.cancel) {
      this._debouncedTitleChange.cancel();
    }
    if (this._debouncedDescriptionChange?.cancel) {
      this._debouncedDescriptionChange.cancel();
    }
  }

  // Performance optimization: debounced input handler factory
  _createDebouncedHandler(handler, delay = 300) {
    let timeoutId;
    const debounced = (event) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handler.call(this, event);
      }, delay);
    };

    debounced.cancel = () => {
      clearTimeout(timeoutId);
    };

    return debounced;
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

  // Schedule file operations to run when browser is idle
  _scheduleFileOperation(callback) {
    if (window.requestIdleCallback) {
      requestIdleCallback(() => {
        callback.call(this);
      });
    } else {
      setTimeout(() => {
        callback.call(this);
      }, 100);
    }
  }

  requestUpdate(name, oldValue, options) {
    // Si se está expandiendo la card, pedir permisos después del render
    if (name === 'expanded' && this.expanded && !oldValue) {
      this.updateComplete.then(() => this._requestPermissions());
    }

    return super.requestUpdate(name, oldValue, options);
  }

  /**
   * Solicita permisos específicos para esta BugCard
   */
  _requestPermissions() {
    const permissionRequest = new CustomEvent('request-bug-permissions', {
      detail: {
        cardId: this.cardId,
        cardType: 'bug-card',
        userEmail: this.userEmail,
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

  _openMiniModalCloseWarning() {
    const dialog = document.createElement('dialog');
    dialog.id = 'close-warning-dialog';
    dialog.style = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; padding: 4rem; border: 4px solid #f43f5e; border-radius: 12px; font-size: 1.5rem;';
    dialog.innerHTML = `
      <p>Tienes cambios sin guardar.<br>¿Quieres cerrar de todos modos?</p>
      <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem;">
        <button id="confirmClose" style="background-color: #f43f5e; color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1.5rem;">Sí, cerrar sin guardar</button>
        <button id="cancelClose" style="background-color: #f59e0b; color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1.5rem;">No, quiero guardar antes</button>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.querySelector('#confirmClose').addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      // Forzar el cierre sin guardar
      this._forceCloseWithoutSaving();
    });

    dialog.querySelector('#cancelClose').addEventListener('click', () => {
      dialog.close();
      dialog.remove();
    });
  }

  /**
   * Fuerza el cierre del modal sin guardar cambios
   */
  _forceCloseWithoutSaving() {
    if (this.bugType === 'c4d') {
      this._cleanFilesUploaded();
    } else {
      // Reset state and close immediately
      this.expanded = false;
      document.dispatchEvent(new CustomEvent('close-modal', {
        bubbles: true,
        composed: true,
        detail: {
          contentElementId: this.id,
          contentElementType: 'bug-card'
        }
      }));
    }
  }

  /**
   * Limpia solo los archivos nuevos (no guardados) y restaura los originales
   */
  _cleanFilesUploaded() {
    if (this.bugType === 'c4d') {
      const deleteFile = async (fileUrl) => {
        if (!fileUrl) return;
        try {
          const { getStorage, ref, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
          const storage = getStorage(window._firebaseApp);
          const url = new URL(fileUrl);
          const pathMatch = decodeURIComponent(url.pathname).match(/\/o\/(.+)$/);
          const fullPath = pathMatch ? pathMatch[1].split('?')[0] : null;

          if (fullPath) {
            const fileRef = ref(storage, fullPath);
            await deleteObject(fileRef);
          }
        } catch (err) {
          // Silently ignore - file may already be deleted
        }
      };

      // Solo eliminar archivos que son NUEVOS (diferentes a los originales)
      const filesToDelete = [];

      if (this.cinemaFile && this.cinemaFile !== this.originalFiles.cinemaFile) {
        filesToDelete.push(deleteFile(this.cinemaFile));
}
      if (this.exportedFile && this.exportedFile !== this.originalFiles.exportedFile) {
        filesToDelete.push(deleteFile(this.exportedFile));
}
      if (this.importedFile && this.importedFile !== this.originalFiles.importedFile) {
        filesToDelete.push(deleteFile(this.importedFile));
}

      // Restaurar URLs originales
      this.cinemaFile = this.originalFiles.cinemaFile;
      this.exportedFile = this.originalFiles.exportedFile;
      this.importedFile = this.originalFiles.importedFile;
      this.requestUpdate();

      Promise.all(filesToDelete).then(() => {
this.expanded = false;
        document.dispatchEvent(new CustomEvent('close-modal', {
          bubbles: true,
          composed: true,
          detail: {
            contentElementId: this.id,
            contentElementType: 'bug-card'
          }
        }));
      }).catch((err) => {
// Aunque haya errores, continuar con el cierre
        this.expanded = false;
        document.dispatchEvent(new CustomEvent('close-modal', {
          bubbles: true,
          composed: true,
          detail: {
            contentElementId: this.id,
            contentElementType: 'bug-card'
          }
        }));
      });
    } else {
      this.expanded = false;
      document.dispatchEvent(new CustomEvent('close-modal', {
        bubbles: true,
        composed: true,
        detail: {
          contentElementId: this.id,
          contentElementType: 'bug-card'
        }
      }));
    }
  }

  updated(changedProperties) {
    // Track if card is expanding - we need to handle initial state capture after hydration
    const wasExpanded = changedProperties.has('expanded') && this.expanded;

    // Temporarily set _initialState to prevent BaseCard from capturing prematurely
    const hadInitialState = this._initialState;
    if (wasExpanded && !hadInitialState) {
      this._initialState = 'pending'; // Prevent BaseCard from capturing
    }

    super.updated(changedProperties);

    // Normalize empty status to 'Created'
    if (changedProperties.has('status') && (!this.status || this.status.trim() === '')) {
      this.status = 'Created';
    }

    // Normalize empty priority to first available or 'Medium'
    if (changedProperties.has('priority') && (!this.priority || this.priority.trim() === '')) {
      this.priority = (this.priorityList && this.priorityList.length > 0) ? this.priorityList[0] : 'Medium';
    }

    // Load developers when projectId changes
    if (changedProperties.has('projectId') && this.projectId) {
      this._loadProjectDevelopers();
    }

    // Protección defensiva: solicitar datos si no están disponibles
    if ((!this.priorityList || !Array.isArray(this.priorityList) || this.priorityList.length === 0) && this.expanded) {
      this._requestBugCardData();
    }
    if (changedProperties.has('bugType') && this.bugType === 'c4d') {
      import('./FirebaseStorageUploader.js');
    }
    if (wasExpanded) {
      document.dispatchEvent(new CustomEvent('request-bugcard-data', {
        detail: { cardId: this.cardId, cardType: 'bug-card' },
        bubbles: true,
        composed: true
      }));

      // Ensure developers are loaded when card expands
      if (this.projectId) {
        this._loadProjectDevelopers();
      }

      // Guardar estado original de los archivos cuando se expande
      this.originalFiles = {
        cinemaFile: this.cinemaFile || '',
        exportedFile: this.exportedFile || '',
        importedFile: this.importedFile || ''
      };
    }

    // Capture initial state AFTER data has been hydrated
    if (wasExpanded && !hadInitialState) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          this._initialState = null; // Reset the pending flag
          this.captureInitialState();
        }, 50);
      });
    }

    if (changedProperties.has('developer') || changedProperties.has('developerList')) {
      this._normalizeDeveloperField();
    }
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
   * Override de hasAttachments para incluir archivos específicos de C4D
   */
  hasAttachments() {
    const hasBaseAttachments = super.hasAttachments();
    const hasC4DFiles = !!(this.cinemaFile || this.exportedFile || this.importedFile);
    return hasBaseAttachments || hasC4DFiles;
  }

  /**
   * Override de getAttachmentsTooltip para incluir archivos de C4D
   */
  getAttachmentsTooltip() {
    const attachments = [];
    if (this.attachment) attachments.push('Archivo adjunto genérico');
    if (this.cinemaFile) attachments.push('Archivo Cinema 4D');
    if (this.exportedFile) attachments.push('Archivo exportado');
    if (this.importedFile) attachments.push('Archivo importado');

    const count = attachments.length;
    if (count === 1) {
      return `Tiene ${attachments[0]}`;
    } else {
      return `Tiene ${count} archivos: ${attachments.join(', ')}`;
    }
  }

  get canEdit() {
    // Si el año es de solo lectura, no se puede editar
    return this.canEditPermission && !this.isYearReadOnly;
  }

  get canSave() {
    return this.canEdit && this.title.trim();
  }

  get canDelete() {
    // La versión de permisos (_permissionsVersion) fuerza el recálculo del getter cuando cambia
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

    const permissions = permissionService.getCardPermissions(this, 'bug');
    // Si el año es de solo lectura, no se puede borrar
    return permissions.canDelete && !this.isYearReadOnly;
  }

  /**
   * Resetea a los archivos originales sin eliminar nada del storage
   */
  _resetToOriginalFiles() {
    this.cinemaFile = this.originalFiles.cinemaFile;
    this.exportedFile = this.originalFiles.exportedFile;
    this.importedFile = this.originalFiles.importedFile;
    this.requestUpdate();
  }

  /**
   * Obtiene información del estado actual de los archivos
   */
  _getFilesStatus() {
    if (this.bugType !== 'c4d') return '';

    const changes = [];
    if (this.cinemaFile !== this.originalFiles.cinemaFile) {
      changes.push('Cinema File');
    }
    if (this.exportedFile !== this.originalFiles.exportedFile) {
      changes.push('Exported File');
    }
    if (this.importedFile !== this.originalFiles.importedFile) {
      changes.push('Imported File');
    }

    if (changes.length === 0) {
      return 'No hay cambios en archivos';
    }

    return `Archivos modificados: ${changes.join(', ')}`;
  }

  /**
   * Renderiza el indicador de adjuntos
   */
  renderAttachmentIndicator() {
    // Verificar si tiene adjunto genérico o adjuntos específicos de C4D
    const hasGenericAttachment = this.attachment;
    const hasC4DAttachments = this.cinemaFile || this.exportedFile || this.importedFile;

    if (hasGenericAttachment || hasC4DAttachments) {
      return html`<span class="attachment-indicator" title="Tiene archivo adjunto">📎</span>`;
    }
    return '';
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
        <div class="title" title="${this.title || ''}">${this.title || ''}</div>
        <div class="card-id-row">
          <div class="cardid" title="Click para copiar ID" style="cursor:pointer" @click=${this._copyCardId}>${this.cardId || ''}${this._renderRepoBadge()}${this._renderPipelineBadges()}</div>
          <div class="card-actions">
            ${this.attachment ? html`<span class="attachment-indicator" title="Tiene archivo adjunto">📎</span>` : ''}
            <button class="copy-link-button" title="Copiar enlace" @click=${this.copyCardUrl}>🔗</button>
            ${this.canMoveToProject ? html`<button class="move-project-button" title="Mover a otro proyecto" @click=${(e) => { e.stopPropagation(); this._handleMoveToProject(e); }}>📦</button>` : ''}
            ${this.canDelete ? html`<button class="delete-button" @click=${this.showDeleteModal}>🗑️</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderCompact() {
    return html`
      <div class="card-container">
        ${this.renderCompactHeader()}
        <div class="card-body">
          <table class="bugcard-table" style="width:100%; font-size:0.98em; border-collapse:collapse;">
            <tbody>
              <tr>
                <td><span>Register Date:</span></td>
                <td>${this.formatDate(this.registerDate)}</td>
              </tr>
              <tr>
                <td><span>Start Date:</span></td>
                <td>${this.formatDate(this.startDate)}</td>
              </tr>
              <tr>
                <td><span>End Date:</span></td>
                <td>${this.formatDate(this.endDate)}</td>
              </tr>
              <tr>
                <td><span>Created by:</span></td>
                <td class="createdByColor"><span class="truncate-text" title="${this.createdBy}">${window.UserDisplayUtils ? window.UserDisplayUtils.getCardDisplayCreatedBy(this) : this.createdBy}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card-footer">
          <span class="${(this.status || 'Created').replace(/\s/g, '').toLowerCase()}">${this.status || 'Created'}</span>
          <span></span>
          <span class="${(this.priority || 'Medium').replace(/\s/g, '').toLowerCase()}">${this.priority || 'Medium'}</span>
        </div>
      </div>
    `;
  }

  /**
   * Vista ultra-compacta para Kanban
   */
  renderUltraCompact() {
    const statusClass = (this.status || 'Created').replace(/\s/g, '').toLowerCase();
    const priorityClass = (this.priority || 'Medium').replace(/\s/g, '').toLowerCase();
    const truncatedTitle = this.title?.length > 35 ? this.title.substring(0, 35) + '...' : this.title;

    // Iniciales del developer
    const developerDisplay = this.developer || '';
    const initials = developerDisplay ? developerDisplay.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '';

    return html`
      <div class="card-container ultra-compact" @click=${this._handleClick}>
        <div class="uc-row-top">
          <span class="uc-cardid">${this.cardId || ''}${this._renderPipelineBadges()}</span>
          <span class="uc-priority ${priorityClass}">${this.priority || 'Medium'}</span>
        </div>
        <div class="uc-title" title="${this.title || ''}">${truncatedTitle || ''}</div>
        <div class="uc-row-bottom">
          <div class="uc-indicators">
            ${this.bugType === 'c4d' ? html`<span class="uc-bugtype" title="C4D Bug">🎬</span>` : ''}
          </div>
          ${initials ? html`<span class="uc-developer" title="${developerDisplay}">${initials}</span>` : ''}
          <div class="uc-status ${statusClass}">${this.status || 'Created'}</div>
        </div>
      </div>
    `;
  }

  _renderStatus() {
if (this.userAuthorizedEmails.includes(this.userEmail)) {
      return html`
        <select id="status" .value=${this.status || 'Created'} @change=${this._handleStatusChange}>
            ${(Array.isArray(this.statusList) ? this.statusList : ['Created']).map(status => html`<option value="${status}" ?selected=${this.status === status || (!this.status && status === 'Created')}>${status}</option>`)}
        </select>`;
    } else {
      return html`<div class="status ${(this.status || 'Created').replace(/\s/g, '').toLowerCase()}">${this.status || 'Created'}</div>`;
    }
  }

  _setActiveTab(tab) {
    this.activeTab = tab;
    this.shadowRoot.querySelector('.tab-content').scrollIntoView({ behavior: 'smooth' });
    this.shadowRoot.querySelector('.tab-content').classList.remove('ta-description', 'ta-acceptanceCriteria', 'ta-notes');
    this.shadowRoot.querySelector('.tab-content').classList.add('ta-' + tab);
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

  renderExpanded() {
    return html`
      ${this.renderExpandedHeader()}
      
      <div class="expanded-fields">
        <div class="field-group-row">
          <div class="field-group status-group">
            <label>Status:</label>
            <select id="status" .value=${this.status || 'Created'} @change=${this._handleStatusChange} ?disabled=${!this.isEditable}>
              ${(Array.isArray(this.statusList) ? this.statusList : ['Created']).map(status => html`
                <option value="${status}" ?selected=${this.status === status || (!this.status && status === 'Created')}>${status}</option>
              `)}
            </select>
          </div>
          
          <div class="field-group priority-group">
            <label>Priority:</label>
            <select id="priority" .value=${this.priority || 'Medium'} @change=${this._handlePriorityChange} ?disabled=${!this.isEditable}>
              ${(Array.isArray(this.priorityList) ? this.priorityList : ['Low', 'Medium', 'High']).map(priority => html`
                <option value="${priority}" ?selected=${this.priority === priority || (!this.priority && priority === 'Medium')}>${priority}</option>
              `)}
            </select>
          </div>

          <div class="field-group developer-group">
            <label>Developer:</label>
            <select id="developer" class="${this._getFieldClass('developer')}" .value=${this.developer || ''} @change=${this._handleDeveloperChange} ?disabled=${!this.isEditable}>
              <option value="${APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE}" ?selected=${!this.developer || APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer)}>${APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES}</option>
              ${this.developerSelectOptions.map(option => html`
                <option value=${option.value} ?selected=${this._isDeveloperSelected(option.value)}>
                  ${option.display}
                </option>
              `)}
            </select>
          </div>

          <div class="field-group codeveloper-group">
            <label>Co-Developer:</label>
            <select id="coDeveloper" class="${this._getFieldClass('coDeveloper')}" .value=${this.coDeveloper || ''} @change=${this._handleCoDeveloperChange} ?disabled=${!this.isEditable}>
              <option value="" ?selected=${!this.coDeveloper}>Sin asignar</option>
              ${this.developerSelectOptions.map(option => html`
                <option value=${option.value} ?selected=${this._isCoDeveloperSelected(option.value)}>
                  ${option.display}
                </option>
              `)}
            </select>
          </div>
        </div>
      </div>

      <div class="card-dates">
        <div class="field-group">
          <label>Register Date:</label>
          <div>${this.formatDate(this.registerDate) || 'Sin fecha'}</div>
        </div>
        <div class="field-group">
          <label>Created By:</label>
          <div>${this.createdBy || 'Sin asignar'}</div>
        </div>
        
        <div class="field-group">
          <label>Start Date:</label>
          <input
            type="datetime-local"
            class="${this._getFieldClass('startDate')}"
            .value=${extractDateTimeLocal(this.startDate, 'start')}
            @input=${this._handleStartDateChange}
            ?disabled=${!this.isEditable}
          />
        </div>

        <div class="field-group">
          <label>End Date:</label>
          <input
            type="datetime-local"
            class="${this._getFieldClass('endDate')}"
            .value=${extractDateTimeLocal(this.endDate, 'end')}
            @input=${this._handleEndDateChange}
            ?disabled=${!this.isEditable}
          />
        </div>

        <div class="field-group bugtype-group">
          <label>Bug Type:</label>
          <select id="bugType" .value=${this.bugType || 'default'} @change=${this._handleBugTypeChange} ?disabled=${!this.isEditable}>
            ${this.bugTypeList.map(type => html`
              <option value="${type}" ?selected=${this.bugType === type}>${type}</option>
            `)}
          </select>
        </div>

        ${this.projectRepositories.length > 1 ? html`
        <div class="field-group">
          <label>Repo:</label>
          <select id="repositoryLabel" class="${this._getFieldClass('repositoryLabel')}"
                  .value=${this._getEffectiveRepoLabel()}
                  @change=${this._handleRepositoryLabelChange}
                  ?disabled=${!this.isEditable}>
            ${this.projectRepositories.map(repo => html`
              <option value=${repo.label} ?selected=${this._getEffectiveRepoLabel() === repo.label}>${repo.label}</option>
            `)}
          </select>
        </div>
        ` : ''}
      </div>

      ${this.bugType === 'c4d' ? html`
      <div class="card-extra">
        <div class="uploader-group">
          <label>Cinema File:</label>
          <firebase-storage-uploader
            storage-path="c4d/cinema"
            filename-template=${`cinema_${this.cardId}`}
            .generate-unique-filenames=${true}
            .fileUrl=${this.cinemaFile}
            @file-uploaded=${e => this._handleFileUploaded(e, 'cinemaFile')}
            @file-deleted=${() => this._handleFileDeleted('cinemaFile')}
          ></firebase-storage-uploader>
        </div>
        <div class="uploader-group">
          <label>Exported File:</label>
          <firebase-storage-uploader
            storage-path="c4d/exported"
            filename-template=${`exported_${this.cardId}`}
            .generate-unique-filenames=${true}
            .fileUrl=${this.exportedFile}
            @file-uploaded=${e => this._handleFileUploaded(e, 'exportedFile')}
            @file-deleted=${() => this._handleFileDeleted('exportedFile')}
          ></firebase-storage-uploader>
        </div>
        <div class="uploader-group">
          <label>Imported File:</label>
          <firebase-storage-uploader
            storage-path="c4d/imported"
            filename-template=${`imported_${this.cardId}`}
            .generate-unique-filenames=${true}
            .fileUrl=${this.importedFile}
            @file-uploaded=${e => this._handleFileUploaded(e, 'importedFile')}
            @file-deleted=${() => this._handleFileDeleted('importedFile')}
          ></firebase-storage-uploader>
        </div>
        <div class="uploader-group">
          <label>Plugin:</label>
          <input
            type="text"
            .value=${this.plugin}
            @input=${this._handlePluginChange}
            placeholder="Nombre del plugin"
            ?disabled=${!this.isEditable}
          />
        </div>
        <div class="uploader-group">
          <label>Plugin Version:</label>
          <input
            type="text"
            .value=${this.pluginVersion}
            @input=${this._handlePluginVersionChange}
            placeholder="Versión del plugin"
            ?disabled=${!this.isEditable}
          />
        </div>
        <div class="uploader-group">
          <label>Treatment Type:</label>
          <input
            type="text"
            .value=${this.treatmentType}
            @input=${this._handleTreatmentTypeChange}
            placeholder="Tipo de tratamiento"
            ?disabled=${!this.isEditable}
          />
        </div>
      </div>
      ${this.expanded && this.hasChanges() ? html`
        <div class="files-status">
          ${this._getFilesStatus()}
        </div>
      ` : ''}
      ` : ''}

      <div class="tabs">
        <button class="description tab-button ${this.activeTab === 'description' ? 'active' : ''}" @click=${() => this._setActiveTab('description')}>Description</button>
        <button class="acceptance-criteria tab-button ${this.activeTab === 'acceptanceCriteria' ? 'active' : ''}" @click=${() => this._setActiveTab('acceptanceCriteria')}>Acceptance Criteria</button>
        <button class="notes tab-button ${this.activeTab === 'notes' ? 'active' : ''}" @click=${() => this._setActiveTab('notes')}>${this._getNotesTabLabel()}</button>
        <button class="attachment tab-button ${this.activeTab === 'attachment' ? 'active' : ''}" @click=${() => this._setActiveTab('attachment')}>Adjunto</button>
        ${this._getCommitsArray().length > 0 ? html`
        <button class="commits tab-button ${this.activeTab === 'commits' ? 'active' : ''}" @click=${() => this._setActiveTab('commits')}>${this._getCommitsTabLabel()}</button>
        ` : ''}
        ${this._getAiUsageArray().length > 0 ? html`
        <button class="ai-usage tab-button ${this.activeTab === 'aiUsage' ? 'active' : ''}" @click=${() => this._setActiveTab('aiUsage')}>${this._getAiUsageTabLabel()}</button>
        ` : ''}
      </div>
      <div class="tab-content">
        ${this.activeTab === 'description' ? html`
          <textarea
            class="${this._getFieldClass('description')}"
            .value=${this.description}
            @input=${this._handleDescriptionChange}
            placeholder="Description"
            aria-label="Description"
            ?disabled=${!this.isEditable}>
          </textarea>
          ${this.isEditable && this.iaEnabled ? html`
            <button
              class="improve-ia-button"
              @click=${this._improveDescriptionWithIa}
              title="Analiza la descripción y sugiere mejoras mediante preguntas de clarificación">
              ✨ Mejorar con IA
            </button>
          ` : ''}` : ''}
        ${this.activeTab === 'acceptanceCriteria' ? html`
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
                ${(this._getAcceptanceCriteriaStructuredList().length > 0 ? this._getAcceptanceCriteriaStructuredList() : [{ given: '', when: '', then: '', raw: '' }]).map((scenario, idx) => html`
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="ellipsis" title=${scenario.given || ''}>${scenario.given || ''}</td>
                    <td class="ellipsis" title=${scenario.when || ''}>${scenario.when || ''}</td>
                    <td class="ellipsis" title=${scenario.then || ''}>${scenario.then || ''}</td>
                    <td class="actions">
                      <span class="icon-button" role="button" title="Editar" @click=${() => this._openScenarioModal(idx)} aria-label="Editar escenario">✏️</span>
                      ${this._getAcceptanceCriteriaStructuredList().length > 1 ? html`
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
          </div>` : ''}
        ${this.activeTab === 'notes' ? html`
          <div class="notes-panel">
            ${this.renderNotesPanel()}
          </div>` : ''}
        ${this.activeTab === 'attachment' ? html`
          <div class="attachment-section">
            <label for="attachment">Archivo adjunto</label>
            <firebase-storage-uploader
              storage-path="bug-attachments/${this.projectId}/${this.cardId}"
              filename-template="bug_${this.cardId}_attachment"
              .generate-unique-filenames=${true}
              .fileUrl=${this.attachment}
              @file-uploaded=${this._handleAttachmentUploaded}
              @file-deleted=${this._handleAttachmentDeleted}
            ></firebase-storage-uploader>
          </div>` : ''}
        ${this.activeTab === 'commits' ? this.renderCommitsPanel() : ''}
        ${this.activeTab === 'aiUsage' ? this.renderAiUsagePanel() : ''}
      </div>
      <div class="expanded-footer ia-footer">
        <div class="footer-left"></div>
        <div style="display:flex; justify-content:center;">
          ${this.canSave ? html`<button class="save-button" @click=${this._handleSave}>Save</button>` : ''}
        </div>
        <div class="footer-right">
          <span class="icon-btn" role="button" title="Copiar enlace" @click=${(e) => { e.stopPropagation(); this.copyCardUrl(); }}>🔗</span>
          ${this.canMoveToProject ? html`
            <span class="icon-btn" role="button" title="Mover a otro proyecto" @click=${(e) => { e.stopPropagation(); this._handleMoveToProject(e); }}>📦</span>
          ` : ''}
          ${this.canDelete ? html`
            <span class="icon-btn" role="button" title="Eliminar" @click=${(e) => { e.stopPropagation(); this.showDeleteModal(e); }}>🗑️</span>
          ` : ''}
          ${this._isNotDone() ? html`
            <span class="icon-btn" role="button" title="Generar enlace IA (1 uso, 15 min)" @click=${(e) => { e.stopPropagation(); this._generateIaLink(); }}>🤖</span>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Muestra el modal de confirmación para eliminar la tarjeta.
   * @param {Event} event - El evento de clic.
   */
  showDeleteModal(event) {
    event.stopPropagation(); // Evita que el evento de clic se propague al contenedor
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
          button2Action: () => { } // Solo cierra el modal
        }
      }
    }));
  }

  /**
   * Confirma el borrado de la tarjeta y lanza el evento correspondiente.
   */
  async _confirmDelete() {
    if (this.bugType === 'c4d') {
      const { getStorage, ref, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
      const storage = getStorage(window._firebaseApp);

      // Función auxiliar para eliminar un archivo por su URL
      const deleteFileByUrl = async (fileUrl) => {
        if (!fileUrl) return;
        try {
          const url = new URL(fileUrl);
          const pathMatch = decodeURIComponent(url.pathname).match(/\/o\/(.+)$/);
          const fullPath = pathMatch ? pathMatch[1].split('?')[0] : null;
          if (fullPath) {
            const fileRef = ref(storage, fullPath);
            await deleteObject(fileRef);
          }
        } catch (err) {
          // Silently ignore - file may already be deleted
        }
      };

      // Eliminar TODOS los archivos de la tarjeta al borrarla completamente
      await Promise.all([
        deleteFileByUrl(this.cinemaFile),
        deleteFileByUrl(this.exportedFile),
        deleteFileByUrl(this.importedFile)
      ]);
    }

    // Finalmente eliminamos la tarjeta
    const cardProps = this.getWCProps();
    document.dispatchEvent(new CustomEvent('delete-card', {
      detail: {
        cardData: cardProps
      }
    }));
  }

  /**
   * Devuelve un objeto plano con todas las propiedades relevantes de la tarjeta.
   * @returns {Object} Propiedades serializables de la tarjeta.
   */
  /**
   * Override getCardData to include BugCard-specific properties and ensure required fields
   * @returns {Object} Datos completos de la BugCard
   */
  getCardData() {
    // Asegurar que tenemos projectId y group antes de guardar
    if (!this.projectId) {
      this.projectId = this.getAttribute('projectid') || this.getAttribute('project-id') || '';
}
    if (!this.group) {
      this.group = this.getAttribute('group') || 'bugs';
}

    const baseData = super.getCardData();

    // Si hay múltiples repos y no tiene etiqueta, usar el default (primero)
    let repoLabel = this.repositoryLabel || '';
    if (this.projectRepositories.length > 1 && !repoLabel) {
      repoLabel = this.projectRepositories[0]?.label || '';
    }

    const cardData = {
      // Propiedades base de BaseCard
      ...baseData,

      // Asegurar que los IDs están correctamente configurados para actualizar tarjeta existente
      id: this.id || this.firebaseId,
      firebaseId: this.firebaseId,
      cardId: this.cardId,

      // Propiedades específicas de BugCard
      status: this.status || 'Created',
      priority: this.priority || '',
      developer: this.developer || '',
      registerDate: this.registerDate || new Date().toISOString(),
      acceptanceCriteria: this.acceptanceCriteria || '',
      bugType: this.bugType || 'default',
      attachment: this.attachment || '',

      // Campos específicos para bugs tipo c4d
      cinemaFile: this.cinemaFile || '',
      exportedFile: this.exportedFile || '',
      importedFile: this.importedFile || '',
      plugin: this.plugin || '',
      pluginVersion: this.pluginVersion || '',
      treatmentType: this.treatmentType || '',

      // Asegurar que group y projectId están definidos
      group: this.group || 'bugs',
      projectId: this.projectId || '',

      // Repository label (para proyectos con múltiples repos)
      repositoryLabel: repoLabel,

      // IA Features - Acceptance Criteria structured
      acceptanceCriteriaStructured: this._getAcceptanceCriteriaStructuredForSave(),

      // Pipeline tracking
      ...(this.pipelineStatus ? { pipelineStatus: this.pipelineStatus } : {})
    };

    return cardData;
  }

  /**
   * Guarda la tarjeta sin cerrar modales (específico para sistema de notas)
   */
  _saveNotesOnly() {
    if (!this.canSave) {
      return;
    }
    // Demo mode: block saves
    if (demoModeService.isDemo()) {
      demoModeService.showFeatureDisabled('editing');
      return;
    }
    // Activar estado de guardado y overlay del padre
    this.isSaving = true;
    this._showSavingOverlay();

    try {
      const cardProps = this.getWCProps();
      // NO poner expanded = false para no cerrar el modal

      this.dispatchEvent(new CustomEvent('save-card', {
        detail: { cardData: cardProps },
        bubbles: true,
        composed: true
      }));

      // Actualizar archivos originales después de guardar
      this.originalFiles = {
        cinemaFile: this.cinemaFile || '',
        exportedFile: this.exportedFile || '',
        importedFile: this.importedFile || ''
      };

      // NO poner this.expanded = false para no cerrar el modal
    } catch (error) {
      console.error('[BugCard] _saveNotesOnly error:', error);
      this._showNotification('Error saving notes', 'error');
    } finally {
      this._hideSavingOverlay();
      this.isSaving = false;
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

  getWCProps() {
    return this._buildPersistentProps(BUG_SCHEMA.PERSISTENT_FIELDS);
  }

  /**
   * Lanza un evento personalizado con los datos de la tarjeta para que la app los guarde.
   * Incluye todos los campos, incluidos los de archivos subidos.
   */

  /**
   * Maneja el cambio en el campo Title.
   * @param {Event} e - Evento de cambio del input.
   */

  /**
   * Maneja el cambio en el campo Plugin.
   * @param {Event} e - Evento de cambio del input.
   */
  _handlePluginChange(e) {
    this.plugin = e.target.value;
  }

  /**
   * Maneja el cambio en el campo Plugin Version.
   * @param {Event} e - Evento de cambio del input.
   */
  _handlePluginVersionChange(e) {
    this.pluginVersion = e.target.value;
  }

  /**
   * Maneja el cambio en el campo Treatment Type.
   * @param {Event} e - Evento de cambio del input.
   */
  _handleTreatmentTypeChange(e) {
    this.treatmentType = e.target.value;
  }

  /**
   * Maneja el cambio en el campo Status.
   * @param {Event} e - Evento de cambio del select.
   */
  _handleStatusChange(e) {
    const previousStatus = this.status;
    const newStatus = e.target.value;
    const finalStatuses = ['Fixed', 'Verified', 'Closed'];

    // Auto-rellenar endDate cuando se cambia a un estado final (si no tiene valor)
    if (finalStatuses.includes(newStatus) && !finalStatuses.includes(previousStatus)) {
      if (!this.endDate) {
        this.endDate = generateTimestamp(new Date(), 'end');
      }
    }

    // Validar campos requeridos para estados específicos
    if (['Fixed', 'Verified', 'Closed'].includes(newStatus) && !['Fixed', 'Verified', 'Closed'].includes(previousStatus)) {
      // Validar campos requeridos para estados de finalización (endDate ya se auto-rellenó arriba)
      const requiredFields = ['startDate', 'endDate', 'developer', 'priority', 'description'];
      const missing = [];

      requiredFields.forEach(field => {
        const value = this[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          missing.push(field);
        }
      });

      if (missing.length > 0) {
        this.invalidFields = missing;
        // Mostrar notificación con campos faltantes
        const notification = document.createElement('slide-notification');
        notification.message = `Para cambiar el estado a ${newStatus}, rellena los campos: ${missing.join(', ')}`;
        notification.type = 'warning';
        document.body.appendChild(notification);

        // Revertir el cambio de estado
        e.target.value = previousStatus;
        return;
      } else {
        this.invalidFields = [];
      }
    } else if (!['Fixed', 'Verified', 'Closed'].includes(newStatus) && ['Fixed', 'Verified', 'Closed'].includes(previousStatus)) {
      // Limpiar campos inválidos cuando se sale de estados de finalización
      this.invalidFields = [];
    }

    this.status = newStatus;

    // Usar el sistema de notificaciones genérico de BaseCard
    this.handleStatusPriorityChange('status', newStatus, previousStatus);
  }

  /**
   * Maneja el cambio en el campo Priority.
   * @param {Event} e - Evento de cambio del select.
   */
  _handlePriorityChange(e) {
    const previousPriority = this.priority;
    const newPriority = e.target.value;

    this.priority = newPriority;

    // Usar el sistema de notificaciones genérico de BaseCard
    this.handleStatusPriorityChange('priority', newPriority, previousPriority);
  }

  /**
   * Maneja el cambio en el campo Bug Type.
   * @param {Event} e - Evento de cambio del select.
   */
  _handleBugTypeChange(e) {
    this.bugType = e.target.value;
    this.requestUpdate();
  }

  /**
   * Maneja el cambio en el campo Start Date.
   * @param {Event} e - Evento de cambio del input.
   */
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

  /**
   * Maneja el cambio en el campo Developer.
   * @param {Event} e - Evento de cambio del select.
   */
  _handleDeveloperChange(e) {
    const previousDeveloper = this.developer;
    const newDeveloper = e.target.value;

    const normalizedInfo = normalizeDeveloperEntry(newDeveloper);
    const canonicalValue = normalizedInfo.isUnassigned
      ? ''
      : (normalizedInfo.email || normalizedInfo.sourceEmail || newDeveloper);

    this.developer = canonicalValue;

    // Auto-rellenar startDate cuando se asigna un developer por primera vez
    if (canonicalValue && !previousDeveloper && !this.startDate) {
      this.startDate = generateTimestamp(new Date(), 'start');
    }

    // Usar el sistema de notificaciones genérico de BaseCard
    this.handleUserFieldChange('developer', canonicalValue, previousDeveloper);
  }

  /**
   * @deprecated Use generateTimestamp() from timestamp-utils.js instead
   * Returns today's date formatted as YYYY-MM-DD
   * @returns {string}
   */
  _getTodayFormatted() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Maneja el cambio en el campo Co-Developer.
   * @param {Event} e - Evento de cambio del select.
   */
  _handleCoDeveloperChange(e) {
    const previousCoDeveloper = this.coDeveloper;
    const newCoDeveloper = e.target.value;

    const normalizedInfo = normalizeDeveloperEntry(newCoDeveloper);
    const canonicalValue = normalizedInfo.isUnassigned
      ? ''
      : (normalizedInfo.email || normalizedInfo.sourceEmail || newCoDeveloper);

    this.coDeveloper = canonicalValue;

    // Save the field change
    this.handleUserFieldChange('coDeveloper', canonicalValue, previousCoDeveloper);
  }

  /**
   * Maneja el cambio en el campo Repository Label.
   * @param {Event} e - Evento de cambio del select.
   */
  _handleRepositoryLabelChange(e) {
    const newLabel = e.target.value;
this.repositoryLabel = newLabel;
    this.requestUpdate();
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
   * Maneja el evento de guardado exitoso de la card
   * @param {CustomEvent} e - Evento de card guardada
   * @deprecated - Ahora usa el sistema de notificaciones genérico de BaseCard
   */
  _handleCardSaved(e) {
    // NOTA: Este método ahora es manejado por el sistema genérico de BaseCard
    // Las notificaciones se procesan automáticamente en BaseCard._handleGenericCardSaved
}

  /**
   * Guarda el bug en Firebase (método auxiliar - no usar para guardado manual)
   */
  async _saveBug() {
    try {
      // Importar FirebaseService
      const { FirebaseService } = await import('../services/firebase-service.js');

      // Crear objeto con los datos del bug
      const bugData = {
        id: this.id,
        cardId: this.cardId,
        title: this.title || '',
        description: this.description || '',
        notes: this.notes || '',
        acceptanceCriteria: this.acceptanceCriteria || '',
        status: this.status || 'Created',
        priority: this.priority || '',
        developer: this.developer || '',
        bugType: this.bugType || 'default',
        registerDate: this.registerDate || new Date().toISOString(),
        startDate: this.startDate || '',
        endDate: this.endDate || '',
        createdBy: this.createdBy || this.userEmail,
        attachment: this.attachment || '',
        projectId: this.projectId,
        group: this.group || 'bugs',
        // Campos específicos para bugs tipo c4d
        plugin: this.plugin || '',
        pluginVersion: this.pluginVersion || '',
        treatmentType: this.treatmentType || '',
        cinemaFile: this.cinemaFile || '',
        exportedFile: this.exportedFile || '',
        importedFile: this.importedFile || ''
      };

      // Guardar usando FirebaseService
      await FirebaseService.saveCard(bugData);

      // Marcar como guardado

      // NUEVO: Emitir evento local para cerrar modales
this.dispatchEvent(new CustomEvent('card-save-success', {
        detail: { cardId: this.id || this.cardId },
        bubbles: true,
        composed: true
      }));
} catch (error) {
throw error;
    }
  }

  /**
   * Envía notificación cuando se asigna un developer al bug
   * @deprecated - Ahora manejado por BaseCard sistema genérico de notificaciones
   */
  async _notifyDeveloperAssignment(newDeveloperEmail, previousDeveloperEmail) {
// Este método ya no es necesario - BaseCard maneja las notificaciones
  }

  /**
   * Envía notificación cuando se desasigna un developer del bug
   * @deprecated - Ahora manejado por BaseCard sistema genérico de notificaciones
   */
  async _notifyDeveloperUnassignment(previousDeveloperEmail) {
// Este método ya no es necesario - BaseCard maneja las notificaciones
  }

  /**
   * Maneja el cambio en el campo Description.
   * @param {Event} e - Evento de cambio del textarea.
   */

  /**
   * Maneja el evento de subida de archivo
   * @param {CustomEvent} e - Evento con detalles del archivo subido
   * @param {string} fileType - Tipo de archivo ('cinemaFile', 'exportedFile', 'importedFile')
   */
  _handleFileUploaded(e, fileType) {
this[fileType] = e.detail.url;
    this.requestUpdate();
  }

  /**
   * Maneja el evento de eliminación de archivo
   * @param {string} fileType - Tipo de archivo que se eliminó
   */
  _handleFileDeleted(fileType) {
this[fileType] = '';
    this.requestUpdate();
  }

  /**
   * Maneja el evento de subida de adjunto genérico
   * @param {CustomEvent} e - Evento con detalles del archivo subido
   */
  _handleAttachmentUploaded(e) {
this.attachment = e.detail.url;

    const notification = document.createElement('slide-notification');
    notification.message = 'Archivo adjunto subido con éxito';
    notification.type = 'success';
    document.body.appendChild(notification);

    this.requestUpdate();
  }

  /**
   * Maneja el evento de eliminación de adjunto genérico
   */
  _handleAttachmentDeleted() {
this.attachment = '';

    const notification = document.createElement('slide-notification');
    notification.message = 'Archivo adjunto eliminado con éxito';
    notification.type = 'success';
    document.body.appendChild(notification);

    this.requestUpdate();
  }

  /**
   * Verifica si un campo es inválido
   * @param {string} fieldName - Nombre del campo
   * @returns {boolean} - True si el campo es inválido
   */
  _isFieldInvalid(fieldName) {
    return this.invalidFields?.includes(fieldName);
  }

  /**
   * Obtiene las clases CSS para un campo, incluyendo la clase de campo inválido si aplica
   * @param {string} fieldName - Nombre del campo
   * @param {string} baseClass - Clase base del campo
   * @returns {string} - Clases CSS combinadas
   */
  _getFieldClass(fieldName, baseClass = '') {
    const invalidClass = this._isFieldInvalid(fieldName) ? 'invalid-field' : '';
    return baseClass ? `${baseClass} ${invalidClass}`.trim() : invalidClass;
  }

  /**
   * Copia la URL del bug al portapapeles y muestra una notificación.
   */
  _copyBugUrl() {
    const baseUrl = `${window.location.origin}/cleanview/?projectId=${encodeURIComponent(this.projectId)}&cardId=${this.cardId}`;
    navigator.clipboard.writeText(baseUrl).then(() => {
      const notification = document.createElement('slide-notification');
      notification.message = 'Enlace del bug copiado al portapapeles';
      notification.type = 'success';
      document.body.appendChild(notification);
    }).catch(() => {
      const notification = document.createElement('slide-notification');
      notification.message = 'No se pudo copiar el enlace';
      notification.type = 'error';
      document.body.appendChild(notification);
    });
  }

  /**
   * Override: Campos editables específicos de BugCard
   * @returns {Object} Estado actual de campos editables
   */
  _getEditableState() {
    return {
      ...super._getEditableState(),
      developer: this.developer || '',
      registerDate: this.registerDate || '',
      acceptanceCriteria: this.acceptanceCriteria || '',
      bugType: this.bugType || '',
      attachment: this.attachment || '',
      cinemaFile: this.cinemaFile || '',
      exportedFile: this.exportedFile || '',
      importedFile: this.importedFile || '',
      plugin: this.plugin || '',
      pluginVersion: this.pluginVersion || '',
      treatmentType: this.treatmentType || '',
      startDate: this.startDate || '',
      endDate: this.endDate || '',
      acceptanceCriteriaStructured: JSON.stringify(this.acceptanceCriteriaStructured || [])
    };
  }

  // =====================================================
  // IA Features - Save with Analysis Flow
  // =====================================================

  /**
   * Loads iaEnabled setting from project configuration
   */
  async _loadIaEnabled() {
    if (!this.projectId) {
      this.iaEnabled = false;
      return;
    }

    try {
      const projectSnap = await get(ref(database, `/projects/${this.projectId}`));
      this.iaEnabled = projectSnap.exists() && projectSnap.val().iaEnabled === true;
    } catch (error) {
      this.iaEnabled = false;
    }
  }

  /**
   * Improves description with IA analysis - shows clarification modal if needed
   * This is the optional description improvement flow (separate from save)
   */
  async _improveDescriptionWithIa() {
    if (!this.iaEnabled) {
      this._showNotification('IA no está habilitada para este proyecto', 'warning');
      return;
    }

    if (!this.description || this.description.trim().length < 10) {
      this._showNotification('Escribe una descripción más detallada primero', 'warning');
      return;
    }

    // Use the analysis flow without auto-save
    await this._analyzeDescription({ autoSave: false });
  }

  /**
   * Analyzes description with IA and handles clarification if needed
   * @param {Object} options - Options
   * @param {boolean} options.autoSave - Whether to auto-save after analysis (default: true)
   */
  async _analyzeDescription({ autoSave = true } = {}) {
    const loadingLayer = this._showAcceptanceLoading();
    loadingLayer.setAttribute('message', 'Analizando descripción del bug...');

    try {
      const callable = httpsCallable(functions, 'analyzeBugDescription');
      const payload = {
        projectId: this.projectId,
        bugId: this.firebaseId,
        bug: {
          title: this.title || '',
          description: this.description || '',
          notes: this.notes || ''
        },
        force: false,
        skipAnalysis: false
      };

      const result = await callable(payload);
      const response = result.data;

      this._hideAcceptanceLoading(loadingLayer);

      if (response.status === 'needs_clarification' && response.questions && response.questions.length > 0) {
        // Show clarification modal (with or without auto-save based on option)
        this._showClarificationModal(response.questions, { autoSave });
        return;
      }

      // Description is clear, apply acceptance criteria
      if (response.acceptanceCriteriaStructured) {
        this.acceptanceCriteriaStructured = response.acceptanceCriteriaStructured;
        this.acceptanceCriteria = response.acceptanceCriteria || this._buildAcceptanceText();
        this.requestUpdate();
      }

      if (autoSave) {
        this._proceedWithSave();
      } else {
        this._showNotification('Descripción analizada y criterios generados. Revisa y guarda cuando estés listo.', 'success');
      }
    } catch (error) {
      this._hideAcceptanceLoading(loadingLayer);

      if (autoSave) {
        // On error, offer to save without IA
        const reason = error?.message || 'Error desconocido';
        document.dispatchEvent(new CustomEvent('show-modal', {
          detail: {
            options: {
              title: 'Error al analizar con IA',
              message: `No se pudo analizar la descripción: ${reason}. ¿Deseas guardar sin análisis de IA?`,
              button1Text: 'Guardar sin IA',
              button2Text: 'Cancelar',
              button1css: 'background-color: #f59e0b; color: black;',
              button2css: 'background-color: #6b7280; color: white;',
              button1Action: () => {
                document.dispatchEvent(new CustomEvent('close-modal', { detail: { target: 'all' } }));
                setTimeout(() => this._proceedWithSave(), 50);
                return false;
              },
              button2Action: () => { }
            }
          }
        }));
      } else {
        this._showNotification(`Error al analizar: ${error?.message || 'Error desconocido'}`, 'error');
      }
    }
  }

  /**
   * Override _handleSave to generate acceptance criteria before saving (if missing)
   * Note: Description analysis is now optional via "Mejorar con IA" button
   */
  async _handleSave() {
    if (!this.canSave) {
      this._showNotification('No se puede guardar: datos inválidos o sin permisos', 'error');
      return;
    }

    // Demo mode: block saves
    if (demoModeService.isDemo()) {
      demoModeService.showFeatureDisabled('editing');
      return;
    }

    // If IA is not enabled, or already has acceptance criteria, save normally
    const hasAcceptanceCriteria = (this.acceptanceCriteria && this.acceptanceCriteria.trim().length > 0) ||
      (Array.isArray(this.acceptanceCriteriaStructured) && this.acceptanceCriteriaStructured.length > 0 &&
        this.acceptanceCriteriaStructured.some(s => s.given || s.when || s.then));

    if (!this.iaEnabled || hasAcceptanceCriteria) {
      this._proceedWithSave();
      return;
    }

    // Generate acceptance criteria directly (no description analysis, no clarification modal)
    const success = await this._generateAcceptanceCriteriaWithIa({ force: true });
    if (!success) {
      // If generation failed, ask user if they want to save without AC
      document.dispatchEvent(new CustomEvent('show-modal', {
        detail: {
          options: {
            title: 'Error al generar criterios',
            message: 'No se pudieron generar los criterios de aceptación. ¿Deseas guardar sin ellos?',
            button1Text: 'Guardar sin criterios',
            button2Text: 'Cancelar',
            button1css: 'background-color: #f59e0b; color: black;',
            button2css: 'background-color: #6b7280; color: white;',
            button1Action: () => {
              document.dispatchEvent(new CustomEvent('close-modal', { detail: { target: 'all' } }));
              setTimeout(() => this._proceedWithSave(), 50);
              return false;
            },
            button2Action: () => { }
          }
        }
      }));
      return;
    }

    this._proceedWithSave();
  }

  /**
   * Shows the clarification modal with questions
   * @param {Array} questions - Array of {question, placeholder} objects
   * @param {Object} options - Options
   * @param {boolean} options.autoSave - Whether to auto-save after clarification (default: true)
   */
  _showClarificationModal(questions, { autoSave = true } = {}) {
    const formContainer = document.createElement('div');
    formContainer.style.display = 'flex';
    formContainer.style.flexDirection = 'column';
    formContainer.style.gap = '1rem';
    formContainer.style.maxHeight = '60vh';
    formContainer.style.overflowY = 'auto';

    const intro = document.createElement('p');
    intro.textContent = 'La IA necesita más información para generar los criterios de aceptación. Por favor, responde las siguientes preguntas:';
    intro.style.marginBottom = '0.5rem';
    intro.style.color = '#6b7280';
    formContainer.appendChild(intro);

    const inputs = [];

    questions.forEach((q, idx) => {
      const questionDiv = document.createElement('div');
      questionDiv.style.marginBottom = '0.5rem';

      const label = document.createElement('label');
      label.textContent = q.question;
      label.style.fontWeight = '600';
      label.style.display = 'block';
      label.style.marginBottom = '0.25rem';
      label.style.color = '#1f2937';

      const textarea = document.createElement('textarea');
      textarea.style.width = '100%';
      textarea.style.minHeight = '60px';
      textarea.style.padding = '0.5rem';
      textarea.style.border = '1px solid #d1d5db';
      textarea.style.borderRadius = '4px';
      textarea.style.backgroundColor = '#fff';
      textarea.style.color = '#1f2937';
      textarea.placeholder = q.placeholder || '';
      textarea.dataset.question = q.question;

      questionDiv.appendChild(label);
      questionDiv.appendChild(textarea);
      formContainer.appendChild(questionDiv);
      inputs.push(textarea);
    });

    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Información adicional para el bug',
          message: '',
          contentElement: formContainer,
          maxWidth: '850px',
          button1Text: 'Continuar',
          button2Text: autoSave ? 'Guardar sin IA' : 'Cancelar',
          button1css: 'background-color: #6366f1; color: white;',
          button2css: 'background-color: #6b7280; color: white;',
          button1Action: () => this._handleClarificationResponse(inputs, { autoSave }),
          button2Action: autoSave
            ? () => {
              // Close modal first, then save with a small delay to avoid showing compact card inside modal
              document.dispatchEvent(new CustomEvent('close-modal', { detail: { target: 'all' } }));
              setTimeout(() => this._proceedWithSave(), 50);
              return false; // Prevent default modal close (we handle it manually)
            }
            : () => { } // Just close modal (no save)
        }
      }
    }));
  }

  /**
   * Handles the clarification response and re-analyzes
   * @param {Array} inputs - Array of textarea elements with responses
   * @param {Object} options - Options
   * @param {boolean} options.autoSave - Whether to auto-save after clarification (default: true)
   */
  async _handleClarificationResponse(inputs, { autoSave = true } = {}) {
    // Build additional info text
    const additionalInfo = inputs
      .filter(input => input.value.trim())
      .map(input => `**${input.dataset.question}**\n${input.value.trim()}`)
      .join('\n\n');

    if (additionalInfo) {
      // Append to description
      const separator = '\n\n---\n**Información adicional:**\n\n';
      this.description = (this.description || '') + separator + additionalInfo;
    }

    // Re-analyze with the updated description (force generation)
    const loadingLayer = this._showAcceptanceLoading();
    loadingLayer.setAttribute('message', 'Generando criterios de aceptación...');

    try {
      const callable = httpsCallable(functions, 'analyzeBugDescription');
      const payload = {
        projectId: this.projectId,
        bugId: this.firebaseId,
        bug: {
          title: this.title || '',
          description: this.description || '',
          notes: this.notes || ''
        },
        force: true, // Force generation after clarification
        skipAnalysis: true
      };

      const result = await callable(payload);
      const response = result.data;

      this._hideAcceptanceLoading(loadingLayer);

      if (response.acceptanceCriteriaStructured) {
        this.acceptanceCriteriaStructured = response.acceptanceCriteriaStructured;
        this.acceptanceCriteria = response.acceptanceCriteria || this._buildAcceptanceText();
        this.requestUpdate();
      }

      if (autoSave) {
        this._proceedWithSave();
      } else {
        this._showNotification('Descripción mejorada y criterios generados. Revisa y guarda cuando estés listo.', 'success');
      }
    } catch (error) {
      this._hideAcceptanceLoading(loadingLayer);
      if (autoSave) {
        this._showNotification('Error al generar criterios, guardando sin IA', 'warning');
        this._proceedWithSave();
      } else {
        this._showNotification(`Error al generar criterios: ${error?.message || 'Error desconocido'}`, 'error');
      }
    }
  }

  /**
   * Proceeds with the normal save flow (calls BaseCard._handleSave behavior)
   */
  _proceedWithSave() {
    // Sync acceptance criteria text from structured
    if (Array.isArray(this.acceptanceCriteriaStructured) && this.acceptanceCriteriaStructured.length > 0) {
      this.acceptanceCriteria = this._buildAcceptanceText();
    }

    // Close any open modals first to avoid showing collapsed card inside modal
    document.dispatchEvent(new CustomEvent('close-modal', { detail: { target: 'all' } }));

    // Activate saving state and overlay
    this.isSaving = true;
    this._showSavingOverlay();

    try {
      const cardProps = this.getWCProps();
      cardProps.expanded = false;

      this.dispatchEvent(new CustomEvent('save-card', {
        detail: { cardData: cardProps },
        bubbles: true,
        composed: true
      }));

      // Update original files after save
      this.originalFiles = {
        cinemaFile: this.cinemaFile || '',
        exportedFile: this.exportedFile || '',
        importedFile: this.importedFile || ''
      };

      // Delay collapse to allow modal to close first
      setTimeout(() => {
        this.expanded = false;
      }, 100);
    } catch (error) {
      console.error('[BugCard] _proceedWithSave error:', error);
      this._showNotification('Error saving card', 'error');
    } finally {
      this._hideSavingOverlay();
      this.isSaving = false;
    }
  }

  // =====================================================
  // IA Features - Acceptance Criteria Structured Methods
  // =====================================================

  /**
   * Returns the acceptance criteria structured list
   * @returns {Array} List of scenarios
   */
  _getAcceptanceCriteriaStructuredList() {
    const raw = this.acceptanceCriteriaStructured;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw;
    }
    // Try to hydrate from text if not already structured
    this._hydrateStructuredAcceptance();
    return Array.isArray(this.acceptanceCriteriaStructured) ? this.acceptanceCriteriaStructured : [];
  }

  /**
   * Hydrates structured acceptance criteria from text
   */
  _hydrateStructuredAcceptance() {
    if (Array.isArray(this.acceptanceCriteriaStructured) && this.acceptanceCriteriaStructured.length > 0) {
      return;
    }

    const text = (this.acceptanceCriteria || '').trim();
    if (!text) {
      this.acceptanceCriteriaStructured = [];
      return;
    }

    // Try to parse Gherkin format
    const scenarios = this._parseGherkinText(text);
    this.acceptanceCriteriaStructured = scenarios.length > 0 ? scenarios : [{ given: '', when: '', then: '', raw: text }];
  }

  /**
   * Parses Gherkin text into structured scenarios
   * @param {string} text - The text to parse
   * @returns {Array} List of scenarios
   */
  _parseGherkinText(text) {
    const scenarios = [];
    // Split by "Escenario" keyword
    const parts = text.split(/Escenario\s*\d*\s*:?\s*/i).filter(p => p.trim());

    if (parts.length === 0) {
      // Try single scenario parsing
      const single = this._parseSingleScenario(text);
      if (single.given || single.when || single.then) {
        scenarios.push(single);
      }
      return scenarios;
    }

    for (const part of parts) {
      const scenario = this._parseSingleScenario(part);
      if (scenario.given || scenario.when || scenario.then) {
        scenarios.push(scenario);
      }
    }
    return scenarios;
  }

  /**
   * Parses a single scenario block
   * @param {string} text - The scenario text
   * @returns {Object} Parsed scenario object
   */
  _parseSingleScenario(text) {
    const scenario = { given: '', when: '', then: '', raw: text };

    // Split by Gherkin keywords to avoid complex regex with backtracking
    const parts = text.split(/\b(?:Dado|Given|Cuando|When|Entonces|Then)\b/i);
    const keywords = text.match(/\b(?:Dado|Given|Cuando|When|Entonces|Then)\b/gi) || [];

    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i].toLowerCase();
      const value = (parts[i + 1] || '').trim();
      if (kw === 'dado' || kw === 'given') {
        scenario.given = value;
      } else if (kw === 'cuando' || kw === 'when') {
        scenario.when = value;
      } else if (kw === 'entonces' || kw === 'then') {
        scenario.then = value;
      }
    }

    return scenario;
  }

  /**
   * Builds acceptance criteria text from structured scenarios
   * @returns {string} Formatted acceptance criteria text
   */
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

  /**
   * Gets acceptance criteria structured for saving
   * @returns {Array} Clean array for Firebase
   */
  _getAcceptanceCriteriaStructuredForSave() {
    const list = this._getAcceptanceCriteriaStructuredList();
    return list.map(s => ({
      given: s.given || '',
      when: s.when || '',
      then: s.then || ''
    })).filter(s => s.given || s.when || s.then);
  }

  /**
   * Opens the scenario edit modal
   * @param {number|null} index - Scenario index to edit, or null for new
   */
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
        if (index !== null) {
          scenariosUpdated[index] = scenario;
        } else {
          scenariosUpdated.push(scenario);
        }
        this.acceptanceCriteriaStructured = scenariosUpdated;
        this.acceptanceCriteria = this._buildAcceptanceText();
        this.requestUpdate();
      }
    });
  }

  /**
   * Removes a scenario from the list
   * @param {number} index - Scenario index to remove
   */
  _removeScenario(index) {
    const scenarios = this._getAcceptanceCriteriaStructuredList();
    if (scenarios.length <= 1) {
      this.acceptanceCriteriaStructured = [{ given: '', when: '', then: '', raw: '' }];
      this.acceptanceCriteria = this._buildAcceptanceText();
      return;
    }
    const updated = [...scenarios];
    updated.splice(index, 1);
    this.acceptanceCriteriaStructured = updated;
    this.acceptanceCriteria = this._buildAcceptanceText();
  }

  /**
   * Shows the regenerate acceptance criteria confirmation modal
   */
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

  /**
   * Regenerates acceptance criteria using IA
   */
  async _regenerateAcceptanceCriteria() {
    const generated = await this._generateAcceptanceCriteriaWithIa({ force: true });
    if (generated) {
      this._showNotification('Acceptance Criteria regenerados con IA', 'success');
    }
  }

  /**
   * Generates acceptance criteria with IA
   * @param {Object} options - Options for generation
   * @returns {boolean} Success status
   */
  async _generateAcceptanceCriteriaWithIa({ force = false } = {}) {
    const loadingLayer = this._showAcceptanceLoading();

    try {
      if (!this.projectId) {
        this._hideAcceptanceLoading(loadingLayer);
        this._showNotification('Falta projectId para generar criterios', 'error');
        return false;
      }

      const callable = httpsCallable(functions, 'analyzeBugDescription');
      const payload = {
        projectId: this.projectId,
        bugId: this.firebaseId,
        bug: {
          title: this.title || '',
          description: this.description || '',
          notes: this.notes || ''
        },
        force: force,
        skipAnalysis: true // Skip description analysis, just generate AC
      };

      const result = await callable(payload);
      const responsePayload = result.data;

      this._hideAcceptanceLoading(loadingLayer);

      if (!responsePayload || responsePayload.status === 'error') {
        const errorMsg = responsePayload?.message || 'Error desconocido al generar criterios';
        this._showNotification(errorMsg, 'error');
        return false;
      }

      if (!Array.isArray(responsePayload.acceptanceCriteriaStructured)) {
        this._showNotification('La respuesta de IA no contiene escenarios válidos', 'warning');
        return false;
      }

      this.acceptanceCriteriaStructured = responsePayload.acceptanceCriteriaStructured;
      this.acceptanceCriteria = responsePayload.acceptanceCriteria || this._buildAcceptanceText();
      this.requestUpdate();
      return true;
    } catch (error) {
      this._hideAcceptanceLoading(loadingLayer);

      const reason = typeof error?.details === 'string'
        ? error.details
        : (error?.message || 'Error desconocido');
      this._showNotification(`No se pudo generar Acceptance Criteria con IA: ${reason}`, 'error');
      return false;
    }
  }

  /**
   * Shows loading layer for acceptance criteria generation
   * @returns {HTMLElement} The loading layer element
   */
  _showAcceptanceLoading() {
    const loading = document.createElement('loading-layer');
    loading.setAttribute('color', '#6366f1');
    loading.setAttribute('message', 'Generando Acceptance Criteria. Esta acción puede tardar más de un minuto');
    loading.setAttribute('size', '80');
    loading.setAttribute('stroke-width', '6');
    loading.setAttribute('visible', '');
    loading.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; z-index: 10001 !important;';
    document.body.appendChild(loading);
    return loading;
  }

  /**
   * Hides and removes loading layer
   * @param {HTMLElement} loadingLayer - The loading layer to remove
   */
  _hideAcceptanceLoading(loadingLayer) {
    if (loadingLayer?.parentNode) {
      loadingLayer.removeAttribute('visible');
      setTimeout(() => {
        loadingLayer.remove();
      }, 300);
    }
  }

  /**
   * Shows a notification using slide-notification
   * @param {string} message - Message to show
   * @param {string} type - Notification type (success, error, warning, info)
   */
  _showNotification(message, type = 'info') {
    const notification = document.createElement('slide-notification');
    notification.message = message;
    notification.type = type;
    document.body.appendChild(notification);
  }

  /**
   * Checks if bug is not done (can use IA link)
   * @returns {boolean} True if bug is not in done status
   */
  _isNotDone() {
    const doneStatuses = ['closed', 'done', 'completed', 'resolved', 'fixed', 'verified'];
    return !doneStatuses.includes((this.status || '').toLowerCase());
  }

  // =====================================================
  // IA Link Generation Methods
  // =====================================================

  /**
   * Generates a temporary IA link for this bug
   */
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
      const expiresAt = now + 15 * 60 * 1000; // 15 minutes
      const createdBy = (this.userEmail || auth?.currentUser?.email || '').trim();

      const linkData = {
        token,
        projectId: this.projectId,
        bugId: firebaseId,
        firebaseId,
        cardId: this.cardId || '',
        cardType: 'bug',
        createdBy: createdBy || 'unknown',
        createdAt: now,
        expiresAt,
        used: false
      };

      await dbSet(ref(database, `/ia/links/${token}`), linkData);

      const url = this._buildIaLinkUrl(token);
      this._copyToClipboard(url);
      this._showNotification('Enlace IA generado y copiado (1 uso, 15 min)', 'success');
    } catch (error) {
      this._showNotification('No se pudo generar el enlace IA', 'error');
    }
  }

  /**
   * Builds the IA link URL
   * @param {string} token - The generated token
   * @returns {string} The full URL
   */
  _buildIaLinkUrl(token) {
    const region = 'europe-west1';
    const projectId = firebaseConfig?.projectId;
    if (!projectId) {
      console.error('firebaseConfig.projectId is not configured');
      return '';
    }
    return `https://${region}-${projectId}.cloudfunctions.net/getIaContext/${token}`;
  }

  /**
   * Generates a secure random token
   * @returns {string} The generated token
   */
  _generateSecureToken() {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('');
  }

  /**
   * Copies text to clipboard
   * @param {string} text - Text to copy
   */
  _copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }
}

customElements.define('bug-card', BugCard);

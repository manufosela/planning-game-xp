import { TableRenderer } from '../renderers/table-renderer.js';
import { userDirectoryService } from '../services/user-directory-service.js';
import { getUnifiedFilterService } from '../services/unified-filter-service.js';
import { AppEventBus, AppEvents } from '../services/app-event-bus.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { TASK_SCHEMA, BUG_SCHEMA, PROPOSAL_SCHEMA } from '../schemas/card-field-schemas.js';

/**
 * Gestor de vista tipo tabla con reactividad en tiempo real
 * Sustituye la lógica de carga única por subscripciones Firebase
 */
export class TableViewManager {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
    this.tableRenderer = new TableRenderer();
    this.unsubscribe = null;
    this.currentContainer = null;
    this.currentConfig = null;
    this.currentSection = null;
    this.filters = {};
    this.cardsCache = {};
    this.previousYearProposals = [];
    this.previousYearBugs = [];
    this.previousYearTasks = [];
    this.searchQuery = ''; // Search query for cardId/title search

    // Initialize unified filter service
    this.unifiedFilterService = getUnifiedFilterService();

    // Listen for search query changes from CardSearch component
    document.addEventListener('search-query-changed', (event) => {
      const { query, section } = event.detail || {};
      // Only apply if it's for our current section
      if (this.currentSection === section || !section) {
        this.searchQuery = (query || '').trim().toLowerCase();
        this.renderCurrentView();
      }
    });

    // Listen for unified filter changes to re-render
    window.addEventListener('unified-filters-changed', (event) => {
      const { projectId, cardType } = event.detail;
      // Only re-render if the change is for our current project/section
      if (this._isCurrentProjectAndSection(projectId, cardType)) {
        this.renderCurrentView();
      }
    });

    // Listen for legacy filter changes (from task-filters, bug-filters components)
    // and sync them with the unified filter service
    document.addEventListener('filters-changed', (event) => {
      const { filterId, selectedValues } = event.detail || {};
      if (filterId && this.currentConfig?.projectId) {
        const cardType = this._getCardTypeFromSection();
        if (cardType) {
          this.unifiedFilterService.setFilter(
            this.currentConfig.projectId,
            cardType,
            filterId,
            selectedValues || []
          );
        }
      }
    });

    // Listen for legacy filter clear events
    document.addEventListener('filters-cleared', () => {
      if (this.currentConfig?.projectId) {
        const cardType = this._getCardTypeFromSection();
        if (cardType) {
          this.unifiedFilterService.clearAllFilters(
            this.currentConfig.projectId,
            cardType
          );
        }
      }
    });

    // Listen for year changes to re-render the table
    document.addEventListener('year-changed', () => {
      if (this.currentContainer && this.currentConfig && Object.keys(this.cardsCache).length > 0) {
        // Clear sprint filter when year changes (sprints are year-specific)
        // The unified filter service handles this automatically via _handleYearChange
        if (this.filters.sprint) {
          delete this.filters.sprint;
          this.tableRenderer.clearFilters();
        }

        this.renderCurrentView();

        // Re-check for previous year proposals when year changes
        if (this.currentSection === 'proposals') {
          this.checkPreviousYearProposals(this.cardsCache);
        }
        // Re-check for previous year bugs when year changes
        if (this.currentSection === 'bugs') {
          this.checkPreviousYearBugs(this.cardsCache);
        }
        // Re-check for previous year tasks when year changes
        if (this.currentSection === 'tasks') {
          this.checkPreviousYearTasks(this.cardsCache);
        }
      }
    });

    // Setup import button listeners
    this._setupImportProposalsButton();
    this._setupImportBugsButton();
    this._setupImportTasksButton();
  }

  /**
   * Setup the import proposals button event listener
   */
  _setupImportProposalsButton() {
    const setupButton = () => {
      const importBtn = document.getElementById('importProposalsBtn');
      if (importBtn && !importBtn.dataset.listenerAdded) {
        importBtn.dataset.listenerAdded = 'true';
        importBtn.addEventListener('click', () => this.importPreviousYearProposals());
      }
    };

    document.addEventListener('astro:page-load', setupButton);
    setupButton();
  }

  /**
   * Check for proposals from previous year and offer to import them
   * @param {Object} allCards - All cards from Firebase (unfiltered by year)
   */
  checkPreviousYearProposals(allCards) {
    const selectedYear = this._getSelectedYear();
    const currentCalendarYear = new Date().getFullYear();
    const previousCalendarYear = currentCalendarYear - 1;

    // Only show import option when viewing current year or previous year
    const canShowMigration = selectedYear === currentCalendarYear || selectedYear === previousCalendarYear;

    if (!canShowMigration) {
      const importBtn = document.getElementById('importProposalsBtn');
      if (importBtn) importBtn.style.display = 'none';
      this.previousYearProposals = [];
      return;
    }

    // Find proposals from PREVIOUS CALENDAR YEAR that are NOT in completed statuses
    const seenCardIds = new Set();
    const completedStatuses = APP_CONSTANTS.PROPOSAL_COMPLETED_STATUSES || ['approved', 'rejected', 'converted'];
    this.previousYearProposals = Object.entries(allCards).filter(([id, card]) => {
      const isPreviousYear = card.year && Number(card.year) === previousCalendarYear;
      const hasValidFirebaseId = id && id.startsWith('-');
      const isUnique = card.cardId && !seenCardIds.has(card.cardId);
      const statusLower = (card.status || '').toLowerCase();
      const isNotCompleted = !completedStatuses.includes(statusLower);
      if (isUnique) seenCardIds.add(card.cardId);
      return isPreviousYear && hasValidFirebaseId && isUnique && isNotCompleted;
    }).map(([id, card]) => ({ id, ...card }));

    // Update button visibility and reset state
    const importBtn = document.getElementById('importProposalsBtn');

    if (importBtn && this.previousYearProposals.length > 0) {
      // Reset button state and show with correct content
      importBtn.disabled = false;
      importBtn.innerHTML = `Importar de <span id="importProposalsYear">${previousCalendarYear}</span> (<span id="importProposalsCount">${this.previousYearProposals.length}</span>)`;
      importBtn.style.display = 'inline-block';
    } else if (importBtn) {
      importBtn.style.display = 'none';
    }
  }

  /**
   * Import proposals from previous year to current year
   */
  importPreviousYearProposals() {
    if (!this.previousYearProposals.length || !this.currentConfig?.projectId) {
      return;
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const count = this.previousYearProposals.length;

    // Show confirmation modal
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Importar propuestas',
          message: `¿Importar <b>${count} propuesta${count > 1 ? 's' : ''}</b> de ${previousYear} al año ${currentYear}?`,
          button1Text: 'Importar',
          button2Text: 'Cancelar',
          button1css: 'background-color: var(--brand-secondary);',
          button2css: 'background-color: #999;',
          button1Action: () => this._executeProposalsMove(currentYear, count),
          button2Action: () => { },
          maxWidth: '450px'
        }
      }
    }));
  }

  /**
   * Execute the proposals move after confirmation
   */
  async _executeProposalsMove(nextYear, count) {
    try {
      const importBtn = document.getElementById('importProposalsBtn');
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = 'Moviendo...';
      }

      const projectId = this.currentConfig?.projectId;
      if (!projectId) {
        throw new Error('No projectId available');
      }

      let movedCount = 0;
      for (const proposal of this.previousYearProposals) {
        const firebaseId = proposal.id;
        try {
          await this.firebaseService.updateCard(
            projectId,
            'proposals',
            firebaseId,
            { year: nextYear }
          );
          movedCount++;
        } catch (err) {
          console.error(`Error moving proposal ${proposal.cardId}:`, err);
        }
      }

      this._showNotification(
        `${movedCount} propuesta${movedCount > 1 ? 's' : ''} movida${movedCount > 1 ? 's' : ''} al ${nextYear}`,
        'success'
      );

      // Hide button after success
      if (importBtn) {
        importBtn.style.display = 'none';
      }
      this.previousYearProposals = [];
    } catch (error) {
      console.error('Error moving proposals:', error);
      this._showNotification('Error al mover propuestas', 'error');

      const importBtn = document.getElementById('importProposalsBtn');
      if (importBtn) {
        importBtn.disabled = false;
        const previousYear = new Date().getFullYear() - 1;
        importBtn.innerHTML = `Importar de <span id="importProposalsYear">${previousYear}</span> (<span id="importProposalsCount">${count}</span>)`;
      }
    }
  }

  /**
   * Show a notification to the user
   */
  _showNotification(message, type = 'info') {
    const notification = document.createElement('slide-notification');
    notification.message = message;
    notification.type = type;
    document.body.appendChild(notification);
  }

  /**
   * Setup the import bugs button event listener
   */
  _setupImportBugsButton() {
    const setupButton = () => {
      const importBtn = document.getElementById('importBugsBtn');
      if (importBtn && !importBtn.dataset.listenerAdded) {
        importBtn.dataset.listenerAdded = 'true';
        importBtn.addEventListener('click', () => this.importPreviousYearBugs());
      }
    };

    document.addEventListener('astro:page-load', setupButton);
    setupButton();
  }

  /**
   * Check for bugs from previous year (excluding Fixed) and offer to import them
   * @param {Object} allCards - All cards from Firebase (unfiltered by year)
   */
  checkPreviousYearBugs(allCards) {
    const selectedYear = this._getSelectedYear();
    const currentCalendarYear = new Date().getFullYear();
    const previousCalendarYear = currentCalendarYear - 1;

    // Only show import option when viewing current year or previous year
    const canShowMigration = selectedYear === currentCalendarYear || selectedYear === previousCalendarYear;

    if (!canShowMigration) {
      const importBtn = document.getElementById('importBugsBtn');
      if (importBtn) importBtn.style.display = 'none';
      this.previousYearBugs = [];
      return;
    }

    // Find bugs from PREVIOUS CALENDAR YEAR that are NOT in completed statuses
    const seenCardIds = new Set();
    const completedStatuses = APP_CONSTANTS.BUG_COMPLETED_STATUSES || ['fixed', 'verified', 'closed'];
    this.previousYearBugs = Object.entries(allCards).filter(([id, card]) => {
      const isPreviousYear = card.year && Number(card.year) === previousCalendarYear;
      const hasValidFirebaseId = id && id.startsWith('-');
      const isUnique = card.cardId && !seenCardIds.has(card.cardId);
      const statusLower = (card.status || '').toLowerCase();
      const isNotCompleted = !completedStatuses.includes(statusLower);
      if (isUnique) seenCardIds.add(card.cardId);
      return isPreviousYear && hasValidFirebaseId && isUnique && isNotCompleted;
    }).map(([id, card]) => ({ id, ...card }));

    // Update button visibility and reset state
    const importBtn = document.getElementById('importBugsBtn');

    if (importBtn && this.previousYearBugs.length > 0) {
      // Reset button state and show with correct content
      importBtn.disabled = false;
      importBtn.innerHTML = `Importar de <span id="importBugsYear">${previousCalendarYear}</span> (<span id="importBugsCount">${this.previousYearBugs.length}</span>)`;
      importBtn.style.display = 'inline-block';
    } else if (importBtn) {
      importBtn.style.display = 'none';
    }
  }

  /**
   * Import bugs from previous year to current year
   */
  importPreviousYearBugs() {
    if (!this.previousYearBugs.length || !this.currentConfig?.projectId) {
      return;
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const count = this.previousYearBugs.length;

    // Show confirmation modal
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Importar bugs',
          message: `¿Importar <b>${count} bug${count > 1 ? 's' : ''}</b> abierto${count > 1 ? 's' : ''} de ${previousYear} al año ${currentYear}?`,
          button1Text: 'Importar',
          button2Text: 'Cancelar',
          button1css: 'background-color: var(--brand-secondary);',
          button2css: 'background-color: #999;',
          button1Action: () => this._executeBugsMove(currentYear, count),
          button2Action: () => { },
          maxWidth: '450px'
        }
      }
    }));
  }

  /**
   * Execute the bugs move after confirmation
   */
  async _executeBugsMove(nextYear, count) {
    try {
      const importBtn = document.getElementById('importBugsBtn');
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = 'Moviendo...';
      }

      const projectId = this.currentConfig?.projectId;
      if (!projectId) {
        throw new Error('No projectId available');
      }

      let movedCount = 0;
      for (const bug of this.previousYearBugs) {
        const firebaseId = bug.id;
        try {
          await this.firebaseService.updateCard(
            projectId,
            'bugs',
            firebaseId,
            { year: nextYear }
          );
          movedCount++;
        } catch (err) {
          console.error(`Error moving bug ${bug.cardId}:`, err);
        }
      }

      this._showNotification(
        `${movedCount} bug${movedCount > 1 ? 's' : ''} movido${movedCount > 1 ? 's' : ''} al ${nextYear}`,
        'success'
      );

      // Hide button after success
      if (importBtn) {
        importBtn.style.display = 'none';
      }
      this.previousYearBugs = [];
    } catch (error) {
      console.error('Error moving bugs:', error);
      this._showNotification('Error al mover bugs', 'error');

      const importBtn = document.getElementById('importBugsBtn');
      if (importBtn) {
        importBtn.disabled = false;
        const previousYear = new Date().getFullYear() - 1;
        importBtn.innerHTML = `Importar de <span id="importBugsYear">${previousYear}</span> (<span id="importBugsCount">${count}</span>)`;
      }
    }
  }

  /**
   * Setup the import tasks button event listener
   */
  _setupImportTasksButton() {
    const setupButton = () => {
      const importBtn = document.getElementById('importTasksBtn');
      if (importBtn && !importBtn.dataset.listenerAdded) {
        importBtn.dataset.listenerAdded = 'true';
        importBtn.addEventListener('click', () => this.importPreviousYearTasks());
      }
    };

    document.addEventListener('astro:page-load', setupButton);
    setupButton();
  }

  /**
   * Check for tasks from previous year (excluding Done) and offer to import them
   * Only includes tasks where:
   * - Status is NOT Done
   * - Epic has no endDate OR epic's endDate is in the future
   * @param {Object} allCards - All cards from Firebase (unfiltered by year)
   */
  checkPreviousYearTasks(allCards) {
    const selectedYear = this._getSelectedYear();
    const currentCalendarYear = new Date().getFullYear();
    const previousCalendarYear = currentCalendarYear - 1;

    // Only show import option when viewing current year or previous year
    const canShowMigration = selectedYear === currentCalendarYear || selectedYear === previousCalendarYear;

    if (!canShowMigration) {
      const importBtn = document.getElementById('importTasksBtn');
      if (importBtn) importBtn.style.display = 'none';
      this.previousYearTasks = [];
      return;
    }

    // Find tasks from PREVIOUS CALENDAR YEAR that are NOT in completed statuses
    const seenCardIds = new Set();
    const completedStatuses = APP_CONSTANTS.TASK_COMPLETED_STATUSES || ['done', 'done&validated'];
    this.previousYearTasks = Object.entries(allCards).filter(([id, card]) => {
      const isPreviousYear = card.year && Number(card.year) === previousCalendarYear;
      const hasValidFirebaseId = id && id.startsWith('-');
      const isUnique = card.cardId && !seenCardIds.has(card.cardId);
      const statusLower = (card.status || '').toLowerCase();
      const isNotCompleted = !completedStatuses.includes(statusLower);
      if (isUnique) seenCardIds.add(card.cardId);
      return isPreviousYear && hasValidFirebaseId && isUnique && isNotCompleted;
    }).map(([id, card]) => ({ id, ...card }));

    // Update button visibility and reset state
    const importBtn = document.getElementById('importTasksBtn');

    if (importBtn && this.previousYearTasks.length > 0) {
      // Reset button state and show with correct content
      importBtn.disabled = false;
      importBtn.innerHTML = `Importar de <span id="importTasksYear">${previousCalendarYear}</span> (<span id="importTasksCount">${this.previousYearTasks.length}</span>)`;
      importBtn.style.display = 'inline-block';
    } else if (importBtn) {
      importBtn.style.display = 'none';
    }
  }

  /**
   * Import tasks from previous year to current year
   */
  importPreviousYearTasks() {
    if (!this.previousYearTasks.length || !this.currentConfig?.projectId) {
      return;
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const count = this.previousYearTasks.length;
    const tasksWithSprint = this.previousYearTasks.filter(t => t.sprint && t.sprint !== 'backlog' && t.sprint !== '').length;

    let message = `¿Importar <b>${count} tarea${count > 1 ? 's' : ''}</b> no completada${count > 1 ? 's' : ''} de ${previousYear} al año ${currentYear}?`;
    if (tasksWithSprint > 0) {
      message += `<br><br><small>⚠️ ${tasksWithSprint} tarea${tasksWithSprint > 1 ? 's tienen' : ' tiene'} sprint asignado que será quitado.</small>`;
    }

    // Show confirmation modal
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Importar tareas',
          message: message,
          button1Text: 'Importar',
          button2Text: 'Cancelar',
          button1css: 'background-color: var(--brand-secondary);',
          button2css: 'background-color: #999;',
          button1Action: () => this._executeTasksMove(currentYear, count),
          button2Action: () => { },
          maxWidth: '450px'
        }
      }
    }));
  }

  /**
   * Execute the tasks move after confirmation
   */
  async _executeTasksMove(nextYear, count) {
    try {
      const importBtn = document.getElementById('importTasksBtn');
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = 'Moviendo...';
      }

      const projectId = this.currentConfig?.projectId;
      if (!projectId) {
        throw new Error('No projectId available');
      }

      let movedCount = 0;
      for (const task of this.previousYearTasks) {
        const firebaseId = task.id;
        try {
          // Update year and clear sprint
          const updateData = { year: nextYear };
          if (task.sprint && task.sprint !== 'backlog' && task.sprint !== '') {
            updateData.sprint = '';
          }
          await this.firebaseService.updateCard(
            projectId,
            'tasks',
            firebaseId,
            updateData
          );
          movedCount++;
        } catch (err) {
          console.error(`Error moving task ${task.cardId}:`, err);
        }
      }

      this._showNotification(
        `${movedCount} tarea${movedCount > 1 ? 's' : ''} movida${movedCount > 1 ? 's' : ''} al ${nextYear}`,
        'success'
      );

      // Hide button after success
      if (importBtn) {
        importBtn.style.display = 'none';
      }
      this.previousYearTasks = [];
    } catch (error) {
      console.error('Error moving tasks:', error);
      this._showNotification('Error al mover tareas', 'error');

      const importBtn = document.getElementById('importTasksBtn');
      if (importBtn) {
        importBtn.disabled = false;
        const previousYear = new Date().getFullYear() - 1;
        importBtn.innerHTML = `Importar de <span id="importTasksYear">${previousYear}</span> (<span id="importTasksCount">${count}</span>)`;
      }
    }
  }

  /**
   * Renderiza la vista tabla para tareas con reactividad
   */
  renderTasksTableView(container, config) {
    this.setupTableView(container, config, 'tasks');
  }

  /**
   * Renderiza la vista tabla para bugs con reactividad
   */
  renderBugsTableView(container, config) {
    this.setupTableView(container, config, 'bugs');
  }

  /**
   * Renderiza la vista tabla para proposals con reactividad
   */
  renderProposalsTableView(container, config) {
    this.setupTableView(container, config, 'proposals');
  }

  /**
   * Get the path for optimized views
   * @param {string} section - Section name (tasks, bugs, proposals)
   * @param {string} projectId - Project ID
   * @returns {string|null} View path or null if section not supported
   */
  _getViewPath(section, projectId) {
    if (!projectId) return null;
    if (section === 'tasks') {
      return `/views/task-list/${projectId}`;
    } else if (section === 'bugs') {
      return `/views/bug-list/${projectId}`;
    } else if (section === 'proposals') {
      return `/views/proposal-list/${projectId}`;
    }
    return null;
  }

  /**
   * Get the path for full card data (fallback)
   * @param {string} section - Section name (tasks, bugs, proposals)
   * @param {string} projectId - Project ID
   * @returns {string|null} Cards path or null if section not supported
   */
  _getCardsPath(section, projectId) {
    if (!projectId) return null;
    if (section === 'tasks') {
      return `/cards/${projectId}/TASKS_${projectId}`;
    } else if (section === 'bugs') {
      return `/cards/${projectId}/BUGS_${projectId}`;
    } else if (section === 'proposals') {
      return `/cards/${projectId}/PROPOSALS_${projectId}`;
    }
    return null;
  }

  /**
   * Extract view fields from full card data (for fallback mode)
   * @param {Object} fullCard - Full card data from /cards
   * @param {string} section - Section name
   * @returns {Object} Card with only view-relevant fields
   */
  _extractViewFields(fullCard, section) {
    const schemaMap = {
      tasks: TASK_SCHEMA,
      bugs: BUG_SCHEMA,
      proposals: PROPOSAL_SCHEMA
    };
    const schema = schemaMap[section];
    if (!schema?.VIEW_FIELDS?.length) return fullCard;

    const result = {};
    for (const field of schema.VIEW_FIELDS) {
      if (fullCard[field] !== undefined) {
        result[field] = fullCard[field];
      }
    }

    // Computed fields for tasks
    // Only compute from source data if not already present (avoids overwriting
    // pre-computed values from /views with 0 when notes/implementationPlan are absent)
    if (section === 'tasks') {
      if (result.notesCount === undefined) {
        result.notesCount = Array.isArray(fullCard.notes)
          ? fullCard.notes.length
          : (fullCard.notes && typeof fullCard.notes === 'object' ? Object.keys(fullCard.notes).length : 0);
      }
      if (!result.relatedTasks) result.relatedTasks = undefined;
      if (result.planStatus === undefined && fullCard.implementationPlan?.planStatus) {
        result.planStatus = fullCard.implementationPlan.planStatus;
      }
    }

    return result;
  }

  /**
   * Configura la vista tabla con subscripción Firebase
   * Uses optimized /views paths with fallback to /cards if views don't exist
   */
  setupTableView(container, config, section) {
    // CRITICAL: Don't load anything if no projectId - prevents showing garbage data
    if (!config?.projectId) {
      console.warn('[TableViewManager] No projectId provided, skipping table setup');
      return;
    }

    this.cleanup();

    // Clear filters when switching sections to avoid applying task filters to proposals, etc.
    this.tableRenderer.clearFilters();

    this.currentContainer = container;
    this.currentConfig = config;
    this.currentSection = section;
    this.isLoading = true;
    this._usingFallback = false; // Track if we're using fallback mode

    // Mostrar skeleton inmediatamente mientras se cargan los datos
    this.tableRenderer.setLoading();
    this.tableRenderer.renderLoadingSkeleton(container);

    const viewPath = this._getViewPath(section, config.projectId);
    const cardsPath = this._getCardsPath(section, config.projectId);

    if (!viewPath || !cardsPath) {
      return;
    }

    // Asegurar que el directorio de usuarios esté cargado para mostrar nombres correctos
    userDirectoryService.load().catch(() => {
      // Si falla, continuar sin bloquear la vista
    });

    // Suscribirse a cambios en tiempo real (primero intentar vistas optimizadas)
    this.unsubscribe = this.firebaseService.subscribeToPath(viewPath, (snapshot) => {
      // If already using fallback, ignore view updates
      if (this._usingFallback) {
        return;
      }

      this.isLoading = false;
      this.tableRenderer.setLoaded();

      if (snapshot.exists()) {
        const data = snapshot.val();
        // Clean data from /views to ensure only expected fields are used
        // (handles stale extra fields like validatedAt that may exist in old data)
        const cleanedData = {};
        Object.entries(data).forEach(([firebaseId, card]) => {
          if (card && typeof card === 'object' && !card.deletedAt) {
            cleanedData[firebaseId] = this._extractViewFields({ ...card, firebaseId }, section);
          }
        });
        this.cardsCache = this.normalizeCards(cleanedData, section);
        this.renderCurrentView();
        this._checkPreviousYearCards(section);
      } else {
        // View doesn't exist - fallback to full /cards path
        this._setupFallbackSubscription(cardsPath, section);
      }
    });
  }

  /**
   * Setup fallback subscription to /cards when /views doesn't exist
   * @param {string} cardsPath - Path to full cards data
   * @param {string} section - Section name
   */
  _setupFallbackSubscription(cardsPath, section) {
    // Cleanup existing subscription
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this._usingFallback = true;

    // Subscribe to full cards data
    this.unsubscribe = this.firebaseService.subscribeToPath(cardsPath, (snapshot) => {
      this.isLoading = false;
      this.tableRenderer.setLoaded();

      if (snapshot.exists()) {
        const fullData = snapshot.val();
        // Extract only view-relevant fields to reduce memory usage
        const viewData = {};
        Object.entries(fullData).forEach(([firebaseId, card]) => {
          if (card && typeof card === 'object' && !card.deletedAt) {
            const extracted = this._extractViewFields({ ...card, firebaseId }, section);
            // Remove undefined values
            Object.keys(extracted).forEach(key => {
              if (extracted[key] === undefined) {
                delete extracted[key];
              }
            });
            viewData[firebaseId] = extracted;
          }
        });
        this.cardsCache = this.normalizeCards(viewData, section);
        this.renderCurrentView();
        this._checkPreviousYearCards(section);
      } else {
        this.cardsCache = {};
        this.renderCurrentView();
      }
    });
  }

  /**
   * Check for previous year cards based on section type
   * @param {string} section - Section name
   */
  _checkPreviousYearCards(section) {
    if (section === 'proposals') {
      this.checkPreviousYearProposals(this.cardsCache);
    } else if (section === 'bugs') {
      this.checkPreviousYearBugs(this.cardsCache);
    } else if (section === 'tasks') {
      this.checkPreviousYearTasks(this.cardsCache);
    }
  }

  /**
   * Get selected year from localStorage
   * @returns {number} The selected year
   */
  _getSelectedYear() {
    const savedYear = localStorage.getItem('selectedYear');
    return savedYear ? Number(savedYear) : new Date().getFullYear();
  }

  /**
   * Filter cards by selected year (uses explicit year field)
   * @param {Object} cards - Cards to filter
   * @returns {Object} Filtered cards
   */
  _filterByYear(cards) {
    if (!cards || Object.keys(cards).length === 0) {
      return cards;
    }

    const selectedYear = this._getSelectedYear();
    const filteredCards = {};

    Object.entries(cards).forEach(([id, cardData]) => {
      // Usar campo year explícito (tras migración todas las cards lo tienen)
      // Si no tiene year, mostrar la card (compatibilidad temporal)
      const cardYear = cardData.year;

      // Comparar como números para evitar problemas de tipos (string vs number)
      if (!cardYear || Number(cardYear) === selectedYear) {
        filteredCards[id] = cardData;
      }
    });
return filteredCards;
  }

  /**
   * Filter cards by search query (cardId or title)
   * @param {Object} cards - Cards to filter
   * @param {string} query - Search query (lowercase)
   * @returns {Object} Filtered cards matching the search
   */
  _filterBySearch(cards, query) {
    if (!cards || !query) {
      return cards;
    }

    const filteredCards = {};

    Object.entries(cards).forEach(([id, cardData]) => {
      const cardId = (cardData.cardId || id || '').toLowerCase();
      const title = (cardData.title || '').toLowerCase();

      if (cardId.includes(query) || title.includes(query)) {
        filteredCards[id] = cardData;
      }
    });

    return filteredCards;
  }

  /**
   * Renderiza la vista actual con los datos en cache
   * Uses the UnifiedFilterService to apply filters to DATA before rendering.
   * This eliminates the need for DOM-based filtering and prevents the flash issue.
   */
  renderCurrentView() {
    if (!this.currentContainer || !this.currentConfig || !this.currentSection) {
      return;
    }

    // First filter by year
    const yearFilteredCards = this._filterByYear(this.cardsCache);

    let filteredCards;

    // If search query is active, filter by cardId/title IGNORING other filters
    if (this.searchQuery) {
      filteredCards = this._filterBySearch(yearFilteredCards, this.searchQuery);
    } else {
      // Apply unified filters from the service (operates on DATA, not DOM)
      const cardType = this._getCardTypeFromSection();
      const projectId = this.currentConfig.projectId;

      if (cardType && projectId) {
        // Use unified filter service for tasks and bugs
        filteredCards = this.unifiedFilterService.applyFilters(yearFilteredCards, projectId, cardType);
      } else {
        // Fallback to legacy table renderer filters for other sections
        filteredCards = this.tableRenderer.applyFilters(yearFilteredCards);
      }
    }

    // Build render config, skip renderer filters if search is active
    const renderConfig = this.searchQuery
      ? { ...this.currentConfig, skipRendererFilters: true }
      : this.currentConfig;

    // Renderizar según la sección
    if (this.currentSection === 'tasks') {
      this.tableRenderer.renderTableView(this.currentContainer, filteredCards, renderConfig);
    } else if (this.currentSection === 'bugs') {
      this.tableRenderer.renderBugsTableView(this.currentContainer, filteredCards, renderConfig);
    } else if (this.currentSection === 'proposals') {
      this.tableRenderer.renderProposalsTableView(this.currentContainer, filteredCards, renderConfig);
    }

    // Actualizar contadores de filtros si existen
    this.updateFilterCounters(filteredCards);

    // Update the unified-filters component results count if present
    const uf = document.querySelector('unified-filters');
    console.warn('[DEBUG-FILTERS] renderCurrentView done', {
      section: this.currentSection,
      cacheSize: Object.keys(this.cardsCache || {}).length,
      yearFiltered: Object.keys(yearFilteredCards || {}).length,
      filtered: Object.keys(filteredCards || {}).length,
      unifiedFiltersInDOM: !!uf,
      hasSetResultsCount: !!uf?.setResultsCount
    });
    this._updateUnifiedFiltersCount(filteredCards);

    // Emit search results for CardSearch component
    if (this.searchQuery) {
      const totalCards = Object.keys(this._filterByYear(this.cardsCache)).length;
      const visibleCards = Object.keys(filteredCards).length;
      document.dispatchEvent(new CustomEvent('search-results-updated', {
        detail: {
          section: this.currentSection,
          visible: visibleCards,
          total: totalCards
        }
      }));
    }

    // Emit TABLE_RENDERED event for components waiting for render completion
    AppEventBus.emit(AppEvents.TABLE_RENDERED, {
      section: this.currentSection,
      cardCount: Object.keys(filteredCards).length,
      container: this.currentContainer
    });
  }

  /**
   * Get card type from current section for unified filter service
   * @returns {string|null}
   */
  _getCardTypeFromSection() {
    if (this.currentSection === 'tasks') {
      return 'task';
    }
    if (this.currentSection === 'bugs') {
      return 'bug';
    }
    // Proposals don't use unified filters yet
    return null;
  }

  /**
   * Check if a filter change event is for the current project and section
   * @param {string} projectId
   * @param {string} cardType
   * @returns {boolean}
   */
  _isCurrentProjectAndSection(projectId, cardType) {
    if (!this.currentConfig || !this.currentSection) {
      return false;
    }
    if (this.currentConfig.projectId !== projectId) {
      return false;
    }
    const currentCardType = this._getCardTypeFromSection();
    return currentCardType === cardType;
  }

  /**
   * Update the unified-filters component with the current results count
   * @param {Object} filteredCards
   */
  _updateUnifiedFiltersCount(filteredCards) {
    const unifiedFilters = document.querySelector('unified-filters');
    if (unifiedFilters?.setResultsCount) {
      const totalCards = Object.keys(this._filterByYear(this.cardsCache)).length;
      const visibleCards = Object.keys(filteredCards).length;
      unifiedFilters.setResultsCount(visibleCards, totalCards);
    }
  }

  /**
   * Actualiza los contadores de los filtros
   */
  updateFilterCounters(filteredCards) {
    const visibleCount = Object.keys(filteredCards).length;
    const totalCards = Object.keys(this._filterByYear(this.cardsCache)).length;

    // Buscar el componente de filtros correspondiente
    let filtersComponent = null;
    if (this.currentSection === 'tasks') {
      filtersComponent = document.querySelector('task-filters');
    } else if (this.currentSection === 'bugs') {
      filtersComponent = document.querySelector('bug-filters');
    }

    if (filtersComponent?.updateVisibleCount) {
      filtersComponent.updateVisibleCount(visibleCount, totalCards);
    }
  }

  /**
   * Aplica filtros a la vista
   */
  setFilters(filters) {
    this.filters = filters || {};
    this.tableRenderer.setFilters(this.filters);
    // Only render if section is configured - prevents premature renders
    // when setFilters is called before setupTableView
    if (this.currentSection) {
      this.renderCurrentView();
    }
  }

  /**
   * Limpia filtros
   */
  clearFilters() {
    this.filters = {};
    this.tableRenderer.setFilters({});
    // Only render if section is configured
    if (this.currentSection) {
      this.renderCurrentView();
    }
  }

  /**
   * Limpia listeners y referencias
   */
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.currentContainer = null;
    this.currentConfig = null;
    this.currentSection = null;
    this.cardsCache = {};
    this._usingFallback = false;
  }

  /**
   * Obtiene los datos en cache
   */
  getCachedCards() {
    return this.cardsCache;
  }

  /**
   * Normaliza los datos recibidos desde Firebase añadiendo IDs y eliminando duplicados por cardId
   * (especialmente relevante en bugs donde pueden existir entradas duplicadas del mismo bug).
   * @param {Object} rawData
   * @param {string} section
   * @returns {Object}
   */
  normalizeCards(rawData, section) {
    const normalized = {};
    const dedupMap = new Map(); // cardId -> firebaseId guardado
    const data = rawData || {};

    Object.entries(data).forEach(([firebaseId, card]) => {
      if (!card || typeof card !== 'object') {
        return;
      }

      const cardWithIds = {
        ...card,
        firebaseId,
        id: card.id || firebaseId
      };

      // Normalizar status y priority para bugs
      if (section === 'bugs') {
        if (!cardWithIds.status || cardWithIds.status.trim() === '') {
          cardWithIds.status = 'Created';
        }
        if (!cardWithIds.priority || cardWithIds.priority.trim() === '') {
          cardWithIds.priority = 'Not Evaluated';
        }
      }

      const dedupKey = cardWithIds.cardId || cardWithIds.id || firebaseId;
      const shouldDedup = section === 'bugs';

      if (shouldDedup) {
        const existingFirebaseId = dedupMap.get(dedupKey);

        if (existingFirebaseId) {
          const existingCard = normalized[existingFirebaseId];
          const existingScore = this.getCardCompletenessScore(existingCard);
          const newScore = this.getCardCompletenessScore(cardWithIds);
          const keepNew = newScore >= existingScore;
if (!keepNew) {
            return;
          }

          delete normalized[existingFirebaseId];
          dedupMap.set(dedupKey, firebaseId);
        } else {
          dedupMap.set(dedupKey, firebaseId);
        }
      }

      normalized[firebaseId] = cardWithIds;
    });

    return normalized;
  }

  /**
   * Calcula un score de completitud para priorizar qué duplicado conservar
   * @param {Object} card
   * @returns {number}
   */
  getCardCompletenessScore(card) {
    if (!card || typeof card !== 'object') return 0;
    const importantFields = [
      'title',
      'status',
      'priority',
      'developer',
      'createdBy',
      'registerDate',
      'startDate',
      'endDate',
      'description',
      'notes'
    ];

    return importantFields.reduce((score, field) => {
      const value = card[field];
      if (value === undefined || value === null) return score;
      if (typeof value === 'string' && value.trim() === '') return score;
      return score + 1;
    }, 0);
  }
}

// Cargar todos los Web Components primero
import '../wc/TaskCard.js';
import '../wc/BugCard.js';
import '../wc/SprintCard.js';
import '../wc/EpicCard.js';
import '../wc/ProposalCard.js';
import '../wc/QACard.js';
import '../wc/MenuNav.js';
import '../wc/SlideNotification.js';
import '../wc/PushNotification.js';
import '../wc/GanttChart.js';
import '../wc/SprintPointsChart.js';
import '../wc/FirebaseStorageUploader.js';
import '../wc/ProjectSelector.js';
import '../wc/AppManager.js';

// Cargar componentes de filtros
import '../wc/TaskFilters.js'; // El nuevo componente
import '@manufosela/multi-select'; // Componente npm

// Cargar librerías comunes (TUS ARCHIVOS EXISTENTES)
import '../core/app-initializer.js';
// import '/js/lib/eventHandlers.js'; // REEMPLAZADO POR SISTEMA UNIFICADO

// Importar servicios y controladores (NUEVOS DE LA REFACTORIZACIÓN)
import { FirebaseDataService } from '../services/firebase-service.js';
import { CardService } from '../services/card-service.js';
import { CardRenderer } from '../renderers/card-renderer.js';
import { ViewFactory } from '../factories/view-factory.js';
import { TabController } from './tab-controller.js';
import { ProjectController } from './project-controller.js';
import { CardFactory } from '../factories/card-factory.js';
import { URLUtils, URLStateManager } from '../utils/url-utils.js';
import { updateGlobalSprintList } from '../utils/common-functions.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
const cardTypes = APP_CONSTANTS.CARD_TYPES;
const projectCardElement = APP_CONSTANTS.PROJECT_CARD_ELEMENT;
import { FirebaseService } from '../services/firebase-service.js';
import { UnifiedEventSystem } from '../events/unified-event-system.js';
import { globalDataManager } from '../services/global-data-manager.js';
import { initCardRealtimeService } from '../services/card-realtime-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { AppEventBus, AppEvents } from '../services/app-event-bus.js';
import { database, auth, firebaseConfig, ref, set, get } from '../../firebase-config.js';
import { modalService } from '../services/modal-service.js';
import { demoModeService } from '../services/demo-mode-service.js';

export class AppController {
  constructor() {
    this.firebaseService = new FirebaseDataService();
    this.cardService = new CardService(this.firebaseService);
    this.cardRenderer = new CardRenderer(this.cardService);
    this.viewFactory = new ViewFactory(this.cardService, this.firebaseService, this.cardRenderer);
    this.tabController = new TabController();
    this.projectController = new ProjectController(this.firebaseService);

    // Inicializar sistema de eventos unificado
    this.eventSystem = new UnifiedEventSystem(this);

    // Inicializar GlobalDataManager
    this.globalDataManager = globalDataManager;

    // Inicializar servicio de reactividad de cards individuales
    this.cardRealtimeService = initCardRealtimeService(this.firebaseService);

    this.projectId = null;
    this.section = null;
    this.config = {};
    this.sectionsLoaded = {};
    this.sectionsNeedReload = {};
    this.hasAppAccess = Boolean(window.isAppAdmin);
    this.cardAutoOpened = false;
    this.bugFiltersSetup = false; // Flag to prevent triple BugFilters setup execution
    this.taskFiltersSetup = false; // Flag to prevent triple TaskFilters setup execution
    this.initialViewApplied = {
      tasks: false,
      bugs: false
    };

    // Year filter for sprints and epics
    this.selectedYear = this._getSelectedYearFromStorage();
    this.isPastYear = this.selectedYear < new Date().getFullYear();
    this.isYearReadOnly = false; // Will be computed based on year and user permissions

    this.handleAppAdminStatusChange = this.handleAppAdminStatusChange.bind(this);
    this.handleYearChanged = this.handleYearChanged.bind(this);
  }

  static async create() {
    const controller = new AppController();
    await controller.init();
    return controller;
  }

  async init() {
    this.projectId = URLUtils.getProjectIdFromUrl();
    this.section = URLUtils.getSectionFromUrl();

    await this.loadInitialData();
    await this.initializeProjectSelector();
    this.setupAppAccessListener();
    this.setupEventListeners();
    this.tabController.openInitialTab();

    // Exponer el servicio de reactividad globalmente para que las cards puedan acceder
    window.cardRealtimeService = this.cardRealtimeService;

    // Exponer función de sincronización de contadores para uso manual desde consola
    window.syncProjectCounters = async (projectId, options) => {
      const pid = projectId || this.projectId;
      if (!pid) {
        console.error('Uso: syncProjectCounters("ProjectId") o syncProjectCounters() si estás en un proyecto');
        return;
      }
      console.log(`Sincronizando contadores para ${pid}...`);
      const result = await FirebaseService.syncProjectCounters(pid, options);
      console.table(result.results);
      console.log(result.message);
      return result;
    };

    // Initialize year-based permissions (important for page load with past year selected)
    await this._initializeYearPermissions();

    // Restore view state from URL
    this._restoreViewStateFromUrl();

    // Listen for browser back/forward navigation
    this._setupPopStateListener();
  }

  /**
   * Lightweight re-initialization for View Transition navigations.
   * Reuses existing services and subscriptions, only updates project/section context.
   */
  async onPageNavigated() {
    const newProjectId = URLUtils.getProjectIdFromUrl();
    const newSection = URLUtils.getSectionFromUrl();

    if (newProjectId !== this.projectId) {
      this.projectId = newProjectId;
      this.section = newSection;
      this.sectionsLoaded = {};
      await this.loadInitialData();
      await this.initializeProjectSelector();
    } else {
      this.section = newSection;
    }

    this.tabController.openInitialTab();
    this._restoreViewStateFromUrl();
  }

  /**
   * Restore view state from URL on page load
   * Note: View is already restored by applyInitialView() which reads URL state
   * This method only handles sections not covered by applyInitialView and filters
   */
  _restoreViewStateFromUrl() {
    const urlState = URLStateManager.getState();

    // Restore view ONLY for sections NOT handled by applyInitialView
    // Tasks, Bugs, and Proposals are handled in applyInitialView (uses URL state)
    if (urlState.view) {
      const currentSection = this.section || 'tasks';
      // Only handle sections that applyInitialView doesn't cover
      if (currentSection === 'epics') {
        this.toggleEpicView(urlState.view);
      }
    }

    // Restore filters from URL when cards are rendered
    if (urlState.filters && Object.keys(urlState.filters).length > 0) {
      // Listen for cards-rendered event instead of using setTimeout
      document.addEventListener('cards-rendered', () => {
        this._restoreFiltersFromUrl(urlState.filters);
      }, { once: true });
    }
  }

  /**
   * Restore filters from URL state
   * @param {Object} filters - Filters from URL state
   */
  _restoreFiltersFromUrl(filters) {
    if (!this.projectId || !filters) return;

    const currentSection = this.section || 'tasks';

    // Try to find and apply to the filter component directly
    const filterComponentSelector = currentSection === 'tasks' ? 'task-filters'
      : currentSection === 'bugs' ? 'bug-filters'
      : null;

    if (filterComponentSelector) {
      const filterComponent = document.querySelector(filterComponentSelector);
      if (filterComponent && typeof filterComponent.applyFilters === 'function') {
        filterComponent.applyFilters(filters);
      }
    }
  }

  /**
   * Setup listener for browser back/forward navigation
   * Restores view state when user navigates through history
   */
  _setupPopStateListener() {
    URLStateManager.onPopState((state, eventState) => {
      // Restore view if specified
      if (state.view) {
        const currentSection = this.tabController.getCurrentTab() || this.section || 'tasks';
        if (currentSection === 'tasks') {
          this.toggleTaskView(state.view);
        } else if (currentSection === 'bugs') {
          this.toggleBugsView(state.view);
        } else if (currentSection === 'epics') {
          this.toggleEpicView(state.view);
        } else if (currentSection === 'proposals') {
          this.toggleProposalsView(state.view);
        }
      }

      // Restore section/tab if specified
      if (state.section && state.section !== this.section) {
        this.section = state.section;
        this.tabController.switchToTab(state.section);
      }
    });
  }

  /**
   * Initialize year-based permissions on app load
   * This ensures isYearReadOnly is correctly calculated even without a year change event
   */
  async _initializeYearPermissions() {
    if (this.isPastYear) {
      const isSuperAdmin = await this._checkIsSuperAdmin();
      this.isYearReadOnly = !isSuperAdmin;
// Emit event so cards can update their permissions
      this._emitYearPermissionsUpdate();
    }
  }

  async loadInitialData() {
    try {
      const userEmail = document.body.dataset.userEmail;

      // Register user if new (creates entry with default projects)
      if (userEmail) {
        await this.firebaseService.registerUserLogin(userEmail);
      }

      // OPTIMIZACIÓN: Cargar datos globales y proyectos en paralelo
      // Projects are filtered by user assignment
      await Promise.all([
        this.firebaseService.loadGlobalData(),
        this.firebaseService.loadProjects(userEmail)
      ]);

      // Initialize GlobalDataManager (necesita projects cargados)
      this.globalDataManager.init(this.firebaseService, this.projectId);

      // OPTIMIZACIÓN: Cargar datos del manager y puntos de sprint en paralelo
      const [globalData] = await Promise.all([
        this.globalDataManager.loadAll(),
        updateGlobalSprintList(this.projectId).catch(err => {
}),
        FirebaseService.updateSprintPoints({ projectId: this.projectId }).catch(err => {
})
      ]);

      // Sincronizar contadores en segundo plano (no bloquea la carga)
      // Esto previene cardIds duplicados cuando los contadores se desfasan
      // Skip in demo mode: Firestore is not enabled
      if (this.projectId && !demoModeService.isDemo()) {
        FirebaseService.syncProjectCounters(this.projectId).then(result => {
          if (result.synced > 0) {
            console.log(`[AppController] Contadores sincronizados para ${this.projectId}:`, result);
          }
        }).catch(err => {
          console.warn('[AppController] Error sincronizando contadores:', err);
        });
      }

      // Build config object with simplified structure
      this.config = {
        projectId: this.projectId,
        userEmail: document.body.dataset.userEmail,
        section: this.section,
        projectCardElement: {
          sprints: 'sprint-card',
          epics: 'epic-card',
          tasks: 'task-card',
          bugs: 'bug-card',
          proposals: 'proposal-card',
          qa: 'qa-card'
        },
        // Include only essential data in config (GlobalDataManager handles the rest)
        statusTasksList: globalData.statusLists['task-card'] || {},
        statusBugList: globalData.statusLists['bug-card'] || {},
        developerList: globalData.developerList || [],
        stakeholders: globalData.stakeholders || [],
        sprintList: globalData.sprintList,
        epicList: globalData.epicList,
        userAdminEmails: this.globalDataManager.getSimpleDataForCard().userAdminEmails || []
      };

      this.reloadActiveSection();

      // OPTIMIZACIÓN: Estas no bloquean la carga de cards
      this.updateAppTabVisibility();
      await this.setUserViewMode();
    } catch (error) {
      console.error('[AppController] loadInitialData failed:', error);
      this.showNotification('Error loading application data', 'error');
    }
  }

  setupEventListeners() {
    // Add card buttons
    document.querySelectorAll('.add-button').forEach(button => {
      button.addEventListener('click', this.handleAddButtonClick.bind(this));
    });

    // View toggle buttons
    this.setupViewToggleListeners();

    // Project change listener
    this.projectController.init();

    // Sprint chart button
    this.setupSprintChartButton();

    // Auto-open card from URL
    document.addEventListener('cards-rendered', this.handleCardsRenderedEvent.bind(this));

    // Listen for tab changes to reload cards
    document.addEventListener('tab-changed', this.handleTabChanged.bind(this));

    // Listen for cards rendered to setup filters
    document.addEventListener('cards-rendered', this.handleCardsRenderedForFilters.bind(this));

    // Listen for refresh cards view event (when new cards are created or deleted)
    document.addEventListener('refresh-cards-view', this.handleRefreshCardsView.bind(this));

    // Listen for filter events from the TaskFilters component
    this.setupFilterEventListeners();

    // COMMENTED OUT - causing infinite reloads
    // Listen for project changes to update app tab visibility
    // document.addEventListener('project-changed', (e) => {
    //   const newProjectId = e.detail.projectId;
    //   if (newProjectId !== this.projectId) {
    //     this.projectId = newProjectId;
    //     // Update app tab visibility after project change
    //     setTimeout(() => this.updateAppTabVisibility(), 100);
    //   }
    // });

    // Listen for project change reload (partial reload instead of full page reload)
    document.addEventListener('project-change-reload', this.handleProjectChangeReload.bind(this));

    // Listen for year change to filter sprints and epics
    document.addEventListener('year-changed', this.handleYearChanged);

    // Project tasks requests for related tasks
    document.addEventListener('request-project-tasks', async (e) => {
      const { projectId, currentTaskId, callback, fullData = false } = e.detail;

      try {
        const tasks = await this.firebaseService.getCards(projectId, 'tasks');

        let taskList;
        if (fullData) {
          // Devolver toda la información de las tareas
          taskList = Object.entries(tasks || {}).map(([id, task]) => ({
            id,
            ...task
          }));
        } else {
          // Devolver solo información básica (comportamiento original)
          taskList = Object.entries(tasks || {}).map(([id, task]) => ({
            id,
            cardId: task.cardId,
            title: task.title || 'Sin título'
          })).filter(task => task.cardId !== currentTaskId); // Excluir la tarea actual
        }

        if (callback && typeof callback === 'function') {
          callback(taskList);
        }
      } catch (error) {
        console.error('[AppController] request-project-tasks error', error);
        if (callback && typeof callback === 'function') {
          callback([]);
        }
      }
    });

    // Available projects requests for related tasks
    document.addEventListener('request-available-projects', this.handleRequestAvailableProjects.bind(this));

    // Load and expand task from related tasks
    document.addEventListener('load-and-expand-task', this.handleLoadAndExpandTask.bind(this));
  }

  /**
   * Configura los event listeners para los componentes de filtros
   */
  setupFilterEventListeners() {
    // Escuchar eventos del componente task-filters
    document.addEventListener('filters-changed', this.handleFiltersChanged.bind(this));
    document.addEventListener('filters-cleared', this.handleFiltersCleared.bind(this));

    // Escuchar evento para mover tareas entre sprints
    document.addEventListener('move-card-to-sprint', this.handleMoveCardToSprint.bind(this));

    // Escuchar evento para mover cards entre proyectos
    document.addEventListener('move-card-to-project', this.handleMoveCardToProject.bind(this));
  }

  // Note: Card data event handlers are now managed by GlobalDataManager

  setupViewToggleListeners() {
    // Task view buttons
    const taskViewButtons = [
      { id: 'listViewBtn', view: 'list' },
      { id: 'kanbanViewBtn', view: 'kanban' },
      { id: 'sprintViewBtn', view: 'sprint' },
      { id: 'tableViewBtn', view: 'table' }
    ];

    taskViewButtons.forEach(({ id, view }) => {
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', this.createToggleTaskViewHandler(view));
      }
    });

    // Bug view buttons
    const bugViewButtons = [
      { id: 'bugsListViewBtn', view: 'list' },
      { id: 'bugsStatusKanbanBtn', view: 'status' },
      { id: 'bugsPriorityKanbanBtn', view: 'priority' },
      { id: 'bugsTableViewBtn', view: 'table' }
    ];

    bugViewButtons.forEach(({ id, view }) => {
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', this.createToggleBugsViewHandler(view));
      }
    });

    // Epic view buttons
    const epicViewButtons = [
      { id: 'epicsListBtn', view: 'list' },
      { id: 'epicsGanttBtn', view: 'gantt' }
    ];

    epicViewButtons.forEach(({ id, view }) => {
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', this.createToggleEpicViewHandler(view));
      }
    });

    // Proposal view buttons
    const proposalViewButtons = [
      { id: 'proposalsTableViewBtn', view: 'table' },
      { id: 'proposalsListViewBtn', view: 'list' }
    ];

    proposalViewButtons.forEach(({ id, view }) => {
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', this.createToggleProposalsViewHandler(view));
      }
    });

    // Evento para editar tarea desde la tabla
    const tableContainer = document.getElementById('tasksTableView');
    if (tableContainer) {
      tableContainer.addEventListener('edit-task', this.handleEditTask.bind(this));
      tableContainer.addEventListener('generate-ia-link', this.handleGenerateIaLink.bind(this));
    }

    // Evento para ver bug desde la tabla
    const bugsTableContainer = document.getElementById('bugsTableView');
    if (bugsTableContainer) {
      bugsTableContainer.addEventListener('view-bug', this.handleViewBug.bind(this));
    }

    // Evento para ver/eliminar proposal desde la tabla
    const proposalsTableContainer = document.getElementById('proposalsTableView');
    if (proposalsTableContainer) {
      proposalsTableContainer.addEventListener('view-proposal', this.handleViewProposal.bind(this));
    }
  }

  setupSprintChartButton() {
    const showChartBtn = document.getElementById('showSprintChartBtn');
    const showCardsBtn = document.getElementById('showSprintCardsBtn');
    const chartContainer = document.getElementById('sprintChartContainer');
    const cardsList = document.getElementById('sprintsCardsList');
    const chart = document.getElementById('sprintPointsChart');

    if (showChartBtn && showCardsBtn && chartContainer && cardsList && chart) {
      document.querySelector('.cards-container').style.display = "flex"
      chartContainer.style.display = 'none';

      showChartBtn.addEventListener('click', this.handleShowChartClick.bind(this));

      showCardsBtn.addEventListener('click', this.handleShowCardsClick.bind(this));
    }
  }

  async loadSprintChartData(chart) {
    try {
      // Get sprint data
      const sprints = Array.from(document.querySelectorAll('sprint-card')).map(card => ({
        title: card.title,
        businessPoints: Number(card.businessPoints) || 0,
        devPoints: Number(card.devPoints) || 0,
        startDate: card.startDate,
        endDate: card.endDate
      }));
// Get bugs data
      const bugsData = await this.firebaseService.getCards(this.projectId, 'bugs');
      const bugs = Object.values(bugsData || {});
// Calculate bugs resolved by sprint
      const bugsBySprint = sprints.map((sprint, idx) => {
        if (!sprint.startDate || !sprint.endDate) return 0;

        const start = new Date(sprint.startDate);
        const end = new Date(sprint.endDate);

        const bugsInSprint = bugs.filter(bug => {
          if (!bug.endDate) return false;

          const bugEndDate = new Date(bug.endDate);
          const status = (bug.status || '').toLowerCase();

          if (!["fixed", "verified", "closed"].includes(status)) return false;

          return bugEndDate >= start && bugEndDate <= end;
        });
return bugsInSprint.length;
      });
chart.sprints = sprints;
      chart.bugsBySprint = bugsBySprint;
} catch (error) {
this.showNotification('Error loading sprint chart data', 'error');
    }
  }

  async reloadActiveSection() {
    // Only load the currently active section to optimize performance
    const activeSection = this.section || 'tasks'; // Default to tasks if no section specified
await this.reloadCards(activeSection);
  }

  async reloadAllCards() {
    const sectionsToLoad = cardTypes.filter(section => section !== 'logs');

    for (const section of sectionsToLoad) {
      await this.reloadCards(section);
    }
  }

  _shouldSkipReload(section, preserveFilters) {
    return this.sectionsLoaded[section] && !preserveFilters && !this.sectionsNeedReload[section];
  }

  _handleAppSection() {
const appManager = document.getElementById('appManager');
    if (appManager && this.projectId) {
      appManager.projectId = this.projectId;
      appManager.requestUpdate();
    }
  }

  _getPreservedFilters(section, preserveFilters) {
    if (!preserveFilters) return {};

    const filterComponent = document.querySelector(`${section}-filters`);
    if (filterComponent?.getCurrentFilters) {
      const filters = filterComponent.getCurrentFilters();
return filters;
    }
    return {};
  }

  _restoreFiltersAfterRender(section, currentFilters) {
    if (Object.keys(currentFilters).length === 0) return;

    // Use requestAnimationFrame to wait for next render frame
    requestAnimationFrame(() => {
      const filterComponent = document.querySelector(`${section}-filters`);
      if (filterComponent?.applyFilters) {
        filterComponent.applyFilters(currentFilters);
      }
    });
  }

  async reloadCards(section, preserveFilters = false) {
    try {
if (this._shouldSkipReload(section, preserveFilters)) {
this.applyInitialView(section);
        return;
      }

      if (section === 'app') {
        this._handleAppSection();
        return;
      }

      // Trash and tasksGenerator are managed by adminproject.astro, not by the card system
      if (section === 'trash' || section === 'tasksGenerator') {
        return;
      }

      const currentFilters = this._getPreservedFilters(section, preserveFilters);

      const dataSection = section;
      let cards = await this.firebaseService.getCards(this.projectId, dataSection);
cards = this._filterCardsByYear(cards, section);

      const updatedConfig = { ...this.config, section };

      if (section === 'qa') {
        this.cardRenderer.renderCollapsedQACards(cards, section, updatedConfig);
      } else {
        this.cardRenderer.renderCollapsedCards(cards, section, updatedConfig);
      }

      this._restoreFiltersAfterRender(section, currentFilters);
      this.applyInitialView(section);
      this.sectionsLoaded[section] = true;
      this.sectionsNeedReload[section] = false;

    } catch (error) {
this.showNotification(`Error loading ${section}: ${error.message}`, 'error');
    }
  }

  applyInitialView(section) {
    // Get view from URL state (if any) - this prevents duplicate view initialization
    const urlState = URLStateManager.getState();

    if (section === 'tasks' && !this.initialViewApplied.tasks) {
      this.initialViewApplied.tasks = true;
      // Use URL view if present, otherwise default to 'table'
      const view = urlState.view || 'table';
      this.toggleTaskView(view);
    } else if (section === 'bugs' && !this.initialViewApplied.bugs) {
      this.initialViewApplied.bugs = true;
      const view = urlState.view || 'table';
      this.toggleBugsView(view);
    } else if (section === 'proposals') {
      // Always reinitialize proposals table view (subscription was cleaned up when switching tabs)
      this.initialViewApplied.proposals = true;
      const view = urlState.view || 'table';
      this.toggleProposalsView(view);
    }
  }

  toggleTaskView(view) {
    this.viewFactory.switchView(view, 'tasks', this.config);

    // Update URL with new view (use pushState for navigation history)
    URLStateManager.updateState({ view });

    // Setup filters when switching to list view
    if (view === 'list') {
      // Use requestAnimationFrame to wait for next render frame
      requestAnimationFrame(() => this.setupTaskFilters());
    } else {
      // Reset filters when switching away from list view
      this.resetTaskFilters();
    }
  }

  toggleBugsView(view) {
    this.viewFactory.switchView(view, 'bugs', this.config);

    // Update URL with new view
    URLStateManager.updateState({ view });

    // Setup filters when switching to list view
    if (view === 'list') {
      requestAnimationFrame(() => this.setupBugFilters());
    } else {
      // Reset filters when switching away from list view
      this.resetBugFilters();
    }
  }

  toggleEpicView(view) {
    this.viewFactory.switchView(view, 'epics', this.config);

    // Update URL with new view
    URLStateManager.updateState({ view });
  }

  toggleProposalsView(view) {
    this.viewFactory.switchView(view, 'proposals', this.config);

    // Update URL with new view
    URLStateManager.updateState({ view });
  }

  async addNewCard() {
    try {
      // Verify project is selected before creating card
      const projectId = this.config?.projectId || window.currentProjectId || document.body.dataset.projectId;
      if (!projectId) {
        this.showNotification('Debes seleccionar un proyecto antes de crear una card', 'warning');
        return;
      }

      // Use current section from tab controller
      const currentSection = this.tabController.getCurrentTab() || this.section || 'tasks';

      // Update config section for the new card
      const updatedConfig = { ...this.config, section: currentSection };
      await CardFactory.createCard(currentSection, updatedConfig);
    } catch (error) {
      this.showNotification(`Error creating new card: ${error.message}`, 'error');
    }
  }

  /**
   * Configura los filtros para la vista de bugs usando el componente bug-filters
   */
  setupBugFilters() {
// Prevent redundant setup executions
    if (this.bugFiltersSetup) {
return;
    }

    // Solo configurar filtros si estamos en la vista de lista de bugs
    const bugsListView = document.getElementById('bugsCardsList');
    const bugsListBtn = document.getElementById('bugsListViewBtn');

    if (bugsListView && bugsListBtn?.classList.contains('active')) {
      this.bugFiltersSetup = true;
      // Variables are available from GlobalDataManager, no need to wait
      this.createBugFiltersComponent();
    }
  }

  /**
   * Crea o actualiza el componente bug-filters
   */
  createBugFiltersComponent() {
    const filtersContainer = document.getElementById('bugsFilters');
    if (!filtersContainer) {
return;
    }

    // Verificar si ya existe un componente bug-filters
    let bugFilters = filtersContainer.querySelector('bug-filters');
    if (bugFilters) {
return;
    }

    // Limpiar contenido existente
    filtersContainer.innerHTML = '';

    // Crear el componente bug-filters
    bugFilters = document.createElement('bug-filters');
    bugFilters.setAttribute('target-selector', '#bugsCardsList');
    bugFilters.setAttribute('card-selector', 'bug-card');

    // Añadir el componente al DOM
    filtersContainer.appendChild(bugFilters);
}

  /**
   * Resetea los filtros de bugs
   */
  resetBugFilters() {
    const bugFilters = document.querySelector('bug-filters');
    if (bugFilters && typeof bugFilters.clearAllFilters === 'function') {
      bugFilters.clearAllFilters();
    }
    // Reset the setup flag to allow fresh setup when needed
    this.bugFiltersSetup = false;
  }

  /**
   * Configura los filtros para la vista de tasks usando el componente task-filters
   */
  setupTaskFilters() {
    // Prevent redundant setup executions
    if (this.taskFiltersSetup) {
      return;
    }

    // Solo configurar filtros si estamos en la vista de lista de tasks
    const tasksListView = document.getElementById('tasksCardsList');
    const tasksListBtn = document.getElementById('listViewBtn');

    if (tasksListView && tasksListBtn?.classList.contains('active')) {
      this.taskFiltersSetup = true;
      // Variables are available from GlobalDataManager, no need to wait
      this.createTaskFiltersComponent();
    }
  }

  /**
   * Asegura que las variables globales necesarias estén disponibles
   */
  async ensureGlobalVariables() {
    // Asegurar que tenemos las listas de status
    if (!window.statusTasksList && this.config.statusTasksList) {
      window.statusTasksList = this.config.statusTasksList;
    }

    // Asegurar que tenemos la lista de desarrolladores
    if (!window.globalDeveloperList && this.config.developerList) {
      window.globalDeveloperList = this.config.developerList;
    }

    // Asegurar que tenemos la lista de stakeholders
    if (!window.globalStakeholders && this.config.stakeholders) {
      window.globalStakeholders = this.config.stakeholders;
    }

    // Asegurar que tenemos la lista de sprints
    if (!window.globalSprintList && this.config.sprintList) {
      window.globalSprintList = this.config.sprintList;
    }
}

  /**
   * Crea o actualiza el componente task-filters
   */
  createTaskFiltersComponent() {
    const filtersContainer = document.getElementById('tasksFilters');
    if (!filtersContainer) {
return;
    }

    // Verificar si ya existe un componente task-filters
    let taskFilters = filtersContainer.querySelector('task-filters');
    if (taskFilters) {
return;
    }

    // Limpiar contenido existente
    filtersContainer.innerHTML = '';

    // Crear el componente task-filters
    taskFilters = document.createElement('task-filters');
    taskFilters.setAttribute('target-selector', '#tasksCardsList');
    taskFilters.setAttribute('card-selector', 'task-card');

    // Añadir el componente al DOM
    filtersContainer.appendChild(taskFilters);
}

  /**
   * Resetea los filtros de tasks
   */
  resetTaskFilters() {
    const taskFilters = document.querySelector('task-filters');
    if (taskFilters && typeof taskFilters.clearAllFilters === 'function') {
      taskFilters.clearAllFilters();
    }
    this.taskFiltersSetup = false; // Reset flag to allow fresh setup when needed
  }

  showNotification(message, type = 'info') {
    document.dispatchEvent(new CustomEvent('show-slide-notification', {
      detail: {
        options: { message, type }
      }
    }));
  }

  // Getters for external access
  getCurrentProjectId() {
    return this.projectId;
  }

  getFirebaseService() {
    return this.firebaseService;
  }

  getFirebaseConfig() {
    const config = this.firebaseService.firebaseConfig;
return config;
  }

  async handleGenerateIaLink(event) {
    try {
      const detail = event.detail || {};
      const projectId = detail.projectId || this.getCurrentProjectId();
      const taskId = detail.firebaseId;
      if (!projectId || !taskId) {
        this.showNotification('No se pudo generar el enlace (falta projectId o ID de Firebase)', 'error');
        return;
      }

      const projectSnap = await get(ref(database, `/projects/${projectId}`));
      if (!projectSnap.exists() || !projectSnap.val().iaEnabled) {
        this.showNotification('La IA no está habilitada para este proyecto', 'warning');
        return;
      }

      const token = this._generateSecureToken();
      const now = Date.now();
      const expiresAt = now + 15 * 60 * 1000; // 15 minutos
      const createdBy = (auth?.currentUser?.email || '').trim();

      const linkData = {
        token,
        projectId,
        taskId,
        firebaseId: taskId,
        cardId: detail.cardId || '',
        createdBy: createdBy || 'unknown',
        createdAt: now,
        expiresAt,
        used: false
      };

      await set(ref(database, `/ia/links/${token}`), linkData);
      const url = this._buildIaLinkUrl(token);
      await navigator.clipboard.writeText(url);
      this.showNotification('Enlace IA generado y copiado (1 uso, 15 min)', 'success');
    } catch (error) {
this.showNotification('No se pudo generar el enlace IA', 'error');
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

  async initializeProjectSelector() {
    const projectSelector = document.querySelector('project-selector');
    if (projectSelector) {
      try {
        const projectList = window.projects;

        if (projectList && Object.keys(projectList).length > 0) {
          // Set the projects data on the component
          projectSelector.projects = projectList;

          // Set as global variable for backward compatibility
          window.projectList = projectList;

          // Wait for component to render, then set current project
          if (projectSelector.updateComplete) {
            projectSelector.updateComplete.then(() => {
              if (this.projectId) {
                projectSelector.selectedProject = this.projectId;
              }
            });
          } else if (this.projectId) {
            // Fallback for non-Lit components
            projectSelector.selectedProject = this.projectId;
          }
        }
      } catch (error) {
        // Silently ignore project selector initialization errors
      }
    }
  }

  clearCache() {
    // Clear any cached data if needed
    this.config = {};
  }

  // === MÉTODOS DE ACCESO AL SISTEMA DE EVENTOS ===

  /**
   * Obtener el EventBus para emitir/escuchar eventos pub/sub
   */
  getEventBus() {
    return this.eventSystem.getEventBus();
  }

  /**
   * Emitir un evento en el EventBus
   */
  emitEvent(eventName, data) {
    this.eventSystem.getEventBus().emit(eventName, data);
  }

  /**
   * Suscribirse a un evento del EventBus
   */
  onEvent(eventName, callback) {
    this.eventSystem.getEventBus().on(eventName, callback);
  }

  /**
   * Desuscribirse de un evento del EventBus
   */
  offEvent(eventName, callback) {
    this.eventSystem.getEventBus().off(eventName, callback);
  }

  /**
   * Update App tab visibility based on project configuration
   * All authenticated users can see the App tab if project allows executables
   * Permission level (admin vs readonly) is handled by AppManager component
   */
  async updateAppTabVisibility() {
    const appTab = document.getElementById('appTab');
    if (!appTab) return;

    if (!this.projectId || !window.projects) {
      appTab.style.display = 'none';
      return;
    }

    // Check if user is super admin from environment variable
    const normalizeEmail = (email) => (email || '').toString().trim().toLowerCase();
    let isSuperAdmin = false;
    try {
      const firebaseConfigModule = await import('../../firebase-config.js');
      const superAdminEmail = normalizeEmail(firebaseConfigModule.superAdminEmail || '');
      const currentUserEmail = normalizeEmail(document.body.dataset.userEmail);
      isSuperAdmin = superAdminEmail && currentUserEmail === superAdminEmail;
    } catch (error) {
      // Ignore errors
    }

    // Super admin always sees the App tab, regardless of project configuration
    if (isSuperAdmin) {
      appTab.style.display = 'block';
      return;
    }

    // Read allowExecutables directly from Firebase to avoid stale window.projects data
    let allowExecutables = false;
    try {
      const { database, ref, get } = await import('../../firebase-config.js');
      const projectSnap = await get(ref(database, `/projects/${this.projectId}/allowExecutables`));
      allowExecutables = projectSnap.exists() ? projectSnap.val() === true : false;
      // Update window.projects cache to keep it in sync
      if (window.projects?.[this.projectId]) {
        window.projects[this.projectId].allowExecutables = allowExecutables;
      }
    } catch (error) {
      // Fall back to cached data if Firebase read fails
      const currentProject = window.projects?.[this.projectId];
      allowExecutables = currentProject?.allowExecutables || false;
    }

    if (allowExecutables) {
      appTab.style.display = 'block';
    } else {
      appTab.style.display = 'none';
    }
  }

  setupAppAccessListener() {
    this.hasAppAccess = Boolean(window.isAppAdmin);
    this.updateTrashTabVisibility();
    this.updateUsersTabVisibility();
    document.addEventListener('app-admin-status-changed', this.handleAppAdminStatusChange);
  }

  async updateTrashTabVisibility() {
    const trashTab = document.getElementById('trashTab');
    if (!trashTab) return;

    const isSuperAdmin = await this._checkIsSuperAdmin();
    trashTab.style.display = isSuperAdmin ? 'block' : 'none';
  }

  async updateUsersTabVisibility() {
    const usersTab = document.getElementById('usersTab');
    if (!usersTab) return;

    const isSuperAdmin = await this._checkIsSuperAdmin();
    usersTab.style.display = isSuperAdmin ? 'block' : 'none';
  }

  handleAppAdminStatusChange(event) {
    const previous = this.hasAppAccess;
    this.hasAppAccess = Boolean(event?.detail?.isAppAdmin);
    if (previous !== this.hasAppAccess) {
      this.updateAppTabVisibility();
    }
  }

  // === MÉTODOS DE MANEJO DE EVENTOS (named handlers) ===

  handleAddButtonClick(event) {
    this.addNewCard();
  }

  handleTabChanged(event) {
    const { section } = event.detail;
    if (section) {
      this.config.section = section;

      // Only reload cards if switching to a different section
      if (this.section !== section) {
        this.section = section;

        // Update URL with new section (clear view when switching sections)
        URLStateManager.updateState({ section, view: null });

        // Reload cards for the new section when switching tabs
        this.reloadCards(section);
      } else {
        // Same section, just update the section reference
        this.section = section;
      }
    }
  }

  handleCardsRenderedEvent(event) {
    const urlParams = new URLSearchParams(window.location.search);
    const cardIdToOpen = urlParams.get('cardId');

    if (cardIdToOpen && !this.cardAutoOpened) {
      const card = document.querySelector(`[card-id="${cardIdToOpen}"]`);
      if (card) {
        import('../utils/common-functions.js').then(({ showExpandedCardInModal }) => {
          showExpandedCardInModal(card);
          this.cardAutoOpened = true;
        });
      } else {
        this.cardAutoOpened = true;
        const notification = document.createElement('slide-notification');
        notification.message = `Card "${cardIdToOpen}" not found in this project. It may have been deleted or the ID may be incorrect.`;
        notification.type = 'warning';
        document.body.append(notification);
      }
    }
  }

  handleCardsRenderedForFilters(event) {
    const { section } = event.detail;
    // Cards are already rendered, setup filters immediately
    if (section === 'bugs') {
      this.setupBugFilters();
    } else if (section === 'tasks') {
      this.setupTaskFilters();
    }
  }

  handleRefreshCardsView(event) {
    const { section, preserveFilters } = event.detail;
    const targetSection = section || this.section;
    if (targetSection) {
      this.sectionsNeedReload[targetSection] = true;
    }
    this.reloadCards(targetSection, preserveFilters);
  }

  handleFiltersChanged(event) {
    if (event.target.tagName.toLowerCase() === 'task-filters') {
// El componente ya aplica los filtros automáticamente
      // Aquí puedes añadir lógica adicional si es necesaria
    }
  }

  handleFiltersCleared(event) {
    if (event.target.tagName.toLowerCase() === 'task-filters') {
// El componente ya limpia los filtros automáticamente
      // Aquí puedes añadir lógica adicional si es necesaria
    }
  }

  // Note: handleEpicCardDataRequest, handleTaskCardDataRequest, and handleBugCardDataRequest
  // are now handled by GlobalDataManager

  createToggleTaskViewHandler(view) {
    return () => this.toggleTaskView(view);
  }

  createToggleBugsViewHandler(view) {
    return () => this.toggleBugsView(view);
  }

  createToggleEpicViewHandler(view) {
    return () => this.toggleEpicView(view);
  }

  createToggleProposalsViewHandler(view) {
    return () => this.toggleProposalsView(view);
  }

  async handleEditTask(e) {
    const { id, cardId } = e.detail;

    if (!id) {
      console.error('handleEditTask: firebaseId is required');
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: 'Error: ID de tarea no proporcionado', type: 'error' } }
      }));
      return;
    }

    try {
      const { showExpandedCardInModal } = await import('../utils/common-functions.js');

      // 1. Try to find existing task-card in DOM (list/card view)
      const existingCard = document.querySelector(`task-card[id="${id}"]`) ||
                           document.querySelector(`task-card[data-id="${id}"]`) ||
                           document.querySelector(`#tasksCardsList task-card[id="${id}"]`) ||
                           document.querySelector(`#tasksCardsList task-card[data-id="${id}"]`);
      if (existingCard) {
        showExpandedCardInModal(existingCard);
        return;
      }

      // 2. Fetch from /cards/ (source of truth) - needed in table view
      const projectId = this.projectId;
      if (!projectId) throw new Error('No hay proyecto seleccionado');

      const cardPath = `${FirebaseService.getPathBySectionAndProjectId('tasks', projectId)}/${id}`;
      const snap = await get(ref(database, cardPath));

      if (snap.exists()) {
        const cardData = snap.val();
        const taskCard = document.createElement('task-card');
        const { priority, ...dataWithoutComputed } = cardData;
        Object.assign(taskCard, dataWithoutComputed, {
          id: id,
          firebaseId: id,
          expanded: false,
          developers: this.currentDevelopers || [],
          stakeholders: this.currentStakeholders || [],
          epics: this.currentEpics || [],
          sprints: this.currentSprints || [],
          projectId: cardData.projectId || projectId
        });
        showExpandedCardInModal(taskCard);
        return;
      }

      // 3. NOT in /cards/ - check duplicates and ask user
      await this._handleCardNotInSource('task', 'tasks', id, cardId, projectId);

    } catch (error) {
      console.error('handleEditTask error:', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `Error al abrir tarea: ${error.message}`, type: 'error' } }
      }));
    }
  }

  async handleViewBug(e) {
    const { id, cardId } = e.detail;

    if (!id) {
      console.error('handleViewBug: firebaseId is required');
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: 'Error: ID de bug no proporcionado', type: 'error' } }
      }));
      return;
    }

    try {
      const { showExpandedCardInModal } = await import('../utils/common-functions.js');

      // 1. Try to find existing bug-card in DOM (list/card view)
      const selectors = [`bug-card[id="${id}"]`, `bug-card[data-id="${id}"]`, `#bugsCardsList bug-card[id="${id}"]`];
      if (cardId) {
        selectors.push(`bug-card[card-id="${cardId}"]`, `bug-card[cardid="${cardId}"]`);
      }
      const existingCard = selectors.map(s => document.querySelector(s)).find(Boolean);

      if (existingCard) {
        showExpandedCardInModal(existingCard);
        return;
      }

      // 2. Fetch from /cards/ (source of truth)
      const projectId = this.projectId;
      if (!projectId) throw new Error('No hay proyecto seleccionado');

      const cardPath = `${FirebaseService.getPathBySectionAndProjectId('bugs', projectId)}/${id}`;
      const snap = await get(ref(database, cardPath));

      if (snap.exists()) {
        const cardData = snap.val();
        const bugCard = document.createElement('bug-card');
        Object.assign(bugCard, cardData, {
          id: id,
          firebaseId: id,
          expanded: false,
          projectId: cardData.projectId || projectId,
          group: cardData.group || 'bugs',
          cardType: cardData.cardType || 'bug-card'
        });
        showExpandedCardInModal(bugCard);
        return;
      }

      // 3. NOT in /cards/ - check duplicates and ask user
      await this._handleCardNotInSource('bug', 'bugs', id, cardId, projectId);

    } catch (error) {
      console.error('handleViewBug error:', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `Error al abrir bug: ${error.message}`, type: 'error' } }
      }));
    }
  }

  async handleViewProposal(e) {
    const { id, cardId } = e.detail;

    if (!id) {
      console.error('handleViewProposal: firebaseId is required');
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: 'Error: ID de propuesta no proporcionado', type: 'error' } }
      }));
      return;
    }

    try {
      const { showExpandedCardInModal } = await import('../utils/common-functions.js');

      // 1. Try to find existing proposal-card in DOM (list/card view)
      const selectors = [`proposal-card[id="${id}"]`, `proposal-card[data-id="${id}"]`, `#proposalsCardsList proposal-card[id="${id}"]`];
      if (cardId) {
        selectors.push(`proposal-card[card-id="${cardId}"]`, `proposal-card[cardid="${cardId}"]`);
      }
      const existingCard = selectors.map(s => document.querySelector(s)).find(Boolean);

      if (existingCard) {
        showExpandedCardInModal(existingCard);
        return;
      }

      // 2. Fetch from /cards/ (source of truth)
      const projectId = this.projectId;
      if (!projectId) throw new Error('No hay proyecto seleccionado');

      const cardPath = `${FirebaseService.getPathBySectionAndProjectId('proposals', projectId)}/${id}`;
      const snap = await get(ref(database, cardPath));

      if (snap.exists()) {
        const cardData = snap.val();
        const proposalCard = document.createElement('proposal-card');
        Object.assign(proposalCard, cardData, {
          id: id,
          firebaseId: id,
          expanded: false,
          projectId: cardData.projectId || projectId
        });
        showExpandedCardInModal(proposalCard);
        return;
      }

      // 3. NOT in /cards/ - check duplicates and ask user
      await this._handleCardNotInSource('proposal', 'proposals', id, cardId, projectId);

    } catch (error) {
      console.error('handleViewProposal error:', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `Error al abrir propuesta: ${error.message}`, type: 'error' } }
      }));
    }
  }

  /**
   * Handle card that exists in /views/ but NOT in /cards/
   * Checks for duplicates (same cardId, different firebaseId) and asks user what to do.
   * NEVER auto-deletes - always requires explicit user confirmation.
   * @param {string} cardType - 'task', 'bug', or 'proposal'
   * @param {string} section - Section name ('tasks', 'bugs', 'proposals')
   * @param {string} firebaseId - Firebase key of the orphan entry
   * @param {string} cardId - Human-readable card ID (e.g., PLN-TSK-0077)
   * @param {string} projectId - Project ID
   */
  async _handleCardNotInSource(cardType, section, firebaseId, cardId, projectId) {
    const typeLabels = { task: 'tarea', bug: 'bug', proposal: 'propuesta' };
    const typeLabel = typeLabels[cardType] || cardType;
    const displayId = cardId || firebaseId;

    // Check for duplicates: same cardId with different firebaseId in /cards/
    let duplicateInfo = null;
    if (cardId) {
      try {
        const sectionPath = FirebaseService.getPathBySectionAndProjectId(section, projectId);
        const allCardsSnap = await get(ref(database, sectionPath));
        if (allCardsSnap.exists()) {
          const allCards = allCardsSnap.val();
          for (const [fbId, card] of Object.entries(allCards)) {
            if (card?.cardId === cardId && fbId !== firebaseId) {
              duplicateInfo = { firebaseId: fbId, status: card.status, title: card.title };
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error checking for duplicates:', err);
      }
    }

    // Build explanation message
    let message = `La ${typeLabel} <strong>${displayId}</strong> (firebaseId: <code>${firebaseId}</code>) `;
    message += 'no existe en <code>/cards/</code> (base de datos principal).<br><br>';

    if (duplicateInfo) {
      message += `<strong>Duplicado detectado:</strong> Existe otra ${typeLabel} con el mismo cardId `;
      message += `<strong>${cardId}</strong> con firebaseId <code>${duplicateInfo.firebaseId}</code> `;
      message += `(status: ${duplicateInfo.status}).<br><br>`;
      message += 'Esta entrada en la vista es probablemente un duplicado huérfano.';
    } else {
      message += 'Esta entrada existe solo en la vista optimizada (<code>/views/</code>) pero no en los datos originales.';
    }

    console.error(`Card not in /cards/: ${typeLabel} ${displayId}, firebaseId=${firebaseId}, duplicate=${!!duplicateInfo}`);

    // Ask user what to do - NEVER auto-delete
    const confirmed = await modalService.createConfirmationModal({
      title: `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} no encontrada en /cards/`,
      message,
      confirmText: 'Eliminar de la vista',
      cancelText: 'Cancelar'
    });

    if (confirmed) {
      await this._removeFromView(cardType, firebaseId, projectId);
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `${typeLabel} ${displayId} eliminada de la vista`, type: 'info' } }
      }));
    }
  }

  /**
   * Remove a card entry from the optimized /views/ path, local cache, and DOM
   * Only called after explicit user confirmation via _handleCardNotInSource
   * @param {string} cardType - 'task', 'bug', or 'proposal'
   * @param {string} firebaseId - Firebase key to remove
   * @param {string} projectId - Project ID
   */
  async _removeFromView(cardType, firebaseId, projectId) {
    const viewPaths = { task: 'task-list', bug: 'bug-list', proposal: 'proposal-list' };
    const viewPath = viewPaths[cardType];
    if (!viewPath) {
      console.error(`_removeFromView: Unknown card type: ${cardType}`);
      return;
    }

    const fullViewPath = `/views/${viewPath}/${projectId}/${firebaseId}`;
    const viewRef = ref(database, fullViewPath);
    await set(viewRef, null);

    // Remove from local cache
    if (this.viewFactory?.tableViewManager?.cardsCache) {
      delete this.viewFactory.tableViewManager.cardsCache[firebaseId];
    }

    // Remove row from table DOM
    const tableRow = document.querySelector(`[data-task-id="${firebaseId}"]`) ||
                     document.querySelector(`[data-bug-id="${firebaseId}"]`) ||
                     document.querySelector(`[data-proposal-id="${firebaseId}"]`);
    if (tableRow) {
      tableRow.remove();
    }
  }

  async handleShowChartClick() {
    const showChartBtn = document.getElementById('showSprintChartBtn');
    const showCardsBtn = document.getElementById('showSprintCardsBtn');
    const chartContainer = document.getElementById('sprintChartContainer');
    const chart = document.getElementById('sprintPointsChart');

    showChartBtn.classList.add('active');
    showCardsBtn.classList.remove('active');
    chartContainer.style.display = 'block';
    document.querySelector('.cards-container').style.display = "none";

    await this.loadSprintChartData(chart);
  }

  handleShowCardsClick() {
    const showChartBtn = document.getElementById('showSprintChartBtn');
    const showCardsBtn = document.getElementById('showSprintCardsBtn');
    const chartContainer = document.getElementById('sprintChartContainer');

    showCardsBtn.classList.add('active');
    showChartBtn.classList.remove('active');
    chartContainer.style.display = 'none';
    document.querySelector('.cards-container').style.display = "flex";
  }

  async handleLoadAndExpandTask(e) {
    const { taskId, projectId } = e.detail;

    try {
      const tasks = await this.firebaseService.getCards(projectId, 'tasks');
      const taskData = Object.values(tasks || {}).find(task => task.cardId === taskId);

      if (taskData) {
        // Crear el elemento task-card
        const taskCard = document.createElement('task-card');
        Object.assign(taskCard, {
          ...taskData,
          projectId: projectId,
          userEmail: document.body.dataset.userEmail,
          expanded: true
        });

        // Mostrar en el modal
        import('../utils/common-functions.js').then(({ showExpandedCardInModal }) => {
          showExpandedCardInModal(taskCard);
        });
      } else {
        const notification = document.createElement('slide-notification');
        notification.message = `No se encontró la tarea ${taskId}`;
        notification.type = 'error';
        document.body.appendChild(notification);
      }
    } catch (error) {
const notification = document.createElement('slide-notification');
      notification.message = 'Error al cargar la tarea';
      notification.type = 'error';
      document.body.appendChild(notification);
    }
  }

  async handleRequestAvailableProjects(e) {
    const { callback } = e.detail;
    try {
      const projects = window.projects || {};
      const projectList = Object.entries(projects).map(([id, project]) => ({
        id,
        name: project.name || 'Sin nombre',
        ...project
      }));

      if (callback && typeof callback === 'function') {
        callback(projectList);
      }
    } catch (error) {
      if (callback && typeof callback === 'function') {
        callback([]);
      }
    }
  }

  /**
   * Configura el modo de vista basado en los permisos del usuario
   */
  async setUserViewMode() {
    try {
      const userEmail = document.body.dataset.userEmail;

      // SuperAdmin always gets management mode
      const isSuperAdmin = await this._checkIsSuperAdmin();
      if (isSuperAdmin) {
        if (typeof window.setUserRole === 'function') {
          window.setUserRole({ isResponsable: true });
        }
        return;
      }

      const globalData = this.globalDataManager.getSimpleDataForCard();
      const userAdminEmails = globalData.userAdminEmails || [];

      // FALLBACK: Si no hay userAdminEmails, intentar obtenerlos directamente
      let finalAdminEmails = userAdminEmails;
      if (!userAdminEmails || userAdminEmails.length === 0) {
        finalAdminEmails = window.userAdminEmails || [];
      }
      // Determinar si el usuario es responsable (está en la lista de admins)
      const isResponsable = finalAdminEmails.includes(userEmail);
      // Configurar el modo de vista si la función está disponible (página adminproject)
      if (typeof window.setUserRole === 'function') {
        window.setUserRole({ isResponsable });
      }
    } catch (error) {
      // Silently ignore errors in view mode setup
    }
  }

  // Note: handleQACardDataRequest is now handled by GlobalDataManager

  // Note: handleFirebaseStorageConfigRequest is now handled by GlobalDataManager

  /**
   * Maneja el evento de mover una tarjeta a un sprint diferente
   * @param {CustomEvent} e - Evento con los datos de la tarjeta y el nuevo sprint
   */
  async handleMoveCardToSprint(e) {
    const { cardData, newSprint, callback } = e.detail;

    try {
      // Get the year of the target sprint from globalSprintList
      let targetSprintYear = null;
      if (window.globalSprintList && newSprint) {
        const targetSprint = Object.values(window.globalSprintList).find(
          sprint => sprint.cardId === newSprint
        );
        if (targetSprint && targetSprint.year) {
          targetSprintYear = targetSprint.year;
        }
      }
// Usar el método del CardService
      // Priorizar Firebase ID (cardData.id) sobre display ID (cardData.cardId)
      const taskId = cardData.id || cardData.cardId;

      // Pass the target sprint year to update the task's year if needed
      const result = await this.cardService.moveCardToSprint(
        cardData.projectId,
        taskId,
        newSprint,
        targetSprintYear
      );

      if (result.success) {
// Notificar el éxito con callback si existe
        if (callback && typeof callback === 'function') {
          callback({ success: true });
        }

        // Recargar las vistas que puedan verse afectadas preservando filtros
        document.dispatchEvent(new CustomEvent('refresh-cards-view', {
          detail: { section: 'tasks', preserveFilters: true }
        }));

      } else {
if (callback && typeof callback === 'function') {
          callback({ success: false, error: result.error });
        }
      }

    } catch (error) {
if (callback && typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  }

  /**
   * Maneja el evento de mover una card a otro proyecto
   * @param {CustomEvent} e - Evento con los datos de la card y el proyecto destino
   */
  async handleMoveCardToProject(e) {
    const { card, sourceProjectId, targetProjectId, firebaseId, cardType, callback } = e.detail;

    try {
      // Verificar permisos - solo admins pueden mover
      const userRole = window.currentUserRole || { isResponsable: false };
      if (!userRole.isResponsable) {
        if (callback && typeof callback === 'function') {
          callback({ success: false, error: 'No tienes permisos para mover cards entre proyectos' });
        }
        return;
      }

      // Ejecutar movimiento via FirebaseService
      const result = await FirebaseService.moveCardToProject({
        card,
        sourceProjectId,
        targetProjectId,
        firebaseId,
        cardType
      });

      if (callback && typeof callback === 'function') {
        callback(result);
      }

    } catch (error) {
      console.error('[AppController] handleMoveCardToProject failed:', error);
      if (callback && typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  }

  async handleProjectChangeReload(e) {
    const { newProjectId } = e.detail;
try {
      const activeSection = this.tabController.getCurrentTab() || this.section || 'tasks';

      // Update internal project ID
      this.projectId = newProjectId;
      this.config.projectId = newProjectId;
      window.currentProjectId = newProjectId;
      document.body.dataset.projectId = newProjectId;

      // Cleanup realtime subscriptions before clearing cards
      if (this.cardRealtimeService) {
        this.cardRealtimeService.cleanup();
      }

      // Cleanup all view managers (table, kanban, sprint, etc.)
      if (this.viewFactory) {
        this.viewFactory.cleanup();
      }

      // Clear any existing cards
      document.querySelectorAll('[data-section]').forEach(section => {
        const container = section.querySelector('.cards-container, .table-container');
        if (container) {
          container.innerHTML = '';
        }
      });

      // Reinitialize global data manager with new project
      this.globalDataManager.reset();
      this.globalDataManager.init(this.firebaseService, newProjectId);
      const globalData = await this.globalDataManager.loadAll();
      const simpleData = this.globalDataManager.getSimpleDataForCard();

      this.config = {
        ...this.config,
        projectId: newProjectId,
        section: activeSection,
        statusTasksList: globalData.statusLists['task-card'] || {},
        statusBugList: globalData.statusLists['bug-card'] || {},
        sprintList: globalData.sprintList,
        epicList: globalData.epicList,
        stakeholders: globalData.stakeholders || [],
        userAdminEmails: simpleData.userAdminEmails || []
      };

      this.sectionsLoaded = {};
      this.sectionsNeedReload = {};
      this.initialViewApplied = {
        tasks: false,
        bugs: false
      };
      globalThis.globalDeveloperList = simpleData.developerList || [];

      this.taskFiltersSetup = false;
      this.bugFiltersSetup = false;

      await this.ensureGlobalVariables();

      // Update global sprint list
      const { updateGlobalSprintList } = await import('../utils/common-functions.js');
      await updateGlobalSprintList(newProjectId);

      // Reload the currently active section
      await this.reloadCards(activeSection, false);

      // Update project selector if it exists
      const projectSelector = document.querySelector('project-selector');
      if (projectSelector) {
        projectSelector.selectedProject = newProjectId;
      }

      this.updateAppTabVisibility();
      this.setupSprintChartButton();
} catch (error) {
// Fallback to full page reload if partial reload fails
      window.location.reload();
    }
  }

  // === YEAR FILTERING METHODS ===

  /**
   * Get the selected year from localStorage
   * @returns {number} The selected year or current year as default
   */
  _getSelectedYearFromStorage() {
    const savedYear = localStorage.getItem('selectedYear');
    return savedYear ? Number(savedYear) : new Date().getFullYear();
  }

  /**
   * Handle year change event from YearSelector component
   * @param {CustomEvent} event - The year-changed event
   */
  async handleYearChanged(event) {
    const { year, isPastYear } = event.detail;
this.selectedYear = year;
    this.isPastYear = isPastYear;

    // Check if user is superadmin (can edit past years)
    const isSuperAdmin = await this._checkIsSuperAdmin();
    this.isYearReadOnly = isPastYear && !isSuperAdmin;
// Emit permissions update for components to react
    this._emitYearPermissionsUpdate();

    // Reload all year-filtered sections with the new year filter
    this.sectionsNeedReload['sprints'] = true;
    this.sectionsNeedReload['epics'] = true;
    this.sectionsNeedReload['tasks'] = true;
    this.sectionsNeedReload['bugs'] = true;

    // If currently viewing a year-filtered section, reload it
    const currentSection = this.tabController.getCurrentTab();
    const yearFilteredSections = ['sprints', 'epics', 'tasks', 'bugs'];
    if (yearFilteredSections.includes(currentSection)) {
      this.reloadCards(currentSection);
    }
  }

  /**
   * Check if current user is superadmin
   * @returns {Promise<boolean>} True if user is superadmin
   */
  async _checkIsSuperAdmin() {
    try {
      const firebaseConfigModule = await import('../../firebase-config.js');
      const superAdminEmail = (firebaseConfigModule.superAdminEmail || '').toString().trim().toLowerCase();
      const currentUserEmail = (document.body.dataset.userEmail || '').toString().trim().toLowerCase();

      return superAdminEmail && currentUserEmail === superAdminEmail;
    } catch (error) {
return false;
    }
  }

  /**
   * Emit event to notify components about year-based permissions
   */
  _emitYearPermissionsUpdate() {
    document.dispatchEvent(new CustomEvent('year-permissions-updated', {
      detail: {
        year: this.selectedYear,
        isPastYear: this.isPastYear,
        isYearReadOnly: this.isYearReadOnly
      }
    }));
  }

  /**
   * Filter cards by year (for sprints, epics, tasks, bugs)
   * Uses explicit year field. After migration all cards have this field.
   * @param {Object} cards - The cards object from Firebase
   * @param {string} section - The section type
   * @returns {Object} Filtered cards object
   */
  _filterCardsByYear(cards, section) {
    // Only filter sections that support year filtering
    const yearFilteredSections = ['sprints', 'epics', 'tasks', 'bugs'];
    if (!yearFilteredSections.includes(section)) {
      return cards;
    }

    if (!cards || Object.keys(cards).length === 0) {
      return cards;
    }

    const filteredCards = {};
    const selectedYear = this.selectedYear;
    const totalBefore = Object.keys(cards).length;

    Object.entries(cards).forEach(([id, cardData]) => {
      // For epics, use date range overlap logic
      if (section === 'epics') {
        const yearStart = new Date(selectedYear, 0, 1);
        const yearEnd = new Date(selectedYear, 11, 31);
        const epicStart = cardData.startDate ? new Date(cardData.startDate) : null;
        const epicEnd = cardData.endDate ? new Date(cardData.endDate) : null;

        const startsBeforeOrInYear = !epicStart || epicStart <= yearEnd;
        const endsAfterOrInYear = !epicEnd || epicEnd >= yearStart;

        if (startsBeforeOrInYear && endsAfterOrInYear) {
          filteredCards[id] = cardData;
        }
      } else {
        // For other card types, use year field
        const cardYear = cardData.year;
        if (!cardYear || Number(cardYear) === selectedYear) {
          filteredCards[id] = cardData;
        }
      }
    });

    const totalAfter = Object.keys(filteredCards).length;
    if (totalBefore !== totalAfter) {
      console.warn(`[AppController] Year filter (${selectedYear}): ${section} ${totalBefore} -> ${totalAfter} cards`);
    }

    return filteredCards;
  }
}

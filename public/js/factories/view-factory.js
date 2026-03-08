import { KanbanRenderer } from '../renderers/kanban-renderer.js';
import { SprintRenderer } from '../renderers/sprint-renderer.js';
import { GanttRenderer } from '../renderers/gantt-renderer.js';
import { ListRenderer } from '../renderers/list-renderer.js';
import { KanbanViewManager } from '../views/kanban-view-manager.js';
import { SprintViewManager } from '../views/sprint-view-manager.js';
import { EpicViewManager } from '../views/epic-view-manager.js';
import { TableViewManager } from '../views/table-view-manager.js';
import { TableRenderer } from '../renderers/table-renderer.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { AppEventBus, AppEvents } from '../services/app-event-bus.js';
import { getUnifiedFilterService } from '../services/unified-filter-service.js';

export class ViewFactory {
  constructor(cardService, firebaseService, cardRenderer) {
    this.cardService = cardService;
    this.firebaseService = firebaseService;
    this.cardRenderer = cardRenderer;

    // Initialize renderers
    this.kanbanRenderer = new KanbanRenderer();
    this.sprintRenderer = new SprintRenderer();
    this.ganttRenderer = new GanttRenderer();
    this.listRenderer = new ListRenderer();
    this.tableRenderer = new TableRenderer();

    // View managers (initialized on demand)
    this.viewManagers = {};
    this.tableViewManager = new TableViewManager(firebaseService);
    this.currentView = null;

    // Active view tracking
    this._tableCardsCache = null;
    this._listCardsCache = null;
    this._activeTaskView = 'table';
    this._bugsTableCardsCache = null;
    this._bugsListCardsCache = null;
    this._activeBugView = 'table';

    // Unified filter service
    this._filterService = getUnifiedFilterService();

    // Listen for year changes to refresh active views
    this._handleYearChanged = this._handleYearChanged.bind(this);
    document.addEventListener('year-changed', this._handleYearChanged);

    // Listen for unified filter changes to re-render list views
    window.addEventListener('unified-filters-changed', (event) => {
      const { projectId, cardType } = event.detail;
      const section = cardType === 'task' ? 'tasks' : cardType === 'bug' ? 'bugs' : cardType + 's';

      if (section === 'tasks' && this._activeTaskView === 'list' && this._listCardsCache) {
        this._rerenderListView('tasks');
      } else if (section === 'bugs' && this._activeBugView === 'list' && this._bugsListCardsCache) {
        this._rerenderListView('bugs');
      }
    });
  }

  async switchView(viewType, section, config) {
    // OPTIMIZACIÓN: Actualizar botones INMEDIATAMENTE, antes de cargar datos
    this.updateViewButtons(section, viewType);

    // Clean up current view
    if (this.currentView) {
      this.currentView.cleanup();
    }

    // Hide all view containers for this section
    this.hideAllViews(section);

    // Switch to the requested view
    switch (section) {
      case 'tasks':
        await this.switchTaskView(viewType, config);
        break;
      case 'bugs':
        await this.switchBugsView(viewType, config);
        break;
      case 'epics':
        await this.switchEpicView(viewType, config);
        break;
      case 'proposals':
        await this.switchProposalsView(viewType, config);
        break;
      default:
}
  }

  async switchTaskView(viewType, config) {
    this._activeTaskView = viewType;
    this._lastConfig = config;
    switch (viewType) {
      case 'list':
        await this.showListView('tasks', config);
        break;
      case 'kanban':
        this.showKanbanView('tasks', config);
        break;
      case 'sprint':
        this.showSprintView(config);
        break;
      case 'table':
        await this.showTableView(config);
        break;
      default:
}
  }

  async switchBugsView(viewType, config) {
    this._activeBugView = viewType;
    this._lastConfig = config;
    switch (viewType) {
      case 'list':
        await this.showListView('bugs', config);
        break;
      case 'status':
        this.showBugsKanbanView('status', config);
        break;
      case 'priority':
        this.showBugsKanbanView('priority', config);
        break;
      case 'table':
        await this.showBugsTableView(config);
        break;
      default:
}
  }

  async switchEpicView(viewType, config) {
    switch (viewType) {
      case 'list':
        await this.showListView('epics', config);
        break;
      case 'gantt':
        this.showGanttView(config);
        break;
      default:
}
  }

  async switchProposalsView(viewType, config) {
    this._activeProposalsView = viewType;
    this._lastConfig = config;
    switch (viewType) {
      case 'list':
        await this.showListView('proposals', config);
        break;
      case 'table':
        await this.showProposalsTableView(config);
        break;
      default:
}
  }

  /**
   * Muestra la vista de tabla para proposals
   * @param {Object} config
   */
  async showProposalsTableView(config) {
    const container = document.getElementById('proposalsTableView');
    if (container) {
      // Restablecer todos los estilos de ocultación
      container.style.removeProperty('display');
      container.style.removeProperty('visibility');
      container.style.removeProperty('opacity');
      container.style.removeProperty('position');
      container.style.removeProperty('left');
      container.style.display = 'block';
      container.className = 'table-view';

      // Usar TableViewManager con reactividad en tiempo real
      this.tableViewManager.renderProposalsTableView(container, config);

      this.currentView = {
        cleanup: () => {
          this.tableViewManager.cleanup();
        }
      };
    }
  }

  /**
   * Reset all visibility and layout styles on a container for List view
   */
  _resetContainerStylesForListView(container) {
    // Remove visibility styles
    container.style.removeProperty('display');
    container.style.removeProperty('visibility');
    container.style.removeProperty('opacity');
    container.style.removeProperty('position');
    container.style.removeProperty('left');
    container.style.display = 'block';

    // Reset layout styles
    container.style.flexDirection = '';
    container.style.flexWrap = '';
    container.style.gap = '';
    container.style.justifyContent = '';
    container.style.alignContent = '';
    container.style.height = '';
    container.style.overflowX = '';
    container.style.overflowY = '';
    container.style.padding = '';

    container.className = 'cards-container list-view';
  }

  /**
   * Cache cards for list view and apply unified filters
   */
  _setupListFiltersForSection(section, cards) {
    if (section === 'tasks') {
      this._listCardsCache = cards;
    } else if (section === 'bugs') {
      this._bugsListCardsCache = cards;
    }
  }

  /**
   * Apply unified filters and re-render list view for a section
   */
  _rerenderListView(section) {
    const cache = section === 'tasks' ? this._listCardsCache : this._bugsListCardsCache;
    if (!cache || !this._lastConfig) return;

    const container = document.getElementById(`${section}CardsList`);
    if (!container) return;

    const cardType = section === 'tasks' ? 'task' : 'bug';
    const filteredCards = this._filterService.applyFilters(cache, this._lastConfig.projectId, cardType);
    this.listRenderer.renderListView(container, filteredCards, this._lastConfig);
  }

  async showListView(section, config) {
    const cardsContainer = document.getElementById(`${section}CardsList`);
    if (!cardsContainer) return;

    this._resetContainerStylesForListView(cardsContainer);

    // Show filters for filterable sections
    const filterableSections = ['tasks', 'bugs'];
    if (filterableSections.includes(section)) {
      this.showFilters(section);
    }

    try {
      let cards = await this.firebaseService.getCards(config.projectId, section);
      cards = this._filterCardsByYear(cards, section);

      // Cache unfiltered cards, then apply unified filters for rendering
      this._setupListFiltersForSection(section, cards);
      const cardType = section === 'tasks' ? 'task' : 'bug';
      const filteredCards = this._filterService.applyFilters(cards, config.projectId, cardType);
      this.listRenderer.renderListView(cardsContainer, filteredCards, config);
    } catch (error) {
      this.listRenderer.renderListView(cardsContainer, {}, config);
    }

    this.currentView = { cleanup: () => {} };
  }

  showKanbanView(section, config) {
    let container, statusList;

    if (section === 'tasks') {
      container = document.getElementById('tasksKanbanView');
      const rawList = Array.isArray(config.statusTasksList) ? config.statusTasksList : Object.keys(config.statusTasksList || {});
      // Order columns according to TASK_STATUS_ORDER (same pattern as bugs kanban)
      statusList = APP_CONSTANTS.TASK_STATUS_ORDER.filter(status => rawList.includes(status));
      const remaining = rawList.filter(status => !APP_CONSTANTS.TASK_STATUS_ORDER.includes(status));
      statusList = [...statusList, ...remaining];
    } else if (section === 'bugs') {
      container = document.getElementById('bugsStatusKanbanView');
      statusList = Array.isArray(config.statusBugList) ? config.statusBugList : Object.keys(config.statusBugList || {});
    }

    if (container && statusList) {
      // Restablecer todos los estilos de ocultación
      container.style.removeProperty('display');
      container.style.removeProperty('visibility');
      container.style.removeProperty('opacity');
      container.style.removeProperty('position');
      container.style.removeProperty('left');
      container.style.display = 'flex';

      // Asegurar que la clase kanban-view está aplicada
      container.className = 'kanban-view';

      // Add kanban-active class to body to prevent main scroll
      document.body.classList.add('kanban-active');

      // Ocultar filtros en vista Kanban
      this.hideFilters(section);

      if (!this.viewManagers.kanban) {
        this.viewManagers.kanban = new KanbanViewManager(this.cardService, this.firebaseService);
      }

      // Asegurar que config tiene la sección correcta  
      const sectionConfig = { ...config, section };

      this.viewManagers.kanban.renderKanbanView(config.projectId, statusList, sectionConfig, 'status');
      this.currentView = this.viewManagers.kanban;
    }
  }

  showBugsKanbanView(kanbanType, config) {
    let container;

    if (kanbanType === 'status') {
      container = document.getElementById('bugsStatusKanbanView');
    } else if (kanbanType === 'priority') {
      container = document.getElementById('bugsPriorityKanbanView');
    }

    if (container) {
      // Restablecer todos los estilos de ocultación
      container.style.removeProperty('display');
      container.style.removeProperty('visibility');
      container.style.removeProperty('opacity');
      container.style.removeProperty('position');
      container.style.removeProperty('left');
      container.style.display = 'flex';

      // Asegurar que la clase kanban-view está aplicada
      container.className = 'kanban-view';

      // Add kanban-active class to body to prevent main scroll
      document.body.classList.add('kanban-active');

      // Ocultar filtros en vista Kanban de bugs
      this.hideFilters('bugs');

      let statusList;
      if (kanbanType === 'status') {
        // Si statusBugList es un objeto, extraer las claves en el orden lógico definido
        if (config.statusBugList && typeof config.statusBugList === 'object' && !Array.isArray(config.statusBugList)) {
          const availableStatuses = Object.keys(config.statusBugList);
          // Ordenar según el orden lógico definido en constantes
          statusList = APP_CONSTANTS.BUG_STATUS_ORDER.filter(status => availableStatuses.includes(status));
          // Agregar cualquier estado que no esté en el orden predefinido al final
          const remainingStatuses = availableStatuses.filter(status => !APP_CONSTANTS.BUG_STATUS_ORDER.includes(status));
          statusList = [...statusList, ...remainingStatuses];
        } else {
          statusList = config.statusBugList;
        }
      } else if (kanbanType === 'priority') {
        // Si bugpriorityList es un objeto, extraer las claves en el orden lógico definido
        if (config.bugpriorityList && typeof config.bugpriorityList === 'object' && !Array.isArray(config.bugpriorityList)) {
          const availablePriorities = Object.keys(config.bugpriorityList);
          // Ordenar según el orden lógico definido en constantes
          statusList = APP_CONSTANTS.BUG_PRIORITY_ORDER.filter(priority => availablePriorities.includes(priority));
          // Agregar cualquier prioridad que no esté en el orden predefinido al final
          const remainingPriorities = availablePriorities.filter(priority => !APP_CONSTANTS.BUG_PRIORITY_ORDER.includes(priority));
          statusList = [...statusList, ...remainingPriorities];
        } else {
          statusList = config.bugpriorityList;
        }
      }

      // Validar que statusList sea un array válido
      if (!Array.isArray(statusList) || statusList.length === 0) {
        console.error('Error: statusList is not a valid array:', statusList);
        console.error('Config object:', config);
        console.error('kanbanType:', kanbanType);
        
        // Usar valores por defecto solo como último recurso
        if (kanbanType === 'status') {
          statusList = APP_CONSTANTS.BUG_STATUS_ORDER;
        } else if (kanbanType === 'priority') {
          statusList = APP_CONSTANTS.BUG_PRIORITY_ORDER;
        }
        
        console.warn('Using default statusList:', statusList);
      }

      if (!this.viewManagers.bugsKanban) {
        this.viewManagers.bugsKanban = new KanbanViewManager(this.cardService, this.firebaseService);
      }

      // Asegurar que config tiene la sección correcta
      const bugsConfig = { ...config, section: 'bugs' };

      this.viewManagers.bugsKanban.renderKanbanView(config.projectId, statusList, bugsConfig, kanbanType);
      this.currentView = this.viewManagers.bugsKanban;
    }
  }

  showSprintView(config) {
    const container = document.getElementById('tasksSprintView');

    if (container) {
      // Restablecer todos los estilos de ocultación
      container.style.removeProperty('display');
      container.style.removeProperty('visibility');
      container.style.removeProperty('opacity');
      container.style.removeProperty('position');
      container.style.removeProperty('left');
      container.style.display = 'block';

      // Asegurar que la clase sprint-view está aplicada
      container.className = 'sprint-view';

      // Ocultar filtros en vista Sprint
      this.hideFilters('tasks');

      if (!this.viewManagers.sprint) {
        this.viewManagers.sprint = new SprintViewManager(this.cardService, this.firebaseService);
      }

      this.viewManagers.sprint.renderSprintView(config.projectId, config);
      this.currentView = this.viewManagers.sprint;
    }
  }

  showGanttView(config) {
    const container = document.getElementById('epicsGanttView');

    if (container) {
      // Restablecer todos los estilos de ocultación
      container.style.removeProperty('display');
      container.style.removeProperty('visibility');
      container.style.removeProperty('opacity');
      container.style.removeProperty('position');
      container.style.removeProperty('left');
      container.style.display = 'block';

      if (!this.viewManagers.epic) {
        this.viewManagers.epic = new EpicViewManager(this.cardService, this.firebaseService);
      }

      this.viewManagers.epic.renderGanttView(config.projectId, config);
      this.currentView = this.viewManagers.epic;
    }
  }

  hideAllViews(section) {
    // Remove kanban-active class from body when hiding views
    document.body.classList.remove('kanban-active');

    const viewContainers = {
      tasks: ['tasksCardsList', 'tasksKanbanView', 'tasksSprintView', 'tasksTableView'],
      bugs: ['bugsCardsList', 'bugsStatusKanbanView', 'bugsPriorityKanbanView', 'bugsTableView'],
      epics: ['epicsCardsList', 'epicsGanttView'],
      proposals: ['proposalsCardsList', 'proposalsTableView']
    };

    const containers = viewContainers[section] || [];
    containers.forEach(containerId => {
      const container = document.getElementById(containerId);
      if (container) {
        // Forzar la ocultación con !important
        container.style.setProperty('display', 'none', 'important');
        container.style.setProperty('visibility', 'hidden', 'important');
        container.style.setProperty('opacity', '0', 'important');
        container.style.setProperty('position', 'absolute', 'important');
        container.style.setProperty('left', '-9999px', 'important');

        // Limpiar cualquier clase específica de vista para evitar conflictos
        container.className = container.className.replace(/\b(list-view|kanban-view|sprint-view)\b/g, '').trim();

        // Si no tiene clase, mantener la clase base
        if (!container.className) {
          if (containerId.includes('CardsList')) {
            container.className = 'cards-container';
          } else if (containerId.includes('KanbanView')) {
            container.className = 'kanban-view';
          } else if (containerId.includes('SprintView')) {
            container.className = 'sprint-view';
          }
        }
      }
    });
  }

  updateViewButtons(section, activeView) {
    const buttonMappings = {
      tasks: {
        list: 'listViewBtn',
        kanban: 'kanbanViewBtn',
        sprint: 'sprintViewBtn',
        table: 'tableViewBtn'
      },
      bugs: {
        list: 'bugsListViewBtn',
        status: 'bugsStatusKanbanBtn',
        priority: 'bugsPriorityKanbanBtn',
        table: 'bugsTableViewBtn'
      },
      epics: {
        list: 'epicsListBtn',
        gantt: 'epicsGanttBtn'
      },
      proposals: {
        list: 'proposalsListViewBtn',
        table: 'proposalsTableViewBtn'
      }
    };

    const buttons = buttonMappings[section];
    if (buttons) {
      // Remove active class from all buttons
      Object.values(buttons).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
          button.classList.remove('active');
        }
      });

      // Add active class to current button
      const activeButtonId = buttons[activeView];
      if (activeButtonId) {
        const activeButton = document.getElementById(activeButtonId);
        if (activeButton) {
          activeButton.classList.add('active');
        }
      }
    }
  }

  /**
   * Renderiza los filtros de tareas en el contenedor dado, usando el estado global de filtros.
   * @param {HTMLElement} container - Contenedor donde renderizar los filtros
   * @param {Object} config - Configuración de la vista
   * @param {Object} filters - Estado actual de los filtros
   * @param {Function} onChange - Callback al cambiar un filtro
   */
  renderTaskFilters(container, config, filters, onChange) {
    container.innerHTML = '';
    // Contador de resultados
    const resultsCounter = document.createElement('div');
    resultsCounter.className = 'filters-results-counter';
    resultsCounter.style = 'margin-bottom: 0.5rem; font-size: 0.95em; color: var(--text-secondary, #555);';
    container.appendChild(resultsCounter);

    // Botón de limpiar filtros
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑️ Limpiar';
    clearBtn.className = 'clear-button';
    clearBtn.addEventListener('click', () => {
      Object.keys(filters).forEach(key => onChange(key, null));
    });
    container.appendChild(clearBtn);

    // Contenedor principal de filtros y controles
    const filtersWrapper = document.createElement('div');
    filtersWrapper.style = 'display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem;';

    // Contenedor de selects de filtros
    const filtersContainer = document.createElement('div');
    filtersContainer.className = 'list-filters';
    filtersContainer.style = 'display: flex; gap: 0.5rem; flex-wrap: wrap;';

    // Helper para crear un filtro select
    const createSelect = (field, label, options) => {
      const group = document.createElement('div');
      group.style.display = 'flex';
      group.style.flexDirection = 'column';
      group.style.gap = '0.25rem';
      const labelEl = document.createElement('label');
      labelEl.textContent = label;
      labelEl.style.fontSize = '0.9rem';
      labelEl.style.fontWeight = 'bold';
      const select = document.createElement('select');
      select.style.padding = '0.5rem';
      select.style.setProperty('border', '1px solid var(--border-default, #ddd)');
      select.style.borderRadius = '4px';
      select.style.fontSize = '0.9rem';
      options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
      });
      // Sincronizar valor
      select.value = filters[field] ?? 'All';
      select.addEventListener('change', (e) => {
        let val = e.target.value;
        if (val === 'All') val = null;
        onChange(field, val);
      });
      group.appendChild(labelEl);
      group.appendChild(select);
      return group;
    };

    // Status
    filtersContainer.appendChild(createSelect('status', 'Status', ['All', ...config.statusTasksList]));
    // Developer
    if (config.developerList) {
      const rawDevelopers = Array.isArray(config.developerList)
        ? config.developerList
        : Object.values(config.developerList || {});
      const developerOptions = rawDevelopers
        .map(entry => {
          if (!entry) return '';
          if (typeof entry === 'string') {
            return entry;
          }
          if (typeof entry === 'object') {
            return entry.name || entry.email || entry.id || '';
          }
          return String(entry);
        })
        .filter(Boolean);
      filtersContainer.appendChild(createSelect('developer', 'Developer', ['All', ...developerOptions]));
    }
    // Sprint
    if (config.sprintList) {
      const sprintOptions = ['All', 'No Sprint', ...Object.values(config.sprintList).map(s => s.title)];
      filtersContainer.appendChild(createSelect('sprint', 'Sprint', sprintOptions));
    }
    // Priority
    filtersContainer.appendChild(createSelect('priority', 'Priority', ['All', 'High', 'Medium', 'Low', 'Not evaluated']));
    // Epic
    if (config.epicList && Array.isArray(config.epicList)) {
      const epicOptions = ['All', 'Sin épica', ...config.epicList.map(epic => epic.name)];
      filtersContainer.appendChild(createSelect('epic', 'Épica', epicOptions));
    }

    // Contenedor de controles (contador y botón)
    const controlsContainer = document.createElement('div');
    controlsContainer.style = 'display: flex; align-items: center; gap: 0.5rem;';
    controlsContainer.appendChild(resultsCounter);
    controlsContainer.appendChild(clearBtn);

    // Añadir los contenedores al wrapper
    filtersWrapper.appendChild(filtersContainer);
    filtersWrapper.appendChild(controlsContainer);

    // Añadir el wrapper al contenedor principal
    container.appendChild(filtersWrapper);

    // Al final, función para actualizar el contador
    this.updateResultsCounter = (visible, total) => {
      resultsCounter.textContent = `${visible} of ${total} tasks`;
    };
  }

  showFilters(section = null) {
    if (section === 'tasks' || section === 'bugs') {
      const filtersSection = document.querySelector(`#${section}TabContent .filters-section`);
      if (filtersSection) {
        filtersSection.style.display = 'block';
        this._createUnifiedFiltersComponent(section);
      }
    } else if (section) {
      const filtersSection = document.querySelector(`#${section}TabContent .filters-section`);
      if (filtersSection) {
        filtersSection.style.display = 'block';
      }
    } else {
      const filtersSection = document.querySelector('.filters-section');
      if (filtersSection) {
        filtersSection.style.display = 'block';
      }
    }
  }

  hideFilters(section = null) {
    if (section) {
      // Si se especifica una sección, ocultar solo sus filtros
      const filtersSection = document.querySelector(`#${section}TabContent .filters-section`);
      if (filtersSection) {
        filtersSection.style.display = 'none';
      }
    } else {
      // Ocultar todas las secciones de filtros
      const filtersSections = document.querySelectorAll('.filters-section');
      filtersSections.forEach(filtersSection => {
        filtersSection.style.display = 'none';
      });
    }
  }

  cleanup() {
    if (this.currentView) {
      this.currentView.cleanup();
    }

    Object.values(this.viewManagers).forEach(manager => {
      if (manager.cleanup) {
        manager.cleanup();
      }
    });

    this.viewManagers = {};
    this.currentView = null;
  }

  /**
   * Muestra la vista de tabla para tareas
   * @param {Object} config
   */
  async showTableView(config) {
    this._activeTaskView = 'table';
    const container = document.getElementById('tasksTableView');
    if (container) {
      // Restablecer todos los estilos de ocultación
      container.style.removeProperty('display');
      container.style.removeProperty('visibility');
      container.style.removeProperty('opacity');
      container.style.removeProperty('position');
      container.style.removeProperty('left');
      container.style.display = 'block';
      container.className = 'table-view';

      // Listen for TABLE_RENDERED event before starting render
      // This ensures we catch the event even if render is synchronous
      AppEventBus.once(AppEvents.TABLE_RENDERED, (detail) => {
        if (detail.section === 'tasks') {
          this.showFilters('tasks');
        }
      });

      // TableViewManager uses UnifiedFilterService internally
      this.tableViewManager.renderTasksTableView(container, config);

      this.currentView = {
        cleanup: () => {
          this.tableViewManager.cleanup();
        }
      };
    }
  }

  /**
   * Muestra la vista de tabla para bugs
   * @param {Object} config
   */
  async showBugsTableView(config) {
    const container = document.getElementById('bugsTableView');
    if (container) {
      // Restablecer todos los estilos de ocultación
      container.style.removeProperty('display');
      container.style.removeProperty('visibility');
      container.style.removeProperty('opacity');
      container.style.removeProperty('position');
      container.style.removeProperty('left');
      container.style.display = 'block';
      container.className = 'table-view';

      // Listen for TABLE_RENDERED event before starting render
      AppEventBus.once(AppEvents.TABLE_RENDERED, (detail) => {
        if (detail.section === 'bugs') {
          this.showFilters('bugs');
        }
      });

      // TableViewManager uses UnifiedFilterService internally
      this.tableViewManager.renderBugsTableView(container, config);

      this.currentView = {
        cleanup: () => {
          this.tableViewManager.cleanup();
        }
      };
    }
  }

  /**
   * Create or reuse a <unified-filters> component for the given section
   * @param {string} section - 'tasks' or 'bugs'
   */
  _createUnifiedFiltersComponent(section) {
    const containerId = section === 'tasks' ? 'tasksFilters' : 'bugsFilters';
    const filtersContainer = document.getElementById(containerId);
    if (!filtersContainer) return;

    const cardType = section === 'tasks' ? 'task' : 'bug';
    const projectId = this._lastConfig?.projectId || '';

    // Check if unified-filters already exists with correct attributes
    const existing = filtersContainer.querySelector('unified-filters');
    if (existing && existing.getAttribute('card-type') === cardType && existing.getAttribute('project-id') === projectId) {
      if (existing.requestUpdate) existing.requestUpdate();
      return;
    }

    // Clear and create new unified-filters component
    filtersContainer.innerHTML = '';

    const filterComponent = document.createElement('unified-filters');
    filterComponent.setAttribute('card-type', cardType);
    filterComponent.setAttribute('project-id', projectId);
    filterComponent.setAttribute('year', this._getSelectedYear());

    filtersContainer.appendChild(filterComponent);
  }

  // === YEAR FILTERING METHODS ===

  /**
   * Get the selected year from localStorage
   * @returns {number} The selected year or current year as default
   */
  _getSelectedYear() {
    const savedYear = localStorage.getItem('selectedYear');
    return savedYear ? Number(savedYear) : new Date().getFullYear();
  }

  /**
   * Filter cards by year
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
    const selectedYear = this._getSelectedYear();

    Object.entries(cards).forEach(([id, cardData]) => {
      const cardYear = cardData.year;

      // Si no tiene year, mostrar la card (compatibilidad temporal pre-migración)
      // Comparar como números para evitar problemas de tipos (string vs number)
      if (!cardYear || Number(cardYear) === selectedYear) {
        filteredCards[id] = cardData;
      }
    });
return filteredCards;
  }

  /**
   * Handle year change event - refresh active views
   */
  _handleYearChanged() {
// Refrescar las vistas activas que necesitan filtrado por año
    if (this._lastConfig) {
      // Si estamos en vista de tareas
      if (this._activeTaskView) {
        const activeSection = this._lastConfig.section || 'tasks';
        if (['tasks', 'bugs'].includes(activeSection)) {
          // Las vistas de tabla y lista se refrescan automáticamente desde app-controller
          // Pero kanban y sprint view necesitan refrescarse aquí
          if (this._activeTaskView === 'kanban' && this.viewManagers.kanban) {
            this.viewManagers.kanban.cleanup();
            this.showKanbanView('tasks', this._lastConfig);
          } else if (this._activeTaskView === 'sprint' && this.viewManagers.sprint) {
            this.viewManagers.sprint.cleanup();
            this.showSprintView(this._lastConfig);
          }
        }
      }

      // Si estamos en vista de bugs
      if (this._activeBugView) {
        if (this._activeBugView === 'status' || this._activeBugView === 'priority') {
          if (this.viewManagers.bugsKanban) {
            this.viewManagers.bugsKanban.cleanup();
            this.showBugsKanbanView(this._activeBugView, this._lastConfig);
          }
        }
      }
    }
  }
}

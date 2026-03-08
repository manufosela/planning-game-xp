/**
 * @deprecated Use <unified-filters card-type="bug"> instead.
 * This component is replaced by UnifiedFilters + UnifiedFilterService.
 * Kept for backward compatibility — will be removed in a future version.
 */
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { bugFiltersStyles } from './bug-filters-styles.js';
import { BaseFilters } from './BaseFilters.js';

export class BugFilters extends BaseFilters {
  static get styles() {
    return bugFiltersStyles;
  }

  constructor() {
    super();
    this._optionsLoaded = false;
    this._loadingPromise = null;
    this.defaultStatusSelection = ['Created', 'Assigned'];
// Configuraciones específicas de BugFilters
    this.defaultConfigs = {
      status: {
        label: 'Estado',
        placeholder: 'Filtrar por estado',
        dataSource: () => this.getStatusOptions()
      },
      priority: {
        label: 'Prioridad',
        placeholder: 'Filtrar por prioridad',
        dataSource: () => this.getPriorityOptions()
      },
      developer: {
        label: 'Desarrollador',
        placeholder: 'Filtrar por desarrollador',
        dataSource: () => this.getDeveloperOptions()
      },
      createdBy: {
        label: 'Creado por',
        placeholder: 'Filtrar por creador',
        dataSource: () => this.getCreatedByOptions()
      },
      completedInSprint: {
        label: 'Completados en Sprint',
        placeholder: 'Filtrar por sprint completado',
        dataSource: () => this.getCompletedSprintOptions()
      },
      repositoryLabel: {
        label: 'Repo',
        placeholder: 'Filtrar por repositorio',
        dataSource: () => this.getRepositoryOptions()
      }
    };

    this.filterConfigs = [
      { id: 'status', ...this.defaultConfigs.status },
      { id: 'priority', ...this.defaultConfigs.priority },
      { id: 'developer', ...this.defaultConfigs.developer },
      { id: 'createdBy', ...this.defaultConfigs.createdBy },
      { id: 'completedInSprint', ...this.defaultConfigs.completedInSprint }
    ];

    this.filterConfigs.forEach(config => {
      this.currentFilters[config.id] = [];
    });
    this.currentFilters.status = [...this.defaultStatusSelection];
}

  connectedCallback() {
    super.connectedCallback();

    if (!this._optionsLoaded && !this._loadingPromise) {
this._initializeOptions();
    }
  }

  async _initializeOptions() {
    this._loadingPromise = this._performInitialization();
    try {
      await this._loadingPromise;
    } finally {
      this._loadingPromise = null;
    }
  }

  async _performInitialization() {
    const globalVarsReady = this._areGlobalVariablesReady();

    if (!globalVarsReady) {
      await this._waitForGlobalVariables();
    }
    await this._loadFilterOptions();

    // Aplicar selección por defecto de status solo si no hay filtros en URL
    if (!this._hasUrlFilters()) {
      const statusFilter = this.shadowRoot?.querySelector('#filter-status');
      if (statusFilter && (!Array.isArray(this.currentFilters.status) || this.currentFilters.status.length === 0)) {
        statusFilter.selectedValues = [...this.defaultStatusSelection];
        statusFilter.requestUpdate();
        this._handleFilterChange('status', [...this.defaultStatusSelection]);
      }
    }

    this._optionsLoaded = true;
    this.requestUpdate();
  }

  _areGlobalVariablesReady() {
    return !!(globalThis.statusBugList && globalThis.globalBugPriorityList && globalThis.globalDeveloperList);
  }

  async _waitForGlobalVariables(maxAttempts = 5, delay = 200) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this._areGlobalVariablesReady()) {
        return;
      }
await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
}

  // Implementación de métodos abstractos de BaseFilters
  _getElements(container, isTableView) {
    if (isTableView) {
      return Array.from(container.querySelectorAll('tr[data-bug-id]'));
    }
    return Array.from(container.querySelectorAll(this.cardSelector || 'bug-card'));
  }

  _tableFilterLogic(row, filterId, selectedValues) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 6) {
return true;
    }

    if (filterId === 'status') {
      const statusCell = cells[2];
      const statusText = statusCell.textContent.trim();
      return selectedValues.includes(statusText);
    }

    if (filterId === 'priority') {
      const priorityCell = cells[3];
      const priorityText = priorityCell.textContent.trim();
      return selectedValues.includes(priorityText);
    }

    if (filterId === 'developer') {
      const developerCell = cells[4];
      const developerText = developerCell.textContent.trim();
      return selectedValues.includes(developerText);
    }

    if (filterId === 'createdBy') {
      const createdByCell = cells[5];
      const createdByText = createdByCell.textContent.trim();
      return selectedValues.includes(createdByText);
    }

    if (filterId === 'completedInSprint') {
      const statusCellCompleted = cells[2];
      const statusTextCompleted = statusCellCompleted.textContent.trim();

      const completedStatuses = ['Fixed', 'Verified', 'Closed', 'Cerrado'];
      if (!completedStatuses.includes(statusTextCompleted)) {
        return false;
      }

      const bugId = row.getAttribute('data-bug-id');
      const bugEndDate = this._getBugEndDateFromId(bugId);

      if (!bugEndDate) {
        return false;
      }

      return selectedValues.some(selectedSprint => {
        const sprint = Object.values(globalThis.globalSprintList || {}).find(s =>
          s.title === selectedSprint || s.name === selectedSprint || s.cardId === selectedSprint
        );
        if (!sprint) return false;

        const startDate = new Date(sprint.startDate);
        const endDate = new Date(sprint.endDate);
        const taskEnd = new Date(bugEndDate);

        return taskEnd >= startDate && taskEnd <= endDate;
      });
    }

    return true;
  }

  _cardFilterLogic(card, filterId, selectedValues) {
    if (filterId === 'status') {
      return selectedValues.includes(card.status);
    }

    if (filterId === 'priority') {
      return selectedValues.includes(card.priority);
    }

    if (filterId === 'developer') {
      return selectedValues.includes(card.developer);
    }

    if (filterId === 'createdBy') {
      return selectedValues.includes(card.createdBy);
    }

    if (filterId === 'completedInSprint') {
      const completedStatuses = ['Fixed', 'Verified', 'Closed', 'Cerrado'];
      if (!completedStatuses.includes(card.status)) {
        return false;
      }

      if (!card.endDate) {
        return false;
      }

      return selectedValues.some(selectedSprint => {
        const sprint = Object.values(globalThis.globalSprintList || {}).find(s =>
          s.title === selectedSprint || s.name === selectedSprint || s.cardId === selectedSprint
        );
        if (!sprint) return false;

        const startDate = new Date(sprint.startDate);
        const endDate = new Date(sprint.endDate);
        const bugEnd = new Date(card.endDate);

        return bugEnd >= startDate && bugEnd <= endDate;
      });
    }

    if (filterId === 'repositoryLabel') {
      const cardRepoLabel = card.repositoryLabel || this._getDefaultRepositoryLabel();
      return selectedValues.includes(cardRepoLabel);
    }

    const cardValue = card[filterId] || card.getAttribute(filterId);
    return selectedValues.includes(cardValue);
  }

  getTooltipHtml(filterId) {
    if (filterId === 'status') {
      return `
        <div><b>Filtra los bugs por su estado actual en el flujo de trabajo.</b></div>
        <div style='margin: 8px 0 4px 0;'><b>Estados disponibles:</b></div>
        <ul style='padding-left: 18px; margin: 0;'>
          <li><b>Created</b>: Ticket nuevo reportado sin gestionar</li>
          <li><b>Assigned</b>: Ticket asignado para su resolución</li>
          <li><b>Fixed</b>: Ticket resuelto sin verificar por su creador</li>
          <li><b>Verified</b>: Ticket resuelto y verificado</li>
          <li><b>Closed</b>: Ticket resuelto, verificado y cerrado</li>
        </ul>
      `;
    }

    if (filterId === 'priority') {
      return `
        <div><b>Filtra los bugs por su nivel de prioridad.</b></div>
        <div style='margin: 8px 0 4px 0;'><b>Prioridades disponibles:</b></div>
        <ul style='padding-left: 18px; margin: 0;'>
          <li><b>Application Blocker</b>: Bloqueo a nivel de aplicación</li>
          <li><b>Department Blocker</b>: Bloquea a todo el equipo</li>
          <li><b>Individual Blocker</b>: Bloque a una persona</li>
          <li><b>User Experience Issue</b>: Inconveniende de experiencia de usuario</li>
          <li><b>Workflow Improvment</b>: Mejora del flujo de trabajo</li>
          <li><b>Workaround Avaiblable Issue</b>: Inconveniente solucionable con workaround</li>
        </ul>
      `;
    }

    if (filterId === 'developer') {
      return `<div><b>Filtra los bugs por el desarrollador asignado para su corrección.</b></div>`;
    }

    if (filterId === 'createdBy') {
      return `<div><b>Filtra los bugs por la persona que los reportó inicialmente.</b></div>`;
    }

    if (filterId === 'completedInSprint') {
      return `
        <div><b>Filtra los bugs que han sido completados en sprints específicos.</b></div>
        <div style='margin: 8px 0 4px 0;'><b>Opciones disponibles:</b></div>
        <ul style='padding-left: 18px; margin: 0;'>
          <li><b>Cualquier Sprint</b>: Bugs completados que tienen asignado algún sprint</li>
          <li><b>Sin Sprint</b>: Bugs completados que no tienen sprint asignado</li>
          <li><b>Sprint específico</b>: Bugs completados dentro de un sprint concreto</li>
        </ul>
        <div style='margin-top: 8px;'><em>Nota: Solo se muestran bugs con estado "Fixed", "Verified" o "Closed"</em></div>
      `;
    }

    if (filterId === 'repositoryLabel') {
      return `<div><b>Filtra los bugs por el repositorio al que pertenecen.</b></div>`;
    }

    return `<div><b>Filtro para ${filterId}</b></div>`;
  }

  // Métodos específicos de BugFilters para obtener opciones
  async getStatusOptions() {
    const statusListObj = globalThis.statusBugList || {};
const availableStatuses = Object.keys(statusListObj);
    const orderedStatuses = APP_CONSTANTS.BUG_STATUS_ORDER.filter(status => availableStatuses.includes(status));
    const remainingStatuses = availableStatuses.filter(status => !APP_CONSTANTS.BUG_STATUS_ORDER.includes(status));
    const statusList = [...orderedStatuses, ...remainingStatuses];

    const options = statusList.map(status => ({
      value: status,
      label: status
    }));
return options;
  }

  async getPriorityOptions() {
    const priorityListObj = globalThis.globalBugPriorityList || [];
const availablePriorities = Array.isArray(priorityListObj) ? priorityListObj : Object.keys(priorityListObj);
    const orderedPriorities = APP_CONSTANTS.BUG_PRIORITY_ORDER.filter(priority => availablePriorities.includes(priority));
    const remainingPriorities = availablePriorities.filter(priority => !APP_CONSTANTS.BUG_PRIORITY_ORDER.includes(priority));
    const priorityList = [...orderedPriorities, ...remainingPriorities];

    const options = priorityList.map(priority => ({
      value: priority,
      label: priority
    }));
return options;
  }

  async getCreatedByOptions() {
    if (!this.targetSelector) {
return [];
    }

    const container = document.querySelector(this.targetSelector);
    if (!container) {
return [];
    }

    const createdBySet = new Set();
    const isTableView = this.getAttribute('data-view') === 'table';

    if (isTableView) {
      const rows = Array.from(container.querySelectorAll('tr[data-bug-id]'));
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          const createdBy = cells[5].textContent.trim();
          if (createdBy) {
            createdBySet.add(createdBy);
          }
        }
      });
    } else {
      const cards = Array.from(container.querySelectorAll(this.cardSelector || 'bug-card'));
      cards.forEach(card => {
        if (card.createdBy) {
          createdBySet.add(card.createdBy);
        }
      });
    }

    const options = Array.from(createdBySet).map(creator => ({
      value: creator,
      label: creator
    }));
return options;
  }

  async getCompletedSprintOptions() {
    const sprintList = globalThis.globalSprintList || {};
const options = Object.values(sprintList).map(sprint => ({
      value: sprint.title || sprint.name || sprint.cardId,
      label: sprint.title || sprint.name || sprint.cardId
    }));
return options;
  }

  _getBugEndDateFromId(bugId) {
    try {
      if (globalThis.globalData?.bugs) {
        const bugData = globalThis.globalData.bugs.find(bug => bug.cardId === bugId);
        if (bugData && bugData.endDate) {
          return bugData.endDate;
        }
      }

      const container = document.querySelector(this.targetSelector);
      if (!container) return null;

      const bugCard = container.querySelector(`bug-card[card-id="${bugId}"]`);
      if (bugCard && bugCard.endDate) {
        return bugCard.endDate;
      }

      return null;
    } catch (error) {
return null;
    }
  }

  /**
   * Obtiene las opciones de repositorio del proyecto actual
   * Solo muestra opciones si el proyecto tiene 2+ repositorios
   */
  async getRepositoryOptions() {
    try {
      const projectId = globalThis.appController?.getCurrentProjectId?.() ||
                        document.querySelector('[projectid]')?.getAttribute('projectid');

      if (!projectId) return [];

      const project = globalThis.projects?.[projectId];
      if (!project?.repoUrl) return [];

      // Si es string, no mostrar filtro (solo 1 repo)
      if (typeof project.repoUrl === 'string') return [];

      // Si es array con menos de 2 elementos, no mostrar
      if (!Array.isArray(project.repoUrl) || project.repoUrl.length < 2) return [];

      // Devolver opciones con las etiquetas de los repos
      return project.repoUrl.map(repo => ({
        value: repo.label,
        label: repo.label
      }));
    } catch (error) {
return [];
    }
  }

  /**
   * Obtiene la etiqueta del repositorio por defecto (el primero del array)
   */
  _getDefaultRepositoryLabel() {
    try {
      const projectId = globalThis.appController?.getCurrentProjectId?.() ||
                        document.querySelector('[projectid]')?.getAttribute('projectid');

      if (!projectId) return '';

      const project = globalThis.projects?.[projectId];
      if (!project?.repoUrl) return '';

      if (typeof project.repoUrl === 'string') return '';
      if (!Array.isArray(project.repoUrl) || project.repoUrl.length === 0) return '';

      return project.repoUrl[0]?.label || '';
    } catch (error) {
      return '';
    }
  }
}

customElements.define('bug-filters', BugFilters);

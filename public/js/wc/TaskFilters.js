/**
 * @deprecated Use <unified-filters card-type="task"> instead.
 * This component is replaced by UnifiedFilters + UnifiedFilterService.
 * Kept for backward compatibility — will be removed in a future version.
 */
import { taskFiltersStyles } from './task-filters-styles.js';
import { BaseFilters } from './BaseFilters.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';

export class TaskFilters extends BaseFilters {
  static get properties() {
    return {
      ...super.properties,
      filters: { type: String }
    };
  }

  static get styles() {
    return taskFiltersStyles;
  }

  constructor() {
    super();
    this.filters = '';
    this._defaultSprintApplied = false;

    // Configuraciones específicas de TaskFilters
    this.defaultConfigs = {
      status: {
        label: 'Estado',
        placeholder: 'Filtrar por estado',
        dataSource: () => this.getStatusOptions()
      },
      sprint: {
        label: 'Sprint',
        placeholder: 'Filtrar por sprint',
        dataSource: () => this.getSprintOptions()
      },
      epic: {
        label: 'Épica',
        placeholder: 'Filtrar por épica',
        dataSource: () => this.getEpicOptions()
      },
      developer: {
        label: 'Desarrollador',
        placeholder: 'Filtrar por desarrollador',
        dataSource: () => this.getDeveloperOptions()
      },
      validator: {
        label: 'Validator',
        placeholder: 'Filtrar por validator',
        dataSource: () => this.getValidatorOptions()
      },
      repositoryLabel: {
        label: 'Repo',
        placeholder: 'Filtrar por repositorio',
        dataSource: () => this.getRepositoryOptions()
      }
    };
}

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('filters')) {
      this._parseFilters();
    }

    if (changedProperties.has('filterConfigs') || changedProperties.has('currentFilters')) {
      const isTableView = this.getAttribute('data-view') === 'table';
      if (!isTableView) {
        this.applyFilters();
      }
    }
  }

  _parseFilters() {
    try {
      if (this.filters) {
        const config = JSON.parse(this.filters);
        this.filterConfigs = Array.isArray(config) ? config : Object.entries(config).map(([key, value]) => ({
          id: key,
          ...value,
          ...this.defaultConfigs[key]
        }));
      } else {
        this.filterConfigs = [
          { id: 'status', ...this.defaultConfigs.status },
          { id: 'sprint', ...this.defaultConfigs.sprint },
          { id: 'epic', ...this.defaultConfigs.epic },
          { id: 'developer', ...this.defaultConfigs.developer },
          { id: 'validator', ...this.defaultConfigs.validator }
        ];
      }

      this.currentFilters = {};
      this.filterConfigs.forEach(config => {
        this.currentFilters[config.id] = [];
      });

      this._loadFilterOptions();

    } catch (error) {
this.filterConfigs = [];
    }
  }

  async _loadFilterOptions() {
    await super._loadFilterOptions();
    await this._applyDefaultSprintFilter();
  }

  // Implementación de métodos abstractos de BaseFilters
  _getElements(container, isTableView) {
    if (isTableView) {
      return Array.from(container.querySelectorAll('tr[data-task-id]'));
    }
    return Array.from(container.querySelectorAll(this.cardSelector || 'task-card'));
  }

  /**
   * Helper: Check if value matches with "no-X" option logic
   * @param {string} noOptionKey - The "no-X" key (e.g., 'no-sprint', 'no-epic')
   * @param {Array} selectedValues - Selected filter values
   * @param {boolean} cardHasNoValue - Whether the card has no value
   * @param {string} cardValue - The actual card value
   * @returns {boolean} Whether the card matches the filter
   */
  _matchesWithNoOption(noOptionKey, selectedValues, cardHasNoValue, cardValue) {
    const hasNoOption = selectedValues.includes(noOptionKey);
    const otherValues = selectedValues.filter(v => v !== noOptionKey);

    if (hasNoOption && otherValues.length === 0) {
      return cardHasNoValue;
    }
    if (hasNoOption && otherValues.length > 0) {
      return cardHasNoValue || otherValues.includes(cardValue);
    }
    return selectedValues.includes(cardValue);
  }

  /**
   * Helper: Check if value matches selected values (with optional display value)
   */
  _matchesSelectedValues(value, displayValue, selectedValues) {
    return selectedValues.includes(value) || selectedValues.includes(displayValue);
  }

  _tableFilterLogic(row, filterId, selectedValues) {
    const cells = row.querySelectorAll('td');
    // Table structure: 0:ID, 1:Notas, 2:Título, 3:Estado, 4:Prioridad, 5:Sprint, 6:Developer, 7:Validator, 8:Épica, 9:FechaInicio, 10:FechaFin, 11:Acciones
    if (cells.length < 9) {
      return true;
    }

    switch (filterId) {
      case 'status':
        return selectedValues.includes(cells[3].textContent.trim());

      case 'developer': {
        const developerText = cells[6].textContent.trim();
        const developerValue = row.dataset.developerValue || developerText;
        const developerDisplay = row.dataset.developerDisplay || developerText;
        return this._matchesSelectedValues(developerValue, developerDisplay, selectedValues);
      }

      case 'validator': {
        const validatorText = cells[7].textContent.trim();
        const validatorValue = row.dataset.validatorValue || validatorText;
        const validatorDisplay = row.dataset.validatorDisplay || validatorText;
        if (selectedValues.includes('no-validator')) {
          return validatorDisplay === '' || validatorDisplay === 'Sin validator';
        }
        return this._matchesSelectedValues(validatorValue, validatorDisplay, selectedValues);
      }

      case 'sprint': {
        const sprintValue = row.dataset.sprintValue || '';
        const isValidSprintId = sprintValue && globalThis.globalSprintList?.[sprintValue];
        const cardHasNoSprint = !isValidSprintId;
        return this._matchesWithNoOption('no-sprint', selectedValues, cardHasNoSprint, sprintValue);
      }

      case 'epic': {
        const epicText = cells[8].textContent.trim();
        const cardHasNoEpic = epicText === '' || epicText === 'Sin épica';
        return this._matchesWithNoOption('no-epic', selectedValues, cardHasNoEpic, epicText);
      }

      default:
        return true;
    }
  }

  /**
   * Helper: Check if card has no epic value
   */
  _cardHasNoEpic(card) {
    const cardEpic = this._getCardEpic(card);
    return !cardEpic || cardEpic.trim() === '' || cardEpic === 'Sin épica' || cardEpic === 'Sin Épica';
  }

  _cardFilterLogic(card, filterId, selectedValues) {
    switch (filterId) {
      case 'status':
        return selectedValues.includes(card.status);

      case 'sprint': {
        const cardHasNoSprint = !card.sprint;
        return this._matchesWithNoOption('no-sprint', selectedValues, cardHasNoSprint, card.sprint);
      }

      case 'epic': {
        const cardEpic = this._getCardEpic(card);
        const cardHasNoEpic = this._cardHasNoEpic(card);
        return this._matchesWithNoOption('no-epic', selectedValues, cardHasNoEpic, cardEpic);
      }

      case 'developer': {
        const developerDisplayValue = this._formatEmailLikeValue(card.developer);
        return this._matchesSelectedValues(card.developer, developerDisplayValue, selectedValues);
      }

      case 'validator': {
        const cardHasNoValidator = !card.validator;
        if (selectedValues.includes('no-validator') && cardHasNoValidator) {
          return true;
        }
        const validatorDisplayValue = this._formatEmailLikeValue(card.validator);
        return this._matchesSelectedValues(card.validator, validatorDisplayValue, selectedValues);
      }

      case 'repositoryLabel': {
        const cardRepoLabel = card.repositoryLabel || this._getDefaultRepositoryLabel();
        return selectedValues.includes(cardRepoLabel);
      }

      default: {
        const cardValue = card[filterId] || card.getAttribute(filterId);
        const formattedValue = this._formatEmailLikeValue(cardValue);
        return this._matchesSelectedValues(cardValue, formattedValue, selectedValues);
      }
    }
  }

  /**
   * Get tooltip HTML for a specific filter. Uses a mapping object for maintainability.
   */
  getTooltipHtml(filterId) {
    const tooltips = {
      status: `
        <div><b>Filtra las tareas por su estado actual en el flujo de trabajo.</b></div>
        <div style='margin: 8px 0 4px 0;'><b>Estados disponibles:</b></div>
        <ul style='padding-left: 18px; margin: 0;'>
          <li><b>TO DO</b>: Tarea pendiente de iniciar</li>
          <li><b>IN PROGRESS</b>: Tarea en proceso de desarrollo</li>
          <li><b>TO VALIDATE</b>: Tarea pendiente de validación</li>
          <li><b>DONE&VALIDATED</b>: Tarea completada y verificada</li>
          <li><b>BLOCKED</b>: Tarea bloqueada por algún impedimento</li>
        </ul>
      `,
      sprint: `
        <div><b>Filtra las tareas por el sprint al que pertenecen.</b></div>
        <div style='margin: 8px 0 4px 0;'><b>Opciones disponibles:</b></div>
        <ul style='padding-left: 18px; margin: 0;'>
          <li><b>Sprints activos</b>: Tareas asignadas a sprints específicos</li>
          <li><b>Sin Sprint</b>: Tareas que no están asignadas a ningún sprint</li>
        </ul>
      `,
      epic: `
        <div><b>Filtra las tareas por la épica a la que pertenecen.</b></div>
        <div style='margin: 8px 0 4px 0;'><b>Opciones disponibles:</b></div>
        <ul style='padding-left: 18px; margin: 0;'>
          <li><b>Épicas activas</b>: Tareas asignadas a épicas específicas</li>
          <li><b>Sin Épica</b>: Tareas que no están asignadas a ninguna épica</li>
        </ul>
      `,
      developer: `<div><b>Filtra las tareas por el desarrollador asignado para su implementación.</b></div>`,
      validator: `<div><b>Filtra las tareas por el stakeholder asignado como validador.</b></div>`,
      repositoryLabel: `<div><b>Filtra las tareas por el repositorio al que pertenecen.</b></div>`
    };

    return tooltips[filterId] || `<div><b>Filtro para ${filterId}</b></div>`;
  }

  // Métodos específicos de TaskFilters para obtener opciones
  async getStatusOptions() {
    const statusListObj = globalThis.statusTasksList || {};
    // Ordenar por valor numérico para mantener el orden correcto
    const statusList = Object.entries(statusListObj)
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);

    // Ensure Reopened is available if Done&Validated exists (task workflow)
    if (statusList.includes('Done&Validated') && !statusList.includes('Reopened')) {
      statusList.push('Reopened');
    }

    const options = statusList.map(status => ({
      value: status,
      label: status
    }));
    return options;
  }

  async getEpicOptions() {
    try {
      let epics = [];
      const selectedYear = this._getSelectedYear();

      if (globalThis.globalEpicList && globalThis.globalEpicList.length > 0) {
        epics = globalThis.globalEpicList.map(epic => ({
          id: epic.id,
          title: epic.name || epic.title || epic.id,
          year: epic.year
        }));
      } else if (globalThis.appController?.getFirebaseService) {
        try {
          const projectId = globalThis.appController.getCurrentProjectId();
          const firebaseService = globalThis.appController.getFirebaseService();
          const epicData = await firebaseService.getCards(projectId, 'epics');
          epics = Object.entries(epicData || {}).map(([id, epic]) => ({
            id: epic.cardId || id,
            title: epic.title || epic.name || id,
            year: epic.year
          }));
        } catch (firebaseError) {
          // Silently ignore - will fallback to DOM
        }
      }

      if (epics.length === 0) {
        const epicCards = document.querySelectorAll('epic-card');
        epics = Array.from(epicCards).map(card => ({
          id: card.cardId || card.id || card.getAttribute('card-id'),
          title: card.title || card.textContent.trim(),
          year: card.year
        })).filter(epic => epic.id && epic.title);
      }

      // Filtrar épicas por año: mostrar si year === selectedYear O si no tiene year (genérica)
      const filteredEpics = epics.filter(epic => !epic.year || epic.year === selectedYear);

      const options = filteredEpics.map(epic => ({
        value: epic.id,
        label: epic.title || epic.name || epic.id
      }));

      options.unshift({
        value: 'no-epic',
        label: 'Sin Épica'
      });

      return options;
    } catch (error) {
      return [{
        value: 'no-epic',
        label: 'Sin Épica'
      }];
    }
  }

  async _applyDefaultSprintFilter() {
    if (this._defaultSprintApplied) return;

    // Check if there are filters in URL - don't apply default if user has URL filters
    if (this._hasUrlFilters()) {
      this._defaultSprintApplied = true;
      return;
    }

    const hasUserSelection = Array.isArray(this.currentFilters?.sprint) && this.currentFilters.sprint.length > 0;
    if (hasUserSelection) {
      this._defaultSprintApplied = true;
      return;
    }

    const currentSprintId = this._findCurrentSprintId();
    if (!currentSprintId) {
      console.warn('[TaskFilters] No current sprint found for automatic filter');
      this._defaultSprintApplied = true; // Mark as done even if no sprint found
      return;
    }

    this._defaultSprintApplied = true;
    console.warn('[TaskFilters] Auto-applying sprint filter:', currentSprintId);

    await this.updateComplete;
    const sprintSelect = this.shadowRoot?.querySelector('#filter-sprint');
    if (sprintSelect) {
      sprintSelect.selectedValues = [currentSprintId];
      sprintSelect.requestUpdate();
    }

    this._handleFilterChange('sprint', [currentSprintId]);
  }

  _findCurrentSprintId() {
    const sprintList = globalThis.globalSprintList || {};
    const today = new Date();
    const selectedYear = this._getSelectedYear();

    const parseDate = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const candidates = Object.entries(sprintList)
      .filter(([id, sprint]) => {
        // Filtrar por año seleccionado
        if (!sprint.year) return true; // Compatibilidad pre-migración
        return sprint.year === selectedYear;
      })
      .map(([id, sprint]) => {
        const start = parseDate(sprint.startDate || sprint.start || sprint.start_date);
        const end = parseDate(sprint.endDate || sprint.estimatedEndDate || sprint.end || sprint.end_date);
        return { id, start, end };
      })
      .filter(({ start, end }) => start && end);

    const current = candidates
      .filter(({ start, end }) => start <= today && today <= end)
      .sort((a, b) => b.end - a.end);

    if (current.length > 0) {
      return current[0].id;
    }

    const past = candidates
      .filter(({ end }) => end < today)
      .sort((a, b) => b.end - a.end);

    return past.length > 0 ? past[0].id : null;
  }

  /**
   * Get selected year from localStorage
   * @returns {number} The selected year
   */
  _getSelectedYear() {
    const savedYear = localStorage.getItem('selectedYear');
    return savedYear ? Number(savedYear) : new Date().getFullYear();
  }

  _getCardEpic(card) {
    let cardEpic = card.epic || card.epicId || card.getAttribute('epic') || card.getAttribute('epic-id');

    if (card.selectedEpicId) {
      if (typeof card.selectedEpicId === 'string') {
        cardEpic = card.selectedEpicId;
      } else if (typeof card.selectedEpicId === 'function') {
        try {
          cardEpic = card.selectedEpicId();
        } catch (e) {
          // Keep original value
        }
      }
    }

    return cardEpic;
  }

  _formatEmailLikeValue(value) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      // Check for unassigned developer values
      if (APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(lower) ||
          APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(value)) {
        return APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES;
      }
      if (lower === 'sin creador') {
        return 'Sin creador';
      }
    }

    const relMap = globalThis.globalRelEmailUser || {};
    if (relMap[value]) {
      return relMap[value];
    }

    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
    for (const [, name] of Object.entries(relMap)) {
      if (name && name.trim().toLowerCase() === normalized) {
        return name;
      }
    }

    if (typeof value === 'string' && value.includes('@')) {
      const local = value.split('@')[0] || value;
      let cleaned = local.replaceAll(/#ext#/gi, '');
      cleaned = cleaned.replaceAll(/[._-]+/g, ' ');
      cleaned = cleaned.replaceAll(/\s+/g, ' ').trim();
      if (!cleaned) {
        return value;
      }
      return cleaned.split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

    return value;
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

  /**
   * Override clearAllFilters to also reset the default sprint filter flag.
   * This ensures that when the user explicitly clears all filters,
   * the sprint filter won't be re-applied automatically.
   */
  clearAllFilters() {
    // Reset the flag so the default sprint filter won't be applied automatically
    this._defaultSprintApplied = true; // Keep true to prevent re-applying default
    super.clearAllFilters();
  }
}

customElements.define('task-filters', TaskFilters);

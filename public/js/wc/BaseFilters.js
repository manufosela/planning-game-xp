import { LitElement, html } from 'lit';
import '@manufosela/multi-select';
import { unsafeHTML } from 'https://unpkg.com/lit@2.8.0/directives/unsafe-html.js?module';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { URLStateManager } from '../utils/url-utils.js';

/**
 * Clase base abstracta para componentes de filtros.
 * Proporciona funcionalidad común para BugFilters y TaskFilters.
 */
export class BaseFilters extends LitElement {
  static get properties() {
    return {
      targetSelector: { type: String, attribute: 'target-selector' },
      cardSelector: { type: String, attribute: 'card-selector' },
      currentFilters: { type: Object, state: true },
      filterConfigs: { type: Array, state: true },
      resultsCount: { type: Object, state: true }
    };
  }

  constructor() {
    super();
    this.targetSelector = '';
    this.cardSelector = '';
    this.currentFilters = {};
    this.filterConfigs = [];
    this.resultsCount = { visible: 0, total: 0 };
    this._isInitialized = false;
    this._yearChangedHandler = null;

    // Las subclases deben definir defaultConfigs
    this.defaultConfigs = {};
  }

  connectedCallback() {
    super.connectedCallback();

    if (this._isInitialized) {
      return;
    }

    this._searchActive = false; // Track if search is active

    // Escuchar cambios de año para refrescar opciones de sprint
    this._yearChangedHandler = () => this._handleYearChanged();
    document.addEventListener('year-changed', this._yearChangedHandler);

    // Listen for search state changes
    this._searchQueryHandler = (e) => {
      const { query } = e.detail || {};
      this._searchActive = !!(query && query.trim());
    };
    document.addEventListener('search-query-changed', this._searchQueryHandler);
  }

  /**
   * Called after the first render. Use this instead of setTimeout
   * to ensure the component is fully rendered before loading filter options.
   */
  async firstUpdated() {
    if (this._isInitialized) {
      return;
    }

    this._isInitialized = true;
    await this._loadFilterOptions();

    // Restore filters from URL after options are loaded
    await this._restoreFiltersFromUrl();

    this.requestUpdate();
  }

  /**
   * Restore filters from URL state
   * Called after filter options are loaded to ensure selectors exist
   */
  async _restoreFiltersFromUrl() {
    const urlState = URLStateManager.getState();
    if (!urlState.filters || Object.keys(urlState.filters).length === 0) {
      return;
    }

    // Wait for component to be fully rendered
    await this.updateComplete;

    // Apply each filter from URL
    for (const [filterId, values] of Object.entries(urlState.filters)) {
      if (Array.isArray(values) && values.length > 0) {
        // Update internal state
        this.currentFilters[filterId] = values;

        // Update the multi-select UI
        const multiSelect = this.shadowRoot?.querySelector(`#filter-${filterId}`);
        if (multiSelect) {
          multiSelect.selectedValues = values;
        }
      }
    }

    // Apply the restored filters
    if (this.hasActiveFilters) {
      this.applyFilters();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._yearChangedHandler) {
      document.removeEventListener('year-changed', this._yearChangedHandler);
      this._yearChangedHandler = null;
    }
    if (this._searchQueryHandler) {
      document.removeEventListener('search-query-changed', this._searchQueryHandler);
      this._searchQueryHandler = null;
    }
  }

  /**
   * Handle year change event - refresh sprint and epic options
   * Clears sprint filter because sprints from one year don't apply to another year
   * Epic filter is NOT cleared because generic epics (without year) are always shown
   */
  async _handleYearChanged() {
    // Refresh sprint options and clear filter
    const sprintConfig = this.filterConfigs.find(c => c.id === 'sprint');
    if (sprintConfig && sprintConfig.dataSource) {
      try {
        const newOptions = await sprintConfig.dataSource();
        sprintConfig.options = newOptions;

        // Always clear sprint filter when year changes
        if (this.currentFilters.sprint && this.currentFilters.sprint.length > 0) {
          delete this.currentFilters.sprint;
          const sprintSelect = this.shadowRoot?.querySelector('#filter-sprint');
          if (sprintSelect) {
            sprintSelect.selectedValues = [];
          }
        }
      } catch (error) {
        // Ignore error
      }
    }

    // Refresh epic options (but don't clear filter - generic epics are always shown)
    const epicConfig = this.filterConfigs.find(c => c.id === 'epic');
    if (epicConfig && epicConfig.dataSource) {
      try {
        const newOptions = await epicConfig.dataSource();
        epicConfig.options = newOptions;

        // Clear epic filter only if selected epic is not in new options
        if (this.currentFilters.epic && this.currentFilters.epic.length > 0) {
          const validValues = newOptions.map(opt => opt.value);
          const hasInvalid = this.currentFilters.epic.some(v => !validValues.includes(v));
          if (hasInvalid) {
            delete this.currentFilters.epic;
            const epicSelect = this.shadowRoot?.querySelector('#filter-epic');
            if (epicSelect) {
              epicSelect.selectedValues = [];
            }
          }
        }
      } catch (error) {
        // Ignore error
      }
    }

    this.requestUpdate();
    this.applyFilters();
  }

  async _loadFilterOptions() {
for (const config of this.filterConfigs) {
      if (config.dataSource && typeof config.dataSource === 'function') {
        try {
const options = await config.dataSource();
          config.options = options;
          await this.updateComplete;
          const multiSelect = this.shadowRoot.querySelector(`multi-select[id*="${config.id}"]`);
          if (multiSelect) {
            multiSelect.options = options;
            multiSelect.requestUpdate();
          }
        } catch (error) {
          config.options = [];
        }
      } else {
        config.options = [];
      }
    }
this.requestUpdate();
  }

  _handleFilterChange(filterId, selectedValues) {
    // Crear nueva referencia para que Lit detecte el cambio
    this.currentFilters = {
      ...this.currentFilters,
      [filterId]: selectedValues
    };
    this.applyFilters();

    // Update URL with current filters (use replaceState to avoid cluttering history)
    this._syncFiltersToUrl();

    this.dispatchEvent(new CustomEvent('filters-changed', {
      detail: {
        filterId,
        selectedValues,
        allFilters: { ...this.currentFilters }
      },
      bubbles: true
    }));
  }

  getCurrentFilters() {
    return { ...this.currentFilters };
  }

  applyFilters(filters) {
    // Don't apply DOM filters when search is active (search handles its own filtering)
    if (this._searchActive) {
      return;
    }

    if (filters) {
      this.currentFilters = { ...filters };
      // Sync multi-select components with the new filter values
      this._syncMultiSelectsWithFilters(filters);
    }

    if (!this.targetSelector) {
return;
    }

    const container = document.querySelector(this.targetSelector);
    if (!container) {
return;
    }

    const isTableView = this._isTableView(container);
    const elements = this._getElements(container, isTableView);

    if (isTableView && elements.length === 0) {
return;
    }

    let visibleCount = 0;

    elements.forEach(element => {
      const shouldShow = this._shouldShowElement(element, isTableView);
      element.style.display = shouldShow ? '' : 'none';
      if (shouldShow) visibleCount++;
    });

    this.resultsCount = { visible: visibleCount, total: elements.length };
    this.requestUpdate();
}

  _isTableView(container) {
    return container.classList.contains('table-view') ||
      this.dataset.view === 'table';
  }

  // Las subclases deben sobrescribir este método
  _getElements(container, isTableView) {
    throw new Error('_getElements debe ser implementado por la subclase');
  }

  _shouldShowElement(element, isTableView) {
    for (const [filterId, selectedValues] of Object.entries(this.currentFilters)) {
      if (!selectedValues || selectedValues.length === 0) continue;

      const config = this.filterConfigs.find(c => c.id === filterId);
      if (!config) continue;

      if (config.filterFunction && typeof config.filterFunction === 'function') {
        if (!config.filterFunction(element, selectedValues)) {
          return false;
        }
        continue;
      }

      if (!this._defaultFilterLogic(element, filterId, selectedValues, isTableView)) {
        return false;
      }
    }
    return true;
  }

  _defaultFilterLogic(element, filterId, selectedValues, isTableView) {
    if (isTableView) {
      return this._tableFilterLogic(element, filterId, selectedValues);
    }
    return this._cardFilterLogic(element, filterId, selectedValues);
  }

  // Las subclases deben sobrescribir estos métodos
  _tableFilterLogic(row, filterId, selectedValues) {
    throw new Error('_tableFilterLogic debe ser implementado por la subclase');
  }

  _cardFilterLogic(card, filterId, selectedValues) {
    throw new Error('_cardFilterLogic debe ser implementado por la subclase');
  }

  clearAllFilters() {
    this.filterConfigs.forEach(config => {
      this.currentFilters[config.id] = [];
    });

    this.shadowRoot.querySelectorAll('multi-select').forEach(multiSelect => {
      multiSelect.selectedValues = [];
    });

    this.applyFilters();

    // Clear filters from URL
    this._syncFiltersToUrl();

    this.dispatchEvent(new CustomEvent('filters-cleared', {
      detail: { allFilters: { ...this.currentFilters } },
      bubbles: true
    }));
  }

  /**
   * Sync current filters to URL using URLStateManager
   * Uses replaceState to avoid cluttering browser history
   */
  _syncFiltersToUrl() {
    URLStateManager.updateState({
      filters: this.hasActiveFilters ? this.currentFilters : null
    }, true); // true = use replaceState
  }

  /**
   * Check if URL contains filter parameters
   * Used by subclasses to skip default filters when URL has user-specified filters
   * @returns {boolean} True if URL has filters
   */
  _hasUrlFilters() {
    const urlState = URLStateManager.getState();
    return !!(urlState.filters && Object.keys(urlState.filters).length > 0);
  }

  get hasActiveFilters() {
    return Object.values(this.currentFilters).some(values => values && values.length > 0);
  }

  forceApplyFilters() {
this.applyFilters();
  }

  /**
   * Sync multi-select components with filter values from URL
   * This is needed because the external multi-select component may not respond to property changes via Lit
   * @param {Object} filters - Filter values to sync { filterId: [values] }
   */
  _syncMultiSelectsWithFilters(filters) {
    // Wait for shadow DOM to be ready
    this.updateComplete.then(() => {
      Object.entries(filters).forEach(([filterId, values]) => {
        const multiSelect = this.shadowRoot?.querySelector(`#filter-${filterId}`);
        if (multiSelect) {
          multiSelect.selectedValues = Array.isArray(values) ? values : [values];
          if (typeof multiSelect.requestUpdate === 'function') {
            multiSelect.requestUpdate();
          }
        }
      });
      this.requestUpdate();
    });
  }

  /**
   * Update the visible/total count from an external source (e.g., table-view-manager).
   * This is used when data-level filtering is done externally.
   * @param {number} visible - Number of visible/filtered items
   * @param {number} total - Total number of items (optional, defaults to visible if not provided)
   */
  updateVisibleCount(visible, total) {
    this.resultsCount = {
      visible: visible,
      total: total !== undefined ? total : visible
    };
    this.requestUpdate();
  }

  // Las subclases deben sobrescribir este método
  getTooltipHtml(filterId) {
    return `<div><b>Filtro para ${filterId}</b></div>`;
  }

  render() {
    return html`
      <div class="filters-wrapper">
        <details open>
          <summary><span class="chevron" aria-hidden="true"></span><span class="summary-title">Filtros</span></summary>
          <div class="filters-container">
            ${this.filterConfigs.map(config => {
              const hasValue = (this.currentFilters[config.id] || []).length > 0;
              return html`
              <div class="filter-group ${hasValue ? 'filter-active' : ''}">
                <label class="filter-label">
                  ${config.label || config.id}
                  <div class="tooltip">
                    <span class="info-icon">ℹ️</span>
                    <span class="tooltiptext">${unsafeHTML(this.getTooltipHtml(config.id))}</span>
                  </div>
                </label>
                <multi-select
                  id="filter-${config.id}"
                  .options=${config.options || []}
                  .selectedValues=${this.currentFilters[config.id] || []}
                  placeholder=${config.placeholder || `Filtrar por ${config.label || config.id}`}
                  @change=${(e) => this._handleFilterChange(config.id, e.detail.selectedValues)}
                ></multi-select>
              </div>
            `})}

            <div class="controls-section">
              <div class="results-counter">
                ${this.resultsCount.visible} de ${this.resultsCount.total}
              </div>
              <button
                class="clear-button"
                ?disabled=${!this.hasActiveFilters}
                @click=${this.clearAllFilters}
              >
                🗑️ Limpiar
              </button>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  // Métodos comunes para obtener opciones de developer
  async getDeveloperOptions() {
    await entityDirectoryService.waitForInit();

    const projectId = globalThis.appController?.getCurrentProjectId();
    if (!projectId) {
return [];
    }

    const firebaseService = globalThis.appController.getFirebaseService();
    const projectDevelopers = await firebaseService.getDeveloperList(projectId);

    if (!projectDevelopers || (Array.isArray(projectDevelopers) && projectDevelopers.length === 0)) {
      return [{ value: APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE, label: APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES }];
    }
const developerEntries = Array.isArray(projectDevelopers)
      ? projectDevelopers
      : Object.values(projectDevelopers || {});

    // Use a Map to deduplicate by developerId
    const seenIds = new Map();

    developerEntries.forEach((entry) => {
      if (!entry) return;

      let developerId = null;

      if (typeof entry === 'string') {
        // Accept dev_XXX IDs directly without resolution
        developerId = entry.startsWith('dev_') ? entry : entityDirectoryService.resolveDeveloperId(entry);
        if (!developerId) {
          console.warn('[BaseFilters] Could not resolve developer reference:', entry);
          return;
        }
      } else if (typeof entry === 'object') {
        // For objects, accept dev_XXX IDs directly or resolve
        if (entry.id?.startsWith('dev_')) {
          developerId = entry.id;
        } else {
          developerId = entry.id ? entityDirectoryService.resolveDeveloperId(entry.id) : null;
        }
        if (!developerId && entry.email) {
          developerId = entityDirectoryService.resolveDeveloperId(entry.email);
        }
        if (!developerId) {
          console.warn('[BaseFilters] Developer entry without valid id:', entry);
          return;
        }
      } else {
        console.warn('[BaseFilters] Invalid developer entry type:', typeof entry, entry);
        return;
      }

      // Get display name from directory (single source of truth)
      const displayName = entityDirectoryService.getDeveloperDisplayName(developerId);
      if (!displayName) {
        console.warn('[BaseFilters] Developer not found in directory:', developerId);
        return;
      }

      // Only add if not already seen (deduplication)
      if (!seenIds.has(developerId)) {
        seenIds.set(developerId, { value: developerId, label: displayName });
      }
    });

    const options = Array.from(seenIds.values());
    options.sort((a, b) => a.label.localeCompare(b.label));
    options.unshift({ value: APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE, label: APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES });
    return options;
  }

  async getValidatorOptions() {
    await entityDirectoryService.waitForInit();

    const projectId = globalThis.appController?.getCurrentProjectId();
    if (!projectId) {
return [{ value: 'no-validator', label: 'Sin validator' }];
    }

    const firebaseService = globalThis.appController.getFirebaseService();
    const projectStakeholders = await firebaseService.getStakeholders(projectId);

    if (!projectStakeholders || (Array.isArray(projectStakeholders) && projectStakeholders.length === 0)) {
return [{ value: 'no-validator', label: 'Sin validator' }];
    }
const stakeholderEntries = Array.isArray(projectStakeholders)
      ? projectStakeholders
      : Object.values(projectStakeholders || {});

    // Use a Map to deduplicate by stakeholderId
    const seenIds = new Map();

    stakeholderEntries.forEach((entry) => {
      if (!entry) return;

      let stakeholderId = null;

      if (typeof entry === 'string') {
        // Accept stk_XXX IDs directly without resolution
        stakeholderId = entry.startsWith('stk_') ? entry : entityDirectoryService.resolveStakeholderId(entry);
        if (!stakeholderId) {
          console.warn('[BaseFilters] Could not resolve stakeholder reference:', entry);
          return;
        }
      } else if (typeof entry === 'object') {
        // For objects, accept stk_XXX IDs directly or resolve
        if (entry.id?.startsWith('stk_')) {
          stakeholderId = entry.id;
        } else {
          stakeholderId = entry.id ? entityDirectoryService.resolveStakeholderId(entry.id) : null;
        }
        if (!stakeholderId && entry.email) {
          stakeholderId = entityDirectoryService.resolveStakeholderId(entry.email);
        }
        if (!stakeholderId) {
          console.warn('[BaseFilters] Stakeholder entry without valid id:', entry);
          return;
        }
      } else {
        console.warn('[BaseFilters] Invalid stakeholder entry type:', typeof entry, entry);
        return;
      }

      // Get display name from directory (single source of truth)
      const displayName = entityDirectoryService.getStakeholderDisplayName(stakeholderId);
      if (!displayName) {
        console.warn('[BaseFilters] Stakeholder not found in directory:', stakeholderId);
        return;
      }

      // Only add if not already seen (deduplication)
      if (!seenIds.has(stakeholderId)) {
        seenIds.set(stakeholderId, { value: stakeholderId, label: displayName });
      }
    });

    const options = Array.from(seenIds.values());
    options.sort((a, b) => a.label.localeCompare(b.label));
    options.unshift({ value: 'no-validator', label: 'Sin validator' });
return options;
  }

  /**
   * Get selected year from localStorage
   * @returns {number} The selected year
   */
  _getSelectedYear() {
    const savedYear = localStorage.getItem('selectedYear');
    return savedYear ? Number(savedYear) : new Date().getFullYear();
  }

  async getSprintOptions() {
    const sprintList = globalThis.globalSprintList || {};
    const selectedYear = this._getSelectedYear();
    // Filtrar sprints por año seleccionado
    const options = Object.entries(sprintList)
      .filter(([id, sprint]) => {
        // Si el sprint no tiene year, mostrarlo (compatibilidad pre-migración)
        if (!sprint.year) return true;
        // Comparar como números para evitar problemas de tipos (string vs number)
        return Number(sprint.year) === selectedYear;
      })
      // Ordenar por startDate descendente (más recientes primero)
      .sort((a, b) => {
        const sprintA = a[1];
        const sprintB = b[1];
        // Usar startDate si existe, sino usar el título/nombre
        const dateA = sprintA.startDate ? new Date(sprintA.startDate) : null;
        const dateB = sprintB.startDate ? new Date(sprintB.startDate) : null;

        if (dateA && dateB) {
          return dateB - dateA; // Descendente
        }
        if (dateA) return -1; // Los que tienen fecha van primero
        if (dateB) return 1;

        // Sin fechas, ordenar por título/nombre descendente
        const labelA = (sprintA.title || sprintA.name || a[0]).toLowerCase();
        const labelB = (sprintB.title || sprintB.name || b[0]).toLowerCase();
        return labelB.localeCompare(labelA);
      })
      .map(([id, sprint]) => ({
        value: id,
        label: sprint.title || sprint.name || id
      }));

    options.unshift({
      value: 'no-sprint',
      label: 'Sin Sprint'
    });
    return options;
  }
}

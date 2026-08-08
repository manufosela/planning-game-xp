import { LitElement, html } from 'lit';
import '@manufosela/multi-select';
import { unifiedFiltersStyles } from './unified-filters-styles.js';
import { getUnifiedFilterService } from '../services/unified-filter-service.js';

/**
 * UnifiedFilters - Unified filter component for all card types
 *
 * This component provides a UI for filtering cards. It works with the
 * UnifiedFilterService to manage filter state and apply filters to DATA
 * (not DOM elements).
 *
 * Usage:
 *   <unified-filters
 *     card-type="task"
 *     project-id="C4D"
 *     @filters-changed="${this._handleFiltersChanged}">
 *   </unified-filters>
 *
 * The component emits 'filters-changed' events when filters change.
 * Parent components should listen for this event and re-render with
 * filtered data from the service.
 */
export class UnifiedFilters extends LitElement {
  static get properties() {
    return {
      cardType: { type: String, attribute: 'card-type' },
      projectId: { type: String, attribute: 'project-id' },
      year: { type: Number },
      filterOptions: { type: Object, state: true },
      resultsCount: { type: Object, state: true },
      isLoading: { type: Boolean, state: true },
      isOpen: { type: Boolean, state: true }
    };
  }

  static get styles() {
    return unifiedFiltersStyles;
  }

  constructor() {
    super();
    this.cardType = 'task';
    this.projectId = '';
    this.year = new Date().getFullYear();
    this.filterOptions = {};
    this.resultsCount = { visible: 0, total: 0 };
    this.isLoading = true;
    this.isOpen = true;

    this._service = getUnifiedFilterService();
    this._unsubscribe = null;
    this._yearChangedHandler = null;
  }

  connectedCallback() {
    super.connectedCallback();

    // Subscribe to filter changes from the service
    if (this.projectId && this.cardType) {
      this._subscribeToChanges();
    }

    // Listen for year changes
    this._yearChangedHandler = (e) => this._handleYearChanged(e);
    window.addEventListener('year-changed', this._yearChangedHandler);

    // Load filter options
    this._loadOptions();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    if (this._yearChangedHandler) {
      window.removeEventListener('year-changed', this._yearChangedHandler);
      this._yearChangedHandler = null;
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('projectId') || changedProperties.has('cardType')) {
      this._subscribeToChanges();
      this._loadOptions();
    }

    if (changedProperties.has('year')) {
      this._refreshYearDependentOptions();
    }
  }

  /**
   * Subscribe to filter changes from the service
   */
  _subscribeToChanges() {
    if (this._unsubscribe) {
      this._unsubscribe();
    }

    if (this.projectId && this.cardType) {
      this._unsubscribe = this._service.subscribe(
        this.projectId,
        this.cardType,
        () => this.requestUpdate()
      );
    }
  }

  /**
   * Load filter options from the service
   */
  async _loadOptions() {
    if (!this.cardType) {
      return;
    }

    this.isLoading = true;

    try {
      this.filterOptions = await this._service.getAllFilterOptions(this.cardType, this.year);

      // Apply default values if no filters are set
      this._service.applyDefaultValues(this.projectId, this.cardType);
    } catch (error) {
      console.error('UnifiedFilters: Error loading options', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Handle year change event
   */
  _handleYearChanged(event) {
    this.year = event.detail?.year || new Date().getFullYear();
    this._refreshYearDependentOptions();
  }

  /**
   * Refresh year-dependent filter options
   */
  async _refreshYearDependentOptions() {
    const config = this._service.getConfig(this.cardType);
    if (!config) {
      return;
    }

    for (const [filterId, filterConfig] of Object.entries(config.filters)) {
      if (filterConfig.yearDependent) {
        this.filterOptions[filterId] = await this._service.getFilterOptions(
          this.cardType,
          filterId,
          this.year
        );
      }
    }

    this.requestUpdate();
  }

  /**
   * Handle filter selection change
   */
  _handleFilterChange(filterId, event) {
    const selectedValues = event.detail?.selectedValues || [];
    this._service.setFilter(this.projectId, this.cardType, filterId, selectedValues);

    // Dispatch event for parent components
    this.dispatchEvent(new CustomEvent('filters-changed', {
      bubbles: true,
      composed: true,
      detail: {
        projectId: this.projectId,
        cardType: this.cardType,
        filters: this._service.getActiveFilters(this.projectId, this.cardType)
      }
    }));
  }

  /**
   * Clear all filters
   */
  _handleClearAll() {
    this._service.clearAllFilters(this.projectId, this.cardType);

    // Clear all multi-select components
    const selects = this.shadowRoot.querySelectorAll('multi-select');
    selects.forEach(select => {
      select.selectedValues = [];
    });

    // Dispatch event
    this.dispatchEvent(new CustomEvent('filters-cleared', {
      bubbles: true,
      composed: true,
      detail: {
        projectId: this.projectId,
        cardType: this.cardType
      }
    }));
  }

  /**
   * Update results count (called by parent component)
   */
  setResultsCount(visible, total) {
    this.resultsCount = { visible, total };
  }

  /**
   * Get display order from config
   */
  _getDisplayOrder() {
    return this._service.getDisplayOrder(this.cardType);
  }

  /**
   * Get current filter values
   */
  _getCurrentFilters() {
    return this._service.getActiveFilters(this.projectId, this.cardType);
  }

  /**
   * Count active filters
   */
  _getActiveFilterCount() {
    const filters = this._getCurrentFilters();
    return Object.values(filters).filter(v => v && v.length > 0).length;
  }

  /**
   * Get filter config
   */
  _getFilterConfig(filterId) {
    const config = this._service.getConfig(this.cardType);
    return config?.filters[filterId];
  }

  render() {
    if (this.isLoading) {
      return html`
        <div class="filters-wrapper">
          <details open>
            <summary>
              <span class="chevron"></span>
              Filtros
            </summary>
            <div class="loading">Cargando filtros...</div>
          </details>
        </div>
      `;
    }

    const displayOrder = this._getDisplayOrder();
    const currentFilters = this._getCurrentFilters();
    const activeCount = this._getActiveFilterCount();

    return html`
      <div class="filters-wrapper">
        <details ?open=${this.isOpen} @toggle=${(e) => this.isOpen = e.target.open}>
          <summary>
            <span class="chevron"></span>
            Filtros
            ${activeCount > 0 ? html`<span class="active-filters-badge">${activeCount}</span>` : ''}
            <span class="results-count">
              ${this.resultsCount.visible} de ${this.resultsCount.total}
            </span>
          </summary>

          <div class="filters-container">
            ${displayOrder.map(filterId => this._renderFilter(filterId, currentFilters[filterId] || []))}
          </div>

          ${activeCount > 0 ? html`
            <div class="actions-container">
              <button class="clear-btn" @click=${this._handleClearAll}>
                Limpiar filtros
              </button>
            </div>
          ` : ''}
        </details>
      </div>
    `;
  }

  /**
   * Render a single filter
   */
  _renderFilter(filterId, selectedValues) {
    const config = this._getFilterConfig(filterId);
    const options = this.filterOptions[filterId] || [];

    if (!config) {
      return '';
    }

    return html`
      <div class="filter-group">
        <label class="filter-label">${config.label}</label>
        <multi-select
          id="filter-${filterId}"
          .options=${options.map(opt => ({
            value: opt.value,
            label: opt.label
          }))}
          .selectedValues=${selectedValues}
          placeholder="${config.placeholder || `Filtrar por ${config.label}`}"
          @change=${(e) => this._handleFilterChange(filterId, e)}
        ></multi-select>
      </div>
    `;
  }
}

customElements.define('unified-filters', UnifiedFilters);

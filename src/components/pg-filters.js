/**
 * Unified filter bar component.
 * Reads/writes the filters signal from store.js reactively.
 *
 * @element pg-filters
 * @property {Array} developers - Available developers for filter dropdown
 * @property {Array} sprints - Available sprints for filter dropdown
 * @property {Array} epics - Available epics for filter dropdown
 * @property {Array} tags - Available tags with colors
 * @property {'and'|'or'} tagMode - Tag filter matching mode
 * @fires filters-change - Dispatched when any filter changes, detail: { filters }
 * @fires tag-mode-change - Dispatched when tag mode toggles, detail: { mode: 'and'|'or' }
 */

import { LitElement, html, css, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { filters as filtersSignal, setFilters, resetFilters } from '../lib/store.js';
import { getStatusesForType } from '../lib/filters.js';
import './pg-select.js';

class PgFilters extends SignalWatcher(LitElement) {
  static properties = {
    developers: { type: Array },
    sprints: { type: Array },
    epics: { type: Array },
    tags: { type: Array },
    tagMode: { type: String, attribute: 'tag-mode' },
    _searchValue: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .filter-bar {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-sm, 0.5rem) 0;
    }

    .filter-item {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 0.125rem);
      min-width: 8rem;
    }

    .filter-item.search {
      flex: 1;
      min-width: 10rem;
    }

    .filter-label {
      font-size: 0.625rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
    }

    /* Search input */
    .search-input {
      width: 100%;
      height: 2.25rem;
      padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
      padding-left: 2rem;
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      transition: border-color var(--transition-fast);
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: var(--color-text-muted, #94a3b8);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--color-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    .search-wrapper {
      position: relative;
    }

    .search-icon {
      position: absolute;
      left: var(--space-sm, 0.5rem);
      top: 50%;
      transform: translateY(-50%);
      width: 0.875rem;
      height: 0.875rem;
      color: var(--color-text-muted, #94a3b8);
      pointer-events: none;
    }

    /* Tag mode toggle */
    .tag-mode-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 2.25rem;
      padding: 0 var(--space-sm, 0.5rem);
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-text-muted, #94a3b8);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast);
      align-self: flex-end;
    }

    .tag-mode-btn:hover {
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text-secondary, #64748b);
    }

    .tag-mode-btn.active {
      background: var(--color-primary-subtle, #eef2ff);
      color: var(--color-primary, #4f46e5);
      border-color: color-mix(in srgb, var(--color-primary) 25%, transparent);
    }

    /* Actions */
    .filter-actions {
      display: flex;
      align-items: flex-end;
      gap: var(--space-xs, 0.25rem);
      margin-left: auto;
    }

    .clear-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2xs, 0.125rem);
      height: 2.25rem;
      padding: 0 var(--space-md, 0.75rem);
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted, #94a3b8);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-md, 0.5rem);
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .clear-btn:hover {
      background: var(--color-surface-sunken, #f1f5f9);
      color: var(--color-text-secondary, #64748b);
    }

    .active-count {
      font-size: 0.625rem;
      font-weight: var(--font-weight-semibold, 600);
      background: var(--color-primary, #4f46e5);
      color: var(--color-primary-text, #fff);
      border-radius: var(--radius-full, 9999px);
      min-width: 1rem;
      height: 1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      padding: 0 0.1875rem;
    }

    @media (max-width: 640px) {
      .filter-bar {
        flex-direction: column;
      }

      .filter-item {
        min-width: 100%;
      }
    }
  `;

  constructor() {
    super();
    /** @type {Array<{id: string, name: string}>} */
    this.developers = [];
    /** @type {Array<{cardId: string, title: string}>} */
    this.sprints = [];
    /** @type {Array<{cardId: string, title: string}>} */
    this.epics = [];
    /** @type {import('../lib/types.d.ts').TagRegistryEntry[]} */
    this.tags = [];
    /** @type {'and'|'or'} */
    this.tagMode = 'or';
    this._searchValue = '';
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._debounceTimer = null;
  }

  /** @returns {number} Number of active (non-default) filters */
  get _activeFilterCount() {
    const f = filtersSignal.get();
    let count = 0;
    if (f.type && f.type !== 'all') count++;
    if (f.status && f.status !== 'all') count++;
    if (f.developer) count++;
    if (f.sprint) count++;
    if (f.epic) count++;
    if (f.tags && f.tags.length > 0) count++;
    if (f.search || f.query) count++;
    return count;
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _typeOptions() {
    return [
      { value: 'all', label: 'All types' },
      { value: 'task', label: 'Tasks' },
      { value: 'bug', label: 'Bugs' },
      { value: 'epic', label: 'Epics' },
      { value: 'sprint', label: 'Sprints' },
      { value: 'proposal', label: 'Proposals' },
      { value: 'qa', label: 'QA' },
    ];
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _statusOptions() {
    const f = filtersSignal.get();
    const statuses = getStatusesForType(f.type);
    return [
      { value: 'all', label: 'All statuses' },
      ...statuses.map((s) => ({ value: s, label: s })),
    ];
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _developerOptions() {
    return [
      { value: '', label: 'All developers' },
      ...this.developers.map((d) => ({ value: d.id, label: d.name })),
    ];
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _sprintOptions() {
    return [
      { value: '', label: 'All sprints' },
      ...this.sprints.map((s) => ({ value: s.cardId, label: s.title || s.cardId })),
    ];
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _epicOptions() {
    return [
      { value: '', label: 'All epics' },
      ...this.epics.map((e) => ({ value: e.cardId, label: e.title || e.cardId })),
    ];
  }

  /** @returns {Array<{value: string, label: string, color?: string}>} */
  get _tagOptions() {
    return this.tags.map((t) => ({ value: t.name, label: t.name, color: t.color }));
  }

  /**
   * @param {string} field
   * @param {CustomEvent} e
   */
  _onFilterChange(field, e) {
    const val = e.detail.value;
    setFilters({ [field]: val || null });
    this._dispatchChange();
  }

  /** @param {InputEvent} e */
  _onSearchInput(e) {
    const val = /** @type {HTMLInputElement} */ (e.target).value;
    this._searchValue = val;

    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      setFilters({ query: val, search: val });
      this._dispatchChange();
    }, 300);
  }

  _toggleTagMode() {
    this.tagMode = this.tagMode === 'or' ? 'and' : 'or';
    this.dispatchEvent(new CustomEvent('tag-mode-change', {
      detail: { mode: this.tagMode },
      bubbles: true,
      composed: true,
    }));
  }

  _clearAll() {
    this._searchValue = '';
    resetFilters();
    this._dispatchChange();
  }

  _dispatchChange() {
    this.dispatchEvent(new CustomEvent('filters-change', {
      detail: { filters: filtersSignal.get() },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const f = filtersSignal.get();
    const activeCount = this._activeFilterCount;

    return html`
      <div class="filter-bar">
        <!-- Type -->
        <div class="filter-item">
          <span class="filter-label">Type</span>
          <pg-select
            .options=${this._typeOptions}
            .value=${f.type ?? 'all'}
            placeholder="All types"
            @change=${(/** @type {CustomEvent} */ e) => this._onFilterChange('type', e)}
          ></pg-select>
        </div>

        <!-- Status -->
        <div class="filter-item">
          <span class="filter-label">Status</span>
          <pg-select
            .options=${this._statusOptions}
            .value=${f.status ?? 'all'}
            placeholder="All statuses"
            @change=${(/** @type {CustomEvent} */ e) => this._onFilterChange('status', e)}
          ></pg-select>
        </div>

        <!-- Developer -->
        <div class="filter-item">
          <span class="filter-label">Developer</span>
          <pg-select
            .options=${this._developerOptions}
            .value=${f.developer ?? ''}
            placeholder="All developers"
            searchable
            @change=${(/** @type {CustomEvent} */ e) => this._onFilterChange('developer', e)}
          ></pg-select>
        </div>

        <!-- Sprint -->
        <div class="filter-item">
          <span class="filter-label">Sprint</span>
          <pg-select
            .options=${this._sprintOptions}
            .value=${f.sprint ?? ''}
            placeholder="All sprints"
            @change=${(/** @type {CustomEvent} */ e) => this._onFilterChange('sprint', e)}
          ></pg-select>
        </div>

        <!-- Epic -->
        <div class="filter-item">
          <span class="filter-label">Epic</span>
          <pg-select
            .options=${this._epicOptions}
            .value=${f.epic ?? ''}
            placeholder="All epics"
            searchable
            @change=${(/** @type {CustomEvent} */ e) => this._onFilterChange('epic', e)}
          ></pg-select>
        </div>

        <!-- Tags -->
        ${this._tagOptions.length > 0 ? html`
          <div class="filter-item">
            <span class="filter-label">Tags</span>
            <pg-select
              .options=${this._tagOptions}
              .value=${f.tags ?? []}
              multiple
              searchable
              placeholder="Filter by tags"
              @change=${(/** @type {CustomEvent} */ e) => this._onFilterChange('tags', e)}
            ></pg-select>
          </div>
          <button
            class="tag-mode-btn ${this.tagMode === 'and' ? 'active' : ''}"
            title="Toggle AND/OR tag matching"
            @click=${this._toggleTagMode}
          >${this.tagMode.toUpperCase()}</button>
        ` : nothing}

        <!-- Search -->
        <div class="filter-item search">
          <span class="filter-label">Search</span>
          <div class="search-wrapper">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              class="search-input"
              type="text"
              placeholder="Search cards..."
              .value=${this._searchValue}
              @input=${this._onSearchInput}
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="filter-actions">
          ${activeCount > 0 ? html`
            <button class="clear-btn" @click=${this._clearAll}>
              Clear
              <span class="active-count">${activeCount}</span>
            </button>
          ` : nothing}
        </div>
      </div>
    `;
  }
}

customElements.define('pg-filters', PgFilters);

export { PgFilters };

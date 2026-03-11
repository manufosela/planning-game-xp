/**
 * Custom dropdown component with search and multi-select.
 *
 * @element pg-select
 * @property {Array<{value: string, label: string, color?: string}>} options
 * @property {string|string[]} value - Current value(s)
 * @property {boolean} multiple - Multi-select mode
 * @property {boolean} searchable - Enable search filtering
 * @property {string} placeholder
 * @fires change - Dispatched with detail: { value: string | string[] }
 */

import { LitElement, html, css, nothing } from 'lit';

class PgSelect extends LitElement {
  static properties = {
    options: { type: Array },
    value: { type: String },
    multiple: { type: Boolean },
    searchable: { type: Boolean },
    placeholder: { type: String },
    disabled: { type: Boolean },
    _open: { state: true },
    _search: { state: true },
    _focusIndex: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      position: relative;
      font-size: 0.8125rem;
    }

    /* Trigger button */
    .trigger {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
      width: 100%;
      min-height: 2.25rem;
      padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      cursor: pointer;
      color: var(--color-text, #0f172a);
      transition: border-color var(--transition-fast, 150ms ease);
    }

    .trigger:hover:not(.disabled) {
      border-color: var(--color-border-strong, #cbd5e1);
    }

    .trigger:focus-within {
      border-color: var(--color-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    .trigger.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .trigger-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .trigger-text.placeholder {
      color: var(--color-text-muted, #94a3b8);
    }

    .trigger-icon {
      flex-shrink: 0;
      width: 1rem;
      height: 1rem;
      color: var(--color-text-muted, #94a3b8);
      transition: transform var(--transition-fast);
    }

    .trigger-icon.open {
      transform: rotate(180deg);
    }

    /* Selected badges (multi-select) */
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2xs, 0.125rem);
      flex: 1;
      min-width: 0;
    }

    .selected-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
      padding: 0.0625rem var(--space-xs, 0.25rem);
      background: var(--color-primary-subtle, #eef2ff);
      color: var(--color-primary, #4f46e5);
      border-radius: var(--radius-sm, 0.25rem);
      font-size: 0.75rem;
      line-height: 1.25rem;
      white-space: nowrap;
    }

    .selected-badge .remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 0.875rem;
      height: 0.875rem;
      border: none;
      background: none;
      color: inherit;
      cursor: pointer;
      padding: 0;
      font-size: 0.75rem;
      opacity: 0.6;
    }

    .selected-badge .remove:hover {
      opacity: 1;
    }

    /* Dropdown */
    .dropdown {
      position: absolute;
      top: calc(100% + var(--space-2xs, 0.125rem));
      left: 0;
      right: 0;
      max-height: 16rem;
      overflow-y: auto;
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      box-shadow: var(--shadow-lg);
      z-index: var(--z-dropdown, 100);
      padding: var(--space-2xs, 0.125rem);
    }

    .dropdown[hidden] {
      display: none;
    }

    /* Search input */
    .search-input {
      display: block;
      width: 100%;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
      font: inherit;
      color: var(--color-text, #0f172a);
      outline: none;
    }

    .search-input::placeholder {
      color: var(--color-text-muted, #94a3b8);
    }

    /* Option items */
    .option {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-sm, 0.25rem);
      cursor: pointer;
      transition: background var(--transition-fast);
      user-select: none;
    }

    .option:hover,
    .option.focused {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    .option.selected {
      color: var(--color-primary, #4f46e5);
      font-weight: var(--font-weight-medium, 500);
    }

    .option .check {
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
      opacity: 0;
    }

    .option.selected .check {
      opacity: 1;
    }

    .option .color-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-full);
      flex-shrink: 0;
    }

    .option .label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .no-results {
      padding: var(--space-lg, 1rem);
      text-align: center;
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.8125rem;
    }
  `;

  constructor() {
    super();
    /** @type {Array<{value: string, label: string, color?: string}>} */
    this.options = [];
    /** @type {string|string[]} */
    this.value = '';
    this.multiple = false;
    this.searchable = false;
    this.placeholder = 'Select...';
    this.disabled = false;
    this._open = false;
    this._search = '';
    this._focusIndex = -1;

    this._handleOutsideClick = (/** @type {MouseEvent} */ e) => {
      if (this._open && !this.contains(/** @type {Node} */ (e.composedPath()[0]))) {
        this._open = false;
        this._search = '';
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._handleOutsideClick, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick, true);
  }

  /** @returns {string[]} */
  get _selectedValues() {
    if (this.multiple) {
      return Array.isArray(this.value) ? this.value : (this.value ? [this.value] : []);
    }
    return this.value ? [/** @type {string} */ (this.value)] : [];
  }

  /** @returns {Array<{value: string, label: string, color?: string}>} */
  get _filteredOptions() {
    if (!this._search) return this.options;
    const s = this._search.toLowerCase();
    return this.options.filter((o) => o.label.toLowerCase().includes(s));
  }

  /** @returns {string} */
  get _displayText() {
    const sel = this._selectedValues;
    if (sel.length === 0) return '';
    if (this.multiple) return '';
    const opt = this.options.find((o) => o.value === sel[0]);
    return opt?.label ?? sel[0];
  }

  _toggle() {
    if (this.disabled) return;
    this._open = !this._open;
    this._focusIndex = -1;
    if (this._open && this.searchable) {
      this.updateComplete.then(() => {
        this.shadowRoot?.querySelector('.search-input')?.focus();
      });
    }
  }

  /** @param {string} val */
  _selectOption(val) {
    if (this.multiple) {
      const current = this._selectedValues;
      const next = current.includes(val)
        ? current.filter((v) => v !== val)
        : [...current, val];
      this.value = next;
    } else {
      this.value = val;
      this._open = false;
      this._search = '';
    }

    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: this.value },
      bubbles: true,
      composed: true,
    }));
  }

  /** @param {string} val */
  _removeBadge(val) {
    if (!this.multiple) return;
    const next = this._selectedValues.filter((v) => v !== val);
    this.value = next;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: this.value },
      bubbles: true,
      composed: true,
    }));
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    const opts = this._filteredOptions;
    if (e.key === 'Escape') {
      this._open = false;
      this._search = '';
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._focusIndex = Math.min(this._focusIndex + 1, opts.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._focusIndex = Math.max(this._focusIndex - 1, 0);
    } else if (e.key === 'Enter' && this._focusIndex >= 0 && this._focusIndex < opts.length) {
      e.preventDefault();
      this._selectOption(opts[this._focusIndex].value);
    }
  }

  render() {
    const selected = this._selectedValues;
    const filtered = this._filteredOptions;
    const hasSelection = selected.length > 0;
    const display = this._displayText;

    return html`
      <div
        class="trigger ${this.disabled ? 'disabled' : ''}"
        @click=${this._toggle}
        @keydown=${this._onKeyDown}
        tabindex="0"
        role="combobox"
        aria-expanded=${this._open}
        aria-haspopup="listbox"
      >
        ${this.multiple && hasSelection
          ? html`
            <div class="badges">
              ${selected.map((v) => {
                const opt = this.options.find((o) => o.value === v);
                return html`
                  <span class="selected-badge">
                    ${opt?.label ?? v}
                    <button class="remove" @click=${(/** @type {Event} */ e) => { e.stopPropagation(); this._removeBadge(v); }}>&times;</button>
                  </span>
                `;
              })}
            </div>
          `
          : html`<span class="trigger-text ${!hasSelection ? 'placeholder' : ''}">${hasSelection ? display : this.placeholder}</span>`
        }
        <svg class="trigger-icon ${this._open ? 'open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      <div class="dropdown" role="listbox" ?hidden=${!this._open}>
        ${this.searchable
          ? html`<input
              class="search-input"
              type="text"
              placeholder="Search..."
              .value=${this._search}
              @input=${(/** @type {InputEvent} */ e) => { this._search = /** @type {HTMLInputElement} */ (e.target).value; this._focusIndex = 0; }}
              @click=${(/** @type {Event} */ e) => e.stopPropagation()}
            />`
          : nothing
        }

        ${filtered.length === 0
          ? html`<div class="no-results">No options found</div>`
          : filtered.map((opt, i) => {
              const isSelected = selected.includes(opt.value);
              return html`
                <div
                  class="option ${isSelected ? 'selected' : ''} ${i === this._focusIndex ? 'focused' : ''}"
                  role="option"
                  aria-selected=${isSelected}
                  @click=${(/** @type {Event} */ e) => { e.stopPropagation(); this._selectOption(opt.value); }}
                >
                  <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  ${opt.color ? html`<span class="color-dot" style="background: ${opt.color}"></span>` : nothing}
                  <span class="label">${opt.label}</span>
                </div>
              `;
            })
        }
      </div>
    `;
  }
}

customElements.define('pg-select', PgSelect);

export { PgSelect };

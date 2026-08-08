import { LitElement, html } from 'https://unpkg.com/lit@2.8.0/index.js?module';
import { multiSelectStyles } from './multi-select-styles.js';

export class MultiSelect extends LitElement {
  static get properties() {
    return {
      label: { type: String },
      options: { type: Array },
      selectedValues: { type: Array },
      placeholder: { type: String },
      isOpen: { type: Boolean }
    };
  }

  static get styles() {
    return multiSelectStyles;
  }

  constructor() {
    super();
    this.label = '';
    this.options = [];
    this.selectedValues = [];
    this.placeholder = 'Seleccionar...';
    this.isOpen = false;

    this._handleClickOutside = this._handleClickOutside.bind(this);
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('isOpen')) {
      if (this.isOpen) {
        this._addGlobalClickListener();
        this._focusOptionAtIndex(0);
      } else {
        this._removeGlobalClickListener();
      }
    }
  }

  render() {
    const selectedLabels = this.selectedValues.map(value => {
      const option = this.options.find(opt => opt.value === value);
      return option ? option.label : value;
    });

    return html`
      <div class="multi-select ${this.isOpen ? 'open' : ''}">
        <div class="select-header"
             role="combobox"
             tabindex="0"
             aria-expanded="${this.isOpen}"
             aria-haspopup="listbox"
             aria-label="${this.label || this.placeholder}"
             @click=${this.toggleDropdown}
             @keydown=${this._handleHeaderKeydown}>
          <div class="selected-values">
            ${selectedLabels.length > 0
        ? selectedLabels.join(', ')
        : this.placeholder}
          </div>
          <div class="select-arrow" aria-hidden="true">▼</div>
        </div>

        <div class="options-container" role="listbox" aria-label="${this.label || this.placeholder}">
          ${this.options.map((option, index) => {
            const isSelected = this.selectedValues.includes(option.value);
            const optionId = `option-${index}`;
            return html`
            <div class="option ${isSelected ? 'selected' : ''}"
                 role="option"
                 tabindex="-1"
                 aria-selected="${isSelected}"
                 id="${optionId}"
                 @click=${() => this.toggleOption(option.value)}
                 @keydown=${(e) => this._handleOptionKeydown(e, option.value, index)}>
              <label>
                <input type="checkbox"
                       tabindex="-1"
                       ?checked=${isSelected}
                       aria-hidden="true"
                       @click=${(e) => { e.stopPropagation(); this.toggleOption(option.value); }}>
                <span>${option.label}</span>
              </label>
            </div>
          `;})}
        </div>
      </div>
    `;
  }

  _handleHeaderKeydown(e) {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.toggleDropdown();
        if (!this.isOpen) {
          this._focusHeader();
        }
        break;
      case 'Escape':
        if (this.isOpen) {
          e.preventDefault();
          this.isOpen = false;
          this._focusHeader();
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!this.isOpen) {
          this.isOpen = true;
        }
        this.updateComplete.then(() => this._focusOptionAtIndex(0));
        break;
    }
  }

  _handleOptionKeydown(e, value, index) {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.toggleOption(value);
        break;
      case 'Escape':
        e.preventDefault();
        this.isOpen = false;
        this._focusHeader();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this._focusOptionAtIndex(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index === 0) {
          this._focusHeader();
        } else {
          this._focusOptionAtIndex(index - 1);
        }
        break;
    }
  }

  _focusHeader() {
    const header = this.shadowRoot.querySelector('.select-header');
    if (header) {
      header.focus();
    }
  }

  _focusOptionAtIndex(index) {
    const options = this.shadowRoot.querySelectorAll('.option[role="option"]');
    if (index >= 0 && index < options.length) {
      options[index].focus();
    }
  }

  toggleOption(value) {
    const newSelectedValues = this.selectedValues.includes(value)
      ? this.selectedValues.filter(v => v !== value)
      : [...this.selectedValues, value];

    this.selectedValues = newSelectedValues;

    // Emitir evento de cambio
    this.dispatchEvent(new CustomEvent('change', {
      detail: { selectedValues: newSelectedValues },
      bubbles: true,
      composed: true
    }));
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._removeGlobalClickListener();
  }
  
  firstUpdated() {
    // Ya no es necesario escuchar en shadowRoot
  }

  _handleClickOutside(event) {
    if (this.isOpen && !event.composedPath().includes(this)) {
      this.isOpen = false;
    }
  }

  _addGlobalClickListener() {
    if (!this._globalClickListener) {
      this._globalClickListener = (event) => {
        if (!event.composedPath().includes(this)) {
          this.isOpen = false;
        }
      };
      document.addEventListener('mousedown', this._globalClickListener, true);
    }
  }

  _removeGlobalClickListener() {
    if (this._globalClickListener) {
      document.removeEventListener('mousedown', this._globalClickListener, true);
      this._globalClickListener = null;
    }
  }
}

// Guarded define: @manufosela/multi-select (npm/import map) registers the
// same tag. If both modules load on one page, an unconditional second
// define throws and aborts this module's load (PLN-TSK-0356 cleanup).
if (!customElements.get('multi-select')) {
  customElements.define('multi-select', MultiSelect);
}
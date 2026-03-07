import { html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { format, parse, isValid } from 'https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm';
import { BaseCard } from './base-card.js';
import { EpicCardStyles } from './epic-card-styles.js';
import { permissionService } from '../services/permission-service.js';
import { database } from '../../firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { modalStackService } from '../services/modal-stack-service.js';
import { setupAutoCloseOnSave } from '../services/modal-service.js';
import { resolveStatusColor } from '../utils/color-utils.js';
import { EPIC_SCHEMA } from '../schemas/card-field-schemas.js';

export class EpicCard extends BaseCard {
  static get properties() {
    return {
      ...super.properties,
      // EpicCard specific properties
      objective: { type: String },
      acceptanceCriteria: { type: String },
      startDate: { type: Date },
      endDate: { type: Date },
      year: { type: Number, reflect: true },
      stakeholders: { type: Array },
      stakeholdersSelected: { type: Array },
      epicRelations: { type: Array },
      epicRelationsSelected: { type: Array },
      selected: { type: Boolean, reflect: true },
      expanded: { type: Boolean, reflect: true },
      isEditable: { type: Boolean },
      user: { type: Object },
      userEmail: { type: String },
      createdBy: { type: String },
      activeTab: { type: String },
      cardType: { type: String },
      section: { type: String },
      projectId: { type: String },
      group: { type: String },
      invalidFields: { type: Array },
    };
  }

  static get styles() {
    return EpicCardStyles;
  }

  constructor() {
    super();
    this.id = '';
    this.title = '';
    this.description = '';
    this.notes = '';
    this.acceptanceCriteria = '';
    this.objective = '';
    this.startDate = '';
    this.endDate = '';
    this.year = new Date().getFullYear();
    this.stakeholders = [];
    this.stakeholdersSelected = [];
    this.epicRelations = [];
    this.epicRelationsSelected = [];
    this.user = null;
    this.userEmail = '';
    this.createdBy = '';
    this.group = null;
    this.projectId = '';
    this.selected = false;
    this.expanded = false;
    this.cardType = this.tagName.toLowerCase();
    this.group = null;
    this.section = null;
    this.isEditable = true;
    this.invalidFields = [];

    this.showDeleteModal = this.showDeleteModal.bind(this);
    this._confirmDelete = this._confirmDelete.bind(this);

    this.activeTab = 'description';
  }

  get canSave() {
    // Igual que TaskCard: solo requiere título para habilitar el botón
    return this.canEdit && this.title?.trim();
  }

  // Override del _handleSave para agregar validación específica de épicas
  _handleSave() {
    // Validar campos requeridos antes de llamar al padre
    const requiredFields = ['title', 'description', 'startDate'];
    const missingFields = this._getMissingRequiredFields(requiredFields);

    if (missingFields.length > 0) {
      // Marcar campos inválidos
      this.invalidFields = missingFields;
      this._applyInvalidClasses(missingFields);

      // Mostrar notificación usando el método de BaseCard
      this._showNotification(`Para guardar la épica, rellena los campos: ${missingFields.join(', ')}`, 'warning');

      return;
    }

    // Limpiar campos inválidos si la validación pasa
    if (this.invalidFields && this.invalidFields.length > 0) {
      this.invalidFields = [];
      this._clearInvalidClasses();
    }

    // Llamar al método del padre (BaseCard ya resetea checksums)
    super._handleSave();
  }

  get canDelete() {
    // La versión de permisos (_permissionsVersion) fuerza el recálculo del getter cuando cambia
    // Usar viewMode de la propiedad reactiva si está disponible
    const currentUser = document.body.dataset.userEmail;
    const userRole = window.currentUserRole || { isResponsable: false };
    const viewMode = this.currentViewMode || window.currentViewMode || 'consultation';

    // Limpiar cache para asegurar recálculo con datos actuales
    permissionService.clearCache();
    permissionService.init(
      { email: currentUser },
      userRole,
      viewMode
    );

    const permissions = permissionService.getCardPermissions(this, 'epic');
    // Si el año es de solo lectura, no se puede borrar
    return permissions.canDelete && !this.isYearReadOnly;
  }

  /**
   * Formatea una fecha ISO 8601 al formato día-mes-año.
   * Si la cadena está vacía, devuelve una cadena vacía.
   * Si la fecha no es válida, devuelve "Invalid Date".
   *
   * @param {string} isoDate - La fecha en formato ISO (ej: "2024-06-04T22:00:00.000Z").
   * @returns {string} La fecha formateada en formato "dd-mm-yyyy", cadena vacía o "Invalid Date".
   */
  formatDate(_inputDate) {
    if (!_inputDate) return ''; // Si la fecha es vacía, no procesar
    const inputDate = _inputDate.split('T')[0]; // Solo tomar la parte de la fecha

    const possibleFormats = ['d/M/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'M/d/yyyy', 'MM/dd/yyyy'];

    let parsedDate = null;

    for (const fmt of possibleFormats) {
      parsedDate = parse(inputDate, fmt, new Date());
      if (isValid(parsedDate)) break; // Si el parseo es válido, salir del bucle
    }

    // Si ninguna conversión fue válida, retornar vacío o un mensaje de error
    if (!isValid(parsedDate)) return 'Invalid Date';

    return format(parsedDate, 'dd/MM/yyyy'); // Formato de salida uniforme
  }

  render() {
    // Asegurar que stakeholders siempre sea un array
    if (!Array.isArray(this.stakeholders)) {
      this.stakeholders = [];
    }
    return this.expanded ? this.renderExpanded() : this.renderCompact();
  }

  renderCompactHeader() {
    return html`
      <div class="card-header">
        <div class="title" title="${this.title || ''}">${this.title || ''}</div>
        <div class="card-id-row">
          <div class="cardid" title="Click para copiar ID" style="cursor:pointer" @click=${this._copyCardId}>${this.cardId || ''}</div>
          <div class="card-actions">
            ${this.attachment ? html`<span class="attachment-indicator" title="Tiene archivo adjunto">📎</span>` : ''}
            <button class="copy-link-button eye-icon" title="Ver tareas de la épica" @click=${this._handleShowEpicTasks}>👁️</button>
            <button class="copy-link-button" title="Copiar enlace" @click=${(e) => { e.stopPropagation(); this.copyCardUrl(); }}>🔗</button>
            ${this.canDelete ? html`<button class="delete-button" @click=${this.showDeleteModal}>🗑️</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderCompact() {
    return html`
      <div class="card-container" @click=${this.expandCard}>
        ${this.renderCompactHeader()}
        <div class="card-body">
          <table class="epic-compact-table" style="width:100%; font-size:0.9em;">
            <tbody>
              <tr>
                <td><b>Start:</b></td>
                <td>${this.formatDate(this.startDate) || 'Not started'}</td>
              </tr>
              <tr>
                <td><b>End:</b></td>
                <td>${this.formatDate(this.endDate) || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  _setActiveTab(tab) {
    this.activeTab = tab;
    this.shadowRoot.querySelector('.tab-content').scrollIntoView({ behavior: 'smooth' });
  }

  renderExpanded() {
    const currentYear = new Date().getFullYear();
    const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

    return html`
      ${this.renderExpandedHeader()}

      <div class="tabs">
        <button class="description tab-button ${this.activeTab === 'description' ? 'active' : ''}" @click=${() => this._setActiveTab('description')}>Description</button>
        <button class="objective tab-button ${this.activeTab === 'objective' ? 'active' : ''}" @click=${() => this._setActiveTab('objective')}>Objective</button>
        <button class="acceptance-criteria tab-button ${this.activeTab === 'acceptanceCriteria' ? 'active' : ''}" @click=${() => this._setActiveTab('acceptanceCriteria')}>Acceptance Criteria</button>
        <button class="notes tab-button ${this.activeTab === 'notes' ? 'active' : ''}" @click=${() => this._setActiveTab('notes')}>Notes</button>
      </div>
      <div class="tab-content">
        ${this.activeTab === 'description' ? html`
          <textarea
            class="${this._getFieldClass('description')}"
            .value=${this.description}
            @input=${this._handleDescriptionChange}
            @change=${this._handleDescriptionChange}
            @blur=${this._handleDescriptionChange}
            placeholder="Description"
            aria-label="Description"
            ?disabled=${!this.isEditable}>
          </textarea>` : ''}
        ${this.activeTab === 'objective' ? html`
            <textarea
              .value=${this.objective}
              @input=${this._handleObjectiveChange}
              placeholder="Objective"
              aria-label="Objective"
              ?disabled=${!this.isEditable}>
            </textarea>` : ''}
        ${this.activeTab === 'acceptanceCriteria' ? html`
          <textarea
            .value=${this.acceptanceCriteria}
            @input=${this._handleAcceptanceCriteriaChange}
            placeholder="Acceptance Criteria"
            aria-label="Acceptance Criteria"
            ?disabled=${!this.isEditable}>
          </textarea>` : ''}
        ${this.activeTab === 'notes' ? html`
          <textarea
            .value=${this.notes}
            @input=${this._handleNotesChange}
            placeholder="Notes"
            aria-label="Notes"
            ?disabled=${!this.isEditable}>
          </textarea>` : ''}
      </div>

      <div style="display: flex; gap: 8px; margin: 8px 0; height: 1.5rem;">
        <label>Year</label>
        <select
          .value=${String(this.year || currentYear)}
          @change=${this._handleYearChange}
          ?disabled=${!this.isEditable}
          style="width: 80px;"
        >
          ${yearOptions.map(y => html`<option value=${y} ?selected=${this.year === y}>${y}</option>`)}
        </select>
        <label>Start Date</label>
        <input
          type="date"
          class="${this._getFieldClass('startDate')}"
          .value=${this.startDate}
          @input=${this._handleStartDateChange}
          ?disabled=${!this.isEditable}
        />
        <label>End Date</label>
        <input
          type="date"
          class="${this._getFieldClass('endDate')}"
          .value=${this.endDate}
          @input=${this._handleEndDateChange}
          ?disabled=${!this.isEditable}
        />
      </div>

        <div class="expanded-footer">
          <button class="save-button" @click=${this._handleSave} ?disabled=${!this.canSave}>Save</button>
        </div>
      </div>
    `;
  }

  getFormatedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Asegura dos dígitos en el mes
    const day = String(date.getDate()).padStart(2, '0'); // Asegura dos dígitos en el día
    return `${year}-${month}-${day}`;
  }

  _getMissingRequiredFields(requiredFields) {
    const missing = [];
    requiredFields.forEach(field => {
      let value = this[field];

      // Validaciones específicas por campo
      if (field === 'stakeholdersSelected') {
        value = this.stakeholdersSelected;
        if (!value || (Array.isArray(value) && value.length === 0)) {
          missing.push('stakeholders');
        }
      } else if (!value || (typeof value === 'string' && value.trim() === '') ||
        (typeof value === 'number' && value === 0)) {
        missing.push(field);
      }
    });
    return missing;
  }

  _isFieldInvalid(fieldName) {
    return this.invalidFields?.includes(fieldName);
  }

  _getFieldClass(fieldName, baseClass = '') {
    const invalidClass = this._isFieldInvalid(fieldName) ? 'invalid-field' : '';
    return baseClass ? `${baseClass} ${invalidClass}`.trim() : invalidClass;
  }

  _applyInvalidClasses(fields) {
// Primero limpiar cualquier clase invalid anterior
    this._clearInvalidClasses();

    // Esperar un momento para asegurar que el DOM está renderizado
    setTimeout(() => {
      // Buscar todos los elementos input, textarea y select en el componente
      const allInputs = this.shadowRoot.querySelectorAll('input, textarea, select');
// Mapeo de campos a selectores más específicos
      const fieldSelectors = {
        'title': 'input.title-input, input[type="text"]',
        'stakeholders': 'select[id="stakeholders"]',
        'description': 'textarea[placeholder*="description"], textarea',
        'startDate': 'input[type="date"]:first-of-type',
        'endDate': 'input[type="date"]:nth-of-type(2)'
      };

      // Marcar campos usando selectores específicos
      fields.forEach(field => {
        let found = false;

        // Intentar encontrar el campo usando el selector específico
        const selector = fieldSelectors[field];
        if (selector) {
          const fieldElement = this.shadowRoot.querySelector(selector);
          if (fieldElement) {
            fieldElement.classList.add('invalid-field');
found = true;
          }
        }

        // Fallback: buscar por label si no se encuentra con el selector
        if (!found) {
          allInputs.forEach((input) => {
            if (!found) {
              const parent = input.parentElement;
              if (parent) {
                const label = parent.querySelector('label') || parent.previousElementSibling;
                if (label && label.tagName === 'LABEL') {
                  const labelText = label.textContent.toLowerCase().replace(':', '').trim();
                  const fieldMap = {
                    'title': ['title'],
                    'stakeholders': ['stakeholder'],
                    'description': ['description'],
                    'startDate': ['start date'],
                    'endDate': ['end date']
                  };

                  if (fieldMap[field]?.some(text => labelText.includes(text))) {
                    input.classList.add('invalid-field');
found = true;
                  }
                }
              }
            }
          });
        }
      });
    }, 50);
  }

  _clearInvalidClasses() {
    const invalidElements = this.shadowRoot.querySelectorAll('.invalid-field');
    invalidElements.forEach(element => {
      element.classList.remove('invalid-field');
    });
  }

  /**
   * Cargar stakeholders del proyecto desde Firebase
   * Igual que TaskCard para consistencia
   */
  async _fetchProjectStakeholders() {
    if (!this.projectId) {
return;
    }

    const projectRef = ref(database, `/projects/${this.projectId}`);

    try {
const projectSnapshot = await get(projectRef);

      let stakeholders = [];

      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val() || {};
        const stakeholdersData = projectData.stakeholders;
if (Array.isArray(stakeholdersData)) {
          stakeholders = stakeholdersData.map(item => {
            if (typeof item === 'string') {
              return item;
            }
            if (typeof item === 'object' && item !== null) {
              return item.id || item.email || item.name || JSON.stringify(item);
            }
            return String(item);
          });
        } else if (typeof stakeholdersData === 'object' && stakeholdersData !== null) {
          stakeholders = Object.values(stakeholdersData).map(item => {
            if (typeof item === 'string') {
              return item;
            }
            if (typeof item === 'object' && item !== null) {
              return item.id || item.email || item.name || JSON.stringify(item);
            }
            return String(item);
          });
        }

        stakeholders = stakeholders.filter(item => item && typeof item === 'string' && item.trim() !== '');
      }

      this.stakeholders = stakeholders;
this.requestUpdate();

    } catch (error) {
this.stakeholders = [];
    }
  }

  getWCProps() {
    return this._buildPersistentProps(EPIC_SCHEMA.PERSISTENT_FIELDS);
  }

  _confirmDelete() {
    const cardProps = this.getWCProps();
    document.dispatchEvent(new CustomEvent('delete-card',
      {
        detail: {
          cardData: cardProps
        }
      }));
  }

  showDeleteModal(event) {
    event.stopPropagation(); // Evita que el evento de clic se propague al contenedor
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'WARNING!',
          message: `Are you sure you want to delete <b>${this.title}</b>?`,
          button1Text: 'Yes',
          button2Text: 'No',
          button1css: 'background-color: #10b981',
          button2css: 'background-color: #f43f5e',
          button1Action: () => this._confirmDelete(),
          button2Action: () => { } // Just close the modal
        }
      }
    }));
  }

  // Input handlers

  _handleDescriptionChange(e) {
    this.description = e.target.value;
}
  _handleObjectiveChange(e) {
    this.objective = e.target.value;
  }
  _handleStakeholdersChange(e) {
    const previousStakeholders = this.stakeholdersSelected;
    const newStakeholders = Array.from(e.target.selectedOptions, option => option.value);

    // Usar el sistema de BaseCard para trackear cambios
    this.handleUserFieldChange('stakeholdersSelected', newStakeholders, previousStakeholders);
    this.stakeholdersSelected = newStakeholders;
  }
  _handleEpicrelationsChange(e) { this.epicRelationsSelected = Array.from(e.target.selectedOptions, option => option.value); }

  _handleStartDateChange(e) {
    this.startDate = e.target.value;
    this._enforceDateCoherence();
  }

  _handleEndDateChange(e) {
    if (!this._validateEndDateChange(e.target.value)) {
      e.target.value = this.endDate || '';
      return;
    }
    this.endDate = e.target.value;
  }
  _handleYearChange(e) {
    this.year = Number(e.target.value);
  }
  _handleAcceptanceCriteriaChange(e) {
    this.acceptanceCriteria = e.target.value;
  }
  _handleNotesChange(e) {
    this.notes = e.target.value;
  }

  // REMOVED: Duplicate updated() method - merged into the one below

  connectedCallback() {
    super.connectedCallback();

    // Cargar stakeholders del proyecto si tenemos projectId
    if (this.projectId) {
      this._fetchProjectStakeholders();
    }

    // Escuchar el evento de respuesta para stakeholders
    this._onProvideEpicData = (e) => {
      if (e.detail?.cardId === this.cardId && e.detail?.cardType === 'epic-card') {
        // Asegurar que siempre tenemos un array
        const stakeholdersData = e.detail.stakeholders;
        if (Array.isArray(stakeholdersData)) {
          this.stakeholders = stakeholdersData;
        } else {
          this.stakeholders = [];
        }

        this.requestUpdate();
      }
    };
    document.addEventListener('provide-epiccard-data', this._onProvideEpicData);

    // Si la card se conecta como expandida, pedir permisos después del render
    if (this.expanded) {
      this.updateComplete.then(() => this._requestPermissions());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('provide-epiccard-data', this._onProvideEpicData);
  }

  requestUpdate(name, oldValue, options) {
    // Si se está expandiendo la card, pedir permisos después del render
    if (name === 'expanded' && this.expanded && !oldValue) {
      this.updateComplete.then(() => this._requestPermissions());
    }

    return super.requestUpdate(name, oldValue, options);
  }

  /**
   * Solicita permisos específicos para esta EpicCard
   */
  _requestPermissions() {
// Emitir evento solicitando permisos genéricos (usar el handler genérico)
    const permissionRequest = new CustomEvent('request-card-permissions', {
      detail: {
        cardId: this.cardId,
        cardType: 'epic-card',
        userEmail: this.userEmail,
        createdBy: this.createdBy,
        callback: (permissions) => {
this.canEditPermission = permissions.canEdit || false;
          this.requestUpdate();
        }
      },
      bubbles: true
    });

    document.dispatchEvent(permissionRequest);
  }

  updated(changedProperties) {
    // Track if card is expanding - we need to handle initial state capture after hydration
    const wasExpanded = changedProperties.has('expanded') && this.expanded;

    // Temporarily set _initialState to prevent BaseCard from capturing prematurely
    const hadInitialState = this._initialState;
    if (wasExpanded && !hadInitialState) {
      this._initialState = 'pending'; // Prevent BaseCard from capturing
    }

    super.updated(changedProperties);

    // Si cambió el projectId, cargar nuevos stakeholders
    if (changedProperties.has('projectId') && this.projectId) {
      this._fetchProjectStakeholders();
    }

    // Si la card se está expandiendo, solicitar datos específicos de épica
    if (wasExpanded) {
      document.dispatchEvent(new CustomEvent('request-epiccard-data', {
        detail: { cardId: this.cardId, cardType: 'epic-card' },
        bubbles: true,
        composed: true
      }));
    }

    // Capture initial state AFTER data has been hydrated
    if (wasExpanded && !hadInitialState) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          this._initialState = null; // Reset the pending flag
          this.captureInitialState();
        }, 50);
      });
    }
  }

  /**
   * Obtiene el estado de campos editables específicos de EpicCard
   * @returns {Object} Estado actual de campos editables
   */
  _getEditableState() {
    return {
      ...super._getEditableState(),
      acceptanceCriteria: this.acceptanceCriteria || '',
      startDate: this.startDate || '',
      endDate: this.endDate || '',
      year: this.year || '',
      stakeholdersSelected: JSON.stringify(this.stakeholdersSelected || [])
    };
  }

  /**
   * Expande la card en un modal (creando una copia para no afectar la card de la lista)
   */
  expandCard() {
    if (!this.id) {
      return; // No expandir si la tarjeta es nueva y aún no tiene ID asignado
    }

    // Create modal
    const modal = document.createElement('app-modal');
    modal._programmaticMode = true;
    const modalId = `epic-modal-${this.cardId || this.id}-${Date.now()}`;
    modal.modalId = modalId;
    modal.maxWidth = '80vw';
    modal.maxHeight = '85vh';
    modal.showHeader = false;
    modal.showFooter = false;
    modal.interceptClose = true;

    // Create a copy of the card for the modal
    const expandedCard = document.createElement('epic-card');
    const props = this.getWCProps();
    Object.assign(expandedCard, props);

    // Use a unique ID for the modal card to avoid conflicts
    expandedCard.id = `epic-modal-card-${this.cardId || this.id}-${Date.now()}`;
    expandedCard.expanded = true;

    // Container for the card
    const container = document.createElement('div');
    container.id = `epic-container-${modalId}`;
    container.appendChild(expandedCard);

    // Handle modal close request - verify unsaved changes first
    const handleCloseRequest = async (e) => {
      e.stopImmediatePropagation();

      // Check for unsaved changes
      if (expandedCard && typeof expandedCard.hasChanges === 'function') {
        const hasUnsavedChanges = expandedCard.hasChanges();
        if (hasUnsavedChanges) {
          try {
            const confirmed = await modalStackService.createConfirmationModal({
              title: 'Cambios sin guardar',
              message: 'Tienes cambios sin guardar en esta épica.<br><br>¿Quieres cerrar de todos modos?',
              confirmText: 'Sí, cerrar sin guardar',
              cancelText: 'No, volver a editar',
              confirmColor: '#f43f5e',
              cancelColor: '#f59e0b'
            });
            if (!confirmed) {
              return; // User cancelled, don't close
            }
          } catch (error) {
            console.error('[EpicCard] Error in confirmation:', error);
          }
        }
      }
      // Hide container immediately before any collapse happens
      container.style.visibility = 'hidden';
      document.dispatchEvent(new CustomEvent('close-modal', {
        detail: { modalId }
      }));
    };
    modal.addEventListener('modal-closed-requested', handleCloseRequest);

    document.body.appendChild(modal);

    // Setup modal content after it's ready
    modal.updateComplete.then(() => {
      modal.setContent(container);
      expandedCard.requestUpdate();
    });
  }

  /**
   * Copia la URL de la épica al portapapeles y muestra una notificación.
   */
  _copyEpicUrl() {
    const baseUrl = `${window.location.origin}/adminproject/?projectId=${encodeURIComponent(this.projectId)}&cardId=${this.cardId}#epics`;
    navigator.clipboard.writeText(baseUrl).then(() => {
      const notification = document.createElement('slide-notification');
      notification.message = 'Enlace de la épica copiado al portapapeles';
      notification.type = 'success';
      document.body.appendChild(notification);
    }).catch(() => {
      const notification = document.createElement('slide-notification');
      notification.message = 'No se pudo copiar el enlace';
      notification.type = 'error';
      document.body.appendChild(notification);
    });
  }

  /**
   * Maneja el clic en el botón de ver tareas de la épica
   * Previene la propagación del evento para evitar expandir la tarjeta
   */
  _handleShowEpicTasks(event) {
    event.stopPropagation();
    this._showEpicTasks();
  }

  /**
   * Muestra las tareas que pertenecen a esta épica en un modal
   */
  _showEpicTasks() {
    document.dispatchEvent(new CustomEvent('show-epic-tasks-requested', {
      bubbles: true,
      composed: true,
      detail: {
        epicId: this.cardId,
        epicTitle: this.title,
        projectId: this.projectId
      }
    }));
  }

  /**
   * Muestra el modal con las tareas de la épica
   * @param {Array} allTasks - Todas las tareas del proyecto
   */
  _displayEpicTasksModal(allTasks) {
    // Filtrar las tareas que pertenecen a esta épica
    const epicTasks = allTasks.filter(task => task.epic === this.cardId);

    if (epicTasks.length === 0) {
      document.dispatchEvent(new CustomEvent('show-modal', {
        detail: {
          options: {
            title: `Tareas de la épica: ${this.title}`,
            message: `<p>No hay tareas asignadas a esta épica.</p>`,
            button1Text: 'Cerrar',
            button1css: 'background-color: #10b981; color: white;',
            button1Action: () => { },
            maxWidth: '80vw',
            maxHeight: '80vh',
            showHeader: true,
            showFooter: true
          }
        }
      }));
      return;
    }

    // Crear tabla HTML con las tareas
    const tableHtml = this._createTasksTableHtml(epicTasks);

    // Crear un elemento temporal para el contenido del modal
    const tempContainer = document.createElement('div');
    tempContainer.id = `epic-tasks-${this.cardId}`;
    tempContainer.innerHTML = tableHtml;

    // Crear el modal manualmente para poder usar setContent
    const modal = document.createElement('app-modal');
    modal._programmaticMode = true;
    const epicModalId = `epic-modal-${this.cardId}-${Date.now()}`;
    modal.modalId = epicModalId;
    modal.title = `Tareas de la épica: ${this.title} (${epicTasks.length} tareas)`;
    modal.maxWidth = '80vw';
    modal.maxHeight = '80vh';
    modal.button1Text = 'Ver diagrama de Gantt';
    modal.button1Css = 'background-color: #6366f1; color: white;';
    modal.button1Action = () => {
      // Abrir modal de diagrama de Gantt sin cerrar este modal
      this._showGanttModal(epicTasks);
      return false; // Evitar que se cierre este modal
    };
    modal.button2Text = 'Cerrar';
    modal.button2Css = 'background-color: #64748b; color: white;';
    modal.button2Action = () => {
      // Solo cerrar este modal específico
      modal.close();
    };
    modal.showHeader = true;
    modal.showFooter = true;

    // Añadir listener estándar para modal-close-confirmed del modal de épica
    const handleEpicModalCloseConfirmed = (e) => {
      const { modalId, componentType } = e.detail || {};
      if (modalId === epicModalId || (componentType === 'epic-tasks' && modalId === epicModalId)) {
        modal.close();
      }
    };
    document.addEventListener('modal-close-confirmed', handleEpicModalCloseConfirmed);

    document.body.appendChild(modal);
// Configurar el contenido del modal
    modal.updateComplete.then(() => {
      modal.setContent(tempContainer);

      // Configurar identificadores del modal
      modal.contentElementId = tempContainer.id;
      modal.contentElementType = 'epic-tasks';

      // Añadir event listeners para los botones "Ver tarea"
      this._setupTaskViewButtons(tempContainer, epicTasks);

      // Añadir listener para confirmar el cierre del modal de épica específicamente
      const handleModalCloseRequested = (e) => {
        if (e.detail.contentElementId === tempContainer.id && e.detail.modalId === epicModalId) {
          document.dispatchEvent(new CustomEvent('modal-close-confirmed', {
            detail: {
              modalId: epicModalId,
              componentType: 'epic-tasks'
            }
          }));
        }
      };

      document.addEventListener('modal-closed-requested', handleModalCloseRequested);

      // Limpiar los listeners cuando se cierre el modal
      modal.addEventListener('modal-closed', () => {
        document.removeEventListener('modal-closed-requested', handleModalCloseRequested);
        document.removeEventListener('modal-close-confirmed', handleEpicModalCloseConfirmed);
});
    });
  }

  /**
   * Crea el HTML de la tabla con las tareas
   * @param {Array} tasks - Lista de tareas de la épica
   * @returns {string} HTML de la tabla
   */
  _createTasksTableHtml(tasks) {
    const tableStyle = `
      <style>
        .epic-tasks-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          font-size: 0.95em;
          background-color: var(--bg-primary, #ffffff);
          color: var(--text-primary, #333333);
        }
        .epic-tasks-table th,
        .epic-tasks-table td {
          border: 1px solid var(--border-subtle, #ddd);
          padding: 10px;
          text-align: left;
          color: var(--text-primary, #333333);
        }
        .epic-tasks-table th {
          background-color: var(--brand-primary, #6366f1);
          color: var(--text-inverse, #ffffff);
          font-weight: bold;
          font-size: 1em;
        }
        .epic-tasks-table tbody tr {
          background-color: var(--bg-primary, #ffffff);
          color: var(--text-primary, #333333);
        }
        .epic-tasks-table tbody tr:nth-child(even) {
          background-color: var(--bg-secondary, #f8f9fa);
          color: var(--text-primary, #333333);
        }
        .epic-tasks-table tbody tr:hover {
          background-color: var(--bg-tertiary, #e9ecef);
          color: var(--text-primary, #333333);
        }
        .status-todo { background-color: var(--status-todo, #94a3b8); color: var(--status-todo-text, white); padding: 4px 8px; border-radius: 4px; }
        .status-inprogress { background-color: var(--status-in-progress, #3b82f6); color: var(--status-in-progress-text, white); padding: 4px 8px; border-radius: 4px; }
        .status-done { background-color: var(--status-done, #10b981); color: var(--status-done-text, white); font-weight: bold; padding: 4px 8px; border-radius: 4px; }
        .status-blocked { background-color: var(--status-blocked, #f43f5e); color: var(--status-blocked-text, white); opacity: 0.5; padding: 4px 8px; border-radius: 4px; }
        .status-inreview { background-color: var(--status-to-validate, #f59e0b); color: var(--status-to-validate-text, white); padding: 4px 8px; border-radius: 4px; }
        .status-testing { background-color: var(--status-in-progress, #3b82f6); color: var(--status-in-progress-text, white); padding: 4px 8px; border-radius: 4px; }
        .status-tovalidate { background-color: var(--status-to-validate, #f59e0b); color: var(--status-to-validate-text, white); padding: 4px 8px; border-radius: 4px; }
        .status-cancelled { background-color: var(--color-error, #f43f5e); color: var(--text-inverse, white); padding: 4px 8px; border-radius: 4px; }
        .view-task-btn {
          background: var(--brand-primary, #6366f1);
          color: var(--text-inverse, white);
          border: none;
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          transition: background-color 0.2s;
        }
        .view-task-btn:hover {
          background: var(--brand-primary-hover, #4f46e5);
        }
        .view-task-btn:active {
          transform: scale(0.95);
        }
      </style>
    `;

    const tableRows = tasks.map(task => {
      const statusClass = task.status ? `status-${task.status.toLowerCase().replace(/\s+/g, '').replace(/&/g, '')}` : '';
      const sprintTitle = task.sprint && window.globalSprintList?.[task.sprint]?.title || '';

      // Resolver developer ID a nombre
      const developerDisplay = this._resolveDeveloperDisplay(task.developer);

      return `
        <tr>
          <td>${task.cardId || ''}</td>
          <td>${task.title || ''}</td>
          <td><div class="${statusClass}">${task.status || ''}</div></td>
          <td>${task.businessPoints || 0}</td>
          <td>${task.devPoints || 0}</td>
          <td>${sprintTitle}</td>
          <td>${developerDisplay}</td>
          <td>${task.startDate ? this.formatDate(task.startDate) : ''}</td>
          <td>${task.endDate ? this.formatDate(task.endDate) : ''}</td>
          <td>
            <button class="view-task-btn" data-task-id="${task.id}" title="Editar tarea">
              ✏️
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      ${tableStyle}
      <div style="max-height: 400px; overflow-y: auto;">
        <table class="epic-tasks-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Título</th>
              <th>Estado</th>
              <th>B. Points</th>
              <th>D. Points</th>
              <th>Sprint</th>
              <th>Developer</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Configura los event listeners para los botones "Ver tarea"
   * @param {HTMLElement} container - Contenedor del modal
   * @param {Array} tasks - Lista de tareas
   */
  _setupTaskViewButtons(container, tasks) {
    const viewButtons = container.querySelectorAll('.view-task-btn');

    viewButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const taskId = button.getAttribute('data-task-id');
        const task = tasks.find(t => t.id === taskId);

        if (task) {
          this._showTaskModal(task);
        }
      });
    });
  }

  /**
   * Muestra un modal con los detalles completos de una tarea
   * @param {Object} task - Datos de la tarea
   */
  _showTaskModal(task) {
    // Crear TaskCard temporal para mostrar los detalles
    const taskCard = document.createElement('task-card');

    // Copiar todas las propiedades de la tarea al TaskCard
    Object.keys(task).forEach(key => {
      if (taskCard.hasOwnProperty(key) || key in taskCard.constructor.properties) {
        taskCard[key] = task[key];
      }
    });

    // Configurar como expandida para mostrar todos los detalles
    taskCard.expanded = true;
    taskCard.projectId = this.projectId;

    // Crear contenedor para el modal
    const taskContainer = document.createElement('div');
    taskContainer.id = `task-detail-${task.id}`;
    taskContainer.appendChild(taskCard);

    // Crear el modal superpuesto con ID único
    const taskModal = document.createElement('app-modal');
    taskModal._programmaticMode = true;
    const uniqueModalId = `task-modal-${task.id}-${Date.now()}`;
    taskModal.modalId = uniqueModalId;
    taskModal.title = `Tarea: ${task.title || 'Sin título'}`;
    taskModal.maxWidth = '90vw';
    taskModal.maxHeight = '85vh';
    taskModal.showHeader = true;
    taskModal.showFooter = false;
    taskModal.interceptClose = true;

    // Configurar z-index más alto para aparecer sobre el modal de la épica
    taskModal.style.zIndex = '10001';

    // Handler para interceptar cierre y verificar cambios
    const handleCloseRequested = async (e) => {
      // Detener propagación inmediatamente para evitar que otros listeners cierren el modal
      e.stopImmediatePropagation();

      if (taskCard && typeof taskCard.hasChanges === 'function') {
        const hasUnsavedChanges = taskCard.hasChanges();
        if (hasUnsavedChanges) {
          try {
            const confirmed = await modalStackService.createConfirmationModal({
              title: 'Cambios sin guardar',
              message: 'Tienes cambios sin guardar en esta tarea.<br><br>¿Quieres cerrar de todos modos?',
              confirmText: 'Sí, cerrar sin guardar',
              cancelText: 'No, volver a editar',
              confirmColor: '#f43f5e',
              cancelColor: '#f59e0b'
            });
            if (!confirmed) {
              return;
            }
          } catch (error) {
            // On error, allow close
          }
        }
      }
      document.dispatchEvent(new CustomEvent('close-modal', {
        detail: { modalId: uniqueModalId }
      }));
    };
    taskModal.addEventListener('modal-closed-requested', handleCloseRequested);

    // Cerrar modal automáticamente al guardar
    setupAutoCloseOnSave(taskModal, taskCard, uniqueModalId);

    document.body.appendChild(taskModal);

    // Configurar el contenido del modal
    taskModal.updateComplete.then(() => {
      taskModal.setContent(taskContainer);

      // Solicitar permisos para la tarea
      setTimeout(() => {
        taskCard._requestPermissions();
      }, 100);

      // Configurar contenido del modal para el sistema de validación de cierre
      taskModal.contentElementId = taskContainer.id;
      taskModal.contentElementType = 'task-card';

      // Manejar el cierre específico de este modal usando evento estándar
      const handleTaskModalCloseRequested = (e) => {
        // Solo responder si es para este modal específico
        if (e.detail.contentElementId === taskContainer.id) {
          document.dispatchEvent(new CustomEvent('modal-close-confirmed', {
            detail: {
              modalId: uniqueModalId,
              componentType: 'task-card'
            }
          }));
        }
      };

      document.addEventListener('modal-closed-requested', handleTaskModalCloseRequested);

      // Limpiar listeners al cerrar este modal específico
      taskModal.addEventListener('modal-closed', () => {
        document.removeEventListener('modal-closed-requested', handleTaskModalCloseRequested);
        document.removeEventListener('modal-close-confirmed', handleModalCloseConfirmed);
});
});
  }

  /**
   * Muestra el modal con el diagrama de Gantt de la épica y sus tareas
   * @param {Array} tasks - Lista de tareas de la épica
   */
  _showGanttModal(tasks) {
    // Crear contenedor para el diagrama de Gantt
    const ganttContainer = document.createElement('div');
    ganttContainer.id = `gantt-${this.cardId}-${Date.now()}`;
    ganttContainer.innerHTML = this._createGanttChartHtml(tasks);

    // Crear el modal para el diagrama de Gantt
    const ganttModal = document.createElement('app-modal');
    ganttModal._programmaticMode = true;
    const ganttModalId = `gantt-modal-${this.cardId}-${Date.now()}`;
    ganttModal.modalId = ganttModalId;
    ganttModal.title = `Diagrama de Gantt - ${this.title}`;
    ganttModal.maxWidth = '95vw';
    ganttModal.maxHeight = '90vh';
    ganttModal.button1Text = 'Cerrar';
    ganttModal.button1Css = 'background-color: #64748b; color: white;';
    ganttModal.button1Action = () => {
      ganttModal.close();
    };
    ganttModal.showHeader = true;
    ganttModal.showFooter = true;

    // Configurar z-index más alto para aparecer sobre el modal de épica
    ganttModal.style.zIndex = '10002';

    // Añadir listener estándar para modal-close-confirmed
    const handleGanttModalCloseConfirmed = (e) => {
      const { modalId, componentType } = e.detail || {};
      if (modalId === ganttModalId || (componentType === 'gantt-chart' && modalId === ganttModalId)) {
        ganttModal.close();
      }
    };
    document.addEventListener('modal-close-confirmed', handleGanttModalCloseConfirmed);

    document.body.appendChild(ganttModal);
// Configurar el contenido del modal
    ganttModal.updateComplete.then(() => {
      ganttModal.setContent(ganttContainer);

      // Configurar identificadores del modal
      ganttModal.contentElementId = ganttContainer.id;
      ganttModal.contentElementType = 'gantt-chart';

      // Manejar el cierre específico de este modal de Gantt únicamente
      const handleGanttModalCloseRequested = (e) => {
        if (e.detail.contentElementId === ganttContainer.id && e.detail.modalId === ganttModalId) {
          document.dispatchEvent(new CustomEvent('modal-close-confirmed', {
            detail: {
              modalId: ganttModalId,
              componentType: 'gantt-chart'
            }
          }));
        }
      };

      document.addEventListener('modal-closed-requested', handleGanttModalCloseRequested);

      // Limpiar listeners al cerrar este modal específico
      ganttModal.addEventListener('modal-closed', () => {
        document.removeEventListener('modal-closed-requested', handleGanttModalCloseRequested);
        document.removeEventListener('modal-close-confirmed', handleGanttModalCloseConfirmed);
});

      // Inicializar el diagrama de Gantt después de que el contenido esté cargado
      setTimeout(() => {
        this._initializeGanttChart(ganttContainer, tasks);
      }, 100);
    });
  }

  /**
   * Crea el HTML base para el diagrama de Gantt
   * @param {Array} tasks - Lista de tareas
   * @returns {string} HTML del contenedor del Gantt
   */
  _createGanttChartHtml(tasks) {
    return `
      <style>
        .gantt-container {
          width: 100%;
          height: 500px;
          overflow: auto;
          border: 1px solid var(--border-subtle, #ddd);
          border-radius: 4px;
        }
        .gantt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding: 1rem;
          background: var(--bg-secondary, #f8f9fa);
          border-radius: 4px;
        }
        .gantt-info {
          font-size: 0.9em;
          color: var(--text-muted, #666);
        }
        .gantt-chart {
          min-height: 400px;
          background: var(--bg-primary, white);
          position: relative;
        }
        .gantt-loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 400px;
          font-size: 1.1em;
          color: var(--text-muted, #666);
        }
      </style>
      <div class="gantt-header">
        <div>
          <h3>Épica: ${this.title}</h3>
          <div class="gantt-info">
            Tareas incluidas: ${tasks.length} | 
            Período: ${this._getGanttDateRange(tasks)}
          </div>
        </div>
      </div>
      <div class="gantt-container">
        <div class="gantt-chart" id="gantt-chart-${this.cardId}">
          <div class="gantt-loading">
            📊 Cargando diagrama de Gantt...
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Obtiene el rango de fechas para mostrar en la información del Gantt
   * @param {Array} tasks - Lista de tareas
   * @returns {string} Rango de fechas formateado
   */
  _getGanttDateRange(tasks) {
    const dates = [];

    // Agregar fechas de la épica
    if (this.startDate) dates.push(new Date(this.startDate));
    if (this.endDate) dates.push(new Date(this.endDate));

    // Agregar fechas de las tareas
    tasks.forEach(task => {
      if (task.startDate) dates.push(new Date(task.startDate));
      if (task.endDate) dates.push(new Date(task.endDate));
    });

    if (dates.length === 0) return 'Sin fechas definidas';

    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    return `${this.formatDate(minDate.toISOString())} - ${this.formatDate(maxDate.toISOString())}`;
  }

  /**
   * Inicializa el diagrama de Gantt con los datos de la épica y tareas
   * @param {HTMLElement} container - Contenedor del modal
   * @param {Array} tasks - Lista de tareas
   */
  _initializeGanttChart(container, tasks) {
    const chartElement = container.querySelector(`#gantt-chart-${this.cardId}`);
    if (!chartElement) return;

    // Preparar datos para el diagrama de Gantt
    const ganttData = this._prepareGanttData(tasks);

    // Renderizar diagrama de Gantt simple con HTML/CSS
    chartElement.innerHTML = this._renderSimpleGanttChart(ganttData);
  }

  /**
   * Prepara los datos para el diagrama de Gantt
   * @param {Array} tasks - Lista de tareas
   * @returns {Object} Datos estructurados para el Gantt
   */
  _prepareGanttData(tasks) {
    const ganttTasks = [];

    // Agregar la épica como tarea principal
    ganttTasks.push({
      id: this.cardId,
      name: this.title,
      type: 'epic',
      startDate: this.startDate,
      endDate: this.endDate,
      progress: this._calculateEpicProgress(tasks),
      color: '#8b5cf6'
    });

    // Agregar las tareas
    tasks.forEach(task => {
      if (task.startDate || task.endDate) {
        ganttTasks.push({
          id: task.id,
          name: task.title,
          type: 'task',
          startDate: task.startDate,
          endDate: task.endDate,
          status: task.status,
          progress: this._calculateTaskProgress(task.status),
          color: this._getTaskColor(task.status),
          developer: task.developer
        });
      }
    });

    return {
      tasks: ganttTasks,
      dateRange: this._calculateDateRange(ganttTasks)
    };
  }

  /**
   * Calcula el progreso de la épica basado en sus tareas
   * @param {Array} tasks - Lista de tareas
   * @returns {number} Porcentaje de progreso
   */
  _calculateEpicProgress(tasks) {
    if (tasks.length === 0) return 0;

    const completedTasks = tasks.filter(task => (task.status || '').toLowerCase() === 'done&validated').length;
    return Math.round((completedTasks / tasks.length) * 100);
  }

  /**
   * Calcula el progreso de una tarea basado en su estado
   * @param {string} status - Estado de la tarea
   * @returns {number} Porcentaje de progreso
   */
  _calculateTaskProgress(status) {
    const statusProgress = {
      'todo': 0,
      'inprogress': 50,
      'inreview': 80,
      'testing': 85,
      'tovalidate': 90,
      'done': 100,
      'blocked': 25,
      'cancelled': 0
    };
    return statusProgress[status?.toLowerCase()] || 0;
  }

  /**
   * Obtiene el color de una tarea basado en su estado
   * @param {string} status - Estado de la tarea
   * @returns {string} Color hex
   */
  _getTaskColor(status) {
    return resolveStatusColor(status || '');
  }

  /**
   * Calcula el rango de fechas para el diagrama
   * @param {Array} tasks - Lista de tareas del Gantt
   * @returns {Object} Objeto con fecha inicio y fin
   */
  _calculateDateRange(tasks) {
    const dates = [];

    tasks.forEach(task => {
      if (task.startDate) dates.push(new Date(task.startDate));
      if (task.endDate) dates.push(new Date(task.endDate));
    });

    if (dates.length === 0) {
      const today = new Date();
      return {
        start: today,
        end: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 días
      };
    }

    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // Agregar margen
    const marginDays = 7;
    minDate.setDate(minDate.getDate() - marginDays);
    maxDate.setDate(maxDate.getDate() + marginDays);

    return { start: minDate, end: maxDate };
  }

  /**
   * Renderiza un diagrama de Gantt simple usando HTML/CSS
   * @param {Object} ganttData - Datos del Gantt
   * @returns {string} HTML del diagrama
   */
  _renderSimpleGanttChart(ganttData) {
    const { tasks, dateRange } = ganttData;
    const totalDays = Math.ceil((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24));

    let html = `
      <style>
        .simple-gantt {
          padding: 1rem;
        }
        .gantt-row {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          min-height: 40px;
        }
        .task-label {
          width: 250px;
          padding-right: 1rem;
          font-size: 0.9em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .epic-label {
          font-weight: bold;
          color: var(--status-expedited, #8b5cf6);
        }
        .gantt-timeline {
          flex: 1;
          position: relative;
          height: 30px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 4px;
          margin-right: 1rem;
        }
        .gantt-bar {
          position: absolute;
          height: 100%;
          border-radius: 4px;
          display: flex;
          align-items: center;
          color: var(--text-inverse, white);
          font-size: 0.8em;
          padding: 0 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .task-info {
          font-size: 0.8em;
          color: var(--text-muted, #666);
          width: 100px;
        }
        .gantt-dates {
          display: flex;
          margin-bottom: 1rem;
          padding-left: 250px;
          font-size: 0.8em;
          color: var(--text-muted, #666);
        }
      </style>
      <div class="simple-gantt">
        <div class="gantt-dates">
          <div style="flex: 1; text-align: left;">
            📅 ${this.formatDate(dateRange.start.toISOString())}
          </div>
          <div style="flex: 1; text-align: right;">
            📅 ${this.formatDate(dateRange.end.toISOString())}
          </div>
        </div>
    `;

    tasks.forEach(task => {
      const startDate = task.startDate ? new Date(task.startDate) : dateRange.start;
      const endDate = task.endDate ? new Date(task.endDate) : startDate;

      // Calcular posición y ancho de la barra
      const startOffset = Math.max(0, (startDate - dateRange.start) / (1000 * 60 * 60 * 24));
      const duration = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));

      const leftPercent = (startOffset / totalDays) * 100;
      const widthPercent = (duration / totalDays) * 100;

      // Resolver developer ID a nombre
      const devDisplay = task.developer ? this._resolveDeveloperDisplay(task.developer) : task.type;

      html += `
        <div class="gantt-row">
          <div class="task-label ${task.type === 'epic' ? 'epic-label' : ''}">
            ${task.type === 'epic' ? '📊' : '📋'} ${task.name}
          </div>
          <div class="gantt-timeline">
            <div class="gantt-bar" style="
              left: ${leftPercent}%;
              width: ${widthPercent}%;
              background-color: ${task.color};
            ">
              ${task.progress}%
            </div>
          </div>
          <div class="task-info">
            ${devDisplay}
          </div>
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  /**
   * Resuelve un ID de developer (dev_XXX) a nombre legible
   * @param {string} value - ID o email del developer
   * @returns {string} Nombre legible
   */
  _resolveDeveloperDisplay(value) {
    if (!value) return '';

    // Intentar resolver como entity ID (dev_XXX)
    if (typeof value === 'string' && value.startsWith('dev_')) {
      const name = entityDirectoryService.getDeveloperDisplayName(value);
      if (name) return name;
    }

    // Si es un email, extraer nombre
    if (typeof value === 'string' && value.includes('@')) {
      return value.split('@')[0];
    }

    return value;
  }
}

customElements.define('epic-card', EpicCard);

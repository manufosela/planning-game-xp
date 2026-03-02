import { html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { BaseCard } from './base-card.js';
import { FirebaseService } from '../services/firebase-service.js';
import { QACardStyles } from './qa-card-styles.js';
import { permissionService } from '../services/permission-service.js';
import { QA_SCHEMA } from '../schemas/card-field-schemas.js';
import { demoModeService } from '../services/demo-mode-service.js';

/**
 * Componente para tarjetas de QA/Test.
 * @element qa-card
 */
export class QACard extends BaseCard {
  static get properties() {
    return {
      ...super.properties,
      // QACard specific properties
      associatedTaskId: { type: String },
      description: { type: String },
      priority: { type: String },
      steps: { type: String },
      status: { type: String },
      actualResult: { type: String },
      expectedResult: { type: String },
      defectType: { type: String },
      attachments: { type: Array },
      isEditable: { type: Boolean },
      expanded: { type: Boolean, reflect: true },
      userEmail: { type: String },
      createdBy: { type: String },
      projectId: { type: String },
      group: { type: String },
      section: { type: String },
      suiteId: { type: String },
      cardType: { type: String },
    };
  }

  static get styles() {
    return QACardStyles;
  }

  constructor() {
    super();
    this.id = '';
    this.cardId = '';
    this.title = '';
    this.associatedTaskId = '';
    this.description = '';
    this.priority = '';
    this.steps = '';
    this.status = 'Pendiente';
    this.actualResult = '';
    this.expectedResult = '';
    this.defectType = '';
    this.attachments = [];
    this.isEditable = true;
    this.expanded = false;
    this.userEmail = '';
    this.createdBy = '';
    this.projectId = '';
    this.group = 'qa';
    this.section = 'qa';
    this.suiteId = '';
    this.cardType = 'qa-card';
    /** Lista de suites disponibles */
    this.suitesList = [];
    /** Lista temporal de tareas para el select */
    this._tempTaskList = [];
    /** Si se está creando una nueva suite */
    this.creatingNewSuite = false;
    /** Si se está borrando una suite */
    this.deletingSuite = false;
    /** Nombre de la nueva suite */
    this.newSuiteName = '';
    /** Suite seleccionada para borrar */
    this.suiteToDelete = '';
    this._onProvideQAData = this._onProvideQAData.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('provide-qacard-data', this._onProvideQAData);

    // Si la card se conecta como expandida, pedir permisos después del render
    if (this.expanded) {
      this.updateComplete.then(() => this._requestOwnershipPermissions());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('provide-qacard-data', this._onProvideQAData);
  }

  requestUpdate(name, oldValue, options) {
    return this._handleRequestUpdateWithOwnershipPermissions(name, oldValue, options);
  }

  _onProvideQAData(e) {
    if (e.detail?.cardId === this.cardId && e.detail?.cardType === this.cardType) {
      // Si suitesList es un objeto {id: nombre}, lo convierto a array de objetos {id, name}
      let suitesRaw = e.detail.suitesList || {};
      if (!Array.isArray(suitesRaw)) {
        this.suitesList = Object.entries(suitesRaw).map(([id, name]) => {
          return { id, name: name.name || name };
        });
      } else {
        this.suitesList = suitesRaw.map(suite => {
          if (typeof suite === 'object') {
            return { id: suite.id, name: suite.name };
          }
          return { id: suite, name: suite };
        });
      }

      // Verificar si el suiteId actual existe en la lista
      const suiteExists = this.suitesList.some(s => String(s.id) === String(this.suiteId));

      // Solo resetear el suiteId si no existe en la lista
      if (!suiteExists && this.suiteId) {
        this.suiteId = '';
      }

      // Guardar temporalmente la lista de tareas para el select
      this._tempTaskList = e.detail.taskIdList || [];

      // Forzar la actualización de los selects
      this.requestUpdate();

      // Asegurarnos de que los selects se actualicen con los valores correctos
      setTimeout(() => {
        const suiteSelect = this.renderRoot?.querySelector('select[value]');
        const taskSelect = this.renderRoot?.querySelector('select[value=""]');
        if (suiteSelect && this.suiteId) {
          suiteSelect.value = this.suiteId;
        }
        if (taskSelect && this.associatedTaskId) {
          taskSelect.value = this.associatedTaskId;
        }
      }, 0);
    }
  }

  async updated(changedProps) {
    super.updated?.(changedProps);
    if (changedProps.has('expanded') && this.expanded && this.projectId) {
      document.dispatchEvent(new CustomEvent('request-qacard-data', {
        detail: {
          cardId: this.cardId,
          cardType: this.cardType,
          currentSuiteId: this.suiteId,
          currentTaskId: this.associatedTaskId
        },
        bubbles: true,
        composed: true
      }));
    }
  }

  /**
   * Carga las suites del proyecto desde Firebase.
   * @returns {Promise<void>}
   */
  async loadSuites() {
    if (!this.projectId) return;
    try {
      const suites = await FirebaseService.getSuites(this.projectId);
      this.suitesList = Object.entries(suites || {}).map(([id, s]) => ({ id, name: s.name || id }));
    } catch (e) {
      this.suitesList = [];
    }
    this.requestUpdate();
  }

  /**
   * Maneja el cambio en el select de suites.
   * @param {Event} e
   */
  handleSuiteChange(e) {
    const value = e.target.value;
    if (value === '__new__') {
      this.creatingNewSuite = true;
      this.newSuiteName = '';
      this.requestUpdate();
      setTimeout(() => {
        const dlg = this.renderRoot?.querySelector('#suiteDialog');
        if (dlg) dlg.showModal();
      }, 0);
    } else if (value === '__delete__') {
      this.deletingSuite = true;
      this.suiteToDelete = '';
      this.requestUpdate();
      setTimeout(() => {
        const dlg = this.renderRoot?.querySelector('#deleteSuiteDialog');
        if (dlg) dlg.showModal();
      }, 0);
    } else {
      this.suiteId = value;
      this.creatingNewSuite = false;
      this.deletingSuite = false;
    }
    this.requestUpdate();
  }

  /**
   * Cierra el modal de nueva suite y resetea el estado.
   */
  closeSuiteDialog() {
    this.creatingNewSuite = false;
    this.newSuiteName = '';
    this.requestUpdate();
    const dlg = this.renderRoot?.querySelector('#suiteDialog');
    if (dlg) dlg.close();
  }

  /**
   * Maneja el input del nombre de la nueva suite.
   * @param {Event} e
   */
  handleNewSuiteInput(e) {
    this.newSuiteName = e.target.value;
    this.requestUpdate();
  }

  /**
   * Guarda la nueva suite en Firebase y la selecciona, cerrando el modal.
   * @returns {Promise<void>}
   */
  async saveNewSuite() {
    if (!this.newSuiteName.trim()) return;
    try {
      const suiteId = await FirebaseService.addSuite(this.projectId, this.newSuiteName.trim());
      this.suitesList = [...this.suitesList, { id: suiteId, name: this.newSuiteName.trim() }];
      this.suiteId = suiteId;
      this.creatingNewSuite = false;
      this.newSuiteName = '';
        this.requestUpdate();
      const dlg = this.renderRoot?.querySelector('#suiteDialog');
      if (dlg) dlg.close();
    } catch (e) {
      // Manejar error si es necesario
    }
  }

  /**
   * Cierra el modal de borrar suite y resetea el estado.
   */
  closeDeleteSuiteDialog() {
    this.deletingSuite = false;
    this.suiteToDelete = '';
    this.requestUpdate();
    const dlg = this.renderRoot?.querySelector('#deleteSuiteDialog');
    if (dlg) dlg.close();
  }

  /**
   * Maneja el input del nombre de la suite a borrar.
   * @param {Event} e
   */
  handleDeleteSuiteInput(e) {
    this.suiteToDelete = e.target.value;
    this.requestUpdate();
  }

  /**
   * Verifica si una suite está en uso por alguna QACard.
   * @param {string} suiteId - ID de la suite a verificar
   * @returns {Promise<boolean>} - true si la suite está en uso
   */
  async isSuiteInUse(suiteId) {
    try {
      const qaCards = await FirebaseService.getQACards(this.projectId);
      return Object.values(qaCards || {}).some(card => card.suiteId === suiteId);
    } catch (e) {
return true; // Por seguridad, asumimos que está en uso si hay error
    }
  }

  /**
   * Borra una suite si no está en uso.
   * @returns {Promise<void>}
   */
  async deleteSuite() {
    if (!this.suiteToDelete.trim()) return;

    // Buscar la suite por nombre
    const suite = this.suitesList.find(s => s.name.toLowerCase() === this.suiteToDelete.toLowerCase());
    if (!suite) {
      alert('No se encontró la suite especificada');
      return;
    }

    // Verificar si la suite está en uso
    const isInUse = await this.isSuiteInUse(suite.id);
    if (isInUse) {
      alert('No se puede borrar la suite porque está siendo utilizada por alguna tarjeta QA');
      return;
    }

    try {
      await FirebaseService.deleteSuite(this.projectId, suite.id);
      // Actualizar la lista de suites
      this.suitesList = this.suitesList.filter(s => s.id !== suite.id);
      // Si la suite borrada era la seleccionada, limpiar la selección
      if (this.suiteId === suite.id) {
        this.suiteId = '';
      }
      this.deletingSuite = false;
      this.suiteToDelete = '';
        this.requestUpdate();
      const dlg = this.renderRoot?.querySelector('#deleteSuiteDialog');
      if (dlg) dlg.close();
    } catch (e) {
      alert('Error al borrar la suite: ' + e.message);
    }
  }

  /**
   * Renderiza la tarjeta QA.
   * @returns {import('lit').TemplateResult}
   */
  render() {
    return this.expanded ? this.renderExpanded() : this.renderCompact();
  }

  /**
   * Renderiza la vista compacta.
   * @returns {import('lit').TemplateResult}
   */
  renderCompact() {
    // Obtener el nombre de la suite basándose en el suiteId
    const suiteName = this.getSuiteName();

    return html`
      <div class="card-container" @click=${this.expandCard}>
        ${this.renderCompactHeader()}
        <div class="card-body">
          <div><b>Estado:</b> ${this.status}</div>
          <div><b>Prioridad:</b> ${this.priority}</div>
          ${suiteName ? html`<div><b>Suite:</b> ${suiteName}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Renderiza la vista expandida.
   * @returns {import('lit').TemplateResult}
   */
  renderExpanded() {
    return html`
      <div class="expanded-fields">
        <div class="field-group">
          <label>Título del Test</label>
          <input type="text" .value=${this.title} @input=${e => this._handleInput('title', e)} ?disabled=${!this.isEditable} placeholder="Escriba aquí el título del test QA..." autofocus />
        </div>
        <div class="field-group-row">
          <div class="field-group" style="flex:1;">
            <label>Suite</label>
            <select 
              .value=${this.suiteId || ''} 
              @change=${this.handleSuiteChange.bind(this)} 
              ?disabled=${!this.isEditable}
            >
              <option value="">Sin suite</option>
              ${this.suitesList.map(s => html`<option value="${s.id}" ?selected=${String(s.id) === String(this.suiteId)}>${s.name || s.id}</option>`)}
              <option value="__new__">Crear nueva suite...</option>
              <option value="__delete__">Borrar suite...</option>
            </select>
          </div>
          <div class="field-group" style="flex:1;">
            <label>ID Tarea asociada</label>
            <select 
              .value=${this.associatedTaskId || ''} 
              @change=${e => this._handleInput('associatedTaskId', e)} 
              ?disabled=${!this.isEditable}
            >
              <option value="">Selecciona una tarea</option>
              ${this._tempTaskList.map(task => html`
                <option 
                  value="${task.id}" 
                  ?selected=${String(task.id) === String(this.associatedTaskId)}
                >${task.title}</option>
              `)}
            </select>
          </div>
        </div>
        <!-- Modal para crear nueva suite -->
        <dialog id="suiteDialog" style="padding:2rem; border-radius:10px; min-width:320px; text-align:center;">
          <form method="dialog" @submit=${e => e.preventDefault()} style="display:flex; flex-direction:column; gap:1rem; align-items:center;">
            <h3 style="margin:0 0 0.5rem 0;">Crear nueva suite</h3>
            <input type="text" .value=${this.newSuiteName} @input=${this.handleNewSuiteInput.bind(this)} placeholder="Nombre de la nueva suite" autofocus style="width:90%; padding:0.5rem;" />
            <div style="display:flex; gap:1rem; justify-content:center;">
              <button type="button" @click=${this.saveNewSuite.bind(this)} ?disabled=${!this.newSuiteName.trim() || !this.isEditable} style="padding:0.5rem 1.2rem;">Guardar suite</button>
              <button type="button" @click=${this.closeSuiteDialog.bind(this)} style="padding:0.5rem 1.2rem; background:var(--bg-secondary, #eee);">Cancelar</button>
            </div>
          </form>
        </dialog>
        <!-- Modal para borrar suite -->
        <dialog id="deleteSuiteDialog" style="padding:2rem; border-radius:10px; min-width:320px; text-align:center;">
          <form method="dialog" @submit=${e => e.preventDefault()} style="display:flex; flex-direction:column; gap:1rem; align-items:center;">
            <h3 style="margin:0 0 0.5rem 0;">Borrar suite</h3>
            <p style="margin:0; color:var(--text-secondary, #666);">Escribe el nombre exacto de la suite que deseas borrar</p>
            <input type="text" .value=${this.suiteToDelete} @input=${this.handleDeleteSuiteInput.bind(this)} placeholder="Nombre de la suite a borrar" autofocus style="width:90%; padding:0.5rem;" />
            <div style="display:flex; gap:1rem; justify-content:center;">
              <button type="button" @click=${this.deleteSuite.bind(this)} ?disabled=${!this.suiteToDelete.trim() || !this.isEditable} style="padding:0.5rem 1.2rem; background:#f43f5e; color:white;">Borrar suite</button>
              <button type="button" @click=${this.closeDeleteSuiteDialog.bind(this)} style="padding:0.5rem 1.2rem; background:var(--bg-secondary, #eee);">Cancelar</button>
            </div>
          </form>
        </dialog>
        <div class="field-group">
          <label>Descripción</label>
          <textarea .value=${this.description} @input=${e => this._handleInput('description', e)} ?disabled=${!this.isEditable}></textarea>
        </div>
        <div class="field-group-row">
          <div class="field-group" style="flex:1;">
            <label>Prioridad</label>
            <select .value=${this.priority} @change=${e => this._handleInput('priority', e)} ?disabled=${!this.isEditable}>
              <option value="">Selecciona</option>
              <option value="Alta">Alta</option>
              <option value="Media">Media</option>
              <option value="Baja">Baja</option>
            </select>
          </div>
          <div class="field-group" style="flex:1;">
            <label>Estado</label>
            <select .value=${this.status} @change=${e => this._handleInput('status', e)} ?disabled=${!this.isEditable}>
              <option>Pendiente</option>
              <option>En curso</option>
              <option>Superado</option>
              <option>Fallado</option>
            </select>
          </div>
          <div class="field-group" style="flex:1;">
            <label>Tipo de defecto</label>
            <select .value=${this.defectType} @change=${e => this._handleInput('defectType', e)} ?disabled=${!this.isEditable}>
              <option value="">Selecciona</option>
              <option>Visual</option>
              <option>Funcional</option>
              <option>De contenido</option>
              <option>De rendimiento</option>
            </select>
          </div>
        </div>
        <div class="field-group">
          <label>Pasos a realizar</label>
          <textarea .value=${this.steps} @input=${e => this._handleInput('steps', e)} ?disabled=${!this.isEditable}></textarea>
        </div>
        <div class="field-group-row">
          <div class="field-group" style="flex:1;">
            <label>Resultado actual</label>
            <textarea .value=${this.actualResult} @input=${e => this._handleInput('actualResult', e)} ?disabled=${!this.isEditable}></textarea>
          </div>
          <div class="field-group" style="flex:1;">
            <label>Resultado esperado</label>
            <textarea .value=${this.expectedResult} @input=${e => this._handleInput('expectedResult', e)} ?disabled=${!this.isEditable}></textarea>
          </div>
        </div>
        <div class="card-footer">
          <button class="save-button" @click=${this._handleSave} ?disabled=${!this.canSave}>Save</button>
        </div>
      </div>
    `;
  }

  /**
   * Obtiene el nombre de la suite basándose en suiteId
   * @returns {string} - Nombre de la suite o cadena vacía
   */
  getSuiteName() {
    if (!this.suiteId || !this.suitesList || this.suitesList.length === 0) {
      return '';
    }
    const suite = this.suitesList.find(s => String(s.id) === String(this.suiteId));
    return suite ? suite.name : '';
  }

  /**
   * Expande la tarjeta.
   */
  expandCard() {
    this.expanded = true;
  }

  /**
   * Maneja cambios en los campos de entrada.
   * @param {string} field
   * @param {Event} e
   */
  _handleInput(field, e) {
    this[field] = e.target.value;
  }

  /**
   * Maneja la subida de archivos adjuntos.
   * @param {Event} e
   */
  _handleFileChange(e) {
    const files = Array.from(e.target.files);
    this.attachments = files;
  }

  /**
   * Devuelve si la tarjeta puede guardarse.
   * @returns {boolean}
   */
  get canSave() {
    return this.canEdit && this.title.trim() && this.status;
  }

  /**
   * Devuelve si la tarjeta puede eliminarse.
   * @returns {boolean}
   */
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

    const permissions = permissionService.getCardPermissions(this, 'qa');
    // Si el año es de solo lectura, no se puede borrar
    return permissions.canDelete && !this.isYearReadOnly;
  }

  /**
   * Lanza el evento para guardar la tarjeta QA y cierra el modal igual que TaskCard.
   */
  _handleSave() {
    if (!this.canSave) {
      this._showNotification('No se puede guardar: datos inválidos o sin permisos', 'error');
      return;
    }

    // Demo mode: block saves
    if (demoModeService.isDemo()) {
      demoModeService.showFeatureDisabled('editing');
      return;
    }

    // Activar estado de guardado y overlay del padre
    this.isSaving = true;
    this._showSavingOverlay();

    try {
      const cardProps = this.getWCProps();
      cardProps.expanded = false;
      cardProps.suiteId = this.suiteId || '';
      document.dispatchEvent(new CustomEvent('save-card', {
        detail: {
          cardData: cardProps
        }
      }));
      this.expanded = false;
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('close-modal', { bubbles: true, composed: true, detail: { contentElementId: this.id, contentElementType: 'qa-card' } }));
      }, 100);

      // Actualizar la tarjeta compacta original que está fuera del modal
      this._updateOriginalCard(cardProps);
    } catch (error) {
      console.error('[QACard] _handleSave error:', error);
      this._showNotification('Error saving card', 'error');
    } finally {
      this._hideSavingOverlay();
      this.isSaving = false;
    }
  }

  /**
   * Actualiza la tarjeta compacta original que está en la vista principal
   * con los valores que se acaban de guardar.
   */
  _updateOriginalCard(savedData) {
    const firebaseId = this.getIdForFirebase();
    if (!firebaseId) {
return;
    }

    // Buscar la tarjeta original fuera del modal por data-id (Firebase ID)
    const originalCard = document.querySelector(`qa-card[data-id="${firebaseId}"]:not([expanded])`);

    if (originalCard && originalCard !== this) {
// Actualizar las propiedades de la tarjeta original
      Object.keys(savedData).forEach(key => {
        if (originalCard.constructor.properties?.[key]) {
          originalCard[key] = savedData[key];
        }
      });

      // Forzar actualización visual
      originalCard.requestUpdate();
    }
  }

  /**
   * Devuelve las propiedades de la tarjeta.
   * @returns {Object}
   */
  getWCProps() {
    return this._buildPersistentProps(QA_SCHEMA.PERSISTENT_FIELDS);
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

  _confirmDelete() {
    const cardProps = this.getWCProps();
    document.dispatchEvent(new CustomEvent('delete-card', {
      detail: {
        cardData: cardProps
      }
    }));
  }

  /**
   * Asigna los datos de la tarjeta a las propiedades del componente.
   * @param {Object} cardData - Datos de la tarjeta.
   */
  setCardData(cardData) {
    Object.keys(cardData).forEach(key => {
      if (key in this) {
        if (key === 'suiteId') {
          this[key] = String(cardData[key]); // Asegurar que suiteId sea string
        } else {
          this[key] = cardData[key];
        }
      }
    });
    this.requestUpdate();
  }

  /**
   * Copia la URL del test QA al portapapeles y muestra una notificación.
   */
  copyCardUrl() {
    this._copyQAUrl();
  }

  _copyQAUrl() {
    const baseUrl = `${window.location.origin}/adminproject/?projectId=${encodeURIComponent(this.projectId)}&cardId=${this.cardId}#qa`;
    navigator.clipboard.writeText(baseUrl).then(() => {
      const notification = document.createElement('slide-notification');
      notification.message = 'Enlace del test QA copiado al portapapeles';
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
   * Override: Campos editables específicos de QACard
   * @returns {Object} Estado actual de campos editables
   */
  _getEditableState() {
    return {
      ...super._getEditableState(),
      associatedTaskId: this.associatedTaskId || '',
      steps: this.steps || '',
      actualResult: this.actualResult || '',
      expectedResult: this.expectedResult || '',
      defectType: this.defectType || '',
      attachments: JSON.stringify(this.attachments || []),
      suiteId: this.suiteId || ''
    };
  }
}

customElements.define('qa-card', QACard); 

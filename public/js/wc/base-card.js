import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { format, parse, isValid } from 'https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm';
import { ServiceCommunicator } from '../utils/service-communicator.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { demoModeService } from '../services/demo-mode-service.js';

/**
 * Clase base para todos los componentes de tarjetas (Cards)
 * Contiene funcionalidad común como gestión de modales, formateo de fechas, 
 * copiado de URLs, y manejo básico de guardado/eliminación
 */
export class BaseCard extends LitElement {
  // SISTEMA CENTRALIZADO DE CONFIGURACION - UNA SOLA VEZ PARA TODAS LAS CARDS
  static _notificationConfigs = null;
  static _permissionsListenerRegistered = false;
  static _processingNotifications = false;
  static _pendingNotifications = [];
  static _notificationBatchTimeout = null;

  static _initGlobalNotificationConfigs() {
    if (BaseCard._notificationConfigs) return BaseCard._notificationConfigs;
    
    // Configuración GLOBAL por tipo de card - cargada UNA SOLA VEZ
    BaseCard._notificationConfigs = {
      'task-card': {
        userFields: {
          developer: { type: 'assignment', notifyOn: ['change'] },
          validator: { type: 'assignment', notifyOn: ['change'] }
        },
        statusFields: {
          status: { notifyUsers: ['developer', 'validator'] }
        },
        priorityFields: {
          businessPoints: { notifyUsers: ['developer', 'validator'] },
          devPoints: { notifyUsers: ['developer', 'validator'] }
        }
      },
      'bug-card': {
        userFields: {
          developer: { type: 'assignment', notifyOn: ['change'] }
        },
        statusFields: {
          status: { notifyUsers: ['developer'] },
          priority: { notifyUsers: ['developer'] }
        }
      },
      'epic-card': {
        userFields: {
          stakeholdersSelected: { type: 'multiAssignment', notifyOn: ['change'] }
        },
        statusFields: {},
        priorityFields: {}
      },
      'qa-card': {
        userFields: {},
        statusFields: {
          status: { notifyUsers: [] },
          priority: { notifyUsers: [] }
        }
      },
      'proposal-card': {
        userFields: {},
        statusFields: {},
        priorityFields: {}
      },
      'sprint-card': {
        userFields: {},
        statusFields: {},
        priorityFields: {}
      }
    };
return BaseCard._notificationConfigs;
  }

  // EVENT DELEGATION - UN SOLO LISTENER PARA TODAS LAS CARDS
  static _handleGlobalPermissionsUpdate(e) {
    const { canEdit, viewMode } = e.detail;
// Actualizar TODAS las cards (expandidas y compactas) para botones de borrar
    const allCards = document.querySelectorAll('epic-card, sprint-card, bug-card, task-card, proposal-card');
allCards.forEach(card => {
      const newPermission = canEdit || false;

      // Actualizar permisos y viewMode
      card.canEditPermission = newPermission;
      card.currentViewMode = viewMode;
      
      // Incrementar versión para forzar recálculo de getters canDelete
      card._permissionsVersion = (card._permissionsVersion || 0) + 1;
      
      // Forzar re-render para actualizar botones de borrar
      if (card.requestUpdate) {
        card.requestUpdate();
      }
});
}

  // EVENT DELEGATION - Handler for year-based permissions (all card types)
  static _handleYearPermissionsUpdate(e) {
    const { isYearReadOnly } = e.detail;
// Update ALL card types for year-based read-only mode
    const allCards = document.querySelectorAll('sprint-card, epic-card, task-card, bug-card, proposal-card, qa-card');

    allCards.forEach(card => {
      card.isYearReadOnly = isYearReadOnly;

      // Increment version to force recalculation of canEdit getter
      card._permissionsVersion = (card._permissionsVersion || 0) + 1;

      // Force re-render to update UI
      if (card.requestUpdate) {
        card.requestUpdate();
      }
});
}

  static get properties() {
    return {
      // Propiedades core comunes a todas las cards
      id: { type: String, reflect: true },
      firebaseId: { type: String }, // Firebase database key - critical for updates vs inserts
      cardId: { type: String, reflect: true, attribute: 'card-id' },
      title: { type: String },
      description: { type: String },
      notes: { type: String },
      isEditable: { type: Boolean },
      expanded: { type: Boolean, reflect: true },
      selected: { type: Boolean, reflect: true },
      
      // Propiedades de fechas
      startDate: { type: String },
      endDate: { type: String },
      
      // Propiedades de usuario y permisos
      userEmail: { type: String },
      createdBy: { type: String },
      user: { type: Object },
      currentViewMode: { type: String }, // Modo de vista reactivo
      _permissionsVersion: { type: Number }, // Versión para forzar recálculo de permisos
      
      // Propiedades de proyecto y organización
      projectId: { type: String },
      group: { type: String },
      cardType: { type: String },
      
      // Estado de cambios
      
      // Permisos de edición (reactivo)
      canEditPermission: { type: Boolean },
      isYearReadOnly: { type: Boolean },
      
      // Estado de guardado
      isSaving: { type: Boolean },

      // Modo de renderizado de la card: 'compact' | 'ultra-compact'
      viewMode: { type: String, reflect: true, attribute: 'view-mode' },

      // Pipeline tracking
      pipelineStatus: { type: Object },
      commitsCount: { type: Number },
    };
  }

  constructor() {
    super();
    
    // Inicializar propiedades básicas
    this.id = '';
    this.firebaseId = '';
    this.cardId = '';
    this.title = '';
    this.description = '';
    this.notes = '';
    this.isEditable = true;
    this.expanded = false;
    this.selected = false;
    this.startDate = '';
    this.endDate = '';
    this.userEmail = '';
    this.createdBy = '';
    this.user = {};
    // Inicializar projectId desde variable global si existe
    this.projectId = globalThis.currentProjectId || '';
    this.group = '';
    this.cardType = this.tagName.toLowerCase();
    
    // Sistema simple de detección de cambios
    this._initialState = null;

    this.canEditPermission = false; // Por defecto NO puede editar
    // Inicializar isYearReadOnly basado en el año seleccionado y si el usuario tiene permisos
    // Las cards de años pasados son read-only por defecto (excepto para superadmin)
    this.isYearReadOnly = this._getInitialYearReadOnly();
    this.isSaving = false;
    this.viewMode = 'compact'; // Default view mode: 'compact' | 'ultra-compact'
    this.pipelineStatus = null;
    this.commitsCount = 0;

    // ID para Firebase (separado del ID DOM)
    this._firebaseId = '';

    // Sistema de notificaciones - SIMPLIFICADO
    this._fieldChangeTrackers = new Map();
    this._pendingNotifications = [];
    this._isProcessingNotifications = false;

    // Bind common methods
    this.showDeleteModal = this.showDeleteModal.bind(this);
    this._confirmDelete = this._confirmDelete.bind(this);
    this._handleGenericCardSaved = this._handleGenericCardSaved.bind(this);
  }

  // Getter y setter para Firebase ID - SIN FALLBACKS
  get firebaseId() {
    return this._firebaseId || '';
  }
  
  set firebaseId(value) {
    this._firebaseId = value;
    if (value) {
      this.setAttribute('data-id', value);
      // NO actualizar cardId - debe mantener el ID interno del proyecto
    }
  }

  // Helper para obtener el ID correcto para guardado
  getIdForFirebase() {
    return this.firebaseId;
  }

  /**
   * Get initial year read-only status based on selected year
   * Past years are read-only by default (unless superadmin)
   * @returns {boolean}
   */
  _getInitialYearReadOnly() {
    try {
      const savedYear = localStorage.getItem('selectedYear');
      const selectedYear = savedYear ? Number(savedYear) : new Date().getFullYear();
      const currentYear = new Date().getFullYear();
      const isPastYear = selectedYear < currentYear;

      // Check if user is superadmin (can edit past years)
      // superAdminEmail is defined in firebase-config.js and exposed as window variable
      const superAdminEmail = (window.superAdminEmail || '').toString().trim().toLowerCase();
      const currentUserEmail = (document.body?.dataset?.userEmail || '').toString().trim().toLowerCase();

      const isSuperAdmin = superAdminEmail && currentUserEmail === superAdminEmail;

      if (!isPastYear) {
        return false; // Current year is always editable
      }

      // Past year + not superadmin = read only
      return !isSuperAdmin;
    } catch (error) {
      // On any error, default to editable (safer for UX)
      return false;
    }
  }

  /**
   * Getter para determinar si la card puede ser guardada
   * Considera permisos de usuario y modo de vista
   * Override en clases hijas para lógica específica
   */
  get canSave() {
    return this.canEdit && this.title.trim() && !this.isSaving;
  }

  /**
   * Getter para determinar si la card puede ser editada
   * Usa el estado reactivo de permisos y el estado del año
   */
  get canEdit() {
    return this.isEditable && this.canEditPermission && !this.isYearReadOnly;
  }

  /**
   * Getter para determinar si la card puede ser movida a otro proyecto
   * Solo admins (isResponsable) pueden mover cards
   * Solo Tasks, Bugs y Proposals pueden moverse (no Sprints ni Epics)
   * Solo cards en estado "To Do" pueden moverse
   */
  get canMoveToProject() {
    // Solo admins pueden mover
    const userRole = window.currentUserRole || { isResponsable: false };
    if (!userRole.isResponsable) return false;

    // No se puede mover si el año es read-only
    if (this.isYearReadOnly) return false;

    // Solo Tasks, Bugs y Proposals pueden moverse
    const movableTypes = ['task-card', 'bug-card', 'proposal-card'];
    if (!movableTypes.includes(this.cardType)) return false;

    // No se puede mover si no tiene ID válido (card nueva sin guardar)
    if (!this.cardId || this.cardId.startsWith('temp_')) return false;

    // Solo cards en estado "To Do" pueden moverse
    const status = (this.status || '').toLowerCase().replace(/\s+/g, '');
    if (status !== 'todo') return false;

    return true;
  }

  /**
   * Método genérico para solicitar permisos con lógica de ownership
   * Usado por cards que permiten edición por propietario (ProposalCard, QACard)
   * 
   * Lógica: Los admins pueden editar cualquier card, los usuarios pueden editar sus propias cards
   */
  _requestOwnershipPermissions() {
const permissionRequest = new CustomEvent('request-ownership-permissions', {
      detail: {
        cardId: this.cardId,
        cardType: this.cardType,
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

  /**
   * Método genérico para manejar requestUpdate con solicitud de permisos
   * Usado por cards que requieren permisos de ownership al expandirse
   * 
   * Uso: Override requestUpdate() en clases hijas llamando a este método
   * Ejemplo: return this._handleRequestUpdateWithOwnershipPermissions(name, oldValue, options);
   */
  _handleRequestUpdateWithOwnershipPermissions(name, oldValue, options) {
    // Si se está expandiendo la card, pedir permisos después del render
    if (name === 'expanded' && this.expanded && !oldValue) {
      this.updateComplete.then(() => this._requestOwnershipPermissions());
    }

    return super.requestUpdate(name, oldValue, options);
  }

  /**
   * Formatea una fecha para mostrar en formato DD/MM/YYYY
   * Maneja múltiples formatos de entrada
   * @param {string} inputDate - Fecha en formato ISO o similar
   * @returns {string} Fecha formateada o cadena vacía
   */
  formatDate(inputDate) {
    if (!inputDate) return '';
    
    // Si ya está en el formato correcto, devolverlo
    if (typeof inputDate === 'string' && inputDate.includes('/')) {
      return inputDate;
    }
    
    // Intentar parsear la fecha
    const dateStr = typeof inputDate === 'string' ? inputDate.split('T')[0] : inputDate;
    const possibleFormats = ['yyyy-MM-dd', 'd/M/yyyy', 'dd/MM/yyyy', 'M/d/yyyy', 'MM/dd/yyyy'];
    
    let parsedDate = null;
    for (const fmt of possibleFormats) {
      parsedDate = parse(dateStr, fmt, new Date());
      if (isValid(parsedDate)) break;
    }
    
    if (!isValid(parsedDate)) return 'Invalid Date';
    return format(parsedDate, 'dd/MM/yyyy');
  }

  /**
   * Genera una URL única para la card basada en su tipo
   * Override en clases hijas para URLs específicas
   * @returns {string} URL de la card
   */
  generateCardUrl() {
    const baseUrl = window.location.origin;
    const cardType = this.cardType.replace('-card', '');
    const sectionMap = {
      'task': 'tasks',
      'bug': 'bugs', 
      'epic': 'epics',
      'proposal': 'proposals',
      'qa': 'qa',
      'sprint': 'sprints'
    };
    const section = sectionMap[cardType] || cardType;
    return `${baseUrl}/adminproject/?projectId=${encodeURIComponent(this.projectId)}&cardId=${this.cardId}#${section}`;
  }

  /**
   * Copia la URL de la card al portapapeles
   */
  async copyCardUrl() {
    console.log('copyCardUrl called');
    try {
      const url = this.generateCardUrl();
      console.log('URL generated:', url);
      await navigator.clipboard.writeText(url);
      console.log('Clipboard write success, showing notification');
      this._showNotification('Enlace copiado al portapapeles', 'success');
    } catch (error) {
      console.error('Error copying URL:', error);
      this._showNotification('Error al copiar enlace', 'error');
    }
  }

  /**
   * Copies the cardId to clipboard
   */
  async _copyCardId(e) {
    e.stopPropagation();
    if (!this.cardId) return;
    try {
      await navigator.clipboard.writeText(this.cardId);
      this._showNotification(`ID ${this.cardId} copiado`, 'success');
    } catch {
      this._showNotification('Error al copiar ID', 'error');
    }
  }

  /**
   * Renders pipeline status badges (C=Committed, PR=Pull Request, M=Merged, D=Deployed)
   * @returns {TemplateResult|string} Badge HTML or empty string
   */
  _renderPipelineBadges() {
    const commitsLen = (Array.isArray(this.commits) && this.commits.length > 0) ? this.commits.length : (this.commitsCount || 0);
    const hasCommits = commitsLen > 0;
    const ps = this.pipelineStatus;
    const hasPR = ps?.prCreated;
    const hasMerged = ps?.merged;
    const hasDeployed = ps?.deployed;

    if (!hasCommits && !hasPR && !hasMerged && !hasDeployed) return '';

    return html`<span class="pipeline-badges">${hasCommits ? html`<span class="pipeline-badge commit" title="Commits: ${commitsLen}">C</span>` : ''}${hasPR ? html`<a class="pipeline-badge pr" href="${ps.prCreated.prUrl || '#'}" target="_blank" rel="noopener" title="PR #${ps.prCreated.prNumber || ''}" @click=${(e) => e.stopPropagation()}>PR</a>` : ''}${hasMerged ? html`<span class="pipeline-badge merge" title="Merged: ${ps.merged.date || ''}">M</span>` : ''}${hasDeployed ? html`<span class="pipeline-badge deploy" title="Deployed: ${ps.deployed.environment || ''} ${ps.deployed.version || ''}">D</span>` : ''}</span>`;
  }

  /**
   * Muestra una notificación al usuario
   * @param {string} message - Mensaje a mostrar
   * @param {string} type - Tipo de notificación ('success', 'error', 'info')
   */
  _showNotification(message, type = 'info') {
    const notification = document.createElement('slide-notification');
    notification.message = message;
    notification.type = type;
    document.body.appendChild(notification);
  }

  /**
   * Muestra el overlay de guardado
   */
  _showSavingOverlay(message = 'Guardando...') {
    const existingOverlay = document.getElementById('saving-overlay');
    if (existingOverlay) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'saving-overlay';
    overlay.innerHTML = `
      <div class="saving-content">
        <div class="spinner"></div>
        <span>${message}</span>
      </div>
    `;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      font-family: Arial, sans-serif;
    `;
    
    const content = overlay.querySelector('.saving-content');
    const isDark = document.documentElement.classList.contains('dark-theme');
    content.style.cssText = `
      background: ${isDark ? '#1e293b' : 'white'};
      color: ${isDark ? '#f8fafc' : '#333'};
      padding: 2rem;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, ${isDark ? '0.4' : '0.1'});
    `;
    
    const spinner = overlay.querySelector('.spinner');
    spinner.style.cssText = `
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;
    
    // Agregar keyframes para la animación del spinner
    if (!document.getElementById('spinner-styles')) {
      const style = document.createElement('style');
      style.id = 'spinner-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
  }

  /**
   * Oculta el overlay de guardado
   */
  _hideSavingOverlay() {
    const overlay = document.getElementById('saving-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Muestra el modal de confirmación para eliminar
   */
  showDeleteModal() {
    const modal = document.createElement('confirm-modal');
    modal.options = {
      title: 'Confirmar eliminación',
      message: `¿Estás seguro de que quieres eliminar <b>${this.title}</b>?`,
      button1Text: 'Sí, eliminar',
      button2Text: 'Cancelar',
      button1css: 'background-color: #d9534f; color: white;',
      button2css: 'background-color: #6c757d; color: white;',
      button1Action: () => this._confirmDelete(),
      button2Action: () => {} // No hacer nada al cancelar
    };
    document.body.appendChild(modal);
  }

  /**
   * Confirma y ejecuta la eliminación de la card
   * Override en clases hijas para lógica específica
   */
  _confirmDelete() {
// Emitir evento de eliminación
    const event = new CustomEvent('delete-card', {
      detail: { 
        cardId: this.cardId, 
        cardType: this.cardType,
        card: this,
        confirmed: true
      },
      bubbles: true
    });
    this.dispatchEvent(event);
  }

  /**
   * Maneja el evento de guardado de la card
   * Override en clases hijas para lógica específica
   */
  _handleSave() {
    // Demo mode: block saves
    // Always hide overlay on early returns — child classes may have shown it
    // before calling super._handleSave()
    if (demoModeService.isDemo()) {
      demoModeService.showFeatureDisabled('editing');
      this.isSaving = false;
      this._hideSavingOverlay();
      return;
    }

    if (!this.canSave) {
      console.warn('[BaseCard] Cannot save: canSave=false', {
        canEdit: this.canEdit,
        isEditable: this.isEditable,
        canEditPermission: this.canEditPermission,
        isYearReadOnly: this.isYearReadOnly,
        hasTitle: !!this.title?.trim(),
        isSaving: this.isSaving
      });
      this._showNotification('No se puede guardar: datos inválidos o sin permisos', 'error');
      this._hideSavingOverlay();
      return;
    }

    // CRITICAL: Validate firebaseId for existing cards to prevent duplicates
    // A card is "existing" if it has a non-temporary cardId
    const isExistingCard = this.cardId && !this.cardId.startsWith('temp_') && !this.cardId.includes('temp');
    let hasFirebaseId = this._firebaseId && this._firebaseId.trim() !== '';

    // If firebaseId is missing but id has a valid Firebase key, copy it
    // This handles legacy data where firebaseId wasn't propagated correctly
    if (isExistingCard && !hasFirebaseId && this.id && this.id.startsWith('-')) {
      console.warn('[BaseCard] Correcting legacy data: copying id to firebaseId', {
        cardId: this.cardId,
        id: this.id
      });
      this._firebaseId = this.id;
      hasFirebaseId = true;
    }

    if (isExistingCard && !hasFirebaseId) {
      console.error('[BaseCard] CRITICAL: Existing card missing firebaseId - would create duplicate!', {
        cardId: this.cardId,
        firebaseId: this._firebaseId,
        id: this.id
      });
      this._showNotification(
        'Error: Esta tarjeta no tiene firebaseId. Contacta al administrador para migrar los datos.',
        'error'
      );
      this._hideSavingOverlay();
      return;
    }

    // Activar estado de guardado y overlay del padre
    this.isSaving = true;
    this._showSavingOverlay();

    try {
      const cardProps = this.getWCProps();
      cardProps.expanded = false;
      // Stamp the current user so Cloud Functions know who made the change
      cardProps.updatedBy = document.body?.dataset?.userEmail || '';

      document.dispatchEvent(new CustomEvent('save-card', {
        detail: {
          cardData: cardProps
        }
      }));

      // Actualizar la tarjeta compacta original que está fuera del modal
      this._updateOriginalCard(cardProps);

      // Marcar como guardado para que hasChanges() devuelva false
      this.markAsSaved();

      // Emitir evento genérico de que la card se guardó exitosamente
      document.dispatchEvent(new CustomEvent('card-saved-successfully', {
        bubbles: true,
        composed: true,
        detail: {
          tagName: this.tagName.toLowerCase(),
          cardId: this.cardId,
          elementId: this.id,
          cardData: this.getCardData()
        }
      }));

      // NUEVO: También emitir el evento local para cerrar modales

      // Disparar el evento desde document para asegurar que AppModal lo reciba
      document.dispatchEvent(new CustomEvent('card-save-success', {
        detail: {
          cardId: this.id || this.cardId,
          sourceElement: this,
          isNewCard: this.cardId?.includes('temp_') || !this.id
        },
        bubbles: true,
        composed: true
      }));

      // También disparar desde el elemento por compatibilidad
      this.dispatchEvent(new CustomEvent('card-save-success', {
        detail: { cardId: this.id || this.cardId },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('[BaseCard] _handleSave error:', error);
      this._showNotification('Error saving card', 'error');
    } finally {
      this._hideSavingOverlay();
      this.isSaving = false;
    }
  }

  _updateOriginalCard(savedData) {
    if (!this.id) {
return;
    }

    const firebaseId = this.getIdForFirebase();
    const originalCard = document.querySelector(`${this.tagName.toLowerCase()}[data-id="${firebaseId}"]:not([expanded])`);

    if (originalCard && originalCard !== this) {
Object.keys(savedData).forEach(key => {
        if (originalCard.constructor.properties?.[key]) {
          originalCard[key] = savedData[key];
        }
      });

      originalCard.requestUpdate();
    }
  }

  renderCompactHeader() {
    return html`
      <div class="card-header">
        <div class="title" title="${this.title || ''}">${this.title || ''}</div>
        <div class="card-id-row">
          <div class="cardid" title="Click para copiar ID" style="cursor:pointer" @click=${this._copyCardId}>${this.cardId || ''}</div>
          <div class="card-actions">
            ${this.attachment ? html`<span class="attachment-indicator" title="Tiene archivo adjunto">📎</span>` : ''}
            <button class="copy-link-button" title="Copiar enlace" @click=${this.copyCardUrl}>🔗</button>
            ${this.canDelete ? html`<button class="delete-button" @click=${this.showDeleteModal}>🗑️</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderExpandedHeader() {
    return html`
      <div class="card-header">
        <section style="display:flex; flex-direction:row; width:100%; justify-content: flex-start; gap: 1rem; align-items: center;">
          <input
            for="title"
            type="text"
            class="title"
            .value=${this.title}
            title=${this.title}
            @input=${this._handleTitleChange}
            placeholder="Escriba aquí el título..."
            autofocus
            aria-label="Title"
            ?disabled=${!this.isEditable}
          />
          <span class="cardid-badge" title="Click para copiar ID" style="cursor:pointer" @click=${this._copyCardId}>${this.cardId || ''}</span>
          ${this._renderPipelineBadges()}
        </section>
      </div>
    `;
  }

  _handleTitleChange(e) {
    this.title = e.target.value;
  }

  _handleDescriptionChange(e) {
    this.description = e.target.value;
  }

  _handleNotesChange(e) {
    this.notes = e.target.value;
  }

  _handleAcceptanceCriteriaChange(e) {
    this.acceptanceCriteria = e.target.value;
  }

  /**
   * Obtiene los datos de la card para guardado
   * Override en clases hijas para incluir propiedades específicas
   * @returns {Object} Datos de la card
   */
  getCardData() {
    return {
      id: this.id,
      cardId: this.cardId,
      title: this.title,
      description: this.description,
      notes: this.notes,
      startDate: this.startDate,
      endDate: this.endDate,
      createdBy: this.createdBy,
      projectId: this.projectId,
      group: this.group,
      cardType: this.cardType
    };
  }

  // ==================== SISTEMA DE DETECCIÓN DE CAMBIOS ====================

  /**
   * Obtiene el estado actual de los campos editables
   * Las cards hijas hacen override para definir sus campos específicos
   * @returns {Object} Estado actual de campos editables
   */
  _getEditableState() {
    return {
      title: this.title || '',
      description: this.description || '',
      notes: this.notes || '',
      status: this.status || '',
      priority: this.priority || ''
    };
  }

  /**
   * Captura el estado inicial de la card (llamar cuando se abre para edición)
   */
  captureInitialState() {
    const state = this._getEditableState();
    this._initialState = JSON.stringify(state);
  }

  /**
   * Verifica si hay cambios sin guardar
   * @returns {boolean} True si hay cambios pendientes
   */
  hasChanges() {
    if (!this._initialState) {
      return false;
    }
    const currentState = this._getEditableState();
    const currentSerialized = JSON.stringify(currentState);
    return this._initialState !== currentSerialized;
  }

  /**
   * Marca la card como guardada (resetea el estado inicial)
   * Llamar después de guardar exitosamente
   */
  markAsSaved() {
    this.captureInitialState();
  }

  /**
   * Método llamado después de que el componente se actualice
   */
  updated(changedProperties) {
    super.updated(changedProperties);

    // Capturar estado inicial cuando la card se expande para edición
    if (changedProperties.has('expanded') && this.expanded && !this._initialState) {
      // Dar tiempo para que todas las propiedades se establezcan
      setTimeout(() => {
        this.captureInitialState();
      }, 100);
    }
  }

  /**
   * Obtiene las propiedades del Web Component para serialización
   * @returns {Object} Propiedades del componente
   */
  getWCProps() {
    const props = {};
    const properties = this.constructor.properties;

    Object.keys(properties).forEach(key => {
      const value = this[key];
      // Skip undefined, null, and empty strings for critical ID fields
      // Empty strings for firebaseId/id cause duplicate card creation
      if (value !== undefined && value !== null) {
        // For firebaseId and id, only include if non-empty string
        if ((key === 'firebaseId' || key === 'id') && value === '') {
          return; // Skip empty ID fields
        }
        props[key] = value;
      }
    });

    // Ensure firebaseId is set if id has a valid Firebase key (legacy data correction)
    if (!props.firebaseId && props.id && props.id.startsWith('-')) {
      props.firebaseId = props.id;
    }

    return props;
  }

  /**
   * Builds a props object from schema-defined persistent fields.
   * Used by subclasses to replace manual field listing in getWCProps().
   * @param {string[]} persistentFields - Array of field names from the schema
   * @returns {Object} Props object with non-null/undefined values
   */
  _buildPersistentProps(persistentFields) {
    const props = {};
    for (const key of persistentFields) {
      const value = this[key];
      if (value !== undefined && value !== null) {
        if ((key === 'firebaseId' || key === 'id') && value === '') continue;
        props[key] = value;
      }
    }
    const fbId = this.getIdForFirebase();
    if (fbId) {
      props.firebaseId = fbId;
      props.id = fbId;
    }
    return props;
  }

  /**
   * Expande o colapsa la card
   */
  toggleExpanded() {
    this.expanded = !this.expanded;
    
    // Emitir evento de cambio de estado
    const event = new CustomEvent('card-expanded-changed', {
      detail: { 
        cardId: this.cardId, 
        expanded: this.expanded,
        card: this 
      },
      bubbles: true
    });
    this.dispatchEvent(event);
  }

  // ==================== MOVER CARD A OTRO PROYECTO ====================

  /**
   * Inicia el flujo para mover la card a otro proyecto
   * Verifica permisos y si tiene sprint asignado
   * @param {Event} event - Evento del click
   */
  _handleMoveToProject(event) {
    event?.stopPropagation();

    if (!this.canMoveToProject) {
      this._showNotification('No tienes permisos para mover esta card', 'error');
      return;
    }

    // Verificar si tiene sprint asignado
    if (this.sprint && this.sprint.trim() !== '') {
      this._showMoveWithSprintWarning();
      return;
    }

    this._requestProjectsForMove();
  }

  /**
   * Muestra advertencia si la card tiene sprint asignado
   */
  _showMoveWithSprintWarning() {
    const modal = document.createElement('confirm-modal');
    modal.options = {
      title: 'Tarea en Sprint',
      message: `Esta tarea está asignada al sprint <b>${this.sprint}</b>.<br><br>Si la mueves, se eliminará la asignación del sprint. ¿Deseas continuar?`,
      button1Text: 'Sí, mover',
      button2Text: 'Cancelar',
      button1css: 'background-color: #f0ad4e; color: white;',
      button2css: 'background-color: #6c757d; color: white;',
      button1Action: () => this._requestProjectsForMove(),
      button2Action: () => {}
    };
    document.body.appendChild(modal);
  }

  /**
   * Solicita la lista de proyectos disponibles para mover
   */
  _requestProjectsForMove() {
    document.dispatchEvent(new CustomEvent('request-available-projects', {
      detail: {
        currentProjectId: this.projectId,
        callback: (projects) => this._showMoveToProjectModal(projects)
      },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Muestra modal para seleccionar proyecto destino
   * @param {Array} projects - Lista de proyectos disponibles (array de objetos con id y name)
   */
  _showMoveToProjectModal(projects) {
    if (!projects || projects.length === 0) {
      this._showNotification('No hay proyectos disponibles', 'warning');
      return;
    }

    // Filtrar proyecto actual de la lista
    const availableProjects = projects.filter(project => project.name !== this.projectId);

    if (availableProjects.length === 0) {
      this._showNotification('No hay otros proyectos disponibles', 'warning');
      return;
    }

    // Crear modal overlay
    const modal = document.createElement('div');
    modal.className = 'move-project-modal-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    const isDarkModal = document.documentElement.classList.contains('dark-theme');
    modalContent.style.cssText = `
      background: ${isDarkModal ? '#1e293b' : 'white'};
      color: ${isDarkModal ? '#f8fafc' : '#333'};
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 4px 16px rgba(0,0,0,${isDarkModal ? '0.5' : '0.2'});
      min-width: 400px;
      max-width: 500px;
      position: relative;
    `;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 15px;
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: ${isDarkModal ? '#94a3b8' : '#999'};
    `;
    closeBtn.onclick = () => modal.remove();

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Mover a otro proyecto';
    title.style.cssText = `margin: 0 0 1rem 0; color: ${isDarkModal ? '#f8fafc' : '#333'};`;

    // Message
    const message = document.createElement('p');
    message.innerHTML = `Mover <b>${this.cardId}</b> a:`;
    message.style.cssText = `margin: 0 0 1rem 0; color: ${isDarkModal ? '#e2e8f0' : '#666'};`;

    // Project selector
    const projectSelect = document.createElement('select');
    projectSelect.style.cssText = `
      width: 100%;
      padding: 0.75rem;
      border: 1px solid ${isDarkModal ? '#475569' : '#ddd'};
      border-radius: 4px;
      font-size: 1rem;
      margin-bottom: 1.5rem;
      background: ${isDarkModal ? '#0f172a' : '#fff'};
      color: ${isDarkModal ? '#f8fafc' : '#333'};
    `;

    // Default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Selecciona un proyecto --';
    projectSelect.appendChild(defaultOption);

    // Add project options
    availableProjects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.name;
      option.textContent = project.name;
      projectSelect.appendChild(option);
    });

    // Buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 1rem; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.cssText = `
      padding: 0.75rem 1.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f5f5f5;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => modal.remove();

    const moveBtn = document.createElement('button');
    moveBtn.textContent = 'Mover';
    moveBtn.style.cssText = `
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 4px;
      background: #4CAF50;
      color: white;
      cursor: pointer;
    `;
    moveBtn.disabled = true;

    projectSelect.onchange = () => {
      moveBtn.disabled = !projectSelect.value;
    };

    moveBtn.onclick = () => {
      const targetProjectId = projectSelect.value;
      if (targetProjectId) {
        modal.remove(); // Cerrar modal de selección de proyecto

        // Cerrar el modal de la card expandida
        const cardModal = document.querySelector('app-modal');
        if (cardModal) {
          cardModal.remove();
        }

        this._executeMoveToProject(targetProjectId);
      }
    };

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(moveBtn);

    modalContent.appendChild(closeBtn);
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modalContent.appendChild(projectSelect);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }

  /**
   * Ejecuta el movimiento de la card al proyecto destino
   * @param {string} targetProjectId - ID del proyecto destino
   */
  _executeMoveToProject(targetProjectId) {
    this._showSavingOverlay();

    document.dispatchEvent(new CustomEvent('move-card-to-project', {
      detail: {
        card: this.getCardData(),
        sourceProjectId: this.projectId,
        targetProjectId: targetProjectId,
        firebaseId: this.getIdForFirebase(),
        cardType: this.cardType,
        callback: (result) => this._handleMoveResult(result)
      },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Maneja el resultado del movimiento
   * @param {Object} result - Resultado de la operación
   */
  _handleMoveResult(result) {
    this._hideSavingOverlay();

    if (result.success) {
      this._showNotification(
        `Card movida exitosamente a ${result.targetProjectId}. Nuevo ID: ${result.newCardId}`,
        'success'
      );

      // Marcar como guardado para evitar warning de cambios sin guardar
      this.markAsSaved();

      // Cerrar el modal explícitamente - la card ya no existe en este proyecto
      // closest() no atraviesa shadow DOM, buscar el modal que contiene esta card
      const modal = this.closest('app-modal') || this.getRootNode()?.host?.closest('app-modal') || document.querySelector('app-modal');
      if (modal) {
        modal.remove();
      }

      // Refrescar la vista
      document.dispatchEvent(new CustomEvent('refresh-cards-view', {
        detail: { section: this.group }
      }));
    } else {
      this._showNotification(result.error || 'Error al mover la card', 'error');
    }
  }

  /**
   * Conecta event listeners comunes
   */
  connectedCallback() {
    super.connectedCallback();

    // OPTIMIZACIÓN: NO inicializar checksum aquí - solo cuando se expanda la card
    // Esto evita calcular checksums para cientos de cards al cargar

    // Event listener para el sistema de notificaciones genérico
    document.addEventListener('card-saved', this._handleGenericCardSaved);
    document.addEventListener('save-card', this._handleGenericCardSaved);
    
    // Event listener para errores de guardado
    document.addEventListener('card-save-error', this._handleCardSaveError.bind(this));
    
    // Event listener para notificaciones de guardado exitoso
    document.addEventListener('show-slide-notification', this._handleSlideNotification.bind(this));
    
    // Sistema de permisos on-demand: Las cards piden permisos cuando se expanden
    // No es necesario un listener global
    
    // Suscripción a reactividad si la card está expandida y tiene datos válidos
    this._setupRealtimeSubscription();
  }

  /**
   * Lifecycle method called after the element's DOM has been updated
   * Se usa para manejar suscripciones cuando cambia expanded
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    
    // Si cambió la propiedad expanded, asegurar suscripción
    if (changedProperties.has('expanded')) {
      // CAMBIO: Ya no limpiamos la suscripción cuando se contrae
      // Las cards compactas deben mantenerse suscritas para actualizarse
      // Solo nos aseguramos de que esté suscrita si no lo estaba antes
      this._setupRealtimeSubscription();
    }
  }

  /**
   * Desconecta event listeners comunes
   */
  disconnectedCallback() {
    super.disconnectedCallback();

    // Remover event listeners del sistema de notificaciones
    document.removeEventListener('card-saved', this._handleGenericCardSaved);
    
    // Cleanup de suscripción de reactividad
    this._cleanupRealtimeSubscription();
    document.removeEventListener('save-card', this._handleGenericCardSaved);
    
    // Remover event listener de errores de guardado
    document.removeEventListener('card-save-error', this._handleCardSaveError.bind(this));
    
    // Remover event listener de notificaciones de guardado exitoso
    document.removeEventListener('show-slide-notification', this._handleSlideNotification.bind(this));
    
    // NOTA: No removemos el listener global de permisos porque es compartido por todas las cards
    // BaseCard._handleGlobalPermissionsUpdate se mantiene activo para eficiencia
  }

  /**
   * Maneja el clic en la card
   * Override en clases hijas para comportamiento específico
   */
  _handleClick(event) {
    if (!this.expanded) {
      event.stopPropagation();

      // Import and show expanded card in modal
      import('../utils/common-functions.js').then(({ showExpandedCardInModal }) => {
        showExpandedCardInModal(this);
      });

      // Emitir evento de clic
      const clickEvent = new CustomEvent('card-clicked', {
        detail: {
          cardId: this.cardId,
          cardType: this.cardType,
          card: this
        },
        bubbles: true
      });
      this.dispatchEvent(clickEvent);
    }
  }

  /**
   * Renderiza la vista compacta de la card
   * Debe ser implementado por las clases hijas
   */
  renderCompact() {
    return html`
      <div class="card" @click=${this._handleClick}>
        <div class="card-header">
          <h3>${this.title}</h3>
          <div class="card-actions">
            <button class="copy-link-button" @click=${e => { e.stopPropagation(); this.copyCardUrl(); }}>🔗</button>
            ${this.canDelete ? html`<button class="delete-button" @click=${e => { e.stopPropagation(); this.showDeleteModal(); }}>🗑️</button>` : ''}
          </div>
        </div>
        <div class="card-body">
          <p>${this.description}</p>
        </div>
      </div>
    `;
  }

  /**
   * Renderiza la vista ultra-compacta de la card (para Kanban)
   * Debe ser implementado por las clases hijas
   */
  renderUltraCompact() {
    // Vista base ultra-compacta - las clases hijas deben sobrescribir
    const truncatedTitle = this.title?.length > 30 ? this.title.substring(0, 30) + '...' : this.title;
    return html`
      <div class="card ultra-compact" @click=${this._handleClick}>
        <div class="uc-header">
          <span class="uc-cardid">${this.cardId || ''}</span>
        </div>
        <div class="uc-title" title="${this.title || ''}">${truncatedTitle || ''}</div>
      </div>
    `;
  }

  /**
   * Renderiza la vista expandida de la card
   * Debe ser implementado por las clases hijas
   */
  renderExpanded() {
    return html`
      <div class="expanded-content">
        <h2>Expanded view for ${this.title}</h2>
        <p>Override renderExpanded() in child classes</p>
      </div>
    `;
  }

  /**
   * Renderiza el componente según el modo de vista
   */
  render() {
    if (this.expanded) {
      return this.renderExpanded();
    }
    if (this.viewMode === 'ultra-compact') {
      return this.renderUltraCompact();
    }
    return this.renderCompact();
  }

  // ==================== SISTEMA DE NOTIFICACIONES GENÉRICO ====================

  // MÉTODO ELIMINADO: _initNotificationConfig() 
  // Ahora se usa BaseCard._initGlobalNotificationConfigs() que es GLOBAL y EFICIENTE

  /**
   * Rastrea cambios en un campo específico
   * @param {string} fieldName - Nombre del campo
   * @param {any} newValue - Nuevo valor
   * @param {any} oldValue - Valor anterior (opcional)
   */
  _trackFieldChange(fieldName, newValue, oldValue = undefined) {
    if (oldValue === undefined) {
      oldValue = this._fieldChangeTrackers.get(fieldName);
    }
    
    // Solo trackear si realmente cambió el valor
    if (oldValue !== newValue) {
      this._fieldChangeTrackers.set(fieldName, {
        previous: oldValue,
        current: newValue,
        timestamp: Date.now()
      });
      
      // sinsole.log(`🔔 BaseCard: Field ${fieldName} changed from "${oldValue}" to "${newValue}"`);
    }
  }

  /**
   * Método genérico para manejar cambios en campos de usuario
   * OPTIMIZADO: Usa configuración global en lugar de individual por card
   */
  handleUserFieldChange(fieldName, newValue, oldValue) {
// Solo procesar cambios si la card está expandida (en el modal)
    if (!this.expanded) {
return;
    }

    // Obtener configuración GLOBAL una sola vez para este tipo de card
    const globalConfigs = BaseCard._initGlobalNotificationConfigs();
    const cardConfig = globalConfigs[this.cardType];
if (!cardConfig?.userFields[fieldName]) {
return;
    }

    const fieldConfig = cardConfig.userFields[fieldName];
    this._trackFieldChange(fieldName, newValue, oldValue);
    
    if (fieldConfig.notifyOn.includes('change')) {
this._queueUserNotification(fieldName, oldValue, newValue);
    }
  }

  /**
   * Método genérico para manejar cambios en status/priority
   * OPTIMIZADO: Usa configuración global centralizada
   */
  handleStatusPriorityChange(fieldName, newValue, oldValue) {
    // Solo procesar cambios si la card está expandida (en el modal)
    if (!this.expanded) return;

    // Obtener configuración GLOBAL una sola vez para este tipo de card
    const globalConfigs = BaseCard._initGlobalNotificationConfigs();
    const cardConfig = globalConfigs[this.cardType];
    if (!cardConfig) return;
    
    const statusConfig = cardConfig.statusFields?.[fieldName];
    const priorityConfig = cardConfig.priorityFields?.[fieldName];
    const fieldConfig = statusConfig || priorityConfig;
    
    if (!fieldConfig) return;

    this._trackFieldChange(fieldName, newValue, oldValue);
    this._queueStatusPriorityNotification(fieldName, oldValue, newValue, fieldConfig);
  }

  /**
   * Añade una notificación de usuario a la cola
   * @param {string} fieldName - Nombre del campo
   * @param {any} oldValue - Valor anterior
   * @param {any} newValue - Nuevo valor
   */
  _queueUserNotification(fieldName, oldValue, newValue) {
// Obtener configuración global
    const globalConfigs = BaseCard._initGlobalNotificationConfigs();
    const cardConfig = globalConfigs[this.cardType];
    
    if (!cardConfig?.userFields) {
return;
    }
    
    const fieldConfig = cardConfig.userFields[fieldName];
    
    if (!fieldConfig) {
return;
    }
    
    if (fieldConfig.type === 'assignment') {
      // Notificación de asignación simple (un usuario)
      if (newValue && newValue !== oldValue) {
        this._pendingNotifications.push({
          type: 'assignment',
          userEmail: newValue,
          previousUserEmail: oldValue,
          fieldName: fieldName,
          action: newValue ? 'assigned' : 'unassigned'
        });
      }
      
      if (oldValue && oldValue !== newValue) {
        this._pendingNotifications.push({
          type: 'unassignment',
          userEmail: oldValue,
          previousUserEmail: newValue,
          fieldName: fieldName,
          action: 'unassigned'
        });
      }
    } else if (fieldConfig.type === 'multiAssignment') {
      // Notificación de asignación múltiple (array de usuarios)
      const oldUsers = Array.isArray(oldValue) ? oldValue : [];
      const newUsers = Array.isArray(newValue) ? newValue : [];
      
      // Usuarios añadidos
      const addedUsers = newUsers.filter(user => !oldUsers.includes(user));
      addedUsers.forEach(userEmail => {
        this._pendingNotifications.push({
          type: 'assignment',
          userEmail: userEmail,
          fieldName: fieldName,
          action: 'assigned'
        });
      });
      
      // Usuarios removidos
      const removedUsers = oldUsers.filter(user => !newUsers.includes(user));
      removedUsers.forEach(userEmail => {
        this._pendingNotifications.push({
          type: 'unassignment',
          userEmail: userEmail,
          fieldName: fieldName,
          action: 'unassigned'
        });
      });
    }
  }

  /**
   * Añade una notificación de status/priority a la cola
   * @param {string} fieldName - Nombre del campo
   * @param {any} oldValue - Valor anterior
   * @param {any} newValue - Nuevo valor
   * @param {Object} fieldConfig - Configuración del campo
   */
  _queueStatusPriorityNotification(fieldName, oldValue, newValue, fieldConfig) {
    // sinsole.log('🔔 _queueStatusPriorityNotification called:', {
    //   fieldName,
    //   oldValue,
    //   newValue,
    //   fieldConfig,
    //   pendingNotificationsExists: !!this._pendingNotifications,
    //   pendingNotificationsLength: this._pendingNotifications?.length
    // });
    
    if (!fieldConfig.notifyUsers || fieldConfig.notifyUsers.length === 0) {
      // sinsole.log('🔔 No notifyUsers configured for field:', fieldName);
      return;
    }
    
    // Obtener usuarios a notificar basado en la configuración
    const usersToNotify = [];
    fieldConfig.notifyUsers.forEach(userFieldName => {
      const userValue = this[userFieldName];
if (userValue) {
        if (Array.isArray(userValue)) {
          usersToNotify.push(...userValue);
        } else {
          usersToNotify.push(userValue);
        }
      }
    });
    
    // Deduplicar usuarios para evitar notificaciones duplicadas
    const uniqueUsersToNotify = [...new Set(usersToNotify)];
    
    
    // Crear notificaciones para cada usuario único
    uniqueUsersToNotify.forEach(userEmail => {
      if (userEmail) { // TEMPORAL: Permitir auto-notificaciones para testing
        const notification = {
          type: 'statusPriorityChange',
          userEmail: userEmail,
          fieldName: fieldName,
          oldValue: oldValue,
          newValue: newValue,
          action: 'updated'
        };
        this._pendingNotifications.push(notification);
      }
    });
  }

  /**
   * Procesa todas las notificaciones pendientes después del guardado
   */
  async _processNotifications() {
if (!this._pendingNotifications || this._pendingNotifications.length === 0) {
return;
    }
try {
      // Importar el servicio de notificaciones
      const { notificationService } = await import('../services/notification-service.js');
      const currentUserEmail = document.body.dataset.userEmail || this.userEmail;
      
      for (const notification of this._pendingNotifications) {
        try {
          await this._sendNotification(notificationService, notification, currentUserEmail);
        } catch (error) {
          console.error('🔔 Error sending notification:', notification, error);
        }
      }
    } catch (error) {
      console.error('🔔 Error importing notification service:', error);
    }
    
    // Limpiar notificaciones pendientes
    this._pendingNotifications = [];
  }

  /**
   * Resuelve un ID de entidad (dev_XXX, stk_XXX) a su email correspondiente
   * @param {string} entityIdOrEmail - ID de entidad o email
   * @returns {string|null} - Email resuelto o null si no se encuentra
   */
  _resolveEntityToEmail(entityIdOrEmail) {
    if (!entityIdOrEmail) return null;

    const ref = entityIdOrEmail.toString().trim();

    // Si es un ID de developer
    if (ref.startsWith('dev_')) {
      const email = entityDirectoryService.resolveDeveloperEmail(ref);
      if (email) return email;
    }

    // Si es un ID de stakeholder
    if (ref.startsWith('stk_')) {
      const email = entityDirectoryService.resolveStakeholderEmail(ref);
      if (email) return email;
    }

    // Asumir que ya es un email
    return ref;
  }

  /**
   * Envía una notificación específica
   * @param {Object} notificationService - Servicio de notificaciones
   * @param {Object} notification - Datos de la notificación
   * @param {string} currentUserEmail - Email del usuario actual
   */
  async _sendNotification(notificationService, notification, currentUserEmail) {
    const itemType = this.cardType.replace('-card', '');
    const itemTitle = this.title || `${itemType} sin título`;
    const itemId = this.cardId || this.id;

    // Resolver ID de entidad a email real
    const resolvedEmail = this._resolveEntityToEmail(notification.userEmail);
    if (!resolvedEmail) {
return;
    }

    if (notification.type === 'assignment') {
      await notificationService.notifyUserAssignment(
        resolvedEmail,
        currentUserEmail,
        itemType,
        itemTitle,
        itemId,
        this.projectId
      );
} else if (notification.type === 'unassignment') {
      await notificationService.notifyUserUnassignment(
        resolvedEmail,
        currentUserEmail,
        itemType,
        itemTitle,
        itemId,
        this.projectId
      );
} else if (notification.type === 'statusPriorityChange') {
      // Crear notificación personalizada para cambios de status/priority
      const notification_data = {
        title: `${itemType} actualizado`,
        message: `${currentUserEmail} ha actualizado "${itemTitle}": ${notification.fieldName} cambió de "${notification.oldValue}" a "${notification.newValue}"`,
        type: 'update',
        projectId: this.projectId,
        url: notificationService.generateItemUrl(itemType, itemId, this.projectId),
        data: {
          itemType,
          itemId,
          fieldName: notification.fieldName,
          oldValue: notification.oldValue,
          newValue: notification.newValue,
          updaterEmail: currentUserEmail,
          action: 'updated'
        }
      };

      await notificationService.createNotification(resolvedEmail, notification_data);
}
  }

  /**
   * Maneja errores de guardado de la card
   * @param {CustomEvent} e - Evento de error de guardado
   */
  _handleCardSaveError(e) {
    // Verificar si es esta card la que tuvo el error
    const errorCardId = e.detail?.cardId || e.detail?.id;
    const currentCardId = this.id || this.cardId;
    
    if (errorCardId === currentCardId && errorCardId) {
      // Desactivar estado de guardado y ocultar overlay
      this.isSaving = false;
      this._hideSavingOverlay();
      
      // Mostrar mensaje de error
      const errorMessage = e.detail?.message || 'Error al guardar la tarjeta';
      this._showNotification(errorMessage, 'error');
      
      console.error('🔔 BaseCard: Save error for card:', currentCardId, e.detail);
    }
  }

  /**
   * Maneja el evento de guardado exitoso de la card
   * @param {CustomEvent} e - Evento de card guardada
   */
  _handleGenericCardSaved(e) {
    // Solo procesar si esta card está expandida (en el modal)
    if (!this.expanded) {
return;
    }

    // Verificar si es esta card la que se guardó
    const savedCardId = e.detail?.cardData?.id || e.detail?.cardData?.cardId || e.detail?.id;
    const currentCardId = this.id || this.cardId;
    
    // Solo procesar si es esta card específica y no hemos procesado ya este evento
    if (savedCardId === currentCardId && savedCardId) {
      // Desactivar estado de guardado y ocultar overlay
      this.isSaving = false;
      this._hideSavingOverlay();
      
      // Evitar procesamiento duplicado usando un flag temporal
      if (this._isProcessingNotifications) {
return;
      }
      
      this._isProcessingNotifications = true;
// Procesar notificaciones de forma async para evitar bloqueos
      setTimeout(() => {
        this._processNotifications().finally(() => {
          this._isProcessingNotifications = false;
        });
      }, 0);
    }
  }

  /**
   * Maneja eventos de notificaciones deslizantes para cerrar overlay cuando aparece notificación de guardado exitoso
   * @param {CustomEvent} e - Evento de notificación
   */
  _handleSlideNotification(e) {
    const message = e.detail?.options?.message;
    if (message && (message.includes('saved successfully') || message.includes('guardado exitosamente'))) {
      // Si esta card está guardando, ocultar el overlay
      if (this.isSaving) {
        this.isSaving = false;
        this._hideSavingOverlay();
      }
    }
  }

  // MÉTODO ELIMINADO: _handlePermissionsUpdated() 
  // Ahora se usa BaseCard._handleGlobalPermissionsUpdate() que actualiza TODAS las cards de una vez
  
  // PERFORMANCE OPTIMIZATIONS - Added batch notification processing
  static _batchNotifications() {
    if (BaseCard._processingNotifications || BaseCard._pendingNotifications.length === 0) {
      return;
    }
    
    BaseCard._processingNotifications = true;
    
    // Process notifications in chunks to avoid blocking UI
    const CHUNK_SIZE = 5;
    const processChunk = () => {
      const chunk = BaseCard._pendingNotifications.splice(0, CHUNK_SIZE);
      
      chunk.forEach(notification => {
        // Process notification
        try {
          BaseCard._processNotification(notification);
        } catch (error) {
          console.error('Error processing notification:', error);
        }
      });
      
      if (BaseCard._pendingNotifications.length > 0) {
        // Schedule next chunk
        if (window.requestIdleCallback) {
          requestIdleCallback(processChunk);
        } else {
          setTimeout(processChunk, 16);
        }
      } else {
        BaseCard._processingNotifications = false;
      }
    };
    
    processChunk();
  }
  
  static _processNotification(notification) {
    // Process individual notification
    // Implementation depends on notification structure
  }
  
  static _addNotificationToBatch(notification) {
    BaseCard._pendingNotifications.push(notification);
    
    // Clear existing timeout
    if (BaseCard._notificationBatchTimeout) {
      clearTimeout(BaseCard._notificationBatchTimeout);
    }
    
    // Batch notifications for 100ms
    BaseCard._notificationBatchTimeout = setTimeout(() => {
      BaseCard._batchNotifications();
    }, 100);
  }

  // ==================== SERVICE COMMUNICATION METHODS ====================

  /**
   * Helper para solicitar permisos via ServiceCommunicator
   * Utiliza información del componente actual para construir la solicitud
   * 
   * @param {string} permissionType - Tipo de permiso (task-permissions, bug-permissions, etc.)
   * @param {Object} additionalData - Datos adicionales para la solicitud
   * @returns {Promise} - Promesa con los permisos
   */
  async requestPermissions(permissionType, additionalData = {}) {
    const baseData = {
      type: permissionType,
      cardId: this.id || this.cardId || this.getAttribute('id'),
      cardType: this.tagName.toLowerCase(),
      userEmail: this.currentUserEmail || this.getUserEmail?.(),
      createdBy: this.card?.createdBy || this.createdBy,
    };
try {
      const result = await ServiceCommunicator.requestPermissions(permissionType, {
        ...baseData,
        ...additionalData
      });
return result;
    } catch (error) {
// Retornar permisos por defecto en caso de error
      return {
        canView: true,
        canEdit: false,
        canDelete: false,
        canAssign: false
      };
    }
  }

  /**
   * Helper para acciones de tarjetas via ServiceCommunicator
   * 
   * @param {string} action - Acción a realizar (save, delete, get, etc.)
   * @param {Object} additionalData - Datos adicionales
   * @returns {Promise} - Promesa con el resultado de la acción
   */
  async requestCardAction(action, additionalData = {}) {
    const baseData = {
      action,
      cardData: this.card || this.getCardData?.() || {},
      cardId: this.id || this.cardId,
      cardType: this.tagName.toLowerCase()
    };
    try {
      const result = await ServiceCommunicator.requestCardAction(action, {
        ...baseData,
        ...additionalData
      });
      return result;
    } catch (error) {
      console.error('[BaseCard] requestCardAction FAILED:', {
        action,
        cardId: baseData.cardId,
        cardType: baseData.cardType,
        error: error.message,
        stack: error.stack
      });
      throw error; // Re-throw para que el componente pueda manejar el error
    }
  }

  /**
   * Guarda la tarjeta usando ServiceCommunicator en lugar de imports directos
   * 
   * @param {Object} options - Opciones de guardado
   * @returns {Promise} - Promesa con el resultado del guardado
   */
  async saveCard(options = {}) {
    try {
      // Actualizar datos de la card antes de guardar
      this.updateCardData?.();

      const result = await this.requestCardAction('save', {
        options: {
          silent: false,
          ...options
        }
      });

      // Emitir evento local de guardado exitoso

      // Disparar el evento desde document para asegurar que AppModal lo reciba
      document.dispatchEvent(new CustomEvent('card-save-success', {
        detail: {
          cardId: this.id || this.cardId,
          result,
          sourceElement: this,
          isNewCard: this.cardId?.includes('temp_') || !this.id
        },
        bubbles: true,
        composed: true
      }));

      // También disparar desde el elemento por compatibilidad
      this.dispatchEvent(new CustomEvent('card-save-success', {
        detail: { cardId: this.id || this.cardId, result },
        bubbles: true,
        composed: true
      }));
      return result;
    } catch (error) {
      console.error('[BaseCard] saveCard FAILED:', {
        cardId: this.cardId,
        id: this.id,
        cardType: this.cardType,
        error: error.message,
        stack: error.stack
      });
      // Emitir evento de error
      this.dispatchEvent(new CustomEvent('card-save-error', {
        detail: { cardId: this.id || this.cardId, error: error.message },
        bubbles: true,
        composed: true
      }));
      throw error;
    }
  }

  /**
   * Elimina la tarjeta usando ServiceCommunicator
   * 
   * @returns {Promise} - Promesa con el resultado de la eliminación
   */
  async deleteCard() {
    try {
      const result = await this.requestCardAction('delete');

      // Emitir evento local de eliminación exitosa
      this.dispatchEvent(new CustomEvent('card-delete-success', {
        detail: { cardId: this.id || this.cardId, result },
        bubbles: true,
        composed: true
      }));

      return result;
    } catch (error) {
      // Emitir evento de error
      this.dispatchEvent(new CustomEvent('card-delete-error', {
        detail: { cardId: this.id || this.cardId, error: error.message },
        bubbles: true,
        composed: true
      }));
      throw error;
    }
  }

  /**
   * Solicita datos globales (como los que maneja GlobalDataManager)
   * 
   * @param {string} dataType - Tipo de datos solicitados
   * @param {Object} additionalData - Datos adicionales
   * @returns {Promise} - Promesa con los datos solicitados
   */
  async requestGlobalData(dataType, additionalData = {}) {
    const baseData = {
      cardId: this.id || this.cardId,
      cardType: this.tagName.toLowerCase()
    };
try {
      const result = await ServiceCommunicator.requestGlobalData(dataType, {
        ...baseData,
        ...additionalData
      });
return result;
    } catch (error) {
throw error;
    }
  }

  /**
   * Método de conveniencia para verificar permisos de tarea
   * 
   * @returns {Promise<Object>} - Permisos de tarea
   */
  async checkTaskPermissions() {
    return await this.requestPermissions('task-permissions');
  }

  /**
   * Método de conveniencia para verificar permisos de bug
   * 
   * @returns {Promise<Object>} - Permisos de bug
   */
  async checkBugPermissions() {
    return await this.requestPermissions('bug-permissions');
  }

  /**
   * Método de conveniencia para verificar permisos de épica
   * 
   * @returns {Promise<Object>} - Permisos de épica
   */
  async checkEpicPermissions() {
    return await this.requestPermissions('epic-permissions');
  }

  /**
   * Método helper para obtener el email del usuario actual
   * Los componentes hijos pueden override este método si tienen lógica específica
   * 
   * @returns {string|null} - Email del usuario actual
   */
  getUserEmail() {
    // Intentar obtener de varias fuentes posibles
    return this.currentUserEmail || 
           this.userEmail || 
           this.getAttribute('user-email') ||
           window.currentUserEmail ||
           null;
  }

  

  /**
   * Método hook para actualizar datos de la tarjeta antes de operaciones
   * Los componentes hijos pueden override este método
   */
  updateCardData() {
    // Base implementation - to be overridden by child classes
  }

  /**
   * Configura suscripción a reactividad en tiempo real
   * Para todas las cards con datos válidos (compactas y expandidas)
   */
  _setupRealtimeSubscription() {

    // Suscribir si la card tiene datos válidos y no es temporal
    // CAMBIO: Ya no requiere que esté expandida - todas las cards se suscriben
    if (this.cardId && this.projectId && !this.cardId.startsWith('temp_')) {
      // Obtener el servicio de reactividad
      const { cardRealtimeService } = window;
      if (cardRealtimeService) {
        cardRealtimeService.subscribeToCard(this);
      } else {
        // Intentar suscripción diferida
        this._tryDeferredSubscription();
      }
    }
  }
  
  /**
   * Intenta suscripción diferida si el servicio no está disponible inmediatamente
   */
  _tryDeferredSubscription() {
    let attempts = 0;
    const maxAttempts = 10;
    const retryInterval = 500; // ms
    
    const trySubscribe = () => {
      attempts++;
      
      if (window.cardRealtimeService) {
        window.cardRealtimeService.subscribeToCard(this);
        return;
      }
      
      if (attempts < maxAttempts) {
        setTimeout(trySubscribe, retryInterval);
      }
    };
    
    setTimeout(trySubscribe, retryInterval);
  }

  /**
   * Limpia suscripción a reactividad en tiempo real
   */
  _cleanupRealtimeSubscription() {
    const { cardRealtimeService } = window;
    if (cardRealtimeService && this.cardId && this.projectId) {
      cardRealtimeService.unsubscribeFromCard(this);
}
  }
}

// Register global event listener for year-based permissions (for sprint/epic read-only in past years)
document.addEventListener('year-permissions-updated', BaseCard._handleYearPermissionsUpdate);

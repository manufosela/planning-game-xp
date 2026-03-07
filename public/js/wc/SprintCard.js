import { html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { format, parse, isValid } from 'https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm';
import { BaseCard } from './base-card.js';
import { SprintCardStyles } from './sprint-card-styles.js';
import { permissionService } from '../services/permission-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { modalStackService } from '../services/modal-stack-service.js';
import { setupAutoCloseOnSave } from '../services/modal-service.js';

export class SprintCard extends BaseCard {
  static get properties() {
    return {
      ...super.properties,
      // SprintCard specific properties
      title: { type: String },
      retrospective: { type: String },
      notes: { type: String },
      businessPoints: { type: Number, reflect: true },
      devPoints: { type: Number, reflect: true },
      realBusinessPoints: { type: Number },
      realDevPoints: { type: Number },
      startDate: { type: String, reflect: true },
      endDate: { type: String, reflect: true },
      year: { type: Number, reflect: true },
      user: { type: Object },
      userEmail: { type: String },
      demoVideo: { type: Object },
      demoVideoUrl: { type: String },
      demoSummary: { type: String },
      createdBy: { type: String },
      group: { type: String, reflect: true },
      section: { type: String },
      projectId: { type: String, reflect: true, attribute: 'project-id' },
      isEditable: { type: Boolean },
      expanded: { type: Boolean, reflect: true },
      activeTab: { type: String },
      cardType: { type: String },
    };
  }

  static get styles() {
    return [SprintCardStyles];
  }

  constructor() {
    super();
    this.id = '';
    this.title = '';
    this.retrospective = '';
    this.notes = '';
    this.businessPoints = 0;
    this.devPoints = 0;
    this.realBusinessPoints = 0;
    this.realDevPoints = 0;
    this.startDate = '';
    this.endDate = '';
    this.year = new Date().getFullYear();
    this.user = null;
    this.userEmail = '';
    this.createdBy = '';
    this.group = null;
    this.section = null;
    this.projectId = null;
    
    // Demo video properties
    this.demoVideo = null;
    this.demoVideoUrl = '';
    this.demoSummary = '';
    this.isEditable = true;

    this.expanded = false;

    this.showDeleteModal = this.showDeleteModal.bind(this);
    this._confirmDelete = this._confirmDelete.bind(this);

    this.activeTab = 'retrospective';

    this.cardType = this.tagName.toLowerCase();
  }

  connectedCallback() {
    super.connectedCallback();

    // Si la card se conecta como expandida, pedir permisos después del render
    if (this.expanded) {
      this.updateComplete.then(() => this._requestPermissions());
    }

    // Si es vista compacta, cargar datos del sprint para mostrar contador y botón
    if (!this.expanded && this.cardId) {
      this.updateComplete.then(() => this._loadSprintTaskData());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  requestUpdate(name, oldValue, options) {
    // Si se está expandiendo la card, pedir permisos después del render
    if (name === 'expanded' && this.expanded && !oldValue) {
      this.updateComplete.then(() => this._requestPermissions());
    }

    return super.requestUpdate(name, oldValue, options);
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
   * Solicita permisos específicos para esta SprintCard
   */
  _requestPermissions() {
// Emitir evento solicitando permisos genéricos (usar el handler genérico)
    const permissionRequest = new CustomEvent('request-card-permissions', {
      detail: {
        cardId: this.cardId,
        cardType: 'sprint-card',
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

  get canSave() {
    return this.canEdit && this.title.trim();
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

    const permissions = permissionService.getCardPermissions(this, 'default');
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
            ${this.demoVideoUrl || this.demoVideo ? html`<button class="copy-link-button video-icon" title="Ver registros de la demo" @click=${this._handleOpenDemoRecords}>📹</button>` : ''}
            <button class="copy-link-button eye-icon" title="Ver tareas del sprint" @click=${this._handleShowSprintTasks}>👁️</button>
            <button class="copy-link-button" title="Copiar enlace" @click=${this.copyCardUrl}>🔗</button>
            ${this.canDelete ? html`<button class="delete-button" @click=${this.showDeleteModal}>🗑️</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Maneja el clic en el botón de ver tareas del sprint
   * Previene la propagación del evento para evitar expandir la tarjeta
   */
  _handleShowSprintTasks(event) {
    event.stopPropagation();
    this._showSprintTasks();
  }

  /**
   * Maneja el clic en el botón de ver video demo
   * Previene la propagación del evento para evitar expandir la tarjeta
   */
  _handleShowVideo(event) {
    event.stopPropagation();
    this._showDemoVideo();
  }

  renderCompact() {
    return html`
      <div class="card-container" @click=${this.expandCard}>
        ${this.renderCompactHeader()}
        <div class="card-body">
          <div style="display:flex; flex-direction:column;">
            <span><b>Start Date:</b> ${this.formatDate(this.startDate) || 'N/A'}</span>
            <span><b>End Date:</b> ${this.formatDate(this.endDate) || 'N/A'}</span>
          </div>
          <div class="points" style="margin-top: var(--spacing-sm);">
            <span class="business-points">B:${this.businessPoints}</span>
            <span class="dev-points">D:${this.devPoints}</span>
          </div>
        </div>
        <div class="sprint-actions">
          <span class="to-validate-counter">To Validate: <span id="validate-count-${this.cardId}">...</span></span>
          <button 
            id="next-sprint-btn-${this.cardId}"
            class="next-sprint-btn"
            style="display:none" 
            title="Mover tareas ToDo/InProgress al siguiente sprint"
            @click=${e => { e.stopPropagation(); this._moveTasksToNextSprint(); }}
          >to Next Sprint</button>
        </div>
      </div>
    `;
  }

  _setActiveTab(tab) {
    this.activeTab = tab;
    const tabContent = this.shadowRoot.querySelector('.tab-content');
    if (tabContent) {
      tabContent.scrollIntoView({ behavior: 'smooth' });
      tabContent.classList.remove('ta-retrospective', 'ta-notes', 'ta-video', 'ta-history');
      tabContent.classList.add('ta-' + tab);
    }
  }

  renderExpanded() {
    const currentYear = new Date().getFullYear();
    const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

    return html`
      ${this.renderExpandedHeader()}
      <div style="display: flex; gap: 8px; margin: 8px 0; height: 3.5rem;">
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
          .value=${this.startDate}
          @input=${this._handleStartDateChange}
          ?disabled=${!this.isEditable}
        />

        <label>End Date</label>
        <input
          type="date"
          .value=${this.endDate}
          @input=${this._handleEndDateChange}
          ?disabled=${!this.isEditable}
        />

        <label class="labelNumber">Real Business Points</label>
        <input
          type="number"
          inputmode="numeric"
          .value=${String(this.realBusinessPoints)}
          @input=${this._handleRealBusinessPointsChange}
          aria-label="Business Points"
          min="0"
          ?disabled=${!this.isEditable}
        />

        <label class="labelNumber">Real Development Points</label>
        <input
          type="number"
          inputmode="numeric"
          .value=${String(this.realDevPoints)}
          @input=${this._handleRealDevPointsChange}
          aria-label="Dev Points"
          min="0"
          ?disabled=${!this.isEditable}
        />
      </div>

      <div class="tabs">
        <button class="tab-button tab-retrospective ${this.activeTab === 'retrospective' ? 'active' : ''}" @click=${() => this._setActiveTab('retrospective')}>Retrospectiva</button>
        <button class="tab-button tab-notes ${this.activeTab === 'notes' ? 'active' : ''}" @click=${() => this._setActiveTab('notes')}>Notas</button>
        <button class="tab-button tab-video ${this.activeTab === 'video' ? 'active' : ''}" @click=${() => this._setActiveTab('video')}>Registros de la Demo</button>
        <button class="tab-button tab-history ${this.activeTab === 'history' ? 'active' : ''}" @click=${() => this._setActiveTab('history')}>Histórico</button>
      </div>
      <div class="tab-content ta-${this.activeTab}">
        ${this.activeTab === 'retrospective' ? html`
          <textarea
            .value=${this.retrospective}
            @input=${this._handleRetrospectiveChange}
            placeholder="Retrospective"
            aria-label="Retrospective"
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
        ${this.activeTab === 'video' ? html`
          <div class="video-tab-content" style="padding: 1rem;">
            <div class="demo-records-section">
              <div class="demo-video-url-section" style="margin-bottom: 1.5rem;">
                <label style="display: block; font-weight: bold; margin-bottom: 0.5rem;">
                  🎬 Enlace del Video de la Demo
                </label>
                <p style="color: var(--text-muted, #666); font-size: 0.9em; margin: 0 0 0.5rem 0;">
                  Pega aquí el enlace de SharePoint donde está almacenado el video de la demo.
                </p>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                  <input
                    type="url"
                    .value=${this.demoVideoUrl || ''}
                    @input=${this._handleDemoVideoUrlChange}
                    placeholder="https://sharepoint.com/..."
                    style="flex: 1; padding: 0.5rem; border: 1px solid var(--border-subtle, #ddd); border-radius: 4px;"
                    ?disabled=${!this.isEditable}
                  />
                  ${this.demoVideoUrl ? html`
                    <button
                      @click=${this._openDemoVideoUrl}
                      class="primary-button"
                      style="padding: 0.5rem 1rem;"
                      title="Abrir enlace del video"
                    >
                      ▶ Ver
                    </button>
                  ` : ''}
                </div>
              </div>

              <div class="demo-summary-section">
                <label style="display: block; font-weight: bold; margin-bottom: 0.5rem;">
                  📝 Resumen de la Demo
                </label>
                <p style="color: var(--text-muted, #666); font-size: 0.9em; margin: 0 0 0.5rem 0;">
                  Añade aquí el resumen o notas de la sesión de demo del sprint.
                </p>
                <textarea
                  .value=${this.demoSummary || ''}
                  @input=${this._handleDemoSummaryChange}
                  placeholder="Resumen de la demo: funcionalidades presentadas, feedback recibido, decisiones tomadas..."
                  style="width: 100%; min-height: 200px; padding: 0.5rem; border: 1px solid var(--border-subtle, #ddd); border-radius: 4px; resize: vertical; box-sizing: border-box;"
                  ?disabled=${!this.isEditable}
                ></textarea>
              </div>
            </div>

            ${this.demoVideo ? html`
              <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle, #eee);">
                <details>
                  <summary style="cursor: pointer; color: var(--text-muted, #666); font-size: 0.9em;">
                    📁 Video subido anteriormente (legacy)
                  </summary>
                  <div style="margin-top: 0.5rem; padding: 0.5rem; background: var(--bg-secondary, #f8f9fa); border-radius: 4px;">
                    <p style="margin: 0 0 0.5rem 0; color: var(--text-muted, #666); font-size: 0.9em;">
                      <strong>${this.demoVideo.title || 'Sin título'}</strong><br>
                      Subido por: ${this.demoVideo.uploadedBy || 'Usuario desconocido'}
                    </p>
                    <div style="display: flex; gap: 0.5rem;">
                      <button @click=${this._handleShowVideo} class="primary-button" style="font-size: 0.85em; padding: 0.4rem 0.8rem;">
                        ▶ Ver Video
                      </button>
                      ${this.canEdit ? html`
                        <button @click=${this._handleDeleteVideo} class="danger-button" style="font-size: 0.85em; padding: 0.4rem 0.8rem;">
                          🗑️ Eliminar
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </details>
              </div>
            ` : ''}
          </div>` : ''}
        ${this.activeTab === 'history' ? html`
          <card-history-viewer 
            .projectId=${this.projectId}
            .cardType=${'SPR'}
            .cardId=${this.cardId}>
          </card-history-viewer>` : ''}
      </div>

        ${this.canSave ? html`
          <button @click=${this._handleSave}>Save</button>
        ` : ''}
      </div>
    `;
  }

  expandCard() {
    if (!this.expanded && !this.id) {
      return; // No cerrar si la tarjeta es nueva y aún no tiene ID asignado
    }

    if (!this.expanded) {
      this.dispatchEvent(new CustomEvent('card-click', {
        bubbles: true,
        composed: true,
        detail: {
          id: this.id,
          title: this.title,
          retrospective: this.description,
          notes: this.notes,
          businessPoints: this.businessPoints,
          devPoints: this.devPoints,
          startDate: this.startDate,
          endDate: this.endDate,
          createdBy: this.createdBy,
          userEmail: this.userEmail,
        }
      }));
    }
  }

  _updateCardHistory() {
    const newHistoryEntry = {
      updatedBy: this.userEmail,
      timestamp: new Date().toISOString()
    };
    this.history.push(newHistoryEntry);
  }

  getWCProps() {
    const props = {};
    this.constructor.elementProperties.forEach((_, key) => {
      if (typeof this[key] !== 'function') { // Evita métodos
        props[key] = this[key];
      }
    });
    return props;
  }

  

  _confirmDelete() {
    const cardProps = this.getWCProps();
    document.dispatchEvent(new CustomEvent('delete-card', {
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

  // Video handlers
  _handleUploadVideo(e) {
    e.stopPropagation();
    this._uploadDemoVideo();
  }

  _handleShowVideo(e) {
    e.stopPropagation();
    this._showDemoVideo();
  }

  _handleDeleteVideo(e) {
    e.stopPropagation();
    this._deleteDemoVideo();
  }

  // Input handlers
  

  /**
   * Upload demo video
   */
  async _uploadDemoVideo() {
try {
      const { modalService } = await import('../services/modal-service.js');
      const { firebaseVideoService } = await import('../services/firebase-video-service.js');
      
      // Create upload interface
      const uploadContainer = document.createElement('div');
      uploadContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-height: 400px;
        padding: 1rem;
      `;

      // Title and description inputs
      const titleLabel = document.createElement('label');
      titleLabel.textContent = 'Título del video:';
      titleLabel.style.fontWeight = 'bold';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.placeholder = 'Título del video (opcional)';
      titleInput.value = `Sprint ${this.cardId} Demo`;
      titleInput.style.cssText = 'padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px;';

      const descLabel = document.createElement('label');
      descLabel.textContent = 'Descripción:';
      descLabel.style.fontWeight = 'bold';

      const descriptionTextarea = document.createElement('textarea');
      descriptionTextarea.placeholder = 'Descripción del video (opcional)';
      descriptionTextarea.rows = 3;
      descriptionTextarea.style.cssText = 'padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px; resize: vertical;';

      let selectedFile = null;

      // Create upload interface
      const uploadInterface = firebaseVideoService.createUploadInterface((file) => {
        selectedFile = file;
        uploadBtn.disabled = false;
        uploadBtn.textContent = `Subir "${file.name}" a Firebase`;
        uploadBtn.style.background = '#10b981';
      });

      // Upload button
      const uploadBtn = document.createElement('button');
      uploadBtn.textContent = 'Selecciona un video primero';
      uploadBtn.disabled = true;
      uploadBtn.style.cssText = `
        padding: 0.75rem 1.5rem;
        background: #64748b;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 1rem;
      `;

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.cssText = `
        padding: 0.5rem 1rem;
        background: #64748b;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 0.5rem;
      `;

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; justify-content: center; align-items: center;';
      buttonContainer.appendChild(uploadBtn);
      buttonContainer.appendChild(cancelBtn);

      uploadContainer.appendChild(titleLabel);
      uploadContainer.appendChild(titleInput);
      uploadContainer.appendChild(descLabel);
      uploadContainer.appendChild(descriptionTextarea);
      uploadContainer.appendChild(uploadInterface);
      uploadContainer.appendChild(buttonContainer);

      // Show modal
      const modal = await modalService.createModal({
        title: 'Subir Video de Demo del Sprint',
        content: uploadContainer,
        maxWidth: '700px',
        showFooter: false
      });

      // Cancel button handler
      cancelBtn.addEventListener('click', () => {
        modal.close();
      });

      // Handle upload
      uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        
        try {
          uploadBtn.disabled = true;
          uploadBtn.textContent = 'Subiendo a Firebase Storage...';
          uploadBtn.style.background = '#6366f1';

          const result = await firebaseVideoService.uploadSprintDemoVideo(selectedFile, {
            sprintId: this.cardId,
            firebaseId: this.id,  // Pass the real Firebase ID
            projectId: this.projectId,
            title: titleInput.value.trim() || `Sprint ${this.cardId} Demo`,
            description: descriptionTextarea.value.trim()
          });

          // Update sprint card
          this.demoVideo = result.video;
          this.requestUpdate();

          // Close modal
          modal.close();

        } catch (error) {
          uploadBtn.disabled = false;
          uploadBtn.textContent = `Subir "${selectedFile.name}" a Firebase`;
          uploadBtn.style.background = '#10b981';
          
          console.error('Error uploading video:', error);
          
          // Show error modal
          const errorContent = document.createElement('div');
          errorContent.style.cssText = 'padding: 1rem; text-align: center;';
          errorContent.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 1rem; color: #f43f5e;">⚠️</div>
            <h3>Error al subir video</h3>
            <p>Ha ocurrido un error al subir el video a Firebase Storage:</p>
            <p style="color: #f43f5e; font-family: monospace; background: #f8f9fa; padding: 0.5rem; border-radius: 4px; margin: 1rem 0;">
              ${error.message}
            </p>
            <p style="color: #64748b; font-size: 0.9rem;">
              Por favor, verifica que estés logueado con tu cuenta corporativa y que tengas permisos para subir archivos.
            </p>
          `;
          
          await modalService.createModal({
            title: 'Error de Upload',
            content: errorContent,
            maxWidth: '500px'
          });
        }
      });

    } catch (error) {
      console.error('Error loading services:', error);
      
      // Fallback error modal
      const { modalService } = await import('../services/modal-service.js');
      const content = document.createElement('div');
      content.style.cssText = 'padding: 1rem; text-align: center;';
      content.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 1rem; color: #f43f5e;">❌</div>
        <h3>Error del Sistema</h3>
        <p>No se pudieron cargar los servicios necesarios.</p>
        <p style="color: #64748b; font-size: 0.9rem;">Error: ${error.message}</p>
      `;
      
      await modalService.createModal({
        title: 'Error del Sistema',
        content: content,
        maxWidth: '400px'
      });
    }
  }

  /**
   * Show demo video
   */
  async _showDemoVideo() {
if (!this.demoVideo) {
      try {
        const { modalService } = await import('../services/modal-service.js');
        const content = document.createElement('div');
        content.style.cssText = 'padding: 1rem; text-align: center;';
        content.innerHTML = `
          <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
          <h3>No hay video disponible</h3>
          <p>Este sprint no tiene un video de demo asociado.</p>
        `;
        
        await modalService.createModal({
          title: 'Video de Demo',
          content: content,
          maxWidth: '400px'
        });
      } catch (error) {
        console.error('Error loading modal service:', error);
      }
      return;
    }

    try {
      const { modalService } = await import('../services/modal-service.js');
      const { firebaseVideoService } = await import('../services/firebase-video-service.js');

      // Show loading first
      const loadingContent = document.createElement('div');
      loadingContent.style.cssText = 'padding: 2rem; text-align: center;';
      loadingContent.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 1rem;">⏳</div>
        <h3>Cargando video...</h3>
        <p>Cargando video desde Firebase Storage...</p>
      `;
      
      const loadingModal = await modalService.createModal({
        title: 'Cargando Video de Demo',
        content: loadingContent,
        maxWidth: '400px',
        showFooter: false
      });

      try {
        // Get fresh video URL
        const videoData = await firebaseVideoService.getVideoUrl(this.demoVideo.filePath || this.demoVideo.fileId);
        
        // Close loading modal
        loadingModal.close();
        
        // Create video container
        const videoContainer = document.createElement('div');
        videoContainer.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 80vh;
          overflow-y: auto;
        `;

        // Video info
        const videoInfo = document.createElement('div');
        videoInfo.style.cssText = `
          padding: 1rem;
          background: #f1f5f9;
          border-radius: 8px;
          margin-bottom: 1rem;
        `;

        const uploadDate = this.demoVideo.uploadedAt?.seconds
          ? new Date(this.demoVideo.uploadedAt.seconds * 1000).toLocaleDateString('es-ES')
          : 'Fecha desconocida';

        videoInfo.innerHTML = `
          <h4 style="margin: 0 0 0.5rem 0; color: #334155;">📹 ${this.demoVideo.title || 'Video de Demo'}</h4>
          ${this.demoVideo.description ? `<p style="margin: 0 0 0.5rem 0; color: #64748b;">${this.demoVideo.description}</p>` : ''}
          <div style="font-size: 0.9rem; color: #64748b; display: flex; gap: 1rem; flex-wrap: wrap;">
            <span>📅 ${uploadDate}</span>
            <span>👤 ${this.demoVideo.uploadedBy || 'Usuario desconocido'}</span>
            <span>📁 ${this.demoVideo.size ? (this.demoVideo.size / (1024 * 1024)).toFixed(2) + ' MB' : 'N/A'}</span>
          </div>
        `;

        // Create video player
        const videoPlayer = firebaseVideoService.createVideoPlayer(videoData.url, {
          width: '100%',
          maxWidth: '800px',
          controls: true
        });
        
        videoPlayer.style.marginBottom = '1rem';

        // Action buttons
        const actionButtons = document.createElement('div');
        actionButtons.style.cssText = `
          display: flex;
          gap: 0.5rem;
          justify-content: center;
          margin-top: 1rem;
          flex-wrap: wrap;
        `;

        // View video button
        const viewVideoBtn = document.createElement('button');
        viewVideoBtn.textContent = '▶ Ver Video';
        viewVideoBtn.style.cssText = `
          padding: 0.5rem 1rem;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.3s ease;
        `;
        viewVideoBtn.addEventListener('click', () => {
          window.open(videoData.webUrl, '_blank');
        });

        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '📥 Descargar';
        downloadBtn.style.cssText = `
          padding: 0.5rem 1rem;
          background: #64748b;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.3s ease;
        `;
        downloadBtn.addEventListener('click', () => {
          const a = document.createElement('a');
          a.href = videoData.url;
          a.download = this.demoVideo.fileName || 'video.mp4';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });

        // Delete button (only if user can edit)
        if (this.canEdit) {
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = '🗑️ Eliminar';
          deleteBtn.style.cssText = `
            padding: 0.5rem 1rem;
            background: #f43f5e;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.3s ease;
          `;
          deleteBtn.addEventListener('click', () => {
            // Close current modal first
            videoModal.close();
            // Then show delete confirmation
            this._deleteDemoVideo();
          });
          actionButtons.appendChild(deleteBtn);
        }

        actionButtons.appendChild(viewVideoBtn);
        actionButtons.appendChild(downloadBtn);

        videoContainer.appendChild(videoInfo);
        videoContainer.appendChild(videoPlayer);
        videoContainer.appendChild(actionButtons);

        // Show video modal
        const videoModal = await modalService.createModal({
          title: `Video Demo - ${this.title}`,
          content: videoContainer,
          maxWidth: '900px',
          showFooter: false
        });

      } catch (error) {
        // Close loading modal
        loadingModal.close();
        
        console.error('Error loading video:', error);
        
        // Show error modal
        const errorContent = document.createElement('div');
        errorContent.style.cssText = 'padding: 1rem; text-align: center;';
        errorContent.innerHTML = `
          <div style="font-size: 3rem; margin-bottom: 1rem; color: #f43f5e;">⚠️</div>
          <h3>Error al cargar el video</h3>
          <p>No se pudo cargar el video desde Firebase Storage:</p>
          <p style="color: #f43f5e; font-family: monospace; background: #f8f9fa; padding: 0.5rem; border-radius: 4px; margin: 1rem 0;">
            ${error.message}
          </p>
          <p style="color: #64748b; font-size: 0.9rem;">
            Puede que el enlace haya expirado o que no tengas permisos para acceder al archivo.
          </p>
        `;
        
        await modalService.createModal({
          title: 'Error de Video',
          content: errorContent,
          maxWidth: '500px'
        });
      }

    } catch (error) {
      console.error('Error loading services:', error);
    }
  }

  /**
   * Delete demo video
   */
  async _deleteDemoVideo() {
if (!this.demoVideo) {
      try {
        const { modalService } = await import('../services/modal-service.js');
        const content = document.createElement('div');
        content.style.cssText = 'padding: 1rem; text-align: center;';
        content.innerHTML = `
          <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
          <h3>No hay video para eliminar</h3>
          <p>Este sprint no tiene un video de demo asociado.</p>
        `;
        
        await modalService.createModal({
          title: 'Eliminar Video',
          content: content,
          maxWidth: '400px'
        });
      } catch (error) {
        console.error('Error loading modal service:', error);
      }
      return;
    }
    
    try {
      const { modalService } = await import('../services/modal-service.js');
      const { firebaseVideoService } = await import('../services/firebase-video-service.js');
      
      // Show confirmation dialog
      const confirmed = await modalService.createConfirmationModal({
        title: 'Eliminar Video de Demo',
        message: `¿Estás seguro de que quieres eliminar el video "<strong>${this.demoVideo.title || 'Sin título'}</strong>"?<br><br>Esta acción eliminará el video de Firebase Storage y no se puede deshacer.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
      });
      
      if (!confirmed) return;
      
      // Show loading modal
      const loadingContent = document.createElement('div');
      loadingContent.style.cssText = 'padding: 2rem; text-align: center;';
      loadingContent.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 1rem;">🗑️</div>
        <h3>Eliminando video...</h3>
        <p>Eliminando el video de Firebase Storage...</p>
      `;
      
      const loadingModal = await modalService.createModal({
        title: 'Eliminando Video',
        content: loadingContent,
        maxWidth: '400px',
        showFooter: false
      });

      try {
        // Delete from Firebase Storage
        await firebaseVideoService.deleteSprintDemoVideo(
          this.cardId,
          this.id,  // Pass Firebase ID
          this.projectId,
          this.demoVideo.filePath || this.demoVideo.fileId
        );

        // Remove from sprint card
        this.demoVideo = null;
        this.requestUpdate();

        // Close loading modal
        loadingModal.close();

        // Show success message
        const successContent = document.createElement('div');
        successContent.style.cssText = 'padding: 1rem; text-align: center;';
        successContent.innerHTML = `
          <div style="font-size: 3rem; margin-bottom: 1rem; color: #10b981;">✅</div>
          <h3>Video eliminado correctamente</h3>
          <p>El video ha sido eliminado de Firebase Storage y del sprint.</p>
        `;
        
        await modalService.createModal({
          title: 'Video Eliminado',
          content: successContent,
          maxWidth: '400px'
        });

      } catch (error) {
        // Close loading modal
        loadingModal.close();
        
        console.error('Error deleting video:', error);
        
        // Show error modal
        const errorContent = document.createElement('div');
        errorContent.style.cssText = 'padding: 1rem; text-align: center;';
        errorContent.innerHTML = `
          <div style="font-size: 3rem; margin-bottom: 1rem; color: #f43f5e;">⚠️</div>
          <h3>Error al eliminar video</h3>
          <p>No se pudo eliminar el video de Firebase Storage:</p>
          <p style="color: #f43f5e; font-family: monospace; background: #f8f9fa; padding: 0.5rem; border-radius: 4px; margin: 1rem 0;">
            ${error.message}
          </p>
          <p style="color: #64748b; font-size: 0.9rem;">
            Por favor, verifica que tengas permisos para eliminar archivos o contacta con el administrador.
          </p>
        `;
        
        await modalService.createModal({
          title: 'Error de Eliminación',
          content: errorContent,
          maxWidth: '500px'
        });
      }

    } catch (error) {
      console.error('Error loading services:', error);
    }
  }
  _handleRealBusinessPointsChange(e) { this.businessPoints = Number(e.target.value); }
  _handleRealDevPointsChange(e) { this.devPoints = Number(e.target.value); }
  _handleRetrospectiveChange(e) { this.retrospective = e.target.value; }
  _handleNotesChange(e) { this.notes = e.target.value; }
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
  _handleYearChange(e) { this.year = Number(e.target.value); }
  _handleDemoVideoUrlChange(e) { this.demoVideoUrl = e.target.value; }
  _handleDemoSummaryChange(e) { this.demoSummary = e.target.value; }

  /**
   * Opens the demo video URL in a new tab
   */
  _openDemoVideoUrl(e) {
    e.stopPropagation();
    if (this.demoVideoUrl) {
      window.open(this.demoVideoUrl, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Handles click on demo records button in compact view
   * Opens the URL if available, otherwise shows the legacy video
   */
  _handleOpenDemoRecords(e) {
    e.stopPropagation();
    if (this.demoVideoUrl) {
      window.open(this.demoVideoUrl, '_blank', 'noopener,noreferrer');
    } else if (this.demoVideo) {
      this._showDemoVideo();
    }
  }

  /**
   * Copia la URL del sprint al portapapeles y muestra una notificación.
   */
  _copySprintUrl() {
    const baseUrl = `${window.location.origin}/adminproject/?projectId=${encodeURIComponent(this.projectId)}&cardId=${this.cardId}#sprints`;
    navigator.clipboard.writeText(baseUrl).then(() => {
      const notification = document.createElement('slide-notification');
      notification.message = 'Enlace del sprint copiado al portapapeles';
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
   * Muestra las tareas que pertenecen a este sprint en un modal
   */
  async _showSprintTasks() {
    try {
      // Obtener las tareas del proyecto
      const projectId = this.projectId;
      if (!projectId) {
return;
      }

      // Solicitar las tareas del proyecto
      document.dispatchEvent(new CustomEvent('request-project-tasks', {
        detail: {
          projectId: projectId,
          fullData: true,
          callback: (tasks) => this._displaySprintTasksModal(tasks)
        },
        bubbles: true,
        composed: true
      }));

    } catch (error) {
const notification = document.createElement('slide-notification');
      notification.message = 'Error al cargar las tareas del sprint';
      notification.type = 'error';
      document.body.appendChild(notification);
    }
  }

  /**
   * Muestra el modal con las tareas del sprint
   * @param {Array} allTasks - Todas las tareas del proyecto
   */
  _displaySprintTasksModal(allTasks) {
    // Filtrar las tareas que pertenecen a este sprint
    // Las tareas usan el cardId del sprint (ej: "NTR-SPR-0001"), no el Firebase ID
    const sprintTasks = allTasks.filter(task => task.sprint === this.cardId);
if (sprintTasks.length === 0) {
      document.dispatchEvent(new CustomEvent('show-modal', {
        detail: {
          options: {
            title: `Tareas del sprint: ${this.title}`,
            message: `<p>No hay tareas asignadas a este sprint.</p>`,
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
    const tableHtml = this._createTasksTableHtml(sprintTasks);

    // Crear un elemento temporal para el contenido del modal
    const tempContainer = document.createElement('div');
    tempContainer.id = `sprint-tasks-${this.cardId}`;
    tempContainer.innerHTML = tableHtml;

    // Crear el modal manualmente para poder usar setContent
    const modal = document.createElement('app-modal');
    modal._programmaticMode = true;
    const sprintModalId = `sprint-modal-${this.cardId}-${Date.now()}`;
    modal.modalId = sprintModalId;
    modal.title = `Tareas del sprint: ${this.title} (${sprintTasks.length} tareas)`;
    modal.maxWidth = '80vw';
    modal.maxHeight = '80vh';
    modal.button1Text = 'Ver gráfico del sprint';
    modal.button1Css = 'background-color: #6366f1; color: white;';
    modal.button1Action = () => {
      // Abrir modal de gráfico del sprint sin cerrar este modal
      this._showSprintChartModal(sprintTasks);
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

    // Añadir listener estándar para modal-close-confirmed del modal de sprint
    const handleSprintModalCloseConfirmed = (e) => {
      const { modalId, componentType } = e.detail || {};
      if (modalId === sprintModalId || (componentType === 'sprint-tasks' && modalId === sprintModalId)) {
        modal.close();
      }
    };
    document.addEventListener('modal-close-confirmed', handleSprintModalCloseConfirmed);

    document.body.appendChild(modal);

    // Configurar el contenido del modal
    modal.updateComplete.then(() => {
      modal.setContent(tempContainer);

      // Configurar identificadores del modal
      modal.contentElementId = tempContainer.id;
      modal.contentElementType = 'sprint-tasks';

      // Añadir event listeners para los botones "Ver tarea"
      this._setupTaskViewButtons(tempContainer, sprintTasks);

      // Añadir listener para confirmar el cierre del modal de sprint específicamente
      const handleModalCloseRequested = (e) => {
        if (e.detail.contentElementId === tempContainer.id && e.detail.modalId === sprintModalId) {
          document.dispatchEvent(new CustomEvent('modal-close-confirmed', {
            detail: {
              modalId: sprintModalId,
              componentType: 'sprint-tasks'
            }
          }));
        }
      };

      document.addEventListener('modal-closed-requested', handleModalCloseRequested);

      // Limpiar los listeners cuando se cierre el modal
      modal.addEventListener('modal-closed', () => {
        document.removeEventListener('modal-closed-requested', handleModalCloseRequested);
        document.removeEventListener('modal-close-confirmed', handleSprintModalCloseConfirmed);
});
    });
  }

  /**
   * Crea el HTML de la tabla con las tareas
   * @param {Array} tasks - Lista de tareas del sprint
   * @returns {string} HTML de la tabla
   */
  _createTasksTableHtml(tasks) {
    const tableStyle = `
      <style>
        .sprint-tasks-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          font-size: 0.95em;
          background-color: var(--bg-primary, #ffffff);
          color: var(--text-primary, #333333);
        }
        .sprint-tasks-table th,
        .sprint-tasks-table td {
          border: 1px solid var(--border-subtle, #ddd);
          padding: 10px;
          text-align: left;
          color: var(--text-primary, #333333);
        }
        .sprint-tasks-table th {
          background-color: var(--brand-primary, #6366f1);
          color: var(--text-inverse, #ffffff);
          font-weight: bold;
          font-size: 1em;
        }
        .sprint-tasks-table tbody tr {
          background-color: var(--bg-primary, #ffffff);
          color: var(--text-primary, #333333);
        }
        .sprint-tasks-table tbody tr:nth-child(even) {
          background-color: var(--bg-secondary, #f8f9fa);
          color: var(--text-primary, #333333);
        }
        .sprint-tasks-table tbody tr:hover {
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
      const epicTitle = task.epic && window.globalEpicList && window.globalEpicList.find(epic => epic.id === task.epic)
        ? window.globalEpicList.find(epic => epic.id === task.epic).name
        : '';

      // Resolver developer ID a nombre
      const developerDisplay = this._resolveDeveloperDisplay(task.developer);

      return `
        <tr>
          <td>${task.cardId || ''}</td>
          <td>${task.title || ''}</td>
          <td><div class="${statusClass}">${task.status || ''}</div></td>
          <td>${task.businessPoints || 0}</td>
          <td>${task.devPoints || 0}</td>
          <td>${epicTitle}</td>
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
        <table class="sprint-tasks-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Título</th>
              <th>Estado</th>
              <th>B. Points</th>
              <th>D. Points</th>
              <th>Épica</th>
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

    // Configurar z-index más alto para aparecer sobre el modal de sprint
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
    });
  }

  /**
   * Muestra el modal con el gráfico del sprint
   * @param {Array} tasks - Lista de tareas del sprint
   */
  _showSprintChartModal(tasks) {
    // Crear contenedor para el gráfico del sprint
    const chartContainer = document.createElement('div');
    chartContainer.id = `sprint-chart-${this.cardId}-${Date.now()}`;
    chartContainer.innerHTML = this._createSprintChartHtml(tasks);

    // Crear el modal para el gráfico del sprint
    const chartModal = document.createElement('app-modal');
    chartModal._programmaticMode = true;
    const chartModalId = `sprint-chart-modal-${this.cardId}-${Date.now()}`;
    chartModal.modalId = chartModalId;
    chartModal.title = `Gráfico del Sprint - ${this.title}`;
    chartModal.maxWidth = '95vw';
    chartModal.maxHeight = '90vh';
    chartModal.button1Text = 'Cerrar';
    chartModal.button1Css = 'background-color: #64748b; color: white;';
    chartModal.button1Action = () => {
      chartModal.close();
    };
    chartModal.showHeader = true;
    chartModal.showFooter = true;

    // Configurar z-index más alto para aparecer sobre el modal de sprint
    chartModal.style.zIndex = '10002';

    // Añadir listener estándar para modal-close-confirmed
    const handleChartModalCloseConfirmed = (e) => {
      const { modalId, componentType } = e.detail || {};
      if (modalId === chartModalId || (componentType === 'sprint-chart' && modalId === chartModalId)) {
        chartModal.close();
      }
    };
    document.addEventListener('modal-close-confirmed', handleChartModalCloseConfirmed);

    document.body.appendChild(chartModal);
// Configurar el contenido del modal
    chartModal.updateComplete.then(() => {
      chartModal.setContent(chartContainer);

      // Configurar identificadores del modal
      chartModal.contentElementId = chartContainer.id;
      chartModal.contentElementType = 'sprint-chart';

      // Manejar el cierre específico de este modal
      const handleChartModalCloseRequested = (e) => {
        if (e.detail.contentElementId === chartContainer.id && e.detail.modalId === chartModalId) {
          document.dispatchEvent(new CustomEvent('modal-close-confirmed', {
            detail: {
              modalId: chartModalId,
              componentType: 'sprint-chart'
            }
          }));
        }
      };

      document.addEventListener('modal-closed-requested', handleChartModalCloseRequested);

      // Limpiar listeners al cerrar este modal específico
      chartModal.addEventListener('modal-closed', () => {
        document.removeEventListener('modal-closed-requested', handleChartModalCloseRequested);
        document.removeEventListener('modal-close-confirmed', handleChartModalCloseConfirmed);
});

      // Inicializar el gráfico después de que el contenido esté cargado
      setTimeout(() => {
        this._initializeSprintChart(chartContainer, tasks);
      }, 100);
    });
  }

  /**
   * Crea el HTML base para el gráfico del sprint
   * @param {Array} tasks - Lista de tareas
   * @returns {string} HTML del contenedor del gráfico
   */
  _createSprintChartHtml(tasks) {
    return `
      <style>
        .sprint-chart-container {
          width: 100%;
          height: 500px;
          overflow: auto;
          border: 1px solid var(--border-subtle, #ddd);
          border-radius: 4px;
        }
        .sprint-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding: 1rem;
          background: var(--bg-secondary, #f8f9fa);
          border-radius: 4px;
        }
        .sprint-info {
          font-size: 0.9em;
          color: var(--text-muted, #666);
        }
        .sprint-chart {
          min-height: 400px;
          background: var(--bg-primary, white);
          position: relative;
        }
        .sprint-loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 400px;
          font-size: 1.1em;
          color: var(--text-muted, #666);
        }
      </style>
      <div class="sprint-header">
        <div>
          <h3>Sprint: ${this.title}</h3>
          <div class="sprint-info">
            Tareas incluidas: ${tasks.length} | 
            Período: ${this._getSprintDateRange()}
          </div>
        </div>
      </div>
      <div class="sprint-chart-container">
        <div class="sprint-chart" id="sprint-chart-${this.cardId}">
          <div class="sprint-loading">
            📊 Cargando gráfico del sprint...
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Obtiene el rango de fechas del sprint
   * @returns {string} Rango de fechas formateado
   */
  _getSprintDateRange() {
    if (this.startDate && this.endDate) {
      return `${this.formatDate(this.startDate)} - ${this.formatDate(this.endDate)}`;
    } else if (this.startDate) {
      return `Desde: ${this.formatDate(this.startDate)}`;
    } else if (this.endDate) {
      return `Hasta: ${this.formatDate(this.endDate)}`;
    }
    return 'Sin fechas definidas';
  }

  /**
   * Inicializa el gráfico del sprint con los datos de métricas
   * @param {HTMLElement} container - Contenedor del modal
   * @param {Array} tasks - Lista de tareas
   */
  _initializeSprintChart(container, tasks) {
    const chartElement = container.querySelector(`#sprint-chart-${this.cardId}`);
    if (!chartElement) return;

    // Preparar datos para el gráfico del sprint
    const chartData = this._prepareSprintChartData(tasks);

    // Renderizar gráfico del sprint con HTML/CSS
    chartElement.innerHTML = this._renderSprintChart(chartData);
  }

  /**
   * Carga los datos de las tareas del sprint para mostrar contador y botón
   * @private
   */
  _loadSprintTaskData() {
    if (!this.projectId || !this.cardId) return;

    document.dispatchEvent(new CustomEvent('request-project-tasks', {
      detail: {
        projectId: this.projectId,
        fullData: true,
        callback: (tasks) => this._updateSprintTaskCounters(tasks)
      },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Actualiza los contadores y visibilidad del botón basado en las tareas del sprint
   * @param {Array} allTasks - Todas las tareas del proyecto
   * @private
   */
  _updateSprintTaskCounters(allTasks) {
    if (!allTasks || !this.cardId) return;

    // Filtrar las tareas que pertenecen a este sprint
    // Las tareas usan el cardId del sprint (ej: "NTR-SPR-0001"), no el Firebase ID
    const sprintTasks = allTasks.filter(task => task.sprint === this.cardId);
// Contar tareas To Validate
    const toValidateTasks = sprintTasks.filter(task =>
      task.status === 'To Validate'
    ).length;

    // Contar tareas ToDo o In Progress
    const activeTasksCount = sprintTasks.filter(task =>
      task.status === 'To Do' || task.status === 'In Progress'
    ).length;

    // Actualizar contador en el DOM
    const counterElement = this.renderRoot?.querySelector(`#validate-count-${this.cardId}`);
    if (counterElement) {
      counterElement.textContent = toValidateTasks;
    }

    // Mostrar botón "to Next Sprint" si hay tareas activas
    const nextSprintBtn = this.renderRoot?.querySelector(`#next-sprint-btn-${this.cardId}`);
    if (nextSprintBtn) {
      nextSprintBtn.style.display = activeTasksCount > 0 ? 'block' : 'none';
    }
  }

  /**
   * Extrae el número del sprint desde su ID
   * @param {string} sprintId - ID del sprint (ej: "NTR-SPR-0002")
   * @returns {number} Número del sprint
   * @private
   */
  _extractSprintNumber(sprintId) {
    const match = sprintId.match(/-SPR-(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Encuentra el siguiente sprint correlativo
   * @param {string} currentSprintId - ID del sprint actual
   * @returns {string|null} ID del siguiente sprint o null si no existe
   * @private
   */
  _findNextSprint(currentSprintId) {
    if (!currentSprintId || !window.globalSprintList) return null;

    const currentNumber = this._extractSprintNumber(currentSprintId);
    const projectPrefix = currentSprintId.split('-SPR-')[0]; // Obtener parte "NTR"

    // Encontrar todos los sprints del proyecto y ordenar por número
    const projectSprints = Object.values(window.globalSprintList)
      .filter(sprint => sprint.cardId && sprint.cardId.includes(projectPrefix))
      .map(sprint => ({
        ...sprint,
        number: this._extractSprintNumber(sprint.cardId)
      }))
      .sort((a, b) => a.number - b.number);

    // Encontrar siguiente sprint con número mayor
    const nextSprint = projectSprints.find(sprint =>
      sprint.number > currentNumber
    );

    return nextSprint ? nextSprint.cardId : null;
  }

  /**
   * Mueve las tareas ToDo e In Progress al siguiente sprint
   * @private
   */
  async _moveTasksToNextSprint() {
    if (!this.projectId || !this.cardId) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: {
          options: {
            message: 'Error: No se pudo determinar el proyecto o sprint',
            type: 'error'
          }
        }
      }));
      return;
    }

    const nextSprintId = this._findNextSprint(this.cardId);
    if (!nextSprintId) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: {
          options: {
            message: 'No se encontró un siguiente sprint',
            type: 'warning'
          }
        }
      }));
      return;
    }

    // Obtener todas las tareas del sprint actual
    document.dispatchEvent(new CustomEvent('request-project-tasks', {
      detail: {
        projectId: this.projectId,
        fullData: true,
        callback: (tasks) => this._processMoveToNextSprint(tasks, nextSprintId)
      },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Procesa el movimiento de tareas al siguiente sprint
   * @param {Array} allTasks - Todas las tareas del proyecto
   * @param {string} nextSprintId - ID del siguiente sprint
   * @private
   */
  async _processMoveToNextSprint(allTasks, nextSprintId) {
    const sprintTasks = allTasks.filter(task => task.sprint === this.cardId);
    const tasksToMove = sprintTasks.filter(task =>
      task.status === 'To Do' || task.status === 'In Progress'
    );

    if (tasksToMove.length === 0) {
      // Mostrar slide notification en lugar de _showNotification
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: {
          options: {
            message: 'No hay tareas ToDo o InProgress para mover',
            type: 'info'
          }
        }
      }));
      return;
    }

    const nextSprintTitle = window.globalSprintList &&
      Object.values(window.globalSprintList).find(s => s.cardId === nextSprintId)?.title || nextSprintId;

    try {
      // Mover cada tarea al siguiente sprint
      const movePromises = tasksToMove.map(task => {
        return new Promise((resolve) => {
          const moveEvent = new CustomEvent('move-card-to-sprint', {
            detail: {
              cardData: task,
              newSprint: nextSprintId,
              callback: (result) => {
                if (result.success) {
                  resolve(result);
                } else {
                  resolve({ success: false, error: result.error || 'Error desconocido' });
                }
              }
            }
          });
          document.dispatchEvent(moveEvent);
        });
      });

      const results = await Promise.all(movePromises);

      // Verificar si todas las operaciones fueron exitosas
      const successfulMoves = results.filter(r => r.success).length;
      const failedMoves = results.length - successfulMoves;

      if (successfulMoves > 0) {
        // Mostrar slide notification de éxito
        document.dispatchEvent(new CustomEvent('show-slide-notification', {
          detail: {
            options: {
              message: `${successfulMoves} tareas movidas al sprint: ${nextSprintTitle}`,
              type: 'success'
            }
          }
        }));

        // Recargar datos del sprint para actualizar contadores y ocultar botón
        setTimeout(() => this._loadSprintTaskData(), 500);
      }

      if (failedMoves > 0) {
        document.dispatchEvent(new CustomEvent('show-slide-notification', {
          detail: {
            options: {
              message: `${failedMoves} tareas no pudieron moverse. Verifique los permisos.`,
              type: 'error'
            }
          }
        }));
      }

    } catch (error) {
document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: {
          options: {
            message: 'Error al mover las tareas al siguiente sprint',
            type: 'error'
          }
        }
      }));
    }
  }

  /**
   * Prepara los datos para el gráfico del sprint
   * @param {Array} tasks - Lista de tareas
   * @returns {Object} Datos estructurados para el gráfico
   */
  _prepareSprintChartData(tasks) {
    // Debug: Ver los estados únicos de las tareas
// Calcular métricas del sprint
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => {
      const status = task.status?.toLowerCase();
      return status === 'done&validated' || status === 'donevalidated' || status === 'completed';
    }).length;
    const inProgressTasks = tasks.filter(task => {
      const status = task.status?.toLowerCase();
      return status === 'inprogress' || status === 'in progress' || status === 'in-progress';
    }).length;
    const todoTasks = tasks.filter(task => {
      const status = task.status?.toLowerCase();
      return status === 'todo' || status === 'to do' || status === 'pending';
    }).length;
    const blockedTasks = tasks.filter(task => {
      const status = task.status?.toLowerCase();
      return status === 'blocked';
    }).length;
    const toValidateTasks = tasks.filter(task => {
      const status = task.status?.toLowerCase();
      return status === 'to validate' || status === 'tovalidate' || status === 'validation' || status === 'validate';
    }).length;

    // Calcular puntos
    const plannedBusinessPoints = this.businessPoints || 0;
    const realBusinessPoints = this.realBusinessPoints || 0;
    const plannedDevPoints = this.devPoints || 0;
    const realDevPoints = this.realDevPoints || 0;

    const completedBusinessPoints = tasks
      .filter(task => {
        const status = task.status?.toLowerCase();
        return status === 'done&validated' || status === 'donevalidated' || status === 'completed';
      })
      .reduce((sum, task) => sum + (task.businessPoints || 0), 0);

    const completedDevPoints = tasks
      .filter(task => {
        const status = task.status?.toLowerCase();
        return status === 'done&validated' || status === 'donevalidated' || status === 'completed';
      })
      .reduce((sum, task) => sum + (task.devPoints || 0), 0);

    // Contar bugs - buscar en diferentes posibles propiedades
    const bugs = tasks.filter(task => {
      return task.type === 'bug' ||
        task.cardType === 'bug-card' ||
        task.category === 'bug' ||
        task.title?.toLowerCase().includes('bug') ||
        task.description?.toLowerCase().includes('bug');
    });
    const resolvedBugs = bugs.filter(bug => {
      const status = bug.status?.toLowerCase();
      return status === 'done&validated' || status === 'donevalidated' || status === 'completed' || status === 'resolved';
    }).length;
return {
      taskMetrics: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        todo: todoTasks,
        toValidate: toValidateTasks,
        blocked: blockedTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      },
      pointMetrics: {
        plannedBusiness: plannedBusinessPoints,
        realBusiness: realBusinessPoints,
        completedBusiness: completedBusinessPoints,
        businessRate: plannedBusinessPoints > 0 ? Math.round((completedBusinessPoints / plannedBusinessPoints) * 100) : 0,
        plannedDev: plannedDevPoints,
        realDev: realDevPoints,
        completedDev: completedDevPoints,
        devRate: plannedDevPoints > 0 ? Math.round((completedDevPoints / plannedDevPoints) * 100) : 0
      },
      bugMetrics: {
        total: bugs.length,
        resolved: resolvedBugs,
        resolutionRate: bugs.length > 0 ? Math.round((resolvedBugs / bugs.length) * 100) : 0
      }
    };
  }

  /**
   * Renderiza el gráfico del sprint usando HTML/CSS
   * @param {Object} chartData - Datos del gráfico
   * @returns {string} HTML del gráfico
   */
  _renderSprintChart(chartData) {
    const { taskMetrics, pointMetrics, bugMetrics } = chartData;

    return `
      <style>
        .chart-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
          padding: 1rem;
        }
        .chart-bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 1rem;
        }
        .chart-section {
          background: var(--bg-primary, white);
          border: 1px solid var(--border-subtle, #ddd);
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .chart-title {
          font-size: 1.2em;
          font-weight: bold;
          margin-bottom: 1rem;
          color: var(--text-primary, #333);
          text-align: center;
        }
        .metric-bar {
          margin-bottom: 1rem;
        }
        .metric-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.9em;
          margin-bottom: 4px;
          color: var(--text-muted, #666);
        }
        .progress-bar {
          height: 20px;
          background: var(--bg-tertiary, #f0f0f0);
          border-radius: 10px;
          overflow: hidden;
          position: relative;
        }
        .progress-fill {
          height: 100%;
          border-radius: 10px;
          transition: width 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-inverse, white);
          font-size: 0.8em;
          font-weight: bold;
        }
        .business-points { background: var(--brand-primary, #6366f1); }
        .dev-points { background: var(--color-warning, #f59e0b); }
        .task-completion { background: var(--status-done, #10b981); }
        .bug-resolution { background: var(--status-expedited, #8b5cf6); }
        .metrics-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .task-progress-metrics {
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        }
        .metric-card {
          text-align: center;
          background: var(--bg-secondary, #f8f9fa);
          padding: 0;
          border-radius: 6px;
          border: 1px solid var(--bg-tertiary, #e9ecef);
        }
        .metric-card.completed-tasks {
          background: var(--color-success, #10b981);
          color: var(--text-inverse, white);
        }
        .metric-card.blocked-tasks {
          background: var(--color-error, #f43f5e);
          color: var(--text-inverse, white);
        }
        .metric-number {
          font-size: 1.8em;
          font-weight: bold;
          color: var(--brand-primary, #6366f1);
          padding: 1rem 0.5rem 0.25rem 0.5rem;
        }
        .metric-text {
          font-size: 0.8em;
          color: var(--text-muted, #666);
          margin-top: 4px;
          padding: 0 0.5rem 1rem 0.5rem;
        }
        .completed-tasks .metric-number,
        .blocked-tasks .metric-number {
          color: var(--text-inverse, white);
        }
        .completed-tasks .metric-text,
        .blocked-tasks .metric-text {
          color: var(--text-inverse, white);
        }
      </style>
      <div class="chart-grid">
        <!-- Progreso de Tareas - Ancho completo -->
        <div class="chart-section">
          <div class="chart-title">📋 Progreso de Tareas</div>
          <div class="metrics-summary task-progress-metrics">
            <div class="metric-card">
              <div class="metric-number">${taskMetrics.total}</div>
              <div class="metric-text">Total Tareas</div>
            </div>
            <div class="metric-card">
              <div class="metric-number">${taskMetrics.todo}</div>
              <div class="metric-text">ToDo</div>
            </div>
            <div class="metric-card">
              <div class="metric-number">${taskMetrics.inProgress}</div>
              <div class="metric-text">En Progreso</div>
            </div>
            <div class="metric-card">
              <div class="metric-number">${taskMetrics.toValidate}</div>
              <div class="metric-text">A Validar</div>
            </div>
            <div class="metric-card completed-tasks">
              <div class="metric-number">${taskMetrics.completed}</div>
              <div class="metric-text">Completadas</div>
            </div>
            <div class="metric-card blocked-tasks">
              <div class="metric-number">${taskMetrics.blocked}</div>
              <div class="metric-text">Bloqueadas</div>
            </div>
          </div>
          <div class="metric-bar">
            <div class="metric-label">
              <span>Completado</span>
              <span>${taskMetrics.completionRate}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill task-completion" style="width: ${taskMetrics.completionRate}%">
                ${taskMetrics.completionRate}%
              </div>
            </div>
          </div>
        </div>

        <!-- Secciones inferiores en 3 columnas -->
        <div class="chart-bottom-grid">
          <!-- Bugs arriba (primera posición) -->
          <div class="chart-section">
            <div class="chart-title">🐛 Resolución de Bugs</div>
            <div class="metrics-summary">
              <div class="metric-card">
                <div class="metric-number">${bugMetrics.total}</div>
                <div class="metric-text">Total Bugs</div>
              </div>
              <div class="metric-card">
                <div class="metric-number">${bugMetrics.resolved}</div>
                <div class="metric-text">Resueltos</div>
              </div>
            </div>
            <div class="metric-bar">
              <div class="metric-label">
                <span>Resueltos</span>
                <span>${bugMetrics.resolutionRate}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill bug-resolution" style="width: ${bugMetrics.resolutionRate}%">
                  ${bugMetrics.resolutionRate}%
                </div>
              </div>
            </div>
          </div>

          <!-- Puntos de Negocio (sin reales) -->
          <div class="chart-section">
            <div class="chart-title">💼 Puntos de Negocio</div>
            <div class="metrics-summary">
              <div class="metric-card">
                <div class="metric-number">${pointMetrics.plannedBusiness}</div>
                <div class="metric-text">Planificados</div>
              </div>
              <div class="metric-card">
                <div class="metric-number">${pointMetrics.completedBusiness}</div>
                <div class="metric-text">Completados</div>
              </div>
            </div>
            <div class="metric-bar">
              <div class="metric-label">
                <span>Progreso</span>
                <span>${pointMetrics.businessRate}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill business-points" style="width: ${pointMetrics.businessRate}%">
                  ${pointMetrics.businessRate}%
                </div>
              </div>
            </div>
          </div>

          <!-- Puntos de Desarrollo (sin reales) -->
          <div class="chart-section">
            <div class="chart-title">⚙️ Puntos de Desarrollo</div>
            <div class="metrics-summary">
              <div class="metric-card">
                <div class="metric-number">${pointMetrics.plannedDev}</div>
                <div class="metric-text">Planificados</div>
              </div>
              <div class="metric-card">
                <div class="metric-number">${pointMetrics.completedDev}</div>
                <div class="metric-text">Completados</div>
              </div>
            </div>
            <div class="metric-bar">
              <div class="metric-label">
                <span>Progreso</span>
                <span>${pointMetrics.devRate}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill dev-points" style="width: ${pointMetrics.devRate}%">
                  ${pointMetrics.devRate}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Override: Campos editables específicos de SprintCard
   * @returns {Object} Estado actual de campos editables
   */
  _getEditableState() {
    return {
      ...super._getEditableState(),
      retrospective: this.retrospective || '',
      businessPoints: this.businessPoints || 0,
      devPoints: this.devPoints || 0,
      realBusinessPoints: this.realBusinessPoints || 0,
      realDevPoints: this.realDevPoints || 0,
      startDate: this.startDate || '',
      endDate: this.endDate || '',
      demoVideo: JSON.stringify(this.demoVideo || {}),
      demoVideoUrl: this.demoVideoUrl || '',
      demoSummary: this.demoSummary || ''
    };
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

customElements.define('sprint-card', SprintCard);
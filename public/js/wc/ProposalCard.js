import { html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { format, parse, isValid } from 'https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js';
import { database, functions, httpsCallable } from '../../firebase-config.js';
import { BaseCard } from './base-card.js';
import { ProposalCardStyles } from './proposal-card-styles.js';
import { developerBacklogService } from '../services/developer-backlog-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { isCurrentUserSuperAdmin } from '../utils/super-admin-check.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { openScenarioModal } from '../utils/scenario-modal.js';
import { PROPOSAL_SCHEMA } from '../schemas/card-field-schemas.js';
import { demoModeService } from '../services/demo-mode-service.js';

export class ProposalCard extends BaseCard {
  static get properties() {
    return {
      ...super.properties,
      // ProposalCard specific properties
      title: { type: String },
      description: { type: String },
      notes: { type: String },
      acceptanceCriteria: { type: String },
      acceptanceCriteriaStructured: { type: Array },
      registerDate: { type: String, reflect: true },
      user: { type: Object },
      userEmail: { type: String },
      createdBy: { type: String },
      group: { type: String },
      section: { type: String },
      projectId: { type: String },
      isEditable: { type: Boolean },
      selected: { type: Boolean, reflect: true },
      expanded: { type: Boolean, reflect: true },
      activeTab: { type: String },
      cardType: { type: String },
      epic: { type: String },
      epicList: { type: Array },
      history: { type: Array },
      businessPoints: { type: Number },
      projectScoringSystem: { type: String },
      invalidFields: { type: Array },
      isSuperAdmin: { type: Boolean },
      developers: { type: Array },
      developer: { type: String },
      stakeholders: { type: Array },
      stakeholder: { type: String },
      // Structured description fields (Dado/Cuando/Para)
      descDado: { type: String },
      descCuando: { type: String },
      descPara: { type: String },
      // Converting legacy description state
      _isConvertingDescription: { type: Boolean, state: true },
    };
  }

  static get styles() {
    return ProposalCardStyles;
  }

  constructor() {
    super();
    this.id = '';
    this.title = '';
    this.description = '';
    this.notes = '';
    this.acceptanceCriteria = '';
    this.acceptanceCriteriaStructured = [];
    this.registerDate = '';
    this.user = null;
    this.userEmail = '';
    this.createdBy = '';
    this.group = null;
    this.section = null;
    this.projectId = null;
    this.isEditable = true;
    this.isSuperAdmin = false;

    this.selected = false;
    this.expanded = false;

    this.showDeleteModal = this.showDeleteModal.bind(this);
    this._confirmDelete = this._confirmDelete.bind(this);

    this.activeTab = 'description';

    this.cardType = this.tagName.toLowerCase();

    const date = new Date();
    this.today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    this.epic = '';
    this.epicList = [];
    this.history = [];
    this.businessPoints = 0;
    this.projectScoringSystem = '1-5';
    this.invalidFields = [];
    this._projectDevelopers = [];
    this.developers = [];
    this.developer = '';
    this._projectStakeholders = [];
    this.stakeholders = [];
    this.stakeholder = '';
    // Structured description fields
    this.descDado = '';
    this.descCuando = '';
    this.descPara = '';
    this._isConvertingDescription = false;

    // Set today's date as default register date
    if (!this.registerDate) {
      this.registerDate = this.today;
    }

  }

  connectedCallback() {
    super.connectedCallback();
    this._resolveSuperAdmin();
    this._loadDevelopersFromDirectory();
    this._loadStakeholdersFromDirectory();

    // Ensure this card has an ID for modal communication
    if (!this.id && this.cardId) {
      this.id = this.cardId;
    }

    // Si la card se conecta como expandida, pedir permisos después del render
    if (this.expanded) {
      this.updateComplete.then(() => this._requestOwnershipPermissions());
    }

    // Cargar épicas y scoringSystem del proyecto al conectar el componente
    if (this.projectId) {
      this._loadEpics();
      this._loadProjectScoringSystem();
    }

    // Parsear descripción legacy a formato estructurado si es necesario
    if (this.description && !this.descDado && !this.descCuando && !this.descPara) {
      this._parseDescriptionToStructured(this.description);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  requestUpdate(name, oldValue, options) {
    return this._handleRequestUpdateWithOwnershipPermissions(name, oldValue, options);
  }

  updated(changedProps) {
    if (typeof super.updated === 'function') {
      super.updated(changedProps);
    }
    if (changedProps?.has('projectId')) {
      const prev = changedProps.get('projectId');
      if (prev !== this.projectId) {
        this._loadDevelopersFromDirectory();
        this._loadStakeholdersFromDirectory();
      }
    }
  }

  async _resolveSuperAdmin() {
    try {
      const email = this.userEmail || document.body.dataset.userEmail || window.currentUser?.email;
      this.isSuperAdmin = await isCurrentUserSuperAdmin(email);
    } catch (error) {
this.isSuperAdmin = false;
    }
  }

  _requestGlobalData(key, detail = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const onResponse = (event) => {
        const payload = event?.detail || {};
        if (payload.requestId !== requestId) return;
        document.removeEventListener('provide-global-data', onResponse);
        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }
        resolve(payload.data);
      };
      document.addEventListener('provide-global-data', onResponse);

      document.dispatchEvent(new CustomEvent('request-global-data', {
        detail: { key, requestId, ...detail }
      }));

      // Timeout de seguridad
      setTimeout(() => {
        document.removeEventListener('provide-global-data', onResponse);
        reject(new Error('Timeout esperando datos globales'));
      }, 5000);
    });
  }

  async _loadDevelopersFromDirectory() {
    try {
      await entityDirectoryService.init?.();
      await entityDirectoryService.waitForInit?.();
      let list = [];
      if (this.projectId) {
        list = await this._requestGlobalData('project-developers', { projectId: this.projectId });
      }
      // Si no hay projectId o no hay developers configurados, dejar la lista vacía explícitamente
      this._projectDevelopers = (Array.isArray(list) ? list : [])
        .filter(dev => dev?.id && dev.active !== false)
        .map(dev => ({
          value: dev.id,
          display: dev.name || dev.email || dev.id
        }));
      this.developers = [...this._projectDevelopers];

      const optionValues = new Set(this._projectDevelopers.map(d => d.value));
      if (!optionValues.has(this.developer)) {
        this.developer = '';
      }
      this.requestUpdate();
    } catch (error) {
this._projectDevelopers = [];
    }
  }

  _getDeveloperOptionsForRole(options) {
    const list = Array.isArray(options) ? options : [];
    if (list.length === 0) return [];
    return list;
  }

  async _loadStakeholdersFromDirectory() {
    try {
      await entityDirectoryService.init?.();
      await entityDirectoryService.waitForInit?.();
      let list = [];
      if (this.projectId) {
        list = await this._requestGlobalData('project-stakeholders', { projectId: this.projectId });
      }
      this._projectStakeholders = (Array.isArray(list) ? list : [])
        .filter(stk => stk?.id && stk.active !== false)
        .map(stk => ({
          value: stk.id,
          display: stk.name || stk.email || stk.id
        }));
      this.stakeholders = [...this._projectStakeholders];

      const optionValues = new Set(this._projectStakeholders.map(s => s.value));
      if (!optionValues.has(this.stakeholder)) {
        this.stakeholder = '';
      }
      this.requestUpdate();
    } catch (error) {
      this._projectStakeholders = [];
    }
  }

  _buildBacklogPayload() {
    return {
      cardId: this.cardId || this.id,
      projectId: this.projectId,
      cardType: this.cardType || 'proposal-card',
      title: this.title || this.cardId,
      status: this.status || 'Pending',
      addedBy: this.userEmail || document.body.dataset.userEmail || ''
    };
  }

  async _resolveDeveloperIdForBacklog(candidate) {
    await entityDirectoryService.waitForInit?.();
    let devId = entityDirectoryService.resolveDeveloperId(candidate);
    if (!devId && candidate?.includes('@')) {
      devId = await entityDirectoryService.findOrCreateDeveloper(candidate, null);
    }
    return devId;
  }

  async _handleAddToMyBacklog() {
    try {
      const email = this.userEmail || document.body.dataset.userEmail;
      let targetDev = null;
      if (this.isSuperAdmin && this.developer) {
        targetDev = await this._resolveDeveloperIdForBacklog(this.developer);
      }
      if (!targetDev) {
        targetDev = await this._resolveDeveloperIdForBacklog(email);
      }
      if (!targetDev) throw new Error('No se pudo resolver el developer para backlog');
      const payload = this._buildBacklogPayload();
      await developerBacklogService.addItem(targetDev, payload);
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Añadido al backlog', type: 'success' } } }));
    } catch (error) {
      console.error('Error añadiendo propuesta al backlog', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: error.message || 'No se pudo añadir al backlog', type: 'error' } } }));
    }
  }

  get canEdit() {
    // Las propuestas tienen lógica especial:
    // - Los admins pueden editar cualquier propuesta
    // - Los empleados solo pueden editar sus propias propuestas
    const isAdmin = this.canEditPermission; // Permiso de admin desde BaseCard
    const isOwner = this.createdBy && this.userEmail && this.createdBy === this.userEmail;
    
    // sinsole.log('🔐 ProposalCard canEdit check:', {
    //   isAdmin,
    //   isOwner,
    //   createdBy: this.createdBy,
    //   userEmail: this.userEmail,
    //   isEditable: this.isEditable
    // });

    // Si el año es de solo lectura, no se puede editar
    return this.isEditable && (isAdmin || isOwner) && !this.isYearReadOnly;
  }

  get canDelete() {
    const isAdmin = this.canEditPermission;
    const isOwner = this.createdBy && this.userEmail && this.createdBy === this.userEmail;
    // Si el año es de solo lectura, no se puede borrar
    return this.isEditable && (isAdmin || isOwner) && !this.isYearReadOnly;
  }

  get canSave() {
    return this.canEdit && this.title.trim();
  }

  /**
   * Verifica si es una propuesta nueva (sin guardar en Firebase)
   * @returns {boolean}
   */
  get isNewProposal() {
    // Una propuesta es nueva si el cardId empieza con 'temp' (generado por card-factory)
    // o si no tiene ningún identificador válido
    const hasTemporaryCardId = this.cardId?.startsWith('temp');
    if (hasTemporaryCardId) {
      return true;
    }

    // Si tiene un cardId con formato de proyecto (ej: PRJ-PRP-0001), no es nueva
    const hasProjectCardId = this.cardId?.includes('-PRP-');
    if (hasProjectCardId) {
      return false;
    }

    // Verificar si tiene firebaseId - SIN FALLBACKS
    return !this._firebaseId;
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
            <button class="copy-link-button" title="Copiar enlace" @click=${this._handleCopyLinkClick}>🔗</button>
            ${this.id ? html`
              <button
                class="copy-link-button convert-button"
                title="Convertir en tarea"
                @click=${this.showConvertConfirmation}>
                🔁
              </button>` : ''}
            ${this.canMoveToProject ? html`<button class="move-project-button" title="Mover a otro proyecto" @click=${(e) => { e.stopPropagation(); this._handleMoveToProject(e); }}>📦</button>` : ''}
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
          <div style="display:flex; flex-direction:column;">
            <span><b>Register Date:</b> ${this.formatDate(this.registerDate || this.today)}</span>
            <span><b>Created by:</b> ${this.createdBy || 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  }

  _setActiveTab(tab) {
    this.activeTab = tab;
    this.shadowRoot.querySelector('.tab-content').scrollIntoView({ behavior: 'smooth' });
    this.shadowRoot.querySelector('.tab-content').classList.remove('ta-description', 'ta-acceptanceCriteria', 'ta-notes');
    this.shadowRoot.querySelector('.tab-content').classList.add('ta-' + tab);
  }

  /**
   * Override del header expandido para añadir validación del título
   */
  renderExpandedHeader() {
    return html`
      <div class="card-header">
        <section style="display:flex; flex-direction:row; width:100%; justify-content: flex-start; gap: 2rem;">
          <input
            for="title"
            type="text"
            class="title ${this._getFieldClass('title')}"
            .value=${this.title}
            title=${this.title}
            @input=${this._handleTitleChange}
            placeholder="Escriba aquí el título..."
            autofocus
            aria-label="Title"
            ?disabled=${!this.isEditable}
          />
        </section>
      </div>
    `;
  }

  renderExpanded() {
    const developerOptions = this._getDeveloperOptionsForRole(this._projectDevelopers || []);
const developerValue = developerOptions.find(opt => opt.value === this.developer)?.value || '';
    return html`
      ${this.renderExpandedHeader()}

      <div class="expanded-fields">
        <div class="field-group-row" style="display: flex; gap: 2rem; align-items: center;">
          <div class="field-group" style="flex: 1;">
            <label>Epic:</label>
            <select class="${this._getFieldClass('epic')}" .value=${this.epic} @change=${this._handleEpicChange} ?disabled=${!this.isEditable}>
              <option value="">Sin epic</option>
              ${this.epicList.map(epic => html`
                <option value=${epic.id} ?selected=${this.epic === epic.id}>${epic.title}</option>
              `)}
            </select>
          </div>

          <div class="field-group" style="flex: 1;">
            <label>Developer:</label>
            ${this.isEditable ? html`
              <select class="${this._getFieldClass('developer')}" .value=${developerValue} @change=${(e) => { this.developer = e.target.value; }} ?disabled=${!this.isEditable || developerOptions.length === 0}>
                <option value="${APP_CONSTANTS.DEVELOPER_UNASSIGNED.STORAGE_VALUE}" ?selected=${!this.developer || APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer)}>${developerOptions.length ? APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES : 'Proyecto sin developers configurados'}</option>
                ${developerOptions.map(dev => html`
                  <option value=${dev.value} ?selected=${this.developer === dev.value}>${dev.display}</option>
                `)}
              </select>
            ` : html`
              <div class="readonly-field">
                <input type="hidden" name="developer" .value=${this.developer || ''}>
                <span>${this.developer && !APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(this.developer) ? entityDirectoryService.getDeveloperDisplayName?.(this.developer) || this.developer : APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES}</span>
              </div>
            `}
          </div>

          <div class="field-group" style="flex: 1;">
            <label>Stakeholder:</label>
            ${this.isEditable ? html`
              <select class="${this._getFieldClass('stakeholder')}" .value=${this.stakeholder || ''} @change=${this._handleStakeholderChange} ?disabled=${!this.isEditable || this._projectStakeholders.length === 0}>
                <option value="" ?selected=${!this.stakeholder}>Sin asignar</option>
                ${this._projectStakeholders.map(stk => html`
                  <option value=${stk.value} ?selected=${this.stakeholder === stk.value}>${stk.display}</option>
                `)}
              </select>
            ` : html`
              <div class="readonly-field">
                <input type="hidden" name="stakeholder" .value=${this.stakeholder || ''}>
                <span>${this.stakeholder ? entityDirectoryService.getStakeholderDisplayName?.(this.stakeholder) || this.stakeholder : 'Sin asignar'}</span>
              </div>
            `}
          </div>

          <div class="field-group" style="flex: 0 0 auto;">
            <label>Business Points:</label>
            <select .value=${String(this.businessPoints)} @change=${this._handleBusinessPointsChange} ?disabled=${!this.isEditable}>
              ${this.getPointsOptions().map(value => html`
                <option value=${value} ?selected=${this.businessPoints === value}>${value}</option>
              `)}
            </select>
          </div>

          <div class="field-group" style="flex: 1;">
            <label>Register Date:</label>
            <div style="padding: 0.5rem; background: var(--bg-secondary, #f5f5f5); border-radius: 4px;">
              ${this.formatDate(this.registerDate || this.today)} - ${this.createdBy || this.userEmail}
            </div>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button class="description tab-button ${this.activeTab === 'description' ? 'active' : ''} ${this._getFieldClass('description')}" @click=${() => this._setActiveTab('description')}>Description</button>
        <button class="acceptance-criteria tab-button ${this.activeTab === 'acceptanceCriteria' ? 'active' : ''} ${this._getFieldClass('acceptanceCriteria')}" @click=${() => this._setActiveTab('acceptanceCriteria')}>Acceptance Criteria</button>
        <button class="notes tab-button ${this.activeTab === 'notes' ? 'active' : ''}" @click=${() => this._setActiveTab('notes')}>Notes</button>
        <button class="history tab-button ${this.activeTab === 'history' ? 'active' : ''}" @click=${() => this._setActiveTab('history')}>Histórico</button>
      </div>
      <div class="tab-content">
        ${this.activeTab === 'description' ? html`
          <div class="structured-description">
            <div class="structured-field">
              <label class="structured-label">
                Como <span class="label-hint">(rol o usuario)</span>
              </label>
              <input
                type="text"
                class="structured-input ${this._getFieldClass('descDado')}"
                .value=${this.descDado}
                @input=${(e) => { this.descDado = e.target.value; this._syncDescriptionFromStructured(); }}
                placeholder="Ej: un usuario autenticado en el sistema..."
                aria-label="Como"
                ?disabled=${!this.isEditable}>
            </div>
            <div class="structured-field">
              <label class="structured-label">Quiero <span class="label-hint">(acción o funcionalidad)</span></label>
              <input
                type="text"
                class="structured-input ${this._getFieldClass('descCuando')}"
                .value=${this.descCuando}
                @input=${(e) => { this.descCuando = e.target.value; this._syncDescriptionFromStructured(); }}
                placeholder="Ej: poder exportar los datos a PDF..."
                aria-label="Quiero"
                ?disabled=${!this.isEditable}>
            </div>
            <div class="structured-field">
              <label class="structured-label">Para <span class="label-hint">(objetivo o beneficio)</span></label>
              <input
                type="text"
                class="structured-input ${this._getFieldClass('descPara')}"
                .value=${this.descPara}
                @input=${(e) => { this.descPara = e.target.value; this._syncDescriptionFromStructured(); }}
                placeholder="Ej: compartir la información con el equipo..."
                aria-label="Para"
                ?disabled=${!this.isEditable}>
            </div>
            ${this._needsDescriptionConversion() && this.isEditable ? html`
              <button
                type="button"
                class="improve-ia-button ${this._isConvertingDescription ? 'disabled' : ''}"
                @click=${this._convertLegacyDescription}
                ?disabled=${this._isConvertingDescription}
                title="Convertir descripción legacy a formato Como/Quiero/Para"
              >${this._isConvertingDescription ? '⏳ Convirtiendo...' : '✨ Mejorar con IA'}</button>
            ` : ''}
          </div>` : ''}
        ${this.activeTab === 'acceptanceCriteria' ? html`
          <div class="scenario-table-wrapper">
            <table class="scenario-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dado</th>
                  <th>Cuando</th>
                  <th>Entonces</th>
                  <th class="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${(this._getAcceptanceCriteriaStructuredList().length > 0 ? this._getAcceptanceCriteriaStructuredList() : [{ given: '', when: '', then: '', raw: '' }]).map((scenario, idx) => html`
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="ellipsis" title=${scenario.given || ''}>${scenario.given || ''}</td>
                    <td class="ellipsis" title=${scenario.when || ''}>${scenario.when || ''}</td>
                    <td class="ellipsis" title=${scenario.then || ''}>${scenario.then || ''}</td>
                    <td class="actions">
                      <span class="icon-button" role="button" title="Editar" @click=${() => this._openScenarioModal(idx)} aria-label="Editar escenario">✏️</span>
                      ${this._getAcceptanceCriteriaStructuredList().length > 1 ? html`
                        <span class="icon-button danger" role="button" title="Eliminar" @click=${() => this._removeScenario(idx)} aria-label="Eliminar escenario">🗑️</span>
                      ` : ''}
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
            <div class="scenario-actions">
              <button class="secondary-button" type="button" @click=${this._showRegenerateAcceptanceModal} ?disabled=${!this.isEditable}>Regenerar con IA</button>
              <button class="secondary-button" type="button" @click=${() => this._openScenarioModal(null)} ?disabled=${!this.isEditable}>+ Añadir escenario</button>
            </div>
          </div>` : ''}
        ${this.activeTab === 'notes' ? html`
          <textarea
            .value=${this.notes}
            @input=${this._handleNotesChange}
            placeholder="Notes"
            aria-label="Notes"
            ?disabled=${!this.isEditable}>
          </textarea>` : ''}
        ${this.activeTab === 'history' ? html`
          <card-history-viewer
            .projectId=${this.projectId}
            .cardType=${'PRP'}
            .cardId=${this.cardId}>
          </card-history-viewer>` : ''}
      </div>

      ${!this.isNewProposal ? html`
        <button
          @click=${this.showConvertConfirmation}
          style="background-color: var(--brand-secondary); margin: 1rem;"
        >
          Convert to Task
        </button>
      ` : ''}

      ${this.canEdit ? html`
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
          description: this.description,
          notes: this.notes,
          acceptanceCriteria: this.acceptanceCriteria,
          registerDate: this.registerDate,
          createdBy: this.createdBy,
          userEmail: this.userEmail,
        }
      }));
    }
  }

  _updateCardHistory() {
    // Asegurar que history existe
    if (!this.history) {
      this.history = [];
    }
    const newHistoryEntry = {
      updatedBy: this.userEmail,
      timestamp: new Date().toISOString()
    };
    this.history.push(newHistoryEntry);
  }

  getFormatedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Asegura dos dígitos en el mes
    const day = String(date.getDate()).padStart(2, '0'); // Asegura dos dígitos en el día
    return `${year}-${month}-${day}`;
  }

  getWCProps() {
    return this._buildPersistentProps(PROPOSAL_SCHEMA.PERSISTENT_FIELDS);
  }

  _handleSave() {
    // Validar campos requeridos
    if (!this.validateRequiredFields()) {
      const missingFields = this.getMissingRequiredFields();
      const fieldLabels = {
        title: 'Título',
        epic: 'Epic',
        descDado: 'Como (rol/usuario)',
        descCuando: 'Quiero (funcionalidad)',
        descPara: 'Para (beneficio)',
        acceptanceCriteria: 'Criterios de aceptación'
      };
      const missingLabels = missingFields.map(f => fieldLabels[f] || f).join(', ');
      this._showNotification(`Campos requeridos vacíos: ${missingLabels}`, 'error');
      return;
    }

    // Validar developer solo si hay opciones configuradas
    if (this.developers.length && this.developer) {
      const optionValues = new Set(this.developers.map(d => d.value));
      if (!optionValues.has(this.developer)) {
        this._showNotification('Developer seleccionado no pertenece al proyecto', 'error');
        return;
      }
    }

    // Limpiar campos inválidos si la validación pasó
    this.invalidFields = [];

    if (!this.canEdit) {
      this._showNotification('No tienes permisos para guardar', 'error');
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
      // Si es una nueva propuesta (sin createdBy), asignar el usuario actual como creador
      if (!this.createdBy && this.userEmail) {
        this.createdBy = this.userEmail;
      }

      this._updateCardHistory();
      const cardProps = this.getWCProps();
      cardProps.expanded = false;
      cardProps.registerDate = this.getFormatedDate(new Date());
      document.dispatchEvent(new CustomEvent('save-card', {
        detail: {
          cardData: cardProps
        }
      }));

      // Actualizar la tarjeta compacta original que está fuera del modal
      this._updateOriginalCard(cardProps);

      // Marcar como guardado para que hasChanges() devuelva false
      this.markAsSaved();

      // Emitir evento de guardado exitoso para que AppModal cierre automáticamente
      document.dispatchEvent(new CustomEvent('card-save-success', {
        detail: {
          cardId: this.id || this.cardId,
          sourceElement: this,
          isNewCard: this.cardId?.includes('temp_') || !this.id
        },
        bubbles: true,
        composed: true
      }));

      // También disparar desde el elemento para compatibilidad con showExpandedCardInModal
      this.dispatchEvent(new CustomEvent('card-save-success', {
        detail: { cardId: this.id || this.cardId },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('[ProposalCard] _handleSave error:', error);
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
    const originalCard = document.querySelector(`proposal-card[data-id="${firebaseId}"]:not([expanded])`);

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

  showConvertConfirmation(event) {
    if (event) {
      event.stopPropagation();
    }

    if (!this.id) {
      this._showNotification('Guarda la propuesta antes de convertirla', 'warning');
      return;
    }

    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Convertir propuesta',
          message: `¿Quieres convertir la propuesta <b>${this.title || this.cardId}</b> en una tarea?`,
          button1Text: 'Convertir',
          button2Text: 'Cancelar',
          button1css: 'background-color: var(--brand-secondary);',
          button2css: 'background-color: #6b7280;',
          button1Action: () => this.convertToTask(),
          button2Action: () => { },
          maxWidth: '520px'
        }
      }
    }));
  }

  // Input handlers
  _handleTitleChange(e) { this.title = e.target.value; }
  _handleDescriptionChange(e) { this.description = e.target.value; }
  _handleNotesChange(e) { this.notes = e.target.value; }
  _handleAcceptanceCriteriaChange(e) { this.acceptanceCriteria = e.target.value; }
  _handleRegisterDateChange(e) { this.startDate = e.target.value; }
  _handleEpicChange(e) { this.epic = e.target.value; }
  _handleBusinessPointsChange(e) { this.businessPoints = Number(e.target.value); }
  _handleStakeholderChange(e) { this.stakeholder = e.target.value; }

  /**
   * Sincroniza el campo description desde los campos estructurados
   * Formato: "Dado: ... | Cuando: ... | Para: ..."
   */
  _syncDescriptionFromStructured() {
    const parts = [];
    if (this.descDado) parts.push(`Dado: ${this.descDado}`);
    if (this.descCuando) parts.push(`Cuando: ${this.descCuando}`);
    if (this.descPara) parts.push(`Para: ${this.descPara}`);
    this.description = parts.join(' | ');
  }

  /**
   * Parsea una descripción legacy al formato estructurado
   * @param {string} desc - Descripción en formato legacy o estructurado
   */
  _parseDescriptionToStructured(desc) {
    if (!desc) return;

    // Si ya tiene formato estructurado "Dado: ... | Cuando: ... | Para: ..."
    const dadoMatch = desc.match(/Dado:\s*([^|]*)/i);
    const cuandoMatch = desc.match(/Cuando:\s*([^|]*)/i);
    const paraMatch = desc.match(/Para:\s*([^|]*)/i);

    if (dadoMatch || cuandoMatch || paraMatch) {
      this.descDado = dadoMatch ? dadoMatch[1].trim() : '';
      this.descCuando = cuandoMatch ? cuandoMatch[1].trim() : '';
      this.descPara = paraMatch ? paraMatch[1].trim() : '';
    } else {
      // Descripción legacy sin formato - poner todo en "Dado"
      this.descDado = desc;
    }
  }

  /**
   * Check if description needs AI conversion (has content in descDado but not in other fields)
   */
  _needsDescriptionConversion() {
    return this.descDado && this.descDado.trim().length > 10 &&
           !this.descCuando?.trim() && !this.descPara?.trim();
  }

  /**
   * Convert legacy description to user story format using AI
   */
  async _convertLegacyDescription() {
    // Prevent multiple clicks
    if (this._isConvertingDescription) return;

    const legacyDescription = (this.descDado || '').trim();

    if (!legacyDescription || legacyDescription.length < 5) {
      this._showNotification('No hay descripción suficiente para convertir', 'warning');
      return;
    }

    this._isConvertingDescription = true;
    this._showSavingOverlay('Generando descripción...');

    try {
      const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
      const functions = getFunctions(undefined, 'europe-west1');
      const convertDescription = httpsCallable(functions, 'convertDescriptionToUserStory');

      const result = await convertDescription({
        description: legacyDescription,
        title: this.title || ''
      });

      if (result.data?.status === 'ok') {
        // Update the structured description with the converted values
        this.descDado = result.data.como;
        this.descCuando = result.data.quiero;
        this.descPara = result.data.para;
        this._syncDescriptionFromStructured();

        this._showNotification('Descripción convertida correctamente', 'success');
        this.requestUpdate();
      } else {
        throw new Error('No se pudo convertir la descripción');
      }
    } catch (error) {
      console.error('Error converting description:', error);
      this._showNotification(error.message || 'Error al convertir la descripción', 'error');
    } finally {
      this._isConvertingDescription = false;
      this._hideSavingOverlay();
    }
  }

  _handleCopyLinkClick(event) {
    event.stopPropagation();
    this.copyCardUrl();
  }

  async convertToTask() {
    // Mostrar loading layer
    const loadingLayer = this._showConversionLoading();

    try {
      // Generar acceptance tests con IA antes de crear la tarea
      const iaResult = await this._generateAcceptanceTestsWithIa();

      const taskData = {
        // Datos que se mantienen de la propuesta
        title: this.title,
        description: this.description,
        // Formato estructurado que TaskCard espera
        descriptionStructured: [{
          role: this.descDado || '',
          goal: this.descCuando || '',
          benefit: this.descPara || '',
          legacy: ''
        }],
        notes: this.notes,
        // Usar los acceptance tests generados por IA si los hay, si no usar los originales
        acceptanceCriteria: iaResult?.acceptanceCriteria || this.acceptanceCriteria || '',
        acceptanceCriteriaStructured: iaResult?.acceptanceCriteriaStructured || [],
        createdBy: this.createdBy,
        userEmail: this.userEmail,
        projectId: this.projectId,
        group: this.group,
        section: this.section,

        // Datos nuevos requeridos para Task
        businessPoints: this.businessPoints || 0,
        devPoints: 0,
        status: 'To Do',
        startDate: '',
        endDate: '',
        blockedByBusiness: false,
        blockedByDevelopment: false,
        bbbWhy: '',
        bbdWhy: '',
        bbbWho: '',
        bbdWho: '',
        blockedHistory: [],
        expedited: false,
        epic: this.epic || '',
        validator: this.stakeholder || '',
        developer: this.developer || '',
        developerHistory: [],
        sprint: ''
      };

      // Ocultar loading layer
      this._hideConversionLoading(loadingLayer);

      // Escuchar por el éxito de la conversión para ocultar esta tarjeta
      const handleConversionSuccess = (e) => {
        // Solo aplicar si es nuestra propuesta la que se convirtió
        if (e.detail?.options?.message?.includes('Propuesta convertida en tarea')) {
          this._hideCard();
          document.removeEventListener('show-slide-notification', handleConversionSuccess);
        }
      };
      document.addEventListener('show-slide-notification', handleConversionSuccess);

      // Disparar evento para crear la nueva tarea
      document.dispatchEvent(new CustomEvent('create-task', {
        detail: {
          taskData,
          originalProposal: this.getWCProps()
        }
      }));
    } catch (error) {
      console.error('Error converting proposal to task:', error);
      this._hideConversionLoading(loadingLayer);
      this._showNotification(`Error al convertir propuesta: ${error.message}`, 'error');
    }
  }

  /**
   * Genera acceptance tests usando IA basándose en la descripción estructurada
   * @returns {Promise<Object|null>} Objeto con acceptanceCriteria y acceptanceCriteriaStructured
   */
  async _generateAcceptanceTestsWithIa() {
    try {
      if (!this.projectId) {
        console.warn('No projectId available for IA generation');
        return null;
      }

      const callable = httpsCallable(functions, 'generateAcceptanceCriteria');
      const payload = {
        projectId: this.projectId,
        force: true,
        task: {
          title: this.title,
          description: this.description,
          descriptionStructured: {
            role: this.descDado || '',
            goal: this.descCuando || '',
            benefit: this.descPara || ''
          },
          notes: this.notes,
          acceptanceCriteriaStructured: []
        }
      };

      const response = await callable(payload);
      const responsePayload = response?.data || {};

      if (!Array.isArray(responsePayload.acceptanceCriteriaStructured)) {
        console.warn('IA did not return structured acceptance criteria');
        return null;
      }

      return {
        acceptanceCriteria: responsePayload.acceptanceCriteria || '',
        acceptanceCriteriaStructured: responsePayload.acceptanceCriteriaStructured
      };
    } catch (error) {
      console.error('Error generating acceptance tests with IA:', error);
      // No lanzar error, simplemente retornar null para usar los criterios manuales
      return null;
    }
  }

  /**
   * Muestra el loading layer durante la conversión
   * @returns {HTMLElement} El elemento loading layer
   */
  _showConversionLoading() {
    const loading = document.createElement('loading-layer');
    loading.setAttribute('color', '#6366f1');
    loading.setAttribute('message', 'Convirtiendo propuesta y generando Acceptance tests con IA. Esta acción puede tardar más de un minuto...');
    loading.setAttribute('size', '80');
    loading.setAttribute('stroke-width', '6');
    loading.setAttribute('visible', '');
    loading.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; z-index: 10001 !important;';
    document.body.appendChild(loading);
    return loading;
  }

  /**
   * Oculta el loading layer de conversión
   * @param {HTMLElement} loadingLayer - El elemento loading layer
   */
  _hideConversionLoading(loadingLayer) {
    if (loadingLayer?.parentNode) {
      loadingLayer.parentNode.removeChild(loadingLayer);
    }
  }

  /**
 * Oculta la tarjeta del DOM con una animación suave
 */
  _hideCard() {
    // Cerrar modal PRIMERO si está expandida (sin cambiar expanded aún)
    if (this.expanded) {
      // Disparar close-modal para cerrar el AppModal
      // Usar target: 'all' porque el sistema de modales no reconoce contentElementId
      document.dispatchEvent(new CustomEvent('close-modal', {
        bubbles: true,
        composed: true,
        detail: { target: 'all' }
      }));
      // Ahora sí actualizar el estado
      this.expanded = false;
    }

    // Buscar la tarjeta compacta en el DOM principal (no la expandida en modal)
    const compactCard = document.querySelector(`proposal-card[id="${this.id}"]:not([expanded])`);
    if (compactCard) {
      // Animación de desvanecimiento para la tarjeta compacta
      compactCard.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      compactCard.style.opacity = '0';
      compactCard.style.transform = 'scale(0.9)';

      // Eliminar la tarjeta compacta después de la animación
      setTimeout(() => {
        compactCard.remove();
      }, 300);
    } else {
      // Si no hay tarjeta compacta, eliminar esta instancia (probablemente ya es la compacta)
      this.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      this.style.opacity = '0';
      this.style.transform = 'scale(0.9)';

      setTimeout(() => {
        this.remove();
      }, 300);
    }
  }

  /**
   * Copia la URL de la propuesta al portapapeles y muestra una notificación.
   */
  copyCardUrl() {
    this._copyProposalUrl();
  }

  _copyProposalUrl() {
    const baseUrl = `${window.location.origin}/adminproject/?projectId=${encodeURIComponent(this.projectId)}&cardId=${this.cardId}#proposals`;
    navigator.clipboard.writeText(baseUrl).then(() => {
      const notification = document.createElement('slide-notification');
      notification.message = 'Enlace de la propuesta copiado al portapapeles';
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
   * Carga las épicas del proyecto desde la base de datos
   * @private
   */
  async _loadEpics() {
    try {
      const epicsRef = ref(database, `/cards/${this.projectId}/EPICS_${this.projectId}`);
      onValue(epicsRef, (snapshot) => {
        const epicsData = snapshot.val() || {};
        const epics = Object.entries(epicsData).map(([id, epic]) => ({
          id: epic.cardId || id,
          title: epic.title || (epic.cardId || id),
          description: epic.description || ''
        }));
        // Añadir opción "Sin épica"
        this.epicList = [{ id: '', title: 'Sin épica' }, ...epics];
        this.requestUpdate('epic');
      }, (error) => {
this.epicList = [{ id: '', title: 'Error al cargar épicas' }];
        this.requestUpdate('epic');
      });
    } catch (error) {
this.epicList = [{ id: '', title: 'Error al cargar épicas' }];
      this.requestUpdate('epic');
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('projectId')) {
      this._loadEpics();
      this._loadProjectScoringSystem();
    }
  }

  /**
   * Carga el scoringSystem del proyecto desde la base de datos
   * @private
   */
  async _loadProjectScoringSystem() {
    try {
      if (!this.projectId) {
        return;
      }

      const projectRef = ref(database, `/projects/${this.projectId}`);
      onValue(projectRef, (snapshot) => {
        if (snapshot.exists()) {
          const projectData = snapshot.val();
          this.projectScoringSystem = projectData.scoringSystem || '1-5';
          this.requestUpdate();
        }
      }, { onlyOnce: true });
    } catch (error) {
this.projectScoringSystem = '1-5';
    }
  }

  /**
   * Obtiene las opciones de puntos según el sistema de scoring del proyecto
   * @returns {Array<number>} Array de valores de puntos
   */
  getPointsOptions() {
    const scoringSystem = this.projectScoringSystem || '1-5';

    if (scoringSystem === 'fibonacci') {
      return [0, 1, 2, 3, 5, 8, 13, 21];
    } else {
      return [0, 1, 2, 3, 4, 5];
    }
  }

  /**
   * Campos requeridos para guardar una propuesta
   * @returns {Array<string>} Array de nombres de campos requeridos
   */
  getRequiredFields() {
    return ['title', 'epic', 'descDado', 'descCuando', 'descPara', 'acceptanceCriteria'];
  }

  /**
   * Obtiene los campos requeridos que están vacíos
   * @returns {Array<string>} Array de nombres de campos vacíos
   */
  getMissingRequiredFields() {
    const required = this.getRequiredFields();
    const missing = [];

    for (const field of required) {
      const value = this[field];
      if (!value || (typeof value === 'string' && !value.trim())) {
        missing.push(field);
      }
    }

    return missing;
  }

  /**
   * Valida los campos requeridos y actualiza invalidFields
   * @returns {boolean} true si todos los campos requeridos están completos
   */
  validateRequiredFields() {
    const missing = this.getMissingRequiredFields();
    this.invalidFields = missing;
    return missing.length === 0;
  }

  /**
   * Comprueba si un campo está marcado como inválido
   * @param {string} fieldName - Nombre del campo
   * @returns {boolean}
   */
  _isFieldInvalid(fieldName) {
    return this.invalidFields && this.invalidFields.includes(fieldName);
  }

  /**
   * Obtiene la clase CSS para un campo, añadiendo 'invalid-field' si es inválido
   * @param {string} fieldName - Nombre del campo
   * @param {string} baseClass - Clase base opcional
   * @returns {string}
   */
  _getFieldClass(fieldName, baseClass = '') {
    const invalidClass = this._isFieldInvalid(fieldName) ? 'invalid-field' : '';
    return baseClass ? `${baseClass} ${invalidClass}`.trim() : invalidClass;
  }

  /**
   * Override: Campos editables específicos de ProposalCard
   * @returns {Object} Estado actual de campos editables
   */
  _getEditableState() {
    return {
      ...super._getEditableState(),
      acceptanceCriteria: this.acceptanceCriteria || '',
      acceptanceCriteriaStructured: JSON.stringify(this._getAcceptanceCriteriaStructuredForSave() || []),
      registerDate: this.registerDate || '',
      epic: this.epic || '',
      businessPoints: this.businessPoints || 0,
      descDado: this.descDado || '',
      descCuando: this.descCuando || '',
      descPara: this.descPara || '',
      stakeholder: this.stakeholder || ''
    };
  }

  // ========== Acceptance Criteria Structured Methods ==========

  _getAcceptanceCriteriaStructuredList() {
    const raw = this.acceptanceCriteriaStructured;
    if (Array.isArray(raw)) {
      return raw.filter(item => item && typeof item === 'object');
    }
    if (raw && typeof raw === 'object') {
      const hasScenarioFields = 'given' in raw || 'when' in raw || 'then' in raw || 'raw' in raw;
      if (hasScenarioFields) {
        return [raw];
      }
      const numericKeys = Object.keys(raw).filter(key => String(Number(key)) === key);
      if (numericKeys.length > 0) {
        return numericKeys
          .toSorted((a, b) => Number(a) - Number(b))
          .map(key => raw[key])
          .filter(item => item && typeof item === 'object');
      }
      const candidates = Object.values(raw).filter(value => value && typeof value === 'object');
      const filtered = candidates.filter(value => (
        (value.given || '').trim() ||
        (value.when || '').trim() ||
        (value.then || '').trim() ||
        (value.raw || '').trim()
      ));
      if (filtered.length > 0) {
        return filtered;
      }
      return candidates;
    }
    return [];
  }

  _getAcceptanceCriteriaStructuredForSave() {
    const list = this._getAcceptanceCriteriaStructuredList();
    if (list.length > 0) {
      return list;
    }
    if (Array.isArray(this.acceptanceCriteriaStructured)) {
      return this.acceptanceCriteriaStructured;
    }
    return [];
  }

  _hydrateStructuredAcceptance() {
    const normalized = this._getAcceptanceCriteriaStructuredList();
    if (normalized.length > 0) {
      if (!Array.isArray(this.acceptanceCriteriaStructured)) {
        this.acceptanceCriteriaStructured = normalized;
      }
      return;
    }

    const scenarios = [];
    const raw = (this.acceptanceCriteria || '').toString().trim();
    if (raw) {
      scenarios.push({
        given: '',
        when: '',
        then: raw,
        raw
      });
    }
    this.acceptanceCriteriaStructured = scenarios.length ? scenarios : [{
      given: '',
      when: '',
      then: '',
      raw: ''
    }];
  }

  _buildAcceptanceText() {
    const scenariosList = this._getAcceptanceCriteriaStructuredList();
    if (scenariosList.length === 0) {
      return this.acceptanceCriteria || '';
    }
    const parts = scenariosList.map((scenario, index) => {
      const givenParts = (scenario.given || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
      const thenParts = (scenario.then || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

      const givenLines = givenParts.map((line, idx) => idx === 0 ? `Dado ${line}` : `Y ${line}`);
      const thenLines = thenParts.map((line, idx) => idx === 0 ? `Entonces ${line}` : `Y ${line}`);
      const whenLine = scenario.when ? `Cuando ${scenario.when}` : '';

      const allLines = [...givenLines, whenLine, ...thenLines].filter(Boolean);
      const title = scenariosList.length > 1 ? `Escenario ${index + 1}:\n` : '';
      return `${title}${allLines.join('\n')}`;
    });
    return parts.filter(Boolean).join('\n\n');
  }

  _openScenarioModal(index = null) {
    this._hydrateStructuredAcceptance();

    const scenarios = this._getAcceptanceCriteriaStructuredList();
    if (!Array.isArray(this.acceptanceCriteriaStructured) && scenarios.length > 0) {
      this.acceptanceCriteriaStructured = scenarios;
    }
    const existing = index !== null && scenarios[index] ? scenarios[index] : null;

    openScenarioModal({
      existing,
      isNew: index === null,
      onSave: (scenario) => {
        const scenariosUpdated = [...this._getAcceptanceCriteriaStructuredList()];
        if (index === null || index === undefined) {
          scenariosUpdated.push(scenario);
        } else {
          scenariosUpdated[index] = scenario;
        }
        this.acceptanceCriteriaStructured = scenariosUpdated;
        this.acceptanceCriteria = this._buildAcceptanceText();
        this.requestUpdate();
      }
    });
  }

  _removeScenario(index) {
    const scenarios = this._getAcceptanceCriteriaStructuredList();
    if (scenarios.length <= 1) {
      this.acceptanceCriteriaStructured = [{ given: '', when: '', then: '', raw: '' }];
      this.acceptanceCriteria = this._buildAcceptanceText();
      return;
    }
    const updated = [...scenarios];
    updated.splice(index, 1);
    this.acceptanceCriteriaStructured = updated;
    this.acceptanceCriteria = this._buildAcceptanceText();
  }

  _showRegenerateAcceptanceModal() {
    // If no existing criteria, regenerate directly without confirmation
    const hasExistingCriteria = Array.isArray(this.acceptanceCriteriaStructured) &&
      this.acceptanceCriteriaStructured.length > 0;

    if (!hasExistingCriteria) {
      this._regenerateAcceptanceCriteria();
      return;
    }

    // Show confirmation only when there are existing criteria to replace
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: 'Regenerar Acceptance Criteria',
          message: 'Esto reemplazará los criterios actuales por una versión generada con IA. ¿Quieres continuar?',
          button1Text: 'Regenerar',
          button2Text: 'Cancelar',
          button1css: 'background-color: #6366f1; color: white;',
          button2css: 'background-color: #6b7280; color: white;',
          button1Action: () => this._regenerateAcceptanceCriteria(),
          button2Action: () => { }
        }
      }
    }));
  }

  async _regenerateAcceptanceCriteria() {
    const generated = await this._generateAcceptanceCriteriaWithIa({ force: true });
    if (generated) {
      this._showNotification('Acceptance Criteria regenerados con IA', 'success');
    }
  }

  async _generateAcceptanceCriteriaWithIa({ force = false } = {}) {
    const loadingLayer = this._showAcceptanceLoading();

    try {
      if (!this.projectId) {
        this._hideAcceptanceLoading(loadingLayer);
        this._showNotification('Falta projectId para generar criterios', 'error');
        return false;
      }

      const callable = httpsCallable(functions, 'generateAcceptanceCriteria');
      const payload = {
        projectId: this.projectId,
        force,
        task: {
          title: this.title,
          description: this.description,
          descriptionStructured: {
            role: this.descDado || '',
            goal: this.descCuando || '',
            benefit: this.descPara || ''
          },
          notes: this.notes,
          acceptanceCriteriaStructured: this._getAcceptanceCriteriaStructuredForSave()
        }
      };

      const response = await callable(payload);
      const responsePayload = response?.data || {};

      this._hideAcceptanceLoading(loadingLayer);

      if (!Array.isArray(responsePayload.acceptanceCriteriaStructured)) {
        const reason = responsePayload?.error || responsePayload?.message || 'Respuesta sin escenarios';
        this._showNotification(`No se pudo generar Acceptance Criteria con IA: ${reason}`, 'error');
        return false;
      }

      this.acceptanceCriteriaStructured = responsePayload.acceptanceCriteriaStructured;
      this.acceptanceCriteria = responsePayload.acceptanceCriteria || this._buildAcceptanceText();
      this.requestUpdate();
      return true;
    } catch (error) {
      this._hideAcceptanceLoading(loadingLayer);
      const reason = typeof error?.details === 'string'
        ? error.details
        : (error?.message || 'Error desconocido');
      this._showNotification(`No se pudo generar Acceptance Criteria con IA: ${reason}`, 'error');
      return false;
    }
  }

  _showAcceptanceLoading() {
    const loading = document.createElement('loading-layer');
    loading.setAttribute('color', '#6366f1');
    loading.setAttribute('message', 'Generando Acceptance tests. Esta acción puede tardar más de un minuto');
    loading.setAttribute('size', '80');
    loading.setAttribute('stroke-width', '6');
    loading.setAttribute('visible', '');
    loading.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; z-index: 10001 !important;';
    document.body.appendChild(loading);
    return loading;
  }

  _hideAcceptanceLoading(loadingLayer) {
    if (loadingLayer?.parentNode) {
      loadingLayer.removeAttribute('visible');
      setTimeout(() => {
        loadingLayer.remove();
      }, 300);
    }
  }
}

customElements.define('proposal-card', ProposalCard);

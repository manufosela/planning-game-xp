import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { unsafeHTML } from 'https://cdn.jsdelivr.net/npm/lit-html@3.0.2/directives/unsafe-html.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15/+esm';
import { ProjectFormStyles } from './project-form-styles.js';
import { iaAvailabilityService } from '../services/ia-availability-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { globalConfigService } from '../services/global-config-service.js';
import { database, ref, get, set } from '../../firebase-config.js';
import { toFirebaseKey } from '../utils/firebase-key-utils.js';
import { encodeEmailForFirebase } from '../utils/email-sanitizer.js';
import './ColorTabs.js';

export class ProjectForm extends LitElement {
  static get properties() {
    return {
      projectName: { type: String },
      abbreviation: { type: String },
      scoringSystem: { type: String },
      stakeholders: { type: Array },
      developers: { type: Array },
      editMode: { type: Boolean },
      originalProjectName: { type: String },
      allowExecutables: { type: Boolean },
      showDeleteSection: { type: Boolean },
      deleteConfirmationText: { type: String },
      description: { type: String },
      repoUrl: { type: Object }, // String (1 repo) o Array [{url, label}] (múltiples)
      languagesText: { type: String },
      frameworksText: { type: String },
      // Global config selections (replaces agentsGuidelines)
      selectedAgents: { type: Array },
      selectedPrompts: { type: Array },
      selectedInstructions: { type: Array },
      // Available global configs
      availableAgents: { type: Array },
      availablePrompts: { type: Array },
      availableInstructions: { type: Array },
      useIa: { type: Boolean },
      iaAvailable: { type: Boolean },
      businessContext: { type: String },
      _showBusinessContextPreview: { type: Boolean, state: true },
      // Available options from /data/*
      availableDevelopers: { type: Array },
      availableStakeholders: { type: Array },
      // Selected values in dropdowns
      selectedDeveloperId: { type: String },
      selectedStakeholderId: { type: String },
      // Create new entity mode
      showCreateDeveloper: { type: Boolean },
      showCreateStakeholder: { type: Boolean },
      newDeveloperName: { type: String },
      newDeveloperEmail: { type: String },
      newStakeholderName: { type: String },
      newStakeholderEmail: { type: String },
      // Loading state
      isLoading: { type: Boolean },
      // Archive state
      archived: { type: Boolean },
      // Whether the project has existing cards (locks abbreviation + name)
      hasCards: { type: Boolean },
      // Public view (read-only page for stakeholders)
      isPublicView: { type: Boolean },
      // Public API (endpoint for agents/integrations)
      isPublicApi: { type: Boolean },
      // Public access token for protected sharing
      publicToken: { type: String },
      // Current project name (for building shareable URL)
      currentProjectName: { type: String },
      // Team specs checklist (configurable per project)
      teamSpecs: { type: Array },
      _newSpecText: { type: String, state: true },
      // Permission to delete (only superadmin)
      canDelete: { type: Boolean },
      // App permissions (Uploaders and Approvers)
      appUploaders: { type: Array },
      appApprovers: { type: Array },
      betaUsers: { type: Array },
      selectedUploaderId: { type: String },
      selectedApproverId: { type: String },
      selectedBetaId: { type: String }
    };
  }

  static get styles() {
    return ProjectFormStyles;
  }

  constructor() {
    super();
    this.projectName = '';
    this.abbreviation = '';
    this.scoringSystem = '1-5';
    this.stakeholders = [];
    this.developers = [];
    this.editMode = false;
    this.originalProjectName = '';
    this.allowExecutables = false;
    this.showDeleteSection = false;
    this.deleteConfirmationText = '';
    this.description = '';
    this.repoUrl = '';
    this.languagesText = '';
    this.frameworksText = '';
    // Global config selections
    this.selectedAgents = [];
    this.selectedPrompts = [];
    this.selectedInstructions = [];
    this.availableAgents = [];
    this.availablePrompts = [];
    this.availableInstructions = [];
    this.useIa = false;
    this.iaAvailable = iaAvailabilityService.isAvailable();
    this.businessContext = '';
    this._showBusinessContextPreview = false;
    // Available options
    this.availableDevelopers = [];
    this.availableStakeholders = [];
    // Selected values
    this.selectedDeveloperId = '';
    this.selectedStakeholderId = '';
    // Create new entity mode
    this.showCreateDeveloper = false;
    this.showCreateStakeholder = false;
    this.newDeveloperName = '';
    this.newDeveloperEmail = '';
    this.newStakeholderName = '';
    this.newStakeholderEmail = '';
    this.isLoading = true;
    this.archived = false;
    this.isPublicView = false;
    this.isPublicApi = false;
    this.publicToken = '';
    this.currentProjectName = '';
    this._copiedField = '';
    this.teamSpecs = [];
    this._newSpecText = '';
    this.hasCards = false;
    this.canDelete = false; // Only superadmin can delete
    // App permissions
    this.appUploaders = [];
    this.appApprovers = [];
    this.betaUsers = [];
    this.selectedUploaderId = '';
    this.selectedApproverId = '';
    this.selectedBetaId = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    try {
      // Initialize entityDirectoryService and load available options
      await entityDirectoryService.waitForInit();
      this._loadAvailableEntities();

      // Subscribe to entity changes to update dropdowns dynamically
      this._unsubscribeEntities = entityDirectoryService.addChangeListener((type) => {
        if (type === 'developers' || type === 'stakeholders') {
          this._loadAvailableEntities();
          this.requestUpdate();
        }
      });

      const available = await iaAvailabilityService.ensureInitialized();
      this.iaAvailable = available || this.useIa;

      // Load available global configs
      await this._loadAvailableGlobalConfigs();

      // Load app permissions if editing a project with apps enabled
      if (this.editMode && this.allowExecutables) {
        await this._loadAppPermissions();
      }

      this.isLoading = false;
      this.requestUpdate();
    } catch (_e) {
      this.isLoading = false;
      this.requestUpdate();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Unsubscribe from entity changes
    if (this._unsubscribeEntities) {
      this._unsubscribeEntities();
      this._unsubscribeEntities = null;
    }
  }

  _loadAvailableEntities() {
    // Load all developers and stakeholders from /data/*
    this.availableDevelopers = entityDirectoryService.getActiveDevelopers();
    this.availableStakeholders = entityDirectoryService.getActiveStakeholders();
  }

  /**
   * Load available global configs (agents, prompts, instructions)
   */
  async _loadAvailableGlobalConfigs() {
    try {
      const [agents, prompts, instructions] = await Promise.all([
        globalConfigService.getAllConfigs('agents'),
        globalConfigService.getAllConfigs('prompts'),
        globalConfigService.getAllConfigs('instructions')
      ]);
      this.availableAgents = agents || [];
      this.availablePrompts = prompts || [];
      this.availableInstructions = instructions || [];
    } catch (e) {
      console.warn('Failed to load global configs:', e);
      this.availableAgents = [];
      this.availablePrompts = [];
      this.availableInstructions = [];
    }
  }

  /**
   * Get project developers as array of {id, name, email}
   */
  _getDevelopersAsArray() {
    if (!Array.isArray(this.developers)) return [];

    return this.developers.map(dev => {
      if (typeof dev === 'string') {
        // It's a dev_XXX ID
        const entity = entityDirectoryService.getDeveloper(dev);
        return entity || { id: dev, name: dev, email: '' };
      }
      // It's an object
      const id = dev.id || '';
      if (id.startsWith('dev_')) {
        const entity = entityDirectoryService.getDeveloper(id);
        return entity || { id, name: dev.name || id, email: dev.email || '' };
      }
      // Legacy format - try to resolve
      const resolved = entityDirectoryService.resolveDeveloperId(dev.email || dev.name);
      if (resolved) {
        const entity = entityDirectoryService.getDeveloper(resolved);
        return entity || { id: resolved, name: dev.name, email: dev.email };
      }
      return { id: '', name: dev.name || '', email: dev.email || '' };
    }).filter(d => d.id || d.name);
  }

  /**
   * Get project stakeholders as array of {id, name, email}
   */
  _getStakeholdersAsArray() {
    if (!Array.isArray(this.stakeholders)) return [];

    return this.stakeholders.map(stk => {
      if (typeof stk === 'string') {
        // It's a stk_XXX ID
        const entity = entityDirectoryService.getStakeholder(stk);
        return entity || { id: stk, name: stk, email: '' };
      }
      // It's an object
      const id = stk.id || '';
      if (id.startsWith('stk_')) {
        const entity = entityDirectoryService.getStakeholder(id);
        return entity || { id, name: stk.name || id, email: stk.email || '' };
      }
      // Legacy format - try to resolve
      const resolved = entityDirectoryService.resolveStakeholderId(stk.email || stk.name);
      if (resolved) {
        const entity = entityDirectoryService.getStakeholder(resolved);
        return entity || { id: resolved, name: stk.name, email: stk.email };
      }
      return { id: '', name: stk.name || '', email: stk.email || '' };
    }).filter(s => s.id || s.name);
  }

  render() {
    if (this.isLoading) {
      return html`<div class="loading">Cargando...</div>`;
    }

    return html`
      <form @submit=${this._handleSubmit} class="tabbed-form">
        ${this.editMode ? html`
          <div class="edit-mode-notice">
            <p><strong>Editando:</strong> ${this.originalProjectName}</p>
          </div>
        ` : ''}

        <color-tabs active-tab="general">
          <color-tab name="general" label="General" color="#4a9eff">
            ${this._renderGeneralTab()}
          </color-tab>
          <color-tab name="tech" label="Repos & Tech" color="#28a745">
            ${this._renderTechTab()}
          </color-tab>
          <color-tab name="team" label="Equipo" color="#ffc107">
            ${this._renderTeamTab()}
          </color-tab>
          <color-tab name="options" label="IA & Opciones" color="#17a2b8">
            ${this._renderOptionsTab()}
          </color-tab>
          ${this.editMode && this.allowExecutables ? html`
            <color-tab name="apps" label="Apps" color="#6c5ce7">
              ${this._renderAppsTab()}
            </color-tab>
          ` : ''}
          ${this.editMode ? html`
            <color-tab name="admin" label="Admin" color="#dc3545">
              ${this._renderAdminTab()}
            </color-tab>
          ` : ''}
        </color-tabs>
      </form>
    `;
  }

  _renderGeneralTab() {
    return html`
      <div class="tab-content">
        <div class="form-group two-col">
          <div class="stacked">
            <label for="projectName">Nombre del Proyecto <span class="required">*</span></label>
            <input
              type="text"
              id="projectName"
              .value=${this.projectName}
              @input=${this._handleProjectNameChange}
              placeholder="Ingresa el nombre del proyecto"
              required
              ?readonly=${this.editMode && this.hasCards}
              class=${this.editMode && this.hasCards ? 'locked-field' : ''}
              title=${this.editMode && this.hasCards ? 'No se puede cambiar: existen cards que dependen de este nombre como clave en Firebase' : ''}
            />
            ${this.editMode && this.hasCards ? html`<div class="helper-text locked-hint">Bloqueado: existen cards en este proyecto</div>` : ''}
          </div>
          <div class="stacked">
            <label for="abbreviation">Abreviatura <span class="required">*</span></label>
            <input
              type="text"
              id="abbreviation"
              .value=${this.abbreviation}
              @input=${this._handleAbbreviationChange}
              placeholder="ABC"
              maxlength="4"
              required
              style="text-transform: uppercase; width: 80px;"
              ?readonly=${this.editMode && this.hasCards}
              class=${this.editMode && this.hasCards ? 'locked-field' : ''}
              title=${this.editMode && this.hasCards ? 'No se puede cambiar: los cardIds existentes usan esta abreviatura' : ''}
            />
            ${this.editMode && this.hasCards
              ? html`<div class="helper-text locked-hint">Bloqueado: los cardIds usan esta abreviatura</div>`
              : html`<div class="helper-text">3-4 caracteres para IDs (ej: C4D, NTR)</div>`}
          </div>
        </div>

        <div class="form-group">
          <label for="projectDescription">Descripcion del Proyecto</label>
          <textarea
            id="projectDescription"
            .value=${this.description}
            @input=${this._handleDescriptionChange}
            placeholder="Descripcion del proyecto (documentacion, arquitectura, etc.)"
            rows="5"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="scoringSystem">Sistema de Puntuacion <span class="required">*</span></label>
          <select
            id="scoringSystem"
            .value=${this.scoringSystem}
            @change=${this._handleScoringSystemChange}
            required
          >
            <option value="1-5">1-5</option>
            <option value="fibonacci">Fibonacci</option>
          </select>
        </div>
      </div>
    `;
  }

  _renderTechTab() {
    return html`
      <div class="tab-content">
        ${this._renderRepositoriesSection()}

        <div class="form-group two-col">
          <div class="stacked">
            <label for="languages">Lenguajes</label>
            <input
              type="text"
              id="languages"
              .value=${this.languagesText}
              @input=${this._handleLanguagesChange}
              placeholder="javascript, typescript, bash"
            />
            <div class="helper-text">Separados por comas.</div>
          </div>
          <div class="stacked">
            <label for="frameworks">Frameworks</label>
            <input
              type="text"
              id="frameworks"
              .value=${this.frameworksText}
              @input=${this._handleFrameworksChange}
              placeholder="astro, lit, firebase"
            />
            <div class="helper-text">Separados por comas.</div>
          </div>
        </div>
      </div>
    `;
  }

  _renderTeamTab() {
    return html`
      <div class="tab-content">
        ${this._renderDevelopersSection()}
        ${this._renderStakeholdersSection()}
      </div>
    `;
  }

  _renderBusinessContextSection() {
    return html`
      <div class="form-group">
        <div class="business-context-header">
          <label for="businessContext">Contexto de Negocio</label>
          <button type="button" class="preview-toggle"
            @click=${() => { this._showBusinessContextPreview = !this._showBusinessContextPreview; }}>
            ${this._showBusinessContextPreview ? 'Editar' : 'Vista previa'}
          </button>
        </div>
        ${this._showBusinessContextPreview
          ? html`<div class="markdown-preview">${unsafeHTML(this._renderMarkdown(this.businessContext))}</div>`
          : html`<textarea id="businessContext" .value=${this.businessContext}
              @input=${this._handleBusinessContextChange}
              placeholder="Describe el producto, usuarios principales, stack tecnologico, integraciones y restricciones. Soporta markdown."
              rows="10"></textarea>`
        }
        <div class="helper-text">
          Contexto de alto nivel del proyecto. Usado por herramientas de IA y agentes MCP.
          Formato: Markdown.
        </div>
      </div>
    `;
  }

  _renderMarkdown(text) {
    if (!text) return '';
    return marked.parse(text);
  }

  _handleBusinessContextChange(e) {
    this.businessContext = e.target.value;
  }

  _renderOptionsTab() {
    return html`
      <div class="tab-content">
        ${this._renderBusinessContextSection()}
        ${this._renderGlobalConfigSelectors()}

        ${this._renderIaToggle()}

        <div class="form-group">
          <label>Opciones Avanzadas</label>
          <div class="checkbox-group">
            <input
              type="checkbox"
              id="allowExecutables"
              .checked=${this.allowExecutables}
              @change=${this._handleAllowExecutablesChange}
            />
            <label for="allowExecutables">Permitir adjuntar ejecutables</label>
          </div>
          ${this.canDelete ? html`
            <div class="checkbox-group">
              <input
                type="checkbox"
                id="isPublicView"
                .checked=${this.isPublicView}
                @change=${(e) => { this.isPublicView = e.target.checked; }}
              />
              <label for="isPublicView">Vista pública (página read-only para stakeholders)</label>
            </div>
            <div class="checkbox-group">
              <input
                type="checkbox"
                id="isPublicApi"
                .checked=${this.isPublicApi}
                @change=${(e) => { this.isPublicApi = e.target.checked; }}
              />
              <label for="isPublicApi">API pública (endpoint para agentes e integraciones)</label>
            </div>
            ${this._renderShareSection()}
          ` : ''}
        </div>

        <div class="form-group">
          <label>Team Specs (checklist informativo para developers)</label>
          <div class="team-specs-editor">
            ${this.teamSpecs.map((spec, i) => html`
              <div class="team-spec-row" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="flex:1;font-size:13px">${spec}</span>
                <button type="button" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:14px"
                  @click=${() => this._removeSpec(i)} title="Eliminar">x</button>
              </div>
            `)}
            <div style="display:flex;gap:8px;margin-top:8px">
              <input type="text" placeholder="Nueva spec..." .value=${this._newSpecText}
                @input=${(e) => { this._newSpecText = e.target.value; }}
                @keydown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); this._addSpec(); } }}
                style="flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px" />
              <button type="button" @click=${this._addSpec}
                style="padding:6px 12px;background:#059669;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">Añadir</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render global config selectors (agents, prompts, instructions)
   */
  _renderGlobalConfigSelectors() {
    return html`
      <div class="form-group">
        <label>🤖 Agents</label>
        <div class="config-selector">
          ${this.availableAgents.length === 0
            ? html`<span class="no-options">No hay agents configurados</span>`
            : this.availableAgents.map(agent => html`
              <label class="config-option">
                <input
                  type="checkbox"
                  .checked=${this.selectedAgents.includes(agent.id)}
                  @change=${(e) => this._handleConfigSelection('agents', agent.id, e.target.checked)}
                />
                <span class="config-name">${agent.name}</span>
                ${agent.description ? html`<span class="config-desc">${agent.description}</span>` : ''}
              </label>
            `)
          }
        </div>
        <div class="helper-text">Agentes de IA configurados para este proyecto.</div>
      </div>

      <div class="form-group">
        <label>💬 Prompts</label>
        <div class="config-selector">
          ${this.availablePrompts.length === 0
            ? html`<span class="no-options">No hay prompts configurados</span>`
            : this.availablePrompts.map(prompt => html`
              <label class="config-option">
                <input
                  type="checkbox"
                  .checked=${this.selectedPrompts.includes(prompt.id)}
                  @change=${(e) => this._handleConfigSelection('prompts', prompt.id, e.target.checked)}
                />
                <span class="config-name">${prompt.name}</span>
                ${prompt.description ? html`<span class="config-desc">${prompt.description}</span>` : ''}
              </label>
            `)
          }
        </div>
        <div class="helper-text">Prompts predefinidos disponibles para este proyecto.</div>
      </div>

      <div class="form-group">
        <label>📋 Instructions</label>
        <div class="config-selector">
          ${this.availableInstructions.length === 0
            ? html`<span class="no-options">No hay instrucciones configuradas</span>`
            : this.availableInstructions.map(instr => html`
              <label class="config-option">
                <input
                  type="checkbox"
                  .checked=${this.selectedInstructions.includes(instr.id)}
                  @change=${(e) => this._handleConfigSelection('instructions', instr.id, e.target.checked)}
                />
                <span class="config-name">${instr.name}</span>
                ${instr.description ? html`<span class="config-desc">${instr.description}</span>` : ''}
              </label>
            `)
          }
        </div>
        <div class="helper-text">Instrucciones y guías de desarrollo para este proyecto.</div>
      </div>
    `;
  }

  /**
   * Handle config selection change
   */
  _handleConfigSelection(type, configId, isSelected) {
    const propName = type === 'agents' ? 'selectedAgents'
                   : type === 'prompts' ? 'selectedPrompts'
                   : 'selectedInstructions';

    const currentSelection = [...this[propName]];

    if (isSelected && !currentSelection.includes(configId)) {
      currentSelection.push(configId);
    } else if (!isSelected) {
      const index = currentSelection.indexOf(configId);
      if (index > -1) {
        currentSelection.splice(index, 1);
      }
    }

    this[propName] = currentSelection;
  }

  _renderAdminTab() {
    return html`
      <div class="tab-content">
        ${this._renderArchiveZone()}
        ${this.canDelete ? this._renderDangerZone() : ''}
      </div>
    `;
  }

  _renderAppsTab() {
    // Get developers assigned to this project
    const projectDevelopers = this._getDevelopersAsArray();
    // Get stakeholders assigned to this project
    const projectStakeholders = this._getStakeholdersAsArray();

    // Get emails of current uploaders and approvers
    const uploaderEmails = this.appUploaders.map(u => u.email.toLowerCase());
    const approverEmails = this.appApprovers.map(a => a.email.toLowerCase());
    // Get emails of current beta users
    const betaEmails = this.betaUsers.map(c => c.email.toLowerCase());

    // Filter available developers for uploaders (exclude those who are already approvers)
    const availableForUploader = projectDevelopers.filter(dev =>
      dev.email && !approverEmails.includes(dev.email.toLowerCase()) &&
      !uploaderEmails.includes(dev.email.toLowerCase())
    );

    // Filter available developers for approvers (exclude those who are already uploaders)
    const availableForApprover = projectDevelopers.filter(dev =>
      dev.email && !uploaderEmails.includes(dev.email.toLowerCase()) &&
      !approverEmails.includes(dev.email.toLowerCase())
    );

    // Filter available stakeholders for beta users (exclude those already added)
    const availableForBeta = projectStakeholders.filter(stk =>
      stk.email && !betaEmails.includes(stk.email.toLowerCase())
    );

    return html`
      <div class="tab-content">
        <div class="apps-permissions-info">
          <p>Gestiona los permisos de acceso a las aplicaciones de este proyecto.</p>
        </div>

        <!-- Uploaders Section -->
        <div class="form-group permission-section">
          <label>📤 Uploaders</label>
          <p class="helper-text">Developers who can upload new app versions. Uploaded apps require approval.</p>

          <div class="permission-list">
            ${this.appUploaders.length === 0 ? html`
              <div class="empty-permission">No uploaders configured</div>
            ` : this.appUploaders.map(uploader => html`
              <div class="permission-item">
                <span class="permission-email">${uploader.email}</span>
                <button
                  type="button"
                  class="remove-permission-btn"
                  @click=${() => this._removeUploader(uploader.key)}
                  title="Remove uploader"
                >✕</button>
              </div>
            `)}
          </div>

          <div class="add-permission-form">
            <select
              class="permission-select"
              .value=${this.selectedUploaderId}
              @change=${(e) => this.selectedUploaderId = e.target.value}
            >
              <option value="">-- Select developer --</option>
              ${availableForUploader.map(dev => html`
                <option value=${dev.id}>${dev.name} (${dev.email})</option>
              `)}
            </select>
            <button
              type="button"
              class="add-permission-btn"
              @click=${this._addUploader}
              ?disabled=${!this.selectedUploaderId}
            >Add</button>
          </div>
          ${projectDevelopers.length === 0 ? html`
            <p class="warning-text">⚠️ No hay developers asignados a este proyecto. Añade developers en la pestaña "Equipo".</p>
          ` : availableForUploader.length === 0 && this.appUploaders.length < projectDevelopers.length ? html`
            <p class="info-text">ℹ️ Los developers restantes ya son Approvers.</p>
          ` : ''}
        </div>

        <!-- Approvers Section -->
        <div class="form-group permission-section">
          <label>✅ Approvers</label>
          <p class="helper-text">Developers who can approve, deprecate, and delete apps. Full admin access.</p>

          <div class="permission-list">
            ${this.appApprovers.length === 0 ? html`
              <div class="empty-permission">No approvers configured</div>
            ` : this.appApprovers.map(approver => html`
              <div class="permission-item">
                <span class="permission-email">${approver.email}</span>
                <button
                  type="button"
                  class="remove-permission-btn"
                  @click=${() => this._removeApprover(approver.key)}
                  title="Remove approver"
                >✕</button>
              </div>
            `)}
          </div>

          <div class="add-permission-form">
            <select
              class="permission-select"
              .value=${this.selectedApproverId}
              @change=${(e) => this.selectedApproverId = e.target.value}
            >
              <option value="">-- Select developer --</option>
              ${availableForApprover.map(dev => html`
                <option value=${dev.id}>${dev.name} (${dev.email})</option>
              `)}
            </select>
            <button
              type="button"
              class="add-permission-btn"
              @click=${this._addApprover}
              ?disabled=${!this.selectedApproverId}
            >Add</button>
          </div>
          ${projectDevelopers.length === 0 ? html`
            <p class="warning-text">⚠️ No hay developers asignados a este proyecto. Añade developers en la pestaña "Equipo".</p>
          ` : availableForApprover.length === 0 && this.appApprovers.length < projectDevelopers.length ? html`
            <p class="info-text">ℹ️ Los developers restantes ya son Uploaders.</p>
          ` : ''}
        </div>

        <!-- Beta Users Section -->
        <div class="form-group permission-section">
          <label>🧪 Beta Users</label>
          <p class="helper-text">Stakeholders who can see and download beta (beta) versions.</p>

          <div class="permission-list">
            ${this.betaUsers.length === 0 ? html`
              <div class="empty-permission">No beta users configured</div>
            ` : this.betaUsers.map(user => html`
              <div class="permission-item">
                <span class="permission-email">${user.email}</span>
                <button
                  type="button"
                  class="remove-permission-btn"
                  @click=${() => this._removeBetaUser(user.key)}
                  title="Remove beta user"
                >✕</button>
              </div>
            `)}
          </div>

          <div class="add-permission-form">
            <select
              class="permission-select"
              .value=${this.selectedBetaId}
              @change=${(e) => this.selectedBetaId = e.target.value}
            >
              <option value="">-- Select stakeholder --</option>
              ${availableForBeta.map(stk => html`
                <option value=${stk.id}>${stk.name} (${stk.email})</option>
              `)}
            </select>
            <button
              type="button"
              class="add-permission-btn"
              @click=${this._addBetaUser}
              ?disabled=${!this.selectedBetaId}
            >Add</button>
          </div>
          ${projectStakeholders.length === 0 ? html`
            <p class="warning-text">⚠️ No hay stakeholders asignados a este proyecto. Añade stakeholders en la pestaña "Equipo".</p>
          ` : ''}
        </div>

        <!-- Roles Info -->
        <div class="roles-info-box">
          <h4>ℹ️ Role Summary</h4>
          <ul>
            <li><strong>Regular User:</strong> Can download approved (release) versions</li>
            <li><strong>Beta User:</strong> Can also download beta (beta) versions</li>
            <li><strong>Uploader:</strong> Can upload new versions (pending approval)</li>
            <li><strong>Approver:</strong> Can approve, deprecate, delete apps and manage permissions</li>
          </ul>
          <p class="roles-note">Note: A developer cannot be both Uploader and Approver.</p>
        </div>
      </div>
    `;
  }

  /**
   * Load app permissions from Firebase
   */
  async _loadAppPermissions() {
    if (!this.originalProjectName) return;

    try {
      // Load uploaders
      const uploadersSnap = await get(ref(database, `/data/appUploaders/${this.originalProjectName}`));
      if (uploadersSnap.exists()) {
        const data = uploadersSnap.val();
        this.appUploaders = Object.keys(data)
          .filter(key => data[key] === true)
          .map(key => ({
            key,
            email: this._decodeFirebaseKey(key)
          }));
      } else {
        this.appUploaders = [];
      }

      // Load approvers (appAdmins per project)
      const approversSnap = await get(ref(database, `/data/appAdmins/${this.originalProjectName}`));
      if (approversSnap.exists()) {
        const data = approversSnap.val();
        this.appApprovers = Object.keys(data)
          .filter(key => data[key] === true)
          .map(key => ({
            key,
            email: this._decodeFirebaseKey(key)
          }));
      } else {
        this.appApprovers = [];
      }

      // Load beta users
      const betaSnap = await get(ref(database, `/data/betaUsers/${this.originalProjectName}`));
      if (betaSnap.exists()) {
        const data = betaSnap.val();
        this.betaUsers = Object.keys(data)
          .filter(key => data[key] === true)
          .map(key => ({
            key,
            email: this._decodeFirebaseKey(key)
          }));
      } else {
        this.betaUsers = [];
      }
    } catch (error) {
      console.error('Error loading app permissions:', error);
    }
  }

  /**
   * Decode Firebase key back to email
   */
  _decodeFirebaseKey(key) {
    return key.replace(/,/g, '.').replace(/_at_/g, '@');
  }

  /**
   * Add an uploader from selected developer
   */
  async _addUploader() {
    if (!this.selectedUploaderId) return;

    // Get developer info
    const developer = entityDirectoryService.getDeveloper(this.selectedUploaderId);
    if (!developer?.email) {
      this._showNotification('Developer email not found', 'error');
      return;
    }

    const email = developer.email.toLowerCase().trim();

    try {
      const encodedEmail = encodeEmailForFirebase(email);
      await set(ref(database, `/data/appUploaders/${this.originalProjectName}/${encodedEmail}`), true);
      this.appUploaders = [...this.appUploaders, { key: encodedEmail, email }];
      this.selectedUploaderId = '';
      this._showNotification(`${developer.name} added as uploader`, 'success');
    } catch (error) {
      console.error('Error adding uploader:', error);
      this._showNotification('Error adding uploader', 'error');
    }
  }

  /**
   * Remove an uploader
   */
  async _removeUploader(encodedKey) {
    try {
      await set(ref(database, `/data/appUploaders/${this.originalProjectName}/${encodedKey}`), null);
      this.appUploaders = this.appUploaders.filter(u => u.key !== encodedKey);
      this._showNotification('Uploader removed', 'success');
    } catch (error) {
      console.error('Error removing uploader:', error);
      this._showNotification('Error removing uploader', 'error');
    }
  }

  /**
   * Add an approver from selected developer
   */
  async _addApprover() {
    if (!this.selectedApproverId) return;

    // Get developer info
    const developer = entityDirectoryService.getDeveloper(this.selectedApproverId);
    if (!developer?.email) {
      this._showNotification('Developer email not found', 'error');
      return;
    }

    const email = developer.email.toLowerCase().trim();

    try {
      const encodedEmail = encodeEmailForFirebase(email);
      await set(ref(database, `/data/appAdmins/${this.originalProjectName}/${encodedEmail}`), true);
      this.appApprovers = [...this.appApprovers, { key: encodedEmail, email }];
      this.selectedApproverId = '';
      this._showNotification(`${developer.name} added as approver`, 'success');
    } catch (error) {
      console.error('Error adding approver:', error);
      this._showNotification('Error adding approver', 'error');
    }
  }

  /**
   * Remove an approver
   */
  async _removeApprover(encodedKey) {
    try {
      await set(ref(database, `/data/appAdmins/${this.originalProjectName}/${encodedKey}`), null);
      this.appApprovers = this.appApprovers.filter(a => a.key !== encodedKey);
      this._showNotification('Approver removed', 'success');
    } catch (error) {
      console.error('Error removing approver:', error);
      this._showNotification('Error removing approver', 'error');
    }
  }

  /**
   * Add a beta user from selected stakeholder
   */
  async _addBetaUser() {
    if (!this.selectedBetaId) return;

    // Get stakeholder info
    const stakeholder = entityDirectoryService.getStakeholder(this.selectedBetaId);
    if (!stakeholder?.email) {
      this._showNotification('Stakeholder email not found', 'error');
      return;
    }

    const email = stakeholder.email.toLowerCase().trim();

    try {
      const encodedEmail = encodeEmailForFirebase(email);
      await set(ref(database, `/data/betaUsers/${this.originalProjectName}/${encodedEmail}`), true);
      this.betaUsers = [...this.betaUsers, { key: encodedEmail, email }];
      this.selectedBetaId = '';
      this._showNotification(`${stakeholder.name} added as beta user`, 'success');
    } catch (error) {
      console.error('Error adding beta user:', error);
      this._showNotification('Error adding beta user', 'error');
    }
  }

  /**
   * Remove a beta user
   */
  async _removeBetaUser(encodedKey) {
    try {
      await set(ref(database, `/data/betaUsers/${this.originalProjectName}/${encodedKey}`), null);
      this.betaUsers = this.betaUsers.filter(u => u.key !== encodedKey);
      this._showNotification('Beta user removed', 'success');
    } catch (error) {
      console.error('Error removing beta user:', error);
      this._showNotification('Error removing beta user', 'error');
    }
  }

  /**
   * Show notification
   */
  _showNotification(message, type = 'info') {
    document.dispatchEvent(new CustomEvent('show-slide-notification', {
      detail: { options: { message, type } }
    }));
  }

  _renderDevelopersSection() {
    const developersArray = this._getDevelopersAsArray();
    const assignedIds = new Set(developersArray.map(d => d.id).filter(Boolean));
    const availableToAdd = this.availableDevelopers.filter(d => !assignedIds.has(d.id));

    return html`
      <div class="form-group">
        <label>Developers</label>

        <!-- Select to add existing developer -->
        <div class="entity-add-section">
          <select
            id="developerSelect"
            .value=${this.selectedDeveloperId}
            @change=${this._handleDeveloperSelectChange}
          >
            <option value="">-- Seleccionar developer --</option>
            ${availableToAdd.map(dev => html`
              <option value="${dev.id}">${dev.name} (${dev.email || dev.id})</option>
            `)}
          </select>
          <button
            type="button"
            class="add-btn"
            ?disabled=${!this.selectedDeveloperId}
            @click=${this._addSelectedDeveloper}
          >
            Añadir
          </button>
          <button
            type="button"
            class="create-new-btn"
            @click=${() => this.showCreateDeveloper = !this.showCreateDeveloper}
          >
            ${this.showCreateDeveloper ? 'Cancelar' : '+ Nuevo'}
          </button>
        </div>

        <!-- Create new developer form -->
        ${this.showCreateDeveloper ? html`
          <div class="create-entity-form">
            <div class="form-row">
              <input
                type="text"
                placeholder="Nombre del developer"
                .value=${this.newDeveloperName}
                @input=${e => this.newDeveloperName = e.target.value}
              />
              <input
                type="email"
                placeholder="Email"
                .value=${this.newDeveloperEmail}
                @input=${e => this.newDeveloperEmail = e.target.value}
              />
              <button
                type="button"
                class="create-btn"
                ?disabled=${!this._canCreateDeveloper()}
                @click=${this._createAndAddDeveloper}
              >
                Crear y Añadir
              </button>
            </div>
          </div>
        ` : ''}

        <!-- List of assigned developers -->
        ${this._renderDevelopersList(developersArray)}
      </div>
    `;
  }

  _renderDevelopersList(developersArray) {
    if (developersArray.length === 0) {
      return html`
        <div class="developers-list">
          <div class="empty-developers">
            No hay developers añadidos
          </div>
        </div>
      `;
    }

    return html`
      <div class="developers-list">
        ${developersArray.map((developer, index) => html`
          <div class="developer-item">
            <div class="developer-info">
              <span class="developer-name">${developer.name || developer.id}</span>
              ${developer.email ? html`
                <span class="developer-email">${developer.email}</span>
              ` : ''}
              ${developer.id ? html`
                <span class="developer-id">${developer.id}</span>
              ` : ''}
            </div>
            <button
              type="button"
              class="remove-developer"
              @click=${() => this._removeDeveloper(index)}
            >
              Eliminar
            </button>
          </div>
        `)}
      </div>
    `;
  }

  _renderStakeholdersSection() {
    const stakeholdersArray = this._getStakeholdersAsArray();
    const assignedIds = new Set(stakeholdersArray.map(s => s.id).filter(Boolean));
    const availableToAdd = this.availableStakeholders.filter(s => !assignedIds.has(s.id));

    return html`
      <div class="form-group">
        <label>Stakeholders</label>

        <!-- Select to add existing stakeholder -->
        <div class="entity-add-section">
          <select
            id="stakeholderSelect"
            .value=${this.selectedStakeholderId}
            @change=${this._handleStakeholderSelectChange}
          >
            <option value="">-- Seleccionar stakeholder --</option>
            ${availableToAdd.map(stk => html`
              <option value="${stk.id}">${stk.name} (${stk.email || stk.id})</option>
            `)}
          </select>
          <button
            type="button"
            class="add-btn"
            ?disabled=${!this.selectedStakeholderId}
            @click=${this._addSelectedStakeholder}
          >
            Añadir
          </button>
          <button
            type="button"
            class="create-new-btn"
            @click=${() => this.showCreateStakeholder = !this.showCreateStakeholder}
          >
            ${this.showCreateStakeholder ? 'Cancelar' : '+ Nuevo'}
          </button>
        </div>

        <!-- Create new stakeholder form -->
        ${this.showCreateStakeholder ? html`
          <div class="create-entity-form">
            <div class="form-row">
              <input
                type="text"
                placeholder="Nombre del stakeholder"
                .value=${this.newStakeholderName}
                @input=${e => this.newStakeholderName = e.target.value}
              />
              <input
                type="email"
                placeholder="Email"
                .value=${this.newStakeholderEmail}
                @input=${e => this.newStakeholderEmail = e.target.value}
              />
              <button
                type="button"
                class="create-btn"
                ?disabled=${!this._canCreateStakeholder()}
                @click=${this._createAndAddStakeholder}
              >
                Crear y Añadir
              </button>
            </div>
          </div>
        ` : ''}

        <!-- List of assigned stakeholders -->
        ${this._renderStakeholdersList(stakeholdersArray)}
      </div>
    `;
  }

  _renderStakeholdersList(stakeholdersArray) {
    if (stakeholdersArray.length === 0) {
      return html`
        <div class="stakeholders-list">
          <div class="empty-stakeholders">
            No hay stakeholders añadidos
          </div>
        </div>
      `;
    }

    return html`
      <div class="stakeholders-list">
        ${stakeholdersArray.map((stakeholder, index) => html`
          <div class="stakeholder-item">
            <div class="stakeholder-info">
              <span class="stakeholder-name">${stakeholder.name || stakeholder.id}</span>
              ${stakeholder.email ? html`
                <span class="stakeholder-email">${stakeholder.email}</span>
              ` : ''}
              ${stakeholder.id ? html`
                <span class="stakeholder-id">${stakeholder.id}</span>
              ` : ''}
            </div>
            <button
              type="button"
              class="remove-stakeholder"
              @click=${() => this._removeStakeholder(index)}
            >
              Eliminar
            </button>
          </div>
        `)}
      </div>
    `;
  }

  // Repository helpers
  get hasMultipleRepos() {
    return Array.isArray(this.repoUrl);
  }

  get repositoriesList() {
    if (!this.repoUrl) return [];
    if (typeof this.repoUrl === 'string') {
      return this.repoUrl.trim() ? [{ url: this.repoUrl.trim(), label: 'Default' }] : [];
    }
    return this.repoUrl;
  }

  _renderRepositoriesSection() {
    const repos = this.repositoriesList;
    const hasMultiple = this.hasMultipleRepos;

    // Si es string (1 repo) o vacío: mostrar input simple + botón añadir otro
    if (!hasMultiple) {
      return html`
        <div class="form-group">
          <label for="repoUrl">Repositorio (SSH/HTTPS)</label>
          <div class="repo-single-section">
            <input
              type="text"
              id="repoUrl"
              .value=${typeof this.repoUrl === 'string' ? this.repoUrl : ''}
              @input=${this._handleRepoChange}
              placeholder="git@github.com:org/proyecto.git"
            />
            <button
              type="button"
              class="add-repo-btn"
              @click=${this._convertToMultipleRepos}
              title="Añadir otro repositorio"
            >
              + Repo
            </button>
          </div>
          <div class="helper-text">Se usará para ramas y PR automáticos. Pulsa "+ Repo" si el proyecto tiene múltiples repositorios.</div>
        </div>
      `;
    }

    // Si es array (múltiples repos): mostrar lista editable
    return html`
      <div class="form-group">
        <label>Repositorios del Proyecto</label>
        <div class="repositories-list">
          ${repos.map((repo, index) => html`
            <div class="repository-item ${index === 0 ? 'default-repo' : ''}">
              <div class="repo-fields">
                <input
                  type="text"
                  class="repo-url-input"
                  .value=${repo.url || ''}
                  @input=${(e) => this._handleRepoUrlChange(index, e.target.value)}
                  placeholder="git@github.com:org/repo.git"
                />
                <input
                  type="text"
                  class="repo-label-input"
                  .value=${repo.label || ''}
                  @input=${(e) => this._handleRepoLabelChange(index, e.target.value)}
                  placeholder="Etiqueta (ej: Front, API)"
                />
                ${index === 0 ? html`
                  <span class="default-badge" title="Repositorio por defecto">Por defecto</span>
                ` : html`
                  <button
                    type="button"
                    class="remove-repo-btn"
                    @click=${() => this._removeRepository(index)}
                    title="Eliminar repositorio"
                  >
                    ×
                  </button>
                `}
              </div>
            </div>
          `)}
        </div>
        <button
          type="button"
          class="add-another-repo-btn"
          @click=${this._addRepository}
        >
          + Añadir otro repositorio
        </button>
        <div class="helper-text">El primer repositorio es el "por defecto" para tareas sin etiqueta asignada.</div>
      </div>
    `;
  }

  _handleRepoUrlChange(index, value) {
    if (Array.isArray(this.repoUrl)) {
      const newRepos = [...this.repoUrl];
      newRepos[index] = { ...newRepos[index], url: value };
      this.repoUrl = newRepos;
    }
  }

  _handleRepoLabelChange(index, value) {
    if (Array.isArray(this.repoUrl)) {
      const newRepos = [...this.repoUrl];
      newRepos[index] = { ...newRepos[index], label: value };
      this.repoUrl = newRepos;
    }
  }

  _convertToMultipleRepos() {
    const currentUrl = typeof this.repoUrl === 'string' ? this.repoUrl.trim() : '';
    // Crear array con el repo actual (si existe) como default + uno nuevo vacío
    this.repoUrl = [
      { url: currentUrl, label: currentUrl ? 'Default' : '' },
      { url: '', label: '' }
    ];
    this.requestUpdate();
  }

  _addRepository() {
    if (Array.isArray(this.repoUrl)) {
      this.repoUrl = [...this.repoUrl, { url: '', label: '' }];
      this.requestUpdate();
    }
  }

  _removeRepository(index) {
    if (!Array.isArray(this.repoUrl)) return;

    const newRepos = this.repoUrl.filter((_, i) => i !== index);

    // Si queda solo 1, volver a formato string
    if (newRepos.length === 1) {
      this.repoUrl = newRepos[0].url || '';
    } else {
      this.repoUrl = newRepos;
    }
    this.requestUpdate();
  }

  // Event handlers
  _handleProjectNameChange(e) {
    this.projectName = e.target.value;
  }

  _handleAbbreviationChange(e) {
    this.abbreviation = e.target.value.toUpperCase().replace(/[^A-Z0-9_&]/g, '').slice(0, 4);
  }

  _handleScoringSystemChange(e) {
    this.scoringSystem = e.target.value;
  }

  _handleDescriptionChange(e) {
    this.description = e.target.value;
  }

  _handleRepoChange(e) {
    this.repoUrl = e.target.value;
  }

  _handleLanguagesChange(e) {
    this.languagesText = e.target.value;
  }

  _handleFrameworksChange(e) {
    this.frameworksText = e.target.value;
  }

  _handleAllowExecutablesChange(e) {
    this.allowExecutables = e.target.checked;
  }

  _getShareableUrl(type) {
    const projectName = this.currentProjectName || this.projectName;
    if (!projectName) return '';
    if (type === 'view') {
      const base = `${location.origin}/public/?project=${encodeURIComponent(projectName)}`;
      return this.publicToken ? `${base}&token=${this.publicToken}` : base;
    }
    // API URL
    return `${location.origin}/api/public/${encodeURIComponent(projectName)}/cards`;
  }

  _generateToken() {
    this.publicToken = crypto.randomUUID();
  }

  _removeToken() {
    this.publicToken = '';
  }

  async _copyUrl(url, field = 'view') {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    this._copiedField = field;
    this.requestUpdate();
    setTimeout(() => { this._copiedField = ''; this.requestUpdate(); }, 2000);
  }

  _renderShareSection() {
    if (!this.isPublicView && !this.isPublicApi && !this.publicToken) return '';

    const viewUrl = this._getShareableUrl('view');
    const apiUrl = this._getShareableUrl('api');

    return html`
      <div class="share-section">
        ${this.isPublicView ? html`
          <div class="share-url-group">
            <span class="share-url-label">Vista pública</span>
            <div class="share-url-row">
              <input type="text" class="share-url-input" .value=${viewUrl} readonly />
              <button type="button" class="btn-copy" @click=${() => this._copyUrl(viewUrl)}
                title="Copiar URL">${this._copiedField === 'view' ? 'Copiado' : 'Copiar'}</button>
            </div>
          </div>
        ` : ''}
        ${this.isPublicApi ? html`
          <div class="share-url-group">
            <span class="share-url-label">API endpoint</span>
            <div class="share-url-row">
              <input type="text" class="share-url-input" .value=${apiUrl} readonly />
              <button type="button" class="btn-copy" @click=${() => this._copyUrl(apiUrl, 'api')}
                title="Copiar URL">${this._copiedField === 'api' ? 'Copiado' : 'Copiar'}</button>
            </div>
          </div>
        ` : ''}
        <div class="share-token-row">
          ${this.publicToken ? html`
            <span class="token-label">Token: <code>${this.publicToken.substring(0, 8)}...</code></span>
            <button type="button" class="btn-token btn-token-remove" @click=${this._removeToken}>Eliminar token</button>
          ` : html`
            <span class="token-label">Acceso protegido por token</span>
            <button type="button" class="btn-token" @click=${this._generateToken}>Generar token</button>
          `}
        </div>
        ${!this.isPublicView && !this.isPublicApi && this.publicToken ? html`
          <span class="share-hint">Solo accesible con el token en la URL</span>
        ` : ''}
      </div>
    `;
  }

  _addSpec() {
    const text = (this._newSpecText || '').trim();
    if (!text) return;
    this.teamSpecs = [...this.teamSpecs, text];
    this._newSpecText = '';
  }

  _removeSpec(index) {
    this.teamSpecs = this.teamSpecs.filter((_, i) => i !== index);
  }

  _handleUseIaChange(e) {
    this.useIa = Boolean(e.target.checked);
  }

  _handleSubmit(e) {
    e.preventDefault();
  }

  // Developer handlers
  _handleDeveloperSelectChange(e) {
    this.selectedDeveloperId = e.target.value;
  }

  _addSelectedDeveloper() {
    if (!this.selectedDeveloperId) return;

    const developer = entityDirectoryService.getDeveloper(this.selectedDeveloperId);
    if (developer) {
      this.developers = [...this.developers, {
        id: developer.id,
        name: developer.name,
        email: developer.email
      }];
      this.selectedDeveloperId = '';
      this.requestUpdate();
    }
  }

  _canCreateDeveloper() {
    return this.newDeveloperName.trim() && this._isValidEmail(this.newDeveloperEmail);
  }

  async _createAndAddDeveloper() {
    if (!this._canCreateDeveloper()) return;

    try {
      const id = await entityDirectoryService.createDeveloper(
        this.newDeveloperEmail.trim().toLowerCase(),
        this.newDeveloperName.trim()
      );

      // Reload available developers
      this._loadAvailableEntities();

      // Add to project
      this.developers = [...this.developers, {
        id,
        name: this.newDeveloperName.trim(),
        email: this.newDeveloperEmail.trim().toLowerCase()
      }];

      // Reset form
      this.newDeveloperName = '';
      this.newDeveloperEmail = '';
      this.showCreateDeveloper = false;
      this.requestUpdate();
    } catch (error) {
      console.error('Error creating developer:', error);
    }
  }

  _removeDeveloper(index) {
    const developersArray = this._getDevelopersAsArray();
    this.developers = developersArray.filter((_, i) => i !== index);
  }

  // Stakeholder handlers
  _handleStakeholderSelectChange(e) {
    this.selectedStakeholderId = e.target.value;
  }

  _addSelectedStakeholder() {
    if (!this.selectedStakeholderId) return;

    const stakeholder = entityDirectoryService.getStakeholder(this.selectedStakeholderId);
    if (stakeholder) {
      this.stakeholders = [...this.stakeholders, {
        id: stakeholder.id,
        name: stakeholder.name,
        email: stakeholder.email
      }];
      this.selectedStakeholderId = '';
      this.requestUpdate();
    }
  }

  _canCreateStakeholder() {
    return this.newStakeholderName.trim() && this._isValidEmail(this.newStakeholderEmail);
  }

  async _createAndAddStakeholder() {
    if (!this._canCreateStakeholder()) return;

    try {
      const id = await entityDirectoryService.createStakeholder(
        this.newStakeholderEmail.trim().toLowerCase(),
        this.newStakeholderName.trim()
      );

      // Reload available stakeholders
      this._loadAvailableEntities();

      // Add to project
      this.stakeholders = [...this.stakeholders, {
        id,
        name: this.newStakeholderName.trim(),
        email: this.newStakeholderEmail.trim().toLowerCase()
      }];

      // Reset form
      this.newStakeholderName = '';
      this.newStakeholderEmail = '';
      this.showCreateStakeholder = false;
      this.requestUpdate();
    } catch (error) {
      console.error('Error creating stakeholder:', error);
    }
  }

  _removeStakeholder(index) {
    const stakeholdersArray = this._getStakeholdersAsArray();
    this.stakeholders = stakeholdersArray.filter((_, i) => i !== index);
  }

  // Utility methods
  _parseListInput(rawValue) {
    if (!rawValue) return [];
    return rawValue
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  _isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  getFormData() {
    const stakeholders = this._getStakeholdersAsArray();
    const developers = this._getDevelopersAsArray();
    const languages = this._parseListInput(this.languagesText);
    const frameworks = this._parseListInput(this.frameworksText);

    // Normalizar repoUrl: string si es único, array si múltiples
    let normalizedRepoUrl;
    if (Array.isArray(this.repoUrl)) {
      // Filtrar repos vacíos y normalizar
      const validRepos = this.repoUrl
        .filter(r => r.url && r.url.trim())
        .map(r => ({ url: r.url.trim(), label: (r.label || '').trim() }));

      // Si queda solo 1, convertir a string
      if (validRepos.length === 0) {
        normalizedRepoUrl = '';
      } else if (validRepos.length === 1) {
        normalizedRepoUrl = validRepos[0].url;
      } else {
        normalizedRepoUrl = validRepos;
      }
    } else {
      normalizedRepoUrl = (this.repoUrl || '').trim();
    }

    return {
      projectName: this.projectName.trim(),
      abbreviation: this.abbreviation.trim().toUpperCase(),
      scoringSystem: this.scoringSystem,
      stakeholders,
      developers,
      allowExecutables: this.allowExecutables,
      description: (this.description || '').trim(),
      repoUrl: normalizedRepoUrl,
      languages,
      frameworks,
      selectedAgents: this.selectedAgents || [],
      selectedPrompts: this.selectedPrompts || [],
      selectedInstructions: this.selectedInstructions || [],
      useIa: this.useIa && this.iaAvailable,
      businessContext: (this.businessContext || '').trim(),
      isPublicView: this.isPublicView,
      isPublicApi: this.isPublicApi,
      publicToken: this.publicToken || '',
      teamSpecs: this.teamSpecs || []
    };
  }

  isValid() {
    const hasName = this.projectName.trim().length > 0;
    const hasAbbreviation = this.abbreviation.trim().length >= 2;
    return hasName && hasAbbreviation;
  }

  /**
   * Validates the form and shows visual feedback for invalid fields
   * @returns {boolean} true if valid, false otherwise
   */
  validateWithFeedback() {
    const errors = [];

    // Clear previous error states
    const allInputs = this.shadowRoot.querySelectorAll('input.error');
    allInputs.forEach(input => input.classList.remove('error'));

    // Check project name
    if (!this.projectName.trim()) {
      errors.push({ field: 'projectName', message: 'El nombre del proyecto es obligatorio' });
    }

    // Check abbreviation
    if (this.abbreviation.trim().length < 2) {
      errors.push({ field: 'abbreviation', message: 'La abreviatura debe tener al menos 2 caracteres' });
    }

    if (errors.length > 0) {
      // Mark fields with error
      errors.forEach(err => {
        const input = this.shadowRoot.querySelector(`#${err.field}`);
        if (input) {
          input.classList.add('error');
        }
      });

      // Focus and scroll to first error field
      const firstErrorField = this.shadowRoot.querySelector(`#${errors[0].field}`);
      if (firstErrorField) {
        firstErrorField.focus();
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  _renderIaToggle() {
    if (!this.iaAvailable) {
      return html`
        <div class="form-group">
          <label>IA (BecarIA)</label>
          <div class="helper-text warning">La IA no está disponible actualmente (configuración backend).</div>
        </div>
      `;
    }

    return html`
      <div class="form-group">
        <label>IA (BecarIA)</label>
        <div class="checkbox-group">
          <input
            type="checkbox"
            id="useIa"
            .checked=${this.useIa}
            @change=${this._handleUseIaChange}
          />
          <label for="useIa">Permitir que BecarIA tome tareas en este proyecto</label>
        </div>
        <div class="helper-text">Al activarlo se añadirá BecarIA como developer y se habilitarán flujos automáticos.</div>
      </div>
    `;
  }

  _renderArchiveZone() {
    return html`
      <div class="archive-zone">
        <h3>📦 Archivar Proyecto</h3>
        <div class="archive-info">
          ${this.archived ? html`
            <p>Este proyecto está actualmente <strong>archivado</strong>.</p>
            <p>Los proyectos archivados:</p>
            <ul>
              <li>No aparecen en el selector de proyectos</li>
              <li>Aparecen al final de la lista de proyectos con una etiqueta "Archivado"</li>
              <li>Mantienen todos sus datos (tareas, bugs, épicas, etc.)</li>
            </ul>
            <button
              type="button"
              class="unarchive-button"
              @click=${this._toggleArchive}
            >
              Desarchivar Proyecto
            </button>
          ` : html`
            <p>Archiva el proyecto para ocultarlo del selector de proyectos sin eliminar ningún dato.</p>
            <button
              type="button"
              class="archive-button"
              @click=${this._toggleArchive}
            >
              Archivar Proyecto
            </button>
          `}
        </div>
      </div>
    `;
  }

  _toggleArchive() {
    this.archived = !this.archived;
    this.dispatchEvent(new CustomEvent('archive-project', {
      detail: {
        projectName: this.originalProjectName,
        archived: this.archived
      },
      bubbles: true,
      composed: true
    }));
  }

  _renderDangerZone() {
    return html`
      <div class="danger-zone">
        <h3>⚠️ Zona de Peligro</h3>
        <div class="warning-text">
          <strong>¡Atención!</strong> Una vez que elimines este proyecto, no se puede deshacer.
          Se eliminarán permanentemente:
          <ul>
            <li>Todas las tareas asociadas</li>
            <li>Todas las épicas asociadas</li>
            <li>Todos los sprints asociados</li>
            <li>Todos los bugs asociados</li>
            <li>Todas las propuestas QA asociadas</li>
            <li>Todas las aplicaciones asociadas</li>
          </ul>
        </div>

        ${!this.showDeleteSection ? html`
          <button
            type="button"
            class="delete-button"
            @click=${this._showDeleteConfirmation}
          >
            Eliminar Proyecto
          </button>
        ` : html`
          <div class="delete-confirmation">
            <p><strong>Para confirmar la eliminación, escribe el nombre del proyecto exactamente:</strong></p>
            <p><code>${this.originalProjectName}</code></p>
            <input
              type="text"
              .value=${this.deleteConfirmationText}
              @input=${this._handleDeleteConfirmationInput}
              placeholder="Escribe el nombre del proyecto aquí"
            />
            <button
              type="button"
              class="final-delete-button"
              ?disabled=${!this._canConfirmDelete()}
              @click=${this._confirmProjectDelete}
            >
              ELIMINAR DEFINITIVAMENTE
            </button>
            <button
              type="button"
              class="delete-button"
              @click=${this._cancelDelete}
              style="margin-left: 1rem; background-color: #6c757d;"
            >
              Cancelar
            </button>
          </div>
        `}
      </div>
    `;
  }

  _showDeleteConfirmation() {
    this.showDeleteSection = true;
    this.requestUpdate();
  }

  _cancelDelete() {
    this.showDeleteSection = false;
    this.deleteConfirmationText = '';
    this.requestUpdate();
  }

  _handleDeleteConfirmationInput(e) {
    this.deleteConfirmationText = e.target.value;
    this.requestUpdate();
  }

  _canConfirmDelete() {
    return this.deleteConfirmationText.trim() === this.originalProjectName;
  }

  _confirmProjectDelete() {
    if (this._canConfirmDelete()) {
      // Cerrar el modal usando el gestor global
      if (typeof modalManager !== 'undefined') {
        modalManager.closeLastModal();
      }

      // Disparar evento de eliminación después de un pequeño delay
      setTimeout(() => {
        this.dispatchEvent(new CustomEvent('delete-project', {
          detail: { projectName: this.originalProjectName },
          bubbles: true,
          composed: true
        }));
      }, 100);
    }
  }
}

customElements.define('project-form', ProjectForm);

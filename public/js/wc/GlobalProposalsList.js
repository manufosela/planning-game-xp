import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { GlobalProposalsListStyles } from './global-proposals-list-styles.js';
import { globalProposalsService } from '../services/global-proposals-service.js';
import { isCurrentUserSuperAdmin } from '../utils/super-admin-check.js';
import { modalStackService } from '../services/modal-stack-service.js';
import { setupAutoCloseOnSave } from '../services/modal-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { URLStateManager } from '../utils/url-utils.js';
import './ProposalCard.js';
// app-modal se importa globalmente desde main.js (paquete npm @manufosela/app-modal)

export class GlobalProposalsList extends LitElement {
  static get properties() {
    return {
      proposals: { type: Array },
      orderedProposals: { type: Array },
      isSuperAdmin: { type: Boolean },
      loading: { type: Boolean },
      draggedIndex: { type: Number },
      lastUpdatedBy: { type: String },
      lastUpdatedAt: { type: String },
      userEmail: { type: String },
      epicMap: { type: Object },
      activeTab: { type: String },
      collapsedProjects: { type: Object },
      collapsedTeams: { type: Object }
    };
  }

  static get styles() {
    return GlobalProposalsListStyles;
  }

  constructor() {
    super();
    this.proposals = [];
    this.orderedProposals = [];
    this.isSuperAdmin = false;
    this.loading = true;
    this.draggedIndex = -1;
    this.lastUpdatedBy = null;
    this.lastUpdatedAt = null;
    this.userEmail = '';
    this.epicMap = {};
    this.activeTab = 'general';
    this.collapsedProjects = {};
    this.collapsedTeams = {};
  }

  async connectedCallback() {
    super.connectedCallback();
    this._popStateHandler = (state) => {
      const validTabs = ['general', 'byProject', 'byTeam'];
      if (state.tab && validTabs.includes(state.tab)) {
        this.activeTab = state.tab;
      }
    };
    URLStateManager.onPopState(this._popStateHandler);
    await this._waitForAuthAndLoad();
  }

  async _waitForAuthAndLoad() {
    try {
      const { auth } = await import('../../firebase-config.js');

      // Si ya hay un usuario autenticado, cargar inmediatamente
      if (auth.currentUser) {
        this.userEmail = auth.currentUser.email || '';
        await this._initializeData();
        return;
      }

      // Si no hay usuario, esperar por el estado de autenticación

      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (user) {
          this.userEmail = user.email || '';
          await this._initializeData();
          unsubscribe();
        } else {
          this.loading = false;
          unsubscribe();
        }
      });

      // Timeout de seguridad
      setTimeout(() => {
        if (!auth.currentUser && this.loading) {
          this.loading = false;
          unsubscribe();
        }
      }, 10000);
    } catch (error) {
      this.loading = false;
    }
  }

  async _initializeData() {
    await this._checkSuperAdmin();
    await entityDirectoryService.init();
    this._restoreTabFromUrl();
    await this._loadData();
    this._subscribeToChanges();
  }

  _restoreTabFromUrl() {
    const urlState = URLStateManager.getState();
    const validTabs = ['general', 'byProject', 'byTeam'];
    if (urlState.tab && validTabs.includes(urlState.tab)) {
      this.activeTab = urlState.tab;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    globalProposalsService.unsubscribe();
  }

  /**
   * Check if current user is the SuperAdmin (only ONE, defined in .env)
   * NOTE: /data/superAdminEmails in database is DEPRECATED and no longer used
   */
  async _checkSuperAdmin() {
    this.isSuperAdmin = await isCurrentUserSuperAdmin(this.userEmail);
  }

  async _loadData() {
    this.loading = true;
    try {
      // Cargar proyectos accesibles
      const projects = await this._loadUserProjects();

      // Cargar épicas para resolución de nombres
      await this._loadEpics(projects);

      // Cargar propuestas de todos los proyectos
      this.proposals = await globalProposalsService.loadAllProposals(projects);

      // Cargar orden guardado
      const orderData = await globalProposalsService.loadGlobalOrder();
      this.lastUpdatedBy = orderData.lastUpdatedBy;
      this.lastUpdatedAt = orderData.lastUpdatedAt;

      // Combinar propuestas con orden
      this.orderedProposals = globalProposalsService.mergeWithOrder(
        this.proposals,
        orderData.order || []
      );

      // Inicializar proyectos colapsados
      this._initCollapsedProjects();

    } catch (error) {
      // Silently ignore load errors - empty list will be shown
    } finally {
      this.loading = false;
    }
  }

  async _loadUserProjects() {
    try {
      const { database, ref, get } = await import('../../firebase-config.js');

      // Cargar todos los proyectos
      const projectsSnapshot = await get(ref(database, '/projects'));
      if (!projectsSnapshot.exists()) {
        return [];
      }

      const allProjects = Object.keys(projectsSnapshot.val());

      // Si es superadmin, tiene acceso a todos
      if (this.isSuperAdmin) {
        return allProjects;
      }

      // Si no, filtrar por permisos del usuario
      const { encodeEmailForFirebase } = await import('../utils/email-sanitizer.js');
      const encodedEmail = encodeEmailForFirebase(this.userEmail);

      const userProjectsSnapshot = await get(ref(database, `/data/projectsByUser/${encodedEmail}`));

      if (!userProjectsSnapshot.exists()) return [];

      const userProjectsValue = userProjectsSnapshot.val();
      if (userProjectsValue === 'All') {
        return allProjects;
      }

      const userProjects = userProjectsValue.split(',').map(p => p.trim());
      return allProjects.filter(p => userProjects.includes(p));
    } catch (error) {
      return [];
    }
  }

  async _loadEpics(projects) {
    try {
      const { database, ref, get } = await import('../../firebase-config.js');

      for (const projectId of projects) {
        const epicsPath = `/cards/${projectId}/EPICS_${projectId}`;
        const snapshot = await get(ref(database, epicsPath));

        if (snapshot.exists()) {
          const epics = snapshot.val();
          Object.entries(epics).forEach(([id, epic]) => {
            this.epicMap[epic.cardId || id] = epic.title || epic.cardId || id;
          });
        }
      }
    } catch (error) {
      // Silently ignore - epics optional for display
    }
  }

  _subscribeToChanges() {
    globalProposalsService.subscribeToOrderChanges((orderData) => {
      // Solo actualizar si el cambio no fue hecho por nosotros
      if (orderData.lastUpdatedBy !== this.userEmail) {
        this.lastUpdatedBy = orderData.lastUpdatedBy;
        this.lastUpdatedAt = orderData.lastUpdatedAt;
        this.orderedProposals = globalProposalsService.mergeWithOrder(
          this.proposals,
          orderData.order || []
        );
      }
    });
  }

  _handleDragStart(e, index) {
    if (!this.isSuperAdmin) return;

    this.draggedIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    e.target.classList.add('dragging');
  }

  _handleDragEnd(e) {
    e.target.classList.remove('dragging');
    this.draggedIndex = -1;

    // Limpiar todas las clases drag-over
    this.shadowRoot.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  _handleDragOver(e) {
    if (!this.isSuperAdmin) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  _handleDragEnter(e) {
    if (!this.isSuperAdmin) return;
    e.preventDefault();
    e.target.closest('.proposal-row')?.classList.add('drag-over');
  }

  _handleDragLeave(e) {
    if (!this.isSuperAdmin) return;
    e.target.closest('.proposal-row')?.classList.remove('drag-over');
  }

  async _handleDrop(e, targetIndex) {
    if (!this.isSuperAdmin) return;
    e.preventDefault();

    const row = e.target.closest('.proposal-row');
    if (row) row.classList.remove('drag-over');

    if (this.draggedIndex === -1 || this.draggedIndex === targetIndex) return;

    // Reordenar array
    const newOrder = [...this.orderedProposals];
    const [moved] = newOrder.splice(this.draggedIndex, 1);
    newOrder.splice(targetIndex, 0, moved);

    this.orderedProposals = newOrder;
    this.draggedIndex = -1;

    // Persistir el nuevo orden
    try {
      await globalProposalsService.saveGlobalOrder(newOrder, this.userEmail);
      this.lastUpdatedBy = this.userEmail;
      this.lastUpdatedAt = new Date().toISOString();
    } catch (error) {
      // Revertir en caso de error
      await this._loadData();
    }
  }

  _resolveEpicTitle(epicId) {
    if (!epicId) return '-';
    return this.epicMap[epicId] || epicId;
  }

  _formatCreator(email) {
    if (!email) return '-';
    // Intentar obtener solo la parte antes del @
    const parts = email.split('@');
    return parts[0] || email;
  }

  _getStatusClass(status) {
    if (!status) return '';
    return status.toLowerCase()
      .replaceAll(/\s+/g, '-')
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '');
  }

  _formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  _setActiveTab(tab) {
    this.activeTab = tab;
    URLStateManager.updateState({ tab }, true);
  }

  _getProposalsByProject() {
    const grouped = {};
    this.orderedProposals.forEach((proposal, globalIndex) => {
      const projectId = proposal.projectId;
      if (!grouped[projectId]) {
        grouped[projectId] = [];
      }
      grouped[projectId].push({ ...proposal, globalIndex: globalIndex + 1 });
    });
    return grouped;
  }

  _getProposalsByTeam() {
    const grouped = {};
    const NO_TEAM_KEY = '__no_team__';

    this.orderedProposals.forEach((proposal, globalIndex) => {
      const teamId = entityDirectoryService.getStakeholderTeamId(proposal.createdBy);
      const key = teamId || NO_TEAM_KEY;

      if (!grouped[key]) {
        grouped[key] = {
          teamId: key,
          teamName: teamId ? entityDirectoryService.getTeam(teamId)?.name || teamId : 'Sin departamento',
          proposals: []
        };
      }
      grouped[key].proposals.push({ ...proposal, globalIndex: globalIndex + 1 });
    });

    // Sort by team name, with "Sin departamento" at the end
    return Object.values(grouped).sort((a, b) => {
      if (a.teamId === NO_TEAM_KEY) return 1;
      if (b.teamId === NO_TEAM_KEY) return -1;
      return a.teamName.localeCompare(b.teamName);
    });
  }

  _toggleTeamCollapse(teamId) {
    this.collapsedTeams = {
      ...this.collapsedTeams,
      [teamId]: !this.collapsedTeams[teamId]
    };
  }

  _toggleProjectCollapse(projectId) {
    this.collapsedProjects = {
      ...this.collapsedProjects,
      [projectId]: !this.collapsedProjects[projectId]
    };
  }

  _initCollapsedProjects() {
    const projects = [...new Set(this.orderedProposals.map(p => p.projectId))];
    const collapsed = {};
    projects.forEach(p => { collapsed[p] = true; });
    this.collapsedProjects = collapsed;

    // Initialize teams collapsed state
    const teams = this._getUniqueTeams();
    const collapsedTeams = {};
    teams.forEach(t => { collapsedTeams[t.id] = true; });
    this.collapsedTeams = collapsedTeams;
  }

  _getUniqueTeams() {
    const teamIds = new Set();
    this.orderedProposals.forEach(proposal => {
      const teamId = entityDirectoryService.getStakeholderTeamId(proposal.createdBy);
      if (teamId) {
        teamIds.add(teamId);
      }
    });

    return Array.from(teamIds)
      .map(id => entityDirectoryService.getTeam(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async _openProposalModal(proposal) {
    try {
      const { database, ref, get } = await import('../../firebase-config.js');

      // Cargar datos completos de la propuesta desde Firebase
      const proposalPath = `/cards/${proposal.projectId}/PROPOSALS_${proposal.projectId}/${proposal.firebaseId}`;
      const snapshot = await get(ref(database, proposalPath));

      if (!snapshot.exists()) {
        return;
      }

      const fullProposalData = snapshot.val();

      // Cargar épicas del proyecto para el selector
      const epicsPath = `/cards/${proposal.projectId}/EPICS_${proposal.projectId}`;
      const epicsSnapshot = await get(ref(database, epicsPath));
      const epicList = [];
      if (epicsSnapshot.exists()) {
        Object.entries(epicsSnapshot.val()).forEach(([id, epic]) => {
          epicList.push({
            id: epic.cardId || id,
            title: epic.title || epic.cardId || id
          });
        });
      }

      // Crear la card de propuesta expandida
      const proposalCard = document.createElement('proposal-card');
      proposalCard.expanded = true;
      proposalCard.id = proposal.firebaseId;
      proposalCard.cardId = fullProposalData.cardId || proposal.firebaseId;
      proposalCard.projectId = proposal.projectId;
      proposalCard.title = fullProposalData.title || '';
      proposalCard.description = fullProposalData.description || '';
      proposalCard.notes = fullProposalData.notes || '';
      proposalCard.acceptanceCriteria = fullProposalData.acceptanceCriteria || '';
      proposalCard.acceptanceCriteriaStructured = fullProposalData.acceptanceCriteriaStructured || [];
      proposalCard.status = fullProposalData.status || 'Propuesta';
      proposalCard.epic = fullProposalData.epic || '';
      proposalCard.epicList = epicList;
      proposalCard.businessPoints = fullProposalData.businessPoints || 0;
      proposalCard.createdBy = fullProposalData.createdBy || '';
      proposalCard.registerDate = fullProposalData.registerDate || '';
      proposalCard.userEmail = this.userEmail;
      proposalCard.canEditPermission = this.isSuperAdmin;
      proposalCard.group = 'proposals';
      proposalCard.section = 'proposals';
      proposalCard.history = fullProposalData.history || [];

      // Crear el modal y establecer contenido
      const modal = document.createElement('app-modal');
      modal._programmaticMode = true;
      modal.maxWidth = '80vw';
      modal.maxHeight = '80vh';
      modal.showHeader = false;
      modal.showFooter = false;
      modal.interceptClose = true;

      // Handler para interceptar cierre y verificar cambios
      const handleCloseRequested = async (event) => {
        // Detener propagación inmediatamente para evitar que otros listeners cierren el modal
        event.stopImmediatePropagation();

        if (proposalCard && typeof proposalCard.hasChanges === 'function') {
          const hasUnsavedChanges = proposalCard.hasChanges();
          if (hasUnsavedChanges) {
            try {
              const confirmed = await modalStackService.createConfirmationModal({
                title: 'Cambios sin guardar',
                message: 'Tienes cambios sin guardar en esta propuesta.<br><br>¿Quieres cerrar de todos modos?',
                confirmText: 'Sí, cerrar sin guardar',
                cancelText: 'No, volver a editar',
                confirmColor: '#f44336',
                cancelColor: '#fcaf00'
              });
              if (!confirmed) {
                return;
              }
            } catch (error) {
              // En caso de error, permitir cerrar
            }
          }
        }
        document.dispatchEvent(new CustomEvent('close-modal', {
          detail: { modalId: modal.modalId }
        }));
      };
      modal.addEventListener('modal-closed-requested', handleCloseRequested);

      // Cerrar modal automáticamente al guardar
      setupAutoCloseOnSave(modal, proposalCard);

      document.body.appendChild(modal);
      modal.setContent(proposalCard);

    } catch (error) {
      // Silently ignore modal creation errors
    }
  }

  _renderGeneralView() {
    return html`
      <div class="proposals-table">
        <div class="table-header ${this.isSuperAdmin ? '' : 'no-handle'}">
          <span class="col-order">#</span>
          <span class="col-title">Título</span>
          <span class="col-project">Proyecto</span>
          <span class="col-epic">Épica</span>
          <span class="col-points">Puntos</span>
          <span class="col-status">Estado</span>
          <span class="col-creator">Creador</span>
          ${this.isSuperAdmin ? html`<span class="col-handle"></span>` : ''}
        </div>

        <div class="table-body">
          ${this.orderedProposals.map((proposal, index) => html`
            <div
              class="proposal-row ${this.isSuperAdmin ? '' : 'no-handle'} ${this.draggedIndex === index ? 'dragging' : ''}"
              draggable="${this.isSuperAdmin}"
              @dragstart=${(e) => this._handleDragStart(e, index)}
              @dragend=${(e) => this._handleDragEnd(e)}
              @dragover=${(e) => this._handleDragOver(e)}
              @dragenter=${(e) => this._handleDragEnter(e)}
              @dragleave=${(e) => this._handleDragLeave(e)}
              @drop=${(e) => this._handleDrop(e, index)}
            >
              <span class="col-order">${index + 1}</span>
              <span class="col-title clickable" title="${proposal.title}" @click=${() => this._openProposalModal(proposal)}>
                ${proposal.title || 'Sin título'}
              </span>
              <span class="col-project" title="${proposal.projectId}">${proposal.projectId}</span>
              <span class="col-epic" title="${this._resolveEpicTitle(proposal.epic)}">${this._resolveEpicTitle(proposal.epic)}</span>
              <span class="col-points">${proposal.businessPoints || 0}</span>
              <span class="col-status ${this._getStatusClass(proposal.status)}">${proposal.status || 'Propuesta'}</span>
              <span class="col-creator" title="${proposal.createdBy}">${this._formatCreator(proposal.createdBy)}</span>
              ${this.isSuperAdmin ? html`
                <span class="col-handle">
                  <span class="drag-handle">⋮⋮</span>
                </span>
              ` : ''}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  _renderByProjectView() {
    const proposalsByProject = this._getProposalsByProject();
    const projectIds = Object.keys(proposalsByProject).sort((a, b) => a.localeCompare(b));

    return html`
      <div class="projects-container">
        ${projectIds.map(projectId => html`
          <div class="project-section">
            <div class="project-header" @click=${() => this._toggleProjectCollapse(projectId)}>
              <span class="collapse-icon">${this.collapsedProjects[projectId] ? '▶' : '▼'}</span>
              <span class="project-name">${projectId}</span>
              <span class="project-count">(${proposalsByProject[projectId].length} propuestas)</span>
            </div>
            ${!this.collapsedProjects[projectId] ? html`
              <div class="project-table">
                <div class="table-header no-handle no-project">
                  <span class="col-order">#</span>
                  <span class="col-title">Título</span>
                  <span class="col-epic">Épica</span>
                  <span class="col-points">Puntos</span>
                  <span class="col-status">Estado</span>
                  <span class="col-creator">Creador</span>
                </div>
                <div class="table-body">
                  ${proposalsByProject[projectId].map(proposal => html`
                    <div class="proposal-row no-handle no-project">
                      <span class="col-order">${proposal.globalIndex}</span>
                      <span class="col-title clickable" title="${proposal.title}" @click=${() => this._openProposalModal(proposal)}>
                        ${proposal.title || 'Sin título'}
                      </span>
                      <span class="col-epic" title="${this._resolveEpicTitle(proposal.epic)}">${this._resolveEpicTitle(proposal.epic)}</span>
                      <span class="col-points">${proposal.businessPoints || 0}</span>
                      <span class="col-status ${this._getStatusClass(proposal.status)}">${proposal.status || 'Propuesta'}</span>
                      <span class="col-creator" title="${proposal.createdBy}">${this._formatCreator(proposal.createdBy)}</span>
                    </div>
                  `)}
                </div>
              </div>
            ` : ''}
          </div>
        `)}
      </div>
    `;
  }

  _renderByTeamView() {
    const proposalsByTeam = this._getProposalsByTeam();

    return html`
      <div class="teams-container">
        ${proposalsByTeam.map(teamGroup => html`
          <div class="team-section">
            <div class="team-header" @click=${() => this._toggleTeamCollapse(teamGroup.teamId)}>
              <span class="collapse-icon">${this.collapsedTeams[teamGroup.teamId] ? '▶' : '▼'}</span>
              <span class="team-name">${teamGroup.teamName}</span>
              <span class="team-count">(${teamGroup.proposals.length} propuestas)</span>
            </div>
            ${!this.collapsedTeams[teamGroup.teamId] ? html`
              <div class="team-table">
                <div class="table-header no-handle no-project">
                  <span class="col-order">#</span>
                  <span class="col-title">Título</span>
                  <span class="col-project">Proyecto</span>
                  <span class="col-epic">Épica</span>
                  <span class="col-points">Puntos</span>
                  <span class="col-status">Estado</span>
                  <span class="col-creator">Creador</span>
                </div>
                <div class="table-body">
                  ${teamGroup.proposals.map(proposal => html`
                    <div class="proposal-row no-handle">
                      <span class="col-order">${proposal.globalIndex}</span>
                      <span class="col-title clickable" title="${proposal.title}" @click=${() => this._openProposalModal(proposal)}>
                        ${proposal.title || 'Sin título'}
                      </span>
                      <span class="col-project" title="${proposal.projectId}">${proposal.projectId}</span>
                      <span class="col-epic" title="${this._resolveEpicTitle(proposal.epic)}">${this._resolveEpicTitle(proposal.epic)}</span>
                      <span class="col-points">${proposal.businessPoints || 0}</span>
                      <span class="col-status ${this._getStatusClass(proposal.status)}">${proposal.status || 'Propuesta'}</span>
                      <span class="col-creator" title="${proposal.createdBy}">${this._formatCreator(proposal.createdBy)}</span>
                    </div>
                  `)}
                </div>
              </div>
            ` : ''}
          </div>
        `)}
      </div>
    `;
  }

  _renderModeIndicator() {
    if (this.isSuperAdmin) {
      return html`<span class="mode-indicator edit">Arrastra para reordenar</span>`;
    }
    return html`<span class="mode-indicator view">Solo lectura</span>`;
  }

  _renderActiveTabContent() {
    if (this.activeTab === 'general') {
      return this._renderGeneralView();
    }
    if (this.activeTab === 'byTeam') {
      return this._renderByTeamView();
    }
    return this._renderByProjectView();
  }

  _renderLastUpdatedInfo() {
    if (!this.lastUpdatedBy) return '';
    return html`
      <div class="last-updated">
        Última actualización: ${this._formatDate(this.lastUpdatedAt)} por ${this._formatCreator(this.lastUpdatedBy)}
      </div>
    `;
  }

  _renderMainContent() {
    if (this.loading) {
      return html`<div class="loading">Cargando propuestas...</div>`;
    }

    if (this.orderedProposals.length === 0) {
      return html`<div class="empty-state">No hay propuestas disponibles</div>`;
    }

    return html`
      <div class="tabs">
        <button
          class="tab ${this.activeTab === 'general' ? 'active' : ''}"
          @click=${() => this._setActiveTab('general')}
        >Vista General</button>
        <button
          class="tab ${this.activeTab === 'byProject' ? 'active' : ''}"
          @click=${() => this._setActiveTab('byProject')}
        >Por Proyecto</button>
        <button
          class="tab ${this.activeTab === 'byTeam' ? 'active' : ''}"
          @click=${() => this._setActiveTab('byTeam')}
        >Por Departamento</button>
      </div>

      ${this._renderActiveTabContent()}
      ${this._renderLastUpdatedInfo()}
    `;
  }

  render() {
    return html`
      <div class="container">
        <header class="header">
          <h2>Backlog Global de Propuestas</h2>
          ${this._renderModeIndicator()}
        </header>

        ${this._renderMainContent()}
      </div>
    `;
  }
}

customElements.define('global-proposals-list', GlobalProposalsList);

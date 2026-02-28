import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { stateTransitionService } from '../services/state-transition-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { StateHistoryViewerStyles } from './state-history-viewer-styles.js';
import { resolveStatusColor } from '../utils/color-utils.js';

/**
 * Component for viewing state transition history of a card
 * Shows timeline, metrics, and validation cycles in a modal
 */
export class StateHistoryViewer extends LitElement {
  static properties = {
    projectId: { type: String },
    cardType: { type: String },
    cardId: { type: String },
    cardTitle: { type: String },
    transitionData: { type: Object },
    loading: { type: Boolean },
    activeTab: { type: String },
    _unsubscribe: { type: Function, state: true }
  };

  static styles = StateHistoryViewerStyles;

  constructor() {
    super();
    this.projectId = '';
    this.cardType = 'task-card';
    this.cardId = '';
    this.cardTitle = '';
    this.transitionData = {
      firstInProgressDate: null,
      validationCycles: 0,
      transitions: []
    };
    this.loading = true;
    this.activeTab = 'timeline';
    this._unsubscribe = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadTransitionData();

    // Close on escape key
    this._handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this._close();
      }
    };
    document.addEventListener('keydown', this._handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
    }
    document.removeEventListener('keydown', this._handleKeyDown);
  }

  async _loadTransitionData() {
    if (!this.projectId || !this.cardId) {
      this.loading = false;
      return;
    }

    this.loading = true;

    // Subscribe to real-time updates
    this._unsubscribe = stateTransitionService.subscribeToTransitions(
      this.projectId,
      this.cardType,
      this.cardId,
      (data) => {
        this.transitionData = data;
        this.loading = false;
      }
    );
  }

  _close() {
    this.remove();
  }

  _setActiveTab(tab) {
    this.activeTab = tab;
  }

  _formatTimestamp(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  _formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  _getUserDisplayName(email) {
    if (!email) return 'Sistema';
    try {
      const displayName = entityDirectoryService.getDeveloperDisplayName(email) ||
                         entityDirectoryService.getStakeholderDisplayName(email);
      return displayName || email.split('@')[0];
    } catch (e) {
      return email.split('@')[0];
    }
  }

  _getStatusColor(status) {
    return resolveStatusColor(status || '');
  }

  _getMetrics() {
    return stateTransitionService.calculateTimeMetrics(this.transitionData.transitions);
  }

  _formatDuration(ms) {
    return stateTransitionService.formatDuration(ms);
  }

  _getRejectionTransitions() {
    return this.transitionData.transitions.filter(t => {
      const from = (t.fromStatus || '').toLowerCase();
      const to = (t.toStatus || '').toLowerCase();
      return from === 'to validate' && to === 'to do';
    });
  }

  render() {
    return html`
      <div class="modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal-container">
          <div class="modal-header">
            <h2>
              <span class="header-icon">⏱️</span>
              Historial de Tiempos
            </h2>
            <span class="card-id">${this.cardId}</span>
            <button class="close-btn" @click=${this._close}>×</button>
          </div>

          ${this.cardTitle ? html`
            <div class="card-title-bar">${this.cardTitle}</div>
          ` : ''}

          <div class="tabs">
            <button class="tab ${this.activeTab === 'timeline' ? 'active' : ''}"
                    @click=${() => this._setActiveTab('timeline')}>
              Timeline
            </button>
            <button class="tab ${this.activeTab === 'metrics' ? 'active' : ''}"
                    @click=${() => this._setActiveTab('metrics')}>
              Métricas
            </button>
            <button class="tab ${this.activeTab === 'cycles' ? 'active' : ''}"
                    @click=${() => this._setActiveTab('cycles')}>
              Ciclos (${this.transitionData.validationCycles})
            </button>
          </div>

          <div class="modal-content">
            ${this.loading ? html`
              <div class="loading">
                <span class="spinner"></span>
                Cargando historial...
              </div>
            ` : html`
              ${this.activeTab === 'timeline' ? this._renderTimeline() : ''}
              ${this.activeTab === 'metrics' ? this._renderMetrics() : ''}
              ${this.activeTab === 'cycles' ? this._renderCycles() : ''}
            `}
          </div>
        </div>
      </div>
    `;
  }

  _renderTimeline() {
    const { firstInProgressDate, transitions } = this.transitionData;

    if (transitions.length === 0) {
      return html`
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>No hay transiciones registradas todavía.</p>
          <p class="hint">Las transiciones se registran automáticamente cuando cambia el estado de la tarea.</p>
        </div>
      `;
    }

    return html`
      <div class="timeline-container">
        ${firstInProgressDate ? html`
          <div class="first-in-progress">
            <span class="label">Primera vez "In Progress":</span>
            <span class="value">${this._formatDate(firstInProgressDate)}</span>
            <span class="badge immutable">INMUTABLE</span>
          </div>
        ` : ''}

        <div class="timeline">
          ${transitions.map((transition, index) => html`
            <div class="timeline-item">
              <div class="timeline-marker" style="background-color: ${this._getStatusColor(transition.toStatus)}"></div>
              <div class="timeline-content">
                <div class="transition-header">
                  <span class="status-badge from" style="background-color: ${this._getStatusColor(transition.fromStatus)}">
                    ${transition.fromStatus || 'Sin estado'}
                  </span>
                  <span class="arrow">→</span>
                  <span class="status-badge to" style="background-color: ${this._getStatusColor(transition.toStatus)}">
                    ${transition.toStatus || 'Sin estado'}
                  </span>
                </div>
                <div class="transition-meta">
                  <span class="timestamp">${this._formatTimestamp(transition.timestamp)}</span>
                  <span class="user">${this._getUserDisplayName(transition.changedBy)}</span>
                </div>
                ${transition.durationInPrevious ? html`
                  <div class="duration">
                    <span class="duration-label">Tiempo en estado anterior:</span>
                    <span class="duration-value">${this._formatDuration(transition.durationInPrevious)}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  _renderMetrics() {
    const metrics = this._getMetrics();
    const { firstInProgressDate, validationCycles } = this.transitionData;

    return html`
      <div class="metrics-container">
        <div class="metrics-grid">
          <div class="metric-card highlight">
            <div class="metric-icon">🚀</div>
            <div class="metric-content">
              <div class="metric-value">${this._formatDuration(metrics.totalDevelopmentTime)}</div>
              <div class="metric-label">Tiempo Total de Desarrollo</div>
              <div class="metric-hint">Tiempo acumulado en "In Progress"</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">📅</div>
            <div class="metric-content">
              <div class="metric-value">${firstInProgressDate ? this._formatDate(firstInProgressDate) : '-'}</div>
              <div class="metric-label">Fecha Inicio (Inmutable)</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">🔄</div>
            <div class="metric-content">
              <div class="metric-value">${validationCycles}</div>
              <div class="metric-label">Ciclos de Validación</div>
              <div class="metric-hint">Veces rechazada (To Validate → To Do)</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">⏳</div>
            <div class="metric-content">
              <div class="metric-value">${this._formatDuration(metrics.averageValidationTime)}</div>
              <div class="metric-label">Tiempo Promedio de Validación</div>
            </div>
          </div>
        </div>

        <h3>Tiempo por Estado</h3>
        <div class="status-times">
          ${Object.entries(metrics.timeByStatus).length > 0 ? html`
            ${Object.entries(metrics.timeByStatus).map(([status, time]) => html`
              <div class="status-time-row">
                <span class="status-badge" style="background-color: ${this._getStatusColor(status)}">${status}</span>
                <div class="time-bar-container">
                  <div class="time-bar" style="width: ${this._calculateBarWidth(time, metrics)}%; background-color: ${this._getStatusColor(status)}"></div>
                </div>
                <span class="time-value">${this._formatDuration(time)}</span>
              </div>
            `)}
          ` : html`
            <p class="empty-hint">No hay datos de tiempo por estado disponibles.</p>
          `}
        </div>
      </div>
    `;
  }

  _calculateBarWidth(time, metrics) {
    const maxTime = Math.max(...Object.values(metrics.timeByStatus));
    return maxTime > 0 ? (time / maxTime) * 100 : 0;
  }

  _renderCycles() {
    const rejections = this._getRejectionTransitions();
    const { validationCycles } = this.transitionData;

    if (validationCycles === 0) {
      return html`
        <div class="empty-state success">
          <span class="empty-icon">✅</span>
          <p>No ha habido rechazos en validación.</p>
          <p class="hint">La tarea pasó (o pasará) validación sin ser rechazada.</p>
        </div>
      `;
    }

    return html`
      <div class="cycles-container">
        <div class="cycles-summary">
          <span class="cycles-count">${validationCycles}</span>
          <span class="cycles-label">Rechazos de Validación</span>
        </div>

        <h3>Detalle de Rechazos</h3>
        <div class="rejections-list">
          ${rejections.map((rejection, index) => html`
            <div class="rejection-item">
              <div class="rejection-number">#${index + 1}</div>
              <div class="rejection-content">
                <div class="rejection-date">
                  <span class="icon">📅</span>
                  ${this._formatTimestamp(rejection.timestamp)}
                </div>
                <div class="rejection-by">
                  <span class="icon">👤</span>
                  Rechazado por: ${this._getUserDisplayName(rejection.changedBy)}
                </div>
                ${rejection.durationInPrevious ? html`
                  <div class="rejection-duration">
                    <span class="icon">⏱️</span>
                    Tiempo en validación: ${this._formatDuration(rejection.durationInPrevious)}
                  </div>
                ` : ''}
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }
}

customElements.define('state-history-viewer', StateHistoryViewer);

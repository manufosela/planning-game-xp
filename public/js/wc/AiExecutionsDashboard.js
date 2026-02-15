/**
 * AiExecutionsDashboard
 *
 * Web component that displays a global view of all AI executions.
 * Shows active executions with real-time updates via Firebase RTDB,
 * and recent execution history.
 */

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { aiExecutionsDashboardStyles } from './ai-executions-dashboard-styles.js';
import { aiExecutionService } from '../services/ai-execution-service.js';

class AiExecutionsDashboard extends LitElement {
  static styles = [aiExecutionsDashboardStyles];

  static properties = {
    _available: { state: true },
    _activeExecutions: { state: true },
    _recentExecutions: { state: true },
    _loading: { state: true },
  };

  constructor() {
    super();
    this._available = false;
    this._activeExecutions = {};
    this._recentExecutions = [];
    this._loading = true;
    this._unsubActive = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    try {
      await aiExecutionService.ensureInitialized();
      this._available = aiExecutionService.isAvailable();
    } catch {
      this._available = false;
    }

    if (this._available) {
      this._subscribeToActive();
    }

    this._loading = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubActive) {
      this._unsubActive();
      this._unsubActive = null;
    }
  }

  _subscribeToActive() {
    this._unsubActive = aiExecutionService.subscribeToActiveExecutions((data) => {
      this._activeExecutions = data || {};
    });
  }

  _getActiveList() {
    return Object.values(this._activeExecutions)
      .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
  }

  _getStats() {
    const entries = Object.values(this._activeExecutions);
    return {
      running: entries.filter(e => e.status === 'running').length,
      queued: entries.filter(e => e.status === 'queued').length,
      total: entries.length,
    };
  }

  _formatTime(isoString) {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleTimeString();
    } catch {
      return isoString;
    }
  }

  _handleExecutionClick(execution) {
    document.dispatchEvent(new CustomEvent('show-modal', {
      detail: {
        options: {
          title: `Ejecución IA - ${execution.cardId}`,
          webComponent: 'ai-execution-panel',
          webComponentAttributes: {
            'execution-id': execution.executionId,
            'card-id': execution.cardId,
            'project-id': execution.projectId,
          },
          hideButtons: true,
        }
      }
    }));
  }

  render() {
    if (this._loading) {
      return html`<div class="empty-state">Cargando...</div>`;
    }

    if (!this._available) {
      return html`
        <div class="not-available">
          <p><strong>Bridge Server no disponible</strong></p>
          <p>El dashboard de ejecuciones IA requiere que el Bridge Server esté configurado y en ejecución.</p>
        </div>
      `;
    }

    const activeList = this._getActiveList();
    const stats = this._getStats();

    return html`
      <div class="dashboard">
        <div class="dashboard-header">
          <h3>AI Executions</h3>
        </div>

        <div class="stats-row">
          <div class="stat-card running">
            <div class="stat-value">${stats.running}</div>
            <div class="stat-label">Running</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.queued}</div>
            <div class="stat-label">Queued</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">Active Total</div>
          </div>
        </div>

        <div class="section-title">Active Executions</div>
        ${activeList.length === 0
          ? html`<div class="empty-state">No hay ejecuciones activas</div>`
          : html`
            <div class="executions-list">
              ${activeList.map(exec => html`
                <div class="execution-row" @click=${() => this._handleExecutionClick(exec)}>
                  <span class="card-id">${exec.cardId || '-'}</span>
                  <span class="title">${exec.projectId || ''}</span>
                  <span class="phase">${exec.phase || '-'} (${exec.iteration || 0}/${exec.maxIterations || 3})</span>
                  <span class="status-badge ${exec.status}">${exec.status}</span>
                  <span class="time">${this._formatTime(exec.requestedAt)}</span>
                </div>
              `)}
            </div>
          `
        }
      </div>
    `;
  }
}

customElements.define('ai-executions-dashboard', AiExecutionsDashboard);

export { AiExecutionsDashboard };

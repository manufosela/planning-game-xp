/**
 * AiExecutionPanel
 *
 * Web component that displays real-time progress of an AI execution.
 * Shows a timeline of checkpoints, current phase/iteration, and
 * provides cancel functionality.
 *
 * Uses dual subscription: WebSocket (low latency) + Firebase RTDB (resilience).
 */

import { LitElement, html, nothing } from 'lit';
import { aiExecutionPanelStyles } from './ai-execution-panel-styles.js';
import { aiExecutionService } from '../services/ai-execution-service.js';

class AiExecutionPanel extends LitElement {
  static styles = [aiExecutionPanelStyles];

  static properties = {
    executionId: { type: String, attribute: 'execution-id' },
    cardId: { type: String, attribute: 'card-id' },
    projectId: { type: String, attribute: 'project-id' },
    _status: { state: true },
    _phase: { state: true },
    _iteration: { state: true },
    _maxIterations: { state: true },
    _checkpoints: { state: true },
    _error: { state: true },
    _result: { state: true },
    _requestedAt: { state: true },
    _startedAt: { state: true },
    _completedAt: { state: true },
  };

  constructor() {
    super();
    this.executionId = '';
    this.cardId = '';
    this.projectId = '';
    this._status = 'queued';
    this._phase = null;
    this._iteration = 0;
    this._maxIterations = 3;
    this._checkpoints = [];
    this._error = null;
    this._result = null;
    this._requestedAt = null;
    this._startedAt = null;
    this._completedAt = null;
    this._wsClose = null;
    this._rtdbUnsub = null;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.executionId) {
      this._subscribe();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanup();
  }

  updated(changedProperties) {
    if (changedProperties.has('executionId') && this.executionId) {
      this._cleanup();
      this._subscribe();
    }
  }

  _subscribe() {
    // WebSocket for low latency
    try {
      this._wsClose = aiExecutionService.connectWebSocket(this.executionId, (event) => {
        this._handleWsEvent(event);
      });
    } catch {
      // WS connection failed, RTDB will be the primary channel
    }

    // Firebase RTDB for resilience
    this._rtdbUnsub = aiExecutionService.subscribeToExecution(this.executionId, (data) => {
      this._updateFromData(data);
    });
  }

  _cleanup() {
    if (this._wsClose) {
      this._wsClose();
      this._wsClose = null;
    }
    if (this._rtdbUnsub) {
      this._rtdbUnsub();
      this._rtdbUnsub = null;
    }
  }

  _handleWsEvent(event) {
    switch (event.type) {
    case 'checkpoint':
      this._checkpoints = [...this._checkpoints, event.data];
      break;
    case 'phase_change':
      if (event.data.phase) this._phase = event.data.phase;
      if (event.data.iteration) this._iteration = event.data.iteration;
      if (event.data.status) this._status = event.data.status;
      break;
    case 'completed':
      this._status = 'completed';
      break;
    case 'error':
      this._status = 'failed';
      this._error = event.data.error || 'Unknown error';
      break;
    case 'cancelled':
      this._status = 'cancelled';
      break;
    }
  }

  _updateFromData(data) {
    this._status = data.status || this._status;
    this._phase = data.phase || this._phase;
    this._iteration = data.iteration || this._iteration;
    this._maxIterations = data.maxIterations || this._maxIterations;
    this._error = data.error || this._error;
    this._result = data.result || this._result;
    this._requestedAt = data.requestedAt || this._requestedAt;
    this._startedAt = data.startedAt || this._startedAt;
    this._completedAt = data.completedAt || this._completedAt;

    // Convert checkpoints object to sorted array
    if (data.checkpoints) {
      this._checkpoints = Object.values(data.checkpoints)
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    }
  }

  async _handleCancel() {
    try {
      await aiExecutionService.cancel(this.executionId);
    } catch (err) {
      this._error = err.message;
    }
  }

  _handleClose() {
    this.dispatchEvent(new CustomEvent('close-panel', { bubbles: true, composed: true }));
  }

  _formatTime(isoString) {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleTimeString();
    } catch {
      return isoString;
    }
  }

  _getElapsedTime() {
    if (!this._startedAt) return null;
    const start = new Date(this._startedAt).getTime();
    const end = this._completedAt ? new Date(this._completedAt).getTime() : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  _isTerminal() {
    return ['completed', 'failed', 'cancelled'].includes(this._status);
  }

  render() {
    return html`
      <div class="execution-panel">
        <div class="header">
          <h3>${this.cardId}</h3>
          <span class="status-badge ${this._status}">${this._status}</span>
        </div>

        <div class="info-row">
          <span class="label">Execution ID</span>
          <span>${this.executionId}</span>
        </div>
        <div class="info-row">
          <span class="label">Phase</span>
          <span>${this._phase || '-'}</span>
        </div>
        <div class="info-row">
          <span class="label">Iteration</span>
          <span>${this._iteration} / ${this._maxIterations}</span>
        </div>
        ${this._startedAt ? html`
          <div class="info-row">
            <span class="label">Started</span>
            <span>${this._formatTime(this._startedAt)}</span>
          </div>
        ` : nothing}
        ${this._getElapsedTime() ? html`
          <div class="info-row">
            <span class="label">Elapsed</span>
            <span>${this._getElapsedTime()}</span>
          </div>
        ` : nothing}

        ${this._renderTimeline()}

        ${this._error ? html`
          <div class="error-message">${this._error}</div>
        ` : nothing}

        <div class="actions">
          ${!this._isTerminal() ? html`
            <button class="btn btn-danger" @click=${this._handleCancel}>Cancelar</button>
          ` : nothing}
          <button class="btn" @click=${this._handleClose}>Cerrar</button>
        </div>
      </div>
    `;
  }

  _renderTimeline() {
    if (this._checkpoints.length === 0) {
      return html`<div class="empty-state">Esperando checkpoints...</div>`;
    }

    return html`
      <ul class="timeline">
        ${this._checkpoints.map((cp) => html`
          <li class="timeline-item ${cp.status || 'running'}">
            <div class="stage">${cp.stage || 'Unknown'}</div>
            ${cp.summary ? html`<div class="summary">${cp.summary}</div>` : nothing}
            <div class="timestamp">${this._formatTime(cp.timestamp)}</div>
            ${cp.iteration ? html`<div class="iteration-label">Iteration ${cp.iteration}</div>` : nothing}
          </li>
        `)}
      </ul>
    `;
  }
}

customElements.define('ai-execution-panel', AiExecutionPanel);

export { AiExecutionPanel };

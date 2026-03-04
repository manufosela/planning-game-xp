import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { CleanCardItemStyles } from './clean-card-item-styles.js';

const TYPE_ICONS = {
  tasks: '\u{1F4CB}',
  bugs: '\u{1F41B}',
  proposals: '\u{1F4A1}'
};

export class CleanCardItem extends LitElement {
  static styles = [CleanCardItemStyles];

  static get properties() {
    return {
      cardId: { type: String },
      firebaseId: { type: String },
      cardType: { type: String },
      projectId: { type: String },
      title: { type: String },
      status: { type: String },
      developerName: { type: String },
      priority: { type: String },
      endDate: { type: String },
      isMyTask: { type: Boolean }
    };
  }

  constructor() {
    super();
    this.cardId = '';
    this.firebaseId = '';
    this.cardType = 'tasks';
    this.projectId = '';
    this.title = '';
    this.status = '';
    this.developerName = '';
    this.priority = '';
    this.endDate = '';
    this.isMyTask = false;
  }

  _getStatusClass() {
    const normalized = (this.status || '').toLowerCase().replace(/[\s&]+/g, '');
    return `status-${normalized}`;
  }

  _getStatusLabel() {
    return this.status || 'Unknown';
  }

  _getPriorityClass() {
    const p = String(this.priority || '').toLowerCase();
    if (p.includes('high') || p.includes('blocker') || p === 'application blocker' || p === 'department blocker') return 'high';
    if (p.includes('medium') || p.includes('individual') || p.includes('experience')) return 'medium';
    if (p.includes('low') || p.includes('improvement') || p.includes('workaround')) return 'low';
    return '';
  }

  _formatDate() {
    if (!this.endDate) return '';
    try {
      const d = new Date(this.endDate);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const diffDays = Math.round((d - now) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Hoy';
      if (diffDays === 1) return 'Mañana';
      if (diffDays === -1) return 'Ayer';
      return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  _getSection() {
    const ct = (this.cardType || '').toLowerCase();
    if (ct.includes('bug')) return 'bugs';
    if (ct.includes('proposal')) return 'proposals';
    return 'tasks';
  }

  _handleClick() {
    this.dispatchEvent(new CustomEvent('open-card-detail', {
      bubbles: true,
      composed: true,
      detail: {
        cardId: this.cardId,
        firebaseId: this.firebaseId,
        cardType: this._getSection(),
        projectId: this.projectId
      }
    }));
  }

  render() {
    const typeIcon = TYPE_ICONS[this._getSection()] || '\u{1F4CB}';
    const priorityClass = this._getPriorityClass();
    const dateStr = this._formatDate();

    return html`
      <div class="card-item ${this.isMyTask ? 'my-task' : ''}" @click=${this._handleClick}>
        <div class="card-header">
          <span class="status-badge ${this._getStatusClass()}">${this._getStatusLabel()}</span>
          <span class="card-type-icon">${typeIcon}</span>
          <span class="card-id">${this.cardId}</span>
        </div>
        <div class="card-title">${this.title}</div>
        <div class="card-meta">
          ${priorityClass ? html`
            <span class="meta-item">
              <span class="priority-dot ${priorityClass}"></span>
              ${this._getPriorityClass()}
            </span>
          ` : ''}
          ${this.developerName ? html`
            <span class="meta-item">${this.developerName}</span>
          ` : ''}
          ${dateStr ? html`
            <span class="meta-item">${dateStr}</span>
          ` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('clean-card-item', CleanCardItem);

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { CleanCardDetailStyles } from './clean-card-detail-styles.js';

const TYPE_LABELS = {
  tasks: 'Tarea',
  bugs: 'Bug',
  proposals: 'Propuesta'
};

export class CleanCardDetail extends LitElement {
  static styles = [CleanCardDetailStyles];

  static get properties() {
    return {
      cardId: { type: String },
      firebaseId: { type: String },
      cardType: { type: String },
      projectId: { type: String },
      title: { type: String },
      status: { type: String },
      description: { type: String },
      descriptionStructured: { type: Array },
      acceptanceCriteriaStructured: { type: Array },
      developerName: { type: String },
      validatorName: { type: String },
      createdBy: { type: String },
      endDate: { type: String },
      startDate: { type: String },
      devPoints: { type: Number },
      businessPoints: { type: Number },
      notes: { type: Array },
      userEmail: { type: String },
      _loading: { type: Boolean, state: true },
      _reopenMode: { type: Boolean, state: true },
      _reopenReason: { type: String, state: true }
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
    this.description = '';
    this.descriptionStructured = [];
    this.acceptanceCriteriaStructured = [];
    this.developerName = '';
    this.validatorName = '';
    this.createdBy = '';
    this.endDate = '';
    this.startDate = '';
    this.devPoints = 0;
    this.businessPoints = 0;
    this.notes = [];
    this.userEmail = '';
    this._loading = false;
    this._reopenMode = false;
    this._reopenReason = '';
    // Internal state for reopen (set from outside, not reactive)
    this._currentReopenCount = 0;
    this._currentReopenCycles = [];
    this._currentNotesRaw = '';
  }

  _getStatusClass() {
    const normalized = (this.status || '').toLowerCase().replace(/[\s&]+/g, '');
    return `status-${normalized}`;
  }

  _getSection() {
    const ct = (this.cardType || '').toLowerCase();
    if (ct.includes('bug')) return 'bugs';
    if (ct.includes('proposal')) return 'proposals';
    return 'tasks';
  }

  _formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  }

  _canValidate() {
    return this.status === 'To Validate' || this.status === 'Fixed';
  }

  _canReopen() {
    return this.status === 'To Validate' || this.status === 'Fixed';
  }

  _renderDescription() {
    if (Array.isArray(this.descriptionStructured) && this.descriptionStructured.length > 0) {
      return html`
        ${this.descriptionStructured.map(item => html`
          <div class="user-story">
            <div>
              <span class="user-story-label">Como</span>
              <div class="user-story-text">${item.role || ''}</div>
            </div>
            <div>
              <span class="user-story-label">Quiero</span>
              <div class="user-story-text">${item.goal || ''}</div>
            </div>
            <div>
              <span class="user-story-label">Para</span>
              <div class="user-story-text">${item.benefit || ''}</div>
            </div>
          </div>
        `)}
      `;
    }
    if (this.description) {
      return html`<div class="section-content">${this.description}</div>`;
    }
    return html`<div class="section-content" style="color: var(--text-muted, #94a3b8);">Sin descripción</div>`;
  }

  _renderNotes() {
    const notesArr = Array.isArray(this.notes) ? this.notes : [];
    if (notesArr.length === 0) return nothing;

    return html`
      <div class="section">
        <div class="section-title">Notas del desarrollador</div>
        ${notesArr.map(note => html`
          <div class="note-item">
            <div class="note-header">
              <span class="note-author">${note.author || 'Anónimo'}</span>
              <span class="note-date">${this._formatDate(note.timestamp)}</span>
            </div>
            <div class="note-content">${note.content || ''}</div>
          </div>
        `)}
      </div>
    `;
  }

  _renderAcceptanceCriteria() {
    const criteria = Array.isArray(this.acceptanceCriteriaStructured) ? this.acceptanceCriteriaStructured : [];
    if (criteria.length === 0) return nothing;

    return html`
      <details class="criteria-details">
        <summary class="section-title clickable">Criterios de aceptación (${criteria.length})</summary>
        <div class="criteria-list">
          ${criteria.map(ac => html`
            <div class="criteria-item">
              ${ac.given ? html`
                <div class="criteria-label">Given</div>
                <div class="criteria-text">${ac.given}</div>
              ` : nothing}
              ${ac.when ? html`
                <div class="criteria-label">When</div>
                <div class="criteria-text">${ac.when}</div>
              ` : nothing}
              ${ac.then ? html`
                <div class="criteria-label">Then</div>
                <div class="criteria-text">${ac.then}</div>
              ` : nothing}
              ${ac.raw && !ac.given && !ac.when && !ac.then ? html`
                <div class="criteria-text">${ac.raw}</div>
              ` : nothing}
            </div>
          `)}
        </div>
      </details>
    `;
  }

  _renderActions() {
    if (this._loading) {
      return html`
        <div class="loading-overlay">
          <div class="spinner"></div>
          <span>Procesando...</span>
        </div>
      `;
    }

    if (!this._canValidate() && !this._canReopen()) {
      const statusMsg = this.status === 'Done&Validated' || this.status === 'Done'
        ? 'Esta tarea ya ha sido validada'
        : `Estado actual: ${this.status}`;
      return html`<div class="no-actions">${statusMsg}</div>`;
    }

    return html`
      <div class="actions">
        ${this._canValidate() ? html`
          <button class="btn-validate" @click=${this._handleValidate} ?disabled=${this._loading}>
            ✓ Validar ${TYPE_LABELS[this._getSection()] || 'Tarea'}
          </button>
          <div class="action-hint">Al validar, el estado cambiará a "Done&Validated"</div>
        ` : nothing}

        ${this._canReopen() && !this._reopenMode ? html`
          <button class="btn-reopen" @click=${this._showReopenForm} ?disabled=${this._loading}>
            ✎ Solicitar Cambios
          </button>
        ` : nothing}

        ${this._reopenMode ? this._renderReopenForm() : nothing}
      </div>
    `;
  }

  _renderReopenForm() {
    return html`
      <div class="reopen-form">
        <input
          class="reopen-input"
          type="text"
          placeholder="Motivo de la solicitud de cambios..."
          .value=${this._reopenReason}
          @input=${(e) => { this._reopenReason = e.target.value; }}
        />
        <div class="reopen-actions">
          <button
            class="btn-confirm-reopen"
            @click=${this._handleRequestChanges}
            ?disabled=${!this._reopenReason.trim() || this._loading}
          >
            Solicitar Cambios
          </button>
          <button class="btn-cancel-reopen" @click=${this._hideReopenForm}>
            Cancelar
          </button>
        </div>
      </div>
    `;
  }

  _showReopenForm() {
    this._reopenMode = true;
    this._reopenReason = '';
  }

  _hideReopenForm() {
    this._reopenMode = false;
    this._reopenReason = '';
  }

  async _handleValidate() {
    this._loading = true;
    try {
      const { FirebaseService } = await import('../services/firebase-service.js');

      const section = this._getSection().toUpperCase();
      const updateData = {
        status: 'Done&Validated',
        validatedAt: new Date().toISOString(),
        updatedBy: this.userEmail
      };

      await FirebaseService.updateCard(this.projectId, section, this.firebaseId, updateData);

      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `${this.cardId} validada correctamente`, type: 'success' } }
      }));

      this.dispatchEvent(new CustomEvent('card-validated', {
        bubbles: true,
        composed: true,
        detail: { cardId: this.cardId, firebaseId: this.firebaseId, newStatus: 'Done&Validated' }
      }));
    } catch (error) {
      console.error('Error validating card:', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `Error al validar: ${error.message}`, type: 'error' } }
      }));
    } finally {
      this._loading = false;
    }
  }

  async _handleRequestChanges() {
    if (!this._reopenReason.trim()) return;

    this._loading = true;
    try {
      const { FirebaseService } = await import('../services/firebase-service.js');

      const section = this._getSection().toUpperCase();
      const reason = this._reopenReason.trim();

      // Follow TaskCard reopen pattern: reopenCount, reopenCycles, note
      const newReopenCount = (this._currentReopenCount || 0) + 1;
      const reopenCycles = Array.isArray(this._currentReopenCycles) ? [...this._currentReopenCycles] : [];
      reopenCycles.push({
        cycle: newReopenCount,
        reopenedAt: new Date().toISOString(),
        reopenedBy: this.userEmail,
        previousStatus: this.status,
        reason
      });

      // Build reopen note with reason (prepend to existing notes string)
      const reopenTag = `[REOPEN #${newReopenCount}]`;
      const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const reopenNote = `${reopenTag} Solicitud de cambios (${dateStr}): ${reason}`;
      const currentNotes = this._currentNotesRaw || '';
      const updatedNotes = currentNotes ? `${reopenNote}\n\n${currentNotes}` : reopenNote;

      const updateData = {
        status: 'Reopened',
        reopenCount: newReopenCount,
        reopenCycles,
        notes: updatedNotes,
        endDate: '',
        validatedAt: '',
        updatedBy: this.userEmail
      };

      await FirebaseService.updateCard(this.projectId, section, this.firebaseId, updateData);

      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `${this.cardId} devuelta para cambios`, type: 'info' } }
      }));

      this.dispatchEvent(new CustomEvent('card-reopened', {
        bubbles: true,
        composed: true,
        detail: { cardId: this.cardId, firebaseId: this.firebaseId, newStatus: 'Reopened', reason: this._reopenReason.trim() }
      }));

      this._hideReopenForm();
    } catch (error) {
      console.error('Error reopening card:', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `Error al solicitar cambios: ${error.message}`, type: 'error' } }
      }));
    } finally {
      this._loading = false;
    }
  }

  render() {
    const typeLabel = TYPE_LABELS[this._getSection()] || 'Tarea';

    return html`
      <div class="detail-container">
        <!-- Header -->
        <div class="detail-header">
          <span class="status-badge ${this._getStatusClass()}">${this.status || 'Unknown'}</span>
          <span class="card-id">${this.cardId}</span>
        </div>

        <!-- Title -->
        <div class="detail-title">${this.title}</div>
        <div class="detail-subtitle">
          ${this.createdBy ? html`<span>Creado por: ${this.createdBy}</span>` : nothing}
          ${this.devPoints || this.businessPoints ? html`
            <span>Dev: ${this.devPoints} · Negocio: ${this.businessPoints}</span>
          ` : nothing}
        </div>

        <!-- Description -->
        <div class="section">
          <div class="section-title">Descripción</div>
          ${this._renderDescription()}
        </div>

        <!-- Notes -->
        ${this._renderNotes()}

        <!-- Acceptance Criteria -->
        ${this._renderAcceptanceCriteria()}

        <hr class="divider" />

        <!-- Info panel -->
        <div class="info-panel">
          <div class="info-item">
            <div class="info-label">Entrega</div>
            <div class="info-value">${this._formatDate(this.endDate) || '—'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Developer</div>
            <div class="info-value">${this.developerName || '—'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Validator</div>
            <div class="info-value">${this.validatorName || '—'}</div>
          </div>
        </div>

        <!-- Actions -->
        ${this._renderActions()}
      </div>
    `;
  }
}

customElements.define('clean-card-detail', CleanCardDetail);

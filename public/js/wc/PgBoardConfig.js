import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { pgBoardConfigStyles } from './pg-board-config-styles.js';
import {
  loadColumnsForProject,
  saveColumns,
  upsertColumn,
  removeColumn,
  moveColumnAndPersist,
  getEnforceWip,
  setEnforceWip
} from '../services/board-config-service.js';
import {
  findDuplicateStatusKeys,
  slugifyStatus,
  DEFAULT_TASK_STATUSES,
  generateDefaultColumns,
  computeWipStatus
} from '/js/utils/board-columns.js';
import { modalService } from '/js/services/modal-service.js';

async function confirmAction(message, { title = 'Confirmar', confirmText = 'Sí', cancelText = 'Cancelar' } = {}) {
  return modalService.createConfirmationModal({ title, message, confirmText, cancelText });
}

async function promptForm(title, fields) {
  return modalService.createFormModal({ title, fields, submitText: 'Crear', cancelText: 'Cancelar' });
}

/**
 * <pg-board-config> — Phase 1 of the real Kanban boards epic.
 *
 * Per-project column editor: rename, reorder, set WIP, change statusKey
 * mapping, add new columns, delete existing ones. Does NOT touch the
 * actual board view yet (that lands in Phases 2/3 with WIP enforcement
 * and drag&drop). This is purely the management UI for
 * /projects/{projectId}/board/columns.
 */
export class PgBoardConfig extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id', reflect: true },
      columns: { state: true },
      enforceWip: { state: true },
      status: { state: true },
      loadError: { state: true }
    };
  }

  static get styles() {
    return [pgBoardConfigStyles];
  }

  constructor() {
    super();
    this.projectId = window.currentProjectId || document.body?.dataset?.projectId || '';
    this.columns = [];
    this.enforceWip = false;
    this.status = '';
    this.loadError = '';
    this._projectChangedHandler = (e) => {
      const next = e.detail?.projectId || '';
      if (next && next !== this.projectId) {
        this.projectId = next;
        this._load();
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('project-changed', this._projectChangedHandler);
    this._load();
  }

  disconnectedCallback() {
    document.removeEventListener('project-changed', this._projectChangedHandler);
    super.disconnectedCallback();
  }

  async _load() {
    if (!this.projectId) {
      this.columns = [];
      return;
    }
    this.status = 'Cargando columnas...';
    this.loadError = '';
    try {
      const [columns, enforceWip] = await Promise.all([
        loadColumnsForProject(this.projectId),
        getEnforceWip(this.projectId)
      ]);
      this.columns = columns;
      this.enforceWip = enforceWip;
      this.status = '';
    } catch (err) {
      console.error('[PgBoardConfig] load failed', err);
      this.loadError = err?.message || 'Error cargando columnas';
      this.columns = [];
      this.enforceWip = false;
      this.status = '';
    }
  }

  async _onEnforceWipToggle(e) {
    const next = Boolean(e.target.checked);
    try {
      await setEnforceWip(this.projectId, next);
      this.enforceWip = next;
      this._flashStatus(next ? 'enforceWip activado' : 'enforceWip desactivado');
    } catch (err) {
      console.error('[PgBoardConfig] enforceWip toggle failed', err);
      this._flashStatus('Error guardando enforceWip');
    }
  }

  _flashStatus(msg) {
    this.status = msg;
    window.setTimeout(() => { this.status = ''; this.requestUpdate(); }, 1500);
  }

  async _onFieldChange(col, field, value) {
    const updated = { ...col, [field]: value };
    if (field === 'wipLimit') {
      updated.wipLimit = value === '' || value === null ? null : Number(value);
      if (updated.wipLimit !== null && (!Number.isFinite(updated.wipLimit) || updated.wipLimit < 0)) {
        this._flashStatus(`wipLimit inválido en "${col.name}"`);
        return;
      }
    }
    try {
      await upsertColumn(this.projectId, updated);
      this.columns = this.columns.map((c) => (c.id === col.id ? updated : c));
      this._flashStatus(`Guardado "${updated.name}"`);
    } catch (err) {
      console.error('[PgBoardConfig] upsert failed', err);
      this._flashStatus(`Error guardando "${col.name}"`);
    }
  }

  async _onMove(col, delta) {
    const sorted = [...this.columns].sort((a, b) => a.order - b.order);
    const currentIndex = sorted.findIndex((c) => c.id === col.id);
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    try {
      this.columns = await moveColumnAndPersist(this.projectId, sorted, col.id, targetIndex);
      this._flashStatus(`Movida "${col.name}"`);
    } catch (err) {
      console.error('[PgBoardConfig] move failed', err);
      this._flashStatus(`Error moviendo "${col.name}"`);
    }
  }

  async _onDelete(col) {
    const ok = await confirmAction(
      `¿Eliminar la columna "${col.name}"? Las cards en su estado se quedarán sin columna hasta que reasignes el statusKey.`,
      { title: 'Eliminar columna', confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );
    if (!ok) return;
    try {
      await removeColumn(this.projectId, col.id);
      this.columns = this.columns.filter((c) => c.id !== col.id);
      this._flashStatus(`Eliminada "${col.name}"`);
    } catch (err) {
      console.error('[PgBoardConfig] delete failed', err);
      this._flashStatus(`Error eliminando "${col.name}"`);
    }
  }

  async _onAdd() {
    const form = await promptForm('Nueva columna', [
      { name: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'p.ej. Ready for QA' },
      { name: 'statusKey', label: 'statusKey al que mapea', type: 'text', required: true, placeholder: 'p.ej. To Validate' },
      { name: 'wipLimit', label: 'WIP limit (vacío = sin límite)', type: 'number', min: 0 }
    ]);
    if (!form) return;
    const name = (form.name || '').trim();
    const statusKey = (form.statusKey || '').trim();
    if (!name || !statusKey) {
      this._flashStatus('Nombre y statusKey son obligatorios');
      return;
    }
    const wipLimit = form.wipLimit === '' || form.wipLimit == null ? null : Number(form.wipLimit);
    const id = slugifyStatus(name) || `col-${Date.now()}`;
    const order = this.columns.length;
    try {
      const col = await upsertColumn(this.projectId, { id, name, order, statusKey, wipLimit });
      this.columns = [...this.columns, col];
      this._flashStatus(`Añadida "${col.name}"`);
    } catch (err) {
      console.error('[PgBoardConfig] add failed', err);
      this._flashStatus(`Error añadiendo "${name}"`);
    }
  }

  async _onResetDefaults() {
    const ok = await confirmAction(
      '¿Sobrescribir la config con las columnas por defecto (To Do, In Progress, To Validate, Done&Validated, Blocked)?',
      { title: 'Restaurar defaults', confirmText: 'Restaurar', cancelText: 'Cancelar' }
    );
    if (!ok) return;
    try {
      this.columns = await saveColumns(this.projectId, generateDefaultColumns(DEFAULT_TASK_STATUSES));
      this._flashStatus('Defaults restaurados');
    } catch (err) {
      console.error('[PgBoardConfig] reset failed', err);
      this._flashStatus('Error restaurando defaults');
    }
  }

  render() {
    if (!this.projectId) {
      return html`<div class="state-empty">Selecciona un proyecto para configurar su tablero.</div>`;
    }
    if (this.loadError) {
      return html`<div class="state-error">${this.loadError}</div>`;
    }

    const sorted = [...this.columns].sort((a, b) => a.order - b.order);
    const duplicates = findDuplicateStatusKeys(sorted);

    return html`
      <div class="panel">
        <div class="panel-toolbar">
          <span class="panel-status">${this.status || `${sorted.length} columna(s)`}</span>
          <label class="enforce-wip">
            <input
              type="checkbox"
              .checked=${this.enforceWip}
              @change=${this._onEnforceWipToggle}
            />
            <span>enforce WIP</span>
          </label>
          <div>
            <button class="row-btn" type="button" @click=${this._onResetDefaults}>↺ Defaults</button>
            <button class="add-btn" type="button" @click=${this._onAdd}>+ Añadir columna</button>
          </div>
        </div>

        ${duplicates.length > 0
          ? html`<div class="state-error">
              <span class="warn">⚠ Hay statusKey duplicados:</span> ${duplicates.join(', ')}.
              Cada estado debería estar en una sola columna.
            </div>`
          : ''}

        ${sorted.length === 0
          ? html`<div class="state-empty">Sin columnas configuradas.</div>`
          : html`
            <table class="cols-table">
              <thead>
                <tr>
                  <th class="col-num">#</th>
                  <th>Nombre</th>
                  <th>statusKey</th>
                  <th class="col-num">WIP</th>
                  <th class="col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${sorted.map((col, idx) => html`
                  <tr>
                    <td class="col-num">${idx + 1}</td>
                    <td>
                      <input class="col-input" type="text"
                        .value=${col.name}
                        @change=${(e) => this._onFieldChange(col, 'name', e.target.value)} />
                    </td>
                    <td>
                      <input class="col-input" type="text"
                        .value=${col.statusKey}
                        @change=${(e) => this._onFieldChange(col, 'statusKey', e.target.value)} />
                    </td>
                    <td class="col-num">
                      <input class="col-input short" type="number" min="0" placeholder="—"
                        .value=${col.wipLimit ?? ''}
                        @change=${(e) => this._onFieldChange(col, 'wipLimit', e.target.value)} />
                      ${col.wipLimit != null ? html`
                        <span class="wip-pill wip-${computeWipStatus(col, 0)}" title="WIP status preview">
                          ${col.wipLimit}
                        </span>
                      ` : ''}
                    </td>
                    <td class="col-actions">
                      <button class="row-btn" type="button" ?disabled=${idx === 0} @click=${() => this._onMove(col, -1)} title="Subir">▲</button>
                      <button class="row-btn" type="button" ?disabled=${idx === sorted.length - 1} @click=${() => this._onMove(col, 1)} title="Bajar">▼</button>
                      <button class="row-btn danger" type="button" @click=${() => this._onDelete(col)} title="Eliminar">✕</button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}

        <div class="panel-footer">
          <strong>Fase 1 del Kanban real</strong> — esta config se persiste en
          <code>/projects/${this.projectId}/board/columns</code>. La aplicación al tablero real
          (drag&amp;drop, WIP enforcement, métricas) llega en las siguientes fases.
        </div>
      </div>
    `;
  }
}

if (!customElements.get('pg-board-config')) {
  customElements.define('pg-board-config', PgBoardConfig);
}

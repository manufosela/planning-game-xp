import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { pgBoardStyles } from './pg-board-styles.js';
import { database, ref, onValue } from '../../firebase-config.js';
import {
  loadColumnsForProject,
  getEnforceWip
} from '../services/board-config-service.js';
import {
  assignRankAtIndex,
  compareByRank,
  persistCardMove,
  persistColumnRespread,
  writeBoardSnapshot,
  RANK_STEP
} from '../services/board-move-service.js';
import {
  computeWipStatus,
  shouldBlockDrop,
  isExpediteCard,
  normalizeColumns
} from '/js/utils/board-columns.js';
import { showExpandedCardInModal } from '../utils/common-functions.js';
import { FirebaseService } from '../services/firebase-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';

/**
 * <pg-board> — Phase 3 of the real Kanban boards epic.
 *
 * Renders the project board with real-time listeners and HTML5 drag&drop.
 * On drop the status transition is validated against ALLOWED_TRANSITIONS;
 * if invalid the card snaps back and a toast is fired. If valid, status +
 * boardColId + boardRank are persisted in one multi-path update. Real-time
 * comes from onValue on /cards/{projectId}/TASKS_{projectId}.
 *
 * Phases 4-6 will plug in: card detail modal, swimlanes/filters, flow
 * metrics. This phase only ships the movement layer.
 */

// Conservative whitelist; mirrors the PG's documented task state machine.
// Reopened and Pausado are reachable via the modal flows, not via d&d.
const ALLOWED_TRANSITIONS = new Map([
  ['To Do',          new Set(['In Progress', 'Blocked'])],
  ['In Progress',    new Set(['To Validate', 'Blocked', 'To Do'])],
  ['Blocked',        new Set(['In Progress', 'To Do'])],
  ['To Validate',    new Set(['In Progress'])],
  ['Pausado',        new Set(['In Progress', 'To Do'])],
  ['Reopened',       new Set(['In Progress', 'To Validate'])],
  ['Done&Validated', new Set([])]
]);

function isValidTransition(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS.get(from);
  return Boolean(allowed && allowed.has(to));
}

function notify(message, type = 'info') {
  document.dispatchEvent(new CustomEvent('show-slide-notification', {
    detail: { options: { message, type } }
  }));
}

export class PgBoard extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id', reflect: true },
      columns: { state: true },
      cards: { state: true },
      enforceWip: { state: true },
      status: { state: true },
      loadError: { state: true },
      _dragInfo: { state: true },
      _dropTargetColId: { state: true }
    };
  }

  static get styles() {
    return [pgBoardStyles];
  }

  createRenderRoot() {
    // Light DOM to comply with the repo convention shipped with the
    // existing PG components — let the global theme reach the board.
    return this;
  }

  constructor() {
    super();
    this.projectId = window.currentProjectId || document.body?.dataset?.projectId || '';
    this.columns = [];
    this.cards = [];
    this.enforceWip = false;
    this.status = '';
    this.loadError = '';
    this._dragInfo = null;
    this._dropTargetColId = '';
    this._unsubscribers = [];
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
    this._teardownListeners();
    super.disconnectedCallback();
  }

  _teardownListeners() {
    for (const fn of this._unsubscribers) {
      try { fn(); } catch { /* noop */ }
    }
    this._unsubscribers = [];
  }

  async _load() {
    this._teardownListeners();
    if (!this.projectId) {
      this.columns = [];
      this.cards = [];
      return;
    }
    this.status = 'Cargando tablero...';
    this.loadError = '';
    try {
      const [columns, enforceWip] = await Promise.all([
        loadColumnsForProject(this.projectId),
        getEnforceWip(this.projectId)
      ]);
      this.columns = normalizeColumns(columns);
      this.enforceWip = enforceWip;

      // Real-time subscription to tasks for this project.
      const tasksRef = ref(database, `/cards/${this.projectId}/TASKS_${this.projectId}`);
      const unsub = onValue(tasksRef, (snap) => {
        const raw = snap.val() || {};
        this.cards = Object.entries(raw)
          .map(([firebaseId, card]) => ({ firebaseId, ...card }))
          .filter((c) => !c.deletedAt);
        this.status = '';
      }, (err) => {
        this.loadError = err?.message || 'Error en la suscripción en tiempo real';
        this.status = '';
      });
      this._unsubscribers.push(unsub);
    } catch (err) {
      console.error('[PgBoard] load failed', err);
      this.loadError = err?.message || 'Error cargando el tablero';
      this.status = '';
    }
  }

  _cardsForColumn(col) {
    return this.cards
      .filter((c) => {
        if (c.boardColId && c.boardColId === col.id) return true;
        return c.status === col.statusKey && !c.boardColId;
      })
      .sort(compareByRank);
  }

  _onDragStart(e, card, col) {
    this._dragInfo = { card, fromColId: col.id, fromStatus: card.status };
    this._wasDragged = true;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.firebaseId);
    e.target.classList.add('dragging');
  }

  async _onCardClick(e, card) {
    // The browser does not fire `click` after a successful drag, but we
    // still defend against a stale dragstart that ended outside any drop
    // target.
    if (this._wasDragged) {
      this._wasDragged = false;
      return;
    }
    await this._openCardDetail(card);
  }

  async _openCardDetail(card) {
    try {
      await entityDirectoryService.init?.();
      const [statusList, projectSprintList] = await Promise.all([
        FirebaseService.getStatusList('task-card').catch(() => []),
        FirebaseService.getSprintList(this.projectId).catch(() => ({}))
      ]);
      const developersList = (entityDirectoryService.getActiveDevelopers?.() || []).map((d) => ({
        id: d.id, email: d.email, name: d.name
      }));
      const statusArray = Array.isArray(statusList) ? statusList : Object.keys(statusList || {});

      // Load every persisted field for the card; the in-memory copy only
      // carries the board-projected fields.
      const path = `/cards/${this.projectId}/TASKS_${this.projectId}`;
      const allCards = await FirebaseService.getCards(path);
      const fullCard = allCards?.[card.firebaseId] || card;

      const taskCardEl = document.createElement('task-card');
      Object.assign(taskCardEl, {
        ...fullCard,
        firebaseId: card.firebaseId,
        id: card.firebaseId,
        projectId: this.projectId,
        cardType: 'tasks',
        section: 'tasks',
        group: 'tasks',
        expanded: true,
        isEditable: true,
        statusList: statusArray,
        developerList: developersList,
        developers: developersList,
        globalSprintList: projectSprintList,
        userEmail: document.body?.dataset?.userEmail || '',
        _skipClone: true
      });

      showExpandedCardInModal(taskCardEl);
    } catch (err) {
      console.error('[PgBoard] open card detail failed', err);
      notify(`No se pudo abrir el detalle: ${err?.message || 'error desconocido'}`, 'error');
    }
  }

  _onDragEnd(e) {
    e.target.classList.remove('dragging');
    this._dragInfo = null;
    this._dropTargetColId = '';
  }

  _onDragOver(e, col) {
    e.preventDefault();
    this._dropTargetColId = col.id;
  }

  _onDragLeave(col) {
    if (this._dropTargetColId === col.id) this._dropTargetColId = '';
  }

  _findInsertIndex(targetCol, clientY) {
    const dropZone = this.querySelector(`[data-col-id="${targetCol.id}"] .column-body`);
    if (!dropZone) return this._cardsForColumn(targetCol).length;
    const items = Array.from(dropZone.querySelectorAll('.card:not(.dragging)'));
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return items.length;
  }

  async _onDrop(e, targetCol) {
    e.preventDefault();
    this._dropTargetColId = '';
    const info = this._dragInfo;
    if (!info) return;

    const { card, fromColId, fromStatus } = info;
    const sameColumn = fromColId === targetCol.id;
    const newStatus = targetCol.statusKey;

    // Transition validation when crossing columns
    if (!sameColumn && !isValidTransition(fromStatus, newStatus)) {
      notify(`Transición no permitida: "${fromStatus}" → "${newStatus}"`, 'error');
      return;
    }

    const currentCards = this._cardsForColumn(targetCol).filter((c) => c.firebaseId !== card.firebaseId);
    const targetIndex = this._findInsertIndex(targetCol, e.clientY);

    // WIP enforcement (cross-column only; reordering within the same
    // column is always allowed)
    if (!sameColumn) {
      const block = shouldBlockDrop({
        column: targetCol,
        currentCount: currentCards.length,
        card,
        enforceWip: this.enforceWip
      });
      if (block.blocked) {
        notify(block.reason, 'error');
        return;
      }
    }

    let newRank;
    const ranks = currentCards.map((c) => c.boardRank).filter((r) => typeof r === 'number');
    try {
      newRank = assignRankAtIndex(ranks, targetIndex);
    } catch (err) {
      // Respread the column then place
      const reordered = [...currentCards];
      reordered.splice(targetIndex, 0, card);
      try {
        const remap = await persistColumnRespread({
          projectId: this.projectId,
          cardType: 'tasks',
          orderedCards: reordered
        });
        newRank = remap[card.firebaseId] || (targetIndex + 1) * RANK_STEP;
      } catch (respreadErr) {
        console.error('[PgBoard] respread failed', respreadErr);
        notify('Error reordenando la columna', 'error');
        return;
      }
    }

    try {
      await persistCardMove({
        projectId: this.projectId,
        cardType: 'tasks',
        cardFirebaseId: card.firebaseId,
        newStatus,
        newColumnId: targetCol.id,
        newRank
      });
      notify(`"${card.title || card.cardId || 'Card'}" → ${targetCol.name}`, 'success');
      // Phase 5: snapshot the board state after each persisted move so
      // <pg-flow-metrics> has data to chart. Counting is deferred to the
      // next onValue tick so we sample post-move.
      this._scheduleSnapshot();
    } catch (err) {
      console.error('[PgBoard] persistCardMove failed', err);
      notify(`No se pudo mover la card: ${err?.message || 'error desconocido'}`, 'error');
    }
  }

  _scheduleSnapshot() {
    if (this._snapshotTimer) clearTimeout(this._snapshotTimer);
    this._snapshotTimer = setTimeout(() => this._snapshotCurrentState(), 400);
  }

  async _snapshotCurrentState() {
    if (!this.projectId || !this.columns?.length) return;
    const perColumn = {};
    for (const col of this.columns) perColumn[col.id] = this._cardsForColumn(col).length;
    const done = this.cards.filter((c) => c.status === 'Done&Validated').length;
    try {
      await writeBoardSnapshot({
        projectId: this.projectId,
        perColumn,
        done,
        lastSnapshot: this._lastSnapshot
      }).then((result) => {
        if (result.written) this._lastSnapshot = result.snapshot;
      });
    } catch (err) {
      console.warn('[PgBoard] snapshot failed', err);
    }
  }

  render() {
    if (!this.projectId) {
      return html`<div class="board-empty">Selecciona un proyecto para ver su tablero.</div>`;
    }
    if (this.loadError) {
      return html`<div class="board-error">${this.loadError}</div>`;
    }

    const cardsByCol = new Map();
    for (const col of this.columns) cardsByCol.set(col.id, this._cardsForColumn(col));

    return html`
      <div class="board-header">
        <span class="board-title">Tablero · ${this.projectId}</span>
        <span class="board-status">${this.status || `${this.cards.length} card(s) · ${this.columns.length} columna(s) · enforceWip: ${this.enforceWip ? 'on' : 'off'}`}</span>
      </div>

      <div class="board-columns">
        ${this.columns.map((col) => {
          const items = cardsByCol.get(col.id) || [];
          const wipStatus = computeWipStatus(col, items.length);
          const isTarget = this._dropTargetColId === col.id;
          const block = isTarget && this._dragInfo
            ? shouldBlockDrop({
                column: col,
                currentCount: items.filter((c) => c.firebaseId !== this._dragInfo.card.firebaseId).length,
                card: this._dragInfo.card,
                enforceWip: this.enforceWip
              })
            : { blocked: false };

          return html`
            <div class="column ${isTarget && !block.blocked ? 'drop-target' : ''} ${isTarget && block.blocked ? 'drop-blocked' : ''}"
                 data-col-id=${col.id}
                 @dragover=${(e) => this._onDragOver(e, col)}
                 @dragleave=${() => this._onDragLeave(col)}
                 @drop=${(e) => this._onDrop(e, col)}>
              <div class="column-header">
                <span>${col.name}</span>
                <span class="col-count ${wipStatus}">
                  ${items.length}${col.wipLimit != null ? ` / ${col.wipLimit}` : ''}
                </span>
              </div>
              <div class="column-body">
                ${items.length === 0
                  ? html`<div class="empty-column">Sin cards</div>`
                  : items.map((card) => html`
                    <div class="card ${isExpediteCard(card) ? 'expedite' : ''}"
                         draggable="true"
                         data-card-id=${card.firebaseId}
                         @click=${(e) => this._onCardClick(e, card)}
                         @dragstart=${(e) => this._onDragStart(e, card, col)}
                         @dragend=${(e) => this._onDragEnd(e)}>
                      <div class="card-title" title=${card.title || ''}>${card.title || '(sin título)'}</div>
                      <div class="card-meta">
                        <span class="card-id">${card.cardId || ''}</span>
                        <span class="card-points">
                          ${card.devPoints != null ? html`<span class="points-badge">D:${card.devPoints}</span>` : ''}
                          ${card.businessPoints != null ? html`<span class="points-badge">B:${card.businessPoints}</span>` : ''}
                        </span>
                      </div>
                    </div>
                  `)}
              </div>
            </div>
          `;
        })}
      </div>

      <div class="board-footer">
        Drag&amp;drop entre columnas con validación de transición. Tiempo real vía onValue. Phase 4 conectará el detalle de la card al click.
      </div>
    `;
  }
}

if (!customElements.get('pg-board')) {
  customElements.define('pg-board', PgBoard);
}

export { ALLOWED_TRANSITIONS, isValidTransition };

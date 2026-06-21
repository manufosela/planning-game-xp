import { LitElement, html, unsafeCSS } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { pgBoardStyles } from './pg-board-styles.js';

// pgBoardStyles is a Lit CSSResult; .cssText is the underlying string.
// We render it inside an inline <style> because <pg-board> uses light DOM
// (per the repo convention) and Lit's `static styles` only applies in
// shadow DOM.
const PG_BOARD_CSS_TEXT = pgBoardStyles.cssText || String(pgBoardStyles);
const PG_BOARD_STYLE_ID = 'pg-board-light-dom-styles';

function ensurePgBoardStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PG_BOARD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PG_BOARD_STYLE_ID;
  // Strip the :host selectors that don't apply outside shadow DOM.
  style.textContent = PG_BOARD_CSS_TEXT.replace(/:host\s*{[^}]*}/g, '');
  document.head.appendChild(style);
}
// no-op reference so bundlers don't drop the unsafeCSS import
void unsafeCSS;
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
import { database as fbDatabase, ref as fbRef, get as fbGet } from '../../firebase-config.js';

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
      _dropTargetColId: { state: true },
      filterText: { state: true },
      filterDeveloper: { state: true },
      filterEpic: { state: true },
      swimlaneMode: { state: true },
      availableProjects: { state: true }
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
    this.filterText = '';
    this.filterDeveloper = '';
    this.filterEpic = '';
    this.swimlaneMode = 'none';
    this.availableProjects = [];
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
    ensurePgBoardStyles();
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

  async _loadAvailableProjects() {
    try {
      const snap = await fbGet(fbRef(fbDatabase, '/projects'));
      const data = snap.val() || {};
      const list = Object.entries(data)
        .filter(([, p]) => p && !p.archived)
        .map(([id, p]) => ({ id, name: p.name || id }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.availableProjects = list;
    } catch (err) {
      console.warn('[PgBoard] could not list projects for empty state', err);
      this.availableProjects = [];
    }
  }

  _onSelectProject(e) {
    const next = e.target.value;
    if (!next) return;
    this.projectId = next;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('projectId', next);
      window.history.replaceState({}, '', url.toString());
    } catch { /* noop */ }
    this._load();
  }

  async _load() {
    this._teardownListeners();
    if (!this.projectId) {
      this.columns = [];
      this.cards = [];
      // For the empty state, surface a project picker so the user does
      // not get stuck on a blank page.
      if (this.availableProjects.length === 0) {
        this._loadAvailableProjects();
      }
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

  _cardMatchesFilters(card) {
    // Kanban is a flat backlog. We intentionally do NOT filter by sprint
    // here (sprints are a 1-day measurement unit in this PG, see
    // shared/sprint-naming.js); use developer / epic / text instead.
    if (this.filterDeveloper && card.developer !== this.filterDeveloper) return false;
    if (this.filterEpic && card.epic !== this.filterEpic) return false;
    if (this.filterText) {
      const q = this.filterText.toLowerCase();
      const hay = `${card.title || ''} ${card.cardId || ''} ${card.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  _swimlaneKeyForCard(card) {
    if (this.swimlaneMode === 'epic') return card.epic || '(sin epic)';
    if (this.swimlaneMode === 'developer') return card.developer || '(sin developer)';
    return null;
  }

  _cardsForColumn(col) {
    return this.cards
      .filter((c) => {
        if (c.boardColId && c.boardColId === col.id) return true;
        return c.status === col.statusKey && !c.boardColId;
      })
      .filter((c) => this._cardMatchesFilters(c))
      .sort(compareByRank);
  }

  // Same as _cardsForColumn but ignoring filters — used by the WIP
  // counters so the column count shows the project reality, not the
  // filtered subset.
  _allCardsForColumn(col) {
    return this.cards
      .filter((c) => {
        if (c.boardColId && c.boardColId === col.id) return true;
        return c.status === col.statusKey && !c.boardColId;
      })
      .sort(compareByRank);
  }

  _uniqueValues(getter) {
    const set = new Set();
    for (const c of this.cards) {
      const v = getter(c);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  _developerLabel(devId) {
    return entityDirectoryService.getDeveloperDisplayName?.(devId) || devId;
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
      return html`
        <div class="board-empty-pane">
          <h2>Aún no hay proyecto seleccionado</h2>
          <p>Elige un proyecto para abrir su tablero Kanban. El tablero usa la configuración de columnas del proyecto (configurable desde <strong>Admin Project → Board Config</strong>).</p>
          ${this.availableProjects.length > 0 ? html`
            <label class="board-empty-row">
              <span>Proyecto:</span>
              <select class="board-filter" @change=${(e) => this._onSelectProject(e)}>
                <option value="">— Selecciona —</option>
                ${this.availableProjects.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
              </select>
            </label>
          ` : html`<p class="board-empty-hint">Cargando proyectos…</p>`}
          <div class="board-empty-actions">
            <a class="board-link" href="/adminproject/">Ir a Admin Project</a>
          </div>
        </div>
      `;
    }
    if (this.loadError) {
      return html`<div class="board-error">${this.loadError}</div>`;
    }
    if (this.columns.length === 0) {
      const adminUrl = `/adminproject/?projectId=${encodeURIComponent(this.projectId)}`;
      return html`
        <div class="board-empty-pane">
          <h2>El proyecto no tiene columnas configuradas</h2>
          <p>Configura las columnas del Kanban en <strong>Admin Project → Board Config</strong>. Por defecto se generan 5 columnas (To Do, In Progress, To Validate, Done&amp;Validated, Blocked).</p>
          <div class="board-empty-actions">
            <a class="board-link" href=${adminUrl}>Abrir Board Config de ${this.projectId}</a>
          </div>
        </div>
      `;
    }

    const cardsByCol = new Map();
    for (const col of this.columns) cardsByCol.set(col.id, this._cardsForColumn(col));

    const developers = this._uniqueValues((c) => c.developer);
    const epics = this._uniqueValues((c) => c.epic);

    const swimlanes = this.swimlaneMode === 'none'
      ? [{ key: null, label: '' }]
      : (() => {
          const keys = new Set();
          for (const col of this.columns) {
            for (const card of cardsByCol.get(col.id) || []) {
              keys.add(this._swimlaneKeyForCard(card));
            }
          }
          return Array.from(keys).sort((a, b) => String(a).localeCompare(String(b))).map((k) => ({
            key: k,
            label: this.swimlaneMode === 'developer' && k && k !== '(sin developer)'
              ? this._developerLabel(k)
              : String(k)
          }));
        })();

    return html`
      <div class="board-header">
        <span class="board-title">Tablero · ${this.projectId}</span>
        <span class="board-status">${this.status || `${this.cards.length} card(s) · ${this.columns.length} columna(s) · enforceWip: ${this.enforceWip ? 'on' : 'off'}`}</span>
      </div>

      <div class="board-filters">
        <input class="board-filter board-search" type="search" placeholder="Buscar título, ID o descripción..."
          .value=${this.filterText}
          @input=${(e) => { this.filterText = e.target.value; }}
          aria-label="Buscar cards" />
        <select class="board-filter" .value=${this.filterDeveloper}
          @change=${(e) => { this.filterDeveloper = e.target.value; }}
          aria-label="Filtrar por developer">
          <option value="">Developer: todos</option>
          ${developers.map((d) => html`<option value=${d} ?selected=${this.filterDeveloper === d}>${this._developerLabel(d)}</option>`)}
        </select>
        <select class="board-filter" .value=${this.filterEpic}
          @change=${(e) => { this.filterEpic = e.target.value; }}
          aria-label="Filtrar por epic">
          <option value="">Epic: todos</option>
          ${epics.map((ep) => html`<option value=${ep} ?selected=${this.filterEpic === ep}>${ep}</option>`)}
        </select>
        <select class="board-filter" .value=${this.swimlaneMode}
          @change=${(e) => { this.swimlaneMode = e.target.value; }}
          aria-label="Modo swimlane">
          <option value="none" ?selected=${this.swimlaneMode === 'none'}>Sin swimlanes</option>
          <option value="epic" ?selected=${this.swimlaneMode === 'epic'}>Por epic</option>
          <option value="developer" ?selected=${this.swimlaneMode === 'developer'}>Por developer</option>
        </select>
        ${this.filterText || this.filterDeveloper || this.filterEpic || this.swimlaneMode !== 'none'
          ? html`<button class="board-clear" type="button"
              @click=${() => { this.filterText = ''; this.filterDeveloper = ''; this.filterEpic = ''; this.swimlaneMode = 'none'; }}
            >Limpiar filtros</button>`
          : ''}
      </div>

      ${swimlanes.map((lane) => html`
        ${lane.key !== null ? html`<div class="swimlane-header">${lane.label || '(sin valor)'}</div>` : ''}
        <div class="board-columns">
        ${this.columns.map((col) => {
          const allItems = cardsByCol.get(col.id) || [];
          const items = lane.key === null
            ? allItems
            : allItems.filter((c) => this._swimlaneKeyForCard(c) === lane.key);
          // The WIP count always reflects unfiltered reality so the user
          // doesn't think a column is empty when they're just filtered.
          const wipCount = this._allCardsForColumn(col).length;
          const wipStatus = computeWipStatus(col, wipCount);
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
                  ${wipCount}${col.wipLimit != null ? ` / ${col.wipLimit}` : ''}
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
      `)}

      <div class="board-footer">
        Drag&amp;drop entre columnas con validación de transición. Tiempo real vía onValue. Click en una card → detalle editable (Phase 4). Métricas de flujo abajo (Phase 5). Filtros y swimlanes (Phase 6).
      </div>
    `;
  }
}

if (!customElements.get('pg-board')) {
  customElements.define('pg-board', PgBoard);
}

export { ALLOWED_TRANSITIONS, isValidTransition };

import { LitElement, html, svg } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { pgFlowMetricsStyles } from './pg-flow-metrics-styles.js';
import { database, ref, onValue } from '../../firebase-config.js';
import { loadColumnsForProject } from '../services/board-config-service.js';
import {
  avgActiveWip,
  peakActiveWip,
  throughputPerPeriod,
  avgCycleTimeLittle,
  bottleneck,
  cumulativeFlowSeries
} from '/js/utils/flow-metrics.js';

/**
 * <pg-flow-metrics> — Phase 5 of the real Kanban boards epic.
 *
 * Subscribes to /projects/{projectId}/board/snapshots and renders a
 * stacked Cumulative Flow Diagram, plus KPIs for throughput, cycle time
 * (Little's law), WIP avg/peak and the bottleneck column. SVG is built
 * with Lit's svg`` tagged template — html`` would not produce the right
 * namespace.
 *
 * Exclusion of "backlog/buffer/done" columns is derived from the column
 * config: any column whose name matches /backlog|ready|done|validated/i
 * is excluded; the user can tune this later if needed.
 */
const PALETTE = [
  '#4a9eff', '#ec3e95', '#10b981', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#f43f5e', '#6366f1',
  '#84cc16', '#eab308'
];

function isExcludedColumn(col) {
  if (!col) return true;
  const name = (col.name || col.id || '').toLowerCase();
  return /backlog|ready|done|validated/.test(name);
}

function formatNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits);
}

export class PgFlowMetrics extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id', reflect: true },
      columns: { state: true },
      snapshots: { state: true },
      status: { state: true }
    };
  }

  static get styles() {
    return [pgFlowMetricsStyles];
  }

  constructor() {
    super();
    this.projectId = window.currentProjectId || document.body?.dataset?.projectId || '';
    this.columns = [];
    this.snapshots = [];
    this.status = '';
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
    this._teardown();
    super.disconnectedCallback();
  }

  _teardown() {
    for (const fn of this._unsubscribers) {
      try { fn(); } catch { /* noop */ }
    }
    this._unsubscribers = [];
  }

  async _load() {
    this._teardown();
    if (!this.projectId) {
      this.snapshots = [];
      this.columns = [];
      return;
    }
    this.status = 'Cargando snapshots...';
    try {
      this.columns = await loadColumnsForProject(this.projectId);
    } catch {
      this.columns = [];
    }
    const snapsRef = ref(database, `/projects/${this.projectId}/board/snapshots`);
    const unsub = onValue(snapsRef, (snap) => {
      const val = snap.val() || {};
      this.snapshots = Object.values(val).filter(Boolean);
      this.status = '';
    }, () => { this.status = ''; });
    this._unsubscribers.push(unsub);
  }

  _excludedIds() {
    return new Set(this.columns.filter(isExcludedColumn).map((c) => c.id));
  }

  _renderCfd() {
    const cols = (this.columns || []).slice().sort((a, b) => a.order - b.order);
    const series = cumulativeFlowSeries(this.snapshots, cols.map((c) => c.id));
    if (!series.length || !cols.length) {
      return html`<div class="empty">Aún no hay snapshots para este proyecto.</div>`;
    }

    const W = 480, H = 160, P = 24;
    const innerW = W - P * 2;
    const innerH = H - P * 2;
    const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0));
    const maxTotal = Math.max(1, ...totals);
    const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

    // Build stacked paths bottom-up
    const cumStacks = series.map((s) => {
      const out = new Array(s.values.length).fill(0);
      let acc = 0;
      for (let i = 0; i < s.values.length; i++) {
        acc += s.values[i];
        out[i] = acc;
      }
      return out;
    });

    const polygons = cols.map((col, idx) => {
      const topPoints = series.map((_, i) => {
        const x = P + i * stepX;
        const y = H - P - (cumStacks[i][idx] / maxTotal) * innerH;
        return `${x},${y}`;
      });
      const bottomPoints = series.map((_, i) => {
        const below = idx === 0 ? 0 : cumStacks[i][idx - 1];
        const x = P + i * stepX;
        const y = H - P - (below / maxTotal) * innerH;
        return `${x},${y}`;
      }).reverse();
      const points = [...topPoints, ...bottomPoints].join(' ');
      const color = PALETTE[idx % PALETTE.length];
      return svg`<polygon points=${points} fill=${color} fill-opacity="0.55" stroke=${color} stroke-width="1"></polygon>`;
    });

    return html`
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative Flow Diagram">
        <rect x="0" y="0" width=${W} height=${H} fill="transparent"></rect>
        ${polygons}
      </svg>
      <div class="legend">
        ${cols.map((col, i) => html`
          <span><span class="swatch" style="background:${PALETTE[i % PALETTE.length]}"></span>${col.name}</span>
        `)}
      </div>
    `;
  }

  _renderThroughput() {
    const series = cumulativeFlowSeries(this.snapshots, []);
    if (!series.length) return html`<div class="empty">Sin datos de throughput.</div>`;
    const W = 480, H = 160, P = 24;
    const innerW = W - P * 2, innerH = H - P * 2;
    const dones = series.map((s) => s.done);
    const max = Math.max(1, ...dones);
    const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;
    const points = dones.map((v, i) => `${P + i * stepX},${H - P - (v / max) * innerH}`).join(' ');
    const dots = dones.map((v, i) => {
      const x = P + i * stepX;
      const y = H - P - (v / max) * innerH;
      return svg`<circle cx=${x} cy=${y} r="3" fill="var(--brand-primary, #4a9eff)"></circle>`;
    });
    return html`
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Throughput acumulado">
        <polyline points=${points} fill="none" stroke="var(--brand-primary, #4a9eff)" stroke-width="2"></polyline>
        ${dots}
      </svg>
    `;
  }

  render() {
    if (!this.projectId) {
      return html`<div class="empty">Selecciona un proyecto para ver sus métricas.</div>`;
    }
    const excluded = this._excludedIds();
    const wipAvg = avgActiveWip(this.snapshots, excluded);
    const wipPeak = peakActiveWip(this.snapshots, excluded);
    const tp = throughputPerPeriod(this.snapshots);
    const ct = avgCycleTimeLittle(this.snapshots, excluded);
    const bn = bottleneck(this.snapshots, excluded);
    const bnCol = bn ? this.columns.find((c) => c.id === bn.colId) : null;

    return html`
      <div class="header">
        <h3>Métricas de flujo</h3>
        <span class="status">${this.status || `${this.snapshots.length} snapshot(s) · cols activas: ${this.columns.length - excluded.size}`}</span>
      </div>

      <div class="kpis">
        <div class="kpi">
          <div class="kpi-label">WIP medio activo</div>
          <div class="kpi-value">${formatNumber(wipAvg, 2)}</div>
          <div class="kpi-foot">Excluye backlog/done</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">WIP pico</div>
          <div class="kpi-value">${formatNumber(wipPeak, 0)}</div>
          <div class="kpi-foot">Pico en una sola snapshot</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Throughput / periodo</div>
          <div class="kpi-value">${formatNumber(tp, 2)}</div>
          <div class="kpi-foot">Cards completadas / snapshot</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Cycle time (Little)</div>
          <div class="kpi-value">${formatNumber(ct, 2)}</div>
          <div class="kpi-foot">WIP / throughput</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Cuello de botella</div>
          <div class="kpi-value">${bnCol ? bnCol.name : (bn ? bn.colId : '—')}</div>
          <div class="kpi-foot">${bn ? `media ${formatNumber(bn.avg, 2)}` : 'Sin datos'}</div>
        </div>
      </div>

      <div class="charts">
        <div class="chart-card">
          <h4>Cumulative Flow Diagram</h4>
          ${this._renderCfd()}
        </div>
        <div class="chart-card">
          <h4>Throughput acumulado</h4>
          ${this._renderThroughput()}
        </div>
      </div>
    `;
  }
}

if (!customElements.get('pg-flow-metrics')) {
  customElements.define('pg-flow-metrics', PgFlowMetrics);
}

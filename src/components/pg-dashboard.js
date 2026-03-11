/**
 * Dashboard component with multi-project metrics.
 * Renders summary cards, burndown, velocity, distribution,
 * and developer workload charts.
 *
 * @element pg-dashboard
 * @property {Array} projects - Project list
 * @property {Array} cards - Card list (all types, all projects)
 * @property {string} selectedProject - Filter by project ID (empty = all)
 * @property {number} selectedYear - Filter by year
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-chart.js';
import './pg-select.js';

class PgDashboard extends LitElement {
  static properties = {
    projects: { type: Array },
    cards: { type: Array },
    selectedProject: { type: String, attribute: 'selected-project' },
    selectedYear: { type: Number, attribute: 'selected-year' },
  };

  static styles = css`
    :host {
      display: block;
    }

    .dashboard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xl, 1.5rem);
      gap: var(--space-md, 0.75rem);
      flex-wrap: wrap;
    }

    .dashboard-filters {
      display: flex;
      gap: var(--space-md, 0.75rem);
      align-items: center;
    }

    .dashboard-filters pg-select {
      min-width: 10rem;
    }

    /* Summary cards */
    .summary-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: var(--space-md, 0.75rem);
      margin-bottom: var(--space-xl, 1.5rem);
    }

    .summary-card {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-lg, 1rem);
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 0.125rem);
    }

    .summary-label {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
    }

    .summary-value {
      font-size: 1.5rem;
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text, #0f172a);
      line-height: 1.2;
    }

    .summary-trend {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-medium, 500);
    }

    .trend-up { color: var(--color-success, #16a34a); }
    .trend-down { color: var(--color-error, #dc2626); }
    .trend-neutral { color: var(--color-text-muted, #94a3b8); }

    /* Chart grid */
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
      gap: var(--space-lg, 1rem);
    }

    .chart-panel {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-lg, 1rem);
    }

    .chart-panel-title {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      margin-bottom: var(--space-md, 0.75rem);
    }

    .empty-dashboard {
      text-align: center;
      padding: var(--space-3xl, 3rem);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }

    @media (max-width: 640px) {
      .summary-row {
        grid-template-columns: repeat(2, 1fr);
      }
      .chart-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  constructor() {
    super();
    /** @type {Array<import('../lib/types.d.ts').Project & { id: string }>} */
    this.projects = [];
    /** @type {import('../lib/types.d.ts').Card[]} */
    this.cards = [];
    /** @type {string} */
    this.selectedProject = '';
    /** @type {number} */
    this.selectedYear = new Date().getFullYear();
  }

  /** @returns {import('../lib/types.d.ts').Card[]} */
  get _filteredCards() {
    let result = this.cards;
    if (this.selectedYear) {
      result = result.filter((c) => c.year === this.selectedYear);
    }
    return result;
  }

  /** @returns {import('../lib/types.d.ts').Card[]} */
  get _tasks() {
    return this._filteredCards.filter((c) => c.type === 'task');
  }

  get _summary() {
    const tasks = this._tasks;
    const total = tasks.length;
    const inProgress = tasks.filter((c) => c.status === 'In Progress').length;
    const completed = tasks.filter((c) => c.status === 'Done' || c.status === 'Done&Validated').length;
    const blocked = tasks.filter((c) => c.status === 'Blocked').length;
    return { total, inProgress, completed, blocked };
  }

  /** @returns {import('./pg-chart.js').ChartData} */
  get _statusDistribution() {
    const tasks = this._tasks;
    /** @type {Record<string, number>} */
    const counts = {};
    for (const c of tasks) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return {
      labels: Object.keys(counts),
      datasets: [{ values: Object.values(counts) }],
    };
  }

  /** @returns {import('./pg-chart.js').ChartData} */
  get _typeDistribution() {
    const cards = this._filteredCards;
    /** @type {Record<string, number>} */
    const counts = {};
    for (const c of cards) {
      counts[c.type] = (counts[c.type] ?? 0) + 1;
    }
    return {
      labels: Object.keys(counts),
      datasets: [{ values: Object.values(counts) }],
    };
  }

  /** @returns {import('./pg-chart.js').ChartData} */
  get _velocityData() {
    const tasks = this._tasks;
    /** @type {Map<string, number>} */
    const sprintPoints = new Map();
    for (const c of tasks) {
      const task = /** @type {import('../lib/types.d.ts').Task} */ (c);
      if (task.status !== 'Done' && task.status !== 'Done&Validated') continue;
      const sprint = task.sprint ?? 'No Sprint';
      sprintPoints.set(sprint, (sprintPoints.get(sprint) ?? 0) + (task.devPoints ?? 0));
    }

    const sorted = [...sprintPoints.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels: sorted.map(([s]) => s),
      datasets: [{ label: 'Completed Points', values: sorted.map(([, v]) => v), color: '#16a34a' }],
    };
  }

  /** @returns {import('./pg-chart.js').ChartData} */
  get _workloadData() {
    const tasks = this._tasks.filter((c) =>
      c.status === 'To Do' || c.status === 'In Progress' || c.status === 'Blocked'
    );
    /** @type {Map<string, number>} */
    const devCounts = new Map();
    for (const c of tasks) {
      const task = /** @type {import('../lib/types.d.ts').Task} */ (c);
      const dev = task.developer?.name ?? 'Unassigned';
      devCounts.set(dev, (devCounts.get(dev) ?? 0) + 1);
    }
    const sorted = [...devCounts.entries()].sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([d]) => d),
      datasets: [{ label: 'Active Tasks', values: sorted.map(([, v]) => v), color: '#4f46e5' }],
    };
  }

  /** @returns {import('./pg-chart.js').ChartData} */
  get _burndownData() {
    const tasks = this._tasks;
    const sprints = this._filteredCards
      .filter((c) => c.type === 'sprint')
      .sort((a, b) => {
        const aDate = a.startDate?.toDate ? a.startDate.toDate() : new Date(a.startDate ?? 0);
        const bDate = b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate ?? 0);
        return aDate.getTime() - bDate.getTime();
      });

    if (sprints.length === 0) {
      return { labels: [], datasets: [] };
    }

    const totalPoints = tasks.reduce((sum, c) => {
      const task = /** @type {import('../lib/types.d.ts').Task} */ (c);
      return sum + (task.devPoints ?? 0);
    }, 0);

    const labels = sprints.map((s) => s.cardId);
    let remaining = totalPoints;
    const remainingValues = [];
    for (const sprint of sprints) {
      const done = tasks.filter((c) => {
        const task = /** @type {import('../lib/types.d.ts').Task} */ (c);
        return task.sprint === sprint.cardId && (task.status === 'Done' || task.status === 'Done&Validated');
      }).reduce((sum, c) => {
        const task = /** @type {import('../lib/types.d.ts').Task} */ (c);
        return sum + (task.devPoints ?? 0);
      }, 0);
      remaining -= done;
      remainingValues.push(remaining);
    }

    return {
      labels,
      datasets: [{ label: 'Points Remaining', values: remainingValues, color: '#dc2626', fill: true }],
    };
  }

  /** @returns {Array<{value: string, label: string}>} */
  get _projectOptions() {
    return [
      { value: '', label: 'All Projects' },
      ...this.projects.map((p) => ({ value: p.id, label: p.name })),
    ];
  }

  render() {
    if (!this.cards.length && !this.projects.length) {
      return html`<div class="empty-dashboard">No data available. Load projects and cards first.</div>`;
    }

    const s = this._summary;

    return html`
      <div class="dashboard-header">
        <div class="dashboard-filters">
          <pg-select
            .options=${this._projectOptions}
            .value=${this.selectedProject}
            placeholder="All Projects"
            @change=${(/** @type {CustomEvent} */ e) => { this.selectedProject = e.detail.value; }}
          ></pg-select>
        </div>
      </div>

      <div class="summary-row">
        <div class="summary-card">
          <span class="summary-label">Total Tasks</span>
          <span class="summary-value">${s.total}</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">In Progress</span>
          <span class="summary-value">${s.inProgress}</span>
          ${s.inProgress > 0 ? html`<span class="summary-trend trend-up">${Math.round(s.inProgress / s.total * 100)}% active</span>` : nothing}
        </div>
        <div class="summary-card">
          <span class="summary-label">Completed</span>
          <span class="summary-value">${s.completed}</span>
          ${s.total > 0 ? html`<span class="summary-trend trend-up">${Math.round(s.completed / s.total * 100)}% done</span>` : nothing}
        </div>
        <div class="summary-card">
          <span class="summary-label">Blocked</span>
          <span class="summary-value">${s.blocked}</span>
          ${s.blocked > 0 ? html`<span class="summary-trend trend-down">${s.blocked} blocked</span>` : nothing}
        </div>
      </div>

      <div class="chart-grid">
        ${this._burndownData.labels.length > 0 ? html`
          <div class="chart-panel">
            <div class="chart-panel-title">Burndown</div>
            <pg-chart type="line" .data=${this._burndownData} .options=${{ aspectRatio: 2 }}></pg-chart>
          </div>
        ` : nothing}

        ${this._velocityData.labels.length > 0 ? html`
          <div class="chart-panel">
            <div class="chart-panel-title">Velocity per Sprint</div>
            <pg-chart type="bar" .data=${this._velocityData} .options=${{ aspectRatio: 2 }}></pg-chart>
          </div>
        ` : nothing}

        <div class="chart-panel">
          <div class="chart-panel-title">Status Distribution</div>
          <pg-chart type="doughnut" .data=${this._statusDistribution} .options=${{ aspectRatio: 1.4 }}></pg-chart>
        </div>

        <div class="chart-panel">
          <div class="chart-panel-title">Card Types</div>
          <pg-chart type="bar" .data=${this._typeDistribution} .options=${{ aspectRatio: 2 }}></pg-chart>
        </div>

        ${this._workloadData.labels.length > 0 ? html`
          <div class="chart-panel">
            <div class="chart-panel-title">Developer Workload</div>
            <pg-chart type="bar" .data=${this._workloadData} .options=${{ horizontal: true, aspectRatio: 1.6 }}></pg-chart>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('pg-dashboard', PgDashboard);

export { PgDashboard };

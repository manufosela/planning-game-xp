/**
 * Canvas-based chart component.
 * Supports bar, line, pie, and doughnut chart types.
 * Uses design tokens for colors and responsive resize.
 *
 * @element pg-chart
 * @property {'bar'|'line'|'pie'|'doughnut'} type - Chart type
 * @property {ChartData} data - Chart data
 * @property {ChartOptions} options - Chart display options
 */

/**
 * @typedef {{ labels: string[], datasets: ChartDataset[] }} ChartData
 * @typedef {{ label?: string, values: number[], color?: string, fill?: boolean }} ChartDataset
 * @typedef {{ title?: string, horizontal?: boolean, showLegend?: boolean, showTooltip?: boolean, aspectRatio?: number }} ChartOptions
 */

import { LitElement, html, css } from 'lit';

/** Default palette derived from design token hues */
const PALETTE = [
  '#4f46e5', // indigo-600
  '#3b82f6', // blue-500
  '#16a34a', // green-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#9333ea', // purple-600
  '#0891b2', // cyan-600
  '#0d9488', // teal-600
  '#c2410c', // orange-700
  '#64748b', // slate-500
];

/**
 * Pure-logic helpers for chart data processing.
 * Exported for unit testing.
 */

/**
 * Compute percentage slices from a single-dataset values array.
 * @param {number[]} values
 * @returns {{ value: number, pct: number, startAngle: number, endAngle: number }[]}
 */
export function computeSlices(values) {
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return values.map(() => ({ value: 0, pct: 0, startAngle: 0, endAngle: 0 }));

  let angle = -Math.PI / 2;
  return values.map((v) => {
    const pct = v / total;
    const start = angle;
    const sweep = pct * Math.PI * 2;
    angle += sweep;
    return { value: v, pct, startAngle: start, endAngle: start + sweep };
  });
}

/**
 * Compute the scale max (rounded up to a nice number).
 * @param {number} max
 * @returns {number}
 */
export function niceMax(max) {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const residual = max / magnitude;
  if (residual <= 1) return magnitude;
  if (residual <= 2) return 2 * magnitude;
  if (residual <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Normalize a flat values array to 0..1 range based on a max value.
 * @param {number[]} values
 * @param {number} max
 * @returns {number[]}
 */
export function normalizeValues(values, max) {
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => v / max);
}

class PgChart extends LitElement {
  static properties = {
    type: { type: String },
    data: { type: Object },
    options: { type: Object },
    _tooltipText: { state: true },
    _tooltipX: { state: true },
    _tooltipY: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      position: relative;
      min-height: 12rem;
    }

    .chart-wrapper {
      position: relative;
      width: 100%;
    }

    canvas {
      display: block;
      width: 100%;
      height: auto;
    }

    .chart-title {
      font-size: 0.75rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      margin-bottom: var(--space-sm, 0.5rem);
    }

    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm, 0.5rem);
      margin-top: var(--space-sm, 0.5rem);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: var(--space-2xs, 0.125rem);
      font-size: 0.6875rem;
      color: var(--color-text-secondary, #64748b);
    }

    .legend-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-full, 9999px);
      flex-shrink: 0;
    }

    .tooltip {
      position: absolute;
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-sm, 0.25rem);
      box-shadow: var(--shadow-md);
      padding: var(--space-2xs, 0.125rem) var(--space-sm, 0.5rem);
      font-size: 0.6875rem;
      color: var(--color-text, #0f172a);
      pointer-events: none;
      white-space: nowrap;
      z-index: 10;
      transform: translate(-50%, -100%);
      margin-top: -0.5rem;
    }
  `;

  constructor() {
    super();
    /** @type {'bar'|'line'|'pie'|'doughnut'} */
    this.type = 'bar';
    /** @type {ChartData | null} */
    this.data = null;
    /** @type {ChartOptions} */
    this.options = {};
    /** @type {string} */
    this._tooltipText = '';
    /** @type {number} */
    this._tooltipX = 0;
    /** @type {number} */
    this._tooltipY = 0;

    this._resizeObserver = new ResizeObserver(() => this._draw());
  }

  connectedCallback() {
    super.connectedCallback();
    this.updateComplete.then(() => {
      const canvas = this.shadowRoot?.querySelector('canvas');
      if (canvas) this._resizeObserver.observe(canvas.parentElement);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver.disconnect();
  }

  updated() {
    this._draw();
  }

  /** @returns {string} */
  _getColor(index) {
    return PALETTE[index % PALETTE.length];
  }

  _draw() {
    const canvas = /** @type {HTMLCanvasElement | null} */ (this.shadowRoot?.querySelector('canvas'));
    if (!canvas || !this.data) return;

    const wrapper = canvas.parentElement;
    const w = wrapper.clientWidth;
    const ratio = this.options.aspectRatio ?? 1.8;
    const h = Math.max(Math.round(w / ratio), 160);

    const dpr = globalThis.devicePixelRatio ?? 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    switch (this.type) {
      case 'bar': this._drawBar(ctx, w, h); break;
      case 'line': this._drawLine(ctx, w, h); break;
      case 'pie': this._drawPie(ctx, w, h, false); break;
      case 'doughnut': this._drawPie(ctx, w, h, true); break;
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _drawBar(ctx, w, h) {
    const { labels, datasets } = this.data;
    if (!labels?.length || !datasets?.length) return;

    const horizontal = this.options.horizontal ?? false;
    const pad = { top: 10, right: 20, bottom: 30, left: horizontal ? 80 : 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const allVals = datasets.flatMap((d) => d.values);
    const max = niceMax(Math.max(...allVals, 0));

    ctx.font = '10px Inter, sans-serif';
    ctx.textBaseline = 'middle';

    // Grid lines
    const gridSteps = 5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSteps; i++) {
      const frac = i / gridSteps;
      if (horizontal) {
        const x = pad.left + frac * chartW;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + chartH);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.round(max * frac)), x, h - 8);
      } else {
        const y = pad.top + chartH - frac * chartH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(max * frac)), pad.left - 6, y);
      }
    }

    const numGroups = labels.length;
    const numSets = datasets.length;

    if (horizontal) {
      const groupH = chartH / numGroups;
      const barH = Math.min(groupH * 0.6 / numSets, 20);

      for (let g = 0; g < numGroups; g++) {
        const groupCenter = pad.top + (g + 0.5) * groupH;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const lbl = labels[g].length > 10 ? labels[g].slice(0, 10) + '..' : labels[g];
        ctx.fillText(lbl, pad.left - 6, groupCenter);

        for (let s = 0; s < numSets; s++) {
          const val = datasets[s].values[g] ?? 0;
          const barW = (val / max) * chartW;
          const y = groupCenter - (numSets * barH) / 2 + s * barH;
          ctx.fillStyle = datasets[s].color ?? this._getColor(s);
          ctx.beginPath();
          ctx.roundRect(pad.left, y, barW, barH - 1, 2);
          ctx.fill();
        }
      }
    } else {
      const groupW = chartW / numGroups;
      const barW = Math.min(groupW * 0.6 / numSets, 30);

      for (let g = 0; g < numGroups; g++) {
        const groupCenter = pad.left + (g + 0.5) * groupW;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const lbl = labels[g].length > 8 ? labels[g].slice(0, 8) + '..' : labels[g];
        ctx.fillText(lbl, groupCenter, pad.top + chartH + 6);

        for (let s = 0; s < numSets; s++) {
          const val = datasets[s].values[g] ?? 0;
          const barH = (val / max) * chartH;
          const x = groupCenter - (numSets * barW) / 2 + s * barW;
          const y = pad.top + chartH - barH;
          ctx.fillStyle = datasets[s].color ?? this._getColor(s);
          ctx.beginPath();
          ctx.roundRect(x, y, barW - 1, barH, 2);
          ctx.fill();
        }
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _drawLine(ctx, w, h) {
    const { labels, datasets } = this.data;
    if (!labels?.length || !datasets?.length) return;

    const pad = { top: 10, right: 20, bottom: 30, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const allVals = datasets.flatMap((d) => d.values);
    const max = niceMax(Math.max(...allVals, 0));

    ctx.font = '10px Inter, sans-serif';

    // Grid
    const gridSteps = 5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSteps; i++) {
      const frac = i / gridSteps;
      const y = pad.top + chartH - frac * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(max * frac)), pad.left - 6, y);
    }

    // X labels
    const numPts = labels.length;
    for (let i = 0; i < numPts; i++) {
      const x = numPts === 1 ? pad.left + chartW / 2 : pad.left + (i / (numPts - 1)) * chartW;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const lbl = labels[i].length > 8 ? labels[i].slice(0, 8) + '..' : labels[i];
      ctx.fillText(lbl, x, pad.top + chartH + 6);
    }

    // Lines
    for (let s = 0; s < datasets.length; s++) {
      const ds = datasets[s];
      const color = ds.color ?? this._getColor(s);
      const norms = normalizeValues(ds.values, max);

      // Area fill
      if (ds.fill) {
        ctx.fillStyle = color + '1a'; // ~10% opacity
        ctx.beginPath();
        for (let i = 0; i < numPts; i++) {
          const x = numPts === 1 ? pad.left + chartW / 2 : pad.left + (i / (numPts - 1)) * chartW;
          const y = pad.top + chartH - norms[i] * chartH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(pad.left + chartW, pad.top + chartH);
        ctx.lineTo(pad.left, pad.top + chartH);
        ctx.closePath();
        ctx.fill();
      }

      // Line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const x = numPts === 1 ? pad.left + chartW / 2 : pad.left + (i / (numPts - 1)) * chartW;
        const y = pad.top + chartH - norms[i] * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Points
      ctx.fillStyle = color;
      for (let i = 0; i < numPts; i++) {
        const x = numPts === 1 ? pad.left + chartW / 2 : pad.left + (i / (numPts - 1)) * chartW;
        const y = pad.top + chartH - norms[i] * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {boolean} isDoughnut
   */
  _drawPie(ctx, w, h, isDoughnut) {
    const { labels, datasets } = this.data;
    if (!labels?.length || !datasets?.length) return;

    const values = datasets[0].values;
    const slices = computeSlices(values);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 20;
    const innerR = isDoughnut ? r * 0.55 : 0;

    for (let i = 0; i < slices.length; i++) {
      const { startAngle, endAngle } = slices[i];
      ctx.fillStyle = this._getColor(i);
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(startAngle), cy + innerR * Math.sin(startAngle));
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fill();

      // Label
      if (slices[i].pct > 0.05) {
        const midAngle = (startAngle + endAngle) / 2;
        const labelR = (r + innerR) / 2;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(slices[i].pct * 100)}%`, lx, ly);
      }
    }

    // Center text for doughnut
    if (isDoughnut) {
      const total = values.reduce((s, v) => s + v, 0);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(total), cx, cy - 6);
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Total', cx, cy + 10);
    }
  }

  /** @param {MouseEvent} e */
  _onMouseMove(e) {
    if (!(this.options.showTooltip ?? true)) return;
    if (!this.data) return;

    const canvas = /** @type {HTMLCanvasElement} */ (e.target);
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const tooltip = this._getTooltipAtPoint(mx, my, canvas.clientWidth, canvas.clientHeight);
    if (tooltip) {
      this._tooltipText = tooltip.text;
      this._tooltipX = mx;
      this._tooltipY = my;
    } else {
      this._tooltipText = '';
    }
  }

  _onMouseLeave() {
    this._tooltipText = '';
  }

  /**
   * @param {number} mx
   * @param {number} my
   * @param {number} w
   * @param {number} h
   * @returns {{ text: string } | null}
   */
  _getTooltipAtPoint(mx, my, w, h) {
    if (!this.data?.labels?.length) return null;

    if (this.type === 'pie' || this.type === 'doughnut') {
      const cx = w / 2;
      const cy = h / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const r = Math.min(cx, cy) - 20;
      const innerR = this.type === 'doughnut' ? r * 0.55 : 0;
      if (dist > r || dist < innerR) return null;

      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;

      const slices = computeSlices(this.data.datasets[0].values);
      for (let i = 0; i < slices.length; i++) {
        if (angle >= slices[i].startAngle && angle < slices[i].endAngle) {
          return { text: `${this.data.labels[i]}: ${slices[i].value} (${Math.round(slices[i].pct * 100)}%)` };
        }
      }
    }

    if (this.type === 'bar' || this.type === 'line') {
      const pad = { left: this.options.horizontal ? 80 : 40, right: 20, top: 10, bottom: 30 };
      const chartW = w - pad.left - pad.right;
      const numLabels = this.data.labels.length;
      if (mx < pad.left || mx > w - pad.right) return null;

      const idx = Math.round(((mx - pad.left) / chartW) * (numLabels - 1));
      if (idx < 0 || idx >= numLabels) return null;

      const parts = this.data.datasets.map((ds) =>
        `${ds.label ?? ''}: ${ds.values[idx] ?? 0}`
      ).join(', ');
      return { text: `${this.data.labels[idx]} - ${parts}` };
    }

    return null;
  }

  /** @returns {Array<{label: string, color: string}>} */
  get _legendItems() {
    if (!this.data) return [];
    if (this.type === 'pie' || this.type === 'doughnut') {
      return (this.data.labels ?? []).map((l, i) => ({ label: l, color: this._getColor(i) }));
    }
    return (this.data.datasets ?? []).map((ds, i) => ({
      label: ds.label ?? `Series ${i + 1}`,
      color: ds.color ?? this._getColor(i),
    }));
  }

  render() {
    const showLegend = this.options.showLegend ?? true;

    return html`
      ${this.options.title ? html`<div class="chart-title">${this.options.title}</div>` : ''}
      <div class="chart-wrapper">
        <canvas
          @mousemove=${this._onMouseMove}
          @mouseleave=${this._onMouseLeave}
        ></canvas>
        ${this._tooltipText ? html`
          <div class="tooltip" style="left:${this._tooltipX}px;top:${this._tooltipY}px">
            ${this._tooltipText}
          </div>
        ` : ''}
      </div>
      ${showLegend ? html`
        <div class="chart-legend">
          ${this._legendItems.map((item) => html`
            <div class="legend-item">
              <span class="legend-dot" style="background:${item.color}"></span>
              ${item.label}
            </div>
          `)}
        </div>
      ` : ''}
    `;
  }
}

customElements.define('pg-chart', PgChart);

export { PgChart };

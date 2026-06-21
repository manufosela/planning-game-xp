import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';

export const pgFlowMetricsStyles = css`
  :host { display: block; font-family: 'Inter', system-ui, sans-serif; }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary, #0f172a);
  }

  .status {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .kpi {
    background: var(--bg-secondary, #f1f5f9);
    border-top: 3px solid var(--brand-primary, #4a9eff);
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
  }
  .kpi-label {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #64748b);
  }
  .kpi-value {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary, #0f172a);
    line-height: 1.1;
    margin-top: 0.15rem;
  }
  .kpi-foot {
    font-size: 0.62rem;
    color: var(--text-muted, #64748b);
    margin-top: 0.1rem;
  }

  .charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 0.5rem;
  }

  .chart-card {
    background: var(--bg-secondary, #f8fafc);
    border: 1px solid var(--border-subtle, #e2e8f0);
    border-radius: 6px;
    padding: 0.5rem 0.6rem 0.4rem;
  }
  .chart-card h4 {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary, #475569);
  }

  svg.chart {
    width: 100%;
    height: 160px;
    display: block;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.65rem;
    color: var(--text-muted, #64748b);
    margin-top: 0.25rem;
  }
  .legend .swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 0.2rem;
    vertical-align: middle;
  }

  .empty {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted, #94a3b8);
    font-size: 0.85rem;
  }
`;

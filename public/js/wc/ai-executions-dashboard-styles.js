import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const aiExecutionsDashboardStyles = css`
  :host {
    display: block;
    font-family: var(--font-family, sans-serif);
  }

  .dashboard {
    padding: 1rem;
  }

  .dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .dashboard-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary, #333);
  }

  .stats-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .stat-card {
    flex: 1;
    min-width: 120px;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: var(--bg-secondary, #f8f9fa);
    border: 1px solid var(--border-color, #e0e0e0);
    text-align: center;
  }

  .stat-card .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary, #333);
  }

  .stat-card .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    text-transform: uppercase;
    margin-top: 0.25rem;
  }

  .stat-card.running .stat-value { color: #007bff; }
  .stat-card.completed .stat-value { color: #28a745; }
  .stat-card.failed .stat-value { color: #dc3545; }
  .stat-card.cancelled .stat-value { color: #6c757d; }

  .section-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary, #333);
    margin: 1rem 0 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .executions-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .execution-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: var(--bg-secondary, #f8f9fa);
    border: 1px solid var(--border-color, #e0e0e0);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .execution-row:hover {
    background: var(--bg-hover, #e9ecef);
  }

  .execution-row .card-id {
    font-weight: 600;
    color: var(--text-primary, #333);
    white-space: nowrap;
  }

  .execution-row .title {
    color: var(--text-secondary, #666);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .execution-row .phase {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    white-space: nowrap;
  }

  .execution-row .time {
    font-size: 0.75rem;
    color: var(--text-tertiary, #999);
    white-space: nowrap;
  }

  .status-badge {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .status-badge.queued { background: #fff3cd; color: #856404; }
  .status-badge.running { background: #cce5ff; color: #004085; }
  .status-badge.completed { background: #d4edda; color: #155724; }
  .status-badge.failed { background: #f8d7da; color: #721c24; }
  .status-badge.cancelled { background: #e2e3e5; color: #383d41; }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-secondary, #666);
    font-size: 0.9rem;
  }

  .refresh-btn {
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--border-color, #ccc);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .refresh-btn:hover {
    background: var(--bg-hover, #f5f5f5);
  }

  .not-available {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-secondary, #666);
  }

  .not-available p {
    margin: 0.5rem 0;
  }
`;

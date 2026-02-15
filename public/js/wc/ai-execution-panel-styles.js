import { css } from 'lit';

export const aiExecutionPanelStyles = css`
  :host {
    display: block;
    font-family: var(--font-family, sans-serif);
  }

  .execution-panel {
    padding: 1rem;
    min-width: 400px;
    max-width: 600px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary, #333);
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-badge.queued { background: #fff3cd; color: #856404; }
  .status-badge.running { background: #cce5ff; color: #004085; }
  .status-badge.completed { background: #d4edda; color: #155724; }
  .status-badge.failed { background: #f8d7da; color: #721c24; }
  .status-badge.cancelled { background: #e2e3e5; color: #383d41; }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
  }

  .info-row .label { font-weight: 500; }

  .timeline {
    margin: 1rem 0;
    padding: 0;
    list-style: none;
  }

  .timeline-item {
    position: relative;
    padding: 0.5rem 0 0.5rem 2rem;
    border-left: 2px solid var(--border-color, #e0e0e0);
  }

  .timeline-item::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 0.75rem;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--border-color, #e0e0e0);
  }

  .timeline-item.completed::before { background: #28a745; }
  .timeline-item.running::before { background: #007bff; animation: pulse 1.5s infinite; }
  .timeline-item.failed::before { background: #dc3545; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .timeline-item .stage {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-primary, #333);
  }

  .timeline-item .summary {
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    margin-top: 0.25rem;
  }

  .timeline-item .timestamp {
    font-size: 0.7rem;
    color: var(--text-tertiary, #999);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-color, #e0e0e0);
  }

  .btn {
    padding: 0.4rem 1rem;
    border: 1px solid var(--border-color, #ccc);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .btn:hover { background: var(--bg-hover, #f5f5f5); }

  .btn-danger {
    background: #dc3545;
    color: #fff;
    border-color: #dc3545;
  }

  .btn-danger:hover { background: #c82333; }

  .error-message {
    margin-top: 0.75rem;
    padding: 0.5rem;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    color: #721c24;
    font-size: 0.85rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary, #666);
  }

  .iteration-label {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    margin-top: 0.5rem;
    font-style: italic;
  }
`;

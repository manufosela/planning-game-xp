import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';

export const pgBoardConfigStyles = css`
  :host {
    display: block;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .panel {
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    overflow: hidden;
  }

  .panel-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #f1f5f9);
    border-bottom: 1px solid var(--border-default, #e2e8f0);
    font-size: 0.85rem;
  }

  .panel-status {
    color: var(--text-muted, #64748b);
    font-size: 0.78rem;
  }

  .add-btn {
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--border-default, #d1d5db);
    border-radius: 6px;
    background: var(--brand-primary, #4a9eff);
    color: var(--text-on-primary, #fff);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .add-btn:hover {
    filter: brightness(1.05);
  }

  table.cols-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  table.cols-table th,
  table.cols-table td {
    padding: 0.55rem 0.65rem;
    text-align: left;
    border-bottom: 1px solid var(--border-subtle, #e2e8f0);
    vertical-align: middle;
  }

  table.cols-table thead th {
    background: var(--bg-secondary, #f8fafc);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary, #475569);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  td.col-actions {
    text-align: right;
    white-space: nowrap;
  }

  td.col-num,
  th.col-num {
    text-align: center;
    width: 56px;
    color: var(--text-muted, #64748b);
    font-family: 'JetBrains Mono', monospace;
  }

  input.col-input {
    width: 100%;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border-default, #d1d5db);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #0f172a);
    font-size: 0.85rem;
  }

  input.col-input.short {
    width: 80px;
    text-align: right;
  }

  .row-btn {
    padding: 0.25rem 0.4rem;
    margin-left: 0.25rem;
    border: 1px solid var(--border-default, #d1d5db);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #0f172a);
    cursor: pointer;
    font-size: 0.75rem;
    line-height: 1;
  }

  .row-btn:hover {
    background: var(--bg-secondary, #f1f5f9);
  }

  .row-btn.danger {
    color: var(--color-error, #dc2626);
    border-color: var(--color-error, #dc2626);
  }

  .row-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .state-empty,
  .state-loading,
  .state-error {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted, #64748b);
    font-size: 0.9rem;
  }

  .state-error {
    color: var(--color-error, #dc2626);
  }

  .panel-footer {
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #f8fafc);
    border-top: 1px solid var(--border-default, #e2e8f0);
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    line-height: 1.5;
  }

  .panel-footer code {
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg-primary, #fff);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .warn {
    color: var(--color-warning, #d97706);
    font-weight: 600;
  }
`;

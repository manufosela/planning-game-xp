import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';

export const userPermissionsPanelStyles = css`
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
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #f1f5f9);
    border-bottom: 1px solid var(--border-default, #e2e8f0);
    font-size: 0.85rem;
  }

  .panel-toolbar input[type="search"] {
    flex: 1;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border-default, #d1d5db);
    border-radius: 6px;
    font-size: 0.85rem;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #0f172a);
  }

  .panel-status {
    color: var(--text-muted, #64748b);
    font-size: 0.78rem;
  }

  table.perm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  table.perm-table th,
  table.perm-table td {
    padding: 0.5rem 0.65rem;
    text-align: left;
    border-bottom: 1px solid var(--border-subtle, #e2e8f0);
    vertical-align: middle;
  }

  table.perm-table thead th {
    background: var(--bg-secondary, #f8fafc);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary, #475569);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  table.perm-table tbody tr:hover {
    background: var(--bg-secondary, #f8fafc);
  }

  th.col-section,
  th.col-app {
    text-align: center;
    font-size: 0.62rem;
    padding: 0.45rem 0.3rem;
    border-left: 1px solid var(--border-subtle, #e2e8f0);
    min-width: 56px;
  }

  th.col-group-section {
    background: rgba(74, 158, 255, 0.08);
  }

  th.col-group-app {
    background: rgba(236, 62, 149, 0.08);
  }

  td.col-toggle {
    text-align: center;
    border-left: 1px solid var(--border-subtle, #e2e8f0);
  }

  .user-name {
    font-weight: 600;
    color: var(--text-primary, #0f172a);
  }

  .user-email {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    margin-top: 0.1rem;
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--brand-primary, #4a9eff);
  }

  input[type="checkbox"]:disabled {
    opacity: 0.4;
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
  }

  .panel-footer code {
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg-primary, #fff);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }
`;

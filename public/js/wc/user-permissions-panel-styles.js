/**
 * Styles for UserPermissionsPanel component
 */
import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const UserPermissionsPanelStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .panel-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary, #1e293b);
  }

  .user-count {
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
  }

  /* Search */
  .search-bar {
    margin-bottom: 1rem;
  }

  .search-input {
    width: 100%;
    max-width: 400px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #d1d5db);
    border-radius: 6px;
    font-size: 0.9rem;
    outline: none;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    border-color: var(--brand-primary, #3b82f6);
  }

  /* Table */
  .permissions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .permissions-table th,
  .permissions-table td {
    padding: 0.5rem 0.6rem;
    text-align: center;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .permissions-table th {
    background: var(--bg-secondary, #f9fafb);
    color: var(--text-secondary, #666);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .permissions-table th.user-col,
  .permissions-table td.user-col {
    text-align: left;
    min-width: 200px;
  }

  .permissions-table tr:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .user-name {
    font-weight: 600;
    color: var(--text-primary, #1e293b);
  }

  .user-email {
    font-size: 0.78rem;
    color: var(--text-secondary, #94a3b8);
  }

  /* Section permissions group */
  .section-group {
    border-left: 2px solid var(--brand-primary, #3b82f6);
  }

  .app-group {
    border-left: 2px solid var(--color-warning, #f59e0b);
  }

  /* Toggle switch */
  .toggle {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    cursor: pointer;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-tertiary, #cbd5e1);
    border-radius: 10px;
    transition: background 0.2s;
  }

  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    bottom: 2px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .toggle input:checked + .toggle-slider {
    background: var(--brand-primary, #3b82f6);
  }

  .toggle input:checked + .toggle-slider::before {
    transform: translateX(16px);
  }

  .toggle input:disabled + .toggle-slider {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Buttons */
  .btn {
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 0.2s, opacity 0.2s;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn-primary {
    background: var(--brand-primary, #3b82f6);
    color: var(--text-on-primary, #fff);
  }

  .btn-secondary {
    background: var(--bg-tertiary, #e5e7eb);
    color: var(--text-primary, #333);
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }

  /* Save bar */
  .save-bar {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--bg-primary, #fff);
    border-top: 1px solid var(--border-color, #e0e0e0);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  }

  .save-bar.hidden {
    display: none;
  }

  /* Loading */
  .loading-container {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary, #94a3b8);
  }

  .spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 3px solid var(--bg-tertiary, #e5e7eb);
    border-top-color: var(--brand-primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary, #94a3b8);
  }

  /* No project */
  .no-project {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary, #94a3b8);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .permissions-table {
      font-size: 0.78rem;
    }

    .permissions-table th,
    .permissions-table td {
      padding: 0.4rem;
    }

    .toggle {
      width: 30px;
      height: 17px;
    }

    .toggle-slider::before {
      width: 13px;
      height: 13px;
    }

    .toggle input:checked + .toggle-slider::before {
      transform: translateX(13px);
    }
  }
`;

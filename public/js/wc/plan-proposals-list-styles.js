/**
 * Styles for PlanProposalsList component
 */
import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const PlanProposalsListStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .proposals-container {
    max-width: 960px;
    margin: 0 auto;
    padding: 1rem;
  }

  .proposals-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .proposals-header h2 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .proposals-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .filter-select {
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    background: var(--input-bg, white);
    color: var(--text-primary, inherit);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .filter-select:focus {
    outline: none;
    border-color: var(--brand-primary, #4a9eff);
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 1rem;
    background: var(--brand-primary, #3b82f6);
    color: var(--text-on-primary, #fff);
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-primary:hover {
    opacity: 0.85;
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 1rem;
    background: var(--bg-secondary, #e9ecef);
    color: var(--text-primary, #333);
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-secondary:hover {
    opacity: 0.85;
  }

  .btn-danger {
    background: var(--color-error, #dc3545);
    color: var(--text-on-primary, #fff);
  }

  .btn-small {
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
  }

  .btn-generate {
    background: var(--brand-secondary, #ec3e95);
    color: var(--text-on-secondary, #fff);
  }

  /* Table */
  .proposals-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.5rem;
  }

  .proposals-table th {
    text-align: left;
    padding: 0.6rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
    border-bottom: 2px solid var(--border-color, #dee2e6);
  }

  .proposals-table td {
    padding: 0.65rem 0.75rem;
    border-bottom: 1px solid var(--border-color, #dee2e6);
    font-size: 0.9rem;
    vertical-align: middle;
  }

  .proposals-table tbody tr {
    cursor: pointer;
    transition: background 0.15s;
  }

  .proposals-table tbody tr:hover {
    background: var(--bg-hover, #f8f9fa);
  }

  .title-cell {
    font-weight: 500;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .center-cell {
    text-align: center;
  }

  .date-cell {
    color: var(--text-muted, #888);
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .actions-cell {
    white-space: nowrap;
    text-align: right;
  }

  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem 0.35rem;
    border-radius: 4px;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .action-btn:hover {
    opacity: 1;
    background: var(--bg-secondary, #e9ecef);
  }

  /* Status badge */
  .status-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .status-pending {
    background: var(--text-muted, #6b7280);
    color: var(--bg-primary, white);
  }

  .status-planned {
    background: var(--brand-primary, #3b82f6);
    color: var(--text-on-primary, #fff);
  }

  .status-rejected {
    background: var(--color-error, #dc3545);
    color: var(--text-on-primary, #fff);
  }

  /* Tag */
  .tag {
    display: inline-block;
    background: var(--bg-secondary, #e9ecef);
    color: var(--text-secondary, #555);
    font-size: 0.75rem;
    padding: 0.1rem 0.45rem;
    border-radius: 10px;
    margin-right: 0.25rem;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--text-muted, #888);
  }

  .empty-state-icon {
    font-size: 3rem;
    margin-bottom: 0.75rem;
  }

  .empty-state-text {
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }

  /* Loading */
  .loading-indicator {
    display: flex;
    justify-content: center;
    padding: 2rem;
    color: var(--text-secondary, #666);
  }

  /* Form */
  .form-container {
    max-width: 720px;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .form-header h2 {
    margin: 0;
    font-size: 1.3rem;
    color: var(--text-primary, #333);
  }

  .form-field {
    margin-bottom: 1rem;
  }

  .form-field label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
    font-size: 0.9rem;
    color: var(--text-primary, #333);
  }

  .form-field input,
  .form-field textarea,
  .form-field select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default, #ced4da);
    border-radius: 6px;
    font-size: 0.95rem;
    background: var(--input-bg, var(--bg-primary, white));
    color: var(--text-primary, #333);
    box-sizing: border-box;
    font-family: inherit;
  }

  .form-field textarea {
    resize: vertical;
  }

  .form-field .char-count {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    text-align: right;
    margin-top: 0.25rem;
  }

  .form-actions {
    margin-top: 1.5rem;
    display: flex;
    gap: 0.75rem;
  }

  .tags-input-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.4rem;
    border: 1px solid var(--border-default, #ced4da);
    border-radius: 6px;
    background: var(--input-bg, var(--bg-primary, white));
    min-height: 2.2rem;
    align-items: center;
    cursor: text;
  }

  .tags-input-container:focus-within {
    border-color: var(--brand-primary, #4a9eff);
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--brand-primary, #3b82f6);
    color: var(--text-on-primary, #fff);
    font-size: 0.8rem;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
  }

  .tag-chip-remove {
    cursor: pointer;
    font-size: 0.85rem;
    opacity: 0.8;
    background: none;
    border: none;
    color: var(--text-on-primary, #fff);
    padding: 0;
    line-height: 1;
  }

  .tag-chip-remove:hover {
    opacity: 1;
  }

  .tags-text-input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.85rem;
    min-width: 100px;
    flex: 1;
    color: var(--text-primary, #333);
    padding: 0.1rem 0.25rem;
  }

  .tags-hint {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    margin-top: 0.25rem;
  }

  /* Error */
  .error-message {
    background: var(--bg-secondary, #f8f9fa);
    color: var(--color-error, #dc3545);
    padding: 0.6rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
    border-left: 4px solid var(--color-error, #dc3545);
  }
`;

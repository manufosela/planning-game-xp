import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const HoursReportTabStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .hours-report-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  /* Filters */
  .filters-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .filter-group label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-muted, #666);
  }

  .filter-input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
  }

  .btn-generate {
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    background: var(--primary-color, #4a90d9);
    color: #fff;
    transition: opacity 0.2s;
  }

  .btn-generate:hover {
    opacity: 0.85;
  }

  .btn-generate:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-export {
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--primary-color, #4a90d9);
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
    color: var(--primary-color, #4a90d9);
    transition: background 0.2s, color 0.2s;
  }

  .btn-export:hover {
    background: var(--primary-color, #4a90d9);
    color: #fff;
  }

  /* Loading */
  .loading-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem;
    justify-content: center;
    color: var(--text-muted, #666);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border-color, #ddd);
    border-top-color: var(--primary-color, #4a90d9);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Table */
  .report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    margin-top: 1rem;
  }

  .report-table th,
  .report-table td {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #ddd);
    text-align: center;
    white-space: nowrap;
  }

  .report-table th {
    background: var(--bg-tertiary, #f0f0f0);
    font-weight: 700;
    color: var(--text-primary, #333);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .report-table td:first-child,
  .report-table th:first-child {
    text-align: left;
    min-width: 160px;
  }

  .report-table td:nth-child(2),
  .report-table th:nth-child(2) {
    text-align: left;
    min-width: 120px;
  }

  /* Group header row */
  .group-header td {
    background: var(--primary-color, #4a90d9);
    color: #fff;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Category rows */
  .row-development td:nth-child(2) {
    color: var(--status-in-progress, #2196F3);
    font-weight: 600;
  }

  .row-maintenance td:nth-child(2) {
    color: var(--status-blocked, #f44336);
    font-weight: 600;
  }

  /* Subtotal rows */
  .subtotal-row td {
    background: var(--bg-secondary, #f8f8f8);
    font-weight: 700;
    border-top: 2px solid var(--border-color, #ddd);
  }

  /* Grand total rows */
  .grand-total-row td {
    background: var(--bg-tertiary, #e8e8e8);
    font-weight: 800;
    font-size: 0.9rem;
    border-top: 3px solid var(--text-primary, #333);
  }

  /* Zero values dimmed */
  .zero-value {
    color: var(--text-muted, #999);
    opacity: 0.5;
  }

  /* Developer name clickable */
  .dev-name {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .dev-name--clickable {
    cursor: pointer;
    user-select: none;
  }

  .dev-name--clickable:hover {
    color: var(--primary-color, #4a90d9);
  }

  .expand-icon {
    font-size: 0.7rem;
    width: 1em;
    display: inline-block;
  }

  /* Detail rows */
  .detail-row td {
    padding: 0;
    background: var(--bg-secondary, #f8f8f8);
  }

  .detail-container {
    padding: 0.75rem 1rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .detail-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .detail-table th {
    background: var(--bg-tertiary, #eee);
    padding: 0.35rem 0.5rem;
    text-align: left;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color, #ddd);
    position: static;
  }

  .detail-table td {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--border-color, #eee);
    text-align: left;
    white-space: normal;
  }

  .detail-card-id {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--primary-color, #4a90d9);
  }

  .detail-title {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-item--development td:nth-child(5) {
    color: var(--status-in-progress, #2196F3);
  }

  .detail-item--maintenance td:nth-child(5) {
    color: var(--status-blocked, #f44336);
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted, #666);
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  /* Dark theme */
  :host-context(.dark-theme) .filter-input {
    background: var(--bg-secondary, #2a2a2a);
    border-color: var(--border-color, #444);
    color: var(--text-primary, #eee);
  }

  :host-context(.dark-theme) .report-table th {
    background: var(--bg-tertiary, #333);
  }

  :host-context(.dark-theme) .subtotal-row td {
    background: var(--bg-secondary, #2a2a2a);
  }

  :host-context(.dark-theme) .grand-total-row td {
    background: var(--bg-tertiary, #333);
  }

  :host-context(.dark-theme) .detail-row td {
    background: var(--bg-secondary, #1e1e1e);
  }

  :host-context(.dark-theme) .detail-table th {
    background: var(--bg-tertiary, #2a2a2a);
  }
`;

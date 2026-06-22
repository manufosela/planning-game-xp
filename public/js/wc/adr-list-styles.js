/**
 * Styles for ADR List component
 */
import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const AdrListStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .adr-list-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem;
  }

  .adr-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--border-color, #e0e0e0);
  }

  .adr-list-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #333);
    margin: 0;
  }

  .adr-list-actions {
    display: flex;
    gap: 0.5rem;
  }

  .adr-filter {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, inherit);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .adr-filter:focus {
    outline: none;
    border-color: var(--color-blue-500, #4a9eff);
  }

  .btn-new-adr {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-blue-500, #4a9eff);
    color: var(--text-on-primary, #fff);
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-new-adr:hover {
    background: var(--color-blue-600, #2563eb);
  }

  .adr-list-empty {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary, #666);
  }

  .adr-list-empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .adr-list-empty-text {
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }

  .adr-stats {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .adr-stat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .adr-stat-count {
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .adr-stat-label {
    color: var(--text-secondary, #666);
  }

  /* Status pills always pair light backgrounds with dark literal text
     so they remain legible in dark mode (text-primary tokens turn light
     there). Same palette as the AdrCard status badge. */
  .adr-stat.proposed   { background: #fef3c7; }
  .adr-stat.proposed   .adr-stat-count,
  .adr-stat.proposed   .adr-stat-label { color: #92400e; }

  .adr-stat.accepted   { background: #d1fae5; }
  .adr-stat.accepted   .adr-stat-count,
  .adr-stat.accepted   .adr-stat-label { color: #065f46; }

  .adr-stat.deprecated { background: #fee2e2; }
  .adr-stat.deprecated .adr-stat-count,
  .adr-stat.deprecated .adr-stat-label { color: #991b1b; }

  .adr-stat.superseded { background: #e5e7eb; }
  .adr-stat.superseded .adr-stat-count,
  .adr-stat.superseded .adr-stat-label { color: #4b5563; }

  .loading-indicator {
    display: flex;
    justify-content: center;
    padding: 2rem;
    color: var(--text-secondary, #666);
  }
`;

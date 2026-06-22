/**
 * Styles for ADR Card component
 */
import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const AdrCardStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .adr-card {
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
    transition: box-shadow 0.2s ease;
  }

  .adr-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .adr-card.expanded {
    border-left: 4px solid var(--color-blue-500, #4a9eff);
  }

  .adr-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    cursor: pointer;
  }

  .adr-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #333);
    margin: 0;
  }

  .adr-status {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    border-radius: 16px;
    font-size: 0.85rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  .adr-status.proposed {
    background: #fef3c7;
    color: #92400e;
  }

  .adr-status.accepted {
    background: #d1fae5;
    color: #065f46;
  }

  .adr-status.deprecated {
    background: #fee2e2;
    color: #991b1b;
  }

  .adr-status.superseded {
    background: #e5e7eb;
    color: #4b5563;
  }

  .adr-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
    margin-bottom: 1rem;
  }

  .adr-section {
    margin-bottom: 1.5rem;
  }

  .adr-section-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .adr-section-content {
    color: var(--text-primary, #333);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .adr-section-content.editable {
    min-height: 100px;
    padding: 0.75rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    background: var(--bg-secondary, #f5f5f5);
  }

  textarea.adr-input {
    width: 100%;
    min-height: 100px;
    padding: 0.75rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.95rem;
    line-height: 1.6;
    resize: vertical;
  }

  textarea.adr-input:focus {
    outline: none;
    border-color: var(--color-blue-500, #4a9eff);
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
  }

  input.adr-title-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 1.25rem;
    font-weight: 600;
  }

  input.adr-title-input:focus {
    outline: none;
    border-color: var(--color-blue-500, #4a9eff);
  }

  select.adr-status-select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
    cursor: pointer;
  }

  .adr-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #e0e0e0);
  }

  .adr-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .adr-btn-primary {
    background: var(--color-blue-500, #4a9eff);
    color: var(--text-on-primary, #fff);
  }

  .adr-btn-primary:hover {
    background: var(--color-blue-600, #2563eb);
  }

  .adr-btn-secondary {
    background: var(--bg-secondary, #e5e7eb);
    color: var(--text-primary, #333);
  }

  .adr-btn-secondary:hover {
    background: var(--bg-tertiary, #d1d5db);
  }

  .adr-btn-danger {
    background: #fee2e2;
    color: #991b1b;
  }

  .adr-btn-danger:hover {
    background: #fecaca;
  }

  .superseded-link {
    font-size: 0.85rem;
    color: var(--color-blue-500, #4a9eff);
    text-decoration: none;
  }

  .superseded-link:hover {
    text-decoration: underline;
  }

  .adr-collapsed-preview {
    color: var(--text-secondary, #666);
    font-size: 0.95rem;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80%;
  }
`;

/**
 * Styles for Global Config Card component
 */
import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const GlobalConfigCardStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .config-card {
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 0.75rem;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .config-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .config-card.selected {
    border-color: var(--color-blue-500, #4a9eff);
    box-shadow: 0 0 0 1px var(--color-blue-500, #4a9eff);
  }

  .config-card.expanded {
    border-left: 4px solid var(--color-purple-500, #9333ea);
  }

  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    cursor: pointer;
  }

  .config-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary, #333);
    margin: 0 0 0.25rem 0;
  }

  .config-description {
    font-size: 0.9rem;
    color: var(--text-secondary, #666);
    margin: 0;
  }

  .config-badges {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .config-category {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  .config-category.development {
    background: #dbeafe;
    color: #1e40af;
  }

  .config-category.planning {
    background: #fef3c7;
    color: #92400e;
  }

  .config-category.qa {
    background: #d1fae5;
    color: #065f46;
  }

  .config-category.documentation {
    background: #e5e7eb;
    color: #4b5563;
  }

  .config-category.architecture {
    background: #ede9fe;
    color: #5b21b6;
  }

  .config-type-icon {
    font-size: 1.1rem;
  }

  .config-content {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #e0e0e0);
  }

  .config-content-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .config-content-text {
    font-family: monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    background: var(--bg-secondary, #f5f5f5);
    padding: 1rem;
    border-radius: 4px;
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }

  textarea.config-input {
    width: 100%;
    min-height: 200px;
    padding: 0.75rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    resize: vertical;
  }

  textarea.config-input:focus {
    outline: none;
    border-color: var(--color-blue-500, #4a9eff);
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
  }

  input.config-title-input,
  input.config-desc-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }

  input.config-title-input:focus,
  input.config-desc-input:focus {
    outline: none;
    border-color: var(--color-blue-500, #4a9eff);
  }

  select.config-category-select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.85rem;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
    cursor: pointer;
  }

  .config-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #e0e0e0);
  }

  .config-btn {
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .config-btn-primary {
    background: var(--color-blue-500, #4a9eff);
    color: var(--text-on-primary, #fff);
  }

  .config-btn-primary:hover {
    background: var(--color-blue-600, #2563eb);
  }

  .config-btn-secondary {
    background: var(--bg-secondary, #e5e7eb);
    color: var(--text-primary, #333);
  }

  .config-btn-secondary:hover {
    background: var(--bg-tertiary, #d1d5db);
  }

  .config-btn-danger {
    background: #fee2e2;
    color: #991b1b;
  }

  .config-btn-danger:hover {
    background: #fecaca;
  }

  .config-meta {
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
    margin-top: 0.5rem;
  }
`;

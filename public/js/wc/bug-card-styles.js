import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { ThemeVariables, BaseCardStyles, BaseTabStyles, BugTheme } from '../ui/styles/index.js';

const BugCardSpecificStyles = css`
  /* Repository badge styles */
  .repo-badge {
    display: inline-block;
    font-size: 0.65em;
    font-weight: 600;
    color: white;
    padding: 0.1em 0.4em;
    border-radius: 3px;
    margin-left: 0.4em;
    vertical-align: middle;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  :host([expanded]) .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  :host([expanded]) .card-header select {
    min-width: 200px;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--input-border);
    background-color: var(--input-bg);
    color: var(--text-primary);
    font-size: 1rem;
  }

  :host([expanded]) .card-header select:hover {
    border-color: #4a9eff;
  }

  :host([expanded]) .card-header select:focus {
    outline: none;
    border-color: #4a9eff;
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
  }
  
  .invalid-field {
    border: 2px solid #dc3545 !important;
    box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25) !important;
  }
  
  .invalid-field:focus {
    border-color: #dc3545 !important;
    box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25) !important;
  }

  :host([expanded]) .card-header label {
    font-weight: bold;
    margin-bottom: 0.5rem;
    display: block;
  }

  :host([expanded]) .card-header > div {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  :host([expanded]) .card-header section {
    flex: 2;
  }

  .card-extra {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
  }

  .uploader-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .uploader-group label {
    font-weight: bold;
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .uploader-group input {
    padding: 0.5rem;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 1rem;
    background-color: var(--input-bg);
    color: var(--text-primary);
  }

  .uploader-group input:focus {
    outline: none;
    border-color: #4a9eff;
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
  }

  .files-status {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--color-info-light, #e3f2fd);
    border-radius: 4px;
    font-size: 0.85em;
    color: var(--color-info-dark, #1976d2);
  }

    margin-top: 1rem;
    padding: 0.5rem;
    background: var(--color-warning-light, #fff3cd);
    border: 1px solid var(--color-warning-border, #ffeaa7);
    border-radius: 4px;
    font-size: 0.8em;
    color: var(--color-warning-dark, #856404);
    display: none;
    visibility: hidden;
    width: 0;
    height: 0;
    overflow: hidden;
  }

  .copy-link-button {
    background: transparent;
    border: none;
    box-shadow: none;
    color: inherit;
    font-size: 1.3em;
    cursor: pointer;
    padding: 0;
    margin: 0;
    transition: background 0.2s;
  }
  
  .copy-link-button:focus {
    outline: 2px solid #4a9eff;
  }
  
  .copy-link-button:hover {
    background: rgba(0,0,0,0.05);
  }

  .ia-link-button {
    background: transparent;
    border: none;
    box-shadow: none;
    color: inherit;
    font-size: 0.95em;
    cursor: pointer;
    padding: 0 0.35em;
    margin-left: 0.3em;
    transition: background 0.2s;
  }
  .ia-link-button:hover {
    background: rgba(0,0,0,0.05);
  }

  .attachment-section {
    padding: 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: var(--bg-secondary);
  }

  .attachment-section label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  firebase-storage-uploader {
    width: 100%;
  }

  .attachment-indicator {
    font-size: 1.2em;
    margin-right: 0.3em;
    color: #4a9eff;
    cursor: help;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    margin-top: 0.5rem;
    background: var(--bg-light);
    border-radius: var(--radius-sm);
  }

  .card-footer span {
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 500;
  }

  /* Estilos para formularios expandidos */
  .expanded-fields {
    padding: var(--spacing-md);
    background: var(--bg-white);
    margin-bottom: var(--spacing-md);
  }

  .field-group-row {
    display: flex;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-md);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--spacing-xs);
  }

  .field-group label {
    font-weight: bold;
    color: var(--primary-color);
    font-size: 0.95em;
    margin-bottom: var(--spacing-xs);
  }

  .field-group select,
  .field-group input {
    padding: var(--spacing-sm);
    border: 1px solid var(--bg-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    background: var(--input-bg);
    color: var(--text-primary);
  }

  .status-group {
    flex: 0 0 30%;
  }

  .priority-group {
    flex: 0 0 30%;
  }

  .bugtype-group {
    flex: 1;
  }

  .developer-group {
    flex: 0 0 20%;
  }

  .codeveloper-group {
    flex: 0 0 20%;
  }

  :host([expanded]) .card-dates {
    display: flex;
    gap: var(--spacing-lg);
    padding: var(--spacing-md);
    background: var(--bg-light);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  :host([expanded]) .card-dates .field-group {
    flex: 1;
  }

  /* Scenario table styles for Acceptance Criteria */
  .scenario-table-wrapper {
    margin-top: 0.5rem;
    padding: 0.5rem;
  }

  .scenario-table {
    width: 100%;
    border-collapse: collapse;
  }

  .scenario-table th,
  .scenario-table td {
    border: 1px solid var(--border-subtle);
    padding: 0.3rem 0.4rem;
    vertical-align: middle;
    line-height: 1.3;
    font-size: 0.95rem;
  }

  .scenario-table th {
    background: var(--bg-secondary);
    font-weight: 600;
    color: var(--text-primary);
  }

  .scenario-table .ellipsis {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scenario-table td.actions {
    width: 70px;
    display: flex;
    gap: 0.25rem;
    justify-content: flex-start;
    align-items: center;
  }

  .scenario-table th.actions-col {
    width: 70px;
    text-align: left;
  }

  .icon-button {
    cursor: pointer;
    padding: 0.2rem;
    font-size: 1rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .icon-button:hover {
    background: rgba(0,0,0,0.1);
  }

  .icon-button.danger:hover {
    background: rgba(217, 83, 79, 0.2);
  }

  .scenario-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    justify-content: flex-end;
  }

  .secondary-button {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--text-muted);
    background: var(--input-bg);
    color: var(--text-muted);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .secondary-button:hover:not(:disabled) {
    background: var(--text-muted);
    color: var(--text-inverse);
  }

  .secondary-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Expanded footer with IA button */
  .expanded-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    margin-top: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .expanded-footer.ia-footer {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 1rem;
  }

  .footer-left {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 0.5rem;
  }

  .footer-right {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
  }

  .icon-btn {
    cursor: pointer;
    padding: 0.4rem;
    font-size: 1.2rem;
    border-radius: 4px;
    transition: background 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover {
    background: rgba(0,0,0,0.1);
  }

  .save-button {
    padding: 0.5rem 1.5rem;
    background: var(--color-success);
    color: var(--text-inverse);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition: background 0.2s;
  }

  .save-button:hover:not(:disabled) {
    background: var(--color-success-dark, #218838);
  }

  .save-button:disabled {
    background: var(--text-muted);
    cursor: not-allowed;
  }

  /* Improve with IA button */
  .improve-ia-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
  }

  .improve-ia-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
    background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
  }

  .improve-ia-button:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
  }
`;

export const BugCardStyles = [
  ThemeVariables,
  BaseCardStyles,
  BaseTabStyles,
  BugTheme,
  BugCardSpecificStyles
];
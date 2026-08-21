/**
 * Styles for DevPlansList component
 * Migrated from :global() CSS in adminproject.astro
 */
import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const DevPlansListStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .plans-container {
    max-width: 960px;
    margin: 0 auto;
    padding: 1rem;
  }

  .plans-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .plans-header h2 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  /* Empty state */
  .plans-empty {
    text-align: center;
    padding: 3rem;
    color: var(--text-muted, #888);
    font-size: 1.1rem;
  }

  /* Table */
  .plans-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.5rem;
  }

  .plans-table th {
    text-align: left;
    padding: 0.6rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
    border-bottom: 2px solid var(--border-color, #dee2e6);
  }

  .plans-table td {
    padding: 0.65rem 0.75rem;
    border-bottom: 1px solid var(--border-color, #dee2e6);
    font-size: 0.9rem;
    vertical-align: middle;
  }

  .plans-table tbody tr {
    cursor: pointer;
    transition: background 0.15s;
  }

  .plans-table tbody tr:hover {
    background: var(--bg-hover, #f8f9fa);
  }

  .plan-title-cell {
    font-weight: 500;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan-center-cell {
    text-align: center;
    color: var(--text-secondary, #555);
  }

  .plan-date-cell {
    color: var(--text-muted, #888);
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .plan-actions-cell {
    white-space: nowrap;
    text-align: right;
  }

  .plan-action-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem 0.35rem;
    border-radius: 4px;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .plan-action-btn:hover {
    opacity: 1;
    background: var(--bg-secondary, #e9ecef);
  }

  /* Status badges */
  .plan-status-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .plan-status-draft {
    background: var(--text-muted, #6b7280);
    color: var(--bg-primary, white);
  }

  .plan-status-accepted {
    background: var(--brand-primary, #3b82f6);
    color: var(--text-on-primary, #fff);
  }

  .plan-status-rejected {
    background: var(--color-error, #dc3545);
    color: var(--text-on-primary, #fff);
  }

  /* Buttons */
  .plans-btn {
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.2s;
  }

  .plans-btn:hover {
    opacity: 0.85;
  }

  .plans-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .plans-btn-primary {
    background: var(--brand-primary, #007bff);
    color: var(--text-on-primary, #fff);
    padding: 0.5rem 1.25rem;
    font-size: 0.95rem;
  }

  .plans-btn-secondary {
    background: var(--bg-secondary, #e9ecef);
    color: var(--text-primary, #333);
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .plans-btn-small {
    background: var(--bg-secondary, #e9ecef);
    color: var(--text-primary, #333);
    padding: 0.3rem 0.75rem;
    font-size: 0.85rem;
  }

  .plans-btn-danger {
    background: var(--color-error, #dc3545);
    color: var(--text-on-primary, #fff);
    padding: 0.5rem 1.25rem;
    font-size: 0.95rem;
  }

  .plans-btn-accept {
    background: var(--color-success, #4caf50);
    color: var(--text-on-primary, #fff);
    padding: 0.5rem 1.25rem;
    font-size: 0.95rem;
  }

  .plans-btn-generate {
    background: var(--brand-secondary, #ec3e95);
    color: var(--text-on-secondary, #fff);
    padding: 0.5rem 1.25rem;
    font-size: 0.95rem;
  }

  .plan-generate-btn {
    font-size: 0.9rem !important;
  }

  .plan-generated-done {
    color: var(--color-success, #4caf50) !important;
    font-weight: 600;
  }

  .plan-generating {
    color: var(--brand-primary, #007bff);
    font-weight: 500;
    font-size: 0.9rem;
  }

  /* Detail view */
  .plan-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
  }

  .plan-detail-actions {
    display: flex;
    gap: 0.5rem;
  }

  .plan-detail-title-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .plan-detail-title-row h2 {
    margin: 0;
    font-size: 1.6rem;
    background: transparent;
    color: var(--text-primary, #333);
    text-align: left;
    padding-bottom: 0;
  }

  .plan-detail-objective {
    font-size: 1rem;
    color: var(--text-secondary, #555);
    margin: 0 0 1rem;
    line-height: 1.5;
  }

  .plan-detail-meta {
    display: flex;
    gap: 1.5rem;
    font-size: 0.85rem;
    color: var(--text-muted, #888);
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-color, #dee2e6);
  }

  .plan-phases h3 {
    margin: 0 0 1rem;
    font-size: 1.2rem;
  }

  /* Phase cards */
  .plan-phase-card {
    border: 1px solid var(--border-color, #dee2e6);
    border-left: 4px solid var(--text-muted, #6b7280);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 0.75rem;
    background: var(--bg-primary, white);
  }

  .plan-phase-card.phase-status-in_progress {
    border-left-color: var(--brand-primary, #3b82f6);
  }

  .plan-phase-card.phase-status-completed {
    border-left-color: var(--color-success, #4caf50);
  }

  .phase-card-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.4rem;
  }

  .phase-number {
    background: var(--bg-secondary, #e9ecef);
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  .phase-card-header h4 {
    margin: 0;
    font-size: 1rem;
    flex: 1;
  }

  .phase-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
  }

  .phase-badge.phase-status-pending {
    background: var(--bg-secondary, #f3f4f6);
    color: var(--text-muted, #6b7280);
  }

  .phase-badge.phase-status-in_progress {
    background: var(--status-in-progress, #cce500);
    color: var(--text-primary, #333);
  }

  .phase-badge.phase-status-completed {
    background: var(--color-success, #4caf50);
    color: var(--text-on-primary, #fff);
  }

  .phase-description-text {
    margin: 0.25rem 0 0.5rem 2.5rem;
    font-size: 0.9rem;
    color: var(--text-secondary, #555);
  }

  .phase-refs {
    margin-left: 2.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: var(--text-muted, #888);
  }

  .plan-link {
    color: var(--brand-primary, #007bff);
    text-decoration: none;
  }

  .plan-link:hover {
    text-decoration: underline;
  }

  .phase-ai-tasks {
    margin-left: 2.5rem;
    margin-top: 0.5rem;
  }

  .phase-ai-tasks-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted, #888);
    display: block;
    margin-bottom: 0.25rem;
  }

  .phase-tasks-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
    padding: 0.3rem 0;
  }

  .phase-task-chip {
    background: var(--bg-secondary, #e9ecef);
    color: var(--text-secondary, #555);
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Generated tasks list */
  .generated-tasks-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #dee2e6);
  }

  .generated-tasks-section h3 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }

  .generated-task-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-color, #dee2e6);
    font-size: 0.9rem;
  }

  .generated-task-item a {
    color: var(--brand-primary, #007bff);
    text-decoration: none;
    font-weight: 500;
  }

  .generated-task-item a:hover {
    text-decoration: underline;
  }

  /* Form */
  .plan-form-container {
    max-width: 720px;
  }

  .plan-form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .plan-form-header h2 {
    margin: 0;
    background: transparent;
    color: var(--text-primary, #333);
    text-align: left;
    padding-bottom: 0;
    width: auto;
  }

  .plan-form-field {
    margin-bottom: 1rem;
  }

  .plan-form-field label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
    font-size: 0.9rem;
    color: var(--text-primary, #333);
  }

  .plan-form-field input,
  .plan-form-field textarea,
  .plan-form-field select {
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

  .plan-form-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #dee2e6);
  }

  .plan-form-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .plan-form-section-header h3 {
    margin: 0;
  }

  .plan-form-actions {
    margin-top: 1.5rem;
    display: flex;
    gap: 0.75rem;
  }

  /* Phase form rows */
  .phase-row {
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 6px;
    background: var(--bg-secondary, #f8f9fa);
  }

  .phase-row-header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .phase-row-number {
    background: var(--bg-primary, white);
    border: 1px solid var(--border-color, #dee2e6);
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .phase-row-fields {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.4rem;
  }

  .phase-row-fields input {
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border-default, #ced4da);
    border-radius: 4px;
    font-size: 0.85rem;
    background: var(--input-bg, var(--bg-primary, white));
    color: var(--text-primary, #333);
  }

  .phase-remove-btn {
    background: none;
    border: none;
    color: var(--color-error, #dc3545);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.3rem;
    line-height: 1;
    flex-shrink: 0;
  }

  /* Phase tasks in form */
  .phase-tasks-editable {
    margin-left: 2rem;
    padding-top: 0.25rem;
  }

  .phase-tasks-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted, #888);
    display: block;
    margin-bottom: 0.35rem;
  }

  .phase-task-item {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1.5fr 1fr auto;
    gap: 0.35rem;
    margin-bottom: 0.35rem;
    align-items: center;
  }

  .phase-task-item input {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border-default, #ced4da);
    border-radius: 4px;
    font-size: 0.8rem;
    background: var(--input-bg, var(--bg-primary, white));
    color: var(--text-primary, #333);
  }

  .phase-task-remove {
    background: none;
    border: none;
    color: var(--color-error, #dc3545);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0.15rem 0.3rem;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .phase-task-remove:hover {
    opacity: 1;
  }

  .phase-add-task-btn {
    margin-top: 0.25rem;
    font-size: 0.8rem !important;
    padding: 0.2rem 0.6rem !important;
  }

  /* Creator */
  .plan-creator-hint {
    color: var(--text-secondary, #555);
    font-size: 0.9rem;
    line-height: 1.5;
    margin-bottom: 1rem;
  }

  /* Plan being created from an approved proposal (PLN-TSK-0358) */
  .plan-from-proposal {
    background: var(--bg-secondary, #f8f9fa);
    border-left: 3px solid var(--brand-primary, #4a9eff);
    border-radius: 4px;
    color: var(--text-primary, #222);
    font-size: 0.9rem;
    line-height: 1.5;
    margin-bottom: 1rem;
    padding: 0.6rem 0.9rem;
  }

  .plan-ai-notice {
    background: var(--bg-secondary, #f8f9fa);
    color: var(--brand-primary, #4a9eff);
    padding: 0.6rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    margin-bottom: 1rem;
    border-left: 4px solid var(--brand-primary, #3b82f6);
  }

  .plan-ai-error {
    background: var(--bg-secondary, #f8f9fa);
    color: var(--color-error, #dc3545);
    padding: 0.6rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
    border-left: 4px solid var(--color-error, #dc3545);
  }

  /* Loading */
  .loading-indicator {
    display: flex;
    justify-content: center;
    padding: 2rem;
    color: var(--text-secondary, #666);
  }

  .loading-message {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted, #888);
  }

  .error-message {
    color: var(--color-error, #dc3545);
    padding: 1rem;
  }
`;

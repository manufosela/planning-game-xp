/**
 * Styles for UserAdminPanel component
 */
import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const UserAdminPanelStyles = css`
  :host {
    display: block;
    font-family: var(--font-family-base, 'Segoe UI', system-ui, sans-serif);
  }

  .user-admin-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  /* Header */
  .user-admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .user-count {
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  /* Search */
  .search-box {
    position: relative;
  }

  .search-box input {
    padding: 0.4rem 0.6rem 0.4rem 2rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.85rem;
    background: var(--input-bg, white);
    color: var(--text-primary, inherit);
    width: 220px;
    transition: border-color 0.2s;
  }

  .search-box input:focus {
    outline: none;
    border-color: var(--brand-primary, #3b82f6);
    box-shadow: 0 0 0 2px var(--brand-primary-bg, #dbeafe);
  }

  .search-box::before {
    content: '\\1F50D';
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.8rem;
    pointer-events: none;
  }

  /* Buttons */
  .btn {
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 0.2s, opacity 0.2s;
    white-space: nowrap;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--brand-primary, #3b82f6);
    color: white;
  }

  .btn-secondary {
    background: var(--bg-tertiary, #e5e7eb);
    color: var(--text-primary, #333);
  }

  .btn-danger {
    background: var(--color-error, #ef4444);
    color: white;
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }

  .btn-icon {
    padding: 0.2rem 0.4rem;
    font-size: 0.75rem;
    line-height: 1;
    border-radius: 50%;
    min-width: 20px;
    min-height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Table container for responsive scroll */
  .table-container {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Table */
  .entity-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1rem;
    font-size: 0.9rem;
    min-width: 700px;
  }

  .entity-table th,
  .entity-table td {
    padding: 0.6rem 0.8rem;
    text-align: left;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .entity-table th {
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

  .entity-table tr:hover {
    background: var(--bg-tertiary, #f3f4f6);
  }

  .entity-table .col-id {
    width: 80px;
    font-family: monospace;
    font-size: 0.82rem;
    color: var(--text-secondary, #666);
  }

  .entity-table .col-actions {
    width: 80px;
    text-align: right;
  }

  .entity-table .col-projects {
    max-width: 300px;
  }

  .actions-cell {
    display: flex;
    gap: 0.3rem;
    justify-content: flex-end;
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 0.15rem 0.45rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
  }

  .badge-active {
    background: var(--color-success-bg, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  .badge-inactive {
    background: var(--bg-tertiary, #f3f4f6);
    color: var(--text-tertiary, #9ca3af);
  }

  .badge-not-registered {
    background: var(--color-warning-bg, #fef3c7);
    color: var(--color-warning, #d97706);
  }

  .badge-disabled {
    background: var(--color-error-bg, #fee2e2);
    color: var(--color-error, #ef4444);
  }

  /* Project badges */
  .project-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }

  .project-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 600;
    background: var(--bg-tertiary, #e5e7eb);
    color: var(--text-primary, #333);
    border: 1px solid var(--border-color, #d1d5db);
    line-height: 1.3;
  }

  .project-badge .remove-project {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0;
    border-radius: 50%;
    line-height: 1;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
  }

  .project-badge .remove-project:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.08);
  }

  .no-projects {
    color: var(--text-tertiary, #9ca3af);
    font-size: 0.82rem;
    font-style: italic;
  }

  /* Inline form */
  .entity-form {
    background: var(--bg-secondary, #f9fafb);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
  }

  .form-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary, #333);
    margin: 0 0 0.75rem 0;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-group label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
  }

  .form-group input[type="text"],
  .form-group input[type="email"],
  .form-group select {
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.85rem;
    background: var(--input-bg, white);
    color: var(--text-primary, inherit);
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand-primary, #3b82f6);
    box-shadow: 0 0 0 2px var(--brand-primary-bg, #dbeafe);
  }

  .form-row-checkboxes {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    grid-column: 1 / -1;
  }

  .form-checkbox {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .form-checkbox input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .form-checkbox label {
    font-size: 0.85rem;
    color: var(--text-primary, #333);
    cursor: pointer;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  /* Existing user notice */
  .existing-user-notice {
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    background: var(--color-warning-bg, #fef3c7);
    color: var(--color-warning, #92400e);
    border-radius: 4px;
    font-size: 0.82rem;
    line-height: 1.4;
  }

  /* Multi-project selection */
  .form-group-full {
    grid-column: 1 / -1;
  }

  .assigned-projects-hint {
    margin-top: 0.4rem;
    font-size: 0.78rem;
    color: var(--text-tertiary, #9ca3af);
    font-style: italic;
  }

  /* Onboarding checklist */
  .onboarding-checklist {
    margin: 0.75rem 0;
    padding: 0.75rem;
    background: var(--bg-primary, white);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
  }

  .checklist-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .checklist-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-primary, #333);
  }

  .checklist-done {
    color: var(--color-success, #16a34a);
  }

  .checklist-error {
    color: var(--color-error, #ef4444);
  }

  .checklist-pending {
    color: var(--text-tertiary, #9ca3af);
  }

  .step-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .step-done {
    color: var(--color-success, #16a34a);
    font-weight: bold;
  }

  .step-error {
    color: var(--color-error, #ef4444);
    font-weight: bold;
  }

  .step-pending {
    color: var(--text-tertiary, #9ca3af);
  }

  .step-running {
    width: 14px;
    height: 14px;
    border: 2px solid var(--brand-primary, #3b82f6);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Loading & empty states */
  .loading-message,
  .empty-message {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary, #666);
    font-size: 0.9rem;
  }

  .loading-message::after {
    content: '...';
    animation: dots 1.5s steps(4, end) infinite;
  }

  @keyframes dots {
    0%, 20% { content: ''; }
    40% { content: '.'; }
    60% { content: '..'; }
    80%, 100% { content: '...'; }
  }

  /* Permissions gear button in project badges */
  .project-badge .perms-project {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--text-primary, #333);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    border-radius: 50%;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .project-badge .perms-project:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.12);
  }

  /* Modal overlay */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-primary, white);
    border-radius: 8px;
    padding: 1.5rem;
    width: 380px;
    max-width: 90vw;
    box-shadow: var(--shadow-lg, 0 20px 25px -5px rgba(0, 0, 0, 0.15));
  }

  .modal-title {
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .permissions-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .permissions-checkboxes .form-checkbox span {
    font-size: 0.85rem;
  }

  /* Access Requests Section */
  .access-requests-section {
    margin-bottom: 1rem;
    border: 1px solid var(--color-warning, #d97706);
    border-radius: 6px;
    background: var(--color-warning-bg, #fef3c7);
    overflow: hidden;
  }

  .access-requests-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--color-warning, #92400e);
  }

  .access-requests-title {
    font-size: 0.85rem;
  }

  .badge-pending {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 0.4rem;
    border-radius: 9999px;
    background: var(--color-warning, #d97706);
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1;
  }

  .access-requests-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--border-color, #e0e0e0);
  }

  .request-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    background: var(--bg-primary, white);
    gap: 1rem;
  }

  .request-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .request-name {
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--text-primary, #333);
  }

  .request-email {
    font-size: 0.82rem;
    color: var(--text-secondary, #666);
  }

  .request-meta {
    font-size: 0.78rem;
    color: var(--text-tertiary, #9ca3af);
  }

  .request-actions {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .btn-approve {
    background: var(--color-success, #16a34a);
    color: white;
  }

  .btn-reject {
    background: var(--color-error, #ef4444);
    color: white;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .user-admin-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-actions {
      width: 100%;
      justify-content: space-between;
    }

    .search-box input {
      width: 100%;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .entity-table {
      font-size: 0.82rem;
    }

    .entity-table th,
    .entity-table td {
      padding: 0.4rem 0.5rem;
    }

    .request-card {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .request-actions {
      align-self: flex-end;
    }
  }
`;

import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';

export const CleanCardDetailStyles = css`
  :host {
    display: block;
    font-family: 'Inter', system-ui, sans-serif;
    color: var(--text-primary, #1e293b);
  }

  .detail-container {
    padding: 20px;
    max-width: 640px;
    margin: 0 auto;
  }

  /* Header */
  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .status-badge {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 12px;
    white-space: nowrap;
  }

  .card-id {
    font-size: 13px;
    color: var(--text-muted, #94a3b8);
    font-weight: 500;
  }

  /* Title */
  .detail-title {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 8px;
    color: var(--text-primary, #1e293b);
  }

  .detail-subtitle {
    font-size: 13px;
    color: var(--text-secondary, #64748b);
    margin-bottom: 20px;
  }

  .detail-subtitle span {
    margin-right: 12px;
  }

  /* Sections */
  .section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 8px;
  }

  .section-content {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary, #1e293b);
  }

  /* Structured description */
  .user-story {
    background: var(--bg-secondary, #f1f5f9);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .user-story-label {
    font-weight: 600;
    color: var(--brand-primary, #6366f1);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .user-story-text {
    margin-top: 2px;
    margin-bottom: 10px;
  }

  .user-story-text:last-child {
    margin-bottom: 0;
  }

  /* Acceptance criteria - collapsible */
  .criteria-details {
    margin-bottom: 20px;
  }

  .criteria-details summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .criteria-details summary::before {
    content: '▶';
    font-size: 10px;
    color: var(--text-muted, #94a3b8);
    transition: transform 0.2s;
  }

  .criteria-details[open] summary::before {
    transform: rotate(90deg);
  }

  .criteria-details summary::-webkit-details-marker {
    display: none;
  }

  .clickable {
    cursor: pointer;
  }

  .criteria-list {
    margin-top: 10px;
  }

  .criteria-item {
    background: var(--bg-secondary, #f1f5f9);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .criteria-label {
    font-weight: 600;
    color: var(--text-secondary, #64748b);
    font-size: 11px;
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  .criteria-text {
    color: var(--text-primary, #1e293b);
  }

  /* Notes */
  .note-item {
    background: var(--bg-secondary, #f1f5f9);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 8px;
  }

  .note-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .note-author {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary, #64748b);
  }

  .note-date {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
  }

  .note-content {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-primary, #1e293b);
  }

  /* Info panel */
  .info-panel {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    background: var(--bg-secondary, #f1f5f9);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 24px;
  }

  .info-item {
    text-align: center;
  }

  .info-label {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .info-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary, #1e293b);
    margin-top: 2px;
  }

  /* Points */
  .points-row {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }

  .point-badge {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--bg-secondary, #f1f5f9);
    color: var(--text-secondary, #64748b);
  }

  /* Actions */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }

  .btn-validate {
    width: 100%;
    padding: 14px 20px;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    background: #10b981;
    color: #fff;
    transition: background 0.2s, transform 0.1s;
  }

  .btn-validate:hover {
    background: #059669;
  }

  .btn-validate:active {
    transform: scale(0.98);
  }

  .btn-validate:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .btn-reopen {
    width: 100%;
    padding: 12px 20px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary, #64748b);
    transition: background 0.2s, border-color 0.2s;
  }

  .btn-reopen:hover {
    background: var(--bg-secondary, #f1f5f9);
    border-color: var(--text-muted, #94a3b8);
  }

  .btn-reopen:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-hint {
    text-align: center;
    font-size: 12px;
    color: var(--text-muted, #94a3b8);
    margin-top: 4px;
  }

  /* Reopen form */
  .reopen-form {
    margin-top: 12px;
  }

  .reopen-input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 10px;
    font-size: 14px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #1e293b);
    margin-bottom: 10px;
    box-sizing: border-box;
  }

  .reopen-input:focus {
    outline: none;
    border-color: var(--brand-primary, #6366f1);
  }

  .reopen-actions {
    display: flex;
    gap: 8px;
  }

  .btn-confirm-reopen {
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    background: #f59e0b;
    color: #fff;
  }

  .btn-confirm-reopen:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .btn-cancel-reopen {
    padding: 10px 16px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 10px;
    font-size: 14px;
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary, #64748b);
  }

  /* Loading */
  .loading-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    font-size: 14px;
    color: var(--text-secondary, #64748b);
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-default, #e2e8f0);
    border-top-color: var(--brand-primary, #6366f1);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Status colors (same as CleanCardItem) */
  .status-todo { background: var(--status-todo, #94a3b8); color: var(--status-todo-text, #fff); }
  .status-inprogress { background: var(--status-in-progress, #3b82f6); color: var(--status-in-progress-text, #fff); }
  .status-tovalidate { background: var(--status-to-validate, #f59e0b); color: var(--status-to-validate-text, #fff); }
  .status-done { background: var(--status-done, #10b981); color: var(--status-done-text, #fff); }
  .status-donevalidated { background: var(--status-done, #10b981); color: var(--status-done-text, #fff); }
  .status-blocked { background: var(--status-blocked, #f43f5e); color: var(--status-blocked-text, #fff); }
  .status-reopened { background: var(--status-blocked, #f43f5e); color: var(--status-blocked-text, #fff); }
  .status-created { background: #64748b; color: #fff; }
  .status-assigned { background: var(--brand-primary, #6366f1); color: #fff; }
  .status-fixed { background: #10b981; color: #fff; }
  .status-verified { background: #34d399; color: #fff; }
  .status-closed { background: #14532d; color: #fff; }

  /* No actions message */
  .no-actions {
    text-align: center;
    padding: 16px;
    font-size: 14px;
    color: var(--text-muted, #94a3b8);
    background: var(--bg-secondary, #f1f5f9);
    border-radius: 10px;
  }

  /* Divider */
  .divider {
    border: none;
    border-top: 1px solid var(--border-default, #e2e8f0);
    margin: 16px 0;
  }
`;

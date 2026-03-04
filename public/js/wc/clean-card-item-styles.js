import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';

export const CleanCardItemStyles = css`
  :host {
    display: block;
  }

  .card-item {
    background: var(--bg-primary, #fff);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 10px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.15s ease;
    border-left: 4px solid var(--card-border-color, #94a3b8);
  }

  .card-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
  }

  .card-item:active {
    transform: translateY(0);
  }

  .card-item.my-task {
    border-left-color: var(--brand-primary, #6366f1);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .status-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
    text-transform: capitalize;
  }

  .card-type-icon {
    font-size: 12px;
    opacity: 0.7;
  }

  .card-id {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    margin-left: auto;
  }

  .card-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary, #1e293b);
    line-height: 1.4;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    color: var(--text-secondary, #64748b);
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .priority-dot.high { background: #e11d48; }
  .priority-dot.medium { background: #f59e0b; }
  .priority-dot.low { background: #22c55e; }

  /* Status colors */
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
`;

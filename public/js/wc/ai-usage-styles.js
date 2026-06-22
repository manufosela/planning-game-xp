/**
 * Shared styles for AI usage display in TaskCard and BugCard
 */

import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const AiUsageStyles = css`
  .ai-usage-panel {
    padding: 0.5rem;
  }

  .ai-usage-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .ai-usage-table thead th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 2px solid var(--border-default, #dee2e6);
    color: var(--text-secondary, #666);
    font-weight: 600;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .ai-usage-row td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-default, #eee);
    vertical-align: top;
  }

  .ai-usage-row:last-child td {
    border-bottom: none;
  }

  .ai-usage-row:hover td {
    background: var(--bg-secondary, #f8f9fa);
  }

  .ai-usage-totals td {
    padding: 0.5rem 0.75rem;
    border-top: 2px solid var(--border-default, #dee2e6);
    font-weight: 600;
    background: var(--bg-secondary, #f8f9fa);
  }

  .ai-model-badge {
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--color-purple-700, #7c3aed);
    background: var(--color-purple-50, #f5f3ff);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    white-space: nowrap;
  }

  .ai-token-count {
    font-family: monospace;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .ai-cost {
    font-family: monospace;
    font-size: 0.85rem;
    color: var(--color-green-700, #15803d);
    white-space: nowrap;
  }

  .ai-duration {
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
    white-space: nowrap;
  }

  .ai-action-badge {
    font-size: 0.8rem;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    background: var(--bg-tertiary, #e5e5e5);
    white-space: nowrap;
  }

  .ai-date {
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
    white-space: nowrap;
  }

  .no-ai-usage {
    text-align: center;
    padding: 1.5rem;
    color: var(--text-secondary, #666);
    font-style: italic;
  }
`;

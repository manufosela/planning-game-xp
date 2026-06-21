import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';

export const pgBoardStyles = css`
  :host {
    display: block;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0 0.75rem;
    gap: 0.75rem;
  }

  .board-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary, #0f172a);
  }

  .board-status {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .board-columns {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(260px, 1fr);
    gap: 0.75rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }

  .column {
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary, #f1f5f9);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    overflow: hidden;
    min-height: 60vh;
  }

  .column.drop-target {
    border-color: var(--brand-primary, #4a9eff);
    background: rgba(74, 158, 255, 0.06);
  }

  .column.drop-blocked {
    border-color: var(--color-error, #dc2626);
    background: rgba(220, 38, 38, 0.06);
  }

  .column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary, #fff);
    border-bottom: 1px solid var(--border-default, #e2e8f0);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary, #0f172a);
  }

  .col-count {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
  }

  .col-count.at-limit { color: #b45309; }
  .col-count.over-limit { color: #b91c1c; }

  .column-body {
    flex: 1;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    overflow-y: auto;
  }

  .card {
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 6px;
    padding: 0.55rem 0.65rem;
    cursor: grab;
    user-select: none;
    transition: border-color 0.12s, transform 0.12s, box-shadow 0.12s;
  }

  .card:hover {
    border-color: var(--brand-primary, #4a9eff);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .card[draggable="true"]:active {
    cursor: grabbing;
  }

  .card.dragging {
    opacity: 0.4;
    transform: scale(0.98);
  }

  .card.expedite {
    border-left: 3px solid var(--color-error, #dc2626);
  }

  .card-title {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-primary, #0f172a);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.35rem;
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
  }

  .card-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
  }

  .card-points {
    display: inline-flex;
    gap: 0.35rem;
  }

  .points-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    background: var(--bg-secondary, #f1f5f9);
    color: var(--text-secondary, #475569);
  }

  .empty-column {
    padding: 1.5rem 0.5rem;
    text-align: center;
    color: var(--text-muted, #94a3b8);
    font-size: 0.75rem;
  }

  .board-empty,
  .board-loading,
  .board-error {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted, #64748b);
    font-size: 0.9rem;
  }

  .board-error {
    color: var(--color-error, #dc2626);
  }

  .board-footer {
    margin-top: 0.5rem;
    font-size: 0.7rem;
    color: var(--text-muted, #94a3b8);
  }

  .board-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .board-filter {
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--border-default, #d1d5db);
    border-radius: 6px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #0f172a);
    font-size: 0.8rem;
  }
  .board-search {
    flex: 1 1 220px;
    min-width: 200px;
  }
  .board-clear {
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--border-default, #d1d5db);
    border-radius: 6px;
    background: var(--bg-secondary, #f1f5f9);
    color: var(--text-secondary, #475569);
    cursor: pointer;
    font-size: 0.78rem;
  }
  .board-clear:hover { background: var(--bg-tertiary, #e2e8f0); }

  .swimlane-header {
    margin: 0.5rem 0 0.35rem;
    padding: 0.35rem 0.6rem;
    background: var(--bg-secondary, #f1f5f9);
    border-left: 3px solid var(--brand-primary, #4a9eff);
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-secondary, #475569);
  }
`;

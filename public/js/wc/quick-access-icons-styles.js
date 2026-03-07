import { css } from 'https://unpkg.com/lit@3/index.js?module';

export const QuickAccessIconsStyles = css`
  :host {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .quick-icon {
    position: relative;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    transition: background-color 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .quick-icon:hover {
    background-color: rgba(255, 255, 255, 0.15);
  }

  .quick-icon svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
    opacity: 0.85;
  }

  .quick-icon:hover svg {
    opacity: 1;
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--color-danger, #dc3545);
    color: white;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 700;
    min-width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    line-height: 1;
  }

  .badge.zero {
    background: var(--color-muted, #6c757d);
    opacity: 0.5;
  }

  .quick-icon[title] {
    position: relative;
  }
`;

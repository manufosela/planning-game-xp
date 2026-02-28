import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const ThemeEditorStyles = css`
  :host {
    display: block;
    width: 100%;
    padding: 0.5rem;
    box-sizing: border-box;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  /* Header */
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .editor-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Buttons */
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background-color 0.2s, opacity 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: var(--brand-primary, #4a9eff);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--brand-primary-hover, #3a8eef);
  }

  .btn-secondary {
    background-color: var(--bg-tertiary, #e9ecef);
    color: var(--text-primary, #333);
    border: 1px solid var(--border-default, #dee2e6);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--bg-muted, #ddd);
  }

  .btn-danger {
    background-color: #dc3545;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background-color: #c82333;
  }

  /* Live preview toggle */
  .preview-toggle-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
    cursor: pointer;
    user-select: none;
  }

  .preview-toggle-label input[type="checkbox"] {
    width: auto;
    accent-color: var(--brand-primary, #4a9eff);
  }

  /* Dirty indicator */
  .dirty-badge {
    display: inline-block;
    background: var(--color-warning, #ffc107);
    color: #333;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    font-weight: 600;
  }

  /* Tab content */
  color-tabs {
    --tab-min-width: 100px;
    width: 100%;
  }

  .tab-content {
    padding: 1rem;
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  /* Section headers */
  .section-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 1rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-default, #dee2e6);
  }

  /* Color picker groups */
  .color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }

  .color-picker-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .color-picker-group label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary, #555);
  }

  .color-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  input[type="color"] {
    width: 40px;
    height: 36px;
    padding: 2px;
    border: 2px solid var(--border-default, #dee2e6);
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
  }

  input[type="color"]:hover {
    border-color: var(--brand-primary, #4a9eff);
  }

  .hex-input {
    width: 90px;
    padding: 0.5rem;
    border: 2px solid var(--border-default, #dee2e6);
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: monospace;
    text-transform: uppercase;
    box-sizing: border-box;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .hex-input:focus {
    outline: none;
    border-color: var(--brand-primary, #4a9eff);
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.25);
  }

  .hex-input.invalid {
    border-color: #dc3545;
    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.25);
  }

  .color-swatch {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 2px solid var(--border-default, #dee2e6);
    flex-shrink: 0;
  }

  /* Form groups for branding */
  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.4rem;
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--text-secondary, #555);
  }

  .form-group input[type="text"],
  .form-group input[type="url"] {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 2px solid var(--border-default, #dee2e6);
    border-radius: 6px;
    font-size: 0.9rem;
    box-sizing: border-box;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--brand-primary, #4a9eff);
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.25);
  }

  /* Features section */
  .feature-toggle {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary, #f8f9fa);
    border-radius: 8px;
    margin-bottom: 0.5rem;
  }

  .feature-toggle input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--brand-primary, #4a9eff);
    cursor: pointer;
  }

  .feature-toggle label {
    font-size: 0.9rem;
    cursor: pointer;
    user-select: none;
  }

  .feature-description {
    font-size: 0.8rem;
    color: var(--text-muted, #999);
    margin-top: 0.25rem;
  }

  /* Preview section */
  .preview-section {
    margin-top: 1.5rem;
    padding: 1rem;
    border: 2px dashed var(--border-default, #dee2e6);
    border-radius: 8px;
    background: var(--bg-secondary, #f8f9fa);
  }

  .preview-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .preview-status-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .status-pill {
    padding: 0.35rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 500;
    color: #333;
  }

  /* Section hint */
  .section-hint {
    font-size: 0.8rem;
    color: var(--text-muted, #999);
    margin: -0.5rem 0 1rem 0;
  }

  /* Auto button */
  .btn-auto {
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border-default, #dee2e6);
    border-radius: 6px;
    background: var(--bg-secondary, #f8f9fa);
    color: var(--text-secondary, #555);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
    flex-shrink: 0;
  }

  .btn-auto:hover {
    background: var(--brand-primary, #4a9eff);
    color: white;
    border-color: var(--brand-primary, #4a9eff);
  }

  /* Text color preview */
  .text-preview-cards {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .text-preview-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 1rem 2rem;
    border-radius: 8px;
    min-width: 120px;
    border: 2px solid var(--border-default, #dee2e6);
  }

  .text-preview-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .text-preview-text {
    font-size: 1.1rem;
    font-weight: 600;
  }

  /* Loading state */
  .loading {
    text-align: center;
    padding: 3rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .error-message {
    text-align: center;
    padding: 2rem;
    color: var(--color-error, #dc3545);
  }

  /* Responsive */
  @media (max-width: 600px) {
    .editor-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .color-grid {
      grid-template-columns: 1fr;
    }
  }
`;

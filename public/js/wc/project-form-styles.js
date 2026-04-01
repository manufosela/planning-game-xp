import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';

export const ProjectFormStyles = css`
  :host {
    display: block;
    width: 100%;
    padding: 0.5rem;
    box-sizing: border-box;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  /* Tabbed form styles */
  .tabbed-form {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  color-tabs {
    --tab-min-width: 80px;
    width: 100%;
  }

  .tab-content {
    padding: 1rem;
    height: 45dvh;
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .two-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .stacked {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
    color: var(--text-secondary);
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid var(--brand-secondary);
    border-radius: 8px;
    font-size: 1rem;
    box-sizing: border-box;
    background-color: var(--input-bg);
    color: var(--text-primary);
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--brand-secondary);
    box-shadow: var(--focus-ring);
  }

  .stakeholder-input {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .stakeholder-input input {
    flex: 1;
  }

  .stakeholder-input button {
    padding: 0.75rem 1rem;
    background-color: var(--brand-secondary);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .stakeholder-input button:hover {
    background-color: var(--brand-secondary-hover, #0056b3);
  }

  .stakeholder-input button:disabled {
    background-color: var(--text-disabled);
    cursor: not-allowed;
  }

  .developer-input {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .developer-input input {
    flex: 1;
  }

  .developer-input button {
    padding: 0.75rem 1rem;
    background-color: var(--brand-secondary);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .developer-input button:hover {
    background-color: var(--brand-secondary-hover, #0056b3);
  }

  .developer-input button:disabled {
    background-color: var(--text-disabled);
    cursor: not-allowed;
  }

  .developers-list {
    margin-top: 1rem;
  }

  .developer-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background-color: var(--bg-secondary);
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .developer-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .developer-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .developer-email {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .remove-developer {
    background: var(--color-error, #f43f5e);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .remove-developer:hover {
    background: var(--color-error-hover, #e11d48);
  }

  .empty-developers {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
    padding: 1rem;
    background-color: var(--bg-secondary);
    border-radius: 6px;
  }

  .stakeholders-list {
    margin-top: 1rem;
  }

  .stakeholder-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background-color: var(--bg-secondary);
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .stakeholder-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stakeholder-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .stakeholder-email {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .remove-stakeholder {
    background: var(--color-error, #f43f5e);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .remove-stakeholder:hover {
    background: var(--color-error-hover, #e11d48);
  }

  .empty-stakeholders {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
    padding: 1rem;
    background-color: var(--bg-secondary);
    border-radius: 6px;
  }

  .required {
    color: var(--color-error, #f43f5e);
  }

  .helper-text {
    margin-top: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .helper-text.warning {
    color: var(--color-error);
  }

  .helper-text.locked-hint {
    color: var(--text-warning, #b45309);
    font-style: italic;
  }

  .locked-field {
    background: var(--bg-tertiary);
    cursor: not-allowed;
    opacity: 0.7;
  }

  .error {
    color: var(--color-error, #f43f5e);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  input.error {
    border-color: var(--color-error, #f43f5e) !important;
    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.25);
    animation: shake 0.5s ease-in-out;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-5px); }
    40%, 80% { transform: translateX(5px); }
  }

  .edit-mode-notice {
    background-color: var(--status-info-bg);
    border: 1px solid var(--status-info-border);
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    text-align: center;
  }

  .edit-mode-notice p {
    margin: 0;
    color: var(--status-info-text);
    font-size: 0.9rem;
  }

  .checkbox-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .checkbox-group input[type="checkbox"] {
    width: auto;
    margin: 0;
  }

  .checkbox-group label {
    margin: 0;
    font-weight: normal;
    color: var(--text-secondary);
    cursor: pointer;
  }

  /* Share section */
  .share-section {
    margin-top: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    background: var(--bg-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .share-url-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .share-url-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .share-url-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .share-url-input {
    flex: 1;
    padding: 0.4rem 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    border: 1px solid var(--border-default);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    cursor: text;
  }

  .btn-copy {
    padding: 0.4rem 0.75rem;
    font-size: 0.78rem;
    border: 1px solid var(--border-default);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .btn-copy:hover { border-color: var(--accent-primary); color: var(--text-primary); }

  .share-token-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .token-label {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
  .token-label code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .btn-token {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
    border: 1px solid var(--accent-primary);
    border-radius: 4px;
    background: transparent;
    color: var(--accent-primary);
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-token:hover { background: var(--accent-primary); color: white; }
  .btn-token-remove { border-color: var(--status-error-text); color: var(--status-error-text); }
  .btn-token-remove:hover { background: var(--status-error-text); color: white; }

  .share-hint {
    font-size: 0.75rem;
    color: var(--text-dim);
  }

  /* Global config selectors */
  .config-selector {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    padding: 0.75rem;
    background: var(--bg-secondary);
  }

  .config-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .config-option:hover {
    background-color: var(--hover-overlay);
  }

  .config-option input[type="checkbox"] {
    width: auto;
    margin-top: 0.2rem;
  }

  .config-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .config-desc {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .no-options {
    color: var(--text-muted);
    font-style: italic;
    padding: 0.5rem 0;
  }

  .danger-zone {
    margin-top: 0;
    border: 2px solid var(--color-error);
    border-radius: 8px;
    padding: 1rem;
    background-color: var(--bg-secondary);
  }

  .danger-zone h3 {
    color: var(--color-error);
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
  }

  .danger-zone .warning-text {
    color: var(--status-error-text);
    margin-bottom: 1rem;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .delete-button {
    background-color: var(--color-error, #f43f5e);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .delete-button:hover {
    background-color: var(--color-error-hover, #e11d48);
  }

  .delete-confirmation {
    margin-top: 1rem;
    padding: 1rem;
    background-color: var(--status-error-bg);
    border: 1px solid var(--status-error-border);
    border-radius: 6px;
  }

  .delete-confirmation input {
    margin-top: 0.5rem;
  }

  .final-delete-button {
    background-color: var(--color-error, #f43f5e);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 6px;
    padding: 0.75rem 1.5rem;
    cursor: pointer;
    font-weight: bold;
    margin-top: 1rem;
  }

  .final-delete-button:disabled {
    background-color: var(--text-muted);
    cursor: not-allowed;
  }

  .final-delete-button:not(:disabled):hover {
    background-color: var(--color-error-hover, #e11d48);
  }

  /* Entity selection section styles */
  .entity-add-section {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .entity-add-section select {
    flex: 1;
    min-width: 200px;
  }

  .add-btn {
    padding: 0.75rem 1rem;
    background-color: var(--brand-secondary);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .add-btn:hover {
    background-color: var(--brand-secondary-hover, #0056b3);
  }

  .add-btn:disabled {
    background-color: var(--text-disabled);
    cursor: not-allowed;
  }

  .create-new-btn {
    padding: 0.75rem 1rem;
    background-color: var(--color-success, #10b981);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .create-new-btn:hover {
    background-color: var(--color-success-hover, #059669);
  }

  .create-entity-form {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background-color: var(--status-success-bg);
    border: 1px solid var(--status-success-border);
    border-radius: 8px;
  }

  .form-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .form-row input {
    flex: 1;
    min-width: 150px;
  }

  .create-btn {
    padding: 0.75rem 1rem;
    background-color: var(--color-success, #10b981);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .create-btn:hover {
    background-color: var(--color-success-hover, #059669);
  }

  .create-btn:disabled {
    background-color: var(--text-disabled);
    cursor: not-allowed;
  }

  .developer-id,
  .stakeholder-id {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: monospace;
    background-color: var(--bg-tertiary);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Repository section styles */
  .repo-single-section {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .repo-single-section input {
    flex: 1;
  }

  .add-repo-btn {
    padding: 0.75rem 1rem;
    background-color: var(--text-muted);
    color: var(--text-inverse);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .add-repo-btn:hover {
    background-color: var(--text-secondary);
  }

  .repositories-list {
    margin-bottom: 0.75rem;
  }

  .repository-item {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .repository-item.default-repo {
    border-color: var(--brand-secondary);
    background-color: var(--status-info-bg);
  }

  .repo-fields {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .repo-url-input {
    flex: 2;
    min-width: 200px;
  }

  .repo-label-input {
    flex: 1;
    min-width: 100px;
    max-width: 150px;
  }

  .default-badge {
    background-color: var(--brand-secondary);
    color: var(--text-inverse, white);
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    white-space: nowrap;
  }

  .remove-repo-btn {
    background-color: var(--color-error, #f43f5e);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-repo-btn:hover {
    background-color: var(--color-error-hover, #e11d48);
  }

  .add-another-repo-btn {
    padding: 0.5rem 1rem;
    background-color: var(--color-success, #10b981);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .add-another-repo-btn:hover {
    background-color: var(--color-success-hover, #059669);
  }

  /* Archive zone styles */
  .archive-zone {
    margin-top: 0;
    margin-bottom: 1.5rem;
    border: 2px solid var(--text-muted);
    border-radius: 8px;
    padding: 1rem;
    background-color: var(--bg-secondary);
  }

  .archive-zone h3 {
    color: var(--text-secondary);
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
  }

  .archive-zone .archive-info {
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .archive-zone ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .archive-zone li {
    margin-bottom: 0.25rem;
  }

  .archive-button {
    background-color: var(--text-muted);
    color: var(--text-inverse);
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }

  .archive-button:hover {
    background-color: var(--text-secondary);
  }

  .unarchive-button {
    background-color: var(--color-success, #10b981);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }

  .unarchive-button:hover {
    background-color: var(--color-success-hover, #059669);
  }

  /* ========================== */
  /* Apps Permissions Tab Styles */
  /* ========================== */

  .apps-permissions-info {
    background: var(--status-info-bg);
    border: 1px solid var(--status-info-border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
  }

  .apps-permissions-info p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .permission-section {
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .permission-section > label {
    display: block;
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .permission-section > .helper-text {
    margin-top: 0;
    margin-bottom: 0.75rem;
  }

  .permission-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .permission-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: 6px;
  }

  .permission-email {
    font-size: 0.9rem;
    color: var(--text-primary);
    word-break: break-all;
  }

  .remove-permission-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--status-error-bg);
    color: var(--color-error);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: bold;
    line-height: 1;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .remove-permission-btn:hover {
    background: var(--color-error);
    color: var(--text-inverse);
  }

  .empty-permission {
    padding: 0.75rem;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.9rem;
    background: var(--bg-primary);
    border: 1px dashed var(--border-default);
    border-radius: 6px;
  }

  .add-permission-form {
    display: flex;
    gap: 0.5rem;
  }

  .permission-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--input-bg);
    color: var(--text-primary);
  }

  .permission-input:focus {
    outline: none;
    border-color: var(--brand-secondary);
    box-shadow: var(--focus-ring);
  }

  .permission-select {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--input-bg);
    color: var(--text-primary);
    cursor: pointer;
  }

  .permission-select:focus {
    outline: none;
    border-color: var(--brand-secondary);
    box-shadow: var(--focus-ring);
  }

  .warning-text {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--status-warning-text);
    background: var(--status-warning-bg);
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--status-warning-border);
  }

  .info-text {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--status-info-text);
    background: var(--status-info-bg);
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--status-info-border);
  }

  .add-permission-btn {
    padding: 0.5rem 1rem;
    background: var(--brand-primary, #6366f1);
    color: var(--text-inverse, white);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    white-space: nowrap;
    transition: background 0.2s;
  }

  .add-permission-btn:hover:not(:disabled) {
    background: var(--brand-primary-hover, #4f46e5);
  }

  .add-permission-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .roles-info-box {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--status-info-bg);
    border: 1px solid var(--status-info-border);
    border-radius: 8px;
  }

  .roles-info-box h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.95rem;
    color: var(--status-info-text);
  }

  .roles-info-box ul {
    margin: 0;
    padding: 0 0 0 1.25rem;
    font-size: 0.85rem;
    color: var(--status-info-text);
    line-height: 1.6;
  }

  .roles-info-box .roles-note {
    margin: 0.75rem 0 0 0;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--status-warning-text);
  }

  .roles-info-box li {
    margin-bottom: 0.25rem;
  }

  .roles-info-box li:last-child {
    margin-bottom: 0;
  }

  /* Business Context section */
  .business-context-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .preview-toggle {
    background: none;
    border: 1px solid var(--border-default);
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .preview-toggle:hover {
    background: var(--bg-tertiary);
  }

  .markdown-preview {
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 12px;
    min-height: 200px;
    background: var(--bg-subtle);
    font-size: 0.9em;
    line-height: 1.6;
    overflow-y: auto;
    max-height: 400px;
    color: var(--text-primary);
  }

  .markdown-preview h1,
  .markdown-preview h2,
  .markdown-preview h3 {
    margin-top: 0.5em;
  }

  .markdown-preview code {
    background: var(--bg-tertiary);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .markdown-preview pre {
    background: var(--code-block-bg, #2d2d2d);
    color: var(--code-block-text, #f8f8f2);
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
  }

  .markdown-preview ul,
  .markdown-preview ol {
    padding-left: 20px;
  }

  /* Responsive for permissions */
  @media (max-width: 480px) {
    .add-permission-form {
      flex-direction: column;
    }

    .add-permission-btn {
      width: 100%;
    }
  }
`;

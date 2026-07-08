import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';

export const TaskTheme = css/*css*/`
  /* Repository badge styles */
  .repo-badge {
    display: inline-block;
    font-size: 0.65em;
    font-weight: 600;
    color: var(--text-inverse, white);
    padding: 0.1em 0.4em;
    border-radius: 3px;
    margin-left: 0.4em;
    vertical-align: middle;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  :host([expanded]) .field-group-row {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-sm) 5rem;
    flex: 1;
    align-items: center;
  }

  :host([expanded]) .status-points-row,
  :host([expanded]) .epic-dev-validator-row {
    display: flex;
    align-items: center;
  }

  :host([expanded]) .dev-codev-validator-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  :host([expanded]) .dev-codev-validator-row .field-horizontal {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  :host([expanded]) .dev-codev-validator-row .field-horizontal label {
    width: auto;
    min-width: 70px;
    text-align: right;
    font-weight: bold;
    color: var(--primary-color);
    font-size: 0.85em;
    margin: 0;
    white-space: nowrap;
  }

  :host([expanded]) .dev-codev-validator-row .field-horizontal select {
    flex: 1;
    min-width: 0;
    padding: 0.3rem;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    background: var(--input-bg);
    font-size: 0.85em;
  }

  :host([expanded]) .epic-repo-row {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  :host([expanded]) .epic-repo-row .field-horizontal {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
  }

  :host([expanded]) .epic-repo-row .field-horizontal label {
    width: auto;
    min-width: 40px;
    text-align: right;
    font-weight: bold;
    color: var(--primary-color);
    font-size: 0.85em;
    margin: 0;
    white-space: nowrap;
  }

  :host([expanded]) .epic-repo-row .field-horizontal select {
    flex: 1;
    min-width: 0;
    padding: 0.3rem;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    background: var(--input-bg);
    font-size: 0.85em;
  }

  :host([expanded]) .field-horizontal {
    display: flex;
    align-items: center;
  }

  :host([expanded]) .status-points-row .field-horizontal label,
  :host([expanded]) .epic-dev-validator-row .field-horizontal label {
    width: 120px;
    text-align: right;
    font-weight: bold;
    color: var(--primary-color);
    font-size: 0.95em;
    margin: 0;
    white-space: nowrap;
  }

  :host([expanded]) .status-points-row .field-horizontal select,
  :host([expanded]) .epic-dev-validator-row .field-horizontal select {
    width: 200px;
    padding: 0.4rem;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    background: var(--input-bg);
  }

  :host([expanded]) input,
  :host([expanded]) select,
  :host([expanded]) textarea {
    border: 1px solid var(--input-border);
  }

  :host([expanded]) .dates-group .field-group-row {
    gap: var(--spacing-sm) 1rem;
  }

  :host([expanded]) .field-group-row label {
    width: 147px;
    text-align: right;
    font-weight: bold;
    color: var(--primary-color);
    font-size: 0.95em;
    margin: 0;
    white-space: nowrap;
  }
  :host {
    display: block;
    width: 300px;
    max-width: 300px;
    margin: var(--spacing-sm);
  }

  :host * {
    box-sizing: border-box;
  }

  /* Card container específicos de tasks */
  .card-container.blocked {
    border: 2px solid var(--danger-color);
  }

  .card-container.expedited {
    border: 2px solid var(--color-warning, #ffc107);
  }

  /* Header específico de tasks - Ajustes mínimos */
  :host(:not([expanded])) .card-header {
    border-bottom: 1px solid var(--bg-border);
  }

  .card-id {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    margin-right: 0.25rem;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .expedited-icon {
    color: var(--color-warning, #ffc107);
    font-size: var(--font-size-xl);
    margin-left: var(--spacing-sm);
    flex-shrink: 0;
  }

  .card-body {
    height: 140px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    overflow: visible;
    justify-content: flex-start;
    flex-shrink: 0;
  }

  /* Sprint info específico - Altura fija para uniformidad */
  .sprint-info {
    background: var(--bg-muted, #475569);
    height: 32px;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    margin-bottom: var(--spacing-xs);
    flex-shrink: 0;
  }

  .sprint-info:empty {
    background: transparent;
    height: 32px;
    margin-bottom: var(--spacing-xs);
  }

  .sprint-label {
    color: var(--text-muted, #94a3b8);
    font-weight: 500;
    flex-shrink: 0;
  }

  .sprint-value {
    color: var(--text-white);
    background: var(--bg-muted, #475569);
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Points info - Altura fija para uniformidad */
  .points-info {
    height: 28px;
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    margin-bottom: var(--spacing-xs);
    flex-shrink: 0;
  }

  .points-info:empty {
    height: 28px;
    margin-bottom: var(--spacing-xs);
  }

  .points {
    background: var(--bg-muted);
    padding: 0.25rem var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    font-weight: 500;
    height: 24px;
    display: flex;
    align-items: center;
  }

  .business-points {
    background: var(--accent-color);
    color: var(--text-white);
  }

  .dev-points {
    background: var(--warning-color);
    color: var(--text-white);
  }

  .priority-points {
    background: var(--brand-secondary, #10b981);
    color: var(--text-white);
    font-weight: bold;
    margin-left: auto;
  }

  /* Priority container - descriptive priority display */
  /* Background color is set dynamically via inline style based on priority rank */
  .priority-container {
    display: flex;
    align-items: center;
    position: relative;
    margin-left: auto;
  }

  .priority-label {
    /* Default fallback - actual color set via inline style for gradient effect */
    background: var(--brand-secondary, #10b981);
    color: var(--text-inverse, white);
    font-weight: bold;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .priority-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: rgba(0, 0, 0, 0.5);
    color: var(--text-inverse, white);
    font-size: 0.65rem;
    padding: 1px 4px;
    border-radius: 6px;
    font-weight: 500;
  }

  .priority-container.no-priority .priority-label {
    background: var(--bg-muted) !important;
    color: var(--text-secondary);
    font-style: italic;
    font-weight: normal;
  }

  /* Ultra-compact priority styles */
  /* Background color is set dynamically via inline style based on priority rank */
  .uc-priority.no-priority {
    background: var(--bg-muted) !important;
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Blocked info - Altura fija para uniformidad */
  .blocked-info {
    height: 24px;
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    justify-content: flex-start;
    flex-shrink: 0;
    margin-bottom: var(--spacing-xs);
    overflow: visible;
    position: relative;
  }

  .blocked-info:empty {
    height: 24px;
    margin-bottom: var(--spacing-xs);
  }

  .blocked {
    font-size: var(--font-size-xl);
  }

  /* Estilos para indicadores de bloqueo compactos */
  .blocked-compact {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    cursor: help;
    padding: 0.1rem 0.3rem;
    border-radius: var(--radius-sm);
    transition: background 0.2s ease;
  }

  .blocked-compact.business {
    color: var(--color-error, #f43f5e);
    background: var(--status-error-bg, rgba(220, 53, 69, 0.1));
  }

  .blocked-compact.business:hover {
    background: rgba(244, 63, 94, 0.2);
  }

  .blocked-compact.development {
    color: var(--color-info, #3b82f6);
    background: var(--status-info-bg, rgba(0, 102, 204, 0.1));
  }

  .blocked-compact.development:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  /* Tooltips personalizados para indicadores de bloqueo */
  .has-tooltip {
    position: relative;
  }

  /* Tooltips personalizados para indicadores de bloqueo */
  .custom-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.9);
    color: var(--text-inverse, white);
    padding: 12px !important;
    border-radius: 4px;
    font-size: 0.9rem;
    line-height: 1.4;
    white-space: normal;
    word-wrap: break-word;
    max-width: 350px;
    min-width: 200px;
    width: max-content;
    height: auto;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease, transform 0.3s ease;
    transform: translateX(-50%) translateY(-4px);
    pointer-events: none;
    box-sizing: border-box !important;
  }

  .custom-tooltip * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .custom-tooltip strong {
    display: block !important;
    font-weight: bold !important;
    margin-bottom: 6px !important;
    color: var(--color-warning, #fbbf24) !important;
    padding: 0 !important;
  }

  .custom-tooltip div {
    margin-top: 6px !important;
    padding: 0 !important;
  }

  .custom-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.9);
  }

  .has-tooltip:hover .custom-tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
  }

  /* Ajuste para tooltips en blocked-info para evitar que se corten */
  .blocked-info .custom-tooltip {
    left: 0;
    right: 0;
    transform: none;
    margin-left: -3rem;
    margin-right: -3rem;
    padding: 25px !important;
    box-sizing: border-box !important;
  }

  .blocked-info .has-tooltip:hover .custom-tooltip {
    transform: translateY(0);
  }

  .blocked-info .custom-tooltip::after {
    left: 2rem;
    transform: translateX(0);
  }

  /* Para tooltips muy anchos, usar posicionamiento inteligente */
  @media (max-width: 400px) {
    .blocked-info .custom-tooltip {
      left: -50px;
      right: -50px;
      margin-left: 0;
      margin-right: 0;
      padding: 12px !important;
      box-sizing: border-box !important;
    }
  }


  /* Footer - Layout flexbox */
  .card-footer {
    height: 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 1px solid var(--bg-border);
    background: var(--bg-white);
    flex-shrink: 0;
    margin-top: auto;
  }

  .expanded-footer {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: var(--spacing-md);
    z-index: var(--z-index-elevated);
    width: 100%;
  }

  /* Status específicos de tasks */
  .status[class*="todo"],
  .status[class*="to-do"] {
    background: var(--status-todo, #94a3b8);
    color: var(--status-todo-text, #ffffff);
  }

  .status[class*="progress"],
  .status[class*="in-progress"] {
    background: var(--status-in-progress, #3b82f6);
    color: var(--status-in-progress-text, #ffffff);
  }

  .status[class*="validate"],
  .status[class*="to-validate"] {
    background: var(--status-to-validate, #f59e0b);
    color: var(--status-to-validate-text, #ffffff);
  }

  .status[class*="done"] {
    background: var(--status-done, #10b981);
    color: var(--status-done-text, #ffffff);
  }

  .status[class*="blocked"] {
    background: var(--status-blocked, #f43f5e);
    color: var(--status-blocked-text, #ffffff);
  }

  .developer {
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .co-developer {
    font-size: 0.8rem;
    color: var(--text-muted, #6c757d);
    font-style: italic;
    margin-left: 0.25rem;
  }

  /* Estilos para el modo expandido */
  :host([expanded]) {
    width: 100%;
    max-width: 100%;
    margin: 0;
  }

  :host([expanded]) .card {
    height: auto;
    padding: 0;
    border: none;
    box-shadow: none;
  }

  :host([expanded]) .expanded-fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-sm);
    padding: var(--spacing-sm);
  }

  :host([expanded]) .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    flex: 1;
  }


  /* Estilos específicos solo para la primera línea */
  :host([expanded]) .field-group.status-group {
    flex: 0 0 25%;
  }

  :host([expanded]) .field-group.title-group {
    flex: 0 0 50%;
  }

  :host([expanded]) .field-group.points-group {
    flex: 0 0 25%;
  }

  :host([expanded]) .points-input {
    flex: 1;
    display: flex;
    flex-direction: row;
    gap: var(--spacing-sm);
  }

  :host([expanded]) .field-group-row .points-input {
    margin-top: var(--spacing-sm);
  }

  :host([expanded]) .field-group-row .points-input label {
    text-align: left;
  }

  :host([expanded]) .field-group label {
    font-size: 0.9rem;
    color: var(--primary-color);
    text-align: left;
  }

  :host([expanded]) .field-group select,
  :host([expanded]) .field-group input,
  :host([expanded]) .status-select {
    width: 100%;
    padding: var(--spacing-sm);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--input-bg);
  }

  /* Opciones deshabilitadas en selects (ej: Done&Validated) */
  :host([expanded]) .status-select option:disabled {
    color: var(--text-disabled, #999);
    background-color: var(--bg-tertiary, #f5f5f5);
    font-style: italic;
  }

  :host([expanded]) .title-input {
    width: 100%;
    padding: var(--spacing-sm);
    border: 0;
    text-align: center;
    font-size: var(--font-size-xl);
    margin-top: var(--spacing-sm);
  }

  :host([expanded]) .points-input input {
    width: 100%;
    height: 2rem;
    text-align: center;
    margin: 0;
  }

  /* Checkboxes específicos */
  :host([expanded]) .checkboxes-group {
    display: flex;
    gap: 3rem;
    margin: 0;
    margin-bottom: var(--spacing-md);
    padding: 0;
    background: var(--bg-light);
    align-items: flex-start;
    height: 3rem;
  }

  :host([expanded]) .checkbox-item {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-sm);
    flex: 1;
    height: 3rem;
    align-items: center;
    justify-content: center;
  }

  :host([expanded]) .checkbox-item-col {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    flex: 1;
    height: 6rem;
  }

  :host([expanded]) .checkbox-item > div, :host([expanded]) .checkbox-item-col > div {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  :host([expanded]) .checkbox-item input[type="checkbox"], :host([expanded]) .checkbox-item-col input[type="checkbox"] {
    margin: 0;
    height: 1.2rem;
    width: 1.2rem;
  }

  :host([expanded]) .checkbox-item label, :host([expanded]) .checkbox-item-col label {
    margin: 0;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  :host([expanded]) .checkbox-item select, :host([expanded]) .checkbox-item-col select, :host([expanded]) .checkbox-item-col textarea {
    width: 100%;
    opacity: 0;
    height: 0;
    padding: 0;
    margin: 0;
    border: none;
    pointer-events: none;
    transition: all var(--transition-normal) ease;
  }

  :host([expanded]) .checkbox-item select.visible, :host([expanded]) .checkbox-item-col select.visible, :host([expanded]) .checkbox-item-col textarea.visible {
    opacity: 1;
    height: 2rem;
    padding: 0.25rem;
    margin-top: var(--spacing-sm);
    border: 1px solid var(--input-border);
    pointer-events: auto;
  }

  /* Inline checkboxes for Spike/Expedited next to Epic */
  :host([expanded]) .epic-repo-row .checkbox-inline-group {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-lg);
    align-items: center;
    padding-right: var(--spacing-md);
  }

  :host([expanded]) .epic-repo-row .checkbox-inline-group .checkbox-inline {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }

  :host([expanded]) .epic-repo-row .checkbox-inline-group .checkbox-inline input[type="checkbox"] {
    margin: 0;
    height: 1.1rem;
    width: 1.1rem;
    flex-shrink: 0;
  }

  :host([expanded]) .epic-repo-row .checkbox-inline-group .checkbox-inline label {
    margin: 0;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
    display: inline;
    width: auto;
    min-width: auto;
    text-align: left;
    color: var(--text-primary);
  }

  /* ===========================================
     FORM ROW SYSTEM - Styled compact layout
     =========================================== */

  /* Base form row - styled horizontal layout */
  :host([expanded]) .form-row {
    display: flex;
    gap: var(--spacing-lg);
    align-items: center;
    padding: 0.5rem 0.75rem;
    margin: 0 1rem 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--primary-color);
  }

  :host([expanded]) .form-row.compact-row {
    flex-wrap: wrap;
  }

  /* Inline form field - label and input side by side */
  :host([expanded]) .form-row .form-field.inline {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  /* Labels - consistent with blocked row */
  :host([expanded]) .form-row .form-field.inline label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--primary-color);
    margin: 0;
    white-space: nowrap;
  }

  /* Inputs - styled sizing */
  :host([expanded]) .form-row .form-field.inline select {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    font-size: 0.9rem;
    height: 2.1rem;
    min-width: 80px;
    max-width: 160px;
  }

  :host([expanded]) .form-row .form-field.inline input[type="date"] {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    font-size: 0.9rem;
    height: 2.1rem;
    width: 135px;
  }

  :host([expanded]) .form-row .form-field.inline select:focus,
  :host([expanded]) .form-row .form-field.inline input:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
    outline: none;
  }

  :host([expanded]) .form-row .form-field.inline select:disabled,
  :host([expanded]) .form-row .form-field.inline input:disabled {
    background: var(--bg-secondary);
    cursor: not-allowed;
    opacity: 0.7;
  }

  /* Checkbox field - styled inline */
  :host([expanded]) .form-row .form-field.checkbox-field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    padding: 0.35rem 0.6rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
  }

  :host([expanded]) .form-row .form-field.checkbox-field input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
    cursor: pointer;
  }

  :host([expanded]) .form-row .form-field.checkbox-field label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    margin: 0;
  }

  /* Readonly field display */
  :host([expanded]) .form-row .readonly-field {
    padding: 0.35rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default, #e9ecef);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    height: 2.1rem;
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    min-width: 80px;
    max-width: 150px;
  }

  /* Blocked fields row - only visible when status is Blocked */
  :host([expanded]) .blocked-fields-row {
    display: flex;
    gap: var(--spacing-lg);
    padding: var(--spacing-md);
    margin: 0 1rem var(--spacing-md) 1rem;
    background: var(--status-error-bg, #fff5f5);
    border: 1px solid var(--status-error-border, #f8d7da);
    border-radius: var(--radius-md);
    border-left: 4px solid var(--danger-color);
  }

  :host([expanded]) .blocked-field-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  :host([expanded]) .blocked-field-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  :host([expanded]) .blocked-field-header input[type="checkbox"] {
    margin: 0;
    height: 1.1rem;
    width: 1.1rem;
  }

  :host([expanded]) .blocked-field-header label {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
  }

  :host([expanded]) .blocked-field-header select {
    flex: 1;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    height: 2.1rem;
    margin: 0;
    background: var(--input-bg);
    min-width: 120px;
  }

  :host([expanded]) .blocked-field-group textarea {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    resize: none;
    margin-top: var(--spacing-sm);
    background: var(--input-bg);
  }

  :host([expanded]) .blocked-field-header select:disabled,
  :host([expanded]) .blocked-field-group textarea:disabled {
    background: var(--bg-tertiary, #f0f0f0);
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* Dates group */
  :host([expanded]) .dates-group {
    display: flex;
    gap: var(--spacing-md);
    margin: 0;
    padding: var(--spacing-md);
    align-items: flex-end;
  }

  :host([expanded]) .dates-group .field-group {
    flex: 1;
  }

  /* Footer expandido */
  :host([expanded]) .card-footer {
    display: flex;
    justify-content: center;
    padding: var(--spacing-md);
    margin: 0;
    border: none;
  }

  :host([expanded]) .save-button {
    padding: var(--spacing-sm) var(--spacing-xl);
    background: var(--brand-primary, #6366f1);
    color: var(--text-white);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    height: 2.5rem;
    width: 10rem;
    margin: 0;
  }

  :host([expanded]) .save-button:hover {
    background: var(--brand-primary-hover, #4f46e5);
  }

  :host([expanded]) .save-button:disabled {
    background: var(--bg-muted, #ccc);
    cursor: not-allowed;
  }

  /* Card top y title - Altura fija para uniformidad */
  .card-top {
    height: 24px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
    font-size: var(--font-size-sm);
    flex-shrink: 0;
    width: 100%;
  }

  .card-title {
    height: 40px;
    font-weight: bold;
    font-size: var(--font-size-md);
    line-height: 1.3;
    word-break: break-word;
    width: 100%;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-line-clamp: 2;
    cursor: help;
    position: relative;
    flex-shrink: 0;
  }

  /* Tooltip para título completo */
  .card-title:hover::after {
    content: attr(title);
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    color: var(--text-inverse, white);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    line-height: 1.4;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    white-space: normal;
    word-wrap: break-word;
    max-width: 280px;
    animation: tooltip-fade-in 0.2s ease-out;
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .card-actions button {
    margin:0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: 2px;
    border-radius: 2px;
    transition: background-color 0.2s;
  }

  .card-actions button:hover {
    background: rgba(0,0,0,0.1);
  }

  .attachment-indicator,
  .related-tasks-indicator {
    font-size: var(--font-size-sm);
    opacity: 0.7;
  }


  /* Spike badge - Investigación técnica */
  .spike-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    background: var(--status-expedited, #8b5cf6);
    color: var(--text-inverse, #ffffff);
    font-weight: bold;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.75em;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    letter-spacing: 0.5px;
    z-index: 10;
  }

  .card-container.selected .spike-badge {
    box-shadow: 0 0 0 2px var(--secondary-color);
  }

  :host([expanded]) .spike-badge {
    top: 2px;
    left: 10px;
    right: auto;
  }

  /* Cuando hay spike y expedit, ajustar posiciones */
  .card-container.spike .expedit-badge {
    right: 55px;
  }

  :host([expanded]) .card-container.spike .expedit-badge {
    left: 70px;
    right: auto;
  }

  /* Expedited badge - Posicionado en card-container */
  .expedit-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    background: var(--color-warning, #ffc107);
    color: var(--text-inverse, #000);
    font-weight: bold;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.75em;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    letter-spacing: 0.5px;
    z-index: 10;
  }

  .card-container {
    position: relative;
  }

  .card-container.selected .expedit-badge {
    box-shadow: 0 0 0 2px var(--secondary-color);
  }

  .expanded-badge-container {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  :host([expanded]) .expedit-badge {
    top: 2px;
    left: 70px;
    right: auto;
  }

  /* Title row with plan badge */
  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .title-row .title {
    flex: 1;
    min-width: 0;
  }

  /* nocode badge — neutral style, deliberately not a status color (PLN-TSK-0354) */
  .nocode-badge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary, #e2e8f0);
    color: var(--text-secondary, #475569);
    border: 1px solid var(--border-default, #cbd5e1);
    font-size: 0.7em;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: lowercase;
    white-space: nowrap;
  }

  :host([expanded]) .nocode-badge {
    font-size: 0.75em;
  }

  /* Implementation plan status badge */
  .plan-badge {
    display: inline-block;
    font-size: 0.65em;
    font-weight: 600;
    padding: 0.15em 0.45em;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.02em;
    line-height: 1.4;
    margin-top: 0.15em;
  }

  /* ===========================================
     REQUIRED FIELDS - Asterisk indicator
     =========================================== */
  label.required::after,
  .tab-button.required::after {
    content: ' *';
    color: var(--error-color, #dc3545);
    font-weight: bold;
  }

  /* Invalid field styles - enhanced */
  .invalid-field {
    border-color: var(--error-color, #dc3545) !important;
    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.25) !important;
    animation: shake 0.3s ease-in-out;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }

  /* Tab buttons when invalid */
  .tab-button.invalid-field {
    border-bottom: 2px solid var(--error-color, #dc3545) !important;
    color: var(--error-color, #dc3545) !important;
  }

  /* Implementation Notes panel (MCP-generated development summary) */
  .implementation-notes-panel {
    padding: 1rem;
    background: var(--color-success-light);
    border-radius: 8px;
  }

  .implementation-notes-content {
    max-height: 400px;
    overflow-y: auto;
  }

  .implementation-notes-text {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    background: var(--input-bg);
    padding: 1rem;
    border-radius: 4px;
    border: 1px solid var(--status-success-border, #bbf7d0);
    margin: 0;
    text-align: left;
  }

  /* Plan tab */
  .specs-plan-container {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Plan section */
  .plan-section {
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 12px;
  }

  .plan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .plan-header h4 {
    margin: 0;
    font-size: 0.95em;
    color: var(--text-primary);
  }

  .plan-status-select {
    padding: 4px 8px;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 0.85em;
  }

  .plan-field {
    margin-bottom: 10px;
  }

  .plan-field label {
    display: block;
    font-size: 0.8em;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .plan-field textarea,
  .plan-field input[type="text"] {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 0.85em;
    font-family: inherit;
    box-sizing: border-box;
    resize: vertical;
  }

  .plan-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /* Plan steps */
  .plan-steps-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .plan-step {
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 8px;
    background: var(--bg-subtle);
  }

  .plan-step.done {
    border-color: var(--status-success-border, #86efac);
    background: var(--color-success-light);
  }

  .plan-step.in_progress {
    border-color: var(--status-info-border, #93c5fd);
    background: var(--status-info-bg, #eff6ff);
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .step-number {
    font-weight: 700;
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .step-header select {
    padding: 2px 6px;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 0.8em;
  }

  .remove-step-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--color-error, #ef4444);
    cursor: pointer;
    font-size: 1.2em;
    padding: 0 4px;
  }

  .add-step-btn {
    margin-top: 4px;
    padding: 4px 10px;
    background: var(--bg-secondary);
    border: 1px dashed var(--border-default, #d1d5db);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .add-step-btn:hover {
    background: var(--bg-tertiary);
  }

  .empty-steps {
    color: var(--text-placeholder);
    font-style: italic;
    font-size: 0.85em;
    padding: 8px;
    text-align: center;
  }

  /* Reopen cycles section */
  .reopen-info {
    margin-top: var(--spacing-md);
    background: var(--status-warning-bg, #fef3c7);
    border: 1px solid var(--color-warning, #f59e0b);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm);
  }

  .reopen-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    user-select: none;
  }

  .reopen-header:hover {
    opacity: 0.8;
  }

  .reopen-badge {
    background: var(--color-error, #dc2626);
    color: var(--text-inverse, white);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
  }

  .reopen-toggle {
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  .reopen-cycles-list {
    margin-top: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding-left: var(--spacing-md);
    border-left: 2px solid var(--color-warning, #f59e0b);
  }

  .reopen-cycle-item {
    font-size: 0.8rem;
    color: var(--text-secondary);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--hover-overlay, rgba(255, 255, 255, 0.6));
    border-radius: var(--radius-sm);
  }

  .reopen-cycle-item span {
    display: block;
    line-height: 1.4;
  }
`;

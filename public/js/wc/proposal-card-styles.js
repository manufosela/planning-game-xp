import { css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import { ThemeVariables, BaseCardStyles, BaseTabStyles } from '../ui/styles/index.js';

const ProposalCardSpecificStyles = css`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  :host {
    background: var(--card-bg);
    box-shadow: var(--card-shadow);
    cursor: pointer;
    transition: transform 0.2s;
    width: 300px;
    max-width: 300px;
    height: 320px;
    min-height: 320px;
    box-sizing: border-box;
    border-radius: 8px;
    --description-color: #4caf50;
    --acceptanceCriteria-color: #2196f3;
    --notes-color: #ff9800;
  }

  :host(:hover) {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(236,62,149,0.3);
  }

  :host([selected]) {
    border: 2px solid #4a9eff;
  }

  :host([expanded]) {
    width: 100%;
    max-width: 100%;
    cursor: default;
    border:0;
    border-radius: 0;
  }

  .card-header {
    display: flex;
    gap: 0.8rem;
    justify-content: space-between;
    align-items: flex-start;
    flex-grow: 1;
    margin-bottom: 1rem;
    padding: 1rem;
  }

  .status {
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--bg-tertiary);
    font-size: 0.8em;
  }

  .copy-link-button {
    background: transparent;
    border: none;
    box-shadow: none;
    color: inherit;
    font-size: 1.3em;
    cursor: pointer;
    padding: 0;
    margin: 0;
    transition: background 0.2s;
  }

  .copy-link-button:focus {
    outline: 2px solid #4a9eff;
  }

  .copy-link-button:hover {
    background: rgba(0,0,0,0.05);
  }

  /* Proposal already approved as a dev plan (PLN-TSK-0358) */
  .converted-badge {
    align-self: center;
    background: var(--brand-primary, #4a9eff);
    border-radius: 10px;
    color: #fff;
    font-family: var(--font-mono, monospace);
    font-size: 0.75em;
    font-weight: 600;
    padding: 0.1rem 0.5rem;
    text-decoration: none;
    white-space: nowrap;
  }

  .converted-badge:hover {
    filter: brightness(1.1);
  }

  .converted-note {
    color: var(--text-secondary, #6b7280);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9em;
    margin: 1rem;
  }

  .approve-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1rem;
  }

  .priority {
    font-size: 1.5em;
    font-weight: bold;
    color: #4a9eff;
    text-align: right;
  }

  .points {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    justify-content: flex-end;
  }

  .business-points {
    background: #4caf50;
    color: var(--text-on-primary, #fff);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 1rem;
  }

  .dev-points {
    background: #ff9800;
    color: var(--text-on-primary, #fff);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 1rem;
  }

  h3 {
    margin: 0 0 8px 0;
    color: var(--text-primary);
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dates {
    font-size: 0.8em;
    color: var(--text-muted);
    margin-top: 8px;
  }

  .expanded-content {
    display: none;
  }

  :host([expanded]) .expanded-content {
    display: flex;
    flex-direction: column;
    padding: 1rem;
  }

  input, select {
    padding: 0.5rem;
    margin: 0.2rem 0;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text-primary);
  }

  input[type="number"] {
    max-width: 10rem;
  }

  select {
    padding: 0.2rem 1rem;
    margin: 0.5rem;    
  }

  .labelNumber {
    display:flex;
    align-items: center;
  }

  button {
    background: #4a9eff;
    color: var(--text-on-primary, #fff);
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 16px;
  }

  button:hover {
    background: #3a8eef;
  }

  label {
    font-weight: bold;
  }

  .developerContainer {
    display: grid;
    grid-template-columns: 2fr 3fr 2fr 2fr; /* cuatro columnas */
    gap: 1rem; /* Espaciado entre elementos */
    padding: 0 1rem;
    height: 4rem;
    align-items: flex-start;
  }
  .developerContainer .groupContainer {
    display: flex;
    gap:0.5rem;
    height: 2.5rem;
    align-items: center;
  }

  .developerContainer .groupContainer select {
    max-width: 12rem;
  }
  .developerContainer .groupContainer input[type=number] {
    max-width: 3rem;
  }



  .blockedContainer {
    display: grid;
    grid-template-columns: 1fr 2fr 2fr; /* tres columnas iguales */
    gap: 3rem; /* Espaciado entre elementos */
    padding: 0 1rem;
    height: 6rem;
    align-items: flex-start;
  }

  .blockedContainerChild {
    display: grid;
    grid-template-columns: 2rem auto; /* dos columnas para label, checkbox y contenido */
    gap: 0px; /* Espaciado entre elementos */
    align-items: flex-start;
  }

  .blockedContainerChild label {
    min-width: 9rem; /* Fija el ancho del label */
    font-weight: bold;
    margin-top: 0.7rem;
    text-align: left;
  }

  .blockedContainerChild > div {
    display:flex;
    flex-direction: column;
    grid-column: span 2; /* Ocupa las dos columnas */
  }

  .blockedContainerChild input[type="checkbox"] {
    width: 20px;
    height: 20px;
    flex-shrink: 0; /* Evita que el checkbox cambie de tamaño */
  }

  .blockedDetails {
    display: grid;
    grid-template-columns: 1fr 1fr; /* Dos columnas iguales para los detalles */
    gap: 8px;
    align-items: center;
    transition: opacity 0.3s ease-in-out;
  }

  .blockedDetails.hidden {
    opacity: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .blockedContainerChild input[type="checkbox"] {
    cursor: pointer;
    margin: 0.8rem 0;
  }

  .blockedContainerChild .blockedDetails {
    display: flex;
    gap: 8px; /* Espaciado entre los campos */
    align-items: center; /* Alinear elementos */
    margin-left: 10px; /* Espacio adicional si es necesario */
  }

  .blockedContainerChild input[type="text"] {
    padding: 5px;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 1rem;
    background: var(--input-bg);
    color: var(--text-primary);
  }

  .blockedContainerChild p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .blockedWho {
    margin:0;
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .title {
    border:0;
    font-size: 1.5em;
    text-align: center;
  }

  .cardid {
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .cardidexpanded {
    font-size: 0.8em;
    color: var(--text-muted);
    position:absolute;
    text-align: center;
    left: 40%;
  }

  .hidden {
    opacity: 0;
    height: 0;
    overflow: hidden;
    transition: opacity 1s ease-in-out;
  }

  .card-actions {
    display: flex;
    margin: 0;
    padding: 0;
  }

  .delete-button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.5rem;
    color: #d9534f;
    margin: 0;
    padding: 0;
  }

  .delete-button:hover {
    color: #c9302c;
    font-size:1 rem;
  }

  .inprogress {
    background: #ff9800;
  }

  .tovalidate {
    background: #ffeb3b;
  }

  .done {
    background: #2CFF1E;
    font-weight: bold;
  }

  .todo {
    background: #ec3e95;
    color: var(--text-on-secondary, #fff);
  }


  .blocked {
    background: #ccc;
    opacity: 0.5;
    border-radius: 8px;
  }
  .expedit {
    background: #ec3e95;
    color: var(--text-on-secondary, #fff);
    border-radius: 8px;
  }
  .expedit span:first-child {
    font-weight: bold;
    border: 1px solid #fff;
    border-radius: 4px;
  }

  .sprint {
    background-color: #151efb;
    color: var(--text-on-primary, #fff);
    padding: 3px;
    border-radius: 4px;
  }

  /* tabs */
  .tabs {
    display: flex;
    gap: 10px;
  }
  .tab-button {
    padding: 10px 15px;
    cursor: pointer;
    border: none;
    border-radius: 5px 5px 0 0;
    font-size: 1.2rem;
  }
  .tab-button.active {
    color: var(--text-on-primary, #fff);
    font-weight: bold;
  }
  .tab-button:hover {
    background: #777;
  }
  .tab-content {
    border: 4px solid var(--description-color);
    padding: 0;
    background: var(--bg-primary);
    border-radius: 0 0 5px 5px;
    font-size: 1.2rem;
  }
  textarea {
    width: 100%;
    height: 200px;
    font-size: 1.2rem;
    border: 0;
  }
  textarea:focus {
    outline: none;
  }

  .description {
    background-color: var(--description-color);
  }
  .ta-description {
    border: 4px solid var(--description-color);
  }
  .acceptancecriteria {
    background-color: var(--acceptanceCriteria-color);
  }
  .ta-acceptanceCriteria {
    border: 4px solid var(--acceptanceCriteria-color);
  }
  .notes {
    background-color: var(--notes-color);
  }
  .ta-notes {
    border: 4px solid var(--notes-color);
  }

  /* Estilos para formularios expandidos */
  .expanded-fields {
    padding: var(--spacing-md);
    background: var(--bg-white);
    margin-bottom: var(--spacing-md);
  }

  .field-group-row {
    display: flex;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-md);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--spacing-xs);
  }

  .field-group label {
    font-weight: bold;
    color: var(--primary-color);
    font-size: 0.95em;
    margin-bottom: var(--spacing-xs);
  }

  .field-group select,
  .field-group input {
    padding: var(--spacing-sm);
    border: 1px solid var(--bg-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    background: var(--input-bg);
    color: var(--text-primary);
  }

  /* Estilos para campos inválidos */
  .invalid-field {
    border: 2px solid #ff4444 !important;
    box-shadow: 0 0 0 0.25rem rgba(255, 68, 68, 0.3) !important;
    background-color: rgba(255, 68, 68, 0.05) !important;
  }

  .invalid-field:focus {
    border-color: #ff4444 !important;
    box-shadow: 0 0 0 0.25rem rgba(255, 68, 68, 0.5) !important;
    background-color: rgba(255, 68, 68, 0.08) !important;
  }

  .tab-button.invalid-field {
    border: 2px solid #ff4444 !important;
    box-shadow: 0 0 0 0.15rem rgba(255, 68, 68, 0.3) !important;
  }

  input.title.invalid-field {
    border: 2px solid #ff4444 !important;
    box-shadow: 0 0 0 0.25rem rgba(255, 68, 68, 0.3) !important;
    background-color: rgba(255, 68, 68, 0.05) !important;
  }

  /* Estilos para descripción estructurada (Como/Quiero/Para) */
  .structured-description {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
  }

  /* Botón discreto para convertir descripción legacy con IA */
  .convert-ia-btn {
    width: 2rem;
    height: 1rem;
    background: rgba(230, 0, 126, 0.5);
    border: none;
    padding: 0;
    font-size: 0.6rem;
    font-weight: bold;
    color: #000;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-shadow: 1px 0px #FFF;
    margin: 0;
  }

  .convert-ia-btn:hover:not(.disabled) {
    background: rgba(230, 0, 126, 1);
    color: var(--text-on-secondary, #fff);
    text-shadow: 1px 0px #000;
  }

  .convert-ia-btn.disabled {
    cursor: wait;
    opacity: 0.6;
  }

  /* Botón prominente "Mejorar con IA" */
  .improve-ia-button {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: var(--text-on-primary, #fff);
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .improve-ia-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .improve-ia-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .improve-ia-button:disabled,
  .improve-ia-button.disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .structured-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .structured-label {
    font-weight: bold;
    color: var(--primary-color, #4a9eff);
    font-size: 0.95em;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label-hint {
    font-weight: normal;
    color: var(--text-muted);
    font-size: 0.85em;
    font-style: italic;
  }

  .structured-textarea {
    width: 100%;
    min-height: 60px;
    padding: 0.5rem;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 1rem;
    resize: vertical;
    font-family: inherit;
    background: var(--input-bg);
    color: var(--text-primary);
  }

  .structured-textarea:focus {
    outline: none;
    border-color: var(--primary-color, #4a9eff);
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
  }

  .structured-textarea.invalid-field {
    border: 2px solid #ff4444 !important;
    box-shadow: 0 0 0 0.25rem rgba(255, 68, 68, 0.3) !important;
    background-color: rgba(255, 68, 68, 0.05) !important;
  }

  .structured-textarea:disabled {
    background-color: var(--bg-tertiary);
    cursor: not-allowed;
  }

  /* Structured input for Como/Quiero/Para fields */
  .structured-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;
    background: var(--input-bg);
    color: var(--text-primary);
  }

  .structured-input:focus {
    outline: none;
    border-color: var(--primary-color, #4a9eff);
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
  }

  .structured-input.invalid-field {
    border: 2px solid #ff4444 !important;
    box-shadow: 0 0 0 0.25rem rgba(255, 68, 68, 0.3) !important;
    background-color: rgba(255, 68, 68, 0.05) !important;
  }

  .structured-input:disabled {
    background-color: var(--bg-tertiary);
    cursor: not-allowed;
  }

  /* Scenario table styles for Acceptance Criteria */
  .scenario-table-wrapper {
    margin-top: 0.5rem;
    padding: 0.5rem;
  }

  .scenario-table {
    width: 100%;
    border-collapse: collapse;
  }

  .scenario-table th,
  .scenario-table td {
    border: 1px solid var(--border-subtle);
    padding: 0.3rem 0.4rem;
    vertical-align: middle;
    line-height: 1.3;
    font-size: 0.95rem;
  }

  .scenario-table th {
    background: var(--bg-secondary);
    font-weight: 600;
    color: var(--text-primary);
  }

  .scenario-table .ellipsis {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scenario-table td.actions {
    width: 70px;
    display: flex;
    gap: 0.25rem;
    justify-content: flex-start;
    align-items: center;
  }

  .scenario-table th.actions-col {
    width: 70px;
    text-align: left;
  }

  .icon-button {
    cursor: pointer;
    padding: 0.2rem;
    font-size: 1rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .icon-button:hover {
    background: rgba(0,0,0,0.1);
  }

  .icon-button.danger:hover {
    background: rgba(217, 83, 79, 0.2);
  }

  .scenario-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    justify-content: flex-end;
  }

  .secondary-button {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--text-muted);
    background: var(--input-bg);
    color: var(--text-muted);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .secondary-button:hover:not(:disabled) {
    background: var(--text-muted);
    color: var(--text-inverse);
  }

  .secondary-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const ProposalCardStyles = [
  ThemeVariables,
  BaseCardStyles,
  BaseTabStyles,
  ProposalCardSpecificStyles
];
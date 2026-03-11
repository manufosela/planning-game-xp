/**
 * File upload and card import component.
 * Supports CSV and JSON drag-drop with preview and column mapping.
 *
 * @element pg-upload
 * @property {string} projectId - Target project for import
 * @fires import-complete - detail: { count, errors }
 * @fires import-submit - detail: { projectId, cards }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';

/**
 * Parse CSV text into rows of objects.
 * Exported for unit testing.
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCSV(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    /** @type {Record<string, string>} */
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

/** Standard card fields for mapping. */
const CARD_FIELDS = [
  '', 'title', 'description', 'type', 'status', 'year', 'epic', 'sprint',
  'devPoints', 'businessPoints', 'bugPriority', 'notes',
];

class PgUpload extends LitElement {
  static properties = {
    projectId: { type: String, attribute: 'project-id' },
    _dragging: { state: true },
    _parsedData: { state: true },
    _mapping: { state: true },
    _importing: { state: true },
    _progress: { state: true },
    _errors: { state: true },
    _fileType: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-3xl, 3rem) var(--space-lg, 1rem);
      border: 2px dashed var(--color-border, #e2e8f0);
      border-radius: var(--radius-lg, 0.75rem);
      background: var(--color-surface-raised, #fff);
      cursor: pointer;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }

    .drop-zone.dragging {
      border-color: var(--color-primary, #4f46e5);
      background: var(--color-primary-subtle, #eef2ff);
    }

    .drop-zone-icon {
      width: 2.5rem;
      height: 2.5rem;
      color: var(--color-text-muted, #94a3b8);
      margin-bottom: var(--space-md, 0.75rem);
    }

    .drop-zone-text {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #64748b);
      text-align: center;
    }

    .drop-zone-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
      margin-top: var(--space-xs, 0.25rem);
    }

    input[type="file"] { display: none; }

    /* Preview */
    .preview-panel {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-lg, 1rem);
      margin-top: var(--space-lg, 1rem);
    }

    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-md, 0.75rem);
    }

    .preview-header h4 {
      font-size: 0.875rem;
      font-weight: var(--font-weight-semibold, 600);
      margin: 0;
    }

    .preview-info {
      font-size: 0.75rem;
      color: var(--color-text-muted, #94a3b8);
    }

    /* Mapping */
    .mapping-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      align-items: center;
      margin-bottom: var(--space-lg, 1rem);
    }

    .mapping-label {
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
    }

    .mapping-arrow {
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }

    select {
      width: 100%;
      padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-sm, 0.25rem);
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
    }

    /* Data table */
    .data-preview {
      max-height: 16rem;
      overflow: auto;
      border: 1px solid var(--color-border-subtle, #f1f5f9);
      border-radius: var(--radius-sm, 0.25rem);
      margin-bottom: var(--space-lg, 1rem);
    }

    .data-preview table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.75rem;
    }

    .data-preview th {
      position: sticky;
      top: 0;
      background: var(--color-surface-sunken, #f1f5f9);
      padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
      text-align: left;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      font-size: 0.6875rem;
    }

    .data-preview td {
      padding: var(--space-2xs, 0.125rem) var(--space-sm, 0.5rem);
      border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
      white-space: nowrap;
      max-width: 12rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Actions */
    .btn {
      padding: var(--space-sm, 0.5rem) var(--space-xl, 1.5rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.8125rem;
      font-weight: var(--font-weight-medium, 500);
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .btn:hover { background: var(--color-surface-sunken, #f1f5f9); }

    .btn-primary {
      background: var(--color-primary, #4f46e5);
      color: var(--color-primary-text, #fff);
      border-color: var(--color-primary, #4f46e5);
    }

    .btn-primary:hover { background: var(--color-primary-hover, #4338ca); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .import-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
    }

    /* Progress */
    .progress-bar {
      width: 100%;
      height: 0.5rem;
      background: var(--color-surface-sunken, #f1f5f9);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-bottom: var(--space-md, 0.75rem);
    }

    .progress-fill {
      height: 100%;
      background: var(--color-primary, #4f46e5);
      border-radius: var(--radius-full);
      transition: width var(--transition-fast);
    }

    /* Errors */
    .error-list {
      max-height: 10rem;
      overflow-y: auto;
      font-size: 0.75rem;
      color: var(--color-error, #dc2626);
      background: var(--color-error-subtle, #fef2f2);
      border-radius: var(--radius-sm);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
    }

    .error-list li {
      padding: var(--space-2xs, 0.125rem) 0;
    }
  `;

  constructor() {
    super();
    /** @type {string} */
    this.projectId = '';
    /** @type {boolean} */
    this._dragging = false;
    /** @type {{ headers: string[], rows: Record<string, string>[] } | null} */
    this._parsedData = null;
    /** @type {Record<string, string>} */
    this._mapping = {};
    /** @type {boolean} */
    this._importing = false;
    /** @type {number} */
    this._progress = 0;
    /** @type {string[]} */
    this._errors = [];
    /** @type {'csv'|'json'|null} */
    this._fileType = null;
  }

  /** @param {DragEvent} e */
  _onDragOver(e) {
    e.preventDefault();
    this._dragging = true;
  }

  _onDragLeave() {
    this._dragging = false;
  }

  /** @param {DragEvent} e */
  _onDrop(e) {
    e.preventDefault();
    this._dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this._processFile(file);
  }

  _onFileSelect() {
    const input = /** @type {HTMLInputElement} */ (this.shadowRoot?.querySelector('input[type="file"]'));
    input?.click();
  }

  /** @param {Event} e */
  _onInputChange(e) {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) this._processFile(file);
  }

  /** @param {File} file */
  async _processFile(file) {
    const text = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'json') {
      this._fileType = 'json';
      try {
        const data = JSON.parse(text);
        const rows = Array.isArray(data) ? data : [data];
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        this._parsedData = {
          headers,
          rows: rows.map((r) => {
            /** @type {Record<string, string>} */
            const row = {};
            for (const k of headers) row[k] = String(r[k] ?? '');
            return row;
          }),
        };
        this._autoMap(headers);
      } catch {
        this._errors = ['Invalid JSON file.'];
      }
    } else if (ext === 'csv') {
      this._fileType = 'csv';
      this._parsedData = parseCSV(text);
      this._autoMap(this._parsedData.headers);
    } else {
      this._errors = ['Unsupported file format. Use CSV or JSON.'];
    }
  }

  /** @param {string[]} headers */
  _autoMap(headers) {
    /** @type {Record<string, string>} */
    const mapping = {};
    for (const h of headers) {
      const lower = h.toLowerCase().replace(/[\s_-]/g, '');
      const match = CARD_FIELDS.find((f) => f.toLowerCase() === lower);
      if (match) mapping[h] = match;
    }
    this._mapping = mapping;
    this._errors = [];
  }

  _reset() {
    this._parsedData = null;
    this._mapping = {};
    this._errors = [];
    this._importing = false;
    this._progress = 0;
    this._fileType = null;
  }

  _submitImport() {
    if (!this._parsedData || !this.projectId) return;

    const mappedCards = this._parsedData.rows.map((row) => {
      /** @type {Record<string, any>} */
      const card = {};
      for (const [csvHeader, cardField] of Object.entries(this._mapping)) {
        if (!cardField) continue;
        let val = row[csvHeader];
        if (cardField === 'devPoints' || cardField === 'businessPoints' || cardField === 'year') {
          val = Number(val) || undefined;
        }
        card[cardField] = val;
      }
      // Defaults
      if (!card.type) card.type = 'task';
      if (!card.status) card.status = 'To Do';
      if (!card.year) card.year = new Date().getFullYear();
      return card;
    });

    this._importing = true;
    this._progress = 0;

    this.dispatchEvent(new CustomEvent('import-submit', {
      detail: { projectId: this.projectId, cards: mappedCards },
      bubbles: true, composed: true,
    }));
  }

  /**
   * Called externally to report import progress.
   * @param {number} current
   * @param {number} total
   * @param {string[]} [errors]
   */
  reportProgress(current, total, errors = []) {
    this._progress = total > 0 ? Math.round((current / total) * 100) : 100;
    this._errors = errors;
    if (current >= total) {
      this._importing = false;
      this.dispatchEvent(new CustomEvent('import-complete', {
        detail: { count: total - errors.length, errors },
        bubbles: true, composed: true,
      }));
    }
  }

  render() {
    if (this._parsedData) return this._renderPreview();

    return html`
      <div class="drop-zone ${this._dragging ? 'dragging' : ''}"
        @dragover=${this._onDragOver}
        @dragleave=${this._onDragLeave}
        @drop=${this._onDrop}
        @click=${this._onFileSelect}
      >
        <svg class="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div class="drop-zone-text">Drop a file here or click to browse</div>
        <div class="drop-zone-hint">Accepts CSV and JSON formats</div>
      </div>
      <input type="file" accept=".csv,.json" @change=${this._onInputChange} />
    `;
  }

  _renderPreview() {
    const { headers, rows } = this._parsedData;

    return html`
      <div class="preview-panel">
        <div class="preview-header">
          <h4>Import Preview</h4>
          <span class="preview-info">${rows.length} rows found (${this._fileType?.toUpperCase()})</span>
        </div>

        ${this._fileType === 'csv' ? html`
          <div class="mapping-grid">
            ${headers.map((h) => html`
              <span class="mapping-label">${h}</span>
              <span class="mapping-arrow">&rarr;</span>
              <select .value=${this._mapping[h] ?? ''}
                @change=${(/** @type {Event} */ e) => {
                  this._mapping = { ...this._mapping, [h]: /** @type {HTMLSelectElement} */ (e.target).value };
                }}>
                ${CARD_FIELDS.map((f) => html`
                  <option value=${f} ?selected=${this._mapping[h] === f}>${f || '(skip)'}</option>
                `)}
              </select>
            `)}
          </div>
        ` : nothing}

        <div class="data-preview">
          <table>
            <thead>
              <tr>${headers.map((h) => html`<th>${h}</th>`)}</tr>
            </thead>
            <tbody>
              ${rows.slice(0, 10).map((row) => html`
                <tr>${headers.map((h) => html`<td>${row[h]}</td>`)}</tr>
              `)}
            </tbody>
          </table>
        </div>

        ${this._importing ? html`
          <div class="progress-bar">
            <div class="progress-fill" style="width:${this._progress}%"></div>
          </div>
        ` : nothing}

        ${this._errors.length > 0 ? html`
          <ul class="error-list">
            ${this._errors.map((e) => html`<li>${e}</li>`)}
          </ul>
        ` : nothing}

        <div class="import-actions">
          <button class="btn" @click=${this._reset}>Cancel</button>
          <button class="btn btn-primary" ?disabled=${this._importing} @click=${this._submitImport}>
            ${this._importing ? `Importing... ${this._progress}%` : `Import ${rows.length} cards`}
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('pg-upload', PgUpload);

export { PgUpload };

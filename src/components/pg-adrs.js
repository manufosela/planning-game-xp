/**
 * Architecture Decision Records (ADR) management component.
 * Lists, creates, edits ADRs with markdown rendering.
 *
 * @element pg-adrs
 * @property {string} projectId - The project ID
 * @property {Array} adrs - List of ADRs
 * @fires adr-create - detail: { data }
 * @fires adr-update - detail: { adrId, data }
 * @fires adr-delete - detail: { adrId }
 */

import { LitElement, html, css, nothing } from 'lit';
import './pg-badge.js';

/**
 * Simple markdown renderer for ADR content.
 * Supports: bold, italic, inline code, lists, code blocks.
 * Exported for unit testing.
 * @param {string} text
 * @returns {string} HTML string
 */
export function renderMarkdown(text) {
  if (!text) return '';
  let result = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks (triple backtick)
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Wrap consecutive li in ul
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n/g, '<br/>');
  return result;
}

/** @type {Record<string, string>} */
const ADR_STATUS_COLORS = {
  proposed: 'var(--color-info, #2563eb)',
  accepted: 'var(--color-success, #16a34a)',
  deprecated: 'var(--color-warning, #d97706)',
  superseded: 'var(--color-text-muted, #94a3b8)',
};

class PgAdrs extends LitElement {
  static properties = {
    projectId: { type: String, attribute: 'project-id' },
    adrs: { type: Array },
    _showForm: { state: true },
    _editingId: { state: true },
    _formData: { state: true },
    _detailAdr: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-lg, 1rem);
    }

    .header h3 {
      font-size: 1rem;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      margin: 0;
    }

    .btn {
      padding: var(--space-xs, 0.25rem) var(--space-md, 0.75rem);
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

    .btn-sm {
      padding: var(--space-2xs, 0.125rem) var(--space-sm, 0.5rem);
      font-size: 0.75rem;
    }

    .btn-danger {
      color: var(--color-error, #dc2626);
      border-color: var(--color-error, #dc2626);
    }

    .btn-danger:hover { background: var(--color-error-subtle, #fef2f2); }

    /* ADR list */
    .adr-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 0.5rem);
    }

    .adr-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md, 0.75rem) var(--space-lg, 1rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      cursor: pointer;
      transition: box-shadow var(--transition-fast);
    }

    .adr-item:hover { box-shadow: var(--shadow-md); }

    .adr-item-left {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      min-width: 0;
    }

    .adr-title {
      font-size: 0.875rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text, #0f172a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .adr-actions {
      display: flex;
      gap: var(--space-xs, 0.25rem);
      flex-shrink: 0;
    }

    /* Detail panel */
    .detail-backdrop {
      position: fixed;
      inset: 0;
      background: var(--color-surface-overlay, rgba(15, 23, 42, 0.6));
      z-index: var(--z-overlay, 300);
    }

    .detail-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: min(36rem, 100vw);
      height: 100vh;
      background: var(--color-surface-raised, #fff);
      border-left: 1px solid var(--color-border, #e2e8f0);
      z-index: var(--z-overlay, 300);
      overflow-y: auto;
      padding: var(--space-xl, 1.5rem);
      box-shadow: var(--shadow-xl);
      animation: slide-in 200ms ease forwards;
    }

    @keyframes slide-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xl, 1.5rem);
    }

    .detail-title {
      font-size: 1.125rem;
      font-weight: var(--font-weight-semibold, 600);
    }

    .detail-section {
      margin-bottom: var(--space-xl, 1.5rem);
    }

    .detail-section-title {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
      margin-bottom: var(--space-sm, 0.5rem);
    }

    .detail-content {
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      line-height: 1.6;
    }

    .detail-content code {
      background: var(--color-surface-sunken, #f1f5f9);
      padding: 0.1em 0.3em;
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 0.8em;
    }

    .detail-content pre {
      background: var(--color-surface-sunken, #f1f5f9);
      padding: var(--space-md);
      border-radius: var(--radius-md);
      overflow-x: auto;
    }

    .detail-content pre code {
      background: none;
      padding: 0;
    }

    .detail-content ul {
      padding-left: var(--space-lg, 1rem);
    }

    .detail-content ul li {
      margin-bottom: var(--space-2xs, 0.125rem);
    }

    /* Form */
    .form-panel {
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      padding: var(--space-lg, 1rem);
      margin-bottom: var(--space-lg, 1rem);
    }

    .form-panel h4 {
      font-size: 0.875rem;
      font-weight: var(--font-weight-semibold, 600);
      margin: 0 0 var(--space-md, 0.75rem);
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 0.125rem);
      margin-bottom: var(--space-md, 0.75rem);
    }

    .field-label {
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
    }

    input[type="text"],
    textarea,
    select {
      width: 100%;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: var(--color-surface-raised, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 0.5rem);
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #0f172a);
      box-sizing: border-box;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--color-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    textarea { min-height: 6rem; resize: vertical; font-family: var(--font-mono); font-size: 0.75rem; }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
      padding-top: var(--space-md, 0.75rem);
      border-top: 1px solid var(--color-border-subtle, #f1f5f9);
    }

    .empty-msg {
      text-align: center;
      padding: var(--space-xl, 1.5rem);
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.875rem;
    }

    .status-dot {
      display: inline-block;
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-full);
      flex-shrink: 0;
    }
  `;

  constructor() {
    super();
    /** @type {string} */
    this.projectId = '';
    /** @type {Array<import('../lib/types.d.ts').Adr & { id: string }>} */
    this.adrs = [];
    /** @type {boolean} */
    this._showForm = false;
    /** @type {string | null} */
    this._editingId = null;
    /** @type {Record<string, any>} */
    this._formData = this._defaultForm();
    /** @type {(import('../lib/types.d.ts').Adr & { id: string }) | null} */
    this._detailAdr = null;
  }

  _defaultForm() {
    return { title: '', context: '', decision: '', consequences: '', status: 'proposed' };
  }

  _openCreate() {
    this._formData = this._defaultForm();
    this._editingId = null;
    this._showForm = true;
  }

  /** @param {import('../lib/types.d.ts').Adr & { id: string }} adr */
  _openEdit(adr) {
    this._formData = {
      title: adr.title,
      context: adr.context,
      decision: adr.decision,
      consequences: adr.consequences,
      status: adr.status,
    };
    this._editingId = adr.id;
    this._showForm = true;
    this._detailAdr = null;
  }

  _cancelForm() {
    this._showForm = false;
    this._editingId = null;
  }

  _submitForm() {
    if (!this._formData.title.trim()) return;

    const data = {
      title: this._formData.title.trim(),
      context: this._formData.context.trim(),
      decision: this._formData.decision.trim(),
      consequences: this._formData.consequences.trim(),
      status: this._formData.status,
    };

    if (this._editingId) {
      this.dispatchEvent(new CustomEvent('adr-update', {
        detail: { adrId: this._editingId, data },
        bubbles: true, composed: true,
      }));
    } else {
      this.dispatchEvent(new CustomEvent('adr-create', {
        detail: { data },
        bubbles: true, composed: true,
      }));
    }
    this._showForm = false;
    this._editingId = null;
  }

  /** @param {string} adrId */
  _deleteAdr(adrId) {
    this.dispatchEvent(new CustomEvent('adr-delete', {
      detail: { adrId },
      bubbles: true, composed: true,
    }));
    if (this._detailAdr?.id === adrId) this._detailAdr = null;
  }

  render() {
    return html`
      <div class="header">
        <h3>Architecture Decision Records</h3>
        ${!this._showForm ? html`
          <button class="btn btn-primary btn-sm" @click=${this._openCreate}>+ New ADR</button>
        ` : nothing}
      </div>

      ${this._showForm ? this._renderForm() : nothing}

      ${this.adrs.length === 0 && !this._showForm ? html`
        <div class="empty-msg">No ADRs yet. Create one to document architecture decisions.</div>
      ` : nothing}

      <div class="adr-list">
        ${this.adrs.map((adr) => html`
          <div class="adr-item" @click=${() => { this._detailAdr = adr; }}>
            <div class="adr-item-left">
              <span class="status-dot" style="background:${ADR_STATUS_COLORS[adr.status] ?? '#94a3b8'}"></span>
              <span class="adr-title">${adr.title}</span>
            </div>
            <div class="adr-actions" @click=${(/** @type {Event} */ e) => e.stopPropagation()}>
              <pg-badge text=${adr.status} variant="status"></pg-badge>
              <button class="btn btn-sm" @click=${() => this._openEdit(adr)}>Edit</button>
              <button class="btn btn-sm btn-danger" @click=${() => this._deleteAdr(adr.id)}>Delete</button>
            </div>
          </div>
        `)}
      </div>

      ${this._detailAdr ? this._renderDetail() : nothing}
    `;
  }

  _renderDetail() {
    const adr = this._detailAdr;
    return html`
      <div class="detail-backdrop" @click=${() => { this._detailAdr = null; }}></div>
      <div class="detail-panel">
        <div class="detail-header">
          <span class="detail-title">${adr.title}</span>
          <button class="btn btn-sm" @click=${() => { this._detailAdr = null; }}>Close</button>
        </div>
        <div style="margin-bottom: var(--space-md)">
          <pg-badge text=${adr.status} variant="status"></pg-badge>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Context</div>
          <div class="detail-content" .innerHTML=${renderMarkdown(adr.context)}></div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Decision</div>
          <div class="detail-content" .innerHTML=${renderMarkdown(adr.decision)}></div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Consequences</div>
          <div class="detail-content" .innerHTML=${renderMarkdown(adr.consequences)}></div>
        </div>
      </div>
    `;
  }

  _renderForm() {
    const f = this._formData;
    const statusOptions = ['proposed', 'accepted', 'deprecated', 'superseded'];

    return html`
      <div class="form-panel">
        <h4>${this._editingId ? 'Edit ADR' : 'New ADR'}</h4>
        <div class="field-group">
          <label class="field-label">Title</label>
          <input type="text" .value=${f.title}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, title: /** @type {HTMLInputElement} */ (e.target).value }; }} />
        </div>
        <div class="field-group">
          <label class="field-label">Status</label>
          <select .value=${f.status}
            @change=${(/** @type {Event} */ e) => { this._formData = { ...this._formData, status: /** @type {HTMLSelectElement} */ (e.target).value }; }}>
            ${statusOptions.map((s) => html`<option value=${s} ?selected=${f.status === s}>${s}</option>`)}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Context (markdown)</label>
          <textarea .value=${f.context}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, context: /** @type {HTMLTextAreaElement} */ (e.target).value }; }}
            placeholder="What is the issue that we're seeing that is motivating this decision?"></textarea>
        </div>
        <div class="field-group">
          <label class="field-label">Decision (markdown)</label>
          <textarea .value=${f.decision}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, decision: /** @type {HTMLTextAreaElement} */ (e.target).value }; }}
            placeholder="What is the change we're proposing or have agreed to?"></textarea>
        </div>
        <div class="field-group">
          <label class="field-label">Consequences (markdown)</label>
          <textarea .value=${f.consequences}
            @input=${(/** @type {InputEvent} */ e) => { this._formData = { ...this._formData, consequences: /** @type {HTMLTextAreaElement} */ (e.target).value }; }}
            placeholder="What are the positive and negative consequences?"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn" @click=${this._cancelForm}>Cancel</button>
          <button class="btn btn-primary" @click=${this._submitForm}>${this._editingId ? 'Save' : 'Create'}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('pg-adrs', PgAdrs);

export { PgAdrs };

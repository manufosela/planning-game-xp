import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { updateService } from '../services/update-service.js';

export class UpdateManager extends LitElement {
  static get properties() {
    return {
      updateInfo: { type: Object },
      visible: { type: Boolean }
    };
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }

      .update-banner {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--bg-primary, white);
        border: 1px solid var(--brand-primary, #6366f1);
        border-left: 4px solid var(--brand-primary, #6366f1);
        border-radius: 8px;
        padding: 16px 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        max-width: 380px;
        animation: slideUp 0.3s ease-out;
      }

      @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .title {
        font-weight: 600;
        font-size: 14px;
        color: var(--text-primary, #333);
      }

      .close-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: var(--text-muted, #999);
        padding: 0 4px;
      }

      .close-btn:hover {
        color: var(--text-primary, #333);
      }

      .version-info {
        font-size: 13px;
        color: var(--text-secondary, #666);
        margin-bottom: 8px;
      }

      .changelog {
        font-size: 12px;
        color: var(--text-secondary, #555);
        max-height: 100px;
        overflow-y: auto;
        margin-bottom: 12px;
        padding: 8px;
        background: var(--bg-secondary, #f8f9fa);
        border-radius: 4px;
        white-space: pre-wrap;
      }

      .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .btn {
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      }

      .btn-dismiss {
        background: transparent;
        border: 1px solid var(--border-color, #ddd);
        color: var(--text-secondary, #666);
      }

      .btn-view {
        background: var(--brand-primary, #6366f1);
        border: none;
        color: white;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
      }

      .btn-view:hover {
        opacity: 0.9;
      }
    `;
  }

  constructor() {
    super();
    this.updateInfo = null;
    this.visible = false;

    document.addEventListener('update-available', (e) => {
      this.updateInfo = e.detail;
      this.visible = true;
    });
  }

  _dismiss() {
    if (this.updateInfo?.version) {
      updateService.dismissVersion(this.updateInfo.version);
    }
    this.visible = false;
    this.updateInfo = null;
  }

  render() {
    if (!this.visible || !this.updateInfo) return html``;

    return html`
      <div class="update-banner">
        <div class="header">
          <span class="title">Nueva version disponible</span>
          <button class="close-btn" @click=${this._dismiss}>x</button>
        </div>
        <div class="version-info">
          ${this.updateInfo.currentVersion} &rarr; <strong>${this.updateInfo.version}</strong>
        </div>
        ${this.updateInfo.changelog ? html`
          <div class="changelog">${this.updateInfo.changelog}</div>
        ` : ''}
        <div class="actions">
          <button class="btn btn-dismiss" @click=${this._dismiss}>Ignorar</button>
          <a class="btn btn-view" href="${this.updateInfo.releaseUrl}" target="_blank" rel="noopener">
            Ver en GitHub
          </a>
        </div>
      </div>
    `;
  }
}

customElements.define('update-manager', UpdateManager);

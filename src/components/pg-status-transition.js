/**
 * Status transition control for cards.
 *
 * Displays the current status as a badge and provides buttons
 * for all available transitions. Disabled buttons show a tooltip
 * explaining why the transition is not available.
 *
 * @element pg-status-transition
 * @property {Object} card - Card data object
 * @property {Object} user - Current user (uid, role)
 * @property {Object} project - Project context (id)
 * @fires status-change - When a valid transition is confirmed, detail: { card, targetStatus }
 */

import { LitElement, html, css, nothing } from 'lit';
import { canTransition, getAvailableTransitions, isValidatorAction, getRequiredFields } from '../lib/transitions.js';
import './pg-badge.js';

/** Transitions that require user confirmation before proceeding. */
const DESTRUCTIVE_TARGETS = new Set(['Blocked', 'Reopened']);

class PgStatusTransition extends LitElement {
  static properties = {
    card: { type: Object },
    user: { type: Object },
    project: { type: Object },
    _confirming: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .status-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 0.75rem);
    }

    .current-status {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
    }

    .current-label {
      font-size: 0.6875rem;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide, 0.025em);
      color: var(--color-text-muted, #94a3b8);
    }

    .transition-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 0.25rem);
    }

    .transition-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 0.25rem);
      padding: var(--space-xs, 0.25rem) var(--space-md, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: background var(--transition-fast, 150ms ease),
                  border-color var(--transition-fast, 150ms ease);
      white-space: nowrap;
    }

    .transition-btn:hover:not(:disabled) {
      background: var(--color-surface-sunken, #f1f5f9);
      border-color: var(--color-border-strong, #cbd5e1);
    }

    .transition-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .transition-btn.destructive {
      color: var(--color-error, #dc2626);
      border-color: color-mix(in srgb, var(--color-error) 25%, transparent);
    }

    .transition-btn.destructive:hover:not(:disabled) {
      background: var(--color-error-subtle, #fef2f2);
    }

    .transition-btn.positive {
      color: var(--color-success, #16a34a);
      border-color: color-mix(in srgb, var(--color-success) 25%, transparent);
    }

    .transition-btn.positive:hover:not(:disabled) {
      background: color-mix(in srgb, var(--color-success) 8%, transparent);
    }

    .transition-btn .arrow {
      font-size: 0.625rem;
      color: var(--color-text-muted, #94a3b8);
    }

    /* Tooltip for disabled buttons */
    .tooltip-wrapper {
      position: relative;
      display: inline-flex;
    }

    .tooltip {
      position: absolute;
      bottom: calc(100% + var(--space-xs, 0.25rem));
      left: 50%;
      transform: translateX(-50%);
      padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
      background: var(--color-surface-overlay, rgba(15, 23, 42, 0.9));
      color: #fff;
      font-size: 0.6875rem;
      border-radius: var(--radius-sm, 0.25rem);
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--transition-fast, 150ms ease);
      z-index: 10;
      max-width: 16rem;
      white-space: normal;
      text-align: center;
      line-height: 1.3;
    }

    .tooltip-wrapper:hover .tooltip {
      opacity: 1;
    }

    /* Confirmation dialog */
    .confirm-bar {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.75rem);
      background: var(--color-warning-subtle, #fffbeb);
      border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
      border-radius: var(--radius-md, 0.5rem);
      font-size: 0.75rem;
    }

    .confirm-bar .confirm-text {
      flex: 1;
      color: var(--color-text, #0f172a);
      font-weight: var(--font-weight-medium, 500);
    }

    .confirm-bar button {
      padding: var(--space-2xs, 0.125rem) var(--space-sm, 0.5rem);
      border-radius: var(--radius-sm, 0.25rem);
      border: none;
      font-size: 0.75rem;
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: background var(--transition-fast, 150ms ease);
    }

    .confirm-bar .confirm-yes {
      background: var(--color-error, #dc2626);
      color: #fff;
    }

    .confirm-bar .confirm-yes:hover {
      background: var(--color-error-hover, #b91c1c);
    }

    .confirm-bar .confirm-no {
      background: var(--color-surface-raised, #fff);
      color: var(--color-text, #0f172a);
      border: 1px solid var(--color-border, #e2e8f0);
    }

    .confirm-bar .confirm-no:hover {
      background: var(--color-surface-sunken, #f1f5f9);
    }

    /* Missing fields indicator */
    .missing-fields {
      font-size: 0.6875rem;
      color: var(--color-warning, #d97706);
      margin-top: var(--space-2xs, 0.125rem);
    }

    .missing-fields code {
      font-family: var(--font-mono);
      background: var(--color-surface-sunken, #f1f5f9);
      padding: 0 0.1875rem;
      border-radius: 2px;
    }

    .validator-note {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #94a3b8);
      font-style: italic;
    }
  `;

  constructor() {
    super();
    /** @type {Record<string, unknown> | null} */
    this.card = null;
    /** @type {{ uid: string; role?: string } | null} */
    this.user = null;
    /** @type {{ id: string } | null} */
    this.project = null;
    /** @type {string | null} */
    this._confirming = null;
  }

  /** @returns {{ target: string; allowed: boolean; reason?: string; missing?: string[]; validatorOnly: boolean }[]} */
  get _allTransitions() {
    if (!this.card || !this.user) return [];

    const cardType = /** @type {string} */ (this.card.type);
    const currentStatus = /** @type {string} */ (this.card.status);

    // Get all possible targets from the transition rules
    const { TRANSITION_RULES } = /** @type {typeof import('../lib/transitions.js')} */ (
      /** @type {unknown} */ ({ TRANSITION_RULES: null })
    );

    // Build the full list from rules
    const result = [];

    // We need to import TRANSITION_RULES - use a different approach
    // Get available (allowed) transitions
    const available = getAvailableTransitions(this.card, this.user);

    // Also check all possible targets to show disabled ones with reasons
    const possibleTargets = this._getPossibleTargets(cardType, currentStatus);

    for (const target of possibleTargets) {
      if (available.includes(target)) {
        result.push({
          target,
          allowed: true,
          validatorOnly: isValidatorAction(currentStatus, target),
        });
      } else {
        const check = canTransition(this.card, target, this.user);
        result.push({
          target,
          allowed: false,
          reason: check.reason,
          missing: check.missing,
          validatorOnly: isValidatorAction(currentStatus, target),
        });
      }
    }

    return result;
  }

  /**
   * Get all possible target statuses from a given status for a card type.
   * @param {string} cardType
   * @param {string} currentStatus
   * @returns {string[]}
   */
  _getPossibleTargets(cardType, currentStatus) {
    const taskTargets = {
      'To Do': ['In Progress', 'Blocked'],
      'In Progress': ['To Validate', 'To Do', 'Blocked'],
      'To Validate': ['Done', 'Done&Validated', 'Reopened'],
      'Done': ['Done&Validated'],
      'Reopened': ['In Progress', 'To Do'],
      'Blocked': ['To Do', 'In Progress'],
    };
    const bugTargets = {
      'Created': ['Assigned'],
      'Assigned': ['Fixed'],
      'Fixed': ['Verified'],
      'Verified': ['Closed'],
    };

    const map = cardType === 'bug' ? bugTargets : taskTargets;
    return map[currentStatus] ?? [];
  }

  /**
   * @param {string} target
   * @returns {'destructive' | 'positive' | ''}
   */
  _getButtonVariant(target) {
    if (DESTRUCTIVE_TARGETS.has(target)) return 'destructive';
    if (['Done', 'Done&Validated', 'Verified', 'Closed', 'Fixed'].includes(target)) return 'positive';
    return '';
  }

  /** @param {string} targetStatus */
  _handleTransitionClick(targetStatus) {
    if (DESTRUCTIVE_TARGETS.has(targetStatus)) {
      this._confirming = targetStatus;
      return;
    }
    this._emitChange(targetStatus);
  }

  /** @param {string} targetStatus */
  _emitChange(targetStatus) {
    this._confirming = null;
    this.dispatchEvent(new CustomEvent('status-change', {
      detail: { card: this.card, targetStatus },
      bubbles: true,
      composed: true,
    }));
  }

  _cancelConfirm() {
    this._confirming = null;
  }

  render() {
    if (!this.card) return nothing;

    const transitions = this._allTransitions;
    const currentStatus = /** @type {string} */ (this.card.status);
    const hasValidatorActions = transitions.some((t) => t.validatorOnly && !t.allowed);

    return html`
      <div class="status-section">
        <div class="current-status">
          <span class="current-label">Status</span>
          <pg-badge text=${currentStatus} variant="status"></pg-badge>
        </div>

        ${transitions.length > 0 ? html`
          <div class="transition-buttons">
            ${transitions.map((t) => {
              if (t.allowed) {
                return html`
                  <button
                    class="transition-btn ${this._getButtonVariant(t.target)}"
                    @click=${() => this._handleTransitionClick(t.target)}
                  >
                    <span class="arrow">&rarr;</span>
                    ${t.target}
                  </button>
                `;
              }

              // Disabled with tooltip
              return html`
                <div class="tooltip-wrapper">
                  <button class="transition-btn ${this._getButtonVariant(t.target)}" disabled>
                    <span class="arrow">&rarr;</span>
                    ${t.target}
                  </button>
                  <span class="tooltip">${t.reason ?? 'Not available'}</span>
                </div>
              `;
            })}
          </div>

          ${hasValidatorActions ? html`
            <span class="validator-note">Some transitions require validator permissions</span>
          ` : nothing}
        ` : nothing}

        ${this._confirming ? html`
          <div class="confirm-bar">
            <span class="confirm-text">Move to "${this._confirming}"?</span>
            <button class="confirm-no" @click=${this._cancelConfirm}>Cancel</button>
            <button class="confirm-yes" @click=${() => this._emitChange(this._confirming)}>Confirm</button>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('pg-status-transition', PgStatusTransition);

export { PgStatusTransition };

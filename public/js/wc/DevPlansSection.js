/**
 * DevPlansSection Component
 * Container for Plan Proposals, Dev Plans and Task Generator sub-tabs.
 * Uses <color-tabs> to organize the sub-sections.
 *
 * There are TWO kinds of proposal in the app, on purpose (PLN-TSK-0359):
 * - PLAN proposals (this sub-tab, /planProposals): free text, usually
 *   written by the AI, and turned into a development plan.
 * - TASK proposals (main Proposals tab, proposal cards): a Como/Quiero/Para
 *   user story, so people outside the team can propose work.
 * A task proposal can also be approved as a plan (PLN-TSK-0358); that path
 * arrives here through openPlanCreatorFromProposal().
 */
import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { DevPlansSectionStyles } from './dev-plans-section-styles.js';
import './PlanProposalsList.js';
import './DevPlansList.js';

export class DevPlansSection extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id' }
    };
  }

  static get styles() {
    return [DevPlansSectionStyles];
  }

  constructor() {
    super();
    this.projectId = '';
    this._handleGenerateFromProposal = this._handleGenerateFromProposal.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('generate-plan-from-proposal', this._handleGenerateFromProposal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('generate-plan-from-proposal', this._handleGenerateFromProposal);
  }

  /**
   * A plan proposal (free text) asks for its plan: switch to the Plans
   * sub-tab and open the creator seeded with it.
   * @param {CustomEvent} event
   */
  _handleGenerateFromProposal(event) {
    const { proposalId, title, description } = event.detail;
    this.openPlanCreator({ proposalId, title, description });
  }

  /**
   * Open the plan creator seeded with a proposal CARD approved as a plan
   * (PLN-TSK-0358). Called by the hosting page, either in place
   * (convert-proposal-to-plan event) or after landing here with
   * ?fromProposal=<cardId>.
   *
   * @param {Object} proposal
   * @param {string} proposal.proposalCardId - Proposal card id (e.g. "SIM-PRP-0002")
   * @param {string} proposal.proposalFirebaseId - Proposal RTDB key
   * @param {string} proposal.title - Proposal title
   * @param {string} proposal.description - Context handed to the plan generator
   * @returns {Promise<void>}
   */
  async openPlanCreatorFromProposal({ proposalCardId, proposalFirebaseId, title, description }) {
    if (!proposalCardId) {
      throw new Error('openPlanCreatorFromProposal requires a proposalCardId');
    }
    await this.openPlanCreator({ proposalCardId, proposalFirebaseId, title, description });
  }

  /**
   * Shared entry point for both proposal origins.
   * @param {Object} origin - Either {proposalId} (plan proposal) or
   *   {proposalCardId, proposalFirebaseId} (proposal card), plus title/description
   * @returns {Promise<void>}
   */
  async openPlanCreator(origin) {
    await this.updateComplete;

    const tabs = this.shadowRoot?.querySelector('color-tabs');
    tabs?.setActiveTab('plans');

    const plansList = this.shadowRoot?.querySelector('dev-plans-list');
    if (!plansList) {
      throw new Error('dev-plans-list is not available in dev-plans-section');
    }

    await plansList.updateComplete;
    plansList.openCreatorFromProposal(origin);
  }

  render() {
    return html`
      <div class="dev-plans-section">
        <color-tabs active-tab="proposals">
          <color-tab name="proposals" label="Proposals" color="var(--brand-primary, #3b82f6)">
            <plan-proposals-list .projectId=${this.projectId}></plan-proposals-list>
          </color-tab>
          <color-tab name="plans" label="Plans" color="var(--brand-secondary, #ec3e95)">
            <dev-plans-list .projectId=${this.projectId}></dev-plans-list>
          </color-tab>
          <color-tab name="generator" label="Task Generator" color="var(--color-success, #4caf50)">
            <ai-document-uploader .projectId=${this.projectId}></ai-document-uploader>
          </color-tab>
        </color-tabs>
      </div>
    `;
  }
}

customElements.define('dev-plans-section', DevPlansSection);

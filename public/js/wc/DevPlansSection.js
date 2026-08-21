/**
 * DevPlansSection Component
 * Container for Dev Plans and Task Generator sub-tabs.
 * Uses <color-tabs> to organize the sub-sections.
 *
 * NOTE (PLN-TSK-0357): the "Proposals" sub-tab (plan proposals, stored at
 * /planProposals) was removed — proposals were unified into the proposal
 * CARDS of the main Proposals tab. Plans link to them via
 * create_plan proposalCardId.
 */
import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { DevPlansSectionStyles } from './dev-plans-section-styles.js';
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
  }

  /**
   * Open the plan creator seeded with a proposal card (PLN-TSK-0358).
   * Called by the hosting page when a proposal is approved as a plan, either
   * in place (convert-proposal-to-plan event) or after landing here with
   * ?fromProposal=<cardId>.
   *
   * @param {Object} proposal
   * @param {string} proposal.proposalCardId - Proposal card id (e.g. "SIM-PRP-0002")
   * @param {string} proposal.title - Proposal title
   * @param {string} proposal.description - Context handed to the plan generator
   * @returns {Promise<void>}
   */
  async openPlanCreatorFromProposal({ proposalCardId, title, description }) {
    if (!proposalCardId) {
      throw new Error('openPlanCreatorFromProposal requires a proposalCardId');
    }

    await this.updateComplete;

    const tabs = this.shadowRoot?.querySelector('color-tabs');
    tabs?.setActiveTab('plans');

    const plansList = this.shadowRoot?.querySelector('dev-plans-list');
    if (!plansList) {
      throw new Error('dev-plans-list is not available in dev-plans-section');
    }

    await plansList.updateComplete;
    plansList.openCreatorFromProposal(proposalCardId, title, description);
  }

  render() {
    return html`
      <div class="dev-plans-section">
        <color-tabs active-tab="plans">
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

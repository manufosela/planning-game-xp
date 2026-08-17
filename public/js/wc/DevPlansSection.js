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

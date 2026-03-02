/**
 * DevPlansList Component
 * Replaces all inline Dev Plans JS from adminproject.astro.
 * Provides list, detail, form, and AI creator views for development plans.
 */
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { DevPlansListStyles } from './dev-plans-list-styles.js';
import { planService } from '../services/plan-service.js';
import { demoModeService } from '../services/demo-mode-service.js';

export class DevPlansList extends LitElement {
  static get properties() {
    return {
      projectId: { type: String, attribute: 'project-id' },
      plans: { type: Array },
      loading: { type: Boolean },
      currentView: { type: String },
      selectedPlan: { type: Object },
      formPlan: { type: Object },
      aiGenerating: { type: Boolean },
      taskGenerating: { type: Boolean },
      formError: { type: String },
      creatorError: { type: String },
      isAiGenerated: { type: Boolean },
      aiContext: { type: String },
      proposalId: { type: String }
    };
  }

  static get styles() {
    return [DevPlansListStyles];
  }

  constructor() {
    super();
    this.projectId = '';
    this.plans = [];
    this.loading = false;
    this.currentView = 'list';
    this.selectedPlan = null;
    this.formPlan = null;
    this.aiGenerating = false;
    this.taskGenerating = false;
    this.formError = '';
    this.creatorError = '';
    this.isAiGenerated = false;
    this.aiContext = '';
    this.proposalId = '';
    this._phaseCounter = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.projectId) {
      this.loadPlans();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('projectId') && this.projectId) {
      this.loadPlans();
    }
  }

  async loadPlans() {
    if (!this.projectId) return;
    this.loading = true;
    try {
      this.plans = await planService.getAll(this.projectId);
    } catch (error) {
      console.error('Error loading plans:', error);
      this.plans = [];
    } finally {
      this.loading = false;
    }
  }

  /**
   * Called externally by DevPlansSection to open creator from a proposal
   */
  openCreatorFromProposal(proposalId, title, description) {
    this.proposalId = proposalId;
    this.aiContext = description || '';
    this.currentView = 'creator';
  }

  _showList() {
    this.currentView = 'list';
    this.selectedPlan = null;
    this.formPlan = null;
    this.formError = '';
    this.creatorError = '';
    this.isAiGenerated = false;
    this.aiContext = '';
    this.proposalId = '';
  }

  _showDetail(plan) {
    this.selectedPlan = plan;
    this.currentView = 'detail';
  }

  _showForm(plan = null, aiPlan = null) {
    this.formPlan = plan || aiPlan || { title: '', objective: '', status: 'draft', phases: [] };
    this.isAiGenerated = !!aiPlan && !plan;
    this._phaseCounter = (this.formPlan.phases || []).length;
    this.formError = '';
    this.currentView = 'form';
  }

  _showCreator() {
    this.aiContext = '';
    this.creatorError = '';
    this.proposalId = '';
    this.currentView = 'creator';
  }

  // ── List View ──

  _renderList() {
    if (this.loading) {
      return html`<div class="loading-indicator">Loading plans...</div>`;
    }

    if (this.plans.length === 0) {
      return html`<p class="plans-empty">No development plans yet. Click "+ New Plan" to create one.</p>`;
    }

    return html`
      <table class="plans-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Title</th>
            <th>Phases</th>
            <th>Tasks</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.plans.map(plan => this._renderPlanRow(plan))}
        </tbody>
      </table>
    `;
  }

  _renderPlanRow(plan) {
    const phaseCount = (plan.phases || []).length;
    const completedPhases = (plan.phases || []).filter(p => p.status === 'completed').length;
    const linkedTasks = [...new Set((plan.phases || []).flatMap(p => p.taskIds || []))];
    const statusLabel = plan.status === 'accepted' ? 'Accepted' : 'Draft';
    const statusClass = plan.status === 'accepted' ? 'plan-status-accepted' : 'plan-status-draft';
    const updatedDate = plan.updatedAt ? new Date(plan.updatedAt).toLocaleDateString('es-ES') : '';
    const isDraft = plan.status !== 'accepted';
    const genCount = (plan.generatedTasks || []).length;

    return html`
      <tr @click=${(e) => { if (!e.target.closest('.plan-action-btn')) this._showDetail(plan); }}>
        <td><span class="plan-status-badge ${statusClass}">${statusLabel}</span></td>
        <td class="plan-title-cell" title=${plan.objective || ''}>${plan.title || 'Untitled'}</td>
        <td class="plan-center-cell">${phaseCount > 0 ? `${completedPhases}/${phaseCount}` : '-'}</td>
        <td class="plan-center-cell">${linkedTasks.length > 0 ? linkedTasks.length : '-'}</td>
        <td class="plan-date-cell">${updatedDate}</td>
        <td class="plan-actions-cell">
          <button class="plan-action-btn" @click=${() => this._showDetail(plan)} title="View">👁</button>
          ${isDraft ? html`
            <button class="plan-action-btn" @click=${() => this._showForm(plan)} title="Edit">✏️</button>
          ` : nothing}
          ${!isDraft ? html`
            ${genCount > 0 ? html`
              <button class="plan-action-btn plan-generate-btn plan-generated-done"
                @click=${() => this._handleRegenerate(plan)} title="Regenerate Tasks (${genCount} created)">🔄 ${genCount}</button>
            ` : html`
              <button class="plan-action-btn plan-generate-btn"
                @click=${() => this._handleGenerate(plan)} title="Generate Tasks">⚡</button>
            `}
          ` : nothing}
          <button class="plan-action-btn" @click=${() => this._handleDelete(plan)} title="Delete">🗑</button>
        </td>
      </tr>
    `;
  }

  // ── Detail View ──

  _renderDetail() {
    const plan = this.selectedPlan;
    if (!plan) return nothing;

    const isAccepted = plan.status === 'accepted';
    const statusLabel = isAccepted ? 'Accepted' : 'Draft';
    const statusClass = isAccepted ? 'plan-status-accepted' : 'plan-status-draft';
    const createdDate = plan.createdAt ? new Date(plan.createdAt).toLocaleDateString('es-ES') : '';
    const updatedDate = plan.updatedAt ? new Date(plan.updatedAt).toLocaleDateString('es-ES') : '';
    const baseUrl = window.location.origin;
    const genCount = (plan.generatedTasks || []).length;

    return html`
      <div class="plan-detail">
        <div class="plan-detail-header">
          <button class="plans-btn plans-btn-secondary" @click=${this._showList}>← Back</button>
          <div class="plan-detail-actions">
            ${this.taskGenerating ? html`
              <span class="plan-generating">Generating tasks...</span>
            ` : !isAccepted ? html`
              <button class="plans-btn plans-btn-primary" @click=${() => this._showForm(plan)}>Edit</button>
              <button class="plans-btn plans-btn-accept" @click=${() => this._handleAccept(plan)}>Accept Plan</button>
            ` : html`
              ${genCount > 0 ? html`
                <button class="plans-btn plans-btn-secondary" @click=${() => this._handleRegenerate(plan)}>🔄 Regenerate Tasks (${genCount} created)</button>
              ` : html`
                <button class="plans-btn plans-btn-generate" @click=${() => this._handleGenerate(plan)}>⚡ Generate Tasks</button>
              `}
            `}
          </div>
        </div>
        <div class="plan-detail-title-row">
          <h2>${plan.title}</h2>
          <span class="plan-status-badge ${statusClass}">${statusLabel}</span>
        </div>
        ${plan.objective ? html`<p class="plan-detail-objective">${plan.objective}</p>` : nothing}
        <div class="plan-detail-meta">
          ${createdDate ? html`<span>Created: ${createdDate}</span>` : nothing}
          ${updatedDate ? html`<span>Updated: ${updatedDate}</span>` : nothing}
          ${plan.createdBy ? html`<span>By: ${plan.createdBy}</span>` : nothing}
        </div>
        ${(plan.phases || []).length > 0 ? html`
          <div class="plan-phases">
            <h3>Phases (${plan.phases.length})</h3>
            ${plan.phases.map((phase, i) => this._renderPhaseCard(phase, i, plan))}
          </div>
        ` : nothing}
        ${genCount > 0 ? this._renderGeneratedTasks(plan) : nothing}
      </div>
    `;
  }

  _renderPhaseCard(phase, index, plan) {
    const phaseStatusClass = `phase-status-${phase.status || 'pending'}`;
    const phaseStatusLabel = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' }[phase.status] || 'Pending';
    const baseUrl = window.location.origin;
    const epicRefs = (phase.epicIds || []);
    const taskRefs = (phase.taskIds || []);
    const tasks = phase.tasks || [];

    return html`
      <div class="plan-phase-card ${phaseStatusClass}">
        <div class="phase-card-header">
          <span class="phase-number">${index + 1}</span>
          <h4>${phase.name}</h4>
          <span class="phase-badge ${phaseStatusClass}">${phaseStatusLabel}</span>
        </div>
        ${phase.description ? html`<p class="phase-description-text">${phase.description}</p>` : nothing}
        ${epicRefs.length > 0 || taskRefs.length > 0 ? html`
          <div class="phase-refs">
            ${epicRefs.length > 0 ? html`<span>Epics: ${epicRefs.map(id => html`<a class="plan-link" href="${baseUrl}/adminproject?projectId=${this.projectId}&cardId=${id}">${id}</a> `)}</span>` : nothing}
            ${taskRefs.length > 0 ? html`<span>Tasks: ${taskRefs.map(id => html`<a class="plan-link" href="${baseUrl}/adminproject?projectId=${this.projectId}&cardId=${id}">${id}</a> `)}</span>` : nothing}
          </div>
        ` : nothing}
        ${tasks.length > 0 ? html`
          <div class="phase-ai-tasks">
            <span class="phase-ai-tasks-label">Proposed tasks (${tasks.length}):</span>
            <div class="phase-tasks-preview">
              ${tasks.map(t => html`
                <span class="phase-task-chip" title="${t.como || ''} ${t.quiero || ''} ${t.para || ''}">${t.title}</span>
              `)}
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderGeneratedTasks(plan) {
    const tasks = plan.generatedTasks || [];
    if (tasks.length === 0) return nothing;
    const baseUrl = window.location.origin;

    return html`
      <div class="generated-tasks-section">
        <h3>Generated Tasks (${tasks.length})</h3>
        ${tasks.map(t => html`
          <div class="generated-task-item">
            <a href="${baseUrl}/adminproject?projectId=${this.projectId}&cardId=${t.cardId}">${t.cardId}</a>
          </div>
        `)}
      </div>
    `;
  }

  // ── Creator View ──

  _renderCreator() {
    return html`
      <div class="plan-form-container">
        <div class="plan-form-header">
          <h2>New Development Plan</h2>
          <button class="plans-btn plans-btn-secondary" @click=${this._showList}>Cancel</button>
        </div>
        <p class="plan-creator-hint">Describe what you want to build. You can paste a full specification, user stories, or a brief context. The AI will generate a structured development plan.</p>
        <div class="plan-form-field">
          <label>Context / Description *</label>
          <textarea id="planContext" rows="10" .value=${this.aiContext}
            placeholder="Describe the feature, project, or change you want to plan...&#10;&#10;Example: We need a notification system that sends email alerts when tasks change status."
            @input=${(e) => { this.aiContext = e.target.value; }}></textarea>
        </div>
        <div class="plan-form-field">
          <label>Or upload a document</label>
          <input type="file" accept=".txt,.md,.markdown" @change=${this._handleFileUpload} />
        </div>
        ${this.creatorError ? html`<div class="plan-ai-error">${this.creatorError}</div>` : nothing}
        <div class="plan-form-actions">
          <button class="plans-btn plans-btn-primary"
            ?disabled=${this.aiGenerating}
            @click=${this._handleAIGenerate}>
            ${this.aiGenerating ? 'Generating plan...' : 'Generate Plan with AI'}
          </button>
          <button class="plans-btn plans-btn-secondary" @click=${() => this._showForm(null)}>Create manually</button>
        </div>
      </div>
    `;
  }

  async _handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      this.aiContext = text;
    } catch (err) {
      this.creatorError = 'Error reading file: ' + err.message;
    }
  }

  async _handleAIGenerate() {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('plan creation'); return; }
    const context = this.aiContext.trim();
    if (context.length < 10) {
      this.creatorError = 'Please provide at least 10 characters of context.';
      return;
    }

    this.creatorError = '';
    this.aiGenerating = true;

    try {
      const generatedPlan = await planService.generateWithAI(this.projectId, context);

      const plan = {
        title: generatedPlan.title || '',
        objective: generatedPlan.objective || '',
        status: 'draft',
        phases: (generatedPlan.phases || []).map(p => ({
          name: p.name || '',
          description: p.description || '',
          tasks: p.tasks || [],
          epicIds: [],
          taskIds: [],
          status: 'pending'
        })),
        _aiContext: context
      };

      if (this.proposalId) {
        plan.proposalId = this.proposalId;
      }

      this._showForm(null, plan);
    } catch (err) {
      this.creatorError = 'Error generating plan: ' + (err.message || 'Unknown error');
    } finally {
      this.aiGenerating = false;
    }
  }

  // ── Form View ──

  _renderForm() {
    const isEdit = !!this.formPlan?._id;
    const plan = this.formPlan || {};
    const formTitle = isEdit ? 'Edit Plan' : this.isAiGenerated ? 'Review AI-Generated Plan' : 'New Development Plan';

    return html`
      <div class="plan-form-container">
        <div class="plan-form-header">
          <h2>${formTitle}</h2>
          <button class="plans-btn plans-btn-secondary" @click=${() => {
            if (isEdit) this._showDetail(this.selectedPlan || plan);
            else this._showList();
          }}>Cancel</button>
        </div>
        ${this.isAiGenerated ? html`<div class="plan-ai-notice">This plan was generated by AI. Review and edit before saving.</div>` : nothing}
        ${this.formError ? html`<div class="plan-ai-error">${this.formError}</div>` : nothing}
        <form @submit=${this._handleFormSubmit}>
          <div class="plan-form-field">
            <label>Title *</label>
            <input type="text" id="planTitle" required .value=${plan.title || ''} placeholder="e.g. MCP Integration" />
          </div>
          <div class="plan-form-field">
            <label>Objective</label>
            <textarea id="planObjective" rows="3" placeholder="What is the goal?">${plan.objective || ''}</textarea>
          </div>
          <div class="plan-form-section">
            <div class="plan-form-section-header">
              <h3>Phases</h3>
              <button type="button" class="plans-btn plans-btn-small" @click=${this._addPhase}>+ Phase</button>
            </div>
            <div id="phasesContainer">
              ${(plan.phases || []).map((p, i) => this._renderPhaseRow(i, p))}
            </div>
          </div>
          ${this.isAiGenerated && plan._aiContext ? html`
            <div class="plan-form-section">
              <div class="plan-form-section-header"><h3>Refine with AI</h3></div>
              <div class="plan-form-field">
                <label>Add more context and regenerate</label>
                <textarea id="planExtraContext" rows="4" placeholder="Add more details...">${plan._aiContext}</textarea>
              </div>
              <button type="button" class="plans-btn plans-btn-secondary"
                ?disabled=${this.aiGenerating}
                @click=${this._handleRegenAI}>
                ${this.aiGenerating ? 'Regenerating...' : 'Regenerate with AI'}
              </button>
            </div>
          ` : nothing}
          <div class="plan-form-actions">
            <button type="submit" class="plans-btn plans-btn-primary">${isEdit ? 'Save Changes' : 'Save as Draft'}</button>
            ${isEdit ? html`<button type="button" class="plans-btn plans-btn-danger" @click=${() => this._handleDelete(plan)}>Delete</button>` : nothing}
          </div>
        </form>
      </div>
    `;
  }

  _renderPhaseRow(index, phase = {}) {
    const tasks = phase.tasks || [];

    return html`
      <div class="phase-row" data-idx="${index}">
        <div class="phase-row-header">
          <span class="phase-row-number">${index + 1}</span>
          <div class="phase-row-fields">
            <input type="text" class="phase-name" placeholder="Phase name" .value=${phase.name || ''} />
            <input type="text" class="phase-description" placeholder="Description" .value=${phase.description || ''} />
          </div>
          <button type="button" class="phase-remove-btn" @click=${(e) => e.target.closest('.phase-row').remove()} title="Remove phase">✕</button>
        </div>
        <div class="phase-tasks-editable">
          <span class="phase-tasks-label">Proposed tasks:</span>
          ${tasks.map((t, ti) => html`
            <div class="phase-task-item" data-task-idx="${ti}">
              <input type="text" class="phase-task-title" placeholder="Task title" .value=${t.title || ''} />
              <input type="text" class="phase-task-como" placeholder="As a..." .value=${t.como || ''} />
              <input type="text" class="phase-task-quiero" placeholder="I want..." .value=${t.quiero || ''} />
              <input type="text" class="phase-task-para" placeholder="So that..." .value=${t.para || ''} />
              <button type="button" class="phase-task-remove" @click=${(e) => e.target.closest('.phase-task-item').remove()} title="Remove task">✕</button>
            </div>
          `)}
          <button type="button" class="plans-btn plans-btn-small phase-add-task-btn" @click=${this._addTaskToPhase}>+ Task</button>
        </div>
      </div>
    `;
  }

  _addPhase() {
    const container = this.shadowRoot.querySelector('#phasesContainer');
    if (!container) return;
    const idx = this._phaseCounter++;
    const template = document.createElement('div');
    template.innerHTML = `
      <div class="phase-row" data-idx="${idx}">
        <div class="phase-row-header">
          <span class="phase-row-number">${idx + 1}</span>
          <div class="phase-row-fields">
            <input type="text" class="phase-name" placeholder="Phase name" value="" />
            <input type="text" class="phase-description" placeholder="Description" value="" />
          </div>
          <button type="button" class="phase-remove-btn" title="Remove phase">✕</button>
        </div>
        <div class="phase-tasks-editable">
          <span class="phase-tasks-label">Proposed tasks:</span>
          <button type="button" class="plans-btn plans-btn-small phase-add-task-btn">+ Task</button>
        </div>
      </div>
    `;
    const phaseRow = template.firstElementChild;
    phaseRow.querySelector('.phase-remove-btn').addEventListener('click', (e) => e.target.closest('.phase-row').remove());
    phaseRow.querySelector('.phase-add-task-btn').addEventListener('click', (e) => this._addTaskToPhaseFromButton(e));
    container.append(phaseRow);
  }

  _addTaskToPhase(e) {
    this._addTaskToPhaseFromButton(e);
  }

  _addTaskToPhaseFromButton(e) {
    const btn = e.target.closest('.phase-add-task-btn');
    if (!btn) return;
    const template = document.createElement('div');
    template.innerHTML = `
      <div class="phase-task-item">
        <input type="text" class="phase-task-title" placeholder="Task title" value="" />
        <input type="text" class="phase-task-como" placeholder="As a..." value="" />
        <input type="text" class="phase-task-quiero" placeholder="I want..." value="" />
        <input type="text" class="phase-task-para" placeholder="So that..." value="" />
        <button type="button" class="phase-task-remove" title="Remove task">✕</button>
      </div>
    `;
    const taskItem = template.firstElementChild;
    taskItem.querySelector('.phase-task-remove').addEventListener('click', (e) => e.target.closest('.phase-task-item').remove());
    btn.before(taskItem);
  }

  _collectFormData() {
    const root = this.shadowRoot;
    const title = root.querySelector('#planTitle')?.value.trim() || '';
    const objective = root.querySelector('#planObjective')?.value.trim() || '';
    const phases = [];

    root.querySelectorAll('.phase-row').forEach(row => {
      const name = row.querySelector('.phase-name')?.value.trim();
      if (!name) return;

      const tasks = [];
      row.querySelectorAll('.phase-task-item').forEach(taskEl => {
        const taskTitle = taskEl.querySelector('.phase-task-title')?.value.trim();
        if (!taskTitle) return;
        tasks.push({
          title: taskTitle,
          como: taskEl.querySelector('.phase-task-como')?.value.trim() || '',
          quiero: taskEl.querySelector('.phase-task-quiero')?.value.trim() || '',
          para: taskEl.querySelector('.phase-task-para')?.value.trim() || ''
        });
      });

      phases.push({
        name,
        description: row.querySelector('.phase-description')?.value.trim() || '',
        epicIds: [],
        taskIds: [],
        tasks,
        status: 'pending'
      });
    });

    return { title, objective, status: 'draft', phases };
  }

  async _handleFormSubmit(e) {
    e.preventDefault();
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('plan editing'); return; }
    const formData = this._collectFormData();
    if (!formData.title) {
      this.formError = 'Title is required.';
      return;
    }

    this.formError = '';
    const isEdit = !!this.formPlan?._id;

    try {
      const planToSave = {
        ...formData,
        _id: isEdit ? this.formPlan._id : undefined,
        proposalId: this.formPlan?.proposalId || this.proposalId || undefined
      };

      await planService.save(this.projectId, planToSave);

      // If linked to a proposal, update proposal's planIds
      if (planToSave.proposalId) {
        try {
          const { planProposalService } = await import('../services/plan-proposal-service.js');
          const savedPlans = await planService.getAll(this.projectId);
          const lastPlan = savedPlans[0]; // Most recently updated
          if (lastPlan) {
            await planProposalService.linkPlan(this.projectId, planToSave.proposalId, lastPlan._id);
          }
        } catch (linkError) {
          console.error('Error linking proposal:', linkError);
        }
      }

      await this.loadPlans();
      this._showList();
    } catch (err) {
      this.formError = 'Error saving plan: ' + (err.message || 'Unknown error');
    }
  }

  async _handleRegenAI() {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('plan editing'); return; }
    const extraContext = this.shadowRoot.querySelector('#planExtraContext')?.value.trim();
    if (!extraContext || extraContext.length < 10) return;

    this.formError = '';
    this.aiGenerating = true;

    const currentPlan = this._collectFormData();

    try {
      const generatedPlan = await planService.generateWithAI(
        this.projectId,
        extraContext,
        JSON.stringify(currentPlan)
      );

      const newPlan = {
        title: generatedPlan.title || '',
        objective: generatedPlan.objective || '',
        status: 'draft',
        phases: (generatedPlan.phases || []).map(p => ({
          name: p.name || '',
          description: p.description || '',
          tasks: p.tasks || [],
          epicIds: [],
          taskIds: [],
          status: 'pending'
        })),
        _aiContext: extraContext,
        proposalId: this.formPlan?.proposalId || this.proposalId || undefined
      };

      this._showForm(null, newPlan);
    } catch (err) {
      this.formError = 'Error regenerating: ' + (err.message || 'Unknown error');
    } finally {
      this.aiGenerating = false;
    }
  }

  // ── Actions ──

  async _handleAccept(plan) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('plan editing'); return; }
    try {
      await planService.accept(this.projectId, plan._id);
      plan.status = 'accepted';
      const cached = this.plans.find(p => p._id === plan._id);
      if (cached) cached.status = 'accepted';
      this.selectedPlan = { ...plan };
      this.requestUpdate();
    } catch (err) {
      console.error('Error accepting plan:', err);
    }
  }

  async _handleDelete(plan) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('plan deletion'); return; }
    if (window.modalService?.confirm) {
      const confirmed = await window.modalService.confirm(`Are you sure you want to delete "${plan.title}"?`);
      if (!confirmed) return;
    }

    try {
      await planService.delete(this.projectId, plan._id);
      await this.loadPlans();
      this._showList();
    } catch (err) {
      console.error('Error deleting plan:', err);
    }
  }

  async _handleGenerate(plan) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('task generation'); return; }
    const totalTasks = (plan.phases || []).reduce((sum, p) => sum + (p.tasks || []).length, 0);
    if (totalTasks === 0) {
      if (window.modalService) {
        await window.modalService.alert('This plan has no tasks defined in its phases. Edit the plan to add tasks first.');
      }
      return;
    }

    if (window.modalService?.confirm) {
      const confirmed = await window.modalService.confirm(
        `Generate ${totalTasks} task(s) from plan "${plan.title}"?\n\nTasks will be created with status "To Do" and linked to their phase epics.`
      );
      if (!confirmed) return;
    }

    this.taskGenerating = true;

    try {
      const { createdTasks, totalCreated } = await planService.generateTasksFromPlan(this.projectId, plan._id);

      // Refresh plan data
      const refreshed = await planService.refresh(this.projectId, plan._id);
      if (refreshed) {
        Object.assign(plan, refreshed);
        const cached = this.plans.find(p => p._id === plan._id);
        if (cached) Object.assign(cached, refreshed);
      }

      if (window.modalService) {
        await window.modalService.alert(`${totalCreated} task(s) created successfully!\n\nTask IDs: ${createdTasks.map(t => t.cardId).join(', ')}`);
      }

      this.selectedPlan = { ...plan };
      this.requestUpdate();
    } catch (err) {
      if (window.modalService) {
        await window.modalService.alert(`Error generating tasks: ${err.message || 'Unknown error'}`);
      }
    } finally {
      this.taskGenerating = false;
    }
  }

  async _handleRegenerate(plan) {
    if (demoModeService.isDemo()) { demoModeService.showFeatureDisabled('task generation'); return; }
    const prevCount = (plan.generatedTasks || []).length;
    const totalTasks = (plan.phases || []).reduce((sum, p) => sum + (p.tasks || []).length, 0);

    if (window.modalService?.confirm) {
      const confirmed = await window.modalService.confirm(
        `Regenerate tasks for plan "${plan.title}"?\n\n` +
        `This will delete ${prevCount} previously generated task(s) that are still in "To Do" status ` +
        `and create ${totalTasks} new task(s).\n\n` +
        `Tasks that have already been started (In Progress, etc.) will be kept.`
      );
      if (!confirmed) return;
    }

    this.taskGenerating = true;

    try {
      const { createdTasks, totalCreated, skippedTasks } = await planService.regenerateTasksFromPlan(this.projectId, plan._id);

      const refreshed = await planService.refresh(this.projectId, plan._id);
      if (refreshed) {
        Object.assign(plan, refreshed);
        const cached = this.plans.find(p => p._id === plan._id);
        if (cached) Object.assign(cached, refreshed);
      }

      let message = `${totalCreated} task(s) created successfully!`;
      if (skippedTasks && skippedTasks.length > 0) {
        message += `\n\n${skippedTasks.length} task(s) were kept because they are already in progress:\n`;
        message += skippedTasks.map(s => `  - ${s.cardId} (${s.status})`).join('\n');
      }
      message += `\n\nNew Task IDs: ${createdTasks.map(t => t.cardId).join(', ')}`;

      if (window.modalService) {
        await window.modalService.alert(message);
      }

      this.selectedPlan = { ...plan };
      this.requestUpdate();
    } catch (err) {
      if (window.modalService) {
        await window.modalService.alert(`Error regenerating tasks: ${err.message || 'Unknown error'}`);
      }
    } finally {
      this.taskGenerating = false;
    }
  }

  // ── Main render ──

  render() {
    switch (this.currentView) {
      case 'detail':
        return html`<div class="plans-container">${this._renderDetail()}</div>`;
      case 'form':
        return html`<div class="plans-container">${this._renderForm()}</div>`;
      case 'creator':
        return html`<div class="plans-container">${this._renderCreator()}</div>`;
      default:
        return html`
          <div class="plans-container">
            <div class="plans-header">
              <h2>Development Plans</h2>
              <button class="plans-btn plans-btn-primary" @click=${this._showCreator}>+ New Plan</button>
            </div>
            ${this._renderList()}
          </div>
        `;
    }
  }
}

customElements.define('dev-plans-list', DevPlansList);

// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock Lit
vi.mock('https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm', () => ({
  LitElement: class MockLitElement {
    static get properties() { return {}; }
    static get styles() { return []; }
    constructor() {
      this._properties = {};
    }
    connectedCallback() {}
    disconnectedCallback() {}
    updated() {}
    requestUpdate() {}
    dispatchEvent(event) { return true; }
    addEventListener() {}
    removeEventListener() {}
  },
  html: (strings, ...values) => ({ strings, values }),
  css: (strings, ...values) => ({ strings, values }),
  nothing: ''
}));

// Mock styles
vi.mock('../../public/js/wc/plan-proposals-list-styles.js', () => ({
  PlanProposalsListStyles: {}
}));

// Mock service
vi.mock('../../public/js/services/plan-proposal-service.js', () => ({
  planProposalService: {
    getAll: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue({ id: 'new-1', title: 'Test' }),
    delete: vi.fn().mockResolvedValue(true)
  },
  PROPOSAL_STATUSES: ['pending', 'planned', 'rejected']
}));

vi.mock('../../public/js/services/demo-mode-service.js', () => ({
  demoModeService: {
    isDemo: vi.fn(() => false),
    showFeatureDisabled: vi.fn(),
    showLimitReached: vi.fn()
  }
}));

const { PlanProposalsList } = await import('../../public/js/wc/PlanProposalsList.js');

describe('PlanProposalsList', () => {
  it('should export PlanProposalsList class', () => {
    expect(PlanProposalsList).toBeDefined();
  });

  it('should be registered as custom element', () => {
    expect(customElements.get('plan-proposals-list')).toBeDefined();
  });

  it('should define expected properties', () => {
    const props = PlanProposalsList.properties;
    expect(props.projectId).toBeDefined();
    expect(props.proposals).toBeDefined();
    expect(props.loading).toBeDefined();
    expect(props.statusFilter).toBeDefined();
    expect(props.currentView).toBeDefined();
    expect(props.editingProposal).toBeDefined();
    expect(props.formTags).toBeDefined();
    expect(props.formError).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize with defaults', () => {
      const comp = new PlanProposalsList();
      expect(comp.projectId).toBe('');
      expect(comp.proposals).toEqual([]);
      expect(comp.loading).toBe(false);
      expect(comp.statusFilter).toBe('');
      expect(comp.currentView).toBe('list');
      expect(comp.editingProposal).toBeNull();
      expect(comp.formTags).toEqual([]);
      expect(comp.formError).toBe('');
    });
  });

  describe('filteredProposals', () => {
    it('should return all proposals when no filter', () => {
      const comp = new PlanProposalsList();
      comp.proposals = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'planned' }
      ];
      expect(comp.filteredProposals).toHaveLength(2);
    });

    it('should filter by status', () => {
      const comp = new PlanProposalsList();
      comp.proposals = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'planned' },
        { id: '3', status: 'pending' }
      ];
      comp.statusFilter = 'pending';
      expect(comp.filteredProposals).toHaveLength(2);
      expect(comp.filteredProposals.every(p => p.status === 'pending')).toBe(true);
    });
  });

  describe('_showForm', () => {
    it('should switch to form view', () => {
      const comp = new PlanProposalsList();
      comp._showForm();
      expect(comp.currentView).toBe('form');
      expect(comp.editingProposal).toBeNull();
    });

    it('should set editing proposal when provided', () => {
      const comp = new PlanProposalsList();
      const proposal = { id: '1', title: 'Test', tags: ['tag1'] };
      comp._showForm(proposal);
      expect(comp.currentView).toBe('form');
      expect(comp.editingProposal).toBe(proposal);
      expect(comp.formTags).toEqual(['tag1']);
    });
  });

  describe('_cancelForm', () => {
    it('should return to list view', () => {
      const comp = new PlanProposalsList();
      comp.currentView = 'form';
      comp.editingProposal = { id: '1' };
      comp.formTags = ['tag1'];
      comp.formError = 'error';

      comp._cancelForm();

      expect(comp.currentView).toBe('list');
      expect(comp.editingProposal).toBeNull();
      expect(comp.formTags).toEqual([]);
      expect(comp.formError).toBe('');
    });
  });

  describe('_removeTag', () => {
    it('should remove tag from formTags', () => {
      const comp = new PlanProposalsList();
      comp.formTags = ['tag1', 'tag2', 'tag3'];
      comp._removeTag('tag2');
      expect(comp.formTags).toEqual(['tag1', 'tag3']);
    });
  });

  describe('_handleGeneratePlan', () => {
    it('should dispatch generate-plan-from-proposal event', () => {
      const comp = new PlanProposalsList();
      let dispatched = false;
      comp.dispatchEvent = (event) => {
        dispatched = true;
        expect(event.type).toBe('generate-plan-from-proposal');
        expect(event.detail.proposalId).toBe('1');
        expect(event.detail.title).toBe('Test');
        expect(event.detail.description).toBe('Desc');
        return true;
      };

      comp._handleGeneratePlan({ id: '1', title: 'Test', description: 'Desc' });
      expect(dispatched).toBe(true);
    });
  });

  describe('render', () => {
    it('should return a template for list view', () => {
      const comp = new PlanProposalsList();
      const result = comp.render();
      expect(result).toBeDefined();
      expect(result.strings).toBeDefined();
    });

    it('should return a template for form view', () => {
      const comp = new PlanProposalsList();
      comp.currentView = 'form';
      const result = comp.render();
      expect(result).toBeDefined();
    });
  });
});

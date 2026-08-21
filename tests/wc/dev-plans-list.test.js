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
vi.mock('../../public/js/wc/dev-plans-list-styles.js', () => ({
  DevPlansListStyles: {}
}));

// Mock FirebaseService (dynamically imported when marking the origin proposal)
const updateCardMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../public/js/services/firebase-service.js', () => ({
  FirebaseService: {
    updateCard: (...args) => updateCardMock(...args)
  }
}));

// Mock service
vi.mock('../../public/js/services/plan-service.js', () => ({
  planService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({ _id: 'new-1', title: 'Test' }),
    delete: vi.fn().mockResolvedValue(true),
    accept: vi.fn().mockResolvedValue(),
    generateWithAI: vi.fn().mockResolvedValue({ title: 'AI Plan', phases: [] }),
    generateTasksFromPlan: vi.fn().mockResolvedValue({ createdTasks: [], totalCreated: 0 }),
    regenerateTasksFromPlan: vi.fn().mockResolvedValue({ createdTasks: [], totalCreated: 0, skippedTasks: [] }),
    refresh: vi.fn().mockResolvedValue(null)
  },
  PLAN_STATUSES: ['draft', 'accepted']
}));

vi.mock('../../public/js/services/demo-mode-service.js', () => ({
  demoModeService: {
    isDemo: vi.fn(() => false),
    showFeatureDisabled: vi.fn(),
    showLimitReached: vi.fn()
  }
}));

const { DevPlansList } = await import('../../public/js/wc/DevPlansList.js');

describe('DevPlansList', () => {
  it('should export DevPlansList class', () => {
    expect(DevPlansList).toBeDefined();
  });

  it('should be registered as custom element', () => {
    expect(customElements.get('dev-plans-list')).toBeDefined();
  });

  it('should define expected properties', () => {
    const props = DevPlansList.properties;
    expect(props.projectId).toBeDefined();
    expect(props.plans).toBeDefined();
    expect(props.loading).toBeDefined();
    expect(props.currentView).toBeDefined();
    expect(props.selectedPlan).toBeDefined();
    expect(props.formPlan).toBeDefined();
    expect(props.aiGenerating).toBeDefined();
    expect(props.taskGenerating).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize with defaults', () => {
      const comp = new DevPlansList();
      expect(comp.projectId).toBe('');
      expect(comp.plans).toEqual([]);
      expect(comp.loading).toBe(false);
      expect(comp.currentView).toBe('list');
      expect(comp.selectedPlan).toBeNull();
      expect(comp.formPlan).toBeNull();
      expect(comp.aiGenerating).toBe(false);
      expect(comp.taskGenerating).toBe(false);
      expect(comp.formError).toBe('');
      expect(comp.creatorError).toBe('');
    });
  });

  describe('view switching', () => {
    it('_showList should reset to list view', () => {
      const comp = new DevPlansList();
      comp.currentView = 'detail';
      comp.selectedPlan = { _id: '1' };
      comp.formPlan = { title: 'test' };

      comp._showList();

      expect(comp.currentView).toBe('list');
      expect(comp.selectedPlan).toBeNull();
      expect(comp.formPlan).toBeNull();
      expect(comp.formError).toBe('');
      expect(comp.creatorError).toBe('');
    });

    it('_showDetail should switch to detail view', () => {
      const comp = new DevPlansList();
      const plan = { _id: '1', title: 'Test' };

      comp._showDetail(plan);

      expect(comp.currentView).toBe('detail');
      expect(comp.selectedPlan).toBe(plan);
    });

    it('_showForm should switch to form view with plan', () => {
      const comp = new DevPlansList();
      const plan = { _id: '1', title: 'Test', phases: [] };

      comp._showForm(plan);

      expect(comp.currentView).toBe('form');
      expect(comp.formPlan).toBe(plan);
      expect(comp.isAiGenerated).toBe(false);
    });

    it('_showForm should handle AI-generated plan', () => {
      const comp = new DevPlansList();
      const aiPlan = { title: 'AI Plan', phases: [{ name: 'P1' }] };

      comp._showForm(null, aiPlan);

      expect(comp.currentView).toBe('form');
      expect(comp.formPlan).toBe(aiPlan);
      expect(comp.isAiGenerated).toBe(true);
    });

    it('_showCreator should switch to creator view', () => {
      const comp = new DevPlansList();

      comp._showCreator();

      expect(comp.currentView).toBe('creator');
      expect(comp.aiContext).toBe('');
      expect(comp.creatorError).toBe('');
      expect(comp.proposalCardId).toBe('');
      expect(comp.proposalFirebaseId).toBe('');
    });
  });

  describe('openCreatorFromProposal (PLN-TSK-0358)', () => {
    it('should keep the origin proposal and seed the context with title + description', () => {
      const comp = new DevPlansList();

      comp.openCreatorFromProposal({
        proposalCardId: 'SIM-PRP-0002',
        proposalFirebaseId: '-P-Z-Cbq2XrJqIh4MYgk',
        title: 'Las partidas viven en el servidor',
        description: 'Descripción de la propuesta'
      });

      expect(comp.currentView).toBe('creator');
      expect(comp.proposalCardId).toBe('SIM-PRP-0002');
      expect(comp.proposalFirebaseId).toBe('-P-Z-Cbq2XrJqIh4MYgk');
      expect(comp.aiContext).toBe('Las partidas viven en el servidor\n\nDescripción de la propuesta');
    });

    it('should refuse to open without a proposal card id', () => {
      const comp = new DevPlansList();

      expect(() => comp.openCreatorFromProposal({ title: 'Sin id' })).toThrow(/proposalCardId/);
      expect(comp.currentView).toBe('list');
    });
  });

  describe('_markProposalAsConverted (PLN-TSK-0358)', () => {
    beforeEach(() => {
      updateCardMock.mockClear();
    });

    it('should write convertedToPlan back on the origin proposal card', async () => {
      const comp = new DevPlansList();
      comp.projectId = 'SimuladorEstrategico';
      comp.proposalCardId = 'SIM-PRP-0002';
      comp.proposalFirebaseId = '-P-Z-Cbq2XrJqIh4MYgk';

      await comp._markProposalAsConverted({ _id: 'plan-1', cardId: 'SIM-PLA-0003' });

      expect(updateCardMock).toHaveBeenCalledWith(
        'SimuladorEstrategico',
        'proposals',
        '-P-Z-Cbq2XrJqIh4MYgk',
        { convertedToPlan: 'SIM-PLA-0003' }
      );
    });

    it('should fail loudly when the plan has no cardId instead of marking a wrong value', async () => {
      const comp = new DevPlansList();
      comp.projectId = 'SimuladorEstrategico';
      comp.proposalCardId = 'SIM-PRP-0002';
      comp.proposalFirebaseId = '-P-Z-Cbq2XrJqIh4MYgk';

      await expect(comp._markProposalAsConverted({ _id: 'plan-1' })).rejects.toThrow(/cardId/);
      expect(updateCardMock).not.toHaveBeenCalled();
    });

    it('should fail loudly when the proposal Firebase id is missing', async () => {
      const comp = new DevPlansList();
      comp.projectId = 'SimuladorEstrategico';
      comp.proposalCardId = 'SIM-PRP-0002';

      await expect(comp._markProposalAsConverted({ cardId: 'SIM-PLA-0003' })).rejects.toThrow(/Firebase id/);
      expect(updateCardMock).not.toHaveBeenCalled();
    });
  });

  describe('render', () => {
    it('should return template for list view', () => {
      const comp = new DevPlansList();
      const result = comp.render();
      expect(result).toBeDefined();
      expect(result.strings).toBeDefined();
    });

    it('should return template for detail view', () => {
      const comp = new DevPlansList();
      comp.currentView = 'detail';
      comp.selectedPlan = {
        _id: '1',
        title: 'Test',
        status: 'draft',
        phases: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
        createdBy: 'test@test.com'
      };
      const result = comp.render();
      expect(result).toBeDefined();
    });

    it('should return template for form view', () => {
      const comp = new DevPlansList();
      comp.currentView = 'form';
      comp.formPlan = { title: 'Test', phases: [] };
      const result = comp.render();
      expect(result).toBeDefined();
    });

    it('should return template for creator view', () => {
      const comp = new DevPlansList();
      comp.currentView = 'creator';
      const result = comp.render();
      expect(result).toBeDefined();
    });
  });
});

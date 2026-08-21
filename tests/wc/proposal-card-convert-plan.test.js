// @vitest-environment jsdom
/**
 * PLN-TSK-0358 — a proposal has TWO outcomes when approved: it becomes a
 * task (existing flow) or a plan (this one). Converting to plan keeps the
 * proposal card marked with convertedToPlan, exactly like the MCP does via
 * create_plan proposalCardId.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const litMock = {
  LitElement: class MockLitElement {
    static get properties() { return {}; }
    constructor() {
      this.tagName = 'PROPOSAL-CARD';
    }
    requestUpdate() {}
    updated() {}
    connectedCallback() {}
    disconnectedCallback() {}
    dispatchEvent() { return true; }
    getAttribute() { return null; }
    setAttribute() {}
  },
  html: (strings, ...values) => ({ strings, values }),
  css: (strings, ...values) => ({ strings, values }),
  unsafeCSS: (str) => str
};

vi.mock('https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm', () => litMock);
vi.mock('https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm', () => litMock);

vi.mock('https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm', () => ({
  format: vi.fn(() => '01/01/2024'),
  parse: vi.fn(() => new Date(2024, 0, 1)),
  isValid: vi.fn(() => true)
}));

vi.mock('https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js', () => ({
  ref: vi.fn(),
  onValue: vi.fn()
}));

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  functions: {},
  httpsCallable: vi.fn()
}));

// BaseCard is mocked: this suite exercises ProposalCard's own conversion
// logic, not the shared card plumbing (covered by base-card.test.js).
vi.mock('../../public/js/wc/base-card.js', () => ({
  BaseCard: class MockBaseCard extends litMock.LitElement {
    static get properties() { return {}; }
    constructor() {
      super();
      this.cardId = '';
      this._firebaseId = '';
      this.notifications = [];
    }
    getIdForFirebase() { return this._firebaseId; }
    _showNotification(message, type = 'info') { this.notifications.push({ message, type }); }
    get canEditPermission() { return true; }
    get canMoveToProject() { return false; }
    get isYearReadOnly() { return false; }
  }
}));

vi.mock('../../public/js/wc/proposal-card-styles.js', () => ({ ProposalCardStyles: [] }));
vi.mock('../../public/js/services/developer-backlog-service.js', () => ({
  developerBacklogService: { addItem: vi.fn(), removeItem: vi.fn() }
}));
vi.mock('../../public/js/services/entity-directory-service.js', () => ({
  entityDirectoryService: { waitForInit: vi.fn(() => Promise.resolve()), resolveDeveloperEmail: vi.fn() }
}));
vi.mock('../../public/js/utils/super-admin-check.js', () => ({
  isCurrentUserSuperAdmin: vi.fn(() => false)
}));
vi.mock('../../public/js/utils/scenario-modal.js', () => ({ openScenarioModal: vi.fn() }));
vi.mock('../../public/js/services/demo-mode-service.js', () => ({
  demoModeService: { isDemo: vi.fn(() => false), showFeatureDisabled: vi.fn() }
}));

const { ProposalCard } = await import('../../public/js/wc/ProposalCard.js');
const { PROPOSAL_SCHEMA } = await import('../../public/js/schemas/card-field-schemas.js');

/**
 * Build a saved proposal (has both a cardId with the -PRP- marker and a
 * Firebase id), which is the only state where conversion is offered.
 */
function makeSavedProposal(overrides = {}) {
  const card = new ProposalCard();
  card.cardId = 'SIM-PRP-0002';
  card.id = '-P-Z-Cbq2XrJqIh4MYgk';
  card._firebaseId = '-P-Z-Cbq2XrJqIh4MYgk';
  card.projectId = 'SimuladorEstrategico';
  card.title = 'Las partidas viven en el servidor';
  Object.assign(card, overrides);
  return card;
}

describe('ProposalCard — convert to plan (PLN-TSK-0358)', () => {
  let dispatched;
  let navigated;

  beforeEach(() => {
    dispatched = [];
    navigated = [];
    document.addEventListener('convert-proposal-to-plan', (e) => dispatched.push(e));
    document.addEventListener('show-modal', (e) => dispatched.push(e));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('convertedToPlan property', () => {
    it('should be declared as a reactive String property', () => {
      expect(ProposalCard.properties.convertedToPlan).toBeDefined();
      expect(ProposalCard.properties.convertedToPlan.type).toBe(String);
    });

    it('should start empty', () => {
      expect(new ProposalCard().convertedToPlan).toBe('');
    });

    it('should be persisted so the UI mark survives a save', () => {
      expect(PROPOSAL_SCHEMA.PERSISTENT_FIELDS).toContain('convertedToPlan');
    });
  });

  describe('canConvert / isConverted', () => {
    it('should allow conversion on a saved, unconverted proposal', () => {
      const card = makeSavedProposal();
      expect(card.isConverted).toBe(false);
      expect(card.canConvert).toBe(true);
    });

    it('should not allow conversion on an unsaved proposal', () => {
      const card = new ProposalCard();
      card.cardId = 'temp-123';
      expect(card.canConvert).toBe(false);
    });

    it('should not allow converting twice once it became a plan', () => {
      const card = makeSavedProposal({ convertedToPlan: 'SIM-PLA-0003' });
      expect(card.isConverted).toBe(true);
      expect(card.canConvert).toBe(false);
    });
  });

  describe('convertToPlan()', () => {
    it('should dispatch a cancelable convert-proposal-to-plan event carrying the proposal', () => {
      const card = makeSavedProposal();
      vi.spyOn(card, '_navigate').mockImplementation((url) => navigated.push(url));

      card.convertToPlan();

      const event = dispatched.find(e => e.type === 'convert-proposal-to-plan');
      expect(event).toBeDefined();
      expect(event.cancelable).toBe(true);
      expect(event.detail.proposalCardId).toBe('SIM-PRP-0002');
      expect(event.detail.projectId).toBe('SimuladorEstrategico');
      expect(event.detail.title).toBe('Las partidas viven en el servidor');
    });

    it('should NOT navigate when the page handles the event in place', () => {
      const card = makeSavedProposal();
      vi.spyOn(card, '_navigate').mockImplementation((url) => navigated.push(url));
      const handler = (e) => e.preventDefault();
      document.addEventListener('convert-proposal-to-plan', handler);

      card.convertToPlan();
      document.removeEventListener('convert-proposal-to-plan', handler);

      expect(navigated).toEqual([]);
    });

    it('should navigate to the project Dev Plans tab when nobody handles it', () => {
      const card = makeSavedProposal();
      vi.spyOn(card, '_navigate').mockImplementation((url) => navigated.push(url));

      card.convertToPlan();

      expect(navigated).toHaveLength(1);
      expect(navigated[0]).toContain('/adminproject');
      expect(navigated[0]).toContain('projectId=SimuladorEstrategico');
      expect(navigated[0]).toContain('fromProposal=SIM-PRP-0002');
      expect(navigated[0]).toContain('#devPlans');
    });
  });

  describe('plan context', () => {
    it('should seed the plan creator with the structured description', () => {
      const card = makeSavedProposal({
        descDado: 'Como jugador',
        descCuando: 'Quiero que la partida viva en el servidor',
        descPara: 'Para no perder el estado al recargar',
        acceptanceCriteria: 'La partida sobrevive a un F5'
      });

      const context = card._buildPlanContext();

      expect(context).toContain('Como jugador');
      expect(context).toContain('Quiero que la partida viva en el servidor');
      expect(context).toContain('Para no perder el estado al recargar');
      expect(context).toContain('La partida sobrevive a un F5');
    });

    it('should fall back to the legacy free-text description', () => {
      const card = makeSavedProposal({ description: 'Texto libre heredado' });
      expect(card._buildPlanContext()).toContain('Texto libre heredado');
    });
  });

  describe('traceability badge', () => {
    it('should point at the Dev Plans tab of the project and name the plan', () => {
      const card = makeSavedProposal({ convertedToPlan: 'SIM-PLA-0003' });

      const badge = card.renderConvertedBadge();
      const rendered = badge.values.join(' ');

      expect(card.devPlansUrl).toBe('/adminproject?projectId=SimuladorEstrategico#devPlans');
      expect(rendered).toContain('SIM-PLA-0003');
      expect(rendered).toContain('/adminproject?projectId=SimuladorEstrategico#devPlans');
    });
  });

  describe('showConvertToPlanConfirmation()', () => {
    it('should ask for confirmation before converting', () => {
      const card = makeSavedProposal();

      card.showConvertToPlanConfirmation();

      const modal = dispatched.find(e => e.type === 'show-modal');
      expect(modal).toBeDefined();
      expect(modal.detail.options.title).toMatch(/plan/i);
      expect(typeof modal.detail.options.button1Action).toBe('function');
    });

    it('should refuse to convert a proposal that was never saved', () => {
      const card = new ProposalCard();
      card.cardId = 'temp-123';

      card.showConvertToPlanConfirmation();

      expect(dispatched.find(e => e.type === 'show-modal')).toBeUndefined();
      expect(card.notifications.at(-1).message).toMatch(/guarda la propuesta/i);
    });
  });
});

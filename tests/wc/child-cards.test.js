// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// Mock de dependencias externas
vi.mock('https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm', () => ({
  LitElement: class MockLitElement {
    static get properties() { return {}; }
    constructor() {
      this._requestedUpdates = [];
      this.tagName = 'MOCK-ELEMENT';
    }
    requestUpdate() {
      this._requestedUpdates.push(Date.now());
    }
    updated() {}
    connectedCallback() {}
    disconnectedCallback() {}
    dispatchEvent(event) { return true; }
    getAttribute(name) { return null; }
    setAttribute(name, value) {}
  },
  html: (strings, ...values) => ({ strings, values }),
  css: (strings, ...values) => ({ strings, values })
}));

vi.mock('https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm', () => ({
  format: vi.fn((date, formatStr) => '01/01/2024'),
  parse: vi.fn((dateStr, formatStr, ref) => new Date(2024, 0, 1)),
  isValid: vi.fn((date) => date instanceof Date && !isNaN(date.getTime()))
}));

vi.mock('../../public/js/utils/service-communicator.js', () => ({
  ServiceCommunicator: {
    requestPermissions: vi.fn(),
    requestCardAction: vi.fn(),
    requestGlobalData: vi.fn()
  }
}));

vi.mock('../../public/js/services/entity-directory-service.js', () => ({
  entityDirectoryService: {
    resolveDeveloperEmail: vi.fn((id) => id.startsWith('dev_') ? `${id}@example.com` : null),
    resolveStakeholderEmail: vi.fn((id) => id.startsWith('stk_') ? `${id}@example.com` : null),
    waitForInit: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../../public/js/services/demo-mode-service.js', () => ({
  demoModeService: {
    isDemo: vi.fn(() => false),
    showFeatureDisabled: vi.fn(),
    showLimitReached: vi.fn()
  }
}));

// Import BaseCard
const { BaseCard } = await import('../../public/js/wc/base-card.js');

// ==================== HELPER TO CREATE TEST CARD ====================
function createTestCard(CardClass, tagName, overrideState = {}) {
  class TestableCard extends CardClass {
    constructor() {
      super();
      this.tagName = tagName.toUpperCase();
      this.cardType = tagName.toLowerCase();
    }
  }

  const card = new TestableCard();

  // Apply any overrides
  Object.keys(overrideState).forEach(key => {
    card[key] = overrideState[key];
  });

  return card;
}

// ==================== TASK CARD TESTS ====================
describe('TaskCard _getEditableState()', () => {
  let TaskCard;

  beforeAll(async () => {
    // Mock additional TaskCard dependencies
    vi.mock('../../public/js/wc/task-card-styles.js', () => ({
      taskCardStyles: { strings: [], values: [] }
    }));
    vi.mock('../../public/js/config/app-constants.js', () => ({
      APP_CONSTANTS: {
        TASK_STATUS_ORDER: ['To Do', 'In Progress', 'Done'],
        BUG_STATUS_ORDER: ['Created', 'In Progress', 'Fixed']
      }
    }));

    // Create TaskCard class that extends BaseCard
    TaskCard = class extends BaseCard {
      static get properties() {
        return {
          ...super.properties,
          acceptanceCriteria: { type: String },
          descriptionStructured: { type: Array },
          acceptanceCriteriaStructured: { type: Array },
          businessPoints: { type: Number },
          devPoints: { type: Number },
          desiredDate: { type: String },
          sprint: { type: String },
          developer: { type: String },
          epic: { type: String },
          validator: { type: String },
          spike: { type: Boolean },
          expedited: { type: Boolean },
          blockedByBusiness: { type: Boolean },
          blockedByDevelopment: { type: Boolean },
          bbbWhy: { type: String },
          bbbWho: { type: String },
          bbdWhy: { type: String },
          bbdWho: { type: String },
          attachment: { type: String },
          relatedTasks: { type: Array }
        };
      }

      constructor() {
        super();
        this.tagName = 'TASK-CARD';
        this.cardType = 'task-card';
        this.acceptanceCriteria = '';
        this.descriptionStructured = [{ role: '', goal: '', benefit: '', legacy: '' }];
        this.acceptanceCriteriaStructured = [];
        this.businessPoints = 0;
        this.devPoints = 0;
        this.desiredDate = '';
        this.sprint = '';
        this.developer = '';
        this.epic = '';
        this.validator = '';
        this.spike = false;
        this.expedited = false;
        this.blockedByBusiness = false;
        this.blockedByDevelopment = false;
        this.bbbWhy = '';
        this.bbbWho = '';
        this.bbdWhy = '';
        this.bbdWho = '';
        this.attachment = '';
        this.relatedTasks = [];
      }

      _getEditableState() {
        return {
          ...super._getEditableState(),
          acceptanceCriteria: this.acceptanceCriteria || '',
          descriptionStructured: JSON.stringify(this.descriptionStructured || []),
          acceptanceCriteriaStructured: JSON.stringify(this.acceptanceCriteriaStructured || []),
          businessPoints: this.businessPoints || 0,
          devPoints: this.devPoints || 0,
          startDate: this.startDate || '',
          desiredDate: this.desiredDate || '',
          endDate: this.endDate || '',
          sprint: this.sprint || '',
          developer: this.developer || '',
          epic: this.epic || '',
          validator: this.validator || '',
          spike: this.spike || false,
          expedited: this.expedited || false,
          blockedByBusiness: this.blockedByBusiness || false,
          blockedByDevelopment: this.blockedByDevelopment || false,
          bbbWhy: this.bbbWhy || '',
          bbbWho: this.bbbWho || '',
          bbdWhy: this.bbdWhy || '',
          bbdWho: this.bbdWho || '',
          attachment: this.attachment || '',
          relatedTasks: JSON.stringify(this.relatedTasks || [])
        };
      }
    };
  });

  it('includes all task-specific fields', () => {
    const card = new TaskCard();
    card.title = 'Test Task';
    card.description = 'Description';
    card.acceptanceCriteria = 'AC here';
    card.businessPoints = 5;
    card.devPoints = 8;
    card.sprint = 'Sprint-001';
    card.developer = 'dev_123';
    card.epic = 'epic-001';
    card.validator = 'dev_456';

    const state = card._getEditableState();

    expect(state.title).toBe('Test Task');
    expect(state.description).toBe('Description');
    expect(state.acceptanceCriteria).toBe('AC here');
    expect(state.businessPoints).toBe(5);
    expect(state.devPoints).toBe(8);
    expect(state.sprint).toBe('Sprint-001');
    expect(state.developer).toBe('dev_123');
    expect(state.epic).toBe('epic-001');
    expect(state.validator).toBe('dev_456');
  });

  it('includes blocked fields', () => {
    const card = new TaskCard();
    card.blockedByBusiness = true;
    card.blockedByDevelopment = true;
    card.bbbWhy = 'Waiting for approval';
    card.bbbWho = 'stk_001';
    card.bbdWhy = 'Technical issue';
    card.bbdWho = 'dev_002';

    const state = card._getEditableState();

    expect(state.blockedByBusiness).toBe(true);
    expect(state.blockedByDevelopment).toBe(true);
    expect(state.bbbWhy).toBe('Waiting for approval');
    expect(state.bbbWho).toBe('stk_001');
    expect(state.bbdWhy).toBe('Technical issue');
    expect(state.bbdWho).toBe('dev_002');
  });

  it('includes spike and expedited flags', () => {
    const card = new TaskCard();
    card.spike = true;
    card.expedited = true;

    const state = card._getEditableState();

    expect(state.spike).toBe(true);
    expect(state.expedited).toBe(true);
  });

  it('serializes relatedTasks as JSON', () => {
    const card = new TaskCard();
    card.relatedTasks = ['TASK-001', 'TASK-002'];

    const state = card._getEditableState();

    expect(state.relatedTasks).toBe('["TASK-001","TASK-002"]');
  });

  it('detects changes in task-specific fields', () => {
    const card = new TaskCard();
    card.title = 'Original';
    card.businessPoints = 5;
    card.captureInitialState();

    expect(card.hasChanges()).toBe(false);

    card.businessPoints = 8;
    expect(card.hasChanges()).toBe(true);
  });

  it('detects changes in blocked flags', () => {
    const card = new TaskCard();
    card.blockedByBusiness = false;
    card.captureInitialState();

    card.blockedByBusiness = true;
    expect(card.hasChanges()).toBe(true);
  });

  it('serializes descriptionStructured as JSON', () => {
    const card = new TaskCard();
    card.descriptionStructured = [{ role: 'user', goal: 'do something', benefit: 'to achieve X', legacy: '' }];

    const state = card._getEditableState();

    expect(state.descriptionStructured).toBe('[{"role":"user","goal":"do something","benefit":"to achieve X","legacy":""}]');
  });

  it('serializes acceptanceCriteriaStructured as JSON', () => {
    const card = new TaskCard();
    card.acceptanceCriteriaStructured = [
      { given: 'a context', when: 'an action', then: 'a result', raw: '' }
    ];

    const state = card._getEditableState();

    expect(state.acceptanceCriteriaStructured).toBe('[{"given":"a context","when":"an action","then":"a result","raw":""}]');
  });

  it('detects changes in descriptionStructured', () => {
    const card = new TaskCard();
    card.descriptionStructured = [{ role: '', goal: '', benefit: '', legacy: '' }];
    card.captureInitialState();

    expect(card.hasChanges()).toBe(false);

    card.descriptionStructured = [{ role: 'developer', goal: 'write code', benefit: 'ship feature', legacy: '' }];
    expect(card.hasChanges()).toBe(true);
  });

  it('detects changes in acceptanceCriteriaStructured', () => {
    const card = new TaskCard();
    card.acceptanceCriteriaStructured = [];
    card.captureInitialState();

    expect(card.hasChanges()).toBe(false);

    card.acceptanceCriteriaStructured = [{ given: 'test', when: 'test', then: 'test', raw: '' }];
    expect(card.hasChanges()).toBe(true);
  });
});

// ==================== BUG CARD TESTS ====================
describe('BugCard _getEditableState()', () => {
  let BugCard;

  beforeAll(() => {
    BugCard = class extends BaseCard {
      static get properties() {
        return {
          ...super.properties,
          developer: { type: String },
          registerDate: { type: String },
          acceptanceCriteria: { type: String },
          bugType: { type: String },
          attachment: { type: String },
          cinemaFile: { type: String },
          exportedFile: { type: String },
          importedFile: { type: String },
          plugin: { type: String },
          pluginVersion: { type: String },
          treatmentType: { type: String },
          acceptanceCriteriaStructured: { type: Array }
        };
      }

      constructor() {
        super();
        this.tagName = 'BUG-CARD';
        this.cardType = 'bug-card';
        this.developer = '';
        this.registerDate = '';
        this.acceptanceCriteria = '';
        this.bugType = '';
        this.attachment = '';
        this.cinemaFile = '';
        this.exportedFile = '';
        this.importedFile = '';
        this.plugin = '';
        this.pluginVersion = '';
        this.treatmentType = '';
        this.acceptanceCriteriaStructured = [];
      }

      _getEditableState() {
        return {
          ...super._getEditableState(),
          developer: this.developer || '',
          registerDate: this.registerDate || '',
          acceptanceCriteria: this.acceptanceCriteria || '',
          bugType: this.bugType || '',
          attachment: this.attachment || '',
          cinemaFile: this.cinemaFile || '',
          exportedFile: this.exportedFile || '',
          importedFile: this.importedFile || '',
          plugin: this.plugin || '',
          pluginVersion: this.pluginVersion || '',
          treatmentType: this.treatmentType || '',
          startDate: this.startDate || '',
          endDate: this.endDate || '',
          acceptanceCriteriaStructured: JSON.stringify(this.acceptanceCriteriaStructured || [])
        };
      }
    };
  });

  it('includes all bug-specific fields', () => {
    const card = new BugCard();
    card.title = 'Bug Title';
    card.developer = 'dev_123';
    card.bugType = 'c4d';
    card.plugin = 'Renderer';
    card.pluginVersion = '1.2.3';

    const state = card._getEditableState();

    expect(state.title).toBe('Bug Title');
    expect(state.developer).toBe('dev_123');
    expect(state.bugType).toBe('c4d');
    expect(state.plugin).toBe('Renderer');
    expect(state.pluginVersion).toBe('1.2.3');
  });

  it('includes C4D file fields', () => {
    const card = new BugCard();
    card.cinemaFile = 'https://storage.example.com/file.c4d';
    card.exportedFile = 'https://storage.example.com/export.fbx';
    card.importedFile = 'https://storage.example.com/import.obj';

    const state = card._getEditableState();

    expect(state.cinemaFile).toBe('https://storage.example.com/file.c4d');
    expect(state.exportedFile).toBe('https://storage.example.com/export.fbx');
    expect(state.importedFile).toBe('https://storage.example.com/import.obj');
  });

  it('serializes acceptanceCriteriaStructured as JSON', () => {
    const card = new BugCard();
    card.acceptanceCriteriaStructured = [
      { scenario: 'Test 1', steps: 'Do something' }
    ];

    const state = card._getEditableState();

    expect(state.acceptanceCriteriaStructured).toBe('[{"scenario":"Test 1","steps":"Do something"}]');
  });

  it('detects changes in file fields', () => {
    const card = new BugCard();
    card.cinemaFile = '';
    card.captureInitialState();

    card.cinemaFile = 'https://new-file.c4d';
    expect(card.hasChanges()).toBe(true);
  });
});

// ==================== EPIC CARD TESTS ====================
describe('EpicCard _getEditableState()', () => {
  let EpicCard;

  beforeAll(() => {
    EpicCard = class extends BaseCard {
      static get properties() {
        return {
          ...super.properties,
          acceptanceCriteria: { type: String },
          desiredEndDate: { type: String },
          year: { type: String },
          stakeholdersSelected: { type: Array }
        };
      }

      constructor() {
        super();
        this.tagName = 'EPIC-CARD';
        this.cardType = 'epic-card';
        this.acceptanceCriteria = '';
        this.desiredEndDate = '';
        this.year = '';
        this.stakeholdersSelected = [];
      }

      _getEditableState() {
        return {
          ...super._getEditableState(),
          acceptanceCriteria: this.acceptanceCriteria || '',
          startDate: this.startDate || '',
          endDate: this.endDate || '',
          desiredEndDate: this.desiredEndDate || '',
          year: this.year || '',
          stakeholdersSelected: JSON.stringify(this.stakeholdersSelected || [])
        };
      }
    };
  });

  it('includes all epic-specific fields', () => {
    const card = new EpicCard();
    card.title = 'Epic Title';
    card.acceptanceCriteria = 'Epic AC';
    card.startDate = '2024-01-01';
    card.endDate = '2024-12-31';
    card.desiredEndDate = '2024-06-30';
    card.year = '2024';

    const state = card._getEditableState();

    expect(state.title).toBe('Epic Title');
    expect(state.acceptanceCriteria).toBe('Epic AC');
    expect(state.startDate).toBe('2024-01-01');
    expect(state.endDate).toBe('2024-12-31');
    expect(state.desiredEndDate).toBe('2024-06-30');
    expect(state.year).toBe('2024');
  });

  it('serializes stakeholdersSelected as JSON', () => {
    const card = new EpicCard();
    card.stakeholdersSelected = ['stk_001', 'stk_002'];

    const state = card._getEditableState();

    expect(state.stakeholdersSelected).toBe('["stk_001","stk_002"]');
  });

  it('detects changes in stakeholders', () => {
    const card = new EpicCard();
    card.stakeholdersSelected = ['stk_001'];
    card.captureInitialState();

    card.stakeholdersSelected = ['stk_001', 'stk_002'];
    expect(card.hasChanges()).toBe(true);
  });

  it('handles empty stakeholders array', () => {
    const card = new EpicCard();
    card.stakeholdersSelected = [];

    const state = card._getEditableState();

    expect(state.stakeholdersSelected).toBe('[]');
  });
});

// ==================== SPRINT CARD TESTS ====================
describe('SprintCard _getEditableState()', () => {
  let SprintCard;

  beforeAll(() => {
    SprintCard = class extends BaseCard {
      static get properties() {
        return {
          ...super.properties,
          retrospective: { type: String },
          businessPoints: { type: Number },
          devPoints: { type: Number },
          realBusinessPoints: { type: Number },
          realDevPoints: { type: Number },
          demoVideo: { type: Object }
        };
      }

      constructor() {
        super();
        this.tagName = 'SPRINT-CARD';
        this.cardType = 'sprint-card';
        this.retrospective = '';
        this.businessPoints = 0;
        this.devPoints = 0;
        this.realBusinessPoints = 0;
        this.realDevPoints = 0;
        this.demoVideo = {};
      }

      _getEditableState() {
        return {
          ...super._getEditableState(),
          retrospective: this.retrospective || '',
          businessPoints: this.businessPoints || 0,
          devPoints: this.devPoints || 0,
          realBusinessPoints: this.realBusinessPoints || 0,
          realDevPoints: this.realDevPoints || 0,
          startDate: this.startDate || '',
          endDate: this.endDate || '',
          demoVideo: JSON.stringify(this.demoVideo || {})
        };
      }
    };
  });

  it('includes all sprint-specific fields', () => {
    const card = new SprintCard();
    card.title = 'Sprint 1';
    card.retrospective = 'What went well...';
    card.businessPoints = 20;
    card.devPoints = 30;
    card.realBusinessPoints = 18;
    card.realDevPoints = 28;
    card.startDate = '2024-01-01';
    card.endDate = '2024-01-14';

    const state = card._getEditableState();

    expect(state.title).toBe('Sprint 1');
    expect(state.retrospective).toBe('What went well...');
    expect(state.businessPoints).toBe(20);
    expect(state.devPoints).toBe(30);
    expect(state.realBusinessPoints).toBe(18);
    expect(state.realDevPoints).toBe(28);
    expect(state.startDate).toBe('2024-01-01');
    expect(state.endDate).toBe('2024-01-14');
  });

  it('serializes demoVideo as JSON', () => {
    const card = new SprintCard();
    card.demoVideo = {
      url: 'https://youtube.com/watch?v=123',
      title: 'Sprint Demo'
    };

    const state = card._getEditableState();

    expect(state.demoVideo).toBe('{"url":"https://youtube.com/watch?v=123","title":"Sprint Demo"}');
  });

  it('handles empty demoVideo', () => {
    const card = new SprintCard();
    card.demoVideo = {};

    const state = card._getEditableState();

    expect(state.demoVideo).toBe('{}');
  });

  it('detects changes in retrospective', () => {
    const card = new SprintCard();
    card.retrospective = 'Original retro';
    card.captureInitialState();

    card.retrospective = 'Updated retro';
    expect(card.hasChanges()).toBe(true);
  });

  it('detects changes in points', () => {
    const card = new SprintCard();
    card.realDevPoints = 20;
    card.captureInitialState();

    card.realDevPoints = 25;
    expect(card.hasChanges()).toBe(true);
  });
});

// ==================== QA CARD TESTS ====================
describe('QACard _getEditableState()', () => {
  let QACard;

  beforeAll(() => {
    QACard = class extends BaseCard {
      static get properties() {
        return {
          ...super.properties,
          associatedTaskId: { type: String },
          steps: { type: String },
          actualResult: { type: String },
          expectedResult: { type: String },
          defectType: { type: String },
          attachments: { type: Array },
          suiteId: { type: String }
        };
      }

      constructor() {
        super();
        this.tagName = 'QA-CARD';
        this.cardType = 'qa-card';
        this.associatedTaskId = '';
        this.steps = '';
        this.actualResult = '';
        this.expectedResult = '';
        this.defectType = '';
        this.attachments = [];
        this.suiteId = '';
      }

      _getEditableState() {
        return {
          ...super._getEditableState(),
          associatedTaskId: this.associatedTaskId || '',
          steps: this.steps || '',
          actualResult: this.actualResult || '',
          expectedResult: this.expectedResult || '',
          defectType: this.defectType || '',
          attachments: JSON.stringify(this.attachments || []),
          suiteId: this.suiteId || ''
        };
      }
    };
  });

  it('includes all QA-specific fields', () => {
    const card = new QACard();
    card.title = 'QA Test Case';
    card.associatedTaskId = 'TASK-001';
    card.steps = '1. Do this\n2. Do that';
    card.actualResult = 'It crashed';
    card.expectedResult = 'It should work';
    card.defectType = 'Functional';
    card.suiteId = 'suite-001';

    const state = card._getEditableState();

    expect(state.title).toBe('QA Test Case');
    expect(state.associatedTaskId).toBe('TASK-001');
    expect(state.steps).toBe('1. Do this\n2. Do that');
    expect(state.actualResult).toBe('It crashed');
    expect(state.expectedResult).toBe('It should work');
    expect(state.defectType).toBe('Functional');
    expect(state.suiteId).toBe('suite-001');
  });

  it('serializes attachments as JSON', () => {
    const card = new QACard();
    card.attachments = [
      { name: 'screenshot.png', url: 'https://example.com/img.png' }
    ];

    const state = card._getEditableState();

    expect(state.attachments).toBe('[{"name":"screenshot.png","url":"https://example.com/img.png"}]');
  });

  it('detects changes in test steps', () => {
    const card = new QACard();
    card.steps = 'Step 1';
    card.captureInitialState();

    card.steps = 'Step 1\nStep 2';
    expect(card.hasChanges()).toBe(true);
  });
});

// ==================== PROPOSAL CARD TESTS ====================
describe('ProposalCard _getEditableState()', () => {
  let ProposalCard;

  beforeAll(() => {
    ProposalCard = class extends BaseCard {
      static get properties() {
        return {
          ...super.properties,
          acceptanceCriteria: { type: String },
          acceptanceCriteriaStructured: { type: Array },
          registerDate: { type: String },
          epic: { type: String },
          businessPoints: { type: Number },
          descDado: { type: String },
          descCuando: { type: String },
          descPara: { type: String }
        };
      }

      constructor() {
        super();
        this.tagName = 'PROPOSAL-CARD';
        this.cardType = 'proposal-card';
        this.acceptanceCriteria = '';
        this.acceptanceCriteriaStructured = [];
        this.registerDate = '';
        this.epic = '';
        this.businessPoints = 0;
        this.descDado = '';
        this.descCuando = '';
        this.descPara = '';
      }

      _getAcceptanceCriteriaStructuredForSave() {
        return this.acceptanceCriteriaStructured || [];
      }

      _getEditableState() {
        return {
          ...super._getEditableState(),
          acceptanceCriteria: this.acceptanceCriteria || '',
          acceptanceCriteriaStructured: JSON.stringify(this._getAcceptanceCriteriaStructuredForSave() || []),
          registerDate: this.registerDate || '',
          epic: this.epic || '',
          businessPoints: this.businessPoints || 0,
          descDado: this.descDado || '',
          descCuando: this.descCuando || '',
          descPara: this.descPara || ''
        };
      }
    };
  });

  it('includes all proposal-specific fields', () => {
    const card = new ProposalCard();
    card.title = 'Proposal Title';
    card.acceptanceCriteria = 'AC text';
    card.registerDate = '2024-01-15';
    card.epic = 'epic-001';
    card.businessPoints = 5;

    const state = card._getEditableState();

    expect(state.title).toBe('Proposal Title');
    expect(state.acceptanceCriteria).toBe('AC text');
    expect(state.registerDate).toBe('2024-01-15');
    expect(state.epic).toBe('epic-001');
    expect(state.businessPoints).toBe(5);
  });

  it('includes user story fields (Dado/Cuando/Para)', () => {
    const card = new ProposalCard();
    card.descDado = 'As a user';
    card.descCuando = 'When I click the button';
    card.descPara = 'I want to see the result';

    const state = card._getEditableState();

    expect(state.descDado).toBe('As a user');
    expect(state.descCuando).toBe('When I click the button');
    expect(state.descPara).toBe('I want to see the result');
  });

  it('serializes acceptanceCriteriaStructured as JSON', () => {
    const card = new ProposalCard();
    card.acceptanceCriteriaStructured = [
      { scenario: 'Scenario 1', given: 'Given', when: 'When', then: 'Then' }
    ];

    const state = card._getEditableState();

    expect(state.acceptanceCriteriaStructured).toBe('[{"scenario":"Scenario 1","given":"Given","when":"When","then":"Then"}]');
  });

  it('detects changes in user story fields', () => {
    const card = new ProposalCard();
    card.descDado = 'Original';
    card.captureInitialState();

    card.descDado = 'Modified';
    expect(card.hasChanges()).toBe(true);
  });

  it('detects changes in businessPoints', () => {
    const card = new ProposalCard();
    card.businessPoints = 3;
    card.captureInitialState();

    card.businessPoints = 5;
    expect(card.hasChanges()).toBe(true);
  });
});

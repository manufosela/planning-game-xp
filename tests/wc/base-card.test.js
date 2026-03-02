// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock de dependencias externas
vi.mock('https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm', () => ({
  LitElement: class MockLitElement {
    static get properties() { return {}; }
    constructor() {
      this._requestedUpdates = [];
      // Simulate tagName - will be overridden by subclass
      this.tagName = 'MOCK-ELEMENT';
    }
    requestUpdate() {
      this._requestedUpdates.push(Date.now());
    }
    updated() {}
    connectedCallback() {}
    disconnectedCallback() {}
    dispatchEvent(event) {
      return true;
    }
    getAttribute(name) { return null; }
    setAttribute(name, value) {}
  },
  html: (strings, ...values) => ({ strings, values }),
  css: (strings, ...values) => ({ strings, values })
}));

vi.mock('https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm', () => ({
  format: vi.fn((date, formatStr) => {
    if (!date || isNaN(date.getTime())) return 'Invalid Date';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }),
  parse: vi.fn((dateStr, formatStr, referenceDate) => {
    // Simple parse for yyyy-MM-dd format
    if (formatStr === 'yyyy-MM-dd') {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }
    return new Date(NaN);
  }),
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

// Import BaseCard after mocks
const { BaseCard } = await import('../../public/js/wc/base-card.js');

describe('BaseCard', () => {
  let card;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create a concrete implementation for testing
    class TestCard extends BaseCard {
      static get properties() {
        return {
          ...super.properties,
          customField: { type: String }
        };
      }

      constructor() {
        super();
        this.tagName = 'TEST-CARD'; // Override after super() call
        this.cardType = 'test-card';
        this.customField = '';
      }

      _getEditableState() {
        return {
          ...super._getEditableState(),
          customField: this.customField || ''
        };
      }
    }

    card = new TestCard();
    card.cardId = 'TEST-001';
    card.projectId = 'TestProject';
  });

  afterEach(() => {
    card = null;
  });

  // ==================== CHANGE DETECTION SYSTEM ====================
  describe('Change Detection System', () => {
    describe('_getEditableState()', () => {
      it('returns object with basic editable fields', () => {
        card.title = 'Test Title';
        card.description = 'Test Description';
        card.notes = 'Test Notes';
        card.status = 'In Progress';
        card.priority = 'High';

        const state = card._getEditableState();

        expect(state).toEqual({
          title: 'Test Title',
          description: 'Test Description',
          notes: 'Test Notes',
          status: 'In Progress',
          priority: 'High',
          customField: ''
        });
      });

      it('returns empty strings for undefined fields', () => {
        const state = card._getEditableState();

        expect(state.title).toBe('');
        expect(state.description).toBe('');
        expect(state.notes).toBe('');
        expect(state.status).toBe('');
        expect(state.priority).toBe('');
      });

      it('includes child class custom fields', () => {
        card.customField = 'Custom Value';
        const state = card._getEditableState();

        expect(state.customField).toBe('Custom Value');
      });
    });

    describe('captureInitialState()', () => {
      it('captures current state as JSON string', () => {
        card.title = 'Initial Title';
        card.description = 'Initial Description';

        card.captureInitialState();

        expect(card._initialState).toBe(JSON.stringify(card._getEditableState()));
      });

      it('can be called multiple times', () => {
        card.title = 'First';
        card.captureInitialState();
        const firstState = card._initialState;

        card.title = 'Second';
        card.captureInitialState();

        expect(card._initialState).not.toBe(firstState);
      });
    });

    describe('hasChanges()', () => {
      it('returns false when no initial state captured', () => {
        card.title = 'Some Title';

        expect(card.hasChanges()).toBe(false);
      });

      it('returns false when state unchanged', () => {
        card.title = 'Test Title';
        card.description = 'Test Description';
        card.captureInitialState();

        expect(card.hasChanges()).toBe(false);
      });

      it('returns true when title changed', () => {
        card.title = 'Original Title';
        card.captureInitialState();

        card.title = 'Modified Title';

        expect(card.hasChanges()).toBe(true);
      });

      it('returns true when description changed', () => {
        card.description = 'Original';
        card.captureInitialState();

        card.description = 'Modified';

        expect(card.hasChanges()).toBe(true);
      });

      it('returns true when status changed', () => {
        card.status = 'To Do';
        card.captureInitialState();

        card.status = 'In Progress';

        expect(card.hasChanges()).toBe(true);
      });

      it('returns false when value changed back to original', () => {
        card.title = 'Original';
        card.captureInitialState();

        card.title = 'Changed';
        expect(card.hasChanges()).toBe(true);

        card.title = 'Original';
        expect(card.hasChanges()).toBe(false);
      });

      it('detects changes in custom child fields', () => {
        card.customField = 'Original';
        card.captureInitialState();

        card.customField = 'Modified';

        expect(card.hasChanges()).toBe(true);
      });
    });

    describe('markAsSaved()', () => {
      it('updates initial state to current state', () => {
        card.title = 'Original';
        card.captureInitialState();

        card.title = 'Modified';
        expect(card.hasChanges()).toBe(true);

        card.markAsSaved();

        expect(card.hasChanges()).toBe(false);
      });

      it('captures new state after save', () => {
        card.title = 'First';
        card.captureInitialState();

        card.title = 'Second';
        card.markAsSaved();

        card.title = 'Third';
        expect(card.hasChanges()).toBe(true);

        card.title = 'Second';
        expect(card.hasChanges()).toBe(false);
      });
    });
  });

  // ==================== PERMISSIONS ====================
  describe('Permissions', () => {
    describe('canEdit getter', () => {
      it('returns true when all conditions met', () => {
        card.isEditable = true;
        card.canEditPermission = true;
        card.isYearReadOnly = false;

        expect(card.canEdit).toBe(true);
      });

      it('returns false when isEditable is false', () => {
        card.isEditable = false;
        card.canEditPermission = true;
        card.isYearReadOnly = false;

        expect(card.canEdit).toBe(false);
      });

      it('returns false when canEditPermission is false', () => {
        card.isEditable = true;
        card.canEditPermission = false;
        card.isYearReadOnly = false;

        expect(card.canEdit).toBe(false);
      });

      it('returns false when isYearReadOnly is true', () => {
        card.isEditable = true;
        card.canEditPermission = true;
        card.isYearReadOnly = true;

        expect(card.canEdit).toBe(false);
      });
    });

    describe('canSave getter', () => {
      it('returns true when canEdit, has title, and not saving', () => {
        card.isEditable = true;
        card.canEditPermission = true;
        card.isYearReadOnly = false;
        card.title = 'Valid Title';
        card.isSaving = false;

        expect(card.canSave).toBe(true);
      });

      it('returns false when title is empty', () => {
        card.isEditable = true;
        card.canEditPermission = true;
        card.title = '';
        card.isSaving = false;

        expect(card.canSave).toBeFalsy();
      });

      it('returns false when title is only whitespace', () => {
        card.isEditable = true;
        card.canEditPermission = true;
        card.title = '   ';
        card.isSaving = false;

        expect(card.canSave).toBeFalsy();
      });

      it('returns false when already saving', () => {
        card.isEditable = true;
        card.canEditPermission = true;
        card.title = 'Valid Title';
        card.isSaving = true;

        expect(card.canSave).toBe(false);
      });
    });

    describe('canMoveToProject getter', () => {
      beforeEach(() => {
        window.currentUserRole = { isResponsable: true };
        card.isYearReadOnly = false;
        card.cardType = 'task-card';
        card.cardId = 'TEST-TSK-001';
        card.status = 'To Do';
      });

      afterEach(() => {
        delete window.currentUserRole;
      });

      it('returns true for admin with movable card type', () => {
        expect(card.canMoveToProject).toBe(true);
      });

      it('returns false for non-admin user', () => {
        window.currentUserRole = { isResponsable: false };

        expect(card.canMoveToProject).toBe(false);
      });

      it('returns false when year is read-only', () => {
        card.isYearReadOnly = true;

        expect(card.canMoveToProject).toBe(false);
      });

      it('returns false for sprint-card type', () => {
        card.cardType = 'sprint-card';

        expect(card.canMoveToProject).toBe(false);
      });

      it('returns false for epic-card type', () => {
        card.cardType = 'epic-card';

        expect(card.canMoveToProject).toBe(false);
      });

      it('returns true for bug-card type', () => {
        card.cardType = 'bug-card';

        expect(card.canMoveToProject).toBe(true);
      });

      it('returns true for proposal-card type', () => {
        card.cardType = 'proposal-card';

        expect(card.canMoveToProject).toBe(true);
      });

      it('returns false for temporary card (not saved)', () => {
        card.cardId = 'temp_12345';

        expect(card.canMoveToProject).toBe(false);
      });

      it('returns false when cardId is empty', () => {
        card.cardId = '';

        expect(card.canMoveToProject).toBe(false);
      });
    });
  });

  // ==================== DATE FORMATTING ====================
  describe('Date Formatting', () => {
    describe('formatDate()', () => {
      it('returns empty string for null/undefined input', () => {
        expect(card.formatDate(null)).toBe('');
        expect(card.formatDate(undefined)).toBe('');
        expect(card.formatDate('')).toBe('');
      });

      it('returns input if already in DD/MM/YYYY format', () => {
        expect(card.formatDate('15/03/2024')).toBe('15/03/2024');
        expect(card.formatDate('01/01/2025')).toBe('01/01/2025');
      });

      it('formats ISO date string (yyyy-MM-dd)', () => {
        const result = card.formatDate('2024-03-15');
        expect(result).toBe('15/03/2024');
      });

      it('formats ISO datetime string (strips time)', () => {
        const result = card.formatDate('2024-03-15T10:30:00');
        expect(result).toBe('15/03/2024');
      });

      it('returns Invalid Date for unparseable input', () => {
        const result = card.formatDate('not-a-date');
        expect(result).toBe('Invalid Date');
      });
    });
  });

  // ==================== CARD DATA ====================
  describe('Card Data', () => {
    describe('getCardData()', () => {
      it('returns object with all basic card properties', () => {
        card.id = 'element-id';
        card.cardId = 'TEST-001';
        card.title = 'Test Title';
        card.description = 'Test Description';
        card.notes = 'Test Notes';
        card.startDate = '2024-01-01';
        card.endDate = '2024-12-31';
        card.createdBy = 'user@example.com';
        card.projectId = 'TestProject';
        card.group = 'tasks_TestProject';
        card.cardType = 'task-card';

        const data = card.getCardData();

        expect(data).toEqual({
          id: 'element-id',
          cardId: 'TEST-001',
          title: 'Test Title',
          description: 'Test Description',
          notes: 'Test Notes',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          createdBy: 'user@example.com',
          projectId: 'TestProject',
          group: 'tasks_TestProject',
          cardType: 'task-card'
        });
      });
    });

    describe('firebaseId getter/setter', () => {
      it('returns _firebaseId when set', () => {
        card._firebaseId = 'firebase-123';

        expect(card.firebaseId).toBe('firebase-123');
      });

      it('returns empty string when _firebaseId not set (no fallback)', () => {
        card._firebaseId = '';
        card.id = 'element-id';

        // NO fallback to this.id - this was causing bugs with cardId being used as firebaseId
        expect(card.firebaseId).toBe('');
      });

      it('setter updates _firebaseId', () => {
        card.firebaseId = 'new-firebase-id';

        expect(card._firebaseId).toBe('new-firebase-id');
      });
    });

    describe('getIdForFirebase()', () => {
      it('returns firebaseId', () => {
        card._firebaseId = 'firebase-id';

        expect(card.getIdForFirebase()).toBe('firebase-id');
      });
    });
  });

  // ==================== URL GENERATION ====================
  describe('URL Generation', () => {
    describe('generateCardUrl()', () => {
      beforeEach(() => {
        // Mock window.location
        Object.defineProperty(window, 'location', {
          value: { origin: 'https://example.com' },
          writable: true
        });
      });

      it('generates correct URL for task-card', () => {
        card.cardType = 'task-card';
        card.projectId = 'MyProject';
        card.cardId = 'MP-TSK-001';

        const url = card.generateCardUrl();

        expect(url).toBe('https://example.com/adminproject/?projectId=MyProject&cardId=MP-TSK-001#tasks');
      });

      it('generates correct URL for bug-card', () => {
        card.cardType = 'bug-card';
        card.projectId = 'MyProject';
        card.cardId = 'MP-BUG-001';

        const url = card.generateCardUrl();

        expect(url).toBe('https://example.com/adminproject/?projectId=MyProject&cardId=MP-BUG-001#bugs');
      });

      it('generates correct URL for epic-card', () => {
        card.cardType = 'epic-card';
        card.projectId = 'MyProject';
        card.cardId = 'MP-EPC-001';

        const url = card.generateCardUrl();

        expect(url).toBe('https://example.com/adminproject/?projectId=MyProject&cardId=MP-EPC-001#epics');
      });

      it('encodes projectId with special characters', () => {
        card.cardType = 'task-card';
        card.projectId = 'My Project';
        card.cardId = 'MP-TSK-001';

        const url = card.generateCardUrl();

        expect(url).toContain('projectId=My%20Project');
      });
    });
  });

  // ==================== ENTITY RESOLUTION ====================
  describe('Entity Resolution', () => {
    describe('_resolveEntityToEmail()', () => {
      it('returns null for empty input', () => {
        expect(card._resolveEntityToEmail(null)).toBe(null);
        expect(card._resolveEntityToEmail('')).toBe(null);
        expect(card._resolveEntityToEmail(undefined)).toBe(null);
      });

      it('resolves developer ID to email', () => {
        const result = card._resolveEntityToEmail('dev_123');

        expect(result).toBe('dev_123@example.com');
      });

      it('resolves stakeholder ID to email', () => {
        const result = card._resolveEntityToEmail('stk_456');

        expect(result).toBe('stk_456@example.com');
      });

      it('returns input as-is if already an email', () => {
        const result = card._resolveEntityToEmail('user@example.com');

        expect(result).toBe('user@example.com');
      });
    });
  });

  // ==================== GLOBAL NOTIFICATION CONFIGS ====================
  describe('Global Notification Configs', () => {
    describe('_initGlobalNotificationConfigs()', () => {
      it('returns configuration object', () => {
        const configs = BaseCard._initGlobalNotificationConfigs();

        expect(configs).toBeDefined();
        expect(typeof configs).toBe('object');
      });

      it('has configuration for task-card', () => {
        const configs = BaseCard._initGlobalNotificationConfigs();

        expect(configs['task-card']).toBeDefined();
        expect(configs['task-card'].userFields).toBeDefined();
        expect(configs['task-card'].statusFields).toBeDefined();
      });

      it('has configuration for bug-card', () => {
        const configs = BaseCard._initGlobalNotificationConfigs();

        expect(configs['bug-card']).toBeDefined();
        expect(configs['bug-card'].userFields.developer).toBeDefined();
      });

      it('returns same instance on multiple calls (singleton)', () => {
        const first = BaseCard._initGlobalNotificationConfigs();
        const second = BaseCard._initGlobalNotificationConfigs();

        expect(first).toBe(second);
      });
    });
  });

  // ==================== FIELD CHANGE TRACKING ====================
  describe('Field Change Tracking', () => {
    describe('_trackFieldChange()', () => {
      it('stores change in _fieldChangeTrackers', () => {
        card._trackFieldChange('status', 'In Progress', 'To Do');

        const tracked = card._fieldChangeTrackers.get('status');
        expect(tracked).toBeDefined();
        expect(tracked.previous).toBe('To Do');
        expect(tracked.current).toBe('In Progress');
        expect(tracked.timestamp).toBeDefined();
      });

      it('does not track if value unchanged', () => {
        card._trackFieldChange('status', 'To Do', 'To Do');

        expect(card._fieldChangeTrackers.has('status')).toBe(false);
      });

      it('uses previous tracked value if oldValue not provided', () => {
        card._fieldChangeTrackers.set('priority', { current: 'High' });

        card._trackFieldChange('priority', 'Critical');

        const tracked = card._fieldChangeTrackers.get('priority');
        expect(tracked.previous).toEqual({ current: 'High' });
        expect(tracked.current).toBe('Critical');
      });
    });
  });

  // ==================== COPY CARD ID ====================
  describe('Copy Card ID', () => {
    describe('_copyCardId()', () => {
      let mockEvent;

      beforeEach(() => {
        mockEvent = { stopPropagation: vi.fn() };
      });

      it('copies cardId to clipboard and shows success notification', async () => {
        card.cardId = 'TEST-TSK-001';

        // Mock clipboard
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: vi.fn().mockResolvedValue(undefined) },
          writable: true,
          configurable: true
        });

        // Spy on _showNotification
        card._showNotification = vi.fn();

        await card._copyCardId(mockEvent);

        expect(mockEvent.stopPropagation).toHaveBeenCalled();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TEST-TSK-001');
        expect(card._showNotification).toHaveBeenCalledWith('ID TEST-TSK-001 copiado', 'success');
      });

      it('shows error notification when clipboard fails', async () => {
        card.cardId = 'TEST-TSK-002';

        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied')) },
          writable: true,
          configurable: true
        });

        card._showNotification = vi.fn();

        await card._copyCardId(mockEvent);

        expect(mockEvent.stopPropagation).toHaveBeenCalled();
        expect(card._showNotification).toHaveBeenCalledWith('Error al copiar ID', 'error');
      });

      it('does nothing when cardId is empty', async () => {
        card.cardId = '';

        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: vi.fn() },
          writable: true,
          configurable: true
        });

        card._showNotification = vi.fn();

        await card._copyCardId(mockEvent);

        expect(mockEvent.stopPropagation).toHaveBeenCalled();
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
        expect(card._showNotification).not.toHaveBeenCalled();
      });

      it('stops event propagation to prevent card toggle', async () => {
        card.cardId = 'TEST-TSK-003';

        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: vi.fn().mockResolvedValue(undefined) },
          writable: true,
          configurable: true
        });

        card._showNotification = vi.fn();

        await card._copyCardId(mockEvent);

        expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('_buildPersistentProps', () => {
    it('should return only fields listed in the schema', () => {
      card.title = 'Test';
      card.description = 'Desc';
      card.customField = 'custom';
      card.firebaseId = '-Oabc123';

      const props = card._buildPersistentProps(['title', 'description']);

      expect(props.title).toBe('Test');
      expect(props.description).toBe('Desc');
      expect(props.customField).toBeUndefined();
    });

    it('should skip null and undefined values', () => {
      card.title = 'Test';
      card.description = null;
      card.notes = undefined;

      const props = card._buildPersistentProps(['title', 'description', 'notes']);

      expect(props.title).toBe('Test');
      expect(props).not.toHaveProperty('description');
      expect(props).not.toHaveProperty('notes');
    });

    it('should skip empty string for firebaseId and id', () => {
      card.firebaseId = '';
      card.title = 'Test';

      const props = card._buildPersistentProps(['firebaseId', 'title']);

      expect(props).not.toHaveProperty('id');
      expect(props.title).toBe('Test');
    });

    it('should set firebaseId and id from getIdForFirebase()', () => {
      card.firebaseId = '-Oabc123';
      card.title = 'Test';

      const props = card._buildPersistentProps(['title']);

      expect(props.firebaseId).toBe('-Oabc123');
      expect(props.id).toBe('-Oabc123');
      expect(props.title).toBe('Test');
    });

    it('should not set id/firebaseId if getIdForFirebase() returns falsy', () => {
      card.firebaseId = '';
      card.title = 'Test';

      const props = card._buildPersistentProps(['title']);

      expect(props).not.toHaveProperty('firebaseId');
      expect(props).not.toHaveProperty('id');
    });

    it('should include non-empty string values', () => {
      card.status = 'In Progress';
      card.developer = 'dev_001';

      const props = card._buildPersistentProps(['status', 'developer']);

      expect(props.status).toBe('In Progress');
      expect(props.developer).toBe('dev_001');
    });

    it('should include falsy but valid values like 0 and false', () => {
      card.devPoints = 0;
      card.spike = false;

      const props = card._buildPersistentProps(['devPoints', 'spike']);

      expect(props.devPoints).toBe(0);
      expect(props.spike).toBe(false);
    });
  });
});

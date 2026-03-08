/**
 * Tests for CardRealtimeService
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock document.dispatchEvent to capture notifications
const dispatchEventSpy = vi.fn();

// Setup minimal DOM environment
beforeEach(() => {
  vi.stubGlobal('document', {
    dispatchEvent: dispatchEventSpy,
    createElement: vi.fn(() => ({})),
    body: { dataset: { userEmail: 'test@example.com' } }
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const mockSubscribeToCard = vi.fn(() => vi.fn()); // returns unsubscribe function
const mockUpdateCard = vi.fn();

vi.mock('@/services/dal-service.js', () => ({
  dalService: {
    cards: {
      subscribeToCard: (...args) => mockSubscribeToCard(...args),
      updateCard: (...args) => mockUpdateCard(...args),
    },
  },
}));

// Import after mocks are set up
const { CardRealtimeService } = await import('@/services/card-realtime-service.js');

describe('CardRealtimeService', () => {
  let service;

  beforeEach(() => {
    mockSubscribeToCard.mockReturnValue(vi.fn());
    mockUpdateCard.mockClear();
    service = new CardRealtimeService();
    dispatchEventSpy.mockClear();
  });

  describe('constructor', () => {
    it('should initialize with empty maps', () => {
      expect(service.activeSubscriptions.size).toBe(0);
      expect(service.subscribedCards.size).toBe(0);
      expect(service.latestCardData.size).toBe(0);
    });
  });

  describe('subscribeToCard', () => {
    it('should skip temporary cards', () => {
      const element = { firebaseId: 'temp-123', cardId: 'TSK-001', projectId: 'TestProject' };
      service.subscribeToCard(element);
      expect(mockSubscribeToCard).not.toHaveBeenCalled();
    });

    it('should skip cards without cardId', () => {
      const element = { firebaseId: '-abc', cardId: '', projectId: 'TestProject' };
      service.subscribeToCard(element);
      expect(mockSubscribeToCard).not.toHaveBeenCalled();
    });

    it('should skip cards without projectId', () => {
      const element = { firebaseId: '-abc', cardId: 'TSK-001', projectId: '' };
      service.subscribeToCard(element);
      expect(mockSubscribeToCard).not.toHaveBeenCalled();
    });

    it('should create subscription for valid card', () => {
      const element = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };
      service.subscribeToCard(element);
      expect(mockSubscribeToCard).toHaveBeenCalledOnce();
      expect(mockSubscribeToCard).toHaveBeenCalledWith(
        'TestProject', 'task', '-abc123', expect.any(Function)
      );
      expect(service.subscribedCards.size).toBe(1);
      expect(service.activeSubscriptions.size).toBe(1);
    });

    it('should reuse existing subscription for same card', () => {
      const element1 = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };
      const element2 = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };

      service.subscribeToCard(element1);
      service.subscribeToCard(element2);

      // Should only create one subscription
      expect(mockSubscribeToCard).toHaveBeenCalledOnce();
      // But should have two elements in the set
      const cardKey = 'TestProject_TSK-001';
      expect(service.subscribedCards.get(cardKey).size).toBe(2);
    });
  });

  describe('unsubscribeFromCard', () => {
    it('should remove element from subscription set', () => {
      const element = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };

      service.subscribeToCard(element);
      expect(service.subscribedCards.get('TestProject_TSK-001').size).toBe(1);

      service.unsubscribeFromCard(element);
      // Set should be cleaned up when last element removed
      expect(service.subscribedCards.has('TestProject_TSK-001')).toBe(false);
    });

    it('should call unsubscribe when last element removed', () => {
      const unsubscribeFn = vi.fn();
      mockSubscribeToCard.mockReturnValue(unsubscribeFn);

      const element = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };

      service.subscribeToCard(element);
      service.unsubscribeFromCard(element);

      expect(unsubscribeFn).toHaveBeenCalledOnce();
    });

    it('should not call unsubscribe when other elements remain', () => {
      const unsubscribeFn = vi.fn();
      mockSubscribeToCard.mockReturnValue(unsubscribeFn);

      const element1 = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };
      const element2 = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };

      service.subscribeToCard(element1);
      service.subscribeToCard(element2);
      service.unsubscribeFromCard(element1);

      expect(unsubscribeFn).not.toHaveBeenCalled();
      expect(service.subscribedCards.get('TestProject_TSK-001').size).toBe(1);
    });
  });

  describe('handleCardDataUpdate - validation revert detection', () => {
    it('should dispatch error notification when validation revert is detected', () => {
      const cardKey = 'TestProject_TSK-001';
      const mockElement = {
        status: 'In Progress',
        constructor: { properties: { status: {} } },
        requestUpdate: vi.fn()
      };
      service.subscribedCards.set(cardKey, new Set([mockElement]));

      const snapshot = {
        exists: () => true,
        val: () => ({
          status: 'To Do',
          _validationReverted: true,
          _validationError: 'Cannot change to "In Progress": startDate is required.'
        })
      };

      service.handleCardDataUpdate(cardKey, snapshot);

      // Should dispatch error notification
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'show-slide-notification',
          detail: expect.objectContaining({
            options: expect.objectContaining({
              message: 'Cannot change to "In Progress": startDate is required.',
              type: 'error'
            })
          })
        })
      );
    });

    it('should use default message when _validationError is missing', () => {
      const cardKey = 'TestProject_TSK-001';
      const mockElement = {
        status: 'In Progress',
        constructor: { properties: { status: {} } },
        requestUpdate: vi.fn()
      };
      service.subscribedCards.set(cardKey, new Set([mockElement]));

      const snapshot = {
        exists: () => true,
        val: () => ({
          status: 'To Do',
          _validationReverted: true
        })
      };

      service.handleCardDataUpdate(cardKey, snapshot);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'show-slide-notification',
          detail: expect.objectContaining({
            options: expect.objectContaining({
              message: 'Status change was reverted by validation'
            })
          })
        })
      );
    });

    it('should not dispatch notification when no validation revert', () => {
      const cardKey = 'TestProject_TSK-001';
      const mockElement = {
        status: 'To Do',
        title: 'Test',
        constructor: { properties: { status: {}, title: {} } },
        requestUpdate: vi.fn()
      };
      service.subscribedCards.set(cardKey, new Set([mockElement]));

      const snapshot = {
        exists: () => true,
        val: () => ({
          status: 'In Progress',
          title: 'Test'
        })
      };

      service.handleCardDataUpdate(cardKey, snapshot);

      // Should NOT dispatch show-slide-notification for validation
      const notificationCalls = dispatchEventSpy.mock.calls.filter(
        call => call[0].type === 'show-slide-notification'
      );
      expect(notificationCalls).toHaveLength(0);
    });

    it('should clean up transient flags from card data', () => {
      const cardKey = 'TestProject_TSK-001';
      const mockElement = {
        status: 'In Progress',
        constructor: { properties: { status: {} } },
        requestUpdate: vi.fn()
      };
      service.subscribedCards.set(cardKey, new Set([mockElement]));

      const cardData = {
        status: 'To Do',
        _validationReverted: true,
        _validationError: 'Some error'
      };

      const snapshot = {
        exists: () => true,
        val: () => cardData
      };

      service.handleCardDataUpdate(cardKey, snapshot);

      // The flags should be removed from cardData
      expect(cardData._validationReverted).toBeUndefined();
      expect(cardData._validationError).toBeUndefined();
    });

    it('should clean up transient flags from Firebase when cardInfo is provided', () => {
      const cardKey = 'TestProject_TSK-001';
      const cardInfo = { projectId: 'TestProject', type: 'task', firebaseId: '-abc123' };
      const mockElement = {
        status: 'In Progress',
        constructor: { properties: { status: {} } },
        requestUpdate: vi.fn()
      };
      service.subscribedCards.set(cardKey, new Set([mockElement]));

      const snapshot = {
        exists: () => true,
        val: () => ({
          status: 'To Do',
          _validationReverted: true,
          _validationError: 'Some error'
        })
      };

      service.handleCardDataUpdate(cardKey, snapshot, cardInfo);

      expect(mockUpdateCard).toHaveBeenCalledWith(
        'TestProject', 'task', '-abc123',
        { _validationReverted: null, _validationError: null }
      );
    });
  });

  describe('updateCardElement', () => {
    it('should update card properties from data', async () => {
      const element = {
        expanded: false,
        status: 'To Do',
        title: 'Old Title',
        constructor: { properties: { status: {}, title: {} } },
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve()
      };

      await service.updateCardElement(element, {
        status: 'In Progress',
        title: 'New Title'
      });

      expect(element.status).toBe('In Progress');
      expect(element.title).toBe('New Title');
      expect(element.requestUpdate).toHaveBeenCalled();
    });

    it('should preserve expanded state', async () => {
      const element = {
        expanded: true,
        status: 'To Do',
        constructor: { properties: { status: {}, expanded: {} } },
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve()
      };

      await service.updateCardElement(element, {
        status: 'In Progress',
        expanded: false // try to change expanded
      });

      expect(element.expanded).toBe(true); // should stay true
    });

    it('should skip UI-only fields', async () => {
      const element = {
        expanded: false,
        isSaving: false,
        isEditable: true,
        selected: false,
        status: 'To Do',
        constructor: { properties: { isSaving: {}, isEditable: {}, selected: {}, status: {} } },
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve()
      };

      await service.updateCardElement(element, {
        isSaving: true,
        isEditable: false,
        selected: true,
        status: 'In Progress'
      });

      expect(element.isSaving).toBe(false);
      expect(element.isEditable).toBe(true);
      expect(element.selected).toBe(false);
      expect(element.status).toBe('In Progress');
    });

    it('should not call requestUpdate if no changes', async () => {
      const element = {
        expanded: false,
        status: 'To Do',
        constructor: { properties: { status: {} } },
        requestUpdate: vi.fn()
      };

      await service.updateCardElement(element, {
        status: 'To Do' // same value
      });

      expect(element.requestUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getCardInfo', () => {
    it('should return correct info for task-card', () => {
      const element = {
        projectId: 'TestProject',
        tagName: 'task-card',
        firebaseId: '-abc123'
      };
      expect(service.getCardInfo(element)).toEqual({
        projectId: 'TestProject',
        type: 'task',
        firebaseId: '-abc123'
      });
    });

    it('should return correct info for bug-card', () => {
      const element = {
        projectId: 'TestProject',
        tagName: 'bug-card',
        firebaseId: '-abc123'
      };
      expect(service.getCardInfo(element)).toEqual({
        projectId: 'TestProject',
        type: 'bug',
        firebaseId: '-abc123'
      });
    });

    it('should return null for temporary cards', () => {
      const element = {
        projectId: 'TestProject',
        tagName: 'task-card',
        firebaseId: 'temp-123'
      };
      expect(service.getCardInfo(element)).toBeNull();
    });

    it('should return null for unknown card types', () => {
      const element = {
        projectId: 'TestProject',
        tagName: 'unknown-card',
        firebaseId: '-abc123'
      };
      expect(service.getCardInfo(element)).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe all and clear maps', () => {
      const unsubscribeFn = vi.fn();
      mockSubscribeToCard.mockReturnValue(unsubscribeFn);

      const element = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };

      service.subscribeToCard(element);
      expect(service.activeSubscriptions.size).toBe(1);

      service.cleanup();

      expect(unsubscribeFn).toHaveBeenCalledOnce();
      expect(service.activeSubscriptions.size).toBe(0);
      expect(service.subscribedCards.size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const element1 = {
        firebaseId: '-abc123',
        cardId: 'TSK-001',
        projectId: 'TestProject',
        tagName: 'task-card'
      };
      const element2 = {
        firebaseId: '-def456',
        cardId: 'TSK-002',
        projectId: 'TestProject',
        tagName: 'task-card'
      };

      service.subscribeToCard(element1);
      service.subscribeToCard(element2);

      const stats = service.getStats();
      expect(stats.activeSubscriptions).toBe(2);
      expect(stats.subscribedCards).toBe(2);
      expect(stats.totalElements).toBe(2);
    });
  });
});

/**
 * Integration test: bootstrap DI wiring.
 * Verifies that bootstrap.js correctly wires all adapters to use cases
 * and that the container is usable end-to-end (with mocked infrastructure).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all Firebase infrastructure adapters
vi.mock('../../src/infrastructure/firebase/index.js', () => ({
  FirebaseCardRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(), get: vi.fn(), save: vi.fn(), update: vi.fn(),
    moveToTrash: vi.fn(), generateId: vi.fn().mockReturnValue('PLN-TSK-0001'),
    countByStatus: vi.fn().mockResolvedValue(0),
  })),
  FirebaseProjectRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ id: 'proj1', name: 'Test' }),
    getAll: vi.fn().mockResolvedValue([]),
  })),
  FirebaseTeamRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockResolvedValue([]),
  })),
  FirebaseUserRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
  })),
  FirebaseHistoryRepository: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue(undefined),
  })),
  FirebaseBacklogRepository: vi.fn().mockImplementation(() => ({
    addCard: vi.fn().mockResolvedValue(undefined),
    removeCard: vi.fn().mockResolvedValue(undefined),
  })),
  FirebaseStateTransitionRepository: vi.fn().mockImplementation(() => ({
    getWipLimit: vi.fn().mockResolvedValue(5),
  })),
  FirebaseNotificationRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockResolvedValue([]),
  })),
  FirebasePlanRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockResolvedValue([]),
  })),
  FirebaseAdrRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockResolvedValue([]),
  })),
  FirebaseGlobalConfigRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockResolvedValue([]),
  })),
  FirebaseAuthAdapter: vi.fn().mockImplementation(() => ({
    login: vi.fn().mockResolvedValue({ uid: 'u1' }),
    logout: vi.fn().mockResolvedValue(undefined),
    onAuthStateChanged: vi.fn().mockReturnValue(vi.fn()),
  })),
  FirebaseRealtimeAdapter: vi.fn().mockImplementation(() => ({
    subscribeToCards: vi.fn().mockReturnValue(vi.fn()),
  })),
}));

describe('integration: bootstrap wiring', () => {
  let container;
  let init;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/bootstrap.js');
    container = mod.container;
    init = mod.init;
  });

  describe('container exports all expected use cases', () => {
    const expectedUseCases = [
      'createCard', 'updateCard', 'deleteCard',
      'changeStatus', 'loadProject', 'manageAuth',
    ];

    it.each(expectedUseCases)('exports %s use case', (name) => {
      expect(container[name]).toBeDefined();
    });

    it('exports the store', () => {
      expect(container.store).toBeDefined();
    });

    it('does not export raw adapters (encapsulation)', () => {
      expect(container.cardRepository).toBeUndefined();
      expect(container.authAdapter).toBeUndefined();
      expect(container.realtimeAdapter).toBeUndefined();
    });
  });

  describe('use cases received the correct adapter type', () => {
    it('createCard has execute method from CreateCard class', () => {
      expect(typeof container.createCard.execute).toBe('function');
    });

    it('updateCard has execute method from UpdateCard class', () => {
      expect(typeof container.updateCard.execute).toBe('function');
    });

    it('deleteCard has execute method from DeleteCard class', () => {
      expect(typeof container.deleteCard.execute).toBe('function');
    });

    it('changeStatus has execute method from ChangeStatus class', () => {
      expect(typeof container.changeStatus.execute).toBe('function');
    });

    it('loadProject has execute method from LoadProject class', () => {
      expect(typeof container.loadProject.execute).toBe('function');
    });

    it('manageAuth has login, logout, and onAuthChange methods', () => {
      expect(typeof container.manageAuth.login).toBe('function');
      expect(typeof container.manageAuth.logout).toBe('function');
      expect(typeof container.manageAuth.onAuthChange).toBe('function');
    });
  });

  describe('init() does not throw', () => {
    it('returns an unsubscribe function', () => {
      const unsub = init();
      expect(typeof unsub).toBe('function');
    });

    it('calling unsubscribe does not throw', () => {
      const unsub = init();
      expect(() => unsub()).not.toThrow();
    });
  });

  describe('store signals are accessible through container', () => {
    it('store.authUser is a signal with .value', () => {
      expect(container.store.authUser).toBeDefined();
      expect(container.store.authUser.value).toBeNull();
    });

    it('store.cards is a signal with .value', () => {
      expect(container.store.cards).toBeDefined();
      expect(Array.isArray(container.store.cards.value)).toBe(true);
    });

    it('store.loading is a signal with .value', () => {
      expect(container.store.loading).toBeDefined();
      expect(container.store.loading.value).toBe(false);
    });

    it('store.error is a signal with .value', () => {
      expect(container.store.error).toBeDefined();
      expect(container.store.error.value).toBeNull();
    });

    it('store.filteredCards is a computed signal', () => {
      expect(container.store.filteredCards).toBeDefined();
      expect(Array.isArray(container.store.filteredCards.value)).toBe(true);
    });
  });
});

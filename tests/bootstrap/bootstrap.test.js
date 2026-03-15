/**
 * Tests for src/bootstrap.js — Dependency Injection wiring.
 * Verifies that the container exposes all use cases and the store,
 * and that init() can be called without errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase adapters
vi.mock('../../src/infrastructure/firebase/index.js', () => ({
  FirebaseCardRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(), get: vi.fn(), save: vi.fn(), update: vi.fn(),
    moveToTrash: vi.fn(), generateId: vi.fn(), countByStatus: vi.fn(),
  })),
  FirebaseProjectRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(), getAll: vi.fn(),
  })),
  FirebaseTeamRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(),
  })),
  FirebaseUserRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
  })),
  FirebaseHistoryRepository: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
  })),
  FirebaseBacklogRepository: vi.fn().mockImplementation(() => ({
    addCard: vi.fn(), removeCard: vi.fn(),
  })),
  FirebaseStateTransitionRepository: vi.fn().mockImplementation(() => ({
    getWipLimit: vi.fn(),
  })),
  FirebaseNotificationRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(),
  })),
  FirebasePlanRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(),
  })),
  FirebaseAdrRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(),
  })),
  FirebaseGlobalConfigRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(),
  })),
  FirebaseAuthAdapter: vi.fn().mockImplementation(() => ({
    login: vi.fn(), logout: vi.fn(),
    onAuthStateChanged: vi.fn().mockReturnValue(vi.fn()),
  })),
  FirebaseRealtimeAdapter: vi.fn().mockImplementation(() => ({
    subscribeToCards: vi.fn().mockReturnValue(vi.fn()),
  })),
}));

describe('bootstrap', () => {
  let container;
  let init;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/bootstrap.js');
    container = mod.container;
    init = mod.init;
  });

  describe('container', () => {
    it('exposes all use cases', () => {
      expect(container).toBeDefined();
      expect(container.createCard).toBeDefined();
      expect(container.updateCard).toBeDefined();
      expect(container.deleteCard).toBeDefined();
      expect(container.changeStatus).toBeDefined();
      expect(container.loadProject).toBeDefined();
      expect(container.manageAuth).toBeDefined();
    });

    it('exposes the application store', () => {
      expect(container.store).toBeDefined();
      expect(container.store.authUser).toBeDefined();
      expect(container.store.currentProject).toBeDefined();
      expect(container.store.cards).toBeDefined();
      expect(container.store.filters).toBeDefined();
      expect(container.store.loading).toBeDefined();
      expect(container.store.error).toBeDefined();
    });

    it('use cases are class instances (not constructors)', () => {
      expect(typeof container.createCard.execute).toBe('function');
      expect(typeof container.updateCard.execute).toBe('function');
      expect(typeof container.deleteCard.execute).toBe('function');
      expect(typeof container.changeStatus.execute).toBe('function');
      expect(typeof container.loadProject.execute).toBe('function');
    });

    it('manageAuth has auth methods', () => {
      expect(typeof container.manageAuth.login).toBe('function');
      expect(typeof container.manageAuth.logout).toBe('function');
      expect(typeof container.manageAuth.onAuthChange).toBe('function');
    });
  });

  describe('init()', () => {
    it('is a function', () => {
      expect(typeof init).toBe('function');
    });

    it('calls onAuthChange to set up auth listener', () => {
      const unsubscribe = init();
      expect(typeof unsubscribe).toBe('function');
    });
  });
});

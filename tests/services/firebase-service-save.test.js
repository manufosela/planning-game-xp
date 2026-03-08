/**
 * Tests for saveCard() - verifies updateCard() is used for existing cards
 * and createCard() for new cards via DAL.
 *
 * Bug: PLN-BUG-0074 - Editing a note on a Done&Validated card caused
 * startDate, endDate and commits to be lost because set() overwrites
 * the entire Firebase node.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreateCard = vi.fn();
const mockUpdateCard = vi.fn();
const mockGetCard = vi.fn();
const mockListCards = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    cards: {
      createCard: (...args) => mockCreateCard(...args),
      updateCard: (...args) => mockUpdateCard(...args),
      getCard: (...args) => mockGetCard(...args),
      listCards: (...args) => mockListCards(...args),
    },
    backlogs: {
      getAllWip: vi.fn().mockResolvedValue(null),
      setWip: vi.fn().mockResolvedValue(undefined),
      removeWip: vi.fn().mockResolvedValue(undefined),
      addWipHistory: vi.fn().mockResolvedValue('history-1'),
    },
    projects: {},
    config: {},
  },
}));

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn(),
  onValue: vi.fn(),
  databaseFirestore: {},
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  auth: { currentUser: { email: 'test@test.com' } },
  firebaseConfig: {},
  superAdminEmail: 'admin@test.com'
}));

vi.mock('@/utils/email-sanitizer.js', () => ({
  encodeEmailForFirebase: vi.fn(e => e),
  decodeEmailFromFirebase: vi.fn(e => e),
  sanitizeEmailForFirebase: vi.fn(e => e)
}));

vi.mock('@/services/permission-service.js', () => ({
  permissionService: { canEdit: () => true, getRole: () => 'admin' }
}));

vi.mock('@/services/history-service.js', () => ({
  historyService: { saveHistory: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock('@/services/user-directory-service.js', () => ({
  userDirectoryService: { resolve: vi.fn() }
}));

vi.mock('@/services/entity-directory-service.js', () => ({
  entityDirectoryService: {
    resolve: vi.fn(),
    waitForInit: vi.fn().mockResolvedValue(undefined),
    resolveDeveloperId: vi.fn(() => null),
    getDeveloper: vi.fn(() => null),
    getDeveloperDisplayName: vi.fn(() => ''),
    findOrCreateDeveloper: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('@/services/developer-backlog-service.js', () => ({
  developerBacklogService: {
    addToBacklog: vi.fn(),
    removeFromBacklog: vi.fn(),
    buildCardKey: vi.fn(() => 'PlanningGame_PLN-TSK-0001')
  }
}));

vi.mock('@/utils/developer-normalizer.js', () => ({
  normalizeDeveloperEntry: vi.fn(v => v)
}));

vi.mock('@/utils/project-people-utils.js', () => ({
  normalizeProjectPeople: vi.fn(v => v)
}));

vi.mock('@/constants/app-constants.js', () => ({
  APP_CONSTANTS: { STATUS: {} }
}));

const mockDemoModeService = {
  isDemo: vi.fn().mockReturnValue(false),
  maxTasksPerProject: 0,
  maxProjects: 0,
  showLimitReached: vi.fn(),
  showFeatureDisabled: vi.fn(),
};
vi.mock('@/services/demo-mode-service.js', () => ({
  demoModeService: mockDemoModeService,
}));

const { FirebaseService: firebaseService } = await import('@/services/firebase-service.js');

// Mock document events to prevent errors
const originalDispatchEvent = document.dispatchEvent;
beforeEach(() => {
  vi.clearAllMocks();
  document.dispatchEvent = vi.fn();
  // Mock getCard() to return existing card data for history tracking
  mockGetCard.mockResolvedValue({
    cardType: 'task-card',
    cardId: 'PLN-TSK-0001',
    title: 'Test task',
    status: 'Done&Validated',
    startDate: '2026-02-18T14:00:00',
    endDate: '2026-02-18T17:00:00',
    commits: [{ hash: 'abc123', message: 'feat: test' }]
  });
  mockCreateCard.mockResolvedValue({ firebaseId: '-NewFirebaseKey123', data: {} });
  mockUpdateCard.mockResolvedValue(undefined);
  mockListCards.mockResolvedValue({});
});

afterEach(() => {
  document.dispatchEvent = originalDispatchEvent;
});

describe('saveCard - update vs set', () => {
  it('should use updateCard() for existing cards to preserve unloaded fields', async () => {
    const existingCard = {
      cardType: 'task-card',
      firebaseId: '-OlkoAAec8dO9b-5-nB-',
      cardId: 'PLN-TSK-0001',
      title: 'Test task',
      status: 'Done&Validated',
      notes: [{ id: '1', content: 'new note', author: 'test@test.com', timestamp: '2026-02-21T08:00:00Z' }],
      group: 'tasks',
      projectId: 'PlanningGame',
      year: 2026
    };

    await firebaseService.saveCard(existingCard, { silent: true, skipHistory: true });

    // Should use updateCard (not createCard) for existing card
    expect(mockUpdateCard).toHaveBeenCalledTimes(1);
    expect(mockCreateCard).not.toHaveBeenCalled();

    // The saved data should NOT include startDate/endDate/commits
    const savedData = mockUpdateCard.mock.calls[0][3]; // (projectId, type, firebaseId, updates)
    expect(savedData.title).toBe('Test task');
    expect(savedData.notes).toEqual(existingCard.notes);
    expect(savedData).not.toHaveProperty('startDate');
    expect(savedData).not.toHaveProperty('endDate');
    expect(savedData).not.toHaveProperty('commits');
  });

  it('should use createCard() for new cards', async () => {
    mockCreateCard.mockResolvedValue({ firebaseId: '-NewKey456', data: {} });

    const newCard = {
      cardType: 'task-card',
      title: 'Brand new task',
      status: 'To Do',
      group: 'tasks',
      projectId: 'PlanningGame',
      cardId: 'PLN-TSK-0099',
      year: 2026
    };

    await firebaseService.saveCard(newCard, { silent: true, skipHistory: true });

    // Should use createCard for new card
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
    expect(mockUpdateCard).not.toHaveBeenCalled();
  });

  it('should preserve fields in Firebase when only notes are updated via updateCard()', async () => {
    const cardWithOnlyNotes = {
      cardType: 'task-card',
      firebaseId: '-ExistingKey789',
      cardId: 'PLN-TSK-0050',
      title: 'Task with commits',
      status: 'Done&Validated',
      developer: 'dev_016',
      notes: [{ id: '1', content: 'edited note', author: 'test@test.com', timestamp: '2026-02-21T08:00:00Z' }],
      group: 'tasks',
      projectId: 'PlanningGame',
      year: 2026
    };

    await firebaseService.saveCard(cardWithOnlyNotes, { silent: true, skipHistory: true });

    expect(mockUpdateCard).toHaveBeenCalledTimes(1);
    const savedData = mockUpdateCard.mock.calls[0][3];

    expect(savedData.notes).toBeDefined();
    expect(savedData.developer).toBe('dev_016');
    expect(savedData).not.toHaveProperty('startDate');
    expect(savedData).not.toHaveProperty('endDate');
    expect(savedData).not.toHaveProperty('commits');
  });
});

describe('saveCard - demo mode card count limit', () => {
  beforeEach(() => {
    mockDemoModeService.isDemo.mockReturnValue(false);
    mockDemoModeService.maxTasksPerProject = 0;
    mockDemoModeService.showLimitReached.mockClear();
  });

  it('should block new card creation when demo limit is reached', async () => {
    mockDemoModeService.isDemo.mockReturnValue(true);
    mockDemoModeService.maxTasksPerProject = 2;

    // Simulate 2 existing cards in the section
    mockListCards.mockResolvedValueOnce({ '-key1': {}, '-key2': {} });

    const newCard = {
      cardType: 'task-card',
      title: 'Demo task',
      status: 'To Do',
      group: 'tasks',
      projectId: 'DemoProject',
      cardId: 'DM-TSK-0003',
      year: 2026,
    };

    await firebaseService.saveCard(newCard, { silent: true, skipHistory: true });

    // Should NOT write to Firebase
    expect(mockCreateCard).not.toHaveBeenCalled();
    expect(mockUpdateCard).not.toHaveBeenCalled();
    expect(mockDemoModeService.showLimitReached).toHaveBeenCalledWith('tasks');
  });

  it('should allow new card creation when demo limit is not reached', async () => {
    mockDemoModeService.isDemo.mockReturnValue(true);
    mockDemoModeService.maxTasksPerProject = 5;

    // Simulate 2 existing cards (under limit of 5)
    mockListCards.mockResolvedValueOnce({ '-key1': {}, '-key2': {} });

    mockCreateCard.mockResolvedValue({ firebaseId: '-NewDemoKey', data: {} });

    const newCard = {
      cardType: 'task-card',
      title: 'Demo task under limit',
      status: 'To Do',
      group: 'tasks',
      projectId: 'DemoProject',
      cardId: 'DM-TSK-0001',
      year: 2026,
    };

    await firebaseService.saveCard(newCard, { silent: true, skipHistory: true });

    // Should write via DAL
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
    expect(mockDemoModeService.showLimitReached).not.toHaveBeenCalled();
  });

  it('should skip demo check for existing cards (update)', async () => {
    mockDemoModeService.isDemo.mockReturnValue(true);
    mockDemoModeService.maxTasksPerProject = 1;

    const existingCard = {
      cardType: 'task-card',
      firebaseId: '-ExistingKey',
      cardId: 'DM-TSK-0001',
      title: 'Existing demo task',
      status: 'In Progress',
      group: 'tasks',
      projectId: 'DemoProject',
      year: 2026,
    };

    await firebaseService.saveCard(existingCard, { silent: true, skipHistory: true });

    // Should use updateCard regardless of demo mode
    expect(mockUpdateCard).toHaveBeenCalledTimes(1);
    expect(mockDemoModeService.showLimitReached).not.toHaveBeenCalled();
  });

  it('should not check demo limits when not in demo mode', async () => {
    mockDemoModeService.isDemo.mockReturnValue(false);
    mockDemoModeService.maxTasksPerProject = 2;

    mockCreateCard.mockResolvedValue({ firebaseId: '-NewKey', data: {} });

    const newCard = {
      cardType: 'task-card',
      title: 'Normal task',
      status: 'To Do',
      group: 'tasks',
      projectId: 'MyProject',
      cardId: 'PRJ-TSK-0001',
      year: 2026,
    };

    await firebaseService.saveCard(newCard, { silent: true, skipHistory: true });

    // Should write without demo check
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
    expect(mockDemoModeService.showLimitReached).not.toHaveBeenCalled();
  });
});

/**
 * Tests for TableViewManager - optimized views with fallback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableViewManager } from '@/views/table-view-manager.js';

// Mock dependencies
vi.mock('@/renderers/table-renderer.js', () => ({
  TableRenderer: vi.fn().mockImplementation(() => ({
    setLoading: vi.fn(),
    setLoaded: vi.fn(),
    renderLoadingSkeleton: vi.fn(),
    clearFilters: vi.fn(),
    setFilters: vi.fn(),
    renderTableView: vi.fn(),
    renderBugsTableView: vi.fn(),
    renderProposalsTableView: vi.fn(),
    applyFilters: vi.fn(cards => cards)
  }))
}));

vi.mock('@/services/user-directory-service.js', () => ({
  userDirectoryService: {
    load: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('@/services/unified-filter-service.js', () => ({
  getUnifiedFilterService: vi.fn().mockReturnValue({
    applyFilters: vi.fn((cards) => cards),
    setFilter: vi.fn(),
    clearAllFilters: vi.fn()
  })
}));

describe('TableViewManager', () => {
  let manager;
  let mockFirebaseService;
  let mockUnsubscribe;

  beforeEach(() => {
    // Reset mocks
    mockUnsubscribe = vi.fn();
    mockFirebaseService = {
      subscribeToPath: vi.fn().mockReturnValue(mockUnsubscribe)
    };

    // Create manager instance
    manager = new TableViewManager(mockFirebaseService);

    // Mock localStorage
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

    // Mock global window properties
    globalThis.globalSprintList = {};
    globalThis.globalEpicList = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
    manager.cleanup();
  });

  describe('_getViewPath', () => {
    it('should return correct view path for tasks', () => {
      const path = manager._getViewPath('tasks', 'TestProject');
      expect(path).toBe('/views/task-list/TestProject');
    });

    it('should return correct view path for bugs', () => {
      const path = manager._getViewPath('bugs', 'TestProject');
      expect(path).toBe('/views/bug-list/TestProject');
    });

    it('should return correct view path for proposals', () => {
      const path = manager._getViewPath('proposals', 'TestProject');
      expect(path).toBe('/views/proposal-list/TestProject');
    });

    it('should return null for unknown section', () => {
      const path = manager._getViewPath('unknown', 'TestProject');
      expect(path).toBeNull();
    });
  });

  describe('_getCardsPath', () => {
    it('should return correct cards path for tasks', () => {
      const path = manager._getCardsPath('tasks', 'TestProject');
      expect(path).toBe('/cards/TestProject/TASKS_TestProject');
    });

    it('should return correct cards path for bugs', () => {
      const path = manager._getCardsPath('bugs', 'TestProject');
      expect(path).toBe('/cards/TestProject/BUGS_TestProject');
    });

    it('should return correct cards path for proposals', () => {
      const path = manager._getCardsPath('proposals', 'TestProject');
      expect(path).toBe('/cards/TestProject/PROPOSALS_TestProject');
    });
  });

  describe('_extractViewFields', () => {
    it('should extract only task view fields', () => {
      const fullTask = {
        firebaseId: '-Oabc123',
        cardId: 'TST-TSK-0001',
        title: 'Test task',
        status: 'In Progress',
        description: 'Long description - should NOT be included',
        acceptanceCriteria: 'Should NOT be included',
        acceptanceCriteriaStructured: [{ given: 'test', when: 'test', then: 'test' }],
        businessPoints: 3,
        devPoints: 2,
        sprint: 'TST-SPR-0001',
        developer: 'dev_001',
        coDeveloper: 'dev_002',
        validator: 'stk_001',
        coValidator: 'stk_002',
        epic: 'TST-EPC-0001',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
        spike: true,
        expedited: false,
        blockedByBusiness: false,
        blockedByDevelopment: true,
        notes: [{ text: 'note 1' }, { text: 'note 2' }],
        year: 2026,
        createdAt: '2026-01-01T00:00:00Z',
        colors: { bg: '#fff' }
      };

      const viewData = manager._extractViewFields(fullTask, 'tasks');

      // Should include essential fields
      expect(viewData.firebaseId).toBe('-Oabc123');
      expect(viewData.cardId).toBe('TST-TSK-0001');
      expect(viewData.title).toBe('Test task');
      expect(viewData.status).toBe('In Progress');
      expect(viewData.businessPoints).toBe(3);
      expect(viewData.devPoints).toBe(2);
      expect(viewData.sprint).toBe('TST-SPR-0001');
      expect(viewData.developer).toBe('dev_001');
      expect(viewData.coDeveloper).toBe('dev_002');
      expect(viewData.validator).toBe('stk_001');
      expect(viewData.coValidator).toBe('stk_002');
      expect(viewData.epic).toBe('TST-EPC-0001');
      expect(viewData.spike).toBe(true);
      expect(viewData.expedited).toBe(false);
      expect(viewData.blockedByBusiness).toBe(false);
      expect(viewData.blockedByDevelopment).toBe(true);
      expect(viewData.notesCount).toBe(2);
      expect(viewData.year).toBe(2026);

      // Should NOT include heavy fields
      expect(viewData.description).toBeUndefined();
      expect(viewData.acceptanceCriteria).toBeUndefined();
      expect(viewData.acceptanceCriteriaStructured).toBeUndefined();
      expect(viewData.notes).toBeUndefined();
      expect(viewData.colors).toBeUndefined();
      expect(viewData.createdAt).toBeUndefined();
    });

    it('should extract only bug view fields', () => {
      const fullBug = {
        firebaseId: '-Odef456',
        cardId: 'TST-BUG-0001',
        title: 'Test bug',
        status: 'Assigned',
        description: 'Long description - should NOT be included',
        priority: 'APPLICATION BLOCKER',
        developer: 'dev_001',
        coDeveloper: 'dev_002',
        createdBy: 'user@test.com',
        registerDate: '2026-01-01',
        startDate: '2026-01-02',
        endDate: '2026-01-10',
        year: 2026,
        bugType: 'Funcional',
        cinemaFile: 'path/to/file.c4d',
        notes: [{ text: 'note' }]
      };

      const viewData = manager._extractViewFields(fullBug, 'bugs');

      // Should include essential fields
      expect(viewData.firebaseId).toBe('-Odef456');
      expect(viewData.cardId).toBe('TST-BUG-0001');
      expect(viewData.title).toBe('Test bug');
      expect(viewData.status).toBe('Assigned');
      expect(viewData.priority).toBe('APPLICATION BLOCKER');
      expect(viewData.developer).toBe('dev_001');
      expect(viewData.coDeveloper).toBe('dev_002');
      expect(viewData.createdBy).toBe('user@test.com');
      expect(viewData.year).toBe(2026);

      // Should NOT include heavy fields
      expect(viewData.description).toBeUndefined();
      expect(viewData.bugType).toBeUndefined();
      expect(viewData.cinemaFile).toBeUndefined();
      expect(viewData.notes).toBeUndefined();
    });

    it('should extract bug fields without coDeveloper when not present', () => {
      const bugWithoutCoDev = {
        firebaseId: '-Odef789',
        cardId: 'TST-BUG-0002',
        title: 'Bug without co-dev',
        status: 'Created',
        developer: 'dev_001',
        year: 2026
      };

      const viewData = manager._extractViewFields(bugWithoutCoDev, 'bugs');

      expect(viewData.developer).toBe('dev_001');
      expect(viewData.coDeveloper).toBeUndefined();
    });

    it('should extract only proposal view fields', () => {
      const fullProposal = {
        firebaseId: '-Oghi789',
        cardId: 'TST-PRP-0001',
        title: 'Test proposal',
        status: 'Pending',
        description: 'Long description - should NOT be included',
        businessPoints: 5,
        createdBy: 'user@test.com',
        stakeholder: 'stk_001',
        registerDate: '2026-01-01',
        year: 2026,
        acceptanceCriteria: 'Not included'
      };

      const viewData = manager._extractViewFields(fullProposal, 'proposals');

      // Should include essential fields
      expect(viewData.firebaseId).toBe('-Oghi789');
      expect(viewData.cardId).toBe('TST-PRP-0001');
      expect(viewData.title).toBe('Test proposal');
      expect(viewData.status).toBe('Pending');
      expect(viewData.businessPoints).toBe(5);
      expect(viewData.createdBy).toBe('user@test.com');
      expect(viewData.stakeholder).toBe('stk_001');
      expect(viewData.year).toBe(2026);

      // Should NOT include heavy fields
      expect(viewData.description).toBeUndefined();
      expect(viewData.acceptanceCriteria).toBeUndefined();
    });

    it('should extract relatedTasks when present on task', () => {
      const taskWithRelations = {
        firebaseId: '-Orel123',
        cardId: 'TST-TSK-0010',
        title: 'Task with relations',
        status: 'In Progress',
        relatedTasks: [
          { id: 'TST-TSK-0005', type: 'blockedBy', title: 'Blocker task', projectId: 'TestProject' },
          { id: 'TST-TSK-0008', type: 'related', title: 'Related task', projectId: 'TestProject' }
        ],
        year: 2026
      };

      const viewData = manager._extractViewFields(taskWithRelations, 'tasks');

      expect(viewData.relatedTasks).toEqual([
        { id: 'TST-TSK-0005', type: 'blockedBy', title: 'Blocker task', projectId: 'TestProject' },
        { id: 'TST-TSK-0008', type: 'related', title: 'Related task', projectId: 'TestProject' }
      ]);
    });

    it('should not include relatedTasks when absent on task', () => {
      const taskWithoutRelations = {
        firebaseId: '-Onorel',
        cardId: 'TST-TSK-0011',
        title: 'Task without relations',
        status: 'To Do',
        year: 2026
      };

      const viewData = manager._extractViewFields(taskWithoutRelations, 'tasks');

      expect(viewData.relatedTasks).toBeUndefined();
    });

    it('should calculate notesCount from notes array', () => {
      const taskWithNotes = {
        firebaseId: '-Otest',
        notes: [{ text: 'a' }, { text: 'b' }, { text: 'c' }]
      };
      const viewData = manager._extractViewFields(taskWithNotes, 'tasks');
      expect(viewData.notesCount).toBe(3);
    });

    it('should handle missing notes array', () => {
      const taskWithoutNotes = {
        firebaseId: '-Otest'
      };
      const viewData = manager._extractViewFields(taskWithoutNotes, 'tasks');
      expect(viewData.notesCount).toBe(0);
    });

    it('should extract planStatus from implementationPlan', () => {
      const taskWithPlan = {
        firebaseId: '-Oplan123',
        cardId: 'TST-TSK-0020',
        title: 'Task with plan',
        status: 'In Progress',
        implementationPlan: { planStatus: 'validated', approach: 'test', steps: [] }
      };
      const viewData = manager._extractViewFields(taskWithPlan, 'tasks');
      expect(viewData.planStatus).toBe('validated');
    });

    it('should not include planStatus when no implementationPlan', () => {
      const taskWithoutPlan = {
        firebaseId: '-Onoplan',
        cardId: 'TST-TSK-0021',
        title: 'Task without plan',
        status: 'To Do'
      };
      const viewData = manager._extractViewFields(taskWithoutPlan, 'tasks');
      expect(viewData.planStatus).toBeUndefined();
    });
  });

  describe('setupTableView', () => {
    it('should subscribe to optimized view path first', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'tasks');

      expect(mockFirebaseService.subscribeToPath).toHaveBeenCalledWith(
        '/views/task-list/TestProject',
        expect.any(Function)
      );
    });

    it('should subscribe to bugs view for bugs section', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'bugs');

      expect(mockFirebaseService.subscribeToPath).toHaveBeenCalledWith(
        '/views/bug-list/TestProject',
        expect.any(Function)
      );
    });

    it('should subscribe to proposals view for proposals section', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'proposals');

      expect(mockFirebaseService.subscribeToPath).toHaveBeenCalledWith(
        '/views/proposal-list/TestProject',
        expect.any(Function)
      );
    });

    it('should use data from view when it exists', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'tasks');

      // Get the callback passed to subscribeToPath
      const callback = mockFirebaseService.subscribeToPath.mock.calls[0][1];

      // Simulate view data exists
      const mockSnapshot = {
        exists: () => true,
        val: () => ({
          '-Oabc123': { cardId: 'TST-TSK-0001', title: 'Task 1', status: 'To Do' }
        })
      };

      callback(mockSnapshot);

      expect(manager.cardsCache).toHaveProperty('-Oabc123');
      expect(manager._usingFallback).toBe(false);
    });

    it('should fallback to /cards when view does not exist', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'tasks');

      // Get the callback passed to subscribeToPath
      const callback = mockFirebaseService.subscribeToPath.mock.calls[0][1];

      // Simulate view does not exist
      const mockSnapshot = {
        exists: () => false,
        val: () => null
      };

      callback(mockSnapshot);

      // Should have called subscribeToPath again with cards path
      expect(mockFirebaseService.subscribeToPath).toHaveBeenCalledTimes(2);
      expect(mockFirebaseService.subscribeToPath).toHaveBeenLastCalledWith(
        '/cards/TestProject/TASKS_TestProject',
        expect.any(Function)
      );
      expect(manager._usingFallback).toBe(true);
    });

    it('should extract view fields when using fallback', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'tasks');

      // Trigger fallback
      const viewCallback = mockFirebaseService.subscribeToPath.mock.calls[0][1];
      viewCallback({ exists: () => false, val: () => null });

      // Get the fallback callback
      const fallbackCallback = mockFirebaseService.subscribeToPath.mock.calls[1][1];

      // Simulate full card data from /cards
      const fullCardData = {
        '-Oabc123': {
          cardId: 'TST-TSK-0001',
          title: 'Task 1',
          status: 'To Do',
          description: 'Long description that should be excluded',
          acceptanceCriteria: 'Also excluded',
          notes: [{ text: 'note' }],
          year: 2026
        }
      };

      fallbackCallback({
        exists: () => true,
        val: () => fullCardData
      });

      // Check that only view fields are cached
      const cachedCard = manager.cardsCache['-Oabc123'];
      expect(cachedCard.cardId).toBe('TST-TSK-0001');
      expect(cachedCard.title).toBe('Task 1');
      expect(cachedCard.status).toBe('To Do');
      expect(cachedCard.notesCount).toBe(1);
      expect(cachedCard.year).toBe(2026);
      expect(cachedCard.description).toBeUndefined();
      expect(cachedCard.acceptanceCriteria).toBeUndefined();
      expect(cachedCard.notes).toBeUndefined();
    });

    it('should skip deleted cards in fallback mode', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'tasks');

      // Trigger fallback
      const viewCallback = mockFirebaseService.subscribeToPath.mock.calls[0][1];
      viewCallback({ exists: () => false, val: () => null });

      // Get the fallback callback
      const fallbackCallback = mockFirebaseService.subscribeToPath.mock.calls[1][1];

      // Simulate data with deleted card
      const fullCardData = {
        '-Oabc123': { cardId: 'TST-TSK-0001', title: 'Active Task' },
        '-Odef456': { cardId: 'TST-TSK-0002', title: 'Deleted Task', deletedAt: '2026-01-01' }
      };

      fallbackCallback({
        exists: () => true,
        val: () => fullCardData
      });

      // Only active card should be cached
      expect(Object.keys(manager.cardsCache)).toHaveLength(1);
      expect(manager.cardsCache['-Oabc123']).toBeDefined();
      expect(manager.cardsCache['-Odef456']).toBeUndefined();
    });
  });

  describe('_filterConvertedProposals (PLN-TSK-0358)', () => {
    const proposals = {
      open1: { cardId: 'SIM-PRP-0001', title: 'Sin aprobar' },
      approved: { cardId: 'SIM-PRP-0002', title: 'Aprobada', convertedToPlan: 'SIM-PLA-0003' },
      open2: { cardId: 'SIM-PRP-0003', title: 'Otra sin aprobar' }
    };

    it('should hide proposals already approved as a plan by default', () => {
      manager.currentSection = 'proposals';
      manager.showConvertedProposals = false;

      const visible = manager._filterConvertedProposals(proposals);

      expect(Object.keys(visible)).toEqual(['open1', 'open2']);
    });

    it('should show them when the user asks for them', () => {
      manager.currentSection = 'proposals';
      manager.showConvertedProposals = true;

      const visible = manager._filterConvertedProposals(proposals);

      expect(Object.keys(visible)).toEqual(['open1', 'approved', 'open2']);
    });

    it('should not touch other sections', () => {
      manager.currentSection = 'tasks';
      manager.showConvertedProposals = false;
      const tasks = { t1: { cardId: 'SIM-TSK-0001', convertedToPlan: 'ignored' } };

      expect(manager._filterConvertedProposals(tasks)).toBe(tasks);
    });
  });

  describe('cleanup', () => {
    it('should reset _usingFallback flag', () => {
      manager._usingFallback = true;
      manager.cleanup();
      expect(manager._usingFallback).toBe(false);
    });

    it('should unsubscribe from Firebase', () => {
      const container = document.createElement('div');
      const config = { projectId: 'TestProject' };

      manager.setupTableView(container, config, 'tasks');
      manager.cleanup();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});

/**
 * Tests for sync-card-views Cloud Function handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleSyncCardViews,
  extractTaskViewFields,
  extractBugViewFields,
  extractProposalViewFields,
  extractPublicViewFields,
  getViewPathForSection,
  getPublicViewType,
  syncPublicView,
  PUBLIC_VIEW_FIELDS
} from '../../functions/handlers/sync-card-views.js';

describe('Sync Card Views Handler', () => {
  let mockDb;
  let mockLogger;
  let mockSet;
  let mockRemove;

  // Default: project is NOT public (so syncPublicView removes/skips)
  let mockProjectData;

  beforeEach(() => {
    mockSet = vi.fn().mockResolvedValue(undefined);
    mockRemove = vi.fn().mockResolvedValue(undefined);
    mockProjectData = null; // No project by default
    mockDb = {
      ref: vi.fn((path) => {
        // Project lookup for syncPublicView
        if (path && path.startsWith('/projects/')) {
          return {
            once: vi.fn().mockResolvedValue({
              val: () => mockProjectData,
              exists: () => mockProjectData !== null
            }),
            set: mockSet,
            remove: mockRemove
          };
        }
        return {
          set: mockSet,
          remove: mockRemove,
          once: vi.fn().mockResolvedValue({ val: () => null, exists: () => false })
        };
      })
    };
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };
  });

  describe('getViewPathForSection', () => {
    it('should return task-list for tasks section (lowercase)', () => {
      expect(getViewPathForSection('tasks_ProjectA')).toBe('task-list');
      expect(getViewPathForSection('tasks_PlanningGame')).toBe('task-list');
    });

    it('should return task-list for TASKS section (uppercase)', () => {
      expect(getViewPathForSection('TASKS_ProjectA')).toBe('task-list');
      expect(getViewPathForSection('TASKS_PlanningGame')).toBe('task-list');
    });

    it('should return bug-list for bugs section (lowercase)', () => {
      expect(getViewPathForSection('bugs_ProjectA')).toBe('bug-list');
      expect(getViewPathForSection('bugs_Cinema4D')).toBe('bug-list');
    });

    it('should return bug-list for BUGS section (uppercase)', () => {
      expect(getViewPathForSection('BUGS_ProjectA')).toBe('bug-list');
      expect(getViewPathForSection('BUGS_Cinema4D')).toBe('bug-list');
    });

    it('should return proposal-list for proposals section (lowercase)', () => {
      expect(getViewPathForSection('proposals_ProjectA')).toBe('proposal-list');
    });

    it('should return proposal-list for PROPOSALS section (uppercase)', () => {
      expect(getViewPathForSection('PROPOSALS_ProjectA')).toBe('proposal-list');
    });

    it('should return null for other sections (epics, sprints, qa)', () => {
      expect(getViewPathForSection('epics_ProjectA')).toBeNull();
      expect(getViewPathForSection('sprints_ProjectA')).toBeNull();
      expect(getViewPathForSection('qa_ProjectA')).toBeNull();
      expect(getViewPathForSection('EPICS_ProjectA')).toBeNull();
      expect(getViewPathForSection('SPRINTS_ProjectA')).toBeNull();
    });
  });

  describe('extractTaskViewFields', () => {
    it('should extract only essential fields for task table view', () => {
      const fullTask = {
        cardId: 'PLN-TSK-0001',
        title: 'Test task',
        status: 'In Progress',
        description: 'Long description that should not be included',
        acceptanceCriteria: 'Also not included',
        acceptanceCriteriaStructured: [{ given: 'test', when: 'test', then: 'test' }],
        businessPoints: 3,
        devPoints: 2,
        sprint: 'PLN-SPR-0001',
        developer: 'dev_001',
        coDeveloper: 'dev_002',
        validator: 'stk_001',
        coValidator: 'stk_002',
        epic: 'PLN-EPC-0001',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
        spike: true,
        expedited: false,
        blockedByBusiness: false,
        blockedByDevelopment: true,
        notes: [{ text: 'note 1' }, { text: 'note 2' }],
        year: 2026,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
        colors: { bg: '#fff' },
        position: 5
      };

      const viewData = extractTaskViewFields(fullTask, 'firebase-key-123');

      // Should include essential fields
      expect(viewData.cardId).toBe('PLN-TSK-0001');
      expect(viewData.title).toBe('Test task');
      expect(viewData.status).toBe('In Progress');
      expect(viewData.businessPoints).toBe(3);
      expect(viewData.devPoints).toBe(2);
      expect(viewData.sprint).toBe('PLN-SPR-0001');
      expect(viewData.developer).toBe('dev_001');
      expect(viewData.coDeveloper).toBe('dev_002');
      expect(viewData.validator).toBe('stk_001');
      expect(viewData.epic).toBe('PLN-EPC-0001');
      expect(viewData.startDate).toBe('2026-01-01');
      expect(viewData.endDate).toBe('2026-01-15');
      expect(viewData.spike).toBe(true);
      expect(viewData.expedited).toBe(false);
      expect(viewData.blockedByBusiness).toBe(false);
      expect(viewData.blockedByDevelopment).toBe(true);
      expect(viewData.notesCount).toBe(2);
      expect(viewData.year).toBe(2026);
      expect(viewData.firebaseId).toBe('firebase-key-123');

      // Should NOT include heavy/unnecessary fields
      expect(viewData.description).toBeUndefined();
      expect(viewData.acceptanceCriteria).toBeUndefined();
      expect(viewData.acceptanceCriteriaStructured).toBeUndefined();
      expect(viewData.notes).toBeUndefined();
      expect(viewData.colors).toBeUndefined();
      expect(viewData.position).toBeUndefined();
    });

    it('should extract relatedTasks with minimal fields and default type', () => {
      const taskWithRelations = {
        cardId: 'PLN-TSK-0050',
        title: 'Task with relations',
        status: 'In Progress',
        relatedTasks: [
          { id: 'PLN-TSK-0040', title: 'Blocker', type: 'blockedBy', projectId: 'PlanningGame' },
          { id: 'PLN-TSK-0045', projectId: 'PlanningGame' }
        ],
        year: 2026
      };

      const viewData = extractTaskViewFields(taskWithRelations, 'key-rel-1');

      expect(viewData.relatedTasks).toEqual([
        { id: 'PLN-TSK-0040', title: 'Blocker', type: 'blockedBy', projectId: 'PlanningGame' },
        { id: 'PLN-TSK-0045', title: 'PLN-TSK-0045', type: 'related', projectId: 'PlanningGame' }
      ]);
    });

    it('should not include relatedTasks when absent', () => {
      const taskWithoutRelations = {
        cardId: 'PLN-TSK-0051',
        title: 'No relations',
        status: 'To Do'
      };

      const viewData = extractTaskViewFields(taskWithoutRelations, 'key-no-rel');

      expect(viewData.relatedTasks).toBeUndefined();
    });

    it('should not include relatedTasks when not an array', () => {
      const taskWithBadRelations = {
        cardId: 'PLN-TSK-0052',
        title: 'Bad relations',
        status: 'To Do',
        relatedTasks: 'not-an-array'
      };

      const viewData = extractTaskViewFields(taskWithBadRelations, 'key-bad-rel');

      expect(viewData.relatedTasks).toBeUndefined();
    });

    it('should count notes correctly when Firebase stores them as object (sparse array)', () => {
      const taskWithObjectNotes = {
        cardId: 'PLN-TSK-0070',
        title: 'Task with object notes',
        status: 'In Progress',
        notes: {
          0: { content: 'First note', author: 'user@test.com', timestamp: '2026-01-01' },
          2: { content: 'Third note', author: 'user@test.com', timestamp: '2026-01-03' },
          5: { content: 'Sixth note', author: 'user@test.com', timestamp: '2026-01-06' }
        },
        year: 2026
      };

      const viewData = extractTaskViewFields(taskWithObjectNotes, 'key-obj-notes');

      expect(viewData.notesCount).toBe(3);
    });

    it('should return notesCount 0 when notes is null or undefined', () => {
      const taskNoNotes = {
        cardId: 'PLN-TSK-0071',
        title: 'No notes',
        status: 'To Do',
        notes: null
      };

      expect(extractTaskViewFields(taskNoNotes, 'key-null').notesCount).toBe(0);
      expect(extractTaskViewFields({ ...taskNoNotes, notes: undefined }, 'key-undef').notesCount).toBe(0);
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalTask = {
        cardId: 'PLN-TSK-0002',
        title: 'Minimal task',
        status: 'To Do'
      };

      const viewData = extractTaskViewFields(minimalTask, 'key-456');

      expect(viewData.cardId).toBe('PLN-TSK-0002');
      expect(viewData.title).toBe('Minimal task');
      expect(viewData.status).toBe('To Do');
      expect(viewData.notesCount).toBe(0);
      expect(viewData.firebaseId).toBe('key-456');
    });

    it('should extract planStatus from implementationPlan', () => {
      const taskWithPlan = {
        cardId: 'PLN-TSK-0060',
        title: 'Task with plan',
        status: 'In Progress',
        implementationPlan: { planStatus: 'in_progress', approach: 'test', steps: [] }
      };

      const viewData = extractTaskViewFields(taskWithPlan, 'key-plan');

      expect(viewData.planStatus).toBe('in_progress');
    });

    it('should not include planStatus when no implementationPlan', () => {
      const taskWithoutPlan = {
        cardId: 'PLN-TSK-0061',
        title: 'No plan',
        status: 'To Do'
      };

      const viewData = extractTaskViewFields(taskWithoutPlan, 'key-noplan');

      expect(viewData.planStatus).toBeUndefined();
    });

    it('should extract commitsCount from commits array', () => {
      const taskWithCommits = {
        cardId: 'PLN-TSK-0080',
        title: 'Task with commits',
        status: 'To Validate',
        commits: [
          { hash: 'abc123', message: 'feat: something', date: '2026-02-22', author: 'dev' },
          { hash: 'def456', message: 'fix: something', date: '2026-02-22', author: 'dev' }
        ]
      };

      const viewData = extractTaskViewFields(taskWithCommits, 'key-commits');

      expect(viewData.commitsCount).toBe(2);
      expect(viewData.commits).toBeUndefined();
    });

    it('should return commitsCount 0 when no commits', () => {
      const taskNoCommits = {
        cardId: 'PLN-TSK-0081',
        title: 'No commits',
        status: 'To Do'
      };

      const viewData = extractTaskViewFields(taskNoCommits, 'key-nocommits');

      expect(viewData.commitsCount).toBe(0);
    });

    it('should extract pipelineStatus when present', () => {
      const taskWithPipeline = {
        cardId: 'PLN-TSK-0082',
        title: 'Task with pipeline',
        status: 'To Validate',
        pipelineStatus: {
          prCreated: { date: '2026-02-22', prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42 },
          merged: { date: '2026-02-22', mergedBy: 'dev_010' }
        }
      };

      const viewData = extractTaskViewFields(taskWithPipeline, 'key-pipeline');

      expect(viewData.pipelineStatus).toEqual({
        prCreated: { date: '2026-02-22', prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42 },
        merged: { date: '2026-02-22', mergedBy: 'dev_010' }
      });
    });

    it('should not include pipelineStatus when absent', () => {
      const taskNoPipeline = {
        cardId: 'PLN-TSK-0083',
        title: 'No pipeline',
        status: 'To Do'
      };

      const viewData = extractTaskViewFields(taskNoPipeline, 'key-nopipeline');

      expect(viewData.pipelineStatus).toBeUndefined();
    });
  });

  describe('extractBugViewFields', () => {
    it('should extract only essential fields for bug table view', () => {
      const fullBug = {
        cardId: 'PLN-BUG-0001',
        title: 'Test bug',
        status: 'Assigned',
        description: 'Long bug description',
        priority: 'APPLICATION BLOCKER',
        developer: 'dev_001',
        createdBy: 'user@test.com',
        registerDate: '2026-01-01',
        startDate: '2026-01-02',
        endDate: '2026-01-10',
        year: 2026,
        bugType: 'Funcional',
        cinemaFile: 'path/to/file.c4d',
        notes: [{ text: 'note' }]
      };

      const viewData = extractBugViewFields(fullBug, 'bug-key-123');

      // Should include essential fields
      expect(viewData.cardId).toBe('PLN-BUG-0001');
      expect(viewData.title).toBe('Test bug');
      expect(viewData.status).toBe('Assigned');
      expect(viewData.priority).toBe('APPLICATION BLOCKER');
      expect(viewData.developer).toBe('dev_001');
      expect(viewData.createdBy).toBe('user@test.com');
      expect(viewData.registerDate).toBe('2026-01-01');
      expect(viewData.startDate).toBe('2026-01-02');
      expect(viewData.endDate).toBe('2026-01-10');
      expect(viewData.year).toBe(2026);
      expect(viewData.firebaseId).toBe('bug-key-123');

      // Should NOT include heavy fields
      expect(viewData.description).toBeUndefined();
      expect(viewData.bugType).toBeUndefined();
      expect(viewData.cinemaFile).toBeUndefined();
      expect(viewData.notes).toBeUndefined();
    });

    it('should extract commitsCount and pipelineStatus for bugs', () => {
      const bugWithPipeline = {
        cardId: 'PLN-BUG-0010',
        title: 'Bug with pipeline',
        status: 'Fixed',
        priority: 'INDIVIDUAL BLOCKER',
        developer: 'dev_016',
        year: 2026,
        commits: [{ hash: 'abc123', message: 'fix: something' }],
        pipelineStatus: {
          prCreated: { date: '2026-02-22', prNumber: 10 },
          merged: { date: '2026-02-22' }
        }
      };

      const viewData = extractBugViewFields(bugWithPipeline, 'bug-key-pipeline');

      expect(viewData.commitsCount).toBe(1);
      expect(viewData.pipelineStatus).toEqual({
        prCreated: { date: '2026-02-22', prNumber: 10 },
        merged: { date: '2026-02-22' }
      });
      expect(viewData.commits).toBeUndefined();
    });

    it('should return commitsCount 0 and no pipelineStatus when absent', () => {
      const bugNoPipeline = {
        cardId: 'PLN-BUG-0011',
        title: 'Bug no pipeline',
        status: 'Created'
      };

      const viewData = extractBugViewFields(bugNoPipeline, 'bug-key-nopipeline');

      expect(viewData.commitsCount).toBe(0);
      expect(viewData.pipelineStatus).toBeUndefined();
    });
  });

  describe('extractProposalViewFields', () => {
    it('should extract only essential fields for proposal table view', () => {
      const fullProposal = {
        cardId: 'PLN-PRP-0001',
        title: 'Test proposal',
        status: 'Pending',
        description: 'Long proposal description',
        businessPoints: 5,
        createdBy: 'user@test.com',
        stakeholder: 'stk_001',
        registerDate: '2026-01-01',
        year: 2026,
        acceptanceCriteria: 'Not included'
      };

      const viewData = extractProposalViewFields(fullProposal, 'prop-key-123');

      // Should include essential fields
      expect(viewData.cardId).toBe('PLN-PRP-0001');
      expect(viewData.title).toBe('Test proposal');
      expect(viewData.status).toBe('Pending');
      expect(viewData.businessPoints).toBe(5);
      expect(viewData.createdBy).toBe('user@test.com');
      expect(viewData.stakeholder).toBe('stk_001');
      expect(viewData.registerDate).toBe('2026-01-01');
      expect(viewData.year).toBe(2026);
      expect(viewData.firebaseId).toBe('prop-key-123');

      // Should NOT include heavy fields
      expect(viewData.description).toBeUndefined();
      expect(viewData.acceptanceCriteria).toBeUndefined();
    });
  });

  describe('handleSyncCardViews', () => {
    describe('card creation', () => {
      it('should create view entry when task is created', async () => {
        const params = {
          projectId: 'PlanningGame',
          section: 'tasks_PlanningGame',
          cardId: '-Oabc123'
        };
        const beforeData = null; // Card didn't exist before
        const afterData = {
          cardId: 'PLN-TSK-0001',
          title: 'New task',
          status: 'To Do',
          year: 2026
        };

        await handleSyncCardViews(params, beforeData, afterData, { db: mockDb, logger: mockLogger });

        expect(mockDb.ref).toHaveBeenCalledWith('/views/task-list/PlanningGame/-Oabc123');
        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
          cardId: 'PLN-TSK-0001',
          title: 'New task',
          status: 'To Do',
          firebaseId: '-Oabc123'
        }));
      });

      it('should create view entry when bug is created', async () => {
        const params = {
          projectId: 'Cinema4D',
          section: 'bugs_Cinema4D',
          cardId: '-Odef456'
        };
        const beforeData = null;
        const afterData = {
          cardId: 'C4D-BUG-0001',
          title: 'New bug',
          status: 'Created',
          priority: 'USER EXPERIENCE ISSUE'
        };

        await handleSyncCardViews(params, beforeData, afterData, { db: mockDb, logger: mockLogger });

        expect(mockDb.ref).toHaveBeenCalledWith('/views/bug-list/Cinema4D/-Odef456');
        expect(mockSet).toHaveBeenCalled();
      });

      it('should handle UPPERCASE section names from Firebase', async () => {
        const params = {
          projectId: 'Cinema4D',
          section: 'TASKS_Cinema4D',  // Firebase uses uppercase
          cardId: '-Oghi789'
        };
        const beforeData = null;
        const afterData = {
          cardId: 'C4D-TSK-0001',
          title: 'Task from uppercase section',
          status: 'To Do',
          year: 2026
        };

        await handleSyncCardViews(params, beforeData, afterData, { db: mockDb, logger: mockLogger });

        expect(mockDb.ref).toHaveBeenCalledWith('/views/task-list/Cinema4D/-Oghi789');
        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
          cardId: 'C4D-TSK-0001',
          title: 'Task from uppercase section'
        }));
      });
    });

    describe('card update', () => {
      it('should update view entry when task is updated', async () => {
        const params = {
          projectId: 'PlanningGame',
          section: 'tasks_PlanningGame',
          cardId: '-Oabc123'
        };
        const beforeData = {
          cardId: 'PLN-TSK-0001',
          title: 'Old title',
          status: 'To Do'
        };
        const afterData = {
          cardId: 'PLN-TSK-0001',
          title: 'Updated title',
          status: 'In Progress',
          developer: 'dev_001'
        };

        await handleSyncCardViews(params, beforeData, afterData, { db: mockDb, logger: mockLogger });

        expect(mockDb.ref).toHaveBeenCalledWith('/views/task-list/PlanningGame/-Oabc123');
        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Updated title',
          status: 'In Progress',
          developer: 'dev_001'
        }));
      });
    });

    describe('card deletion', () => {
      it('should remove view entry when task is deleted', async () => {
        const params = {
          projectId: 'PlanningGame',
          section: 'tasks_PlanningGame',
          cardId: '-Oabc123'
        };
        const beforeData = {
          cardId: 'PLN-TSK-0001',
          title: 'Task to delete',
          status: 'Done'
        };
        const afterData = null; // Card was deleted

        await handleSyncCardViews(params, beforeData, afterData, { db: mockDb, logger: mockLogger });

        expect(mockDb.ref).toHaveBeenCalledWith('/views/task-list/PlanningGame/-Oabc123');
        expect(mockRemove).toHaveBeenCalled();
      });
    });

    describe('ignored sections', () => {
      it('should skip epics (no view needed)', async () => {
        const params = {
          projectId: 'PlanningGame',
          section: 'epics_PlanningGame',
          cardId: '-Oabc123'
        };
        const afterData = { cardId: 'PLN-EPC-0001', title: 'Epic' };

        await handleSyncCardViews(params, null, afterData, { db: mockDb, logger: mockLogger });

        expect(mockDb.ref).not.toHaveBeenCalled();
        expect(mockSet).not.toHaveBeenCalled();
      });

      it('should skip sprints (no view needed)', async () => {
        const params = {
          projectId: 'PlanningGame',
          section: 'sprints_PlanningGame',
          cardId: '-Oabc123'
        };
        const afterData = { cardId: 'PLN-SPR-0001', title: 'Sprint' };

        await handleSyncCardViews(params, null, afterData, { db: mockDb, logger: mockLogger });

        expect(mockDb.ref).not.toHaveBeenCalled();
      });
    });
  });

  describe('getPublicViewType', () => {
    it('should map task sections to tasks', () => {
      expect(getPublicViewType('TASKS_ProjectA')).toBe('tasks');
      expect(getPublicViewType('tasks_ProjectA')).toBe('tasks');
    });

    it('should map bug sections to bugs', () => {
      expect(getPublicViewType('BUGS_ProjectA')).toBe('bugs');
      expect(getPublicViewType('bugs_Cinema4D')).toBe('bugs');
    });

    it('should map epic sections to epics', () => {
      expect(getPublicViewType('EPICS_ProjectA')).toBe('epics');
      expect(getPublicViewType('epics_PlanningGame')).toBe('epics');
    });

    it('should return null for proposals, sprints, qa', () => {
      expect(getPublicViewType('PROPOSALS_ProjectA')).toBeNull();
      expect(getPublicViewType('SPRINTS_ProjectA')).toBeNull();
      expect(getPublicViewType('QA_ProjectA')).toBeNull();
    });
  });

  describe('extractPublicViewFields', () => {
    it('should extract only whitelisted public fields', () => {
      const fullCard = {
        cardId: 'PLN-TSK-0001',
        title: 'Test task',
        status: 'In Progress',
        devPoints: 3,
        businessPoints: 4,
        startDate: '2026-01-01',
        endDate: '2026-01-15',
        priority: 9,
        sprint: 'PLN-SPR-0001',
        epic: 'PLN-PCS-0001',
        year: 2026,
        developer: 'dev_001',
        description: 'Secret description',
        notes: [{ text: 'private note' }],
        commits: [{ hash: 'abc' }]
      };

      const view = extractPublicViewFields(fullCard, '-Okey1', 'task');

      expect(view.firebaseId).toBe('-Okey1');
      expect(view.type).toBe('task');
      expect(view.cardId).toBe('PLN-TSK-0001');
      expect(view.title).toBe('Test task');
      expect(view.status).toBe('In Progress');
      expect(view.devPoints).toBe(3);
      expect(view.businessPoints).toBe(4);
      expect(view.year).toBe(2026);
      // Should NOT include sensitive fields
      expect(view.developer).toBeUndefined();
      expect(view.description).toBeUndefined();
      expect(view.notes).toBeUndefined();
      expect(view.commits).toBeUndefined();
    });

    it('should handle minimal card data', () => {
      const view = extractPublicViewFields({ cardId: 'X-TSK-0001', title: 'Min' }, '-Ok', 'task');
      expect(view.cardId).toBe('X-TSK-0001');
      expect(view.title).toBe('Min');
      expect(view.type).toBe('task');
    });
  });

  describe('PUBLIC_VIEW_FIELDS', () => {
    it('should not contain sensitive fields', () => {
      const sensitive = ['developer', 'coDeveloper', 'validator', 'description', 'notes', 'commits', 'acceptanceCriteria', 'createdBy'];
      for (const field of sensitive) {
        expect(PUBLIC_VIEW_FIELDS).not.toContain(field);
      }
    });

    it('should contain required display fields', () => {
      const required = ['cardId', 'title', 'status', 'year'];
      for (const field of required) {
        expect(PUBLIC_VIEW_FIELDS).toContain(field);
      }
    });
  });

  describe('syncPublicView', () => {
    it('should write public view when project is public', async () => {
      mockProjectData = { name: 'PlanningGame', public: true };

      await syncPublicView('PlanningGame', 'TASKS_PlanningGame', '-Okey1',
        { cardId: 'PLN-TSK-0001', title: 'Task', status: 'To Do', year: 2026 },
        mockDb, mockLogger);

      expect(mockDb.ref).toHaveBeenCalledWith('/publicViews/PlanningGame/tasks/-Okey1');
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        cardId: 'PLN-TSK-0001',
        type: 'task'
      }));
    });

    it('should write public view when project has publicToken', async () => {
      mockProjectData = { name: 'PlanningGame', publicToken: 'abc123' };

      await syncPublicView('PlanningGame', 'BUGS_PlanningGame', '-Okey2',
        { cardId: 'PLN-BUG-0001', title: 'Bug', status: 'Created', year: 2026 },
        mockDb, mockLogger);

      expect(mockDb.ref).toHaveBeenCalledWith('/publicViews/PlanningGame/bugs/-Okey2');
      expect(mockSet).toHaveBeenCalled();
    });

    it('should remove public view when project is not public', async () => {
      mockProjectData = { name: 'PrivateProject' };

      await syncPublicView('PrivateProject', 'TASKS_PrivateProject', '-Okey3',
        { cardId: 'PRI-TSK-0001', title: 'Private task', status: 'To Do' },
        mockDb, mockLogger);

      expect(mockDb.ref).toHaveBeenCalledWith('/publicViews/PrivateProject/tasks/-Okey3');
      expect(mockRemove).toHaveBeenCalled();
    });

    it('should remove public view when card is deleted', async () => {
      mockProjectData = { name: 'PlanningGame', public: true };

      await syncPublicView('PlanningGame', 'TASKS_PlanningGame', '-Okey4',
        null, mockDb, mockLogger);

      expect(mockDb.ref).toHaveBeenCalledWith('/publicViews/PlanningGame/tasks/-Okey4');
      expect(mockRemove).toHaveBeenCalled();
    });

    it('should skip proposal sections', async () => {
      mockProjectData = { name: 'PlanningGame', public: true };

      await syncPublicView('PlanningGame', 'PROPOSALS_PlanningGame', '-Okey5',
        { cardId: 'PLN-PRP-0001' }, mockDb, mockLogger);

      // Should not write to publicViews for proposals
      expect(mockDb.ref).not.toHaveBeenCalledWith(expect.stringContaining('/publicViews/'));
    });

    it('should remove public view for deleted cards with deletedAt', async () => {
      mockProjectData = { name: 'PlanningGame', public: true };

      await syncPublicView('PlanningGame', 'TASKS_PlanningGame', '-Okey6',
        { cardId: 'PLN-TSK-0099', title: 'Deleted', deletedAt: '2026-01-01' },
        mockDb, mockLogger);

      expect(mockRemove).toHaveBeenCalled();
    });
  });
});

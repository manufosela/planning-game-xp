/**
 * Tests for MCP Development Plans tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-adapter
const mockOnce = vi.fn();
const mockSet = vi.fn().mockResolvedValue();
const mockUpdate = vi.fn().mockResolvedValue();
const mockRemove = vi.fn().mockResolvedValue();
const mockPush = vi.fn();
const mockRef = vi.fn();

// Minimal Firestore mock that backs the cardId counter used by createPlan.
let firestoreCounter = 0;
const mockFirestore = {
  collection: () => ({
    doc: () => ({})
  }),
  runTransaction: async (cb) => cb({
    get: async () => ({ exists: false, data: () => ({ lastId: firestoreCounter }) }),
    set: (_ref, data) => { firestoreCounter = data.lastId; }
  })
};

vi.mock('../../mcp/firebase-adapter.js', () => ({
  getDatabase: () => ({
    ref: mockRef
  }),
  getFirestore: () => mockFirestore
}));

// Mock user
vi.mock('../../mcp/user.js', () => ({
  getMcpUserId: () => 'test@example.com',
  getMcpUser: () => ({ email: 'test@example.com', developerId: 'dev_001' }),
  isMcpUserConfigured: () => true
}));

const { listPlans, getPlan, createPlan, updatePlan, deletePlan } = await import('../../mcp/tools/plans.js');

function setupMockRef(data) {
  mockRef.mockImplementation((path) => ({
    once: vi.fn().mockResolvedValue({
      exists: () => data !== null,
      val: () => data
    }),
    set: mockSet,
    update: mockUpdate,
    remove: mockRemove,
    push: mockPush
  }));
}

describe('MCP Plans tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreCounter = 0;
  });

  describe('listPlans', () => {
    it('should return message when no plans exist', async () => {
      setupMockRef(null);
      const result = await listPlans({ projectId: 'TestProject' });
      expect(result.content[0].text).toContain('No development plans found');
    });

    it('should list plans with summary info', async () => {
      setupMockRef({
        '-plan1': {
          title: 'Plan A',
          status: 'draft',
          phases: [{ name: 'Phase 1', tasks: [{ title: 'Task 1' }] }],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
          createdBy: 'user@test.com'
        },
        '-plan2': {
          title: 'Plan B',
          status: 'accepted',
          phases: [
            { name: 'Phase 1', tasks: [{ title: 'T1' }, { title: 'T2' }] },
            { name: 'Phase 2', tasks: [{ title: 'T3' }] }
          ],
          generatedTasks: [{ cardId: 'TST-TSK-0001' }],
          createdAt: '2026-01-03T00:00:00Z',
          updatedAt: '2026-01-04T00:00:00Z',
          createdBy: 'user@test.com'
        }
      });

      const result = await listPlans({ projectId: 'TestProject' });
      const plans = JSON.parse(result.content[0].text);
      expect(plans).toHaveLength(2);

      // Draft should come first (sort order)
      expect(plans[0].status).toBe('draft');
      expect(plans[0].title).toBe('Plan A');
      expect(plans[0].phases).toBe(1);
      expect(plans[0].proposedTasks).toBe(1);
      expect(plans[0].generatedTasks).toBe(0);

      expect(plans[1].status).toBe('accepted');
      expect(plans[1].phases).toBe(2);
      expect(plans[1].proposedTasks).toBe(3);
      expect(plans[1].generatedTasks).toBe(1);
    });

    it('should filter by status', async () => {
      setupMockRef({
        '-plan1': { title: 'Draft Plan', status: 'draft', phases: [] },
        '-plan2': { title: 'Accepted Plan', status: 'accepted', phases: [] }
      });

      const result = await listPlans({ projectId: 'TestProject', status: 'accepted' });
      const plans = JSON.parse(result.content[0].text);
      expect(plans).toHaveLength(1);
      expect(plans[0].title).toBe('Accepted Plan');
    });

    it('should reject invalid status', async () => {
      setupMockRef({});
      const result = await listPlans({ projectId: 'TestProject', status: 'invalid' });
      expect(result.content[0].text).toContain('Invalid status');
    });
  });

  describe('getPlan', () => {
    it('should return plan details', async () => {
      setupMockRef({
        title: 'My Plan',
        objective: 'Build something',
        status: 'draft',
        phases: [{ name: 'Phase 1', tasks: [{ title: 'Task 1', como: 'dev', quiero: 'build', para: 'value' }] }]
      });

      const result = await getPlan({ projectId: 'TestProject', planId: '-plan1' });
      const plan = JSON.parse(result.content[0].text);
      expect(plan.planId).toBe('-plan1');
      expect(plan.title).toBe('My Plan');
      expect(plan.phases).toHaveLength(1);
      expect(plan.phases[0].tasks[0].title).toBe('Task 1');
    });

    it('should return not found message', async () => {
      setupMockRef(null);
      const result = await getPlan({ projectId: 'TestProject', planId: '-nonexistent' });
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('createPlan', () => {
    it('should create a plan with phases and tasks', async () => {
      const pushKey = '-newPlanKey';
      mockPush.mockReturnValue({
        key: pushKey,
        set: mockSet
      });

      mockRef.mockImplementation((path) => {
        if (path === 'projects/TestProject/abbreviation') {
          return { once: vi.fn().mockResolvedValue({ exists: () => true, val: () => 'TST' }) };
        }
        if (path.startsWith('projects/')) {
          return {
            once: vi.fn().mockResolvedValue({ exists: () => true, val: () => ({ name: 'Test', abbreviation: 'TST' }) })
          };
        }
        return {
          push: () => ({
            key: pushKey,
            set: mockSet
          })
        };
      });

      const result = await createPlan({
        projectId: 'TestProject',
        title: 'New Plan',
        objective: 'Test objective',
        phases: [
          {
            name: 'Phase 1',
            description: 'First phase',
            tasks: [
              { title: 'Task A', como: 'dev', quiero: 'build', para: 'value' },
              { title: 'Task B', como: 'user', quiero: 'use', para: 'benefit' }
            ]
          }
        ]
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('created successfully');
      expect(data.planId).toBe(pushKey);
      expect(data.status).toBe('draft');
      expect(data.phases).toBe(1);
      expect(data.totalTasks).toBe(2);

      // Verify set was called with correct data
      expect(mockSet).toHaveBeenCalledTimes(1);
      const savedData = mockSet.mock.calls[0][0];
      expect(savedData.title).toBe('New Plan');
      expect(savedData.status).toBe('draft');
      expect(savedData.phases[0].tasks).toHaveLength(2);
      expect(savedData.createdBy).toBe('test@example.com');
    });

    it('should throw error for empty title', async () => {
      await expect(createPlan({ projectId: 'TestProject', title: '' }))
        .rejects.toThrow('title is required');
    });

    it('should throw error for non-existent project', async () => {
      mockRef.mockImplementation(() => ({
        once: vi.fn().mockResolvedValue({ exists: () => false })
      }));

      await expect(createPlan({ projectId: 'NonExistent', title: 'Plan' }))
        .rejects.toThrow('not found');
    });

    it('should truncate long titles', async () => {
      mockRef.mockImplementation((path) => {
        if (path === 'projects/TestProject/abbreviation') {
          return { once: vi.fn().mockResolvedValue({ exists: () => true, val: () => 'TST' }) };
        }
        if (path.startsWith('projects/')) {
          return { once: vi.fn().mockResolvedValue({ exists: () => true, val: () => ({ abbreviation: 'TST' }) }) };
        }
        return { push: () => ({ key: '-key', set: mockSet }) };
      });

      const longTitle = 'A'.repeat(200);
      await createPlan({ projectId: 'TestProject', title: longTitle });

      const savedData = mockSet.mock.calls[0][0];
      expect(savedData.title.length).toBe(150);
    });
  });

  describe('updatePlan', () => {
    it('should update plan fields', async () => {
      mockRef.mockImplementation(() => ({
        once: vi.fn().mockResolvedValue({
          exists: () => true,
          val: () => ({ title: 'Old', status: 'draft' })
        }),
        update: mockUpdate
      }));

      const result = await updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: { title: 'New Title', status: 'accepted' }
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('updated successfully');
      expect(mockUpdate).toHaveBeenCalledTimes(1);

      const updatedData = mockUpdate.mock.calls[0][0];
      expect(updatedData.title).toBe('New Title');
      expect(updatedData.status).toBe('accepted');
      expect(updatedData.updatedAt).toBeDefined();
    });

    it('should throw error for non-existent plan', async () => {
      mockRef.mockImplementation(() => ({
        once: vi.fn().mockResolvedValue({ exists: () => false })
      }));

      await expect(updatePlan({
        projectId: 'TestProject',
        planId: '-nonexistent',
        updates: { title: 'New' }
      })).rejects.toThrow('not found');
    });

    it('should reject invalid status', async () => {
      mockRef.mockImplementation(() => ({
        once: vi.fn().mockResolvedValue({ exists: () => true, val: () => ({}) })
      }));

      await expect(updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: { status: 'invalid' }
      })).rejects.toThrow('Invalid status');
    });

    it('should protect createdAt and generatedTasks fields', async () => {
      mockRef.mockImplementation(() => ({
        once: vi.fn().mockResolvedValue({
          exists: () => true,
          val: () => ({ title: 'Plan', createdAt: '2026-01-01' })
        }),
        update: mockUpdate
      }));

      await updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: { title: 'Updated', createdAt: 'hacked', generatedTasks: [] }
      });

      const updatedData = mockUpdate.mock.calls[0][0];
      expect(updatedData.createdAt).toBeUndefined();
      expect(updatedData.generatedTasks).toBeUndefined();
      expect(updatedData.title).toBe('Updated');
    });
  });

  describe('deletePlan', () => {
    it('should move plan to trash', async () => {
      const planData = { title: 'To Delete', status: 'draft' };
      const refCalls = {};

      mockRef.mockImplementation((path) => {
        refCalls[path] = true;
        if (path.includes('plans-trash/')) {
          return { set: mockSet };
        }
        return {
          once: vi.fn().mockResolvedValue({
            exists: () => true,
            val: () => planData
          }),
          remove: mockRemove
        };
      });

      const result = await deletePlan({ projectId: 'TestProject', planId: '-plan1' });
      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('deleted');
      expect(data.title).toBe('To Delete');

      // Verify trash write and original removal
      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(mockRemove).toHaveBeenCalledTimes(1);

      const trashData = mockSet.mock.calls[0][0];
      expect(trashData.deletedAt).toBeDefined();
      expect(trashData.deletedBy).toBe('test@example.com');
    });

    it('should throw error for non-existent plan', async () => {
      mockRef.mockImplementation(() => ({
        once: vi.fn().mockResolvedValue({ exists: () => false })
      }));

      await expect(deletePlan({ projectId: 'TestProject', planId: '-nonexistent' }))
        .rejects.toThrow('not found');
    });
  });
});

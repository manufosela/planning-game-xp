import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetMockData,
  setMockRtdbData,
  getMockRtdbData
} from './__mocks__/firebase.js';
import { vi } from 'vitest';

// Mock the firebase module before importing
vi.mock('../firebase-adapter.js', async () => {
  const mock = await import('./__mocks__/firebase.js');
  return {
    getDatabase: mock.getDatabase,
    getFirestore: mock.getFirestore
  };
});

// Mock the user module
let mockMcpUser = null;
vi.mock('../user.js', () => ({
  getMcpUser: () => mockMcpUser,
  getMcpUserId: () => mockMcpUser?.email || 'geniova-mcp'
}));

const {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan
} = await import('../tools/plans.js');

describe('plans.js', () => {
  beforeEach(() => {
    resetMockData();
    mockMcpUser = null;
  });

  describe('listPlans', () => {
    it('should return empty message when no plans exist', async () => {
      const result = await listPlans({ projectId: 'TestProject' });
      expect(result.content[0].text).toContain('No development plans found');
    });

    it('should list all plans sorted by status then date', async () => {
      setMockRtdbData('/plans/TestProject', {
        '-plan1': { title: 'Accepted plan', status: 'accepted', phases: [], updatedAt: '2026-01-02' },
        '-plan2': { title: 'Draft plan', status: 'draft', phases: [], updatedAt: '2026-01-04' },
        '-plan3': { title: 'Rejected plan', status: 'rejected', phases: [], updatedAt: '2026-01-06' }
      });

      const result = await listPlans({ projectId: 'TestProject' });
      const plans = JSON.parse(result.content[0].text);

      expect(plans).toHaveLength(3);
      expect(plans[0].status).toBe('draft');
      expect(plans[1].status).toBe('accepted');
      expect(plans[2].status).toBe('rejected');
    });

    it('should filter by status', async () => {
      setMockRtdbData('/plans/TestProject', {
        '-plan1': { title: 'Draft', status: 'draft', phases: [] },
        '-plan2': { title: 'Accepted', status: 'accepted', phases: [] }
      });

      const result = await listPlans({ projectId: 'TestProject', status: 'draft' });
      const plans = JSON.parse(result.content[0].text);

      expect(plans).toHaveLength(1);
      expect(plans[0].title).toBe('Draft');
    });

    it('should return error for invalid status filter', async () => {
      setMockRtdbData('/plans/TestProject', {
        '-plan1': { title: 'Test', status: 'draft', phases: [] }
      });

      const result = await listPlans({ projectId: 'TestProject', status: 'invalid' });
      expect(result.content[0].text).toContain('Invalid status');
    });

    it('should include phase and task counts in summary', async () => {
      setMockRtdbData('/plans/TestProject', {
        '-plan1': {
          title: 'Plan with phases',
          status: 'draft',
          phases: [
            { name: 'Phase 1', tasks: [{ title: 'T1' }, { title: 'T2' }] },
            { name: 'Phase 2', tasks: [{ title: 'T3' }] }
          ],
          generatedTasks: [{ cardId: 'TST-TSK-0001' }]
        }
      });

      const result = await listPlans({ projectId: 'TestProject' });
      const plans = JSON.parse(result.content[0].text);

      expect(plans[0].phases).toBe(2);
      expect(plans[0].proposedTasks).toBe(3);
      expect(plans[0].generatedTasks).toBe(1);
    });
  });

  describe('getPlan', () => {
    it('should return plan details', async () => {
      setMockRtdbData('/plans/TestProject/-plan1', {
        title: 'My Plan',
        objective: 'Build something',
        status: 'draft',
        phases: [],
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'test@example.com'
      });

      const result = await getPlan({ projectId: 'TestProject', planId: '-plan1' });
      const plan = JSON.parse(result.content[0].text);

      expect(plan.planId).toBe('-plan1');
      expect(plan.title).toBe('My Plan');
      expect(plan.objective).toBe('Build something');
    });

    it('should return not found message for non-existent plan', async () => {
      const result = await getPlan({ projectId: 'TestProject', planId: '-nonexistent' });
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('createPlan', () => {
    beforeEach(() => {
      setMockRtdbData('/projects/TestProject', { name: 'Test Project', abbreviation: 'TST' });
    });

    it('should create a plan with title and objective', async () => {
      const result = await createPlan({
        projectId: 'TestProject',
        title: 'New Plan',
        objective: 'Build a new feature'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('created successfully');
      expect(response.title).toBe('New Plan');
      expect(response.status).toBe('draft');
      expect(response.planId).toBeTruthy();
      expect(response.proposalId).toBeNull();
    });

    it('should create a plan with phases and tasks', async () => {
      const result = await createPlan({
        projectId: 'TestProject',
        title: 'Phased Plan',
        phases: [
          {
            name: 'Phase 1',
            description: 'First phase',
            tasks: [
              { title: 'Task A', como: 'developer', quiero: 'build X', para: 'deliver value' },
              { title: 'Task B' }
            ]
          },
          {
            name: 'Phase 2',
            tasks: []
          }
        ]
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.phases).toBe(2);
      expect(response.totalTasks).toBe(2);
    });

    it('should throw error for empty title', async () => {
      await expect(
        createPlan({ projectId: 'TestProject', title: '' })
      ).rejects.toThrow('title is required');
    });

    it('should throw error for non-existent project', async () => {
      await expect(
        createPlan({ projectId: 'NonExistent', title: 'Test' })
      ).rejects.toThrow('not found');
    });

    it('should truncate long title to 150 chars', async () => {
      const longTitle = 'A'.repeat(200);
      const result = await createPlan({
        projectId: 'TestProject',
        title: longTitle
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.title.length).toBe(150);
    });

    // ── proposalId tests ──

    it('should create a plan linked to a proposal via proposalId', async () => {
      setMockRtdbData('/planProposals/TestProject/-prop1', {
        title: 'Feature Request',
        status: 'pending',
        planIds: [],
        createdAt: '2026-01-01T00:00:00Z'
      });

      const result = await createPlan({
        projectId: 'TestProject',
        title: 'Implementation Plan',
        proposalId: '-prop1'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.proposalId).toBe('-prop1');
      expect(response.message).toContain('created successfully');
    });

    // ── proposalCardId tests (unified flow, PLN-TSK-0357) ──

    it('creates a plan linked to a proposal CARD and marks it convertedToPlan', async () => {
      setMockRtdbData('/cards/TestProject/PROPOSALS_TestProject/-cardKey1', {
        cardId: 'TST-PRP-0001',
        cardType: 'proposal-card',
        title: 'Idea desde la pestaña Proposals',
        status: 'To Do'
      });

      const result = await createPlan({
        projectId: 'TestProject',
        title: 'Plan desde proposal card',
        proposalCardId: 'TST-PRP-0001'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('created successfully');
      expect(response.proposalCardId).toBe('TST-PRP-0001');

      // The source card gets traceability back to the plan.
      const { getDatabase } = await import('./__mocks__/firebase.js');
      const db = getDatabase();
      const cardSnap = await db.ref('/cards/TestProject/PROPOSALS_TestProject/-cardKey1').once('value');
      const card = cardSnap.val();
      expect(card.convertedToPlan).toBe(response.cardId);
      expect(card.updatedAt).toBeTruthy();
    });

    it('rejects a proposalCardId that does not exist', async () => {
      await expect(createPlan({
        projectId: 'TestProject',
        title: 'Plan huérfano',
        proposalCardId: 'TST-PRP-9999'
      })).rejects.toThrow(/Proposal card "TST-PRP-9999" not found/);
    });

    it('should auto-update proposal planIds when creating plan with proposalId', async () => {
      setMockRtdbData('/planProposals/TestProject/-prop1', {
        title: 'Feature Request',
        status: 'pending',
        planIds: [],
        createdAt: '2026-01-01T00:00:00Z'
      });

      const result = await createPlan({
        projectId: 'TestProject',
        title: 'Linked Plan',
        proposalId: '-prop1'
      });

      const response = JSON.parse(result.content[0].text);
      const planId = response.planId;

      // Verify the proposal was updated with the new planId
      const { getDatabase } = await import('./__mocks__/firebase.js');
      const db = getDatabase();
      const proposalSnap = await db.ref(`planProposals/TestProject/-prop1`).once('value');
      const proposal = proposalSnap.val();

      expect(proposal.planIds).toContain(planId);
      expect(proposal.updatedAt).toBeTruthy();
      expect(proposal.updatedBy).toBeTruthy();
    });

    it('should append to existing planIds when proposal already has plans', async () => {
      setMockRtdbData('/planProposals/TestProject/-prop1', {
        title: 'Feature Request',
        status: 'planned',
        planIds: ['-existing-plan-1'],
        createdAt: '2026-01-01T00:00:00Z'
      });

      const result = await createPlan({
        projectId: 'TestProject',
        title: 'Second Plan',
        proposalId: '-prop1'
      });

      const response = JSON.parse(result.content[0].text);
      const planId = response.planId;

      const { getDatabase } = await import('./__mocks__/firebase.js');
      const db = getDatabase();
      const proposalSnap = await db.ref(`planProposals/TestProject/-prop1`).once('value');
      const proposal = proposalSnap.val();

      expect(proposal.planIds).toContain('-existing-plan-1');
      expect(proposal.planIds).toContain(planId);
      expect(proposal.planIds).toHaveLength(2);
    });

    it('should throw error for non-existent proposalId', async () => {
      await expect(
        createPlan({
          projectId: 'TestProject',
          title: 'Plan with bad proposal',
          proposalId: '-nonexistent'
        })
      ).rejects.toThrow('Plan proposal "-nonexistent" not found');
    });

    it('should create plan without proposalId (null in response)', async () => {
      const result = await createPlan({
        projectId: 'TestProject',
        title: 'Standalone Plan'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.proposalId).toBeNull();
    });
  });

  describe('updatePlan', () => {
    beforeEach(() => {
      setMockRtdbData('/plans/TestProject/-plan1', {
        title: 'Original Plan',
        objective: 'Original objective',
        status: 'draft',
        phases: [],
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'test@example.com'
      });
    });

    it('should update title and objective', async () => {
      const result = await updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: { title: 'Updated Plan', objective: 'New objective' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('updated successfully');
      expect(response.updatedFields).toContain('title');
      expect(response.updatedFields).toContain('objective');
    });

    it('should update status to accepted', async () => {
      const result = await updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: { status: 'accepted' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).toContain('status');
    });

    it('should reject invalid status', async () => {
      await expect(
        updatePlan({
          projectId: 'TestProject',
          planId: '-plan1',
          updates: { status: 'invalid' }
        })
      ).rejects.toThrow('Invalid status');
    });

    it('should protect createdAt, createdBy, and generatedTasks', async () => {
      const result = await updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: { createdAt: 'hacked', createdBy: 'hacker', generatedTasks: [], title: 'Safe' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).not.toContain('createdAt');
      expect(response.updatedFields).not.toContain('createdBy');
      expect(response.updatedFields).not.toContain('generatedTasks');
      expect(response.updatedFields).toContain('title');
    });

    it('should throw error for non-existent plan', async () => {
      await expect(
        updatePlan({
          projectId: 'TestProject',
          planId: '-nonexistent',
          updates: { title: 'Test' }
        })
      ).rejects.toThrow('not found');
    });

    it('should update phases with validation', async () => {
      const result = await updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: {
          phases: [{
            name: 'New Phase',
            description: 'Description',
            tasks: [{ title: 'New Task', como: 'dev', quiero: 'build', para: 'value' }]
          }]
        }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).toContain('phases');
    });

    it('should normalize status to lowercase', async () => {
      const result = await updatePlan({
        projectId: 'TestProject',
        planId: '-plan1',
        updates: { status: 'Accepted' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).toContain('status');
    });
  });

  describe('deletePlan', () => {
    it('should delete plan and move to trash', async () => {
      setMockRtdbData('/plans/TestProject/-plan1', {
        title: 'Plan to Delete',
        status: 'rejected',
        phases: [],
        createdAt: '2026-01-01T00:00:00Z'
      });

      const result = await deletePlan({ projectId: 'TestProject', planId: '-plan1' });
      const response = JSON.parse(result.content[0].text);

      expect(response.message).toContain('deleted');
      expect(response.title).toBe('Plan to Delete');
    });

    it('should throw error for non-existent plan', async () => {
      await expect(
        deletePlan({ projectId: 'TestProject', planId: '-nonexistent' })
      ).rejects.toThrow('not found');
    });
  });

  // ── Human-readable cardId (PMC-BUG-0003) ──

  describe('cardId generation and resolution', () => {
    beforeEach(() => {
      setMockRtdbData('/projects/TestProject', { name: 'Test Project', abbreviation: 'TST' });
    });

    it('createPlan returns a cardId in the form ABBR-PLA-NNNN', async () => {
      const result = await createPlan({ projectId: 'TestProject', title: 'First plan' });
      const response = JSON.parse(result.content[0].text);
      expect(response.cardId).toMatch(/^TST-PLA-\d{4}$/);
    });

    it('createPlan increments the counter on consecutive calls', async () => {
      const first = JSON.parse(
        (await createPlan({ projectId: 'TestProject', title: 'A' })).content[0].text
      );
      const second = JSON.parse(
        (await createPlan({ projectId: 'TestProject', title: 'B' })).content[0].text
      );
      expect(first.cardId).toBe('TST-PLA-0001');
      expect(second.cardId).toBe('TST-PLA-0002');
    });

    it('createPlan throws when project has no abbreviation', async () => {
      setMockRtdbData('/projects/NoAbbrProject', { name: 'No Abbr' });
      await expect(
        createPlan({ projectId: 'NoAbbrProject', title: 'X' })
      ).rejects.toThrow('abbreviation');
    });

    it('listPlans includes cardId in the summary (null when missing)', async () => {
      setMockRtdbData('/plans/TestProject', {
        '-plan1': { cardId: 'TST-PLA-0001', title: 'New plan', status: 'draft', phases: [] },
        '-plan2': { title: 'Legacy plan', status: 'draft', phases: [] }
      });
      const result = await listPlans({ projectId: 'TestProject' });
      const plans = JSON.parse(result.content[0].text);
      const byTitle = Object.fromEntries(plans.map(p => [p.title, p.cardId]));
      expect(byTitle['New plan']).toBe('TST-PLA-0001');
      expect(byTitle['Legacy plan']).toBeNull();
    });

    it('getPlan resolves by cardId', async () => {
      setMockRtdbData('/plans/TestProject/-internal-key-123', {
        cardId: 'TST-PLA-0007',
        title: 'Lookup by cardId',
        status: 'draft',
        phases: []
      });
      const result = await getPlan({ projectId: 'TestProject', planId: 'TST-PLA-0007' });
      const plan = JSON.parse(result.content[0].text);
      expect(plan.title).toBe('Lookup by cardId');
      expect(plan.planId).toBe('-internal-key-123');
      expect(plan.cardId).toBe('TST-PLA-0007');
    });

    it('getPlan still resolves by Firebase push key (backwards compatible)', async () => {
      setMockRtdbData('/plans/TestProject/-key', {
        title: 'Legacy',
        status: 'draft',
        phases: []
      });
      const result = await getPlan({ projectId: 'TestProject', planId: '-key' });
      const plan = JSON.parse(result.content[0].text);
      expect(plan.title).toBe('Legacy');
      expect(plan.planId).toBe('-key');
    });

    it('updatePlan accepts a cardId and refuses to overwrite it', async () => {
      setMockRtdbData('/plans/TestProject/-key', {
        cardId: 'TST-PLA-0042',
        title: 'Original',
        status: 'draft',
        phases: [],
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'test'
      });
      const result = await updatePlan({
        projectId: 'TestProject',
        planId: 'TST-PLA-0042',
        updates: { title: 'Updated', cardId: 'TST-PLA-9999' }
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).toContain('title');
      expect(response.updatedFields).not.toContain('cardId');
      const stored = getMockRtdbData('/plans/TestProject/-key');
      expect(stored.cardId).toBe('TST-PLA-0042');
      expect(stored.title).toBe('Updated');
    });

    it('deletePlan accepts a cardId', async () => {
      setMockRtdbData('/plans/TestProject/-key', {
        cardId: 'TST-PLA-0008',
        title: 'Doomed',
        status: 'rejected',
        phases: []
      });
      const result = await deletePlan({ projectId: 'TestProject', planId: 'TST-PLA-0008' });
      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('TST-PLA-0008');
      expect(response.planId).toBe('-key');
    });
  });
});

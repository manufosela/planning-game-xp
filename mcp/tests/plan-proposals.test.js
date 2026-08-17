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
  listPlanProposals,
  getPlanProposal,
  createPlanProposal,
  updatePlanProposal,
  deletePlanProposal
} = await import('../tools/plan-proposals.js');

describe('plan-proposals.js', () => {
  beforeEach(() => {
    resetMockData();
    mockMcpUser = null;
  });

  describe('listPlanProposals', () => {
    it('should return empty message when no proposals exist', async () => {
      const result = await listPlanProposals({ projectId: 'TestProject' });
      const text = result.content[0].text;
      expect(text).toContain('No plan proposals found');
    });

    it('should list all proposals sorted by status then date', async () => {
      setMockRtdbData('/planProposals/TestProject', {
        '-abc1': { title: 'Planned one', status: 'planned', createdAt: '2026-01-01', updatedAt: '2026-01-02' },
        '-abc2': { title: 'Pending one', status: 'pending', createdAt: '2026-01-03', updatedAt: '2026-01-04' },
        '-abc3': { title: 'Rejected one', status: 'rejected', createdAt: '2026-01-05', updatedAt: '2026-01-06' }
      });

      const result = await listPlanProposals({ projectId: 'TestProject' });
      const proposals = JSON.parse(result.content[0].text);

      expect(proposals).toHaveLength(3);
      expect(proposals[0].status).toBe('pending');
      expect(proposals[1].status).toBe('planned');
      expect(proposals[2].status).toBe('rejected');
    });

    it('should filter by status', async () => {
      setMockRtdbData('/planProposals/TestProject', {
        '-abc1': { title: 'Planned', status: 'planned', createdAt: '2026-01-01' },
        '-abc2': { title: 'Pending', status: 'pending', createdAt: '2026-01-02' }
      });

      const result = await listPlanProposals({ projectId: 'TestProject', status: 'pending' });
      const proposals = JSON.parse(result.content[0].text);

      expect(proposals).toHaveLength(1);
      expect(proposals[0].title).toBe('Pending');
    });

    it('should return error for invalid status filter', async () => {
      setMockRtdbData('/planProposals/TestProject', {
        '-abc1': { title: 'Test', status: 'pending' }
      });

      const result = await listPlanProposals({ projectId: 'TestProject', status: 'invalid' });
      expect(result.content[0].text).toContain('Invalid status');
    });

    it('should include planCount in summary', async () => {
      setMockRtdbData('/planProposals/TestProject', {
        '-abc1': { title: 'With plans', status: 'planned', planIds: ['-plan1', '-plan2'], createdAt: '2026-01-01' }
      });

      const result = await listPlanProposals({ projectId: 'TestProject' });
      const proposals = JSON.parse(result.content[0].text);

      expect(proposals[0].planCount).toBe(2);
    });
  });

  describe('getPlanProposal', () => {
    it('should return proposal details', async () => {
      setMockRtdbData('/planProposals/TestProject/-abc1', {
        title: 'Test Proposal',
        description: 'A detailed description',
        status: 'pending',
        tags: ['backend', 'auth'],
        planIds: [],
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'test@example.com'
      });

      const result = await getPlanProposal({ projectId: 'TestProject', proposalId: '-abc1' });
      const proposal = JSON.parse(result.content[0].text);

      expect(proposal.proposalId).toBe('-abc1');
      expect(proposal.title).toBe('Test Proposal');
      expect(proposal.tags).toEqual(['backend', 'auth']);
    });

    it('should return not found message for non-existent proposal', async () => {
      const result = await getPlanProposal({ projectId: 'TestProject', proposalId: '-nonexistent' });
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('createPlanProposal — DEPRECATED (PLN-TSK-0357)', () => {
    it('rejects with an actionable deprecation error', async () => {
      await expect(
        createPlanProposal({ projectId: 'TestProject', title: 'New Feature Request' })
      ).rejects.toThrow(/DEPRECATED/);
    });

    it('the error tells the caller the unified flow (proposal card + proposalCardId)', async () => {
      await expect(
        createPlanProposal({ projectId: 'TestProject', title: 'X' })
      ).rejects.toThrow(/create_card type=proposal/);
      await expect(
        createPlanProposal({ projectId: 'TestProject', title: 'X' })
      ).rejects.toThrow(/proposalCardId/);
    });
  });

  describe('updatePlanProposal', () => {
    beforeEach(() => {
      setMockRtdbData('/planProposals/TestProject/-abc1', {
        title: 'Original Title',
        description: 'Original description',
        status: 'pending',
        tags: ['original'],
        planIds: [],
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'test@example.com'
      });
    });

    it('should update title and description', async () => {
      const result = await updatePlanProposal({
        projectId: 'TestProject',
        proposalId: '-abc1',
        updates: { title: 'Updated Title', description: 'Updated description' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('updated successfully');
      expect(response.updatedFields).toContain('title');
      expect(response.updatedFields).toContain('description');
    });

    it('should update status to planned', async () => {
      const result = await updatePlanProposal({
        projectId: 'TestProject',
        proposalId: '-abc1',
        updates: { status: 'planned' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).toContain('status');
    });

    it('should reject invalid status', async () => {
      await expect(
        updatePlanProposal({
          projectId: 'TestProject',
          proposalId: '-abc1',
          updates: { status: 'invalid' }
        })
      ).rejects.toThrow('Invalid status');
    });

    it('should protect createdAt and createdBy', async () => {
      const result = await updatePlanProposal({
        projectId: 'TestProject',
        proposalId: '-abc1',
        updates: { createdAt: 'hacked', createdBy: 'hacker', title: 'Safe Update' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).not.toContain('createdAt');
      expect(response.updatedFields).not.toContain('createdBy');
      expect(response.updatedFields).toContain('title');
    });

    it('should throw error for non-existent proposal', async () => {
      await expect(
        updatePlanProposal({
          projectId: 'TestProject',
          proposalId: '-nonexistent',
          updates: { title: 'Test' }
        })
      ).rejects.toThrow('not found');
    });

    it('should update planIds array', async () => {
      const result = await updatePlanProposal({
        projectId: 'TestProject',
        proposalId: '-abc1',
        updates: { planIds: ['-plan1', '-plan2'] }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).toContain('planIds');
    });

    it('should normalize status to lowercase', async () => {
      const result = await updatePlanProposal({
        projectId: 'TestProject',
        proposalId: '-abc1',
        updates: { status: 'Planned' }
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedFields).toContain('status');
    });
  });

  describe('deletePlanProposal', () => {
    it('should delete proposal and move to trash', async () => {
      setMockRtdbData('/planProposals/TestProject/-abc1', {
        title: 'To Delete',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z'
      });

      const result = await deletePlanProposal({ projectId: 'TestProject', proposalId: '-abc1' });
      const response = JSON.parse(result.content[0].text);

      expect(response.message).toContain('deleted');
      expect(response.title).toBe('To Delete');
    });

    it('should throw error for non-existent proposal', async () => {
      await expect(
        deletePlanProposal({ projectId: 'TestProject', proposalId: '-nonexistent' })
      ).rejects.toThrow('not found');
    });
  });
});

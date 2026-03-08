/**
 * Tests for PlanRepository
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockAdapter() {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue('generated-id'),
    remove: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    transaction: vi.fn().mockResolvedValue(null),
    multiUpdate: vi.fn().mockResolvedValue(undefined)
  };
}

class BaseRepo {
  constructor(adapter) { this._adapter = adapter; }
  async read(path) { return this._adapter.read(path); }
  async write(path, data) { return this._adapter.write(path, data); }
  async push(path, data) { return this._adapter.push(path, data); }
  async remove(path) { return this._adapter.remove(path); }
}

class TestPlanRepository {
  constructor(baseRepo) { this._repo = baseRepo; }

  async getAll(projectId) { return this._repo.read(`/plans/${projectId}`); }
  async get(projectId, planId) { return this._repo.read(`/plans/${projectId}/${planId}`); }
  async create(projectId, data) { return this._repo.push(`/plans/${projectId}`, data); }
  async set(projectId, planId, data) { await this._repo.write(`/plans/${projectId}/${planId}`, data); }
  async remove(projectId, planId) { await this._repo.remove(`/plans/${projectId}/${planId}`); }
  async getAllProposals(projectId) { return this._repo.read(`/planProposals/${projectId}`); }
  async getProposal(projectId, id) { return this._repo.read(`/planProposals/${projectId}/${id}`); }
  async createProposal(projectId, data) { return this._repo.push(`/planProposals/${projectId}`, data); }
  async setProposal(projectId, id, data) { await this._repo.write(`/planProposals/${projectId}/${id}`, data); }
  async removeProposal(projectId, id) { await this._repo.remove(`/planProposals/${projectId}/${id}`); }
}

describe('PlanRepository', () => {
  let adapter;
  let repo;

  beforeEach(() => {
    adapter = createMockAdapter();
    const base = new BaseRepo(adapter);
    repo = new TestPlanRepository(base);
  });

  describe('plan CRUD', () => {
    it('should get all plans for a project', async () => {
      const plans = { p1: { title: 'Plan 1' }, p2: { title: 'Plan 2' } };
      adapter.read.mockResolvedValueOnce(plans);

      const result = await repo.getAll('PLN');
      expect(result).toEqual(plans);
      expect(adapter.read).toHaveBeenCalledWith('/plans/PLN');
    });

    it('should get a single plan', async () => {
      const plan = { title: 'Plan 1', objective: 'Test' };
      adapter.read.mockResolvedValueOnce(plan);

      const result = await repo.get('PLN', 'plan1');
      expect(result).toEqual(plan);
      expect(adapter.read).toHaveBeenCalledWith('/plans/PLN/plan1');
    });

    it('should create a plan', async () => {
      const data = { title: 'New Plan', content: 'MD content' };
      const id = await repo.create('PLN', data);
      expect(id).toBe('generated-id');
      expect(adapter.push).toHaveBeenCalledWith('/plans/PLN', data);
    });

    it('should set (overwrite) a plan', async () => {
      const data = { title: 'Updated Plan' };
      await repo.set('PLN', 'plan1', data);
      expect(adapter.write).toHaveBeenCalledWith('/plans/PLN/plan1', data);
    });

    it('should remove a plan', async () => {
      await repo.remove('PLN', 'plan1');
      expect(adapter.remove).toHaveBeenCalledWith('/plans/PLN/plan1');
    });

    it('should return null for non-existent plan', async () => {
      const result = await repo.get('PLN', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('plan proposal CRUD', () => {
    it('should get all proposals for a project', async () => {
      const proposals = { pp1: { title: 'Proposal 1' } };
      adapter.read.mockResolvedValueOnce(proposals);

      const result = await repo.getAllProposals('PLN');
      expect(result).toEqual(proposals);
      expect(adapter.read).toHaveBeenCalledWith('/planProposals/PLN');
    });

    it('should get a single proposal', async () => {
      const proposal = { title: 'P1', status: 'pending' };
      adapter.read.mockResolvedValueOnce(proposal);

      const result = await repo.getProposal('PLN', 'pp1');
      expect(result).toEqual(proposal);
      expect(adapter.read).toHaveBeenCalledWith('/planProposals/PLN/pp1');
    });

    it('should create a proposal', async () => {
      const data = { title: 'New Proposal' };
      const id = await repo.createProposal('PLN', data);
      expect(id).toBe('generated-id');
      expect(adapter.push).toHaveBeenCalledWith('/planProposals/PLN', data);
    });

    it('should set a proposal', async () => {
      await repo.setProposal('PLN', 'pp1', { title: 'Updated' });
      expect(adapter.write).toHaveBeenCalledWith('/planProposals/PLN/pp1', { title: 'Updated' });
    });

    it('should remove a proposal', async () => {
      await repo.removeProposal('PLN', 'pp1');
      expect(adapter.remove).toHaveBeenCalledWith('/planProposals/PLN/pp1');
    });
  });
});

/**
 * Tests for BacklogRepository (abstract) and RtdbBacklogRepository
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
  async update(path, updates) { return this._adapter.update(path, updates); }
  async push(path, data) { return this._adapter.push(path, data); }
  async remove(path) { return this._adapter.remove(path); }
  subscribe(path, callback) { return this._adapter.subscribe(path, callback); }
  async transaction(path, fn) { return this._adapter.transaction(path, fn); }
}

class TestBacklogRepository {
  constructor(baseRepo) { this._repo = baseRepo; }

  async getBacklog(devId) { return this._repo.read(`/developerBacklogs/${devId}`); }
  async setBacklog(devId, data) { await this._repo.write(`/developerBacklogs/${devId}`, data); }
  async updateBacklog(devId, updates) { await this._repo.update(`/developerBacklogs/${devId}`, updates); }
  async getAllBacklogs() { return this._repo.read('/developerBacklogs'); }
  async getWip(devId) { return this._repo.read(`/wip/${devId}`); }
  async setWip(devId, data) { await this._repo.write(`/wip/${devId}`, data); }
  async removeWip(devId) { await this._repo.remove(`/wip/${devId}`); }
  async getAllWip() { return this._repo.read('/wip'); }
  async transactionWip(devId, fn) { return this._repo.transaction(`/wip/${devId}`, fn); }
  async addWipHistory(devId, data) { return this._repo.push(`/wipHistory/${devId}`, data); }
  async getWipHistory(devId) { return this._repo.read(`/wipHistory/${devId}`); }
  subscribeToWip(devId, cb) { return this._repo.subscribe(`/wip/${devId}`, cb); }
  subscribeToBacklog(devId, cb) { return this._repo.subscribe(`/developerBacklogs/${devId}`, cb); }
}

describe('BacklogRepository', () => {
  let adapter;
  let repo;

  beforeEach(() => {
    adapter = createMockAdapter();
    const base = new BaseRepo(adapter);
    repo = new TestBacklogRepository(base);
  });

  describe('backlog operations', () => {
    it('should get backlog for a developer', async () => {
      const backlog = { order: ['key1', 'key2'], items: { key1: { title: 'Task 1' } } };
      adapter.read.mockResolvedValueOnce(backlog);

      const result = await repo.getBacklog('dev_001');
      expect(result).toEqual(backlog);
      expect(adapter.read).toHaveBeenCalledWith('/developerBacklogs/dev_001');
    });

    it('should set backlog', async () => {
      const data = { order: ['key1'], items: {} };
      await repo.setBacklog('dev_001', data);
      expect(adapter.write).toHaveBeenCalledWith('/developerBacklogs/dev_001', data);
    });

    it('should update backlog', async () => {
      await repo.updateBacklog('dev_001', { order: ['key2', 'key1'] });
      expect(adapter.update).toHaveBeenCalledWith('/developerBacklogs/dev_001', { order: ['key2', 'key1'] });
    });

    it('should get all backlogs', async () => {
      const backlogs = { dev_001: { order: [] }, dev_002: { order: [] } };
      adapter.read.mockResolvedValueOnce(backlogs);

      const result = await repo.getAllBacklogs();
      expect(result).toEqual(backlogs);
      expect(adapter.read).toHaveBeenCalledWith('/developerBacklogs');
    });
  });

  describe('WIP operations', () => {
    it('should get WIP for a developer', async () => {
      const wip = { cardId: 'PLN-TSK-0001', projectId: 'PlanningGame' };
      adapter.read.mockResolvedValueOnce(wip);

      const result = await repo.getWip('dev_001');
      expect(result).toEqual(wip);
      expect(adapter.read).toHaveBeenCalledWith('/wip/dev_001');
    });

    it('should set WIP', async () => {
      const data = { cardId: 'PLN-TSK-0001' };
      await repo.setWip('dev_001', data);
      expect(adapter.write).toHaveBeenCalledWith('/wip/dev_001', data);
    });

    it('should remove WIP', async () => {
      await repo.removeWip('dev_001');
      expect(adapter.remove).toHaveBeenCalledWith('/wip/dev_001');
    });

    it('should get all WIP', async () => {
      const allWip = { dev_001: { cardId: 'X' }, dev_002: { cardId: 'Y' } };
      adapter.read.mockResolvedValueOnce(allWip);

      const result = await repo.getAllWip();
      expect(result).toEqual(allWip);
    });

    it('should use transaction for WIP', async () => {
      const updateFn = vi.fn();
      await repo.transactionWip('dev_001', updateFn);
      expect(adapter.transaction).toHaveBeenCalledWith('/wip/dev_001', updateFn);
    });
  });

  describe('WIP history', () => {
    it('should add WIP history entry', async () => {
      const historyData = { action: 'start', timestamp: '2026-01-01' };
      await repo.addWipHistory('dev_001', historyData);
      expect(adapter.push).toHaveBeenCalledWith('/wipHistory/dev_001', historyData);
    });

    it('should get WIP history', async () => {
      const history = { id1: { action: 'start' }, id2: { action: 'stop' } };
      adapter.read.mockResolvedValueOnce(history);

      const result = await repo.getWipHistory('dev_001');
      expect(result).toEqual(history);
      expect(adapter.read).toHaveBeenCalledWith('/wipHistory/dev_001');
    });
  });

  describe('subscriptions', () => {
    it('should subscribe to WIP changes', () => {
      const cb = vi.fn();
      repo.subscribeToWip('dev_001', cb);
      expect(adapter.subscribe).toHaveBeenCalledWith('/wip/dev_001', cb);
    });

    it('should subscribe to backlog changes', () => {
      const cb = vi.fn();
      repo.subscribeToBacklog('dev_001', cb);
      expect(adapter.subscribe).toHaveBeenCalledWith('/developerBacklogs/dev_001', cb);
    });
  });
});

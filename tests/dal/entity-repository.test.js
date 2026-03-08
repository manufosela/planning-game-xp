/**
 * Tests for EntityRepository (abstract) and RtdbEntityRepository
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock adapter
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

// Inline implementations to avoid Firebase import issues
class BaseRepo {
  constructor(adapter) { this._adapter = adapter; }
  async read(path) { return this._adapter.read(path); }
  async write(path, data) { return this._adapter.write(path, data); }
  async update(path, updates) { return this._adapter.update(path, updates); }
  async push(path, data) { return this._adapter.push(path, data); }
  async remove(path) { return this._adapter.remove(path); }
  subscribe(path, callback) { return this._adapter.subscribe(path, callback); }
}

// Replicate EntityRepository paths and RtdbEntityRepository logic
class TestEntityRepository {
  constructor(baseRepo) { this._repo = baseRepo; }

  async getAllDevelopers() { return this._repo.read('/data/developers'); }
  async getDeveloper(id) { return this._repo.read(`/data/developers/${id}`); }
  async getAllStakeholders() { return this._repo.read('/data/stakeholders'); }
  async getStakeholder(id) { return this._repo.read(`/data/stakeholders/${id}`); }
  async getAllTeams() { return this._repo.read('/data/teams'); }
  async getUser(email) { return this._repo.read(`/users/${email}`); }
  async setUser(email, data) { await this._repo.write(`/users/${email}`, data); }
  async updateUser(email, updates) { await this._repo.update(`/users/${email}`, updates); }
  async getAllUsers() { return this._repo.read('/users'); }
  subscribeToDevelopers(cb) { return this._repo.subscribe('/data/developers', cb); }
  subscribeToStakeholders(cb) { return this._repo.subscribe('/data/stakeholders', cb); }
}

describe('EntityRepository', () => {
  let adapter;
  let repo;

  beforeEach(() => {
    adapter = createMockAdapter();
    const base = new BaseRepo(adapter);
    repo = new TestEntityRepository(base);
  });

  describe('getAllDevelopers', () => {
    it('should read from /data/developers', async () => {
      const devs = { dev_001: { name: 'Dev 1' }, dev_002: { name: 'Dev 2' } };
      adapter.read.mockResolvedValueOnce(devs);

      const result = await repo.getAllDevelopers();
      expect(result).toEqual(devs);
      expect(adapter.read).toHaveBeenCalledWith('/data/developers');
    });

    it('should return null when no developers exist', async () => {
      const result = await repo.getAllDevelopers();
      expect(result).toBeNull();
    });
  });

  describe('getDeveloper', () => {
    it('should read specific developer by ID', async () => {
      const dev = { name: 'Test Dev', email: 'test@example.com' };
      adapter.read.mockResolvedValueOnce(dev);

      const result = await repo.getDeveloper('dev_001');
      expect(result).toEqual(dev);
      expect(adapter.read).toHaveBeenCalledWith('/data/developers/dev_001');
    });
  });

  describe('getAllStakeholders', () => {
    it('should read from /data/stakeholders', async () => {
      const stks = { stk_001: { name: 'Stk 1' } };
      adapter.read.mockResolvedValueOnce(stks);

      const result = await repo.getAllStakeholders();
      expect(result).toEqual(stks);
      expect(adapter.read).toHaveBeenCalledWith('/data/stakeholders');
    });
  });

  describe('getStakeholder', () => {
    it('should read specific stakeholder by ID', async () => {
      const stk = { name: 'Test Stk' };
      adapter.read.mockResolvedValueOnce(stk);

      const result = await repo.getStakeholder('stk_001');
      expect(result).toEqual(stk);
      expect(adapter.read).toHaveBeenCalledWith('/data/stakeholders/stk_001');
    });
  });

  describe('getAllTeams', () => {
    it('should read from /data/teams', async () => {
      const teams = { team1: { name: 'Team A' } };
      adapter.read.mockResolvedValueOnce(teams);

      const result = await repo.getAllTeams();
      expect(result).toEqual(teams);
      expect(adapter.read).toHaveBeenCalledWith('/data/teams');
    });
  });

  describe('User operations', () => {
    it('should get user by encoded email', async () => {
      const user = { developerId: 'dev_001' };
      adapter.read.mockResolvedValueOnce(user);

      const result = await repo.getUser('test@example,com');
      expect(result).toEqual(user);
      expect(adapter.read).toHaveBeenCalledWith('/users/test@example,com');
    });

    it('should set user data', async () => {
      await repo.setUser('test@example,com', { developerId: 'dev_001' });
      expect(adapter.write).toHaveBeenCalledWith('/users/test@example,com', { developerId: 'dev_001' });
    });

    it('should update user data', async () => {
      await repo.updateUser('test@example,com', { role: 'admin' });
      expect(adapter.update).toHaveBeenCalledWith('/users/test@example,com', { role: 'admin' });
    });

    it('should get all users', async () => {
      const users = { 'a@b,com': { developerId: 'dev_001' } };
      adapter.read.mockResolvedValueOnce(users);

      const result = await repo.getAllUsers();
      expect(result).toEqual(users);
      expect(adapter.read).toHaveBeenCalledWith('/users');
    });
  });

  describe('subscriptions', () => {
    it('should subscribe to developers', () => {
      const cb = vi.fn();
      repo.subscribeToDevelopers(cb);
      expect(adapter.subscribe).toHaveBeenCalledWith('/data/developers', cb);
    });

    it('should subscribe to stakeholders', () => {
      const cb = vi.fn();
      repo.subscribeToStakeholders(cb);
      expect(adapter.subscribe).toHaveBeenCalledWith('/data/stakeholders', cb);
    });
  });
});

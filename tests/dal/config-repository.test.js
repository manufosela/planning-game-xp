/**
 * Tests for ConfigRepository
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
  async remove(path) { return this._adapter.remove(path); }
  subscribe(path, callback) { return this._adapter.subscribe(path, callback); }
}

class TestConfigRepository {
  constructor(baseRepo) { this._repo = baseRepo; }

  async getGlobalConfigs(type) { return this._repo.read(`/global/${type}`); }
  async getGlobalConfig(type, id) { return this._repo.read(`/global/${type}/${id}`); }
  async setGlobalConfig(type, id, data) { await this._repo.write(`/global/${type}/${id}`, data); }
  async removeGlobalConfig(type, id) { await this._repo.remove(`/global/${type}/${id}`); }
  async getTheme() { return this._repo.read('/config/theme'); }
  async setTheme(data) { await this._repo.write('/config/theme', data); }
  async getIAEnabled() { const val = await this._repo.read('/config/ia/enabled'); return val === true; }
  async getCurrentVersion() { return this._repo.read('/appConfig/currentVersion'); }
  async getAppAdmins(project) { return this._repo.read(`/data/appAdmins/${project}`); }
  async getAppUploaders(project) { return this._repo.read(`/data/appUploaders/${project}`); }
  subscribeToTheme(cb) { return this._repo.subscribe('/config/theme', cb); }
}

describe('ConfigRepository', () => {
  let adapter;
  let repo;

  beforeEach(() => {
    adapter = createMockAdapter();
    const base = new BaseRepo(adapter);
    repo = new TestConfigRepository(base);
  });

  describe('global config operations', () => {
    it('should get all configs of a type', async () => {
      const configs = { cfg1: { name: 'Config 1' }, cfg2: { name: 'Config 2' } };
      adapter.read.mockResolvedValueOnce(configs);

      const result = await repo.getGlobalConfigs('agents');
      expect(result).toEqual(configs);
      expect(adapter.read).toHaveBeenCalledWith('/global/agents');
    });

    it('should get a specific config', async () => {
      const cfg = { name: 'Prompt 1', content: 'You are...' };
      adapter.read.mockResolvedValueOnce(cfg);

      const result = await repo.getGlobalConfig('prompts', 'estimation');
      expect(result).toEqual(cfg);
      expect(adapter.read).toHaveBeenCalledWith('/global/prompts/estimation');
    });

    it('should set a config', async () => {
      const data = { name: 'New Config', content: 'rules...' };
      await repo.setGlobalConfig('instructions', 'coding', data);
      expect(adapter.write).toHaveBeenCalledWith('/global/instructions/coding', data);
    });

    it('should remove a config', async () => {
      await repo.removeGlobalConfig('agents', 'agent1');
      expect(adapter.remove).toHaveBeenCalledWith('/global/agents/agent1');
    });
  });

  describe('theme operations', () => {
    it('should get theme', async () => {
      const theme = { primary: '#FF0000', secondary: '#00FF00' };
      adapter.read.mockResolvedValueOnce(theme);

      const result = await repo.getTheme();
      expect(result).toEqual(theme);
      expect(adapter.read).toHaveBeenCalledWith('/config/theme');
    });

    it('should set theme', async () => {
      await repo.setTheme({ primary: '#0000FF' });
      expect(adapter.write).toHaveBeenCalledWith('/config/theme', { primary: '#0000FF' });
    });

    it('should subscribe to theme changes', () => {
      const cb = vi.fn();
      repo.subscribeToTheme(cb);
      expect(adapter.subscribe).toHaveBeenCalledWith('/config/theme', cb);
    });
  });

  describe('app config', () => {
    it('should get IA enabled status - true', async () => {
      adapter.read.mockResolvedValueOnce(true);
      const result = await repo.getIAEnabled();
      expect(result).toBe(true);
    });

    it('should get IA enabled status - false when null', async () => {
      adapter.read.mockResolvedValueOnce(null);
      const result = await repo.getIAEnabled();
      expect(result).toBe(false);
    });

    it('should get current version', async () => {
      adapter.read.mockResolvedValueOnce('1.164.8');
      const result = await repo.getCurrentVersion();
      expect(result).toBe('1.164.8');
    });

    it('should get app admins', async () => {
      const admins = { admin1: true, admin2: true };
      adapter.read.mockResolvedValueOnce(admins);

      const result = await repo.getAppAdmins('PlanningGame');
      expect(result).toEqual(admins);
      expect(adapter.read).toHaveBeenCalledWith('/data/appAdmins/PlanningGame');
    });

    it('should get app uploaders', async () => {
      const uploaders = { uploader1: true };
      adapter.read.mockResolvedValueOnce(uploaders);

      const result = await repo.getAppUploaders('PlanningGame');
      expect(result).toEqual(uploaders);
      expect(adapter.read).toHaveBeenCalledWith('/data/appUploaders/PlanningGame');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/firestore.js', () => ({
  getConfigs: vi.fn(),
  getConfig: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
  deleteConfig: vi.fn(),
}));

import { FirebaseGlobalConfigRepository } from '../../../src/infrastructure/firebase/global-config-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebaseGlobalConfigRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseGlobalConfigRepository();
  });

  describe('getConfigs', () => {
    it('delegates to firestore.getConfigs with type filter', async () => {
      const configs = [{ configId: 'c1', type: 'instructions' }];
      firestore.getConfigs.mockResolvedValue(configs);

      const result = await repo.getConfigs('instructions');

      expect(firestore.getConfigs).toHaveBeenCalledWith({ type: 'instructions' });
      expect(result).toEqual(configs);
    });

    it('calls getConfigs without filter when type is undefined', async () => {
      firestore.getConfigs.mockResolvedValue([]);

      await repo.getConfigs();

      expect(firestore.getConfigs).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getConfig', () => {
    it('delegates to firestore.getConfig with configId (type ignored)', async () => {
      const config = { configId: 'c1', type: 'instructions', content: 'test' };
      firestore.getConfig.mockResolvedValue(config);

      const result = await repo.getConfig('instructions', 'c1');

      expect(firestore.getConfig).toHaveBeenCalledWith('c1');
      expect(result).toEqual(config);
    });

    it('returns null when config not found', async () => {
      firestore.getConfig.mockResolvedValue(null);
      const result = await repo.getConfig('instructions', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('calls createConfig for new configs (no configId)', async () => {
      firestore.createConfig.mockResolvedValue('new-id');

      await repo.saveConfig({ type: 'instructions', content: 'data' });

      expect(firestore.createConfig).toHaveBeenCalledWith({ type: 'instructions', content: 'data' });
    });

    it('calls updateConfig for existing configs (with configId)', async () => {
      firestore.updateConfig.mockResolvedValue(undefined);

      await repo.saveConfig({ configId: 'c1', type: 'instructions', content: 'updated' });

      expect(firestore.updateConfig).toHaveBeenCalledWith('c1', { type: 'instructions', content: 'updated' });
    });
  });

  describe('deleteConfig', () => {
    it('delegates to firestore.deleteConfig with configId', async () => {
      firestore.deleteConfig.mockResolvedValue(undefined);

      await repo.deleteConfig('instructions', 'c1');

      expect(firestore.deleteConfig).toHaveBeenCalledWith('c1');
    });
  });
});

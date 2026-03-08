import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetDeveloperGroups = vi.fn();
const mockSetDeveloperGroups = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    config: {
      getDeveloperGroups: (...args) => mockGetDeveloperGroups(...args),
      setDeveloperGroups: (...args) => mockSetDeveloperGroups(...args),
    },
  },
}));

describe('DeveloperGroupsService', () => {
  let DeveloperGroupsService;

  const sampleGroups = {
    internal: {
      label: 'Internos',
      developers: ['dev_005', 'dev_001', 'dev_008'],
    },
    external: {
      label: 'Externos',
      developers: ['dev_014', 'dev_004'],
    },
    manager: {
      label: 'Manager',
      developers: ['dev_010'],
    },
  };

  beforeEach(async () => {
    vi.resetModules();

    mockGetDeveloperGroups.mockReset();
    mockSetDeveloperGroups.mockReset();

    const module = await import('../../public/js/services/developer-groups-service.js');
    DeveloperGroupsService = module.DeveloperGroupsService;
  });

  describe('loadGroups', () => {
    it('should load groups via DAL config', async () => {
      mockGetDeveloperGroups.mockResolvedValueOnce(sampleGroups);

      const service = new DeveloperGroupsService();
      await service.loadGroups();

      expect(mockGetDeveloperGroups).toHaveBeenCalledOnce();
      expect(service.getGroups()).toEqual(sampleGroups);
    });

    it('should handle empty/missing data', async () => {
      mockGetDeveloperGroups.mockResolvedValueOnce(null);

      const service = new DeveloperGroupsService();
      await service.loadGroups();

      expect(service.getGroups()).toBeNull();
    });

    it('should throw on DAL error', async () => {
      mockGetDeveloperGroups.mockRejectedValueOnce(new Error('Firebase error'));

      const service = new DeveloperGroupsService();

      await expect(service.loadGroups()).rejects.toThrow('Firebase error');
    });
  });

  describe('getGroups', () => {
    it('should return loaded groups', async () => {
      mockGetDeveloperGroups.mockResolvedValueOnce(sampleGroups);

      const service = new DeveloperGroupsService();
      await service.loadGroups();

      const groups = service.getGroups();
      expect(groups).toEqual(sampleGroups);
      expect(groups.internal.developers).toContain('dev_005');
      expect(groups.external.developers).toContain('dev_014');
      expect(groups.manager.developers).toContain('dev_010');
    });

    it('should return null before loading', () => {
      const service = new DeveloperGroupsService();
      expect(service.getGroups()).toBeNull();
    });
  });

  describe('getDeveloperGroup', () => {
    it('should return group for a developer ID', async () => {
      mockGetDeveloperGroups.mockResolvedValueOnce(sampleGroups);

      const service = new DeveloperGroupsService();
      await service.loadGroups();

      expect(service.getDeveloperGroup('dev_005')).toBe('internal');
      expect(service.getDeveloperGroup('dev_014')).toBe('external');
      expect(service.getDeveloperGroup('dev_010')).toBe('manager');
    });

    it('should return null for unclassified developer', async () => {
      mockGetDeveloperGroups.mockResolvedValueOnce(sampleGroups);

      const service = new DeveloperGroupsService();
      await service.loadGroups();

      expect(service.getDeveloperGroup('dev_999')).toBeNull();
    });

    it('should return null when groups are not loaded', () => {
      const service = new DeveloperGroupsService();
      expect(service.getDeveloperGroup('dev_005')).toBeNull();
    });
  });

  describe('saveGroups', () => {
    it('should save groups via DAL config', async () => {
      mockSetDeveloperGroups.mockResolvedValueOnce(undefined);

      const service = new DeveloperGroupsService();
      await service.saveGroups(sampleGroups);

      expect(mockSetDeveloperGroups).toHaveBeenCalledWith(sampleGroups);
    });

    it('should update local cache after saving', async () => {
      mockSetDeveloperGroups.mockResolvedValueOnce(undefined);

      const service = new DeveloperGroupsService();
      await service.saveGroups(sampleGroups);

      expect(service.getGroups()).toEqual(sampleGroups);
      expect(service.getDeveloperGroup('dev_005')).toBe('internal');
    });

    it('should throw on DAL write error', async () => {
      mockSetDeveloperGroups.mockRejectedValueOnce(new Error('Permission denied'));

      const service = new DeveloperGroupsService();

      await expect(service.saveGroups(sampleGroups)).rejects.toThrow('Permission denied');
    });
  });
});

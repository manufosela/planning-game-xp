import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockUpdateUser = vi.fn().mockResolvedValue(undefined);

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    entities: {
      updateUser: (...args) => mockUpdateUser(...args),
      getAllUsers: vi.fn().mockResolvedValue(null),
      getAllTeams: vi.fn().mockResolvedValue(null),
      getTrashUsers: vi.fn().mockResolvedValue(null),
      subscribeToTeams: vi.fn(),
      subscribeToUsers: vi.fn()
    },
    projects: {
      get: vi.fn().mockResolvedValue(null)
    }
  }
}));

vi.mock('../../public/firebase-config.js', () => ({}));

describe('EntityDirectoryService delete methods', () => {
  let service;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../public/js/services/entity-directory-service.js');
    service = module.entityDirectoryService;

    // Manually populate cache for testing
    service._developers.clear();
    service._developersByEmail.clear();
    service._developersByName.clear();
    service._stakeholders.clear();
    service._stakeholdersByEmail.clear();
    service._stakeholdersByName.clear();
    service._users.clear();
    service._listeners = [];

    // Add test developers
    service._developers.set('dev_001', {
      id: 'dev_001',
      email: 'alice@example.com',
      emails: ['alice@example.com', 'alice.alt@example.com'],
      name: 'Alice Developer',
      active: true
    });
    service._developersByEmail.set('alice@example.com', 'dev_001');
    service._developersByEmail.set('alice.alt@example.com', 'dev_001');
    service._developersByName.set('alice developer', 'dev_001');

    service._developers.set('dev_002', {
      id: 'dev_002',
      email: 'bob@example.com',
      emails: ['bob@example.com'],
      name: 'Bob Developer',
      active: true
    });
    service._developersByEmail.set('bob@example.com', 'dev_002');
    service._developersByName.set('bob developer', 'dev_002');

    // Add test stakeholders
    service._stakeholders.set('stk_001', {
      id: 'stk_001',
      email: 'carol@example.com',
      name: 'Carol Stakeholder',
      active: true,
      teamId: 'team_01'
    });
    service._stakeholdersByEmail.set('carol@example.com', 'stk_001');
    service._stakeholdersByName.set('carol stakeholder', 'stk_001');

    // Add corresponding /users/ entries (required for _findUserByDevId / _findUserByStkId)
    service._users.set('alice|example!com', {
      name: 'Alice Developer', email: 'alice@example.com',
      developerId: 'dev_001', active: true, _encodedEmail: 'alice|example!com'
    });
    service._users.set('bob|example!com', {
      name: 'Bob Developer', email: 'bob@example.com',
      developerId: 'dev_002', active: true, _encodedEmail: 'bob|example!com'
    });
    service._users.set('carol|example!com', {
      name: 'Carol Stakeholder', email: 'carol@example.com',
      stakeholderId: 'stk_001', active: true, teamId: 'team_01', _encodedEmail: 'carol|example!com'
    });
  });

  describe('deleteDeveloper', () => {
    it('should remove developer from cache and Firebase', async () => {
      await service.deleteDeveloper('dev_001');

      expect(mockUpdateUser).toHaveBeenCalledWith('alice|example!com', { developerId: null });
      expect(service._developers.has('dev_001')).toBe(false);
      expect(service.getDeveloper('dev_001')).toBeNull();
    });

    it('should clean up email indices', async () => {
      await service.deleteDeveloper('dev_001');

      expect(service._developersByEmail.has('alice@example.com')).toBe(false);
      expect(service._developersByEmail.has('alice.alt@example.com')).toBe(false);
    });

    it('should clean up name index', async () => {
      await service.deleteDeveloper('dev_001');

      expect(service._developersByName.has('alice developer')).toBe(false);
    });

    it('should not affect other developers', async () => {
      await service.deleteDeveloper('dev_001');

      expect(service._developers.has('dev_002')).toBe(true);
      expect(service._developersByEmail.has('bob@example.com')).toBe(true);
    });

    it('should notify listeners', async () => {
      const listener = vi.fn();
      service.addChangeListener(listener);

      await service.deleteDeveloper('dev_001');

      expect(listener).toHaveBeenCalledWith('developers');
    });

    it('should do nothing if developer does not exist', async () => {
      await service.deleteDeveloper('dev_999');

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('deleteStakeholder', () => {
    it('should remove stakeholder from cache and Firebase', async () => {
      await service.deleteStakeholder('stk_001');

      expect(mockUpdateUser).toHaveBeenCalledWith('carol|example!com', { stakeholderId: null });
      expect(service._stakeholders.has('stk_001')).toBe(false);
      expect(service.getStakeholder('stk_001')).toBeNull();
    });

    it('should clean up email index', async () => {
      await service.deleteStakeholder('stk_001');

      expect(service._stakeholdersByEmail.has('carol@example.com')).toBe(false);
    });

    it('should clean up name index', async () => {
      await service.deleteStakeholder('stk_001');

      expect(service._stakeholdersByName.has('carol stakeholder')).toBe(false);
    });

    it('should notify listeners', async () => {
      const listener = vi.fn();
      service.addChangeListener(listener);

      await service.deleteStakeholder('stk_001');

      expect(listener).toHaveBeenCalledWith('stakeholders');
    });

    it('should do nothing if stakeholder does not exist', async () => {
      await service.deleteStakeholder('stk_999');

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });
});

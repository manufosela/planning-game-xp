import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAllUsers = vi.fn();
const mockGetAllTeams = vi.fn();
const mockGetTrashUsers = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    entities: {
      getAllUsers: (...args) => mockGetAllUsers(...args),
      getAllTeams: (...args) => mockGetAllTeams(...args),
      getTrashUsers: (...args) => mockGetTrashUsers(...args),
      subscribeToTeams: vi.fn(),
      subscribeToUsers: vi.fn(),
      updateUser: vi.fn().mockResolvedValue(undefined)
    },
    projects: {
      get: vi.fn().mockResolvedValue(null)
    }
  }
}));

vi.mock('../../public/firebase-config.js', () => ({}));

import { entityDirectoryService } from '@/services/entity-directory-service.js';

describe('entityDirectoryService init refresh', () => {
  beforeEach(() => {
    entityDirectoryService._initialized = false;
    entityDirectoryService._initPromise = null;
    entityDirectoryService._developers.clear();
    entityDirectoryService._stakeholders.clear();
    entityDirectoryService._users.clear();
    vi.clearAllMocks();
  });

  it('should refresh data when init was empty and refreshIfEmpty is true', async () => {
    mockGetAllUsers.mockResolvedValue(null);
    mockGetAllTeams.mockResolvedValue(null);
    mockGetTrashUsers.mockResolvedValue(null);

    await entityDirectoryService.init();
    expect(entityDirectoryService.getDeveloper('dev_001')).toBeNull();

    // Simulate user appearing in /users (the centralized model)
    mockGetAllUsers.mockResolvedValue({
      'user|example!com': {
        email: 'user@example.com',
        name: 'User Example',
        developerId: 'dev_001'
      }
    });

    await entityDirectoryService.init({ refreshIfEmpty: true });

    expect(entityDirectoryService.getDeveloper('dev_001')?.name).toBe('User Example');
  });
});

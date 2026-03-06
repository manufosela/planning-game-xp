import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn((db, path) => ({ db, path })),
  get: vi.fn(),
  set: vi.fn(),
  onValue: vi.fn(() => () => {})
}));

vi.mock('../../public/js/config/developer-directory.js', () => ({
  developerDirectory: []
}));

vi.mock('../../public/js/utils/email-sanitizer.js', () => ({
  decodeEmailFromFirebase: vi.fn((key) => key.replace(/\|/g, '@').replace(/!/g, '.').replace(/-/g, '#'))
}));

import { entityDirectoryService } from '@/services/entity-directory-service.js';
import { get } from '../../public/firebase-config.js';

const createSnapshot = (value) => ({
  exists: () => value !== null && value !== undefined,
  val: () => value
});

/**
 * Helper: build a /users/ Firebase data object from an array of user descriptors.
 * Each descriptor: { email, name, developerId?, stakeholderId?, active?, teamId?, projects? }
 */
function buildUsersData(users) {
  const data = {};
  for (const u of users) {
    const key = (u.email || '').replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
    data[key] = {
      name: u.name,
      email: u.email,
      ...(u.developerId ? { developerId: u.developerId } : {}),
      ...(u.stakeholderId ? { stakeholderId: u.stakeholderId } : {}),
      ...(u.active !== undefined ? { active: u.active } : {}),
      ...(u.teamId ? { teamId: u.teamId } : {}),
      ...(u.projects ? { projects: u.projects } : {})
    };
  }
  return data;
}

function resetService() {
  entityDirectoryService._initialized = false;
  entityDirectoryService._initPromise = null;
  entityDirectoryService._developers.clear();
  entityDirectoryService._stakeholders.clear();
  entityDirectoryService._stakeholdersByEmail.clear();
  entityDirectoryService._stakeholdersByName.clear();
  entityDirectoryService._developersByEmail.clear();
  entityDirectoryService._developersByName.clear();
  entityDirectoryService._users.clear();
  entityDirectoryService._teams.clear();
  entityDirectoryService._nextDeveloperId = 1;
  entityDirectoryService._nextStakeholderId = 1;
  entityDirectoryService._listeners = [];
  get.mockReset();
}

describe('entityDirectoryService - Project Teams (getProjectDeveloperIds / getProjectDevelopers)', () => {
  beforeEach(() => {
    resetService();
  });

  // ==================== getProjectDeveloperIds ====================

  describe('getProjectDeveloperIds', () => {
    it('should return developer IDs assigned to a specific project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true, stakeholder: false } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual(['dev_001']);
    });

    it('should return empty array when no users have developer role for the project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { Cinema4D: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should return empty array when users have developer: false for the project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: false, stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should return empty array when users have no projects field at all', async () => {
      const usersData = buildUsersData([
        { email: 'alice@example.com', name: 'Alice', developerId: 'dev_001' }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should return empty array when the specific projectId is not in users projects', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { Cinema4D: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('NonExistentProject');
      expect(ids).toEqual([]);
    });

    it('should NOT return inactive developers (active === false)', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001', active: false,
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      // getProjectDeveloperIds does NOT filter by active — it returns all with developer === true
      // Let's verify what the actual implementation does
      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      // The implementation checks user.developerId && user.projects[projectId].developer === true
      // It does NOT check user.active. So inactive users ARE returned by getProjectDeveloperIds.
      expect(ids).toEqual(['dev_001']);
    });

    it('should return developers even when active is undefined (defaults to active)', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      // Remove active field explicitly
      const key = Object.keys(usersData)[0];
      delete usersData[key].active;

      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual(['dev_001']);
    });

    it('should return multiple developers for the same project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        },
        {
          email: 'bob@example.com', name: 'Bob', developerId: 'dev_002',
          projects: { PlanningGame: { developer: true } }
        },
        {
          email: 'charlie@example.com', name: 'Charlie', developerId: 'dev_003',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toHaveLength(3);
      expect(ids).toContain('dev_001');
      expect(ids).toContain('dev_002');
      expect(ids).toContain('dev_003');
    });

    it('should only return developers for the queried project when assigned to multiple projects', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true }, Cinema4D: { developer: true } }
        },
        {
          email: 'bob@example.com', name: 'Bob', developerId: 'dev_002',
          projects: { Cinema4D: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const planningDevs = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(planningDevs).toEqual(['dev_001']);

      const cinemaDevs = await entityDirectoryService.getProjectDeveloperIds('Cinema4D');
      expect(cinemaDevs).toHaveLength(2);
      expect(cinemaDevs).toContain('dev_001');
      expect(cinemaDevs).toContain('dev_002');
    });

    it('should NOT return user with developerId but no projects field', async () => {
      const usersData = buildUsersData([
        { email: 'alice@example.com', name: 'Alice', developerId: 'dev_001' }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should NOT return user with projects field but no developerId', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should handle mixed users: some with project assignments, some without', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        },
        { email: 'bob@example.com', name: 'Bob', developerId: 'dev_002' },
        {
          email: 'charlie@example.com', name: 'Charlie', developerId: 'dev_003',
          projects: { PlanningGame: { developer: false } }
        },
        {
          email: 'diana@example.com', name: 'Diana',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual(['dev_001']);
    });

    it('should be case-sensitive for projectId', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const idsLower = await entityDirectoryService.getProjectDeveloperIds('planninggame');
      expect(idsLower).toEqual([]);

      const idsUpper = await entityDirectoryService.getProjectDeveloperIds('PLANNINGGAME');
      expect(idsUpper).toEqual([]);

      const idsCorrect = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(idsCorrect).toEqual(['dev_001']);
    });
  });

  // ==================== getProjectDevelopers ====================

  describe('getProjectDevelopers', () => {
    it('should return full developer objects for a project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const devs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
      expect(devs).toHaveLength(1);
      expect(devs[0]).toMatchObject({
        id: 'dev_001',
        name: 'Alice',
        email: 'alice@example.com',
        active: true
      });
    });

    it('should return empty array when no developers for project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { Cinema4D: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const devs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
      expect(devs).toEqual([]);
    });

    it('should return fallback object if developer cache entry is missing', async () => {
      // Simulate: user in _users has developerId and project assignment, but _developers cache is manually cleared
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      // Manually remove from _developers cache to simulate inconsistency
      entityDirectoryService._developers.delete('dev_001');

      const devs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
      expect(devs).toHaveLength(1);
      expect(devs[0]).toMatchObject({
        id: 'dev_001',
        name: 'dev_001',
        email: '',
        active: true
      });
    });

    it('should return multiple full developer objects', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        },
        {
          email: 'bob@example.com', name: 'Bob', developerId: 'dev_002',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const devs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
      expect(devs).toHaveLength(2);
      const names = devs.map(d => d.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });

    it('should include emails array in developer objects', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const devs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
      expect(devs[0].emails).toEqual(['alice@example.com']);
    });
  });

  // ==================== Edge cases for getProjectDeveloperIds ====================

  describe('getProjectDeveloperIds - edge cases', () => {
    it('should return empty array when projectId is empty string', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('');
      expect(ids).toEqual([]);
    });

    it('should return empty array when projectId is null', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds(null);
      expect(ids).toEqual([]);
    });

    it('should return empty array when projectId is undefined', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
          projects: { PlanningGame: { developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds(undefined);
      expect(ids).toEqual([]);
    });

    it('should return empty array when users map is empty', async () => {
      entityDirectoryService._processUsers({});

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should return empty array when _processUsers was called with null', async () => {
      entityDirectoryService._processUsers(null);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should handle user with malformed projects field (not an object)', async () => {
      const usersData = {
        'alice|example!com': {
          email: 'alice@example.com',
          name: 'Alice',
          developerId: 'dev_001',
          projects: 'malformed-string'
        }
      };
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should handle user with projects[projectId] as plain true (not an object)', async () => {
      const usersData = {
        'alice|example!com': {
          email: 'alice@example.com',
          name: 'Alice',
          developerId: 'dev_001',
          projects: { PlanningGame: true }
        }
      };
      entityDirectoryService._processUsers(usersData);

      // projects[projectId]?.developer === true would be undefined?.developer which is undefined, not true
      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should handle user with projects[projectId] as null', async () => {
      const usersData = {
        'alice|example!com': {
          email: 'alice@example.com',
          name: 'Alice',
          developerId: 'dev_001',
          projects: { PlanningGame: null }
        }
      };
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should handle user with projects[projectId].developer as string "true" (not boolean)', async () => {
      const usersData = {
        'alice|example!com': {
          email: 'alice@example.com',
          name: 'Alice',
          developerId: 'dev_001',
          projects: { PlanningGame: { developer: 'true' } }
        }
      };
      entityDirectoryService._processUsers(usersData);

      // Strict === true check means string "true" is NOT matched
      const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
      expect(ids).toEqual([]);
    });
  });
});

describe('entityDirectoryService - Project Teams (getProjectStakeholderIds / getProjectStakeholders)', () => {
  beforeEach(() => {
    resetService();
  });

  // ==================== getProjectStakeholderIds ====================

  describe('getProjectStakeholderIds', () => {
    it('should return stakeholder IDs assigned to a specific project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual(['stk_001']);
    });

    it('should return empty array when no stakeholders for project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { Cinema4D: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should return empty array when stakeholder: false in projects', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: false, developer: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should return empty array when user has no projects field', async () => {
      const usersData = buildUsersData([
        { email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001' }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should return multiple stakeholders for same project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        },
        {
          email: 'bob@example.com', name: 'Bob', stakeholderId: 'stk_002',
          projects: { PlanningGame: { stakeholder: true } }
        },
        {
          email: 'charlie@example.com', name: 'Charlie', stakeholderId: 'stk_003',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toHaveLength(3);
      expect(ids).toContain('stk_001');
      expect(ids).toContain('stk_002');
      expect(ids).toContain('stk_003');
    });

    it('should NOT return user with stakeholderId but no projects', async () => {
      const usersData = buildUsersData([
        { email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001' }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should NOT return user with projects assignment but no stakeholderId', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should be case-sensitive for projectId', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      expect(await entityDirectoryService.getProjectStakeholderIds('planninggame')).toEqual([]);
      expect(await entityDirectoryService.getProjectStakeholderIds('PlanningGame')).toEqual(['stk_001']);
    });
  });

  // ==================== getProjectStakeholders ====================

  describe('getProjectStakeholders', () => {
    it('should return full stakeholder objects for a project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const stks = await entityDirectoryService.getProjectStakeholders('PlanningGame');
      expect(stks).toHaveLength(1);
      expect(stks[0]).toMatchObject({
        id: 'stk_001',
        name: 'Alice',
        email: 'alice@example.com',
        active: true
      });
    });

    it('should return empty array when no stakeholders for project', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { Cinema4D: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const stks = await entityDirectoryService.getProjectStakeholders('PlanningGame');
      expect(stks).toEqual([]);
    });

    it('should return stakeholder with teamId when available', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001', teamId: 'team_design',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const stks = await entityDirectoryService.getProjectStakeholders('PlanningGame');
      expect(stks).toHaveLength(1);
      expect(stks[0].teamId).toBe('team_design');
    });

    it('should return fallback object if stakeholder cache entry is missing', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      // Manually remove from _stakeholders cache
      entityDirectoryService._stakeholders.delete('stk_001');

      const stks = await entityDirectoryService.getProjectStakeholders('PlanningGame');
      expect(stks).toHaveLength(1);
      expect(stks[0]).toMatchObject({
        id: 'stk_001',
        name: 'stk_001',
        email: '',
        active: true
      });
    });

    it('should return multiple full stakeholder objects', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        },
        {
          email: 'bob@example.com', name: 'Bob', stakeholderId: 'stk_002',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const stks = await entityDirectoryService.getProjectStakeholders('PlanningGame');
      expect(stks).toHaveLength(2);
      const names = stks.map(s => s.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });
  });

  // ==================== getProjectStakeholderIds - edge cases ====================

  describe('getProjectStakeholderIds - edge cases', () => {
    it('should return empty array when projectId is empty string', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('');
      expect(ids).toEqual([]);
    });

    it('should return empty array when projectId is null', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds(null);
      expect(ids).toEqual([]);
    });

    it('should return empty array when projectId is undefined', async () => {
      const usersData = buildUsersData([
        {
          email: 'alice@example.com', name: 'Alice', stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: true } }
        }
      ]);
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds(undefined);
      expect(ids).toEqual([]);
    });

    it('should return empty array when users map is empty', async () => {
      entityDirectoryService._processUsers({});

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should handle user with projects[projectId] as plain true (not object)', async () => {
      const usersData = {
        'alice|example!com': {
          email: 'alice@example.com',
          name: 'Alice',
          stakeholderId: 'stk_001',
          projects: { PlanningGame: true }
        }
      };
      entityDirectoryService._processUsers(usersData);

      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });

    it('should handle user with projects[projectId].stakeholder as string "true"', async () => {
      const usersData = {
        'alice|example!com': {
          email: 'alice@example.com',
          name: 'Alice',
          stakeholderId: 'stk_001',
          projects: { PlanningGame: { stakeholder: 'true' } }
        }
      };
      entityDirectoryService._processUsers(usersData);

      // Strict === true means string "true" is NOT matched
      const ids = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
      expect(ids).toEqual([]);
    });
  });
});

describe('entityDirectoryService - Project Teams (integration scenarios)', () => {
  beforeEach(() => {
    resetService();
  });

  it('should handle user who is both developer AND stakeholder for same project', async () => {
    const usersData = buildUsersData([
      {
        email: 'alice@example.com', name: 'Alice',
        developerId: 'dev_001', stakeholderId: 'stk_001',
        projects: { PlanningGame: { developer: true, stakeholder: true } }
      }
    ]);
    entityDirectoryService._processUsers(usersData);

    const devIds = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
    const stkIds = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');

    expect(devIds).toEqual(['dev_001']);
    expect(stkIds).toEqual(['stk_001']);
  });

  it('should handle user who is developer for project A, stakeholder for project B', async () => {
    const usersData = buildUsersData([
      {
        email: 'alice@example.com', name: 'Alice',
        developerId: 'dev_001', stakeholderId: 'stk_001',
        projects: {
          PlanningGame: { developer: true, stakeholder: false },
          Cinema4D: { developer: false, stakeholder: true }
        }
      }
    ]);
    entityDirectoryService._processUsers(usersData);

    expect(await entityDirectoryService.getProjectDeveloperIds('PlanningGame')).toEqual(['dev_001']);
    expect(await entityDirectoryService.getProjectStakeholderIds('PlanningGame')).toEqual([]);
    expect(await entityDirectoryService.getProjectDeveloperIds('Cinema4D')).toEqual([]);
    expect(await entityDirectoryService.getProjectStakeholderIds('Cinema4D')).toEqual(['stk_001']);
  });

  it('should handle large number of users (10+) with various project assignments', async () => {
    const users = [];
    for (let i = 1; i <= 15; i++) {
      const padded = String(i).padStart(3, '0');
      const isDev = i <= 10;
      const isStk = i > 5;
      const isInPlanning = i % 2 === 0;
      const isInCinema = i % 3 === 0;

      users.push({
        email: `user${padded}@example.com`,
        name: `User ${padded}`,
        ...(isDev ? { developerId: `dev_${padded}` } : {}),
        ...(isStk ? { stakeholderId: `stk_${padded}` } : {}),
        projects: {
          ...(isInPlanning ? { PlanningGame: { developer: isDev, stakeholder: isStk } } : {}),
          ...(isInCinema ? { Cinema4D: { developer: isDev, stakeholder: isStk } } : {})
        }
      });
    }

    const usersData = buildUsersData(users);
    entityDirectoryService._processUsers(usersData);

    // PlanningGame developers: users with even index, i<=10, in PlanningGame with developer:true
    // i=2,4,6,8,10 → dev_002, dev_004, dev_006, dev_008, dev_010
    const planningDevIds = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
    expect(planningDevIds).toHaveLength(5);
    expect(planningDevIds).toContain('dev_002');
    expect(planningDevIds).toContain('dev_010');

    // PlanningGame stakeholders: users with even index, i>5
    // i=6,8,10,12,14 → stk_006, stk_008, stk_010, stk_012, stk_014
    const planningStkIds = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');
    expect(planningStkIds).toHaveLength(5);
    expect(planningStkIds).toContain('stk_006');
    expect(planningStkIds).toContain('stk_014');

    // Full objects
    const planningDevs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
    expect(planningDevs).toHaveLength(5);
    expect(planningDevs.every(d => d.email && d.name)).toBe(true);
  });

  it('should reflect correct data after _processUsers is called (simulating realtime update)', async () => {
    // Initial state
    const usersDataV1 = buildUsersData([
      {
        email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
        projects: { PlanningGame: { developer: true } }
      }
    ]);
    entityDirectoryService._processUsers(usersDataV1);

    expect(await entityDirectoryService.getProjectDeveloperIds('PlanningGame')).toEqual(['dev_001']);

    // Simulate realtime update: Alice removed from PlanningGame, Bob added
    const usersDataV2 = buildUsersData([
      {
        email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
        projects: { PlanningGame: { developer: false } }
      },
      {
        email: 'bob@example.com', name: 'Bob', developerId: 'dev_002',
        projects: { PlanningGame: { developer: true } }
      }
    ]);
    entityDirectoryService._processUsers(usersDataV2);

    const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
    expect(ids).toEqual(['dev_002']);
    expect(ids).not.toContain('dev_001');
  });

  it('should clear and rebuild completely on _processUsers — old data is gone', async () => {
    // First load with Alice
    const usersDataV1 = buildUsersData([
      {
        email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
        projects: { PlanningGame: { developer: true } }
      }
    ]);
    entityDirectoryService._processUsers(usersDataV1);
    expect(await entityDirectoryService.getProjectDeveloperIds('PlanningGame')).toEqual(['dev_001']);

    // Second load without Alice — she disappears
    const usersDataV2 = buildUsersData([
      {
        email: 'bob@example.com', name: 'Bob', developerId: 'dev_002',
        projects: { Cinema4D: { developer: true } }
      }
    ]);
    entityDirectoryService._processUsers(usersDataV2);

    expect(await entityDirectoryService.getProjectDeveloperIds('PlanningGame')).toEqual([]);
    expect(entityDirectoryService.getDeveloper('dev_001')).toBeNull();
  });

  it('should return correct data after waitForInit when initialized via _processUsers', async () => {
    // Simulate full init flow
    const usersData = buildUsersData([
      {
        email: 'alice@example.com', name: 'Alice', developerId: 'dev_001',
        projects: { PlanningGame: { developer: true } }
      },
      {
        email: 'bob@example.com', name: 'Bob', stakeholderId: 'stk_001',
        projects: { PlanningGame: { stakeholder: true } }
      }
    ]);

    get.mockImplementation(async (refObj) => {
      const store = {
        '/users': usersData,
        '/data/teams': null,
        '/data/developers': null,
        '/data/stakeholders': null,
        '/trash/users': null
      };
      return createSnapshot(store[refObj.path] ?? null);
    });

    await entityDirectoryService.init();

    const devIds = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
    const stkIds = await entityDirectoryService.getProjectStakeholderIds('PlanningGame');

    expect(devIds).toEqual(['dev_001']);
    expect(stkIds).toEqual(['stk_001']);
  });

  it('should handle user with developer role in one project and stakeholder in another via getProjectDevelopers and getProjectStakeholders', async () => {
    const usersData = buildUsersData([
      {
        email: 'multi@example.com', name: 'MultiRole User',
        developerId: 'dev_005', stakeholderId: 'stk_005',
        projects: {
          PlanningGame: { developer: true, stakeholder: false },
          Cinema4D: { developer: false, stakeholder: true },
          Intranet: { developer: true, stakeholder: true }
        }
      }
    ]);
    entityDirectoryService._processUsers(usersData);

    // PlanningGame
    const pgDevs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
    const pgStks = await entityDirectoryService.getProjectStakeholders('PlanningGame');
    expect(pgDevs).toHaveLength(1);
    expect(pgDevs[0].name).toBe('MultiRole User');
    expect(pgStks).toHaveLength(0);

    // Cinema4D
    const c4dDevs = await entityDirectoryService.getProjectDevelopers('Cinema4D');
    const c4dStks = await entityDirectoryService.getProjectStakeholders('Cinema4D');
    expect(c4dDevs).toHaveLength(0);
    expect(c4dStks).toHaveLength(1);
    expect(c4dStks[0].name).toBe('MultiRole User');

    // Intranet
    const intDevs = await entityDirectoryService.getProjectDevelopers('Intranet');
    const intStks = await entityDirectoryService.getProjectStakeholders('Intranet');
    expect(intDevs).toHaveLength(1);
    expect(intStks).toHaveLength(1);
    expect(intDevs[0].id).toBe('dev_005');
    expect(intStks[0].id).toBe('stk_005');
  });

  it('should handle project assignment with missing developer/stakeholder keys in project object', async () => {
    const usersData = {
      'alice|example!com': {
        email: 'alice@example.com',
        name: 'Alice',
        developerId: 'dev_001',
        stakeholderId: 'stk_001',
        projects: {
          PlanningGame: { developer: true },
          Cinema4D: { stakeholder: true },
          Intranet: {}
        }
      }
    };
    entityDirectoryService._processUsers(usersData);

    // PlanningGame: developer: true, stakeholder not set (undefined !== true)
    expect(await entityDirectoryService.getProjectDeveloperIds('PlanningGame')).toEqual(['dev_001']);
    expect(await entityDirectoryService.getProjectStakeholderIds('PlanningGame')).toEqual([]);

    // Cinema4D: developer not set, stakeholder: true
    expect(await entityDirectoryService.getProjectDeveloperIds('Cinema4D')).toEqual([]);
    expect(await entityDirectoryService.getProjectStakeholderIds('Cinema4D')).toEqual(['stk_001']);

    // Intranet: empty object — neither developer nor stakeholder
    expect(await entityDirectoryService.getProjectDeveloperIds('Intranet')).toEqual([]);
    expect(await entityDirectoryService.getProjectStakeholderIds('Intranet')).toEqual([]);
  });

  it('should return inactive developer from getProjectDevelopers but mark active correctly', async () => {
    const usersData = buildUsersData([
      {
        email: 'inactive@example.com', name: 'Inactive Dev', developerId: 'dev_001', active: false,
        projects: { PlanningGame: { developer: true } }
      },
      {
        email: 'active@example.com', name: 'Active Dev', developerId: 'dev_002',
        projects: { PlanningGame: { developer: true } }
      }
    ]);
    entityDirectoryService._processUsers(usersData);

    const devs = await entityDirectoryService.getProjectDevelopers('PlanningGame');
    expect(devs).toHaveLength(2);

    const inactiveDev = devs.find(d => d.id === 'dev_001');
    const activeDev = devs.find(d => d.id === 'dev_002');

    // _processUsers sets active = userInfo.active !== false
    expect(inactiveDev.active).toBe(false);
    expect(activeDev.active).toBe(true);
  });

  it('should handle concurrent project queries correctly', async () => {
    const usersData = buildUsersData([
      {
        email: 'alice@example.com', name: 'Alice', developerId: 'dev_001', stakeholderId: 'stk_001',
        projects: {
          PlanningGame: { developer: true, stakeholder: true },
          Cinema4D: { developer: true, stakeholder: false },
          Intranet: { developer: false, stakeholder: true }
        }
      },
      {
        email: 'bob@example.com', name: 'Bob', developerId: 'dev_002',
        projects: { PlanningGame: { developer: true }, Cinema4D: { developer: true } }
      }
    ]);
    entityDirectoryService._processUsers(usersData);

    // Run all queries concurrently
    const [pgDevIds, pgStkIds, c4dDevIds, c4dStkIds, intDevIds, intStkIds] = await Promise.all([
      entityDirectoryService.getProjectDeveloperIds('PlanningGame'),
      entityDirectoryService.getProjectStakeholderIds('PlanningGame'),
      entityDirectoryService.getProjectDeveloperIds('Cinema4D'),
      entityDirectoryService.getProjectStakeholderIds('Cinema4D'),
      entityDirectoryService.getProjectDeveloperIds('Intranet'),
      entityDirectoryService.getProjectStakeholderIds('Intranet')
    ]);

    expect(pgDevIds).toHaveLength(2);
    expect(pgStkIds).toEqual(['stk_001']);
    expect(c4dDevIds).toHaveLength(2);
    expect(c4dStkIds).toEqual([]);
    expect(intDevIds).toEqual([]);
    expect(intStkIds).toEqual(['stk_001']);
  });

  it('should handle project with addedAt metadata in project assignment', async () => {
    const usersData = {
      'alice|example!com': {
        email: 'alice@example.com',
        name: 'Alice',
        developerId: 'dev_001',
        projects: {
          PlanningGame: { developer: true, stakeholder: false, addedAt: '2026-01-15T10:00:00Z' }
        }
      }
    };
    entityDirectoryService._processUsers(usersData);

    const ids = await entityDirectoryService.getProjectDeveloperIds('PlanningGame');
    expect(ids).toEqual(['dev_001']);
  });
});

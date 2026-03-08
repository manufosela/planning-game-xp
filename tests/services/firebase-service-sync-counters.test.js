import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks for DAL service
const mockGetProjectAbbreviation = vi.fn();
const mockListCards = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    projects: {
      getProjectAbbreviation: (...args) => mockGetProjectAbbreviation(...args),
    },
    cards: {
      listCards: (...args) => mockListCards(...args),
    },
    backlogs: {
      getAllWip: vi.fn().mockResolvedValue(null),
      setWip: vi.fn().mockResolvedValue(undefined),
      removeWip: vi.fn().mockResolvedValue(undefined),
      addWipHistory: vi.fn().mockResolvedValue('history-1'),
    },
    config: {},
  },
}));

// Mocks for Firestore (counters still use Firestore directly)
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDoc = vi.fn(() => 'mock-doc-ref');

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn(),
  onValue: vi.fn(),
  databaseFirestore: {},
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  doc: (...args) => mockDoc(...args),
  runTransaction: vi.fn(),
  auth: { currentUser: { email: 'testuser@example.com' } },
  firebaseConfig: {},
  superAdminEmail: 'superadmin@example.com',
}));

vi.mock('../../public/js/utils/email-sanitizer.js', () => ({
  encodeEmailForFirebase: (email) => email.replace(/[@.]/g, '_'),
  decodeEmailFromFirebase: (encoded) => encoded,
  sanitizeEmailForFirebase: (email) => email.replace(/[@.]/g, '_'),
}));

vi.mock('../../public/js/services/permission-service.js', () => ({
  permissionService: {},
}));

vi.mock('../../public/js/services/history-service.js', () => ({
  historyService: {},
}));

vi.mock('../../public/js/services/user-directory-service.js', () => ({
  userDirectoryService: { load: vi.fn() },
}));

vi.mock('../../public/js/services/entity-directory-service.js', () => ({
  entityDirectoryService: {},
}));

vi.mock('../../public/js/services/developer-backlog-service.js', () => ({
  developerBacklogService: {},
}));

vi.mock('../../public/js/utils/developer-normalizer.js', () => ({
  normalizeDeveloperEntry: vi.fn(),
}));

vi.mock('../../public/js/utils/project-people-utils.js', () => ({
  normalizeProjectPeople: vi.fn(),
}));

describe('FirebaseService.syncProjectCounters', () => {
  let FirebaseService;

  beforeEach(async () => {
    vi.resetModules();
    mockGetProjectAbbreviation.mockReset();
    mockListCards.mockReset();
    mockGetDoc.mockReset();
    mockSetDoc.mockReset();
    mockDoc.mockReset();
    mockDoc.mockReturnValue('mock-doc-ref');

    const module = await import('../../public/js/services/firebase-service.js');
    FirebaseService = module.FirebaseService;
  });

  describe('validation', () => {
    it('should throw error when projectId is not provided', async () => {
      await expect(FirebaseService.syncProjectCounters('')).rejects.toThrow(
        'ProjectId es requerido y debe ser un string válido'
      );
    });

    it('should throw error when projectId is not a string', async () => {
      await expect(FirebaseService.syncProjectCounters(123)).rejects.toThrow(
        'ProjectId es requerido y debe ser un string válido'
      );
    });

    it('should throw error when projectId is null', async () => {
      await expect(FirebaseService.syncProjectCounters(null)).rejects.toThrow(
        'ProjectId es requerido y debe ser un string válido'
      );
    });
  });

  describe('counter already synchronized', () => {
    it('should not update counter when already synchronized', async () => {
      // Counter is at 22, max cardId is also 22
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc123': { cardId: 'DSR-TSK-0020' },
          '-abc124': { cardId: 'DSR-TSK-0022' },
          '-abc125': { cardId: 'DSR-TSK-0015' },
        }) // tasks
        .mockResolvedValueOnce({}) // bugs
        .mockResolvedValueOnce({}) // epics
        .mockResolvedValueOnce({}) // proposals
        .mockResolvedValueOnce({}); // sprints

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 22 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.success).toBe(true);
      expect(result.synced).toBe(0);
      expect(mockSetDoc).not.toHaveBeenCalled();

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.needsSync).toBe(false);
      expect(tasksResult.currentCounterValue).toBe(22);
      expect(tasksResult.maxIdFound).toBe(22);
    });

    it('should not update counter when counter is higher than max cardId', async () => {
      // Counter is at 30, max cardId is 22
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc123': { cardId: 'DSR-TSK-0022' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 30 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.synced).toBe(0);
      expect(mockSetDoc).not.toHaveBeenCalled();

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.needsSync).toBe(false);
    });
  });

  describe('counter out of sync', () => {
    it('should update counter when behind max cardId', async () => {
      // Counter is at 10, max cardId is 25
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc123': { cardId: 'DSR-TSK-0025' },
          '-abc124': { cardId: 'DSR-TSK-0010' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 10 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        'mock-doc-ref',
        { lastId: 25 },
        { merge: true }
      );

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.needsSync).toBe(true);
      expect(tasksResult.synced).toBe(true);
      expect(tasksResult.newValue).toBe(25);
    });

    it('should update counter when it does not exist (value 0)', async () => {
      // Counter does not exist (treated as 0), max cardId is 15
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc123': { cardId: 'DSR-TSK-0015' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => null,
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.synced).toBe(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        'mock-doc-ref',
        { lastId: 15 },
        { merge: true }
      );
    });

    it('should sync multiple sections that need update', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0050' },
        }) // tasks - needs sync
        .mockResolvedValueOnce({
          '-abc2': { cardId: 'DSR-BUG-0030' },
        }) // bugs - needs sync
        .mockResolvedValueOnce({}) // epics - no cards
        .mockResolvedValueOnce({}) // proposals - no cards
        .mockResolvedValueOnce({}); // sprints - no cards

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 5 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.synced).toBe(2);
      expect(result.needsSync).toBe(2);
      expect(mockSetDoc).toHaveBeenCalledTimes(2);
    });
  });

  describe('dryRun mode', () => {
    it('should not update counter in dryRun mode', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc123': { cardId: 'DSR-TSK-0030' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 10 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject', {
        dryRun: true,
      });

      expect(result.action).toBe('dry-run');
      expect(result.needsSync).toBe(1);
      expect(result.synced).toBe(0);
      expect(mockSetDoc).not.toHaveBeenCalled();

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.needsSync).toBe(true);
      expect(tasksResult.synced).toBe(false);
      expect(tasksResult.wouldUpdateTo).toBe(30);
    });

    it('should report correct message in dryRun mode', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0020' },
        })
        .mockResolvedValueOnce({
          '-abc2': { cardId: 'DSR-BUG-0015' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 5 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject', {
        dryRun: true,
      });

      expect(result.message).toContain('Dry-run');
      expect(result.message).toContain('2');
    });
  });

  describe('section without cards', () => {
    it('should handle empty section with no cards', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce(null) // tasks - no cards
        .mockResolvedValueOnce(null) // bugs
        .mockResolvedValueOnce(null) // epics
        .mockResolvedValueOnce(null) // proposals
        .mockResolvedValueOnce(null); // sprints

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 10 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.success).toBe(true);
      expect(result.synced).toBe(0);
      expect(result.needsSync).toBe(0);
      expect(mockSetDoc).not.toHaveBeenCalled();

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.maxIdFound).toBe(0);
      expect(tasksResult.needsSync).toBe(false);
    });

    it('should handle section with only deleted cards', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc123': { cardId: 'DSR-TSK-0050', deletedAt: '2024-01-01' },
          '-abc124': { cardId: 'DSR-TSK-0060', deletedAt: '2024-01-02' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 10 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.synced).toBe(0);
      expect(mockSetDoc).not.toHaveBeenCalled();

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.maxIdFound).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should capture error for individual section and continue with others', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockRejectedValueOnce(new Error('Network error')) // tasks fails
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-BUG-0020' },
        }) // bugs works
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 5 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result.success).toBe(true);

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.error).toBe('Network error');

      const bugsResult = result.results.find(r => r.section === 'bugs');
      expect(bugsResult.needsSync).toBe(true);
      expect(bugsResult.synced).toBe(true);
    });

    it('should throw error when project has no abbreviation', async () => {
      mockGetProjectAbbreviation.mockResolvedValue(null);

      await expect(
        FirebaseService.syncProjectCounters('NonExistentProject')
      ).rejects.toThrow('no tiene abreviatura configurada');
    });
  });

  describe('custom sections option', () => {
    it('should only sync specified sections', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0050' },
        }) // tasks
        .mockResolvedValueOnce({
          '-abc2': { cardId: 'DSR-BUG-0030' },
        }); // bugs

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 5 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject', {
        sections: ['tasks', 'bugs'],
      });

      expect(result.results.length).toBe(2);
      expect(result.results.map(r => r.section)).toEqual(['tasks', 'bugs']);
    });

    it('should handle single section option', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0050' },
        });

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 5 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject', {
        sections: ['tasks'],
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].section).toBe('tasks');
      expect(result.synced).toBe(1);
    });
  });

  describe('cardId parsing', () => {
    it('should correctly parse cardIds with different formats', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('C4D');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'C4D-TSK-0001' },
          '-abc2': { cardId: 'C4D-TSK-0100' },
          '-abc3': { cardId: 'C4D-TSK-0099' },
          '-abc4': { cardId: 'C4D-TSK-9999' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 50 }),
      });

      const result = await FirebaseService.syncProjectCounters('Cinema4D');

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.maxIdFound).toBe(9999);
    });

    it('should ignore cards without cardId', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0010' },
          '-abc2': { title: 'Card without cardId' }, // No cardId
          '-abc3': { cardId: null }, // Null cardId
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 5 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.maxIdFound).toBe(10);
    });

    it('should ignore cards with non-matching cardId pattern', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0010' },
          '-abc2': { cardId: 'OTHER-TSK-0050' }, // Wrong project prefix
          '-abc3': { cardId: 'DSR-BUG-0030' }, // Wrong section type
          '-abc4': { cardId: 'invalid-format' }, // Invalid format
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 5 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      const tasksResult = result.results.find(r => r.section === 'tasks');
      expect(tasksResult.maxIdFound).toBe(10);
    });
  });

  describe('result structure', () => {
    it('should return correct result structure', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0020' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 10 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');

      expect(result).toHaveProperty('projectId', 'TestProject');
      expect(result).toHaveProperty('projectAbbr', 'DSR');
      expect(result).toHaveProperty('action', 'sync');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('synced');
      expect(result).toHaveProperty('needsSync');
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should include correct section result fields', async () => {
      mockGetProjectAbbreviation.mockResolvedValue('DSR');
      mockListCards
        .mockResolvedValueOnce({
          '-abc1': { cardId: 'DSR-TSK-0020' },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ lastId: 10 }),
      });

      const result = await FirebaseService.syncProjectCounters('TestProject');
      const tasksResult = result.results.find(r => r.section === 'tasks');

      expect(tasksResult).toHaveProperty('section', 'tasks');
      expect(tasksResult).toHaveProperty('counterKey', 'DSR-TSK');
      expect(tasksResult).toHaveProperty('currentCounterValue', 10);
      expect(tasksResult).toHaveProperty('maxIdFound', 20);
      expect(tasksResult).toHaveProperty('needsSync', true);
      expect(tasksResult).toHaveProperty('synced', true);
      expect(tasksResult).toHaveProperty('newValue', 20);
    });
  });
});

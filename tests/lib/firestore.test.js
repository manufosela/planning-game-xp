/**
 * Tests for Firestore CRUD service.
 * Mocks firebase/firestore to test the service logic without a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock firebase modules
// ---------------------------------------------------------------------------

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockServerTimestamp = vi.fn(() => 'SERVER_TIMESTAMP');
const mockRunTransaction = vi.fn();
const mockIncrement = vi.fn((n) => `INCREMENT(${n})`);

vi.mock('firebase/firestore', () => ({
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  addDoc: (...args) => mockAddDoc(...args),
  doc: (...args) => mockDoc(...args),
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  orderBy: (...args) => mockOrderBy(...args),
  serverTimestamp: () => mockServerTimestamp(),
  runTransaction: (...args) => mockRunTransaction(...args),
  increment: (n) => mockIncrement(n),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

vi.mock('@lib/firebase.js', () => ({
  getDb: () => 'MOCK_DB',
  projectsRef: () => 'PROJECTS_REF',
  cardsRef: (projectId) => `CARDS_REF_${projectId}`,
  teamRef: (projectId) => `TEAM_REF_${projectId}`,
}));

// ---------------------------------------------------------------------------
// Import service (after mocks)
// ---------------------------------------------------------------------------

const {
  getProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,
  getCards,
  getCard,
  createCard,
  updateCard,
  deleteCard,
  generateCardId,
  writeHistory,
  getTeam,
  addTeamMember,
  removeTeamMember,
  getTagRegistry,
  updateTagRegistry,
} = await import('../../src/lib/firestore.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {Record<string, unknown>} data */
function mockDocSnap(data, exists = true) {
  return {
    exists: () => exists,
    data: () => data,
    id: data?.id ?? 'mock-id',
  };
}

/** @param {Array<Record<string, unknown>>} docs */
function mockQuerySnap(docs) {
  return {
    docs: docs.map((d) => ({
      id: d.id ?? 'mock-id',
      data: () => d,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockImplementation((...args) => args);
  mockDoc.mockImplementation((...args) => args.join('/'));
  mockCollection.mockImplementation((...args) => args.join('/'));
  mockWhere.mockImplementation((...args) => ({ type: 'where', args }));
  mockOrderBy.mockImplementation((...args) => ({ type: 'orderBy', args }));
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('getProjects', () => {
  it('should return list of projects', async () => {
    mockGetDocs.mockResolvedValue(mockQuerySnap([
      { id: 'proj1', name: 'Project 1', abbreviation: 'P1' },
      { id: 'proj2', name: 'Project 2', abbreviation: 'P2' },
    ]));

    const result = await getProjects();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Project 1');
  });
});

describe('getProject', () => {
  it('should return a project by ID', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({ name: 'Test Project', abbreviation: 'TP' }));

    const result = await getProject('proj1');
    expect(result).not.toBeNull();
    expect(result.name).toBe('Test Project');
  });

  it('should return null for nonexistent project', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({}, false));

    const result = await getProject('nonexistent');
    expect(result).toBeNull();
  });
});

describe('createProject', () => {
  it('should create a project with defaults', async () => {
    mockDoc.mockReturnValue({ id: 'new-proj-id' });
    mockSetDoc.mockResolvedValue(undefined);

    const id = await createProject({ name: 'New', abbreviation: 'NEW', createdBy: 'uid-1', scoringSystem: '1-5' });
    expect(id).toBe('new-proj-id');
    expect(mockSetDoc).toHaveBeenCalledTimes(2); // project + counters
  });
});

describe('updateProject', () => {
  it('should update project fields', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);
    await updateProject('proj1', { name: 'Updated' });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  });
});

describe('archiveProject', () => {
  it('should set archived to true', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);
    await archiveProject('proj1');
    expect(mockUpdateDoc).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

describe('getCards', () => {
  it('should return all cards for a project', async () => {
    mockGetDocs.mockResolvedValue(mockQuerySnap([
      { cardId: 'PLN-TSK-0001', type: 'task', title: 'Task 1' },
      { cardId: 'PLN-BUG-0001', type: 'bug', title: 'Bug 1' },
    ]));

    const result = await getCards('proj1');
    expect(result).toHaveLength(2);
    expect(result[0].cardId).toBe('PLN-TSK-0001');
  });

  it('should apply type filter', async () => {
    mockGetDocs.mockResolvedValue(mockQuerySnap([
      { cardId: 'PLN-TSK-0001', type: 'task' },
    ]));

    await getCards('proj1', { type: 'task' });
    expect(mockWhere).toHaveBeenCalledWith('type', '==', 'task');
  });

  it('should apply multiple filters', async () => {
    mockGetDocs.mockResolvedValue(mockQuerySnap([]));

    await getCards('proj1', { type: 'task', status: 'To Do', year: 2026 });
    expect(mockWhere).toHaveBeenCalledTimes(3);
  });
});

describe('getCard', () => {
  it('should return a card by ID', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({ cardId: 'PLN-TSK-0001', title: 'Test' }));

    const result = await getCard('proj1', 'PLN-TSK-0001');
    expect(result).not.toBeNull();
    expect(result.cardId).toBe('PLN-TSK-0001');
  });

  it('should return null for nonexistent card', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({}, false));

    const result = await getCard('proj1', 'PLN-TSK-9999');
    expect(result).toBeNull();
  });
});

describe('deleteCard', () => {
  it('should move card to trash and delete original', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({ cardId: 'PLN-TSK-0001', title: 'Test' }));
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);

    await deleteCard('proj1', 'PLN-TSK-0001');
    expect(mockSetDoc).toHaveBeenCalledTimes(1); // trash write
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1); // original delete
  });

  it('should throw for nonexistent card', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({}, false));

    await expect(deleteCard('proj1', 'PLN-TSK-9999')).rejects.toThrow('not found');
  });
});

// ---------------------------------------------------------------------------
// Card ID generation
// ---------------------------------------------------------------------------

describe('generateCardId', () => {
  it('should generate formatted card ID', async () => {
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      const tx = {
        get: vi.fn().mockResolvedValue(mockDocSnap({ task: 5 })),
        update: vi.fn(),
      };
      return fn(tx);
    });

    const id = await generateCardId('proj1', 'task', 'PLN');
    expect(id).toBe('PLN-TSK-0006');
  });

  it('should throw for unknown card type', async () => {
    await expect(generateCardId('proj1', 'invalid', 'PLN')).rejects.toThrow('Unknown card type');
  });

  it('should throw if counter doc not found', async () => {
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      const tx = {
        get: vi.fn().mockResolvedValue(mockDocSnap({}, false)),
        update: vi.fn(),
      };
      return fn(tx);
    });

    await expect(generateCardId('proj1', 'task', 'PLN')).rejects.toThrow('Counter document');
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe('writeHistory', () => {
  it('should write a history entry', async () => {
    mockAddDoc.mockResolvedValue({ id: 'history-1' });

    await writeHistory('proj1', 'PLN-TSK-0001', { uid: 'uid-1', name: 'John' }, { status: { from: 'To Do', to: 'In Progress' } });
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

describe('getTeam', () => {
  it('should return team members', async () => {
    mockGetDocs.mockResolvedValue(mockQuerySnap([
      { id: 'dev_001', name: 'Alice', email: 'alice@test.com', role: 'developer', active: true },
    ]));

    const result = await getTeam('proj1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });
});

describe('addTeamMember', () => {
  it('should add a member and update project count', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-member' });
    mockUpdateDoc.mockResolvedValue(undefined);

    const id = await addTeamMember('proj1', { name: 'Bob', email: 'bob@test.com', role: 'developer', active: true });
    expect(id).toBe('new-member');
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1); // count update
  });
});

describe('removeTeamMember', () => {
  it('should remove a member and update project count', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({ role: 'developer' }));
    mockDeleteDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);

    await removeTeamMember('proj1', 'dev_001');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  });

  it('should throw for nonexistent member', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({}, false));
    await expect(removeTeamMember('proj1', 'dev_999')).rejects.toThrow('not found');
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe('getTagRegistry', () => {
  it('should return tags from settings', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({ tags: [{ name: 'INFRA', color: '#6366f1' }] }));

    const result = await getTagRegistry('proj1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('INFRA');
  });

  it('should return empty array if no tags doc', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap({}, false));

    const result = await getTagRegistry('proj1');
    expect(result).toEqual([]);
  });
});

describe('updateTagRegistry', () => {
  it('should write tags', async () => {
    mockSetDoc.mockResolvedValue(undefined);

    await updateTagRegistry('proj1', [{ name: 'NEW', color: '#ff0000' }]);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });
});

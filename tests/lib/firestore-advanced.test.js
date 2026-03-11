/**
 * Tests for advanced Firestore CRUD operations (plans, ADRs, configs, users, trash, reports).
 * Mocks firebase/firestore to test service logic without a real database.
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
const mockDoc = vi.fn((...args) => args.join('/'));
const mockCollection = vi.fn((...args) => args.join('/'));
const mockQuery = vi.fn((...args) => args[0]);
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
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getAdrs,
  createAdr,
  updateAdr,
  deleteAdr,
  getConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
  getConfigVersions,
  getUsers,
  provisionUser,
  deleteUser,
  getTrash,
  restoreFromTrash,
  permanentDelete,
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
});

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

describe('Plans CRUD', () => {
  it('getPlans should query the plans subcollection', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'p1', title: 'Plan A', status: 'draft' },
      { id: 'p2', title: 'Plan B', status: 'accepted' },
    ]));

    const result = await getPlans('proj1');
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Plan A');
    expect(mockCollection).toHaveBeenCalledWith('MOCK_DB', 'projects', 'proj1', 'plans');
  });

  it('createPlan should add a document with timestamps', async () => {
    mockAddDoc.mockResolvedValueOnce({ id: 'new-plan' });

    const result = await createPlan('proj1', {
      title: 'Test Plan',
      objective: 'Testing',
      status: 'draft',
      phases: [],
      createdBy: 'user1',
    });

    expect(result).toBe('new-plan');
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const callArgs = mockAddDoc.mock.calls[0][1];
    expect(callArgs.title).toBe('Test Plan');
    expect(callArgs.createdAt).toBe('SERVER_TIMESTAMP');
    expect(callArgs.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('updatePlan should update with serverTimestamp', async () => {
    await updatePlan('proj1', 'plan1', { title: 'Updated Title' });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const callArgs = mockUpdateDoc.mock.calls[0][1];
    expect(callArgs.title).toBe('Updated Title');
    expect(callArgs.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('deletePlan should delete the document', async () => {
    await deletePlan('proj1', 'plan1');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ADRs
// ---------------------------------------------------------------------------

describe('ADRs CRUD', () => {
  it('getAdrs should return ADR list for project', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'adr1', title: 'Use Firebase', status: 'accepted' },
    ]));

    const result = await getAdrs('proj1');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Use Firebase');
  });

  it('createAdr should add ADR with timestamps', async () => {
    mockAddDoc.mockResolvedValueOnce({ id: 'new-adr' });

    const result = await createAdr('proj1', {
      title: 'ADR-001',
      context: 'We need X',
      decision: 'Use Y',
      consequences: 'Good and bad',
      status: 'proposed',
      createdBy: 'user1',
    });

    expect(result).toBe('new-adr');
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
  });

  it('updateAdr should update with serverTimestamp', async () => {
    await updateAdr('proj1', 'adr1', { status: 'accepted' });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc.mock.calls[0][1].updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('deleteAdr should delete the document', async () => {
    await deleteAdr('proj1', 'adr1');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Global Config
// ---------------------------------------------------------------------------

describe('Global Config CRUD', () => {
  it('getConfigs should filter by type when provided', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'c1', type: 'agent', name: 'BecarIA' },
    ]));

    const result = await getConfigs({ type: 'agent' });
    expect(result).toHaveLength(1);
    expect(mockWhere).toHaveBeenCalledWith('type', '==', 'agent');
  });

  it('getConfig should return single config by ID', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap({ id: 'c1', name: 'Test Config', type: 'prompt' }));

    const result = await getConfig('c1');
    expect(result).not.toBeNull();
    expect(result.name).toBe('Test Config');
  });

  it('getConfig should return null for non-existent config', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap({}, false));

    const result = await getConfig('nonexistent');
    expect(result).toBeNull();
  });

  it('createConfig should set version to 1', async () => {
    mockAddDoc.mockResolvedValueOnce({ id: 'new-config' });

    await createConfig({ type: 'instruction', name: 'Test', description: '', content: 'Content', createdBy: 'u1' });
    expect(mockAddDoc.mock.calls[0][1].version).toBe(1);
  });

  it('updateConfig should increment version for guidelines', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap({
      type: 'guideline',
      version: 3,
      content: 'old content',
      updatedAt: 'OLD_TIMESTAMP',
    }));
    mockAddDoc.mockResolvedValueOnce({ id: 'version-entry' });

    await updateConfig('cfg1', { content: 'new content' }, { uid: 'user1', name: 'User' });

    // Should save version history
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    // Should update with incremented version
    expect(mockUpdateDoc.mock.calls[0][1].version).toBe(4);
  });

  it('updateConfig should not increment version for non-guidelines', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap({
      type: 'agent',
      version: 2,
      content: 'old',
    }));

    await updateConfig('cfg2', { content: 'new' }, { uid: 'user1', name: 'User' });
    expect(mockUpdateDoc.mock.calls[0][1].version).toBe(2);
    // Should not save history
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('getConfigVersions should return version history', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'v1', version: 2, content: 'v2 content' },
      { id: 'v2', version: 1, content: 'v1 content' },
    ]));

    const result = await getConfigVersions('cfg1');
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe('Users', () => {
  it('getUsers should return all users', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'user' },
    ]));

    const result = await getUsers();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('provisionUser should create user with defaults', async () => {
    mockAddDoc.mockResolvedValueOnce({ id: 'new-user' });

    const result = await provisionUser({
      name: 'Bob',
      email: 'bob@test.com',
      role: 'user',
    });

    expect(result).toBe('new-user');
    const data = mockAddDoc.mock.calls[0][1];
    expect(data.name).toBe('Bob');
    expect(data.preferences).toBeDefined();
    expect(data.preferences.theme).toBe('system');
  });

  it('deleteUser should delete document', async () => {
    await deleteUser('u1');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

describe('Trash', () => {
  it('getTrash should return trashed cards for project', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'PLN-TSK-0001', title: 'Deleted Task', type: 'task' },
    ]));

    const result = await getTrash('proj1');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Deleted Task');
  });

  it('restoreFromTrash should move card back and delete from trash', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap({
      id: 'PLN-TSK-0001',
      title: 'Task to Restore',
      type: 'task',
      deletedAt: 'DELETED_TIMESTAMP',
    }));

    await restoreFromTrash('proj1', 'PLN-TSK-0001');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);

    // Should not include deletedAt in restored card
    const restoredData = mockSetDoc.mock.calls[0][1];
    expect(restoredData.deletedAt).toBeUndefined();
  });

  it('restoreFromTrash should throw if card not found', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap({}, false));

    await expect(restoreFromTrash('proj1', 'missing')).rejects.toThrow('not found');
  });

  it('permanentDelete should delete from trash collection', async () => {
    await permanentDelete('proj1', 'PLN-TSK-0001');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

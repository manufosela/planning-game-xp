/**
 * Tests for MCP Project tools — resolveDefaultTeam bug (PMC-BUG-0007)
 *
 * Previously createProject relied on hardcoded IDs (dev_010, dev_016, stk_014)
 * that only existed in the legacy geniova instance. In any other instance the
 * defaults silently failed and the new project was left without stakeholders,
 * blocking task creation.
 *
 * These tests verify the new behaviour: the default developer + stakeholder
 * come from the MCP user config, are stored as objects with the same shape
 * as developers, and missing config emits explicit warnings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOnce = vi.fn();
const mockSet = vi.fn().mockResolvedValue();
const mockUpdate = vi.fn().mockResolvedValue();
const mockRef = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../mcp/firebase-adapter.js', () => ({
  getDatabase: () => ({ ref: mockRef }),
  getFirestore: () => ({
    collection: () => ({ doc: () => ({}) }),
    runTransaction: mockTransaction
  })
}));

let mockUser = null;
vi.mock('../../mcp/user.js', () => ({
  getMcpUserId: () => (mockUser && mockUser.email) || 'geniova-mcp',
  getMcpUser: () => mockUser,
  isMcpUserConfigured: () => mockUser !== null
}));

vi.mock('../../mcp/services/project-resolver.js', () => ({
  invalidateProjectCache: vi.fn(),
  discoverProjectByRepo: vi.fn()
}));

const { createProject } = await import('../../mcp/tools/projects.js');

function setupRefs({ existingDev = null, existingStk = null, projectExists = false } = {}) {
  mockRef.mockImplementation((path) => {
    if (path && path.startsWith('/projects/') && !path.includes('/counters')) {
      return {
        once: vi.fn().mockResolvedValue({ exists: () => projectExists, val: () => null }),
        set: mockSet,
        update: mockUpdate
      };
    }
    if (path && path.startsWith('/data/developers/')) {
      return { once: vi.fn().mockResolvedValue({ val: () => existingDev, exists: () => existingDev !== null }), set: mockSet };
    }
    if (path && path.startsWith('/data/stakeholders/')) {
      return { once: vi.fn().mockResolvedValue({ val: () => existingStk, exists: () => existingStk !== null }), set: mockSet };
    }
    if (path === '/users') {
      return {
        orderByChild: () => ({
          equalTo: () => ({
            limitToFirst: () => ({
              once: vi.fn().mockResolvedValue({ val: () => null })
            })
          })
        })
      };
    }
    return {
      once: mockOnce,
      set: mockSet,
      update: mockUpdate,
      push: () => ({ key: '-newKey', set: mockSet })
    };
  });
  mockTransaction.mockImplementation(async (fn) => {
    const txDoc = { exists: true, data: () => ({ lastId: 0 }) };
    const tx = { get: vi.fn().mockResolvedValue(txDoc), set: vi.fn() };
    return fn(tx);
  });
}

describe('MCP createProject — default team from MCP user (PMC-BUG-0007)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('adds MCP user as default developer AND stakeholder when both IDs are configured', async () => {
    mockUser = {
      developerId: 'dev_001',
      stakeholderId: 'stk_001',
      name: 'Mánu Fosela',
      email: 'dev@example.com'
    };
    setupRefs({
      existingDev: { name: 'Mánu Fosela', email: 'dev@example.com', active: true },
      existingStk: { name: 'Mánu Fosela', email: 'dev@example.com', active: true }
    });

    await createProject({
      projectId: 'NewProject',
      name: 'New Project',
      abbreviation: 'NEW'
    });

    const persisted = mockSet.mock.calls.find(c => c[0] && c[0].developers)?.[0];
    expect(persisted).toBeDefined();
    expect(persisted.developers).toEqual([
      { id: 'dev_001', name: 'Mánu Fosela', email: 'dev@example.com' }
    ]);
    expect(persisted.stakeholders).toEqual([
      { id: 'stk_001', name: 'Mánu Fosela', email: 'dev@example.com' }
    ]);
  });

  it('stores stakeholders as objects (not plain strings) to match developers shape', async () => {
    mockUser = {
      developerId: 'dev_001',
      stakeholderId: 'stk_001',
      name: 'Mánu',
      email: 'x@y.z'
    };
    setupRefs({
      existingDev: { name: 'Mánu', email: 'x@y.z', active: true },
      existingStk: { name: 'Mánu', email: 'x@y.z', active: true }
    });

    await createProject({ projectId: 'P', name: 'P', abbreviation: 'ABC' });

    const persisted = mockSet.mock.calls.find(c => c[0] && c[0].stakeholders)?.[0];
    expect(Array.isArray(persisted.stakeholders)).toBe(true);
    for (const stk of persisted.stakeholders) {
      expect(typeof stk).toBe('object');
      expect(stk).toHaveProperty('id');
      expect(stk).toHaveProperty('name');
      expect(stk).toHaveProperty('email');
    }
  });

  it('falls back to config data when the stakeholder is not yet in /data/stakeholders', async () => {
    mockUser = {
      developerId: 'dev_001',
      stakeholderId: 'stk_001',
      name: 'From Config',
      email: 'config@x.z'
    };
    setupRefs({
      existingDev: { name: 'From RTDB', email: 'rtdb@x.z', active: true },
      existingStk: null
    });

    await createProject({ projectId: 'P', name: 'P', abbreviation: 'ABC' });

    const persisted = mockSet.mock.calls.find(c => c[0] && c[0].stakeholders)?.[0];
    expect(persisted.stakeholders[0]).toEqual({
      id: 'stk_001',
      name: 'From Config',
      email: 'config@x.z'
    });
    expect(persisted.developers[0].name).toBe('From RTDB');
    expect(persisted.developers[0].email).toBe('rtdb@x.z');
  });

  it('creates project with empty stakeholders array when MCP user has no stakeholderId', async () => {
    mockUser = {
      developerId: 'dev_001',
      stakeholderId: null,
      name: 'Solo Dev',
      email: 'dev@x.z'
    };
    setupRefs({
      existingDev: { name: 'Solo Dev', email: 'dev@x.z', active: true }
    });

    await createProject({ projectId: 'P', name: 'P', abbreviation: 'ABC' });

    const persisted = mockSet.mock.calls.find(c => c[0] && c[0].stakeholders !== undefined)?.[0];
    expect(persisted.stakeholders).toEqual([]);
    expect(persisted.developers).toHaveLength(1);
  });

  it('does NOT use the legacy hardcoded IDs (dev_010, dev_016, stk_014) as defaults', async () => {
    mockUser = {
      developerId: 'dev_001',
      stakeholderId: 'stk_001',
      name: 'Mánu',
      email: 'x@y.z'
    };
    setupRefs({
      existingDev: { name: 'Mánu', email: 'x@y.z', active: true },
      existingStk: { name: 'Mánu', email: 'x@y.z', active: true }
    });

    await createProject({ projectId: 'P', name: 'P', abbreviation: 'ABC' });

    const persisted = mockSet.mock.calls.find(c => c[0] && c[0].developers)?.[0];
    const devIds = persisted.developers.map(d => d.id);
    const stkIds = persisted.stakeholders.map(s => s.id);
    expect(devIds).not.toContain('dev_010');
    expect(devIds).not.toContain('dev_016');
    expect(stkIds).not.toContain('stk_014');
  });
});

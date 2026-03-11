/**
 * Tests for MCP Firestore service operations.
 *
 * All Firebase operations are mocked — these tests verify the logic
 * in the service layer without requiring a live Firebase connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
    increment: (n) => ({ _type: 'increment', value: n }),
  },
}));

// Mock the firebase-adapter module
const mockFirestoreInstance = {
  collection: vi.fn(),
  runTransaction: vi.fn(),
};

vi.mock('../../mcp/src/firebase-adapter.js', () => ({
  getFirestore: () => mockFirestoreInstance,
}));

// Import after mocks
const { serializeDoc } = await import('../../mcp/src/services/firestore-service.js');

describe('serializeDoc', () => {
  it('should pass through primitive values', () => {
    expect(serializeDoc({ name: 'test', count: 42, active: true }))
      .toEqual({ name: 'test', count: 42, active: true });
  });

  it('should convert Timestamp objects to ISO strings', () => {
    const mockTimestamp = {
      toDate: () => new Date('2026-01-15T10:00:00Z'),
    };
    const result = serializeDoc({ createdAt: mockTimestamp, name: 'test' });
    expect(result.createdAt).toBe('2026-01-15T10:00:00.000Z');
    expect(result.name).toBe('test');
  });

  it('should handle nested objects', () => {
    const mockTimestamp = {
      toDate: () => new Date('2026-02-20T14:30:00Z'),
    };
    const result = serializeDoc({
      developer: { id: 'dev_001', name: 'Alice' },
      pipeline: { branch: 'main', mergedAt: mockTimestamp },
    });
    expect(result.developer).toEqual({ id: 'dev_001', name: 'Alice' });
    expect(result.pipeline.branch).toBe('main');
    expect(result.pipeline.mergedAt).toBe('2026-02-20T14:30:00.000Z');
  });

  it('should handle arrays', () => {
    const mockTimestamp = {
      toDate: () => new Date('2026-03-01T00:00:00Z'),
    };
    const result = serializeDoc({
      commits: [
        { hash: 'abc123', date: mockTimestamp },
        { hash: 'def456', date: '2026-03-02' },
      ],
    });
    expect(result.commits[0].hash).toBe('abc123');
    expect(result.commits[0].date).toBe('2026-03-01T00:00:00.000Z');
    expect(result.commits[1].date).toBe('2026-03-02');
  });

  it('should return null/undefined as-is', () => {
    expect(serializeDoc(null)).toBe(null);
    expect(serializeDoc(undefined)).toBe(undefined);
  });

  it('should handle empty objects', () => {
    expect(serializeDoc({})).toEqual({});
  });
});

describe('Firestore service module structure', () => {
  it('should export all expected functions', async () => {
    const service = await import('../../mcp/src/services/firestore-service.js');

    // Projects
    expect(typeof service.getProjects).toBe('function');
    expect(typeof service.getProject).toBe('function');
    expect(typeof service.createProject).toBe('function');
    expect(typeof service.updateProject).toBe('function');
    expect(typeof service.discoverProjectByRepo).toBe('function');

    // Cards
    expect(typeof service.getCards).toBe('function');
    expect(typeof service.getCard).toBe('function');
    expect(typeof service.createCard).toBe('function');
    expect(typeof service.updateCard).toBe('function');
    expect(typeof service.generateCardId).toBe('function');
    expect(typeof service.writeHistory).toBe('function');

    // Team
    expect(typeof service.getTeam).toBe('function');
    expect(typeof service.addTeamMember).toBe('function');
    expect(typeof service.removeTeamMember).toBe('function');

    // Sprints
    expect(typeof service.getSprints).toBe('function');

    // Plans
    expect(typeof service.getPlans).toBe('function');
    expect(typeof service.getPlan).toBe('function');
    expect(typeof service.createPlan).toBe('function');
    expect(typeof service.updatePlan).toBe('function');
    expect(typeof service.deletePlan).toBe('function');

    // Plan Proposals
    expect(typeof service.getPlanProposals).toBe('function');
    expect(typeof service.getPlanProposal).toBe('function');
    expect(typeof service.createPlanProposal).toBe('function');
    expect(typeof service.updatePlanProposal).toBe('function');
    expect(typeof service.deletePlanProposal).toBe('function');

    // ADRs
    expect(typeof service.getAdrs).toBe('function');
    expect(typeof service.getAdr).toBe('function');
    expect(typeof service.createAdr).toBe('function');
    expect(typeof service.updateAdr).toBe('function');
    expect(typeof service.deleteAdr).toBe('function');

    // Global Config
    expect(typeof service.getGlobalConfigs).toBe('function');
    expect(typeof service.getGlobalConfig).toBe('function');
    expect(typeof service.createGlobalConfig).toBe('function');
    expect(typeof service.updateGlobalConfig).toBe('function');
    expect(typeof service.deleteGlobalConfig).toBe('function');

    // Users
    expect(typeof service.getUsers).toBe('function');
    expect(typeof service.provisionUser).toBe('function');
    expect(typeof service.deleteUser).toBe('function');
  });
});

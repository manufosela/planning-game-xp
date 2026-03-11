/**
 * Tests for Zod validation schemas.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCard,
  validatePartialCard,
  getStatusesForType,
  getSchemaForType,
  taskSchema,
  bugSchema,
  epicSchema,
  sprintSchema,
  proposalSchema,
  qaSchema,
  CARD_TYPES,
  TASK_STATUSES,
  BUG_STATUSES,
  BUG_PRIORITIES,
} from '../../src/schemas/cards.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date();

const baseFields = {
  cardId: 'PLN-TSK-0001',
  title: 'Fix login bug',
  description: 'Users cannot log in',
  year: 2026,
  createdAt: now,
  createdBy: 'uid-123',
  updatedAt: now,
  updatedBy: 'uid-123',
  tags: ['INFRA'],
};

const validTask = {
  ...baseFields,
  type: 'task',
  status: 'To Do',
  userStory: { role: 'developer', goal: 'fix the login', benefit: 'users can access the app' },
  acceptanceCriteria: [{ given: 'a user', when: 'they click login', then: 'they are authenticated' }],
  devPoints: 3,
  businessPoints: 4,
  priority: 133,
};

const validBug = {
  ...baseFields,
  cardId: 'PLN-BUG-0001',
  type: 'bug',
  status: 'Created',
  bugPriority: 'USER EXPERIENCE ISSUE',
  registeredAt: now,
};

const validEpic = {
  ...baseFields,
  cardId: 'PLN-EPC-0001',
  type: 'epic',
  status: 'Active',
  color: '#6366f1',
};

const validSprint = {
  ...baseFields,
  cardId: 'PLN-SPR-0001',
  type: 'sprint',
  status: 'Active',
  startDate: now,
  endDate: now,
  locked: false,
  goals: ['Deliver auth feature'],
};

const validProposal = {
  ...baseFields,
  cardId: 'PLN-PRP-0001',
  type: 'proposal',
  status: 'Pending',
  userStory: { role: 'user', goal: 'see dashboard', benefit: 'track progress' },
};

const validQA = {
  ...baseFields,
  cardId: 'PLN-QAI-0001',
  type: 'qa',
  status: 'Pending',
  suite: 'Auth',
  steps: ['Open login page', 'Enter credentials', 'Click submit'],
  expectedResult: 'User is redirected to dashboard',
};

// ---------------------------------------------------------------------------
// validateCard — full card validation
// ---------------------------------------------------------------------------

describe('validateCard', () => {
  it('should validate a valid task', () => {
    const result = validateCard(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('task');
      expect(result.data.cardId).toBe('PLN-TSK-0001');
    }
  });

  it('should validate a valid bug', () => {
    const result = validateCard(validBug);
    expect(result.success).toBe(true);
  });

  it('should validate a valid epic', () => {
    const result = validateCard(validEpic);
    expect(result.success).toBe(true);
  });

  it('should validate a valid sprint', () => {
    const result = validateCard(validSprint);
    expect(result.success).toBe(true);
  });

  it('should validate a valid proposal', () => {
    const result = validateCard(validProposal);
    expect(result.success).toBe(true);
  });

  it('should validate a valid QA card', () => {
    const result = validateCard(validQA);
    expect(result.success).toBe(true);
  });

  it('should reject a task without title', () => {
    const result = validateCard({ ...validTask, title: '' });
    expect(result.success).toBe(false);
  });

  it('should reject a task with invalid status', () => {
    const result = validateCard({ ...validTask, status: 'InvalidStatus' });
    expect(result.success).toBe(false);
  });

  it('should reject a task without user story', () => {
    const { userStory, ...noStory } = validTask;
    const result = validateCard(noStory);
    expect(result.success).toBe(false);
  });

  it('should reject a task with devPoints out of range', () => {
    const result = validateCard({ ...validTask, devPoints: 0 });
    expect(result.success).toBe(false);
    const result2 = validateCard({ ...validTask, devPoints: 6 });
    expect(result2.success).toBe(false);
  });

  it('should reject a task with empty acceptance criteria', () => {
    const result = validateCard({ ...validTask, acceptanceCriteria: [] });
    expect(result.success).toBe(false);
  });

  it('should reject a bug with invalid bugPriority', () => {
    const result = validateCard({ ...validBug, bugPriority: 'CRITICAL' });
    expect(result.success).toBe(false);
  });

  it('should reject an epic with invalid hex color', () => {
    const result = validateCard({ ...validEpic, color: 'red' });
    expect(result.success).toBe(false);
  });

  it('should accept an epic without color', () => {
    const { color, ...noColor } = validEpic;
    const result = validateCard(noColor);
    expect(result.success).toBe(true);
  });

  it('should reject a QA card without suite', () => {
    const result = validateCard({ ...validQA, suite: '' });
    expect(result.success).toBe(false);
  });

  it('should reject a QA card with empty steps', () => {
    const result = validateCard({ ...validQA, steps: [] });
    expect(result.success).toBe(false);
  });

  it('should reject an unknown card type', () => {
    const result = validateCard({ ...validTask, type: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('should reject year below 2020', () => {
    const result = validateCard({ ...validTask, year: 2019 });
    expect(result.success).toBe(false);
  });

  it('should accept task with optional fields', () => {
    const result = validateCard({
      ...validTask,
      developer: { id: 'dev_001', name: 'John', email: 'john@test.com' },
      pipeline: { branch: 'feat/login', prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 },
      tags: ['INFRA', 'AUTH'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject task with invalid developer email', () => {
    const result = validateCard({
      ...validTask,
      developer: { id: 'dev_001', name: 'John', email: 'not-an-email' },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePartialCard — partial updates
// ---------------------------------------------------------------------------

describe('validatePartialCard', () => {
  it('should validate a partial task update', () => {
    const result = validatePartialCard('task', { title: 'Updated title', devPoints: 2 });
    expect(result.success).toBe(true);
  });

  it('should validate an empty update', () => {
    const result = validatePartialCard('task', {});
    expect(result.success).toBe(true);
  });

  it('should reject invalid field in partial update', () => {
    const result = validatePartialCard('task', { devPoints: 10 });
    expect(result.success).toBe(false);
  });

  it('should return error for unknown type', () => {
    const result = validatePartialCard('unknown', { title: 'test' });
    expect(result.success).toBe(false);
  });

  it('should validate partial bug update', () => {
    const result = validatePartialCard('bug', { rootCause: 'Race condition' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getStatusesForType
// ---------------------------------------------------------------------------

describe('getStatusesForType', () => {
  it('should return task statuses', () => {
    const statuses = getStatusesForType('task');
    expect(statuses).toEqual(TASK_STATUSES);
    expect(statuses).toContain('To Do');
    expect(statuses).toContain('In Progress');
  });

  it('should return bug statuses', () => {
    const statuses = getStatusesForType('bug');
    expect(statuses).toEqual(BUG_STATUSES);
    expect(statuses).toContain('Created');
    expect(statuses).toContain('Fixed');
  });

  it('should return empty array for unknown type', () => {
    const statuses = getStatusesForType('unknown');
    expect(statuses).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSchemaForType
// ---------------------------------------------------------------------------

describe('getSchemaForType', () => {
  it('should return schema for each valid type', () => {
    for (const type of CARD_TYPES) {
      const schema = getSchemaForType(type);
      expect(schema).toBeDefined();
    }
  });

  it('should return undefined for unknown type', () => {
    const schema = getSchemaForType('unknown');
    expect(schema).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('should have 6 card types', () => {
    expect(CARD_TYPES).toHaveLength(6);
  });

  it('should have 7 task statuses', () => {
    expect(TASK_STATUSES).toHaveLength(7);
  });

  it('should have 6 bug priorities', () => {
    expect(BUG_PRIORITIES).toHaveLength(6);
  });
});

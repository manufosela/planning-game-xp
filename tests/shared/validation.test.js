/**
 * Tests for shared/validation.js
 */
import { describe, it, expect } from 'vitest';

const {
  validateEntityId,
  validateEntityIds,
  collectEntityIdIssues,
  hasValidValue,
  validateBugFields,
  validateBugStatusTransition,
  collectBugValidationIssues,
  validateTaskFields,
  collectTaskValidationIssues,
  validateStatusTransition,
  collectValidationIssues,
  validateCommitsField,
  appendCommitsToCard,
  migrateImplementationPlan,
  validateImplementationPlan
} = await import('../../shared/validation.js');

describe('validateEntityId', () => {
  it('should accept valid developer ID', () => {
    expect(() => validateEntityId('developer', 'dev_001')).not.toThrow();
  });

  it('should reject invalid developer ID', () => {
    expect(() => validateEntityId('developer', 'stk_001')).toThrow(/must start with "dev_"/);
  });

  it('should accept empty values', () => {
    expect(() => validateEntityId('developer', '')).not.toThrow();
    expect(() => validateEntityId('developer', null)).not.toThrow();
  });

  it('should skip unknown fields', () => {
    expect(() => validateEntityId('unknownField', 'whatever')).not.toThrow();
  });
});

describe('validateEntityIds', () => {
  it('should validate all entity IDs in data', () => {
    expect(() => validateEntityIds({ developer: 'dev_001', validator: 'stk_001' })).not.toThrow();
  });

  it('should throw on first invalid ID', () => {
    expect(() => validateEntityIds({ developer: 'stk_001' })).toThrow(/must start with "dev_"/);
  });
});

describe('collectEntityIdIssues', () => {
  it('should return empty array for valid data', () => {
    const issues = collectEntityIdIssues({ developer: 'dev_001' });
    expect(issues).toEqual([]);
  });

  it('should collect issues for invalid IDs', () => {
    const issues = collectEntityIdIssues({ developer: 'stk_001' });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_ENTITY_ID');
  });
});

describe('hasValidValue', () => {
  it('should return true for non-empty string', () => {
    expect(hasValidValue({ title: 'Test' }, 'title')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(hasValidValue({ title: '' }, 'title')).toBe(false);
  });

  it('should return false for null', () => {
    expect(hasValidValue({ title: null }, 'title')).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(hasValidValue({}, 'title')).toBe(false);
  });

  it('should handle acceptanceCriteria string', () => {
    expect(hasValidValue({ acceptanceCriteria: 'Some criteria' }, 'acceptanceCriteria')).toBe(true);
    expect(hasValidValue({ acceptanceCriteria: '' }, 'acceptanceCriteria')).toBe(false);
  });

  it('should handle acceptanceCriteriaStructured', () => {
    expect(hasValidValue({
      acceptanceCriteriaStructured: [{ given: 'context', when: 'action', then: 'result' }]
    }, 'acceptanceCriteria')).toBe(true);
  });

  it('should reject empty acceptanceCriteriaStructured', () => {
    expect(hasValidValue({ acceptanceCriteriaStructured: [] }, 'acceptanceCriteria')).toBe(false);
  });

  it('should handle numeric fields', () => {
    expect(hasValidValue({ devPoints: 3 }, 'devPoints')).toBe(true);
    expect(hasValidValue({ devPoints: 0 }, 'devPoints')).toBe(false);
    expect(hasValidValue({ devPoints: null }, 'devPoints')).toBe(false);
  });
});

describe('validateBugFields', () => {
  it('should accept valid bug status', () => {
    expect(() => validateBugFields({ status: 'Created' })).not.toThrow();
  });

  it('should reject invalid bug status', () => {
    expect(() => validateBugFields({ status: 'In Progress' })).toThrow(/Invalid bug status/);
  });

  it('should reject invalid bug priority', () => {
    expect(() => validateBugFields({ priority: 'High' })).toThrow(/Invalid bug priority/);
  });

  it('should accept valid bug priority', () => {
    expect(() => validateBugFields({ priority: 'Application Blocker' })).not.toThrow();
  });
});

describe('validateBugStatusTransition', () => {
  it('should allow normal transitions', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed' }
    )).not.toThrow();
  });

  it('should require fields when closing a bug', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified' },
      { status: 'Closed' }
    )).toThrow(/Cannot close bug/);
  });

  it('should allow closing with all fields', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified' },
      {
        status: 'Closed',
        commits: [{ hash: 'abc', message: 'fix', date: '2024-01-01', author: 'dev' }],
        rootCause: 'Bad logic',
        resolution: 'Fixed the logic'
      }
    )).not.toThrow();
  });
});

describe('validateTaskFields', () => {
  it('should accept valid task status', () => {
    expect(() => validateTaskFields({ status: 'In Progress' })).not.toThrow();
  });

  it('should reject invalid task status', () => {
    expect(() => validateTaskFields({ status: 'Created' })).toThrow(/Invalid task status/);
  });
});

describe('validateStatusTransition (MCP context)', () => {
  it('should reject Done&Validated from MCP', () => {
    expect(() => validateStatusTransition(
      { status: 'To Validate' },
      { status: 'Done&Validated' },
      'task'
    )).toThrow(/MCP cannot/);
  });

  it('should skip for non-task types', () => {
    expect(() => validateStatusTransition(
      { status: 'Created' },
      { status: 'Done&Validated' },
      'bug'
    )).not.toThrow();
  });

  it('should require fields when leaving To Do', () => {
    expect(() => validateStatusTransition(
      { status: 'To Do' },
      { status: 'In Progress' },
      'task'
    )).toThrow(/missing required fields/);
  });
});

describe('validateCommitsField', () => {
  it('should accept valid commits array', () => {
    const result = validateCommitsField([
      { hash: 'abc123', message: 'feat: test', date: '2024-01-01T00:00:00Z', author: 'dev@example.com' }
    ]);
    expect(result.valid).toBe(true);
  });

  it('should reject non-array', () => {
    const result = validateCommitsField('not an array');
    expect(result.valid).toBe(false);
  });

  it('should accept empty array', () => {
    const result = validateCommitsField([]);
    expect(result.valid).toBe(true);
  });

  it('should reject commit missing hash', () => {
    const result = validateCommitsField([{ message: 'test', date: '2024-01-01', author: 'dev' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('COMMIT_MISSING_HASH');
  });
});

describe('appendCommitsToCard', () => {
  it('should append new commits', () => {
    const card = { commits: [{ hash: 'abc' }] };
    const result = appendCommitsToCard(card, [{ hash: 'def' }]);
    expect(result).toHaveLength(2);
  });

  it('should deduplicate by hash', () => {
    const card = { commits: [{ hash: 'abc' }] };
    const result = appendCommitsToCard(card, [{ hash: 'abc' }]);
    expect(result).toHaveLength(1);
  });

  it('should handle card without commits', () => {
    const result = appendCommitsToCard({}, [{ hash: 'abc' }]);
    expect(result).toHaveLength(1);
  });
});

describe('migrateImplementationPlan', () => {
  it('should return null for falsy input', () => {
    expect(migrateImplementationPlan(null)).toBeNull();
    expect(migrateImplementationPlan(undefined)).toBeNull();
  });

  it('should return object as-is', () => {
    const plan = { approach: 'test' };
    expect(migrateImplementationPlan(plan)).toBe(plan);
  });

  it('should migrate string to object', () => {
    const result = migrateImplementationPlan('Use strategy X');
    expect(result.approach).toBe('Use strategy X');
    expect(result.planStatus).toBe('proposed');
  });
});

describe('validateImplementationPlan', () => {
  it('should accept null plan', () => {
    expect(validateImplementationPlan(null).valid).toBe(true);
  });

  it('should require approach', () => {
    const result = validateImplementationPlan({ steps: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_APPROACH');
  });

  it('should validate step statuses', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [{ description: 'step', status: 'invalid' }]
    });
    expect(result.valid).toBe(false);
  });
});

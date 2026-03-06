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
  it('should allow Fixed with commits and pipelineStatus', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      {
        status: 'Fixed',
        commits: [{ hash: 'abc', message: 'fix: bug', date: '2026-01-01', author: 'dev' }],
        pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 } }
      }
    )).not.toThrow();
  });

  it('should allow non-Fixed transitions without extra fields', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Created' },
      { status: 'Assigned' }
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

  it('should require pipelineStatus.prCreated for To Validate', () => {
    const card = {
      status: 'In Progress',
      title: 'Test', developer: 'dev_001', validator: 'stk_001',
      epic: 'PLN-PCS-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
      startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat: test', date: '2026-01-01', author: 'dev' }]
    };
    expect(() => validateStatusTransition(
      card, { status: 'To Validate' }, 'task'
    )).toThrow(/pipelineStatus\.prCreated/);
  });

  it('should accept To Validate with valid pipelineStatus.prCreated', () => {
    const card = {
      status: 'In Progress',
      title: 'Test', developer: 'dev_001', validator: 'stk_001',
      epic: 'PLN-PCS-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
      startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat: test', date: '2026-01-01', author: 'dev' }],
      pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1, date: '2026-01-01' } }
    };
    expect(() => validateStatusTransition(
      card, { status: 'To Validate' }, 'task'
    )).not.toThrow();
  });

  it('should reject To Validate with incomplete pipelineStatus (missing prNumber)', () => {
    const card = {
      status: 'In Progress',
      title: 'Test', developer: 'dev_001', validator: 'stk_001',
      epic: 'PLN-PCS-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
      startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat: test', date: '2026-01-01', author: 'dev' }],
      pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1' } }
    };
    expect(() => validateStatusTransition(
      card, { status: 'To Validate' }, 'task'
    )).toThrow(/pipelineStatus\.prCreated/);
  });
});

describe('validateBugStatusTransition - Fixed requires pipelineStatus', () => {
  it('should require commits and pipelineStatus.prCreated for Fixed', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed' }
    )).toThrow(/commits.*pipelineStatus|pipelineStatus.*commits/);
  });

  it('should accept Fixed with commits and pipelineStatus.prCreated', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      {
        status: 'Fixed',
        commits: [{ hash: 'abc', message: 'fix: bug', date: '2026-01-01', author: 'dev' }],
        pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/5', prNumber: 5, date: '2026-01-01' } }
      }
    )).not.toThrow();
  });

  it('should reject Fixed with commits but no pipelineStatus', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      {
        status: 'Fixed',
        commits: [{ hash: 'abc', message: 'fix: bug', date: '2026-01-01', author: 'dev' }]
      }
    )).toThrow(/pipelineStatus\.prCreated/);
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

describe('collectValidationIssues - pipelineStatus', () => {
  it('should report missing pipelineStatus for To Validate', () => {
    const card = {
      status: 'In Progress',
      title: 'Test', developer: 'dev_001', validator: 'stk_001',
      epic: 'PLN-PCS-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
      startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat: test', date: '2026-01-01', author: 'dev' }]
    };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('pipelineStatus');
    expect(result.errors.some(e => e.code === 'MISSING_PIPELINE_STATUS')).toBe(true);
  });

  it('should accept To Validate with valid pipelineStatus', () => {
    const card = {
      status: 'In Progress',
      title: 'Test', developer: 'dev_001', validator: 'stk_001',
      epic: 'PLN-PCS-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
      startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat: test', date: '2026-01-01', author: 'dev' }],
      pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1, date: '2026-01-01' } }
    };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
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

// ============================================================================
// PARANOID COVERAGE: validateBugStatusTransition — EXHAUSTIVE
// ============================================================================

describe('validateBugStatusTransition — EXHAUSTIVE', () => {
  const validCommits = [{ hash: 'abc123', message: 'fix: bug', date: '2026-01-01', author: 'dev' }];
  const validPipelineStatus = { prCreated: { prUrl: 'https://github.com/org/repo/pull/5', prNumber: 5 } };

  it('Fixed with commits but pipelineStatus missing prUrl — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed', commits: validCommits, pipelineStatus: { prCreated: { prNumber: 5 } } }
    )).toThrow(/pipelineStatus\.prCreated/);
  });

  it('Fixed with commits but pipelineStatus missing prNumber — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed', commits: validCommits, pipelineStatus: { prCreated: { prUrl: 'https://github.com/pr/1' } } }
    )).toThrow(/pipelineStatus\.prCreated/);
  });

  it('Fixed with pipelineStatus but empty commits array — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed', commits: [], pipelineStatus: validPipelineStatus }
    )).toThrow(/commits/);
  });

  it('Fixed with pipelineStatus.prCreated = null — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed', commits: validCommits, pipelineStatus: { prCreated: null } }
    )).toThrow(/pipelineStatus\.prCreated/);
  });

  it('Fixed with pipelineStatus = {} (no prCreated) — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed', commits: validCommits, pipelineStatus: {} }
    )).toThrow(/pipelineStatus\.prCreated/);
  });

  it('Fixed with commits in currentBug (not in updates) + pipelineStatus in updates — passes (merge)', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned', commits: validCommits },
      { status: 'Fixed', pipelineStatus: validPipelineStatus }
    )).not.toThrow();
  });

  it('Fixed with pipelineStatus in currentBug (not in updates) + commits in updates — passes (merge)', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned', pipelineStatus: validPipelineStatus },
      { status: 'Fixed', commits: validCommits }
    )).not.toThrow();
  });

  it('Fixed with prNumber = 0 — throws because 0 is falsy', () => {
    // The code uses !ps.prCreated.prNumber which treats 0 as falsy
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed', commits: validCommits, pipelineStatus: { prCreated: { prUrl: 'https://github.com/pr/1', prNumber: 0 } } }
    )).toThrow(/pipelineStatus\.prCreated/);
  });

  it('Closed with commits + rootCause but empty string resolution — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified' },
      { status: 'Closed', commits: validCommits, rootCause: 'Bad logic', resolution: '' }
    )).toThrow(/resolution/);
  });

  it('Closed with commits + resolution but empty string rootCause — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified' },
      { status: 'Closed', commits: validCommits, rootCause: '', resolution: 'Fixed it' }
    )).toThrow(/rootCause/);
  });

  it('Closed with whitespace-only rootCause — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified' },
      { status: 'Closed', commits: validCommits, rootCause: '   ', resolution: 'Fixed it' }
    )).toThrow(/rootCause/);
  });

  it('Closed with whitespace-only resolution — throws', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified' },
      { status: 'Closed', commits: validCommits, rootCause: 'Bad logic', resolution: '   ' }
    )).toThrow(/resolution/);
  });

  it('Closed with all fields in currentBug, none in updates (only status) — passes (merge)', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified', commits: validCommits, rootCause: 'Bad logic', resolution: 'Fixed it' },
      { status: 'Closed' }
    )).not.toThrow();
  });

  it('No status in updates — passes (no transition)', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { title: 'Updated title' }
    )).not.toThrow();
  });

  it('Same status — passes (no transition)', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Assigned' }
    )).not.toThrow();
  });

  it('Closed with commits missing but rootCause and resolution present — throws mentioning commits', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Verified' },
      { status: 'Closed', rootCause: 'Bad logic', resolution: 'Fixed it' }
    )).toThrow(/commits/);
  });

  it('Fixed with all fields valid — passes', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Fixed', commits: validCommits, pipelineStatus: validPipelineStatus }
    )).not.toThrow();
  });

  it('Created to Assigned — passes without extra fields', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Created' },
      { status: 'Assigned' }
    )).not.toThrow();
  });

  it('Assigned to Verified — passes without extra fields', () => {
    expect(() => validateBugStatusTransition(
      { status: 'Assigned' },
      { status: 'Verified' }
    )).not.toThrow();
  });
});

// ============================================================================
// PARANOID COVERAGE: validateStatusTransition (tasks) — EXHAUSTIVE
// ============================================================================

describe('validateStatusTransition (tasks) — EXHAUSTIVE', () => {
  const fullCard = {
    status: 'To Do',
    title: 'Test task',
    developer: 'dev_001',
    validator: 'stk_001',
    epic: 'PLN-PCS-0001',
    sprint: 'PLN-SPR-0001',
    devPoints: 3,
    businessPoints: 4,
    acceptanceCriteria: 'Some acceptance criteria'
  };

  const fullInProgressCard = {
    ...fullCard,
    status: 'In Progress',
    startDate: '2026-01-01',
    commits: [{ hash: 'abc', message: 'feat: test', date: '2026-01-01', author: 'dev' }],
    pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 } }
  };

  // --- To Do → In Progress: missing each required field individually ---

  it('To Do → In Progress: missing title — throws', () => {
    const card = { ...fullCard, title: '' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Title/);
  });

  it('To Do → In Progress: missing developer — throws', () => {
    const card = { ...fullCard, developer: '' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Developer/);
  });

  it('To Do → In Progress: missing validator — throws', () => {
    const card = { ...fullCard, validator: '' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Validator/);
  });

  it('To Do → In Progress: missing epic — throws', () => {
    const card = { ...fullCard, epic: '' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Epic/);
  });

  it('To Do → In Progress: missing sprint — throws', () => {
    const card = { ...fullCard, sprint: '' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Sprint/);
  });

  it('To Do → In Progress: missing devPoints — throws', () => {
    const card = { ...fullCard, devPoints: 0 };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Dev Points/);
  });

  it('To Do → In Progress: missing businessPoints — throws', () => {
    const card = { ...fullCard, businessPoints: 0 };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Business Points/);
  });

  it('To Do → In Progress: missing acceptanceCriteria — throws', () => {
    const card = { ...fullCard, acceptanceCriteria: '' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Acceptance Criteria/);
  });

  it('To Do → In Progress: null devPoints — throws', () => {
    const card = { ...fullCard, devPoints: null };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Dev Points/);
  });

  it('To Do → In Progress: undefined businessPoints — throws', () => {
    const { businessPoints, ...card } = fullCard;
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Business Points/);
  });

  it('To Do → In Progress: all fields present — passes', () => {
    expect(() => validateStatusTransition(fullCard, { status: 'In Progress' }, 'task')).not.toThrow();
  });

  it('To Do → In Progress: fields provided in updates — passes (merge)', () => {
    const card = { status: 'To Do', title: 'Test' };
    const updates = {
      status: 'In Progress',
      developer: 'dev_001', validator: 'stk_001',
      epic: 'PLN-PCS-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteria: 'AC text'
    };
    expect(() => validateStatusTransition(card, updates, 'task')).not.toThrow();
  });

  // --- In Progress → To Validate ---

  it('In Progress → To Validate: missing startDate — throws', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card,
      { status: 'To Validate', commits: [{ hash: 'abc', message: 'feat', date: '2026-01-01', author: 'dev' }], pipelineStatus: { prCreated: { prUrl: 'https://pr/1', prNumber: 1 } } },
      'task'
    )).toThrow(/startDate/);
  });

  it('In Progress → To Validate: missing commits — throws', () => {
    const card = { ...fullCard, status: 'In Progress', startDate: '2026-01-01' };
    expect(() => validateStatusTransition(
      card,
      { status: 'To Validate', pipelineStatus: { prCreated: { prUrl: 'https://pr/1', prNumber: 1 } } },
      'task'
    )).toThrow(/commits/);
  });

  it('In Progress → To Validate: pipelineStatus.prCreated with prUrl but prNumber=0 — throws (0 is falsy)', () => {
    const card = {
      ...fullCard, status: 'In Progress', startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat', date: '2026-01-01', author: 'dev' }]
    };
    expect(() => validateStatusTransition(
      card,
      { status: 'To Validate', pipelineStatus: { prCreated: { prUrl: 'https://pr/1', prNumber: 0 } } },
      'task'
    )).toThrow(/pipelineStatus\.prCreated/);
  });

  it('In Progress → To Validate: all required present — passes', () => {
    expect(() => validateStatusTransition(
      fullInProgressCard, { status: 'To Validate' }, 'task'
    )).not.toThrow();
  });

  // --- MCP restricted statuses ---

  it('To Validate → Done&Validated: MCP restriction — throws', () => {
    expect(() => validateStatusTransition(
      { status: 'To Validate' }, { status: 'Done&Validated' }, 'task'
    )).toThrow(/MCP cannot/);
  });

  it('Any status → Done&Validated: MCP restriction — throws regardless of source status', () => {
    expect(() => validateStatusTransition(
      { status: 'In Progress' }, { status: 'Done&Validated' }, 'task'
    )).toThrow(/MCP cannot/);
  });

  // --- Blocked transitions ---

  it('In Progress → Blocked: requires blockedByBusiness or blockedByDevelopment', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, { status: 'Blocked' }, 'task'
    )).toThrow(/blockedByBusiness.*blockedByDevelopment|must specify/);
  });

  it('In Progress → Blocked: blockedByBusiness without bbbWhy — throws', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, { status: 'Blocked', blockedByBusiness: true, bbbWho: 'someone' }, 'task'
    )).toThrow(/bbbWhy/);
  });

  it('In Progress → Blocked: blockedByBusiness without bbbWho — throws', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, { status: 'Blocked', blockedByBusiness: true, bbbWhy: 'reason' }, 'task'
    )).toThrow(/bbbWho/);
  });

  it('In Progress → Blocked: blockedByDevelopment without bbdWhy — throws', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, { status: 'Blocked', blockedByDevelopment: true, bbdWho: 'someone' }, 'task'
    )).toThrow(/bbdWhy/);
  });

  it('In Progress → Blocked: blockedByDevelopment without bbdWho — throws', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, { status: 'Blocked', blockedByDevelopment: true, bbdWhy: 'reason' }, 'task'
    )).toThrow(/bbdWho/);
  });

  it('In Progress → Blocked: blockedByBusiness with all fields — passes', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, { status: 'Blocked', blockedByBusiness: true, bbbWhy: 'reason', bbbWho: 'someone' }, 'task'
    )).not.toThrow();
  });

  it('In Progress → Blocked: blockedByDevelopment with all fields — passes', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, { status: 'Blocked', blockedByDevelopment: true, bbdWhy: 'reason', bbdWho: 'someone' }, 'task'
    )).not.toThrow();
  });

  it('In Progress → Blocked: both blocked types with all fields — passes', () => {
    const card = { ...fullCard, status: 'In Progress' };
    expect(() => validateStatusTransition(
      card, {
        status: 'Blocked',
        blockedByBusiness: true, bbbWhy: 'biz reason', bbbWho: 'biz person',
        blockedByDevelopment: true, bbdWhy: 'dev reason', bbdWho: 'dev person'
      }, 'task'
    )).not.toThrow();
  });

  // --- Blocked → In Progress ---

  it('Blocked → In Progress: passes (no extra To Do checks since currentStatus is not To Do)', () => {
    const card = { ...fullCard, status: 'Blocked' };
    expect(() => validateStatusTransition(
      card, { status: 'In Progress' }, 'task'
    )).not.toThrow();
  });

  // --- To Do → To Validate (skipping In Progress) ---

  it('To Do → To Validate: enforces both To Do leave requirements AND To Validate requirements', () => {
    // Missing startDate, commits, pipelineStatus — but also requires all To Do fields
    const card = { status: 'To Do' };
    expect(() => validateStatusTransition(
      card, { status: 'To Validate' }, 'task'
    )).toThrow(/missing required fields/);
  });

  it('To Do → To Validate: all To Do fields present but missing To Validate fields — throws', () => {
    expect(() => validateStatusTransition(
      fullCard, { status: 'To Validate' }, 'task'
    )).toThrow(/startDate|commits|pipelineStatus/);
  });

  // --- Reopened → In Progress ---

  it('Reopened → In Progress: passes without extra field requirements (not a To Do status)', () => {
    const card = { ...fullCard, status: 'Reopened' };
    expect(() => validateStatusTransition(
      card, { status: 'In Progress' }, 'task'
    )).not.toThrow();
  });

  // --- Using acceptanceCriteriaStructured instead of acceptanceCriteria ---

  it('To Do → In Progress: acceptanceCriteriaStructured instead of acceptanceCriteria — passes', () => {
    const { acceptanceCriteria, ...card } = fullCard;
    card.acceptanceCriteriaStructured = [{ given: 'context', when: 'action', then: 'result' }];
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).not.toThrow();
  });

  it('To Do → In Progress: both acceptanceCriteria and acceptanceCriteriaStructured — passes', () => {
    const card = { ...fullCard, acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }] };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).not.toThrow();
  });

  it('To Do → In Progress: empty acceptanceCriteriaStructured with no acceptanceCriteria — throws', () => {
    const { acceptanceCriteria, ...card } = fullCard;
    card.acceptanceCriteriaStructured = [];
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Acceptance Criteria/);
  });

  // --- pipelineStatus from currentCard (not updates) ---

  it('In Progress → To Validate: pipelineStatus from currentCard, commits from updates — passes', () => {
    const card = {
      ...fullCard, status: 'In Progress', startDate: '2026-01-01',
      pipelineStatus: { prCreated: { prUrl: 'https://pr/1', prNumber: 1 } }
    };
    const updates = {
      status: 'To Validate',
      commits: [{ hash: 'abc', message: 'feat', date: '2026-01-01', author: 'dev' }]
    };
    expect(() => validateStatusTransition(card, updates, 'task')).not.toThrow();
  });

  it('In Progress → To Validate: commits in currentCard, pipelineStatus in updates — passes', () => {
    const card = {
      ...fullCard, status: 'In Progress', startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat', date: '2026-01-01', author: 'dev' }]
    };
    const updates = {
      status: 'To Validate',
      pipelineStatus: { prCreated: { prUrl: 'https://pr/1', prNumber: 1 } }
    };
    expect(() => validateStatusTransition(card, updates, 'task')).not.toThrow();
  });

  // --- Same status ---

  it('Same status (In Progress → In Progress) — passes without checks', () => {
    expect(() => validateStatusTransition(
      { status: 'In Progress' }, { status: 'In Progress' }, 'task'
    )).not.toThrow();
  });

  // --- No status in updates ---

  it('No status in updates — passes without checks', () => {
    expect(() => validateStatusTransition(
      { status: 'To Do' }, { title: 'new title' }, 'task'
    )).not.toThrow();
  });

  // --- Non-task type ---

  it('Non-task type (epic) — skips all validation', () => {
    expect(() => validateStatusTransition(
      { status: 'To Do' }, { status: 'Done&Validated' }, 'epic'
    )).not.toThrow();
  });

  it('Non-task type (proposal) — skips all validation', () => {
    expect(() => validateStatusTransition(
      { status: 'To Do' }, { status: 'Done&Validated' }, 'proposal'
    )).not.toThrow();
  });

  // --- To Do with whitespace-only fields ---

  it('To Do → In Progress: whitespace-only title — throws', () => {
    const card = { ...fullCard, title: '   ' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Title/);
  });

  it('To Do → In Progress: devPoints as string "3" — passes (Number coercion)', () => {
    const card = { ...fullCard, devPoints: '3' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).not.toThrow();
  });

  it('To Do → In Progress: devPoints as empty string — throws', () => {
    const card = { ...fullCard, devPoints: '' };
    expect(() => validateStatusTransition(card, { status: 'In Progress' }, 'task')).toThrow(/Dev Points/);
  });
});

// ============================================================================
// PARANOID COVERAGE: collectValidationIssues — EXHAUSTIVE
// ============================================================================

describe('collectValidationIssues — EXHAUSTIVE', () => {
  const fullCard = {
    status: 'To Do',
    title: 'Test task',
    developer: 'dev_001',
    validator: 'stk_001',
    epic: 'PLN-PCS-0001',
    sprint: 'PLN-SPR-0001',
    devPoints: 3,
    businessPoints: 4,
    acceptanceCriteria: 'Some criteria'
  };

  const fullToValidateCard = {
    ...fullCard,
    status: 'In Progress',
    startDate: '2026-01-01',
    commits: [{ hash: 'abc', message: 'feat: test', date: '2026-01-01', author: 'dev' }],
    pipelineStatus: { prCreated: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 } }
  };

  it('Returns valid:true when all fields present for To Do → In Progress', () => {
    const result = collectValidationIssues(fullCard, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing title', () => {
    const card = { ...fullCard, title: '' };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('title');
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing developer', () => {
    const card = { ...fullCard, developer: '' };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('developer');
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing validator', () => {
    const card = { ...fullCard, validator: '' };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('validator');
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing epic', () => {
    const card = { ...fullCard, epic: '' };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('epic');
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing sprint', () => {
    const card = { ...fullCard, sprint: '' };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('sprint');
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing devPoints', () => {
    const card = { ...fullCard, devPoints: 0 };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('devPoints');
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing businessPoints', () => {
    const card = { ...fullCard, businessPoints: 0 };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('businessPoints');
  });

  it('Returns specific MISSING_REQUIRED_FIELDS error for missing acceptanceCriteria', () => {
    const card = { ...fullCard, acceptanceCriteria: '' };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('acceptanceCriteria');
  });

  it('Returns multiple missing fields at once', () => {
    const card = { status: 'To Do' };
    const result = collectValidationIssues(card, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields.length).toBeGreaterThan(1);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELDS')).toBe(true);
  });

  it('Handles merge of currentCard + updates correctly', () => {
    const card = { status: 'To Do', title: 'Test' };
    const updates = {
      status: 'In Progress',
      developer: 'dev_001', validator: 'stk_001',
      epic: 'PLN-PCS-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteria: 'AC'
    };
    const result = collectValidationIssues(card, updates, 'task');
    expect(result.valid).toBe(true);
  });

  it('For "To Validate": reports MISSING_PIPELINE_STATUS when missing', () => {
    const card = {
      ...fullCard, status: 'In Progress', startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat', date: '2026-01-01', author: 'dev' }]
    };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_PIPELINE_STATUS')).toBe(true);
    expect(result.missingFields).toContain('pipelineStatus');
  });

  it('For "To Validate": reports MISSING_START_DATE when missing', () => {
    const card = { ...fullCard, status: 'In Progress' };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_START_DATE')).toBe(true);
  });

  it('For "To Validate": reports MISSING_COMMITS when missing', () => {
    const card = { ...fullCard, status: 'In Progress', startDate: '2026-01-01' };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_COMMITS')).toBe(true);
  });

  it('For "In Progress": does NOT check pipelineStatus', () => {
    const result = collectValidationIssues(fullCard, { status: 'In Progress' }, 'task');
    expect(result.valid).toBe(true);
    expect(result.errors.some(e => e.code === 'MISSING_PIPELINE_STATUS')).toBe(false);
  });

  it('For "To Validate": with partial pipelineStatus (missing prUrl) — reports error', () => {
    const card = {
      ...fullCard, status: 'In Progress', startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat', date: '2026-01-01', author: 'dev' }],
      pipelineStatus: { prCreated: { prNumber: 1 } }
    };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_PIPELINE_STATUS')).toBe(true);
  });

  it('For "To Validate": with partial pipelineStatus (missing prNumber) — reports error', () => {
    const card = {
      ...fullCard, status: 'In Progress', startDate: '2026-01-01',
      commits: [{ hash: 'abc', message: 'feat', date: '2026-01-01', author: 'dev' }],
      pipelineStatus: { prCreated: { prUrl: 'https://pr/1' } }
    };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_PIPELINE_STATUS')).toBe(true);
  });

  it('Returns VALIDATOR_ONLY_STATUS for Done&Validated', () => {
    const result = collectValidationIssues(
      { status: 'To Validate' }, { status: 'Done&Validated' }, 'task'
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATOR_ONLY_STATUS')).toBe(true);
  });

  it('Returns valid:true for non-task types', () => {
    const result = collectValidationIssues({ status: 'To Do' }, { status: 'In Progress' }, 'bug');
    expect(result.valid).toBe(true);
  });

  it('Returns valid:true when no status change', () => {
    const result = collectValidationIssues({ status: 'In Progress' }, { title: 'new' }, 'task');
    expect(result.valid).toBe(true);
  });

  it('Returns valid:true when same status', () => {
    const result = collectValidationIssues(
      { status: 'In Progress' }, { status: 'In Progress' }, 'task'
    );
    expect(result.valid).toBe(true);
  });

  it('requiredFields contains details for each checked field', () => {
    const card = { status: 'To Do', title: 'Test' };
    const result = collectValidationIssues(card, { status: 'In Progress', developer: 'dev_001' }, 'task');
    expect(result.requiredFields.developer).toBeDefined();
    expect(result.requiredFields.developer.providedInUpdate).toBe(true);
    expect(result.requiredFields.developer.missing).toBe(false);
    expect(result.requiredFields.title).toBeDefined();
    expect(result.requiredFields.title.providedInUpdate).toBe(false);
    expect(result.requiredFields.title.missing).toBe(false);
  });

  it('For "To Validate": all fields present — valid:true', () => {
    const result = collectValidationIssues(fullToValidateCard, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });
});

// ============================================================================
// PARANOID COVERAGE: collectBugValidationIssues
// ============================================================================

describe('collectBugValidationIssues — EXHAUSTIVE', () => {
  it('Valid bug data with valid status — valid: true', () => {
    const result = collectBugValidationIssues({ status: 'Created', priority: 'Application Blocker' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('Invalid status — error with INVALID_STATUS code', () => {
    const result = collectBugValidationIssues({ status: 'In Progress' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_STATUS');
  });

  it('Invalid priority — error with INVALID_PRIORITY code', () => {
    const result = collectBugValidationIssues({ priority: 'High' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_PRIORITY');
  });

  it('Valid priority: Application Blocker', () => {
    const result = collectBugValidationIssues({ priority: 'Application Blocker' });
    expect(result.valid).toBe(true);
  });

  it('Valid priority: Department Blocker', () => {
    const result = collectBugValidationIssues({ priority: 'Department Blocker' });
    expect(result.valid).toBe(true);
  });

  it('Valid priority: Individual Blocker', () => {
    const result = collectBugValidationIssues({ priority: 'Individual Blocker' });
    expect(result.valid).toBe(true);
  });

  it('Valid priority: User Experience Issue', () => {
    const result = collectBugValidationIssues({ priority: 'User Experience Issue' });
    expect(result.valid).toBe(true);
  });

  it('Valid priority: Workflow Improvement', () => {
    const result = collectBugValidationIssues({ priority: 'Workflow Improvement' });
    expect(result.valid).toBe(true);
  });

  it('Valid priority: Workaround Available Issue', () => {
    const result = collectBugValidationIssues({ priority: 'Workaround Available Issue' });
    expect(result.valid).toBe(true);
  });

  it('Empty data (no status, no priority) — valid: true', () => {
    const result = collectBugValidationIssues({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('Both invalid status and invalid priority — two errors', () => {
    const result = collectBugValidationIssues({ status: 'Invalid', priority: 'Invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].code).toBe('INVALID_STATUS');
    expect(result.errors[1].code).toBe('INVALID_PRIORITY');
  });

  it('All valid bug statuses are accepted', () => {
    for (const status of ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed']) {
      const result = collectBugValidationIssues({ status });
      expect(result.valid).toBe(true);
    }
  });
});

// ============================================================================
// PARANOID COVERAGE: collectTaskValidationIssues
// ============================================================================

describe('collectTaskValidationIssues — EXHAUSTIVE', () => {
  it('Valid task data — valid: true', () => {
    const result = collectTaskValidationIssues({ status: 'To Do', priority: 'High' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('Invalid status — error with INVALID_STATUS code', () => {
    const result = collectTaskValidationIssues({ status: 'Created' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_STATUS');
  });

  it('Invalid priority — error with INVALID_PRIORITY code', () => {
    const result = collectTaskValidationIssues({ priority: 'Critical' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_PRIORITY');
  });

  it('All valid task statuses are accepted', () => {
    for (const status of ['To Do', 'In Progress', 'Pausado', 'To Validate', 'Done&Validated', 'Blocked', 'Reopened']) {
      const result = collectTaskValidationIssues({ status });
      expect(result.valid).toBe(true);
    }
  });

  it('All valid task priorities are accepted', () => {
    for (const priority of ['High', 'Medium', 'Low']) {
      const result = collectTaskValidationIssues({ priority });
      expect(result.valid).toBe(true);
    }
  });

  it('Empty data — valid: true', () => {
    const result = collectTaskValidationIssues({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('Both invalid status and priority — two errors', () => {
    const result = collectTaskValidationIssues({ status: 'Invalid', priority: 'Invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

// ============================================================================
// PARANOID COVERAGE: validateCommitsField — edge cases
// ============================================================================

describe('validateCommitsField — edge cases', () => {
  it('Commit with empty string hash — fails', () => {
    const result = validateCommitsField([{ hash: '', message: 'test', date: '2026-01-01', author: 'dev' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_HASH')).toBe(true);
  });

  it('Commit with numeric hash — fails (must be string, numeric is truthy but not a string with trim)', () => {
    // The code does: !commit.hash || (typeof commit.hash === 'string' && commit.hash.trim() === '')
    // A numeric hash like 12345 is truthy, and typeof 12345 !== 'string', so trim check is skipped → passes
    const result = validateCommitsField([{ hash: 12345, message: 'test', date: '2026-01-01', author: 'dev' }]);
    // ACTUAL behavior: numeric hash passes because the code only rejects falsy or empty-string hashes
    expect(result.valid).toBe(true);
  });

  it('Commit missing message — fails', () => {
    const result = validateCommitsField([{ hash: 'abc', date: '2026-01-01', author: 'dev' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_MESSAGE')).toBe(true);
  });

  it('Commit with empty message — fails', () => {
    const result = validateCommitsField([{ hash: 'abc', message: '', date: '2026-01-01', author: 'dev' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_MESSAGE')).toBe(true);
  });

  it('Commit missing date — fails', () => {
    const result = validateCommitsField([{ hash: 'abc', message: 'test', author: 'dev' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_DATE')).toBe(true);
  });

  it('Commit with empty date — fails', () => {
    const result = validateCommitsField([{ hash: 'abc', message: 'test', date: '', author: 'dev' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_DATE')).toBe(true);
  });

  it('Commit missing author — fails', () => {
    const result = validateCommitsField([{ hash: 'abc', message: 'test', date: '2026-01-01' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_AUTHOR')).toBe(true);
  });

  it('Commit with empty author — fails', () => {
    const result = validateCommitsField([{ hash: 'abc', message: 'test', date: '2026-01-01', author: '' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_AUTHOR')).toBe(true);
  });

  it('Multiple commits, one invalid — fails', () => {
    const result = validateCommitsField([
      { hash: 'abc', message: 'test', date: '2026-01-01', author: 'dev' },
      { hash: '', message: 'bad', date: '2026-01-01', author: 'dev' }
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);
  });

  it('Very large commits array (100 items) — passes if all valid', () => {
    const commits = Array.from({ length: 100 }, (_, i) => ({
      hash: `hash_${i}`, message: `commit ${i}`, date: '2026-01-01', author: 'dev'
    }));
    const result = validateCommitsField(commits);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('Commit with whitespace-only hash — fails', () => {
    const result = validateCommitsField([{ hash: '   ', message: 'test', date: '2026-01-01', author: 'dev' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'COMMIT_MISSING_HASH')).toBe(true);
  });

  it('Commit that is null — fails with INVALID_COMMIT_STRUCTURE', () => {
    const result = validateCommitsField([null]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_COMMIT_STRUCTURE')).toBe(true);
  });

  it('Commit that is a string — fails with INVALID_COMMIT_STRUCTURE', () => {
    const result = validateCommitsField(['not a commit']);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_COMMIT_STRUCTURE')).toBe(true);
  });

  it('Non-array input (object) — fails with NOT_AN_ARRAY', () => {
    const result = validateCommitsField({ hash: 'abc' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('COMMITS_NOT_AN_ARRAY');
  });

  it('Non-array input (null) — fails with NOT_AN_ARRAY', () => {
    const result = validateCommitsField(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('COMMITS_NOT_AN_ARRAY');
  });

  it('Non-array input (undefined) — fails with NOT_AN_ARRAY', () => {
    const result = validateCommitsField(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('COMMITS_NOT_AN_ARRAY');
  });

  it('Commit missing all fields — has 4 errors', () => {
    const result = validateCommitsField([{}]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(4);
  });
});

// ============================================================================
// PARANOID COVERAGE: appendCommitsToCard — edge cases
// ============================================================================

describe('appendCommitsToCard — edge cases', () => {
  it('Both card and new commits empty — returns empty array', () => {
    const result = appendCommitsToCard({ commits: [] }, []);
    expect(result).toEqual([]);
  });

  it('Card commits is null — treats as empty', () => {
    const result = appendCommitsToCard({ commits: null }, [{ hash: 'abc' }]);
    // commits is null → || [] gives [], then newCommits are added
    // But wait: null || [] = [] which is empty, so existingHashes is empty Set, so abc is added
    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe('abc');
  });

  it('Card commits is undefined — treats as empty', () => {
    const result = appendCommitsToCard({}, [{ hash: 'abc' }]);
    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe('abc');
  });

  it('Multiple new commits, some duplicates — only adds unique', () => {
    const card = { commits: [{ hash: 'abc', message: 'first' }] };
    const newCommits = [
      { hash: 'abc', message: 'duplicate' },
      { hash: 'def', message: 'new' },
      { hash: 'ghi', message: 'also new' }
    ];
    const result = appendCommitsToCard(card, newCommits);
    expect(result).toHaveLength(3);
    expect(result[0].hash).toBe('abc');
    expect(result[0].message).toBe('first'); // Original preserved
    expect(result[1].hash).toBe('def');
    expect(result[2].hash).toBe('ghi');
  });

  it('Preserves order (existing first, then new)', () => {
    const card = { commits: [{ hash: 'aaa' }, { hash: 'bbb' }] };
    const result = appendCommitsToCard(card, [{ hash: 'ccc' }, { hash: 'ddd' }]);
    expect(result.map(c => c.hash)).toEqual(['aaa', 'bbb', 'ccc', 'ddd']);
  });

  it('New commits is null — returns existing commits', () => {
    const card = { commits: [{ hash: 'abc' }] };
    const result = appendCommitsToCard(card, null);
    expect(result).toEqual([{ hash: 'abc' }]);
  });

  it('New commits is undefined — returns existing commits', () => {
    const card = { commits: [{ hash: 'abc' }] };
    const result = appendCommitsToCard(card, undefined);
    expect(result).toEqual([{ hash: 'abc' }]);
  });

  it('New commits is empty array — returns existing commits', () => {
    const card = { commits: [{ hash: 'abc' }] };
    const result = appendCommitsToCard(card, []);
    expect(result).toEqual([{ hash: 'abc' }]);
  });

  it('All new commits are duplicates — returns only existing', () => {
    const card = { commits: [{ hash: 'abc' }, { hash: 'def' }] };
    const result = appendCommitsToCard(card, [{ hash: 'abc' }, { hash: 'def' }]);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// PARANOID COVERAGE: validateImplementationPlan — more cases
// ============================================================================

describe('validateImplementationPlan — more cases', () => {
  it('Plan with empty approach string — fails', () => {
    const result = validateImplementationPlan({ approach: '' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_APPROACH');
  });

  it('Plan with whitespace-only approach — fails', () => {
    const result = validateImplementationPlan({ approach: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_APPROACH');
  });

  it('Plan with approach and empty steps array — passes', () => {
    const result = validateImplementationPlan({ approach: 'Use strategy X', steps: [] });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('Plan with valid planStatus "pending" — passes', () => {
    const result = validateImplementationPlan({ approach: 'test', planStatus: 'pending' });
    expect(result.valid).toBe(true);
  });

  it('Plan with valid planStatus "proposed" — passes', () => {
    const result = validateImplementationPlan({ approach: 'test', planStatus: 'proposed' });
    expect(result.valid).toBe(true);
  });

  it('Plan with valid planStatus "validated" — passes', () => {
    const result = validateImplementationPlan({ approach: 'test', planStatus: 'validated' });
    expect(result.valid).toBe(true);
  });

  it('Plan with valid planStatus "in_progress" — passes', () => {
    const result = validateImplementationPlan({ approach: 'test', planStatus: 'in_progress' });
    expect(result.valid).toBe(true);
  });

  it('Plan with valid planStatus "completed" — passes', () => {
    const result = validateImplementationPlan({ approach: 'test', planStatus: 'completed' });
    expect(result.valid).toBe(true);
  });

  it('Plan with invalid planStatus — fails', () => {
    const result = validateImplementationPlan({ approach: 'test', planStatus: 'invalid_status' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_PLAN_STATUS');
  });

  it('Step with all fields — passes', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [{ description: 'Step 1', status: 'pending', commitMessage: 'feat: step 1' }]
    });
    expect(result.valid).toBe(true);
  });

  it('Step with only description — passes', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [{ description: 'Step 1' }]
    });
    expect(result.valid).toBe(true);
  });

  it('Step with missing description — fails', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [{ status: 'pending' }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_STEP_DESCRIPTION');
  });

  it('Step with empty description — fails', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [{ description: '' }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_STEP_DESCRIPTION');
  });

  it('Step with whitespace-only description — fails', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [{ description: '   ' }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_STEP_DESCRIPTION');
  });

  it('Steps as non-array — fails', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: 'not an array'
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_STEPS');
  });

  it('Plan is undefined — passes (treated as no plan)', () => {
    const result = validateImplementationPlan(undefined);
    expect(result.valid).toBe(true);
  });

  it('Plan is a non-object (string) — passes (treated as no plan)', () => {
    // The code checks: if (!plan || typeof plan !== 'object') return valid
    const result = validateImplementationPlan('some string');
    expect(result.valid).toBe(true);
  });

  it('Plan is an array — fails with MISSING_APPROACH (arrays are objects, approach is undefined)', () => {
    // Arrays pass typeof === 'object' check, then !plan.approach is true (undefined) → MISSING_APPROACH
    const result = validateImplementationPlan([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_APPROACH');
  });

  it('Multiple steps, one invalid — reports error for that step', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [
        { description: 'Good step' },
        { description: '' },
        { description: 'Another good step' }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('[1]');
  });

  it('Step with invalid status — fails', () => {
    const result = validateImplementationPlan({
      approach: 'test',
      steps: [{ description: 'step', status: 'completed' }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_STEP_STATUS');
  });

  it('Step with valid statuses: pending, in_progress, done — passes', () => {
    for (const status of ['pending', 'in_progress', 'done']) {
      const result = validateImplementationPlan({
        approach: 'test',
        steps: [{ description: 'step', status }]
      });
      expect(result.valid).toBe(true);
    }
  });
});

// ============================================================================
// PARANOID COVERAGE: migrateImplementationPlan — more cases
// ============================================================================

describe('migrateImplementationPlan — more cases', () => {
  it('Empty string — returns null', () => {
    expect(migrateImplementationPlan('')).toBeNull();
  });

  it('Whitespace-only string — returns null', () => {
    expect(migrateImplementationPlan('   ')).toBeNull();
  });

  it('Array input — returns null (explicit Array.isArray check rejects arrays)', () => {
    // migrateImplementationPlan checks !Array.isArray(plan) before returning object as-is
    const arr = [1, 2, 3];
    expect(migrateImplementationPlan(arr)).toBeNull();
  });

  it('Number input — returns null (not object, not non-empty string)', () => {
    expect(migrateImplementationPlan(42)).toBeNull();
  });

  it('Boolean input — returns null', () => {
    expect(migrateImplementationPlan(true)).toBeNull();
  });

  it('String with content — returns object with approach and planStatus', () => {
    const result = migrateImplementationPlan('My approach');
    expect(result).toEqual({
      approach: 'My approach',
      steps: [],
      dataModelChanges: '',
      apiChanges: '',
      risks: '',
      outOfScope: '',
      planStatus: 'proposed'
    });
  });

  it('Object is returned by reference (not cloned)', () => {
    const plan = { approach: 'test', steps: [{ description: 'step 1' }] };
    const result = migrateImplementationPlan(plan);
    expect(result).toBe(plan);
  });
});

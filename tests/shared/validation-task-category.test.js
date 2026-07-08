/**
 * Integration tests for the task-category branch inside
 * shared/validation.js — the actual gate at the MCP boundary
 * (PLN-TSK-0354).
 */
import { describe, it, expect } from 'vitest';
import {
  validateStatusTransition,
  collectValidationIssues,
  validateTaskFields,
  collectTaskValidationIssues
} from '../../shared/validation.js';

const BASE_CARD = {
  cardId: 'RMR-TSK-0172',
  title: 'Ingest contributors',
  developer: 'dev_016',
  validator: 'stk_001',
  epic: 'RMR-EPC-0001',
  sprint: 'RMR-SPR-0002',
  devPoints: 2,
  businessPoints: 3,
  acceptanceCriteria: 'People populated with real contributors.',
  status: 'In Progress',
  startDate: '2026-07-08'
};

describe('validateStatusTransition — nocode branch', () => {
  it('rejects code task moving to To Validate without commits + PR (legacy)', () => {
    expect(() =>
      validateStatusTransition(BASE_CARD, { status: 'To Validate' }, 'task')
    ).toThrow(/commits/i);
  });

  it('accepts nocode task moving to To Validate with endDate + completionNote', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', endDate: '2026-07-08', completionNote: 'Ingested 47 real contributors from GitHub API into /people, deduped by email.' };
    expect(() =>
      validateStatusTransition(card, { status: 'To Validate' }, 'task')
    ).not.toThrow();
  });

  it('rejects nocode task without completionNote', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', endDate: '2026-07-08' };
    expect(() =>
      validateStatusTransition(card, { status: 'To Validate' }, 'task')
    ).toThrow(/completionNote/i);
  });

  it('rejects nocode task with completionNote too short', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', endDate: '2026-07-08', completionNote: 'too short' };
    expect(() =>
      validateStatusTransition(card, { status: 'To Validate' }, 'task')
    ).toThrow(/completionNote/i);
  });

  it('rejects nocode task without endDate', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', completionNote: 'x'.repeat(30) };
    expect(() =>
      validateStatusTransition(card, { status: 'To Validate' }, 'task')
    ).toThrow(/endDate/i);
  });

  it('nocode task does NOT require pipelineStatus.prCreated', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', endDate: '2026-07-08', completionNote: 'A long enough note describing the work.' };
    expect(() =>
      validateStatusTransition(card, { status: 'To Validate' }, 'task')
    ).not.toThrow();
  });

  it('legacy card without taskCategory is treated as code (retrocompat)', () => {
    const card = { ...BASE_CARD };
    delete card.taskCategory;
    expect(() =>
      validateStatusTransition(card, { status: 'To Validate' }, 'task')
    ).toThrow(/commits/i);
  });

  it('updates that flip category to nocode with completionNote in same call are accepted', () => {
    expect(() =>
      validateStatusTransition(BASE_CARD, {
        status: 'To Validate',
        taskCategory: 'nocode',
        endDate: '2026-07-08',
        completionNote: 'Marked as nocode and finalized: population complete.'
      }, 'task')
    ).not.toThrow();
  });
});

describe('collectValidationIssues — nocode branch (validateOnly path)', () => {
  it('returns MISSING_COMPLETION_NOTE for nocode without completionNote', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', endDate: '2026-07-08' };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('completionNote');
    expect(result.taskCategory).toBe('nocode');
    expect(result.errors.some(e => e.code === 'MISSING_COMPLETION_NOTE')).toBe(true);
  });

  it('returns MISSING_END_DATE for nocode without endDate', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', completionNote: 'x'.repeat(30) };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('endDate');
  });

  it('is valid for a nocode task with all fields', () => {
    const card = { ...BASE_CARD, taskCategory: 'nocode', endDate: '2026-07-08', completionNote: 'x'.repeat(30) };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
    expect(result.taskCategory).toBe('nocode');
  });

  it('reports taskCategory=code for legacy tasks', () => {
    const card = {
      ...BASE_CARD,
      commits: [{ hash: 'abc123', message: 'x', date: '2026-07-08T10:00:00Z', author: 'x' }],
      pipelineStatus: { prCreated: { prUrl: 'https://x/pull/1', prNumber: 1 } }
    };
    const result = collectValidationIssues(card, { status: 'To Validate' }, 'task');
    expect(result.valid).toBe(true);
    expect(result.taskCategory).toBe('code');
  });
});

describe('validateTaskFields / collectTaskValidationIssues — enum guards', () => {
  it('validateTaskFields throws on invalid taskCategory', () => {
    expect(() => validateTaskFields({ taskCategory: 'docs' })).toThrow(/taskCategory/i);
  });

  it('validateTaskFields throws on completionNote too short', () => {
    expect(() => validateTaskFields({ completionNote: 'short' })).toThrow(/completionNote/i);
  });

  it('validateTaskFields accepts valid enum values', () => {
    expect(() => validateTaskFields({ taskCategory: 'code' })).not.toThrow();
    expect(() => validateTaskFields({ taskCategory: 'nocode' })).not.toThrow();
  });

  it('validateTaskFields accepts undefined taskCategory (retrocompat)', () => {
    expect(() => validateTaskFields({})).not.toThrow();
  });

  it('collectTaskValidationIssues returns INVALID_TASK_CATEGORY for bad enum', () => {
    const r = collectTaskValidationIssues({ taskCategory: 'wrong' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'INVALID_TASK_CATEGORY')).toBe(true);
  });

  it('collectTaskValidationIssues returns INVALID_COMPLETION_NOTE for short string', () => {
    const r = collectTaskValidationIssues({ completionNote: 'x' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'INVALID_COMPLETION_NOTE')).toBe(true);
  });
});

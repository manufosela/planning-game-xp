/**
 * Unit tests for shared/task-category.js — the helper that decides which
 * fields are required to move a task to "To Validate" based on its
 * category (PLN-TSK-0354).
 */
import { describe, it, expect } from 'vitest';
import {
  TASK_CATEGORY_CODE,
  TASK_CATEGORY_NOCODE,
  TASK_CATEGORY_VALUES,
  TASK_CATEGORY_DEFAULT,
  COMPLETION_NOTE_MIN_LENGTH,
  getTaskCategory,
  isValidTaskCategory,
  resolveToValidateRequirements,
  requiresPipelineStatus,
  toValidateRequirementsByCategory,
  isValidCompletionNote
} from '../../shared/task-category.js';

describe('getTaskCategory', () => {
  it('returns "code" for a task without the field (legacy)', () => {
    expect(getTaskCategory({})).toBe('code');
  });

  it('returns "code" when the field is null / undefined / empty string', () => {
    expect(getTaskCategory({ taskCategory: null })).toBe('code');
    expect(getTaskCategory({ taskCategory: undefined })).toBe('code');
    expect(getTaskCategory({ taskCategory: '' })).toBe('code');
  });

  it('returns "nocode" only for the exact string', () => {
    expect(getTaskCategory({ taskCategory: 'nocode' })).toBe('nocode');
    expect(getTaskCategory({ taskCategory: 'NoCode' })).toBe('code');
    expect(getTaskCategory({ taskCategory: 'no-code' })).toBe('code');
  });

  it('returns "code" for any unknown value', () => {
    expect(getTaskCategory({ taskCategory: 'docs' })).toBe('code');
    expect(getTaskCategory({ taskCategory: 42 })).toBe('code');
  });

  it('handles null / undefined task', () => {
    expect(getTaskCategory(null)).toBe('code');
    expect(getTaskCategory(undefined)).toBe('code');
  });
});

describe('isValidTaskCategory', () => {
  it('accepts only the enum members', () => {
    expect(isValidTaskCategory('code')).toBe(true);
    expect(isValidTaskCategory('nocode')).toBe(true);
    expect(isValidTaskCategory('docs')).toBe(false);
    expect(isValidTaskCategory('')).toBe(false);
    expect(isValidTaskCategory(null)).toBe(false);
  });
});

describe('resolveToValidateRequirements', () => {
  const baseFields = ['title', 'developer', 'validator', 'epic', 'sprint', 'devPoints', 'businessPoints', 'acceptanceCriteria'];

  it('code (default) requires commits + startDate', () => {
    const fields = resolveToValidateRequirements({});
    expect(fields).toEqual([...baseFields, 'startDate', 'commits']);
  });

  it('code (explicit) requires commits + startDate', () => {
    const fields = resolveToValidateRequirements({ taskCategory: 'code' });
    expect(fields).toEqual([...baseFields, 'startDate', 'commits']);
  });

  it('nocode requires endDate + completionNote instead of commits', () => {
    const fields = resolveToValidateRequirements({ taskCategory: 'nocode' });
    expect(fields).toEqual([...baseFields, 'startDate', 'endDate', 'completionNote']);
    expect(fields).not.toContain('commits');
  });
});

describe('requiresPipelineStatus', () => {
  it('is true for code (default)', () => {
    expect(requiresPipelineStatus({})).toBe(true);
    expect(requiresPipelineStatus({ taskCategory: 'code' })).toBe(true);
  });

  it('is false for nocode', () => {
    expect(requiresPipelineStatus({ taskCategory: 'nocode' })).toBe(false);
  });
});

describe('toValidateRequirementsByCategory', () => {
  it('lists both variants for LLM discovery', () => {
    const rules = toValidateRequirementsByCategory();
    expect(rules).toHaveProperty('code');
    expect(rules).toHaveProperty('nocode');
    expect(rules.code).toContain('commits');
    expect(rules.code).toContain('pipelineStatus.prCreated');
    expect(rules.nocode).toContain('completionNote');
    expect(rules.nocode).not.toContain('commits');
    expect(rules.nocode).not.toContain('pipelineStatus.prCreated');
  });
});

describe('isValidCompletionNote', () => {
  it(`accepts strings with at least ${COMPLETION_NOTE_MIN_LENGTH} non-whitespace chars`, () => {
    const ok = 'x'.repeat(COMPLETION_NOTE_MIN_LENGTH);
    expect(isValidCompletionNote(ok)).toBe(true);
    expect(isValidCompletionNote('  ' + ok + '  ')).toBe(true);
  });

  it('rejects short strings', () => {
    expect(isValidCompletionNote('too short')).toBe(false);
    expect(isValidCompletionNote('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidCompletionNote(null)).toBe(false);
    expect(isValidCompletionNote(undefined)).toBe(false);
    expect(isValidCompletionNote(42)).toBe(false);
    expect(isValidCompletionNote({})).toBe(false);
  });
});

describe('exports', () => {
  it('exposes stable enum values', () => {
    expect(TASK_CATEGORY_CODE).toBe('code');
    expect(TASK_CATEGORY_NOCODE).toBe('nocode');
    expect(TASK_CATEGORY_VALUES).toEqual(['code', 'nocode']);
    expect(TASK_CATEGORY_DEFAULT).toBe('code');
    expect(COMPLETION_NOTE_MIN_LENGTH).toBeGreaterThanOrEqual(20);
  });
});

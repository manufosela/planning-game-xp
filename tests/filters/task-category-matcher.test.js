/**
 * Unit tests for the taskCategory filter matcher (PLN-TSK-0354).
 */
import { describe, it, expect } from 'vitest';
import { taskCategoryMatcher } from '../../public/js/filters/matchers/task-category-matcher.js';

describe('taskCategoryMatcher', () => {
  it('shows everything when the filter is empty', () => {
    expect(taskCategoryMatcher({ taskCategory: 'nocode' }, [])).toBe(true);
    expect(taskCategoryMatcher({ taskCategory: 'code' }, [])).toBe(true);
    expect(taskCategoryMatcher({}, undefined)).toBe(true);
  });

  it('filters to code-only', () => {
    expect(taskCategoryMatcher({ taskCategory: 'code' }, ['code'])).toBe(true);
    expect(taskCategoryMatcher({}, ['code'])).toBe(true); // legacy → code
    expect(taskCategoryMatcher({ taskCategory: 'nocode' }, ['code'])).toBe(false);
  });

  it('filters to nocode-only', () => {
    expect(taskCategoryMatcher({ taskCategory: 'nocode' }, ['nocode'])).toBe(true);
    expect(taskCategoryMatcher({ taskCategory: 'code' }, ['nocode'])).toBe(false);
    expect(taskCategoryMatcher({}, ['nocode'])).toBe(false);
  });

  it('allows explicit multi-select (both = same as empty)', () => {
    expect(taskCategoryMatcher({ taskCategory: 'code' }, ['code', 'nocode'])).toBe(true);
    expect(taskCategoryMatcher({ taskCategory: 'nocode' }, ['code', 'nocode'])).toBe(true);
    expect(taskCategoryMatcher({}, ['code', 'nocode'])).toBe(true);
  });

  it('handles null / undefined card gracefully', () => {
    expect(taskCategoryMatcher(null, ['nocode'])).toBe(false);
    expect(taskCategoryMatcher(undefined, ['code'])).toBe(true);
  });
});

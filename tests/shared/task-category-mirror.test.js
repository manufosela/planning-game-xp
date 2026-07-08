/**
 * Enforce that public/js/utils/task-category.js is a byte-identical
 * mirror of shared/task-category.js. Same single-source-of-truth pattern
 * we use for sprint-naming and board-columns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SHARED = resolve(ROOT, 'shared', 'task-category.js');
const MIRROR = resolve(ROOT, 'public', 'js', 'utils', 'task-category.js');

describe('task-category mirror', () => {
  it('public/js/utils/task-category.js matches shared/task-category.js byte for byte', () => {
    const a = readFileSync(SHARED, 'utf8');
    const b = readFileSync(MIRROR, 'utf8');
    if (a !== b) {
      expect.fail(
        'shared/task-category.js and public/js/utils/task-category.js are out of sync. ' +
        'Run: cp shared/task-category.js public/js/utils/task-category.js'
      );
    }
    expect(a).toBe(b);
  });
});

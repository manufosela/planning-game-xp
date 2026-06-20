/**
 * Enforce that public/js/utils/board-columns.js is a byte-identical
 * mirror of shared/board-columns.js. Same single-source-of-truth pattern
 * we use for sprint-naming.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SHARED = resolve(ROOT, 'shared', 'board-columns.js');
const MIRROR = resolve(ROOT, 'public', 'js', 'utils', 'board-columns.js');

describe('board-columns mirror', () => {
  it('public/js/utils/board-columns.js matches shared/board-columns.js byte for byte', () => {
    const a = readFileSync(SHARED, 'utf8');
    const b = readFileSync(MIRROR, 'utf8');
    if (a !== b) {
      expect.fail(
        'shared/board-columns.js and public/js/utils/board-columns.js are out of sync. ' +
        'Run: cp shared/board-columns.js public/js/utils/board-columns.js'
      );
    }
    expect(a).toBe(b);
  });
});

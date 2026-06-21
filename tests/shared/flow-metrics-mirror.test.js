/**
 * Enforce that public/js/utils/flow-metrics.js is a byte-identical mirror
 * of shared/flow-metrics.js. Same pattern we use for sprint-naming and
 * board-columns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SHARED = resolve(ROOT, 'shared', 'flow-metrics.js');
const MIRROR = resolve(ROOT, 'public', 'js', 'utils', 'flow-metrics.js');

describe('flow-metrics mirror', () => {
  it('public/js/utils/flow-metrics.js matches shared/flow-metrics.js byte for byte', () => {
    const a = readFileSync(SHARED, 'utf8');
    const b = readFileSync(MIRROR, 'utf8');
    if (a !== b) {
      expect.fail(
        'shared/flow-metrics.js and public/js/utils/flow-metrics.js are out of sync. ' +
        'Run: cp shared/flow-metrics.js public/js/utils/flow-metrics.js'
      );
    }
    expect(a).toBe(b);
  });
});

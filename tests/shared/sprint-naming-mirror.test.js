/**
 * Enforce that public/js/utils/sprint-naming.js is a byte-identical mirror
 * of shared/sprint-naming.js. The Node side (MCP) imports from /shared/;
 * the browser side imports from /public/js/utils/. If they drift, the
 * frontend and the MCP will validate sprint titles differently — exactly
 * what the single-source-of-truth pattern is meant to prevent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SHARED = resolve(ROOT, 'shared', 'sprint-naming.js');
const MIRROR = resolve(ROOT, 'public', 'js', 'utils', 'sprint-naming.js');

describe('sprint-naming mirror', () => {
  it('public/js/utils/sprint-naming.js matches shared/sprint-naming.js byte for byte', () => {
    const a = readFileSync(SHARED, 'utf8');
    const b = readFileSync(MIRROR, 'utf8');
    if (a !== b) {
      const message =
        'shared/sprint-naming.js and public/js/utils/sprint-naming.js are out of sync. ' +
        'Run: cp shared/sprint-naming.js public/js/utils/sprint-naming.js';
      expect.fail(message);
    }
    expect(a).toBe(b);
  });
});

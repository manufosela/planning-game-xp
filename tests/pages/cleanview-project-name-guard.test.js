/**
 * Regression guard for PLN-BUG-0114
 *
 * /cleanview must NOT use the projectId as the visible label of its
 * <option>s — after PLN-BUG-0109 (rename decoupling) the projectId is
 * a stable RTDB key while the human-readable `name` may differ. Showing
 * the key confuses users who renamed a project (e.g. "RoleMirror" → "GREBLA").
 *
 * This test parses cleanview.astro and fails if the dangerous pattern
 * `opt.textContent = name;` (with `name` being the projectId iterator)
 * reappears.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FILE = 'src/pages/partials/cleanview.astro';

describe('PLN-BUG-0114 — cleanview project select must show name, not projectId', () => {
  it(`${FILE} uses allProjects[projectId]?.name for the option label`, () => {
    const content = readFileSync(resolve(process.cwd(), FILE), 'utf8');
    // The fix uses this exact expression to resolve the visible label.
    expect(content).toMatch(/opt\.textContent\s*=\s*allProjects\[[^\]]+\]\?\.name/);
  });

  it(`${FILE} does NOT set opt.textContent = <iterator> directly (bare identifier)`, () => {
    const content = readFileSync(resolve(process.cwd(), FILE), 'utf8');
    // Reject `opt.textContent = name;` or `opt.textContent = projectId;`
    // as the raw label — those were the bug. Any expression accessing a
    // .name property (e.g. allProjects[x].name) is fine.
    const bareIdentifier = /opt\.textContent\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*;/;
    expect(content).not.toMatch(bareIdentifier);
  });
});

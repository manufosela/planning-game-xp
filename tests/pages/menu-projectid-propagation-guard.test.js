/**
 * Regression guards for PLN-BUG-0118 — ?projectId= propagation through
 * the menu. Four combined defects broke it; these guards pin the fixed
 * shapes so none of them silently returns:
 *
 *  1. Layout.astro addProjectToLinks wrote ABSOLUTE hrefs
 *     (`link.href = url.toString()`), which stopped MenuNav's click-time
 *     propagator from recognizing its own links.
 *  2. addProjectToLinks sealed an EMPTY projectId ('?projectId=') into
 *     every menu link when called before the project was resolved.
 *  3. MenuNav matched hrefs with string prefixes that missed
 *     trailing-slash+query and absolutized shapes, freezing the
 *     propagator after its first rewrite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const LAYOUT = readFileSync(resolve(process.cwd(), 'src/layouts/Layout.astro'), 'utf8');
const MENUNAV = readFileSync(resolve(process.cwd(), 'src/components/MenuNav.astro'), 'utf8');

describe('PLN-BUG-0118 — Layout.astro addProjectToLinks', () => {
  it('does NOT write absolute hrefs (link.href = url.toString())', () => {
    expect(LAYOUT).not.toMatch(/link\.href\s*=\s*url\.toString\(\)/);
  });

  it('writes relative hrefs via setAttribute(pathname + search)', () => {
    expect(LAYOUT).toMatch(/link\.setAttribute\('href',\s*url\.pathname\s*\+\s*url\.search\)/);
  });

  it('guards against sealing an empty projectId', () => {
    const fnStart = LAYOUT.indexOf('function addProjectToLinks');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = LAYOUT.slice(fnStart, fnStart + 900);
    expect(fnBody).toMatch(/if\s*\(!projectId\)/);
  });
});

describe('PLN-BUG-0118 — MenuNav.astro click-time propagator', () => {
  it('delegates href matching to the shared nav-project-link helper', () => {
    expect(MENUNAV).toMatch(/import\s*\{[^}]*isProjectScopedHref[^}]*\}\s*from\s*'\.\.\/lib\/nav-project-link\.js'/);
    expect(MENUNAV).toMatch(/rewriteHrefWithProject/);
  });

  it('does NOT use the broken string-prefix guard again', () => {
    // The old guard missed '/cleanview/?...' (trailing slash + query) and
    // absolutized hrefs. Any startsWith-on-prefix matching here is a smell
    // that the URL-parsing helper was bypassed.
    expect(MENUNAV).not.toMatch(/href\.startsWith\(\s*p\s*\+\s*'\?'\s*\)/);
  });
});

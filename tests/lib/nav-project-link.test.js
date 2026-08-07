/**
 * Tests for the pure nav-project-link helpers (PLN-BUG-0118).
 *
 * The old string-prefix guard in MenuNav.astro failed on two href shapes
 * that occur in production:
 *   - '/cleanview/?projectId=X'  (trailing slash + query)
 *   - 'http://host/cleanview/?projectId=X' (absolutized by addProjectToLinks)
 * Both must now be recognized and rewritten with the CURRENT projectId.
 */
import { describe, it, expect } from 'vitest';
import {
  PROJECT_SCOPED_PATHS,
  isProjectScopedHref,
  rewriteHrefWithProject
} from '../../src/lib/nav-project-link.js';

describe('isProjectScopedHref', () => {
  it('matches the plain SSR shapes', () => {
    expect(isProjectScopedHref('/cleanview')).toBe(true);
    expect(isProjectScopedHref('/cleanview/')).toBe(true);
    expect(isProjectScopedHref('/adminproject/')).toBe(true);
  });

  it('matches trailing slash + query (the shape that froze the old guard)', () => {
    expect(isProjectScopedHref('/cleanview/?projectId=A')).toBe(true);
    expect(isProjectScopedHref('/board/?projectId=A&x=1')).toBe(true);
  });

  it('matches absolutized hrefs (the shape addProjectToLinks used to write)', () => {
    expect(isProjectScopedHref('http://example.com/cleanview/?projectId=A')).toBe(true);
    expect(isProjectScopedHref('https://planning-game.tribbu.io/adminproject/?projectId=')).toBe(true);
  });

  it('rejects non-scoped routes in any shape', () => {
    expect(isProjectScopedHref('/')).toBe(false);
    expect(isProjectScopedHref('/projects/')).toBe(false);
    expect(isProjectScopedHref('/doc/')).toBe(false);
    expect(isProjectScopedHref('http://example.com/doc/?projectId=A')).toBe(false);
  });

  it('is robust to garbage input', () => {
    expect(isProjectScopedHref(null)).toBe(false);
    expect(isProjectScopedHref(undefined)).toBe(false);
    expect(isProjectScopedHref('')).toBe(false);
    expect(isProjectScopedHref(42)).toBe(false);
  });

  it('covers every scoped path in both slash variants', () => {
    for (const p of PROJECT_SCOPED_PATHS) {
      expect(isProjectScopedHref(p)).toBe(true);
      expect(isProjectScopedHref(p + '/')).toBe(true);
      expect(isProjectScopedHref(p + '/?projectId=X')).toBe(true);
    }
  });
});

describe('rewriteHrefWithProject', () => {
  it('injects projectId into a bare relative href', () => {
    expect(rewriteHrefWithProject('/cleanview/', 'GREBLA'))
      .toBe('/cleanview/?projectId=GREBLA');
  });

  it('REPLACES a stale projectId (the canonical replaceState desync case)', () => {
    expect(rewriteHrefWithProject('/adminproject/?projectId=OLD', 'NEW'))
      .toBe('/adminproject/?projectId=NEW');
  });

  it('replaces an empty sealed projectId', () => {
    expect(rewriteHrefWithProject('/cleanview/?projectId=', 'GREBLA'))
      .toBe('/cleanview/?projectId=GREBLA');
  });

  it('normalizes absolutized hrefs back to relative', () => {
    expect(rewriteHrefWithProject('http://example.com/cleanview/?projectId=OLD', 'NEW'))
      .toBe('/cleanview/?projectId=NEW');
  });

  it('encodes projectIds with special characters', () => {
    expect(rewriteHrefWithProject('/cleanview/', 'Mi Proyecto'))
      .toBe('/cleanview/?projectId=Mi+Proyecto');
  });

  it('preserves other query params and hash', () => {
    expect(rewriteHrefWithProject('/sprintview/?view=table&projectId=OLD#top', 'NEW'))
      .toBe('/sprintview/?view=table&projectId=NEW#top');
  });

  it('leaves the param untouched when projectId is falsy (caller decides)', () => {
    expect(rewriteHrefWithProject('/cleanview/?projectId=KEEP', ''))
      .toBe('/cleanview/?projectId=KEEP');
    expect(rewriteHrefWithProject('/cleanview/', null))
      .toBe('/cleanview/');
  });

  it('returns null on unparseable input', () => {
    expect(rewriteHrefWithProject(null, 'X')).toBe(null);
    expect(rewriteHrefWithProject('', 'X')).toBe(null);
  });
});

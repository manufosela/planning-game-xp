/**
 * Pure helpers for propagating ?projectId= through the menu navigation.
 *
 * PLN-BUG-0118: the click-time href rewriter in MenuNav.astro matched hrefs
 * with string prefixes (`href === p || href === p + '/' || href.startsWith(p + '?')`).
 * That guard broke in two real-world shapes:
 *   - `/cleanview/?projectId=X` (trailing slash + query) → no branch matched,
 *     so the rewriter froze after its own first rewrite.
 *   - `http://host/cleanview/?projectId=X` (absolute URL, produced by
 *     Layout.astro's addProjectToLinks writing `link.href = url.toString()`)
 *     → no branch matched, killing the rewriter for the whole session.
 *
 * These helpers parse the href as a URL so every shape (relative, absolute,
 * with/without trailing slash, with/without query or hash) resolves to the
 * same pathname before comparing.
 */

/** Routes whose links must carry the current ?projectId= across navigation. */
export const PROJECT_SCOPED_PATHS = [
  '/adminproject',
  '/cleanview',
  '/dashboard',
  '/sprintview',
  '/development',
  '/wip',
  '/proposals',
  '/board'
];

const PARSE_BASE = 'http://local.invalid';

/**
 * Whether an href points at a project-scoped route, regardless of its shape
 * (relative or absolute, trailing slash, query string, hash).
 *
 * @param {string|null|undefined} href
 * @param {string[]} [scopedPaths]
 * @returns {boolean}
 */
export function isProjectScopedHref(href, scopedPaths = PROJECT_SCOPED_PATHS) {
  if (!href || typeof href !== 'string') return false;
  let pathname;
  try {
    pathname = new URL(href, PARSE_BASE).pathname;
  } catch {
    return false;
  }
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return scopedPaths.includes(normalized);
}

/**
 * Rewrite an href so its ?projectId= matches the given value, returning a
 * RELATIVE href (pathname + search + hash). Relative output is deliberate:
 * it keeps `getAttribute('href')` in a shape the scoped-path check above
 * recognizes on the next pass, instead of an absolute URL.
 *
 * With a falsy projectId the parameter is left untouched (the caller decides
 * whether an unsealed link is acceptable) and the normalized relative href
 * is returned.
 *
 * @param {string} href
 * @param {string|null|undefined} projectId
 * @returns {string|null} the rewritten relative href, or null if unparseable
 */
export function rewriteHrefWithProject(href, projectId) {
  if (!href || typeof href !== 'string') return null;
  let url;
  try {
    url = new URL(href, PARSE_BASE);
  } catch {
    return null;
  }
  if (projectId) {
    url.searchParams.set('projectId', projectId);
  }
  return url.pathname + url.search + url.hash;
}

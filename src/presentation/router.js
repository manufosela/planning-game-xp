/**
 * Client-side SPA router using History API.
 * Provides signal-based route state and programmatic navigation.
 *
 * @module presentation/router
 */

import { signal } from '@lit-labs/signals';

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {{ name: string; pattern: string }} RouteDefinition
 * @typedef {{ name: string; params: Record<string, string>; query: Record<string, string>; path: string }} RouteState
 */

/** @type {RouteDefinition[]} */
export const ROUTES = [
  { name: 'projects', pattern: '/projects' },
  { name: 'project', pattern: '/project/:id' },
  { name: 'dashboard', pattern: '/dashboard' },
  { name: 'wip', pattern: '/wip' },
  { name: 'admin', pattern: '/admin' },
  { name: 'login', pattern: '/login' },
];

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Parse named parameters from a route pattern and path.
 * @param {string} pattern - Route pattern with :param placeholders
 * @param {string} path - Actual URL path
 * @returns {Record<string, string>}
 */
export function parseParams(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  /** @type {Record<string, string>} */
  const params = {};

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      const key = patternParts[i].slice(1);
      params[key] = pathParts[i] || '';
    }
  }

  return params;
}

/**
 * Parse query string into key-value pairs.
 * @param {string} queryString - Query string (without leading ?)
 * @returns {Record<string, string>}
 */
function parseQuery(queryString) {
  if (!queryString) return {};
  /** @type {Record<string, string>} */
  const query = {};
  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  return query;
}

/**
 * Match a path against defined routes.
 * @param {string} fullPath - URL path, optionally with query string
 * @returns {RouteState | null}
 */
export function matchRoute(fullPath) {
  const [pathWithSlash, queryString] = fullPath.split('?');
  const path = pathWithSlash.replace(/\/+$/, '') || '/';
  const query = parseQuery(queryString || '');

  for (const route of ROUTES) {
    const patternParts = route.pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) continue;

    let matches = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) continue;
      if (patternParts[i] !== pathParts[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return {
        name: route.name,
        params: parseParams(route.pattern, path),
        query,
        path,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route signal
// ---------------------------------------------------------------------------

/** @type {import('@lit-labs/signals').Signal<RouteState> & { value: RouteState }} */
export const currentRoute = /** @type {any} */ (signal(
  /** @type {RouteState} */ ({
    name: 'projects',
    params: {},
    query: {},
    path: '/projects',
  })
));

// Add .value property
Object.defineProperty(currentRoute, 'value', {
  get() { return currentRoute.get(); },
  set(next) { currentRoute.set(next); },
  configurable: true,
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Navigate to a path programmatically.
 * Updates the browser URL via History API and the currentRoute signal.
 * @param {string} path - Target path (e.g., '/project/PLN')
 */
export function navigate(path) {
  const matched = matchRoute(path);
  if (matched) {
    if (typeof globalThis.history !== 'undefined') {
      globalThis.history.pushState(null, '', path);
    }
    currentRoute.set(matched);
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the router: read the current URL and listen for popstate.
 * Safe to call in non-browser environments (no-op).
 */
export function initRouter() {
  if (typeof globalThis.window === 'undefined') return;

  // Set initial route from current URL
  const initial = matchRoute(
    globalThis.location.pathname + globalThis.location.search
  );
  if (initial) {
    currentRoute.set(initial);
  }

  // Listen for back/forward navigation
  globalThis.addEventListener('popstate', () => {
    const matched = matchRoute(
      globalThis.location.pathname + globalThis.location.search
    );
    if (matched) {
      currentRoute.set(matched);
    }
  });
}

/**
 * Page route guards — determine where to redirect based on auth state.
 * @module lib/page-guards
 */

/**
 * Resolve the home route for a user.
 * @param {import('./types.d.ts').User | import('firebase/auth').User | null | undefined} user
 * @returns {string}
 */
export function resolveHomeRoute(user) {
  if (!user) return '/login';
  return '/projects';
}

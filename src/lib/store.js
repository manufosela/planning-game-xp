/**
 * Signal-based reactive store for global application state.
 * Uses @lit-labs/signals for fine-grained reactivity with Lit components.
 * @module lib/store
 */

import { signal, computed } from '@lit-labs/signals';

/**
 * @template T
 * @param {import('@lit-labs/signals').Signal<T>} source
 * @returns {import('@lit-labs/signals').Signal<T> & { value: T }}
 */
function withValue(source) {
  Object.defineProperty(source, 'value', {
    get() {
      return source.get();
    },
    set(next) {
      source.set(next);
    },
    configurable: true,
  });

  return /** @type {import('@lit-labs/signals').Signal<T> & { value: T }} */ (source);
}

/**
 * Currently authenticated user profile (from Firestore, not Firebase Auth).
 * @type {import('@lit-labs/signals').Signal<import('./types.d.ts').User | null>}
 */
export const authUser = withValue(signal(/** @type {import('./types.d.ts').User | null} */ (null)));

/**
 * Currently selected project.
 * @type {import('@lit-labs/signals').Signal<import('./types.d.ts').Project | null>}
 */
export const currentProject = withValue(signal(/** @type {import('./types.d.ts').Project | null} */ (null)));

/**
 * All cards loaded for the current project.
 * @type {import('@lit-labs/signals').Signal<import('./types.d.ts').Card[]>}
 */
export const cards = withValue(signal(/** @type {import('./types.d.ts').Card[]} */ ([])));

/**
 * Active filter state.
 * @type {import('@lit-labs/signals').Signal<import('./types.d.ts').FilterState>}
 */
export const filters = withValue(signal(/** @type {import('./types.d.ts').FilterState} */ ({
  type: /** @type {import('./types.d.ts').CardType | null | 'all'} */ ('all'),
  status: /** @type {string | null | 'all'} */ ('all'),
  year: new Date().getFullYear(),
  developer: null,
  sprint: '',
  epic: '',
  tags: [],
  query: '',
  search: '',
})));

/**
 * Derived: cards filtered by the current filter state.
 * Recalculates automatically when `cards` or `filters` change.
 */
export const filteredCards = withValue(computed(() => {
  const f = filters.get();
  let result = cards.get();
  const searchTerm = f.query || f.search;

  if (f.type && f.type !== 'all') {
    result = result.filter((c) => c.type === f.type);
  }
  if (f.status && f.status !== 'all') {
    result = result.filter((c) => c.status === f.status);
  }
  if (f.year) {
    result = result.filter((c) => c.year === f.year);
  }
  if (f.developer) {
    const devId = f.developer;
    result = result.filter((c) => {
      const card = /** @type {import('./types.d.ts').Task | import('./types.d.ts').Bug} */ (c);
      return card.developer?.id === devId;
    });
  }
  if (f.sprint) {
    result = result.filter((c) => c.sprint === f.sprint);
  }
  if (f.epic) {
    result = result.filter((c) => c.epic === f.epic);
  }
  if (f.tags && f.tags.length > 0) {
    const filterTags = f.tags;
    result = result.filter((c) => filterTags.some((t) => c.tags?.includes(t)));
  }
  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    result = result.filter(
      (c) => c.title.toLowerCase().includes(s) || c.cardId.toLowerCase().includes(s)
    );
  }

  return result;
}));

/**
 * All projects loaded for the current user.
 * @type {import('@lit-labs/signals').Signal<Array<import('./types.d.ts').Project & { id: string }>>}
 */
export const projects = withValue(signal(/** @type {Array<import('./types.d.ts').Project & { id: string }>} */ ([])));

/**
 * Currently selected card (for panel editing).
 * @type {import('@lit-labs/signals').Signal<import('./types.d.ts').Card | null>}
 */
export const currentCard = withValue(signal(/** @type {import('./types.d.ts').Card | null} */ (null)));

/**
 * Whether the card panel is open.
 * @type {import('@lit-labs/signals').Signal<boolean>}
 */
export const panelOpen = withValue(signal(false));

/**
 * Current theme preference.
 * @type {import('@lit-labs/signals').Signal<import('./types.d.ts').ThemeMode>}
 */
export const theme = withValue(signal(/** @type {import('./types.d.ts').ThemeMode} */ ('system')));

/**
 * @param {Partial<import('./types.d.ts').FilterState & { type?: import('./types.d.ts').CardType | 'all', status?: string | 'all', query?: string, assignee?: string }>} nextFilters
 */
export function setFilters(nextFilters) {
  const current = filters.get();
  filters.set({
    ...current,
    ...nextFilters,
    developer: nextFilters.assignee ?? nextFilters.developer ?? current.developer,
    query: nextFilters.query ?? current.query ?? '',
    search: nextFilters.query ?? nextFilters.search ?? current.search,
  });
}

export function resetFilters() {
  filters.set({
    type: 'all',
    status: 'all',
    year: new Date().getFullYear(),
    developer: null,
    sprint: '',
    epic: '',
    tags: [],
    query: '',
    search: '',
  });
}

// ---------------------------------------------------------------------------
// Instance / Custom Claims
// ---------------------------------------------------------------------------

/**
 * Current tenant instance from Custom Claims (e.g. 'geniova').
 * @type {import('@lit-labs/signals').Signal<string | null> & { value: string | null }}
 */
export const currentInstance = withValue(signal(/** @type {string | null} */ (null)));

/**
 * User role within the current instance.
 * @type {import('@lit-labs/signals').Signal<string | null> & { value: string | null }}
 */
export const instanceRole = withValue(signal(/** @type {string | null} */ (null)));

/**
 * Whether the user is a platform-wide admin.
 * @type {import('@lit-labs/signals').Signal<boolean> & { value: boolean }}
 */
export const platformAdmin = withValue(signal(false));

/**
 * Set instance claims from ID token result.
 * @param {{ instance?: string, instanceRole?: string, platformAdmin?: boolean }} claims
 */
export function setInstanceClaims(claims) {
  currentInstance.set(claims.instance ?? null);
  instanceRole.set(claims.instanceRole ?? null);
  platformAdmin.set(claims.platformAdmin ?? false);
}

/**
 * Clear all instance claims (on logout).
 */
export function clearInstanceClaims() {
  currentInstance.set(null);
  instanceRole.set(null);
  platformAdmin.set(false);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * User notifications list.
 * @type {import('@lit-labs/signals').Signal<Array<import('./types.d.ts').Notification & { id: string }>>}
 */
export const notifications = withValue(
  signal(/** @type {Array<import('./types.d.ts').Notification & { id: string }>} */ ([]))
);

/**
 * Derived: count of unread notifications.
 */
export const unreadCount = withValue(computed(() => {
  return notifications.get().filter((n) => !n.read).length;
}));

// ---------------------------------------------------------------------------
// WIP (Work In Progress)
// ---------------------------------------------------------------------------

/**
 * All "In Progress" cards across all projects.
 * @type {import('@lit-labs/signals').Signal<import('./types.d.ts').Card[]>}
 */
export const wipTasks = withValue(signal(/** @type {import('./types.d.ts').Card[]} */ ([])));

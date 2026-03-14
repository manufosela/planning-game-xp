/**
 * Enhanced signal-based reactive store for the application layer.
 * Builds on src/lib/store.js with additional signals for team, sprints,
 * epics, ADRs, plans, loading, and error states.
 * Uses applyFilters from lib/filters.js for computed filteredCards.
 *
 * @module application/store
 */

import { signal, computed } from '@lit-labs/signals';
import { applyFilters } from '../lib/filters.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Adds a `.value` property (get/set) to a signal for ergonomic access.
 * @template T
 * @param {import('@lit-labs/signals').Signal<T>} source
 * @returns {import('@lit-labs/signals').Signal<T> & { value: T }}
 */
export function withValue(source) {
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

// ---------------------------------------------------------------------------
// Auth & Project
// ---------------------------------------------------------------------------

/** @type {import('@lit-labs/signals').Signal<import('../lib/types.d.ts').User | null> & { value: import('../lib/types.d.ts').User | null }} */
export const authUser = withValue(signal(/** @type {import('../lib/types.d.ts').User | null} */ (null)));

/** @type {import('@lit-labs/signals').Signal<import('../lib/types.d.ts').Project | null> & { value: import('../lib/types.d.ts').Project | null }} */
export const currentProject = withValue(signal(/** @type {import('../lib/types.d.ts').Project | null} */ (null)));

/** @type {import('@lit-labs/signals').Signal<Array<import('../lib/types.d.ts').Project & { id: string }>> & { value: Array<import('../lib/types.d.ts').Project & { id: string }> }} */
export const projects = withValue(signal(/** @type {Array<import('../lib/types.d.ts').Project & { id: string }>} */ ([])));

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** @type {import('@lit-labs/signals').Signal<import('../lib/types.d.ts').Card[]> & { value: import('../lib/types.d.ts').Card[] }} */
export const cards = withValue(signal(/** @type {import('../lib/types.d.ts').Card[]} */ ([])));

/** @type {import('@lit-labs/signals').Signal<import('../lib/types.d.ts').Card | null> & { value: import('../lib/types.d.ts').Card | null }} */
export const currentCard = withValue(signal(/** @type {import('../lib/types.d.ts').Card | null} */ (null)));

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** @type {import('@lit-labs/signals').Signal<import('../lib/types.d.ts').FilterState> & { value: import('../lib/types.d.ts').FilterState }} */
export const filters = withValue(signal(/** @type {import('../lib/types.d.ts').FilterState} */ ({
  type: /** @type {import('../lib/types.d.ts').CardType | null | 'all'} */ ('all'),
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
 * Delegates to applyFilters from lib/filters.js for consistent filtering logic.
 */
export const filteredCards = withValue(computed(() => {
  return applyFilters(cards.get(), filters.get());
}));

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

/** Whether the card detail panel is open. */
export const panelOpen = withValue(signal(false));

/** Current theme preference. */
export const theme = withValue(signal(/** @type {import('../lib/types.d.ts').ThemeMode} */ ('system')));

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** @type {import('@lit-labs/signals').Signal<Array<import('../lib/types.d.ts').Notification & { id: string }>> & { value: Array<import('../lib/types.d.ts').Notification & { id: string }> }} */
export const notifications = withValue(
  signal(/** @type {Array<import('../lib/types.d.ts').Notification & { id: string }>} */ ([]))
);

/** Derived: count of unread notifications. */
export const unreadCount = withValue(computed(() => {
  return notifications.get().filter((n) => !n.read).length;
}));

// ---------------------------------------------------------------------------
// WIP (Work In Progress)
// ---------------------------------------------------------------------------

/** @type {import('@lit-labs/signals').Signal<import('../lib/types.d.ts').Card[]> & { value: import('../lib/types.d.ts').Card[] }} */
export const wipTasks = withValue(signal(/** @type {import('../lib/types.d.ts').Card[]} */ ([])));

// ---------------------------------------------------------------------------
// New signals (application layer additions)
// ---------------------------------------------------------------------------

/** Team members for the current project. */
export const team = withValue(signal(/** @type {any[]} */ ([])));

/** Sprints for the current project. */
export const sprints = withValue(signal(/** @type {any[]} */ ([])));

/** Epics for the current project. */
export const epics = withValue(signal(/** @type {any[]} */ ([])));

/** Architecture Decision Records for the current project. */
export const adrs = withValue(signal(/** @type {any[]} */ ([])));

/** Plans for the current project. */
export const plans = withValue(signal(/** @type {any[]} */ ([])));

/** Global loading indicator. */
export const loading = withValue(signal(false));

/** Global error message. */
export const error = withValue(signal(/** @type {string | null} */ (null)));

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/**
 * Merge partial filter updates into the current filter state.
 * @param {Partial<import('../lib/types.d.ts').FilterState & { type?: import('../lib/types.d.ts').CardType | 'all', status?: string | 'all', query?: string, assignee?: string }>} nextFilters
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

/** Reset all filters to their default values. */
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

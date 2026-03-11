/**
 * Pure filter functions for card collections.
 * Extracted from store.js for testability.
 *
 * @module lib/filters
 */

/** @type {Record<string, string[]>} */
const STATUSES_BY_TYPE = {
  task: ['To Do', 'In Progress', 'To Validate', 'Done', 'Done&Validated', 'Blocked', 'Reopened'],
  bug: ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed'],
  epic: ['Active', 'Completed', 'Archived'],
  sprint: ['Active', 'Completed', 'Archived'],
  proposal: ['Pending', 'Planned', 'Rejected'],
  qa: ['Pending', 'Passed', 'Failed'],
};

/**
 * Returns valid statuses for a given card type.
 * @param {string | null} type
 * @returns {string[]}
 */
export function getStatusesForType(type) {
  if (!type || type === 'all') {
    return [...new Set(Object.values(STATUSES_BY_TYPE).flat())];
  }
  return STATUSES_BY_TYPE[type] ?? [];
}

/**
 * Check if a card matches a search term (title, cardId, description).
 * @param {import('./types.d.ts').Card} card
 * @param {string} term
 * @returns {boolean}
 */
export function matchesSearch(card, term) {
  if (!term) return true;
  const s = term.toLowerCase();
  return (
    card.title.toLowerCase().includes(s) ||
    card.cardId.toLowerCase().includes(s) ||
    (card.description ?? '').toLowerCase().includes(s)
  );
}

/**
 * Check if a card matches tag filter.
 * @param {import('./types.d.ts').Card} card
 * @param {string[]} tags
 * @param {'and' | 'or'} mode
 * @returns {boolean}
 */
export function matchesTags(card, tags, mode = 'or') {
  if (!tags || tags.length === 0) return true;
  const cardTags = card.tags ?? [];
  if (cardTags.length === 0) return false;

  if (mode === 'and') {
    return tags.every((t) => cardTags.includes(t));
  }
  return tags.some((t) => cardTags.includes(t));
}

/**
 * Apply all filters to a card collection.
 * @param {import('./types.d.ts').Card[]} cards
 * @param {import('./types.d.ts').FilterState} filters
 * @param {{ tagMode?: 'and' | 'or' }} [options]
 * @returns {import('./types.d.ts').Card[]}
 */
export function applyFilters(cards, filters, options = {}) {
  let result = cards;
  const searchTerm = filters.query || filters.search;
  const tagMode = options.tagMode ?? 'or';

  if (filters.type && filters.type !== 'all') {
    result = result.filter((c) => c.type === filters.type);
  }

  if (filters.status && filters.status !== 'all') {
    result = result.filter((c) => c.status === filters.status);
  }

  if (filters.year) {
    result = result.filter((c) => c.year === filters.year);
  }

  if (filters.developer) {
    const devId = filters.developer;
    result = result.filter((c) => {
      const card = /** @type {import('./types.d.ts').Task | import('./types.d.ts').Bug} */ (c);
      return card.developer?.id === devId;
    });
  }

  if (filters.sprint) {
    result = result.filter((c) => c.sprint === filters.sprint);
  }

  if (filters.epic) {
    result = result.filter((c) => c.epic === filters.epic);
  }

  if (filters.tags && filters.tags.length > 0) {
    result = result.filter((c) => matchesTags(c, filters.tags, tagMode));
  }

  if (searchTerm) {
    result = result.filter((c) => matchesSearch(c, searchTerm));
  }

  return result;
}

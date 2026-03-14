/**
 * FilterService — composable card filtering with AND logic.
 */

/**
 * @typedef {object} CardFilters
 * @property {number}  [year]
 * @property {string}  [status]
 * @property {string}  [developer]
 * @property {string}  [sprint]
 * @property {string}  [epic]
 * @property {string}  [cardType]
 * @property {string}  [search]       - case-insensitive match on title, description, cardId
 * @property {number}  [priorityMin]
 * @property {number}  [priorityMax]
 */

/**
 * Filter an array of cards using AND logic across all provided filters.
 * @param {object[]} cards
 * @param {CardFilters} filters
 * @returns {object[]}
 */
export function filterCards(cards, filters) {
  if (!cards || cards.length === 0) return [];
  if (!filters || Object.keys(filters).length === 0) return cards;

  return cards.filter((card) => {
    if (filters.year != null && card.year !== filters.year) return false;
    if (filters.status && card.status !== filters.status) return false;
    if (filters.developer && card.developer !== filters.developer) return false;
    if (filters.sprint && card.sprint !== filters.sprint) return false;
    if (filters.epic && card.epic !== filters.epic) return false;
    if (filters.cardType && card.cardType !== filters.cardType) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const searchable = [card.title, card.description, card.cardId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(term)) return false;
    }

    if (filters.priorityMin != null && (card.priority == null || card.priority < filters.priorityMin)) return false;
    if (filters.priorityMax != null && (card.priority == null || card.priority > filters.priorityMax)) return false;

    return true;
  });
}

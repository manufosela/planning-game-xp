/**
 * Task Category Matcher — filters tasks by their taskCategory
 * (PLN-TSK-0354). A card without the field is treated as 'code',
 * matching the retro-compat behaviour in shared/task-category.js.
 *
 * Filter values are matched literally: pass ['code'] to hide nocode,
 * ['nocode'] to see only nocode, or an empty array / no filter to see
 * everything.
 */

/**
 * @param {Object} card
 * @param {Array<string>|undefined} filterValues
 * @returns {boolean}
 */
export function taskCategoryMatcher(card, filterValues) {
  if (!filterValues || filterValues.length === 0) return true;
  const category = card && card.taskCategory === 'nocode' ? 'nocode' : 'code';
  return filterValues.includes(category);
}

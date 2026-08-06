/**
 * Safely hydrate a <task-card> web component from a raw RTDB task snapshot.
 *
 * TaskCard exposes a few derived getters (notably `priority`, computed from
 * businessPoints/devPoints) and reflected properties that don't tolerate
 * a blind `Object.assign(el, snapshot)` or a `Object.keys(snap).forEach(k =>
 * el[k] = snap[k])`. A single getter-only prop reappearing in the snapshot
 * throws and breaks the whole render loop (see PLN-BUG-0105 for PgBoard,
 * PLN-BUG-0115 for sprint-renderer).
 *
 * This helper is the single source of truth for "which fields renderers may
 * push into a TaskCard from a RTDB snapshot". Any new renderer that renders
 * TaskCards must use it — extending the allowlist here (never inlining a
 * different list per renderer).
 */

/**
 * Fields that renderers can safely push into a TaskCard from a raw RTDB
 * snapshot. Kept in one place so it's obvious what a TaskCard consumes.
 * Any field the component derives internally (priority, priorityValue, etc.)
 * is deliberately absent.
 * @type {string[]}
 */
export const TASK_CARD_HYDRATE_FIELDS = [
  'cardId', 'title', 'description', 'descriptionStructured',
  'acceptanceCriteria', 'acceptanceCriteriaStructured',
  'status', 'developer', 'coDeveloper', 'codeveloper', 'validator', 'coValidator',
  'epic', 'sprint', 'devPoints', 'businessPoints', 'realDevPoints', 'realBusinessPoints',
  'startDate', 'endDate', 'year', 'spike', 'expedited',
  'taskCategory', 'completionNote',
  'blockedByBusiness', 'blockedByDevelopment',
  'bbbWhy', 'bbbWho', 'bbdWhy', 'bbdWho',
  'notes', 'attachment', 'commits',
  'reopenCount', 'reopenCycles',
  'createdBy', 'createdAt', 'updatedAt'
];

/**
 * Copy the allowlisted fields from a raw RTDB task snapshot into a
 * TaskCard-like element (or any DOM element with matching properties).
 * Any prop that throws on assignment (getter-only) is skipped silently
 * so a single bad field can't take down the whole render.
 *
 * @param {HTMLElement} el   - the TaskCard element being hydrated
 * @param {object} snapshot  - raw task data from RTDB
 * @returns {void}
 */
export function hydrateTaskCard(el, snapshot) {
  if (!el || !snapshot || typeof snapshot !== 'object') return;
  for (const key of TASK_CARD_HYDRATE_FIELDS) {
    if (snapshot[key] === undefined) continue;
    try {
      el[key] = snapshot[key];
    } catch {
      // Getter-only or otherwise unassignable prop — skip.
    }
  }
}

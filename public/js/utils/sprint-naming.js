/**
 * Sprint naming and bounds — single source of truth for the
 * "Sprint = 1 day" policy. Consumed by mcp/tools/sprints.js (Node) and,
 * via a byte-identical mirror at public/js/utils/sprint-naming.js, by the
 * browser. The mirror exists because Astro does not serve /shared/ to the
 * client. tests/shared/sprint-naming-mirror.test.js enforces that both
 * files match byte for byte.
 *
 * Policy:
 *   - Sprint name MUST match `Sprint N - YYYYMMDD` with optional
 *     ` - <free suffix>` at the end (e.g. "Sprint 12 - 20260607 - Foundations").
 *   - N is a per-year correlative (reset every January 1).
 *   - A sprint spans exactly one calendar day in UTC:
 *       startDate = YYYY-MM-DDT00:00:00.000Z
 *       endDate   = YYYY-MM-DDT23:59:59.999Z
 *   - Creating a sprint when today's sprint already exists must be
 *     idempotent (the existing one is returned).
 */

export const SPRINT_NAME_REGEX = /^Sprint (\d+) - (\d{8})(?: - (.+))?$/;
export const SPRINT_NAME_EXAMPLE = 'Sprint 1 - 20260607' +
  ' (optional suffix: "Sprint 1 - 20260607 - Foundations")';

/**
 * Format a Date as YYYYMMDD in UTC.
 * @param {Date} date
 * @returns {string}
 */
export function formatSprintDateTag(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Format a Date as YYYY-MM-DD in UTC (no time component).
 * @param {Date} date
 * @returns {string}
 */
export function formatSprintIsoDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a sprint title into its components. Returns null on mismatch.
 * @param {string} title
 * @returns {{number: number, dateTag: string, suffix: string|null}|null}
 */
export function parseSprintName(title) {
  if (typeof title !== 'string') return null;
  const match = title.trim().match(SPRINT_NAME_REGEX);
  if (!match) return null;
  return {
    number: Number(match[1]),
    dateTag: match[2],
    suffix: match[3] || null
  };
}

/**
 * Whether a title conforms to the strict policy.
 * @param {string} title
 * @returns {boolean}
 */
export function isValidSprintName(title) {
  return parseSprintName(title) !== null;
}

/**
 * Build a canonical sprint title.
 * @param {number} number - Correlative within the year (>=1).
 * @param {Date|string} dayOrTag - Day of the sprint as a Date or YYYYMMDD string.
 * @param {string} [suffix] - Optional human suffix (must not contain newlines).
 * @returns {string}
 */
export function buildSprintName(number, dayOrTag, suffix) {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Sprint number must be a positive integer.');
  }
  const dateTag = dayOrTag instanceof Date
    ? formatSprintDateTag(dayOrTag)
    : String(dayOrTag);
  if (!/^\d{8}$/.test(dateTag)) {
    throw new Error('Sprint date tag must be exactly YYYYMMDD.');
  }
  const trimmed = typeof suffix === 'string' ? suffix.trim() : '';
  if (trimmed.length === 0) {
    return `Sprint ${number} - ${dateTag}`;
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new Error('Sprint name suffix must not contain newlines.');
  }
  return `Sprint ${number} - ${dateTag} - ${trimmed}`;
}

/**
 * Convert an ISO date string (YYYY-MM-DD) to a YYYYMMDD tag.
 * @param {string} iso - "YYYY-MM-DD"
 * @returns {string}
 */
export function isoDateToTag(iso) {
  if (typeof iso !== 'string') throw new Error('Expected ISO date string.');
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Invalid ISO date: "${iso}".`);
  return `${match[1]}${match[2]}${match[3]}`;
}

/**
 * Convert a YYYYMMDD tag to an ISO date (YYYY-MM-DD).
 * @param {string} tag
 * @returns {string}
 */
export function tagToIsoDate(tag) {
  if (!/^\d{8}$/.test(tag)) throw new Error(`Invalid sprint date tag: "${tag}".`);
  return `${tag.slice(0, 4)}-${tag.slice(4, 6)}-${tag.slice(6, 8)}`;
}

/**
 * Compute the UTC bounds for the sprint covering a given day.
 * @param {Date} [referenceDate=new Date()] - Defaults to "now".
 * @returns {{startDate: string, endDate: string, dateTag: string, isoDate: string}}
 *   startDate/endDate are ISO 8601 instants in UTC.
 */
export function getSprintBoundsForDay(referenceDate) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date();
  const isoDate = formatSprintIsoDate(ref);
  return {
    isoDate,
    dateTag: formatSprintDateTag(ref),
    startDate: `${isoDate}T00:00:00.000Z`,
    endDate: `${isoDate}T23:59:59.999Z`
  };
}

/**
 * Find the sprint covering today, if any, in a snapshot of sprints.
 * The match is by startDate prefix (YYYY-MM-DD) — this is robust to
 * older sprints stored as plain date and to new ones stored as full ISO.
 *
 * @param {Object|null} sprintsByKey - Map firebaseId -> sprint data.
 * @param {Date} [referenceDate=new Date()]
 * @returns {{firebaseId: string, sprint: Object}|null}
 */
export function findSprintForDay(sprintsByKey, referenceDate) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date();
  const isoDate = formatSprintIsoDate(ref);
  if (!sprintsByKey || typeof sprintsByKey !== 'object') return null;
  for (const [firebaseId, sprint] of Object.entries(sprintsByKey)) {
    if (!sprint || typeof sprint !== 'object') continue;
    if (typeof sprint.startDate === 'string' && sprint.startDate.startsWith(isoDate)) {
      return { firebaseId, sprint };
    }
  }
  return null;
}

/**
 * Compute the next sprint correlative within a given year from a
 * snapshot of sprints. Sprints whose title does not parse are ignored
 * so legacy entries do not skew the count.
 *
 * @param {Object|null} sprintsByKey - Map firebaseId -> sprint data.
 * @param {number} year
 * @returns {number} - The next correlative (>= 1).
 */
export function getNextSprintNumberForYear(sprintsByKey, year) {
  if (!Number.isInteger(year)) throw new Error('Year must be an integer.');
  if (!sprintsByKey || typeof sprintsByKey !== 'object') return 1;
  let max = 0;
  for (const sprint of Object.values(sprintsByKey)) {
    if (!sprint || typeof sprint !== 'object') continue;
    const parsed = parseSprintName(sprint.title);
    if (!parsed) continue;
    const sprintYear = Number(parsed.dateTag.slice(0, 4));
    if (sprintYear !== year) continue;
    if (parsed.number > max) max = parsed.number;
  }
  return max + 1;
}

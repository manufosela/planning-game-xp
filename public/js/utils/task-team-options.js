/**
 * Pure helpers to build the <select> option lists for developer / stakeholder
 * fields in TaskCard. Extracted from TaskCard so the "orphan preservation"
 * logic (PLN-BUG-0107) can be tested without spinning up the whole component.
 *
 * Orphan preservation: if the task has a currently-assigned member that no
 * longer belongs to the project's team roster (dev/stk removed, project
 * migrated, legacy data), we still include it as an option so the <select>
 * can render the current value AND the user can change it. Without this the
 * field appears empty and effectively read-only.
 */

const UNASSIGNED_ALIASES = ['', 'unassigned', 'Sin Asignar', 'sin_asignar', null, undefined];

/**
 * @typedef {Object} TeamOption
 * @property {string} value  - stable id used as <option value>
 * @property {string} display - user-facing label
 */

/**
 * @param {Array} rawList - raw project developers list ({id,email,name} or string entries).
 * @param {string|null|undefined} currentDeveloper - the developer currently assigned to the task (id or email).
 * @param {(candidate: string) => string|null} resolveId - resolve any candidate to its canonical dev_XXX id (null if unknown).
 * @param {(id: string) => string} getDisplayName - render the display name for an id (falls back to id if unknown).
 * @param {Object} [opts]
 * @param {TeamOption} [opts.unassignedOption] - option shown first for "no developer".
 * @param {string} [opts.orphanSuffix]         - text appended to display when the current member is orphan.
 * @returns {TeamOption[]}
 */
export function buildDeveloperOptions(rawList, currentDeveloper, resolveId, getDisplayName, opts = {}) {
  const unassignedOption = opts.unassignedOption || { value: '', display: 'Sin asignar' };
  const orphanSuffix = opts.orphanSuffix || ' (no en el equipo)';

  const resolvedIds = new Set();
  if (Array.isArray(rawList) && rawList.length > 0) {
    for (const entry of rawList) {
      const candidate = typeof entry === 'object' && entry !== null
        ? (entry.id || entry.email || entry.name || entry.value || '')
        : entry;
      const resolved = resolveId(candidate);
      if (resolved) resolvedIds.add(resolved);
    }
  }

  const options = Array.from(resolvedIds).map(id => ({
    value: id,
    display: getDisplayName(id) || id
  }));

  if (
    currentDeveloper &&
    !UNASSIGNED_ALIASES.includes(currentDeveloper) &&
    !options.some(opt => opt.value === currentDeveloper)
  ) {
    const display = (getDisplayName(currentDeveloper) || currentDeveloper) + orphanSuffix;
    options.unshift({ value: currentDeveloper, display });
  }

  return [unassignedOption, ...options];
}

/**
 * Same shape as buildDeveloperOptions, but preserves BOTH validator and
 * coValidator if orphaned. The unassigned option for stakeholders is the
 * empty entry the form uses.
 *
 * @param {Array} rawList
 * @param {Array<string|null|undefined>} currentAssignees - [validator, coValidator]
 * @param {(candidate: string) => string|null} resolveId
 * @param {(id: string) => string} getDisplayName
 * @param {Object} [opts]
 * @returns {TeamOption[]}
 */
export function buildStakeholderOptions(rawList, currentAssignees, resolveId, getDisplayName, opts = {}) {
  const unassignedOption = opts.unassignedOption || { value: '', display: '' };
  const orphanSuffix = opts.orphanSuffix || ' (no en el equipo)';

  const resolvedIds = new Set();
  if (Array.isArray(rawList) && rawList.length > 0) {
    for (const entry of rawList) {
      const candidate = typeof entry === 'object' && entry !== null
        ? (entry.id || entry.email || entry.name || entry.value || '')
        : entry;
      const resolved = resolveId(candidate);
      if (resolved) resolvedIds.add(resolved);
    }
  }

  const options = Array.from(resolvedIds).map(id => ({
    value: id,
    display: getDisplayName(id) || id
  }));

  for (const current of currentAssignees || []) {
    if (current && !options.some(opt => opt.value === current)) {
      const display = (getDisplayName(current) || current) + orphanSuffix;
      options.unshift({ value: current, display });
    }
  }

  return [unassignedOption, ...options];
}

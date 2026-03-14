/**
 * PermissionService — role-based access control for the domain layer.
 */

const VALIDATOR_ONLY_STATUSES = ['Done', 'Done&Validated'];

/**
 * Check if the user has a specific top-level role.
 * @param {object} user
 * @param {string} role
 * @returns {boolean}
 */
export function hasRole(user, role) {
  return user.role === role;
}

/**
 * Get the user's role for a specific project.
 * SuperAdmin always returns 'SuperAdmin'.
 * @param {object} user
 * @param {string} projectId
 * @returns {string|null}
 */
export function getUserRole(user, projectId) {
  if (user.role === 'SuperAdmin') return 'SuperAdmin';
  const projectEntry = user.projects?.[projectId];
  return projectEntry?.role ?? null;
}

/**
 * Check if the user can access a project.
 * @param {object} user
 * @param {string} projectId
 * @returns {boolean}
 */
export function canAccessProject(user, projectId) {
  if (user.role === 'SuperAdmin') return true;
  return !!user.projects?.[projectId];
}

/**
 * Check if the user can edit a card.
 * @param {object} user
 * @param {object} card
 * @returns {boolean}
 */
export function canEditCard(user, card) {
  if (user.role === 'SuperAdmin') return true;
  if (user.role === 'Consultant') return false;
  if (!canAccessProject(user, card.projectId)) return false;
  return card.developer === user.developerId || card.createdBy === user.userId;
}

/**
 * Check if the user can change a card's status to a new status.
 * @param {object} user
 * @param {object} card
 * @param {string} newStatus
 * @returns {boolean}
 */
export function canChangeStatus(user, card, newStatus) {
  if (user.role === 'SuperAdmin') return true;

  if (VALIDATOR_ONLY_STATUSES.includes(newStatus)) {
    if (!user.stakeholderId) return false;
    return card.validator === user.stakeholderId || card.covalidator === user.stakeholderId;
  }

  return canEditCard(user, card);
}

/**
 * Check if the user can assign a developer to a task.
 * Only SuperAdmin can assign other developers; developers can only self-assign.
 * @param {object} user
 * @param {string} targetDevId
 * @returns {boolean}
 */
export function canAssignDeveloper(user, targetDevId) {
  if (user.role === 'SuperAdmin') return true;
  return user.developerId === targetDevId;
}

/**
 * Check if the user can edit data from a past year.
 * Only SuperAdmin can edit past years.
 * @param {object} user
 * @param {number} year
 * @returns {boolean}
 */
export function canEditPastYear(user, year) {
  if (user.role === 'SuperAdmin') return true;
  return year >= new Date().getFullYear();
}

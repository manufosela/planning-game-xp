/**
 * Permission checks — pure functions for role-based access control.
 *
 * Roles hierarchy: superadmin > admin > developer > stakeholder > consultant
 * All functions are side-effect free and operate on plain data.
 *
 * @module domain/services/permissions
 */

// ---------------------------------------------------------------------------
// Role utilities
// ---------------------------------------------------------------------------

/** Role weight for comparison (higher = more access) */
const ROLE_WEIGHT = {
  superadmin: 100,
  admin: 80,
  developer: 60,
  stakeholder: 40,
  consultant: 20,
};

/**
 * Get the user's role within a specific project.
 *
 * @param {import('./types.d.ts').User} user
 * @param {string} projectId
 * @returns {import('./types.d.ts').ProjectRole | 'superadmin' | null}
 */
export function getUserRole(user, projectId) {
  if (user.role === 'superadmin') return 'superadmin';
  if (!user.projects) return null;
  return user.projects[projectId] ?? null;
}

/**
 * Check if user is a member of the project (any role).
 *
 * @param {import('./types.d.ts').User} user
 * @param {string} projectId
 * @returns {boolean}
 */
export function isProjectMember(user, projectId) {
  if (user.role === 'superadmin') return true;
  return user.projects?.[projectId] != null;
}

/**
 * Check if user is an admin of the project (or superadmin).
 *
 * @param {import('./types.d.ts').User} user
 * @param {string} projectId
 * @returns {boolean}
 */
export function isProjectAdmin(user, projectId) {
  if (user.role === 'superadmin') return true;
  return user.projects?.[projectId] === 'admin';
}

// ---------------------------------------------------------------------------
// Card permissions
// ---------------------------------------------------------------------------

/**
 * Whether the user can edit a card.
 *
 * - Superadmin: always
 * - Admin: always within their project
 * - Developer: can edit cards assigned to them, or unassigned cards
 * - Stakeholder: can only edit proposals
 * - Consultant: read only
 *
 * @param {import('./types.d.ts').Card} card
 * @param {import('./types.d.ts').User & { uid: string }} user
 * @param {{ id: string }} project
 * @returns {boolean}
 */
export function canEditCard(card, user, project) {
  const role = getUserRole(user, project.id);
  if (!role) return false;

  if (role === 'superadmin' || role === 'admin') return true;

  if (role === 'consultant') return false;

  if (role === 'stakeholder') {
    return card.type === 'proposal';
  }

  // Developer: can edit own cards or unassigned
  if (role === 'developer') {
    const taskOrBug = /** @type {import('./types.d.ts').Task | import('./types.d.ts').Bug} */ (card);
    if (!taskOrBug.developer) return true; // unassigned
    return taskOrBug.developer.id === user.uid;
  }

  return false;
}

/**
 * Whether the user can delete a card.
 *
 * - Superadmin: always
 * - Admin: always within their project
 * - Others: only cards they created
 *
 * @param {import('./types.d.ts').Card} card
 * @param {import('./types.d.ts').User & { uid: string }} user
 * @param {{ id: string }} project
 * @returns {boolean}
 */
export function canDeleteCard(card, user, project) {
  const role = getUserRole(user, project.id);
  if (!role) return false;

  if (role === 'superadmin' || role === 'admin') return true;
  if (role === 'consultant') return false;

  return card.createdBy === user.uid;
}

/**
 * Whether the user can change a card's status to a target status.
 * This checks project-level permissions only. For transition-specific validation
 * (required fields, validator-only), use `canTransition` from transitions.js.
 *
 * @param {import('./types.d.ts').Card} card
 * @param {string} targetStatus
 * @param {import('./types.d.ts').User & { uid: string }} user
 * @param {{ id: string }} project
 * @returns {import('./types.d.ts').TransitionResult}
 */
export function canChangeStatus(card, targetStatus, user, project) {
  const role = getUserRole(user, project.id);

  if (!role) {
    return { allowed: false, reason: 'Not a member of this project' };
  }

  if (role === 'consultant') {
    return { allowed: false, reason: 'Consultants have read-only access' };
  }

  if (role === 'stakeholder' && card.type !== 'proposal') {
    return { allowed: false, reason: 'Stakeholders can only modify proposals' };
  }

  return { allowed: true };
}

/**
 * Whether the user can assign a developer to a card.
 * Standard developers can only self-assign. Superadmins and admins can assign anyone.
 *
 * @param {import('./types.d.ts').User & { uid: string }} user
 * @param {{ id: string }} project
 * @returns {boolean}
 */
export function canAssignDeveloper(user, project) {
  const role = getUserRole(user, project.id);
  if (!role) return false;
  // Superadmin and admin can assign anyone
  return role === 'superadmin' || role === 'admin';
}

/**
 * Whether the user can edit a card from a past year.
 * Only superadmins can modify past-year data.
 *
 * @param {import('./types.d.ts').Card} card
 * @param {import('./types.d.ts').User} user
 * @returns {boolean}
 */
export function canEditPastYear(card, user) {
  const currentYear = new Date().getFullYear();
  if (card.year >= currentYear) return true;
  return user.role === 'superadmin';
}

/**
 * Permission checks — re-exports from @pgv2/domain.
 * @module lib/permissions
 */

export {
  getUserRole,
  isProjectMember,
  isProjectAdmin,
  canEditCard,
  canDeleteCard,
  canChangeStatus,
  canAssignDeveloper,
  canEditPastYear,
} from '../../packages/domain/services/permissions.js';

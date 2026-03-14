import { describe, it, expect } from 'vitest';
import {
  canEditCard,
  canChangeStatus,
  canAssignDeveloper,
  canEditPastYear,
  canAccessProject,
  hasRole,
  getUserRole,
} from '../../../packages/domain/services/permission-service.js';

const superAdmin = {
  userId: 'u1',
  role: 'SuperAdmin',
  developerId: 'dev_001',
  projects: { PLN: { role: 'SuperAdmin' } },
};

const developer = {
  userId: 'u2',
  role: 'Developer',
  developerId: 'dev_002',
  projects: { PLN: { role: 'Developer' }, EX2: { role: 'Developer' } },
};

const consultant = {
  userId: 'u3',
  role: 'Consultant',
  developerId: 'dev_003',
  projects: { PLN: { role: 'Consultant' } },
};

const validator = {
  userId: 'u4',
  role: 'Validator',
  stakeholderId: 'stk_001',
  projects: { PLN: { role: 'Validator' } },
};

const card = {
  cardId: 'PLN-TSK-0001',
  cardType: 'task-card',
  status: 'To Do',
  projectId: 'PLN',
  developer: 'dev_002',
  validator: 'stk_001',
  year: 2026,
};

describe('PermissionService', () => {
  describe('canEditCard', () => {
    it('should allow SuperAdmin to edit any card', () => {
      expect(canEditCard(superAdmin, card)).toBe(true);
    });

    it('should allow assigned developer to edit their card', () => {
      expect(canEditCard(developer, card)).toBe(true);
    });

    it('should deny consultant from editing', () => {
      expect(canEditCard(consultant, card)).toBe(false);
    });

    it('should deny developer editing another project card', () => {
      const otherCard = { ...card, projectId: 'NTR' };
      expect(canEditCard(developer, otherCard)).toBe(false);
    });
  });

  describe('canChangeStatus', () => {
    it('should allow SuperAdmin to change any status', () => {
      expect(canChangeStatus(superAdmin, card, 'Done')).toBe(true);
    });

    it('should deny developer changing to Done', () => {
      const inProgressCard = { ...card, status: 'To Validate' };
      expect(canChangeStatus(developer, inProgressCard, 'Done')).toBe(false);
    });

    it('should allow validator to change to Done', () => {
      const toValidateCard = { ...card, status: 'To Validate' };
      expect(canChangeStatus(validator, toValidateCard, 'Done')).toBe(true);
    });

    it('should allow developer to change non-restricted statuses', () => {
      expect(canChangeStatus(developer, card, 'In Progress')).toBe(true);
    });
  });

  describe('canAssignDeveloper', () => {
    it('should allow SuperAdmin to assign anyone', () => {
      expect(canAssignDeveloper(superAdmin, 'dev_999')).toBe(true);
    });

    it('should allow developer to self-assign', () => {
      expect(canAssignDeveloper(developer, 'dev_002')).toBe(true);
    });

    it('should deny developer from assigning others', () => {
      expect(canAssignDeveloper(developer, 'dev_999')).toBe(false);
    });
  });

  describe('canEditPastYear', () => {
    it('should allow SuperAdmin to edit past year', () => {
      expect(canEditPastYear(superAdmin, 2025)).toBe(true);
    });

    it('should deny non-SuperAdmin from editing past year', () => {
      expect(canEditPastYear(developer, 2025)).toBe(false);
    });

    it('should allow non-SuperAdmin to edit current year', () => {
      expect(canEditPastYear(developer, new Date().getFullYear())).toBe(true);
    });
  });

  describe('canAccessProject', () => {
    it('should allow SuperAdmin to access any project', () => {
      expect(canAccessProject(superAdmin, 'ANY_PROJECT')).toBe(true);
    });

    it('should allow user to access assigned project', () => {
      expect(canAccessProject(developer, 'PLN')).toBe(true);
      expect(canAccessProject(developer, 'EX2')).toBe(true);
    });

    it('should deny user from unassigned project', () => {
      expect(canAccessProject(developer, 'NTR')).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should check top-level role', () => {
      expect(hasRole(superAdmin, 'SuperAdmin')).toBe(true);
      expect(hasRole(developer, 'SuperAdmin')).toBe(false);
      expect(hasRole(developer, 'Developer')).toBe(true);
    });
  });

  describe('getUserRole', () => {
    it('should return project-specific role', () => {
      expect(getUserRole(developer, 'PLN')).toBe('Developer');
    });

    it('should return null for unassigned project', () => {
      expect(getUserRole(developer, 'NTR')).toBeNull();
    });

    it('should return SuperAdmin role regardless of project', () => {
      expect(getUserRole(superAdmin, 'ANY')).toBe('SuperAdmin');
    });
  });
});

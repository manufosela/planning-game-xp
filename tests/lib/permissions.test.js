/**
 * Tests for the permission checks module.
 * Covers: edit, delete, status change, self-assign, past year, roles.
 */

import { describe, it, expect } from 'vitest';
import {
  canEditCard,
  canDeleteCard,
  canChangeStatus,
  canAssignDeveloper,
  canEditPastYear,
  isProjectAdmin,
  isProjectMember,
  getUserRole,
} from '@lib/permissions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides = {}) {
  return {
    uid: 'user_001',
    name: 'Alice',
    email: 'alice@test.com',
    role: 'user',
    projects: { proj1: 'developer' },
    preferences: { theme: 'light', defaultYear: 2026, locale: 'en' },
    createdAt: {},
    lastLoginAt: {},
    ...overrides,
  };
}

function makeCard(overrides = {}) {
  return {
    cardId: 'PLN-TSK-0001',
    type: 'task',
    title: 'Test',
    description: '',
    status: 'To Do',
    year: 2026,
    createdAt: {},
    createdBy: 'user_002',
    updatedAt: {},
    updatedBy: '',
    developer: { id: 'user_001', name: 'Alice', email: 'alice@test.com' },
    ...overrides,
  };
}

const PROJECT = { id: 'proj1' };
const OTHER_PROJECT = { id: 'proj_other' };

// ---------------------------------------------------------------------------
// getUserRole
// ---------------------------------------------------------------------------

describe('getUserRole', () => {
  it('returns superadmin for superadmin users regardless of project', () => {
    const user = makeUser({ role: 'superadmin' });
    expect(getUserRole(user, 'any-project')).toBe('superadmin');
  });

  it('returns the project role for normal users', () => {
    const user = makeUser({ projects: { proj1: 'admin', proj2: 'developer' } });
    expect(getUserRole(user, 'proj1')).toBe('admin');
    expect(getUserRole(user, 'proj2')).toBe('developer');
  });

  it('returns null for users not in the project', () => {
    const user = makeUser({ projects: { proj1: 'developer' } });
    expect(getUserRole(user, 'other-project')).toBeNull();
  });

  it('returns null when user has no projects', () => {
    const user = makeUser({ projects: undefined });
    expect(getUserRole(user, 'proj1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isProjectMember
// ---------------------------------------------------------------------------

describe('isProjectMember', () => {
  it('returns true for superadmin', () => {
    const user = makeUser({ role: 'superadmin' });
    expect(isProjectMember(user, 'any')).toBe(true);
  });

  it('returns true for project member', () => {
    const user = makeUser({ projects: { proj1: 'developer' } });
    expect(isProjectMember(user, 'proj1')).toBe(true);
  });

  it('returns false for non-member', () => {
    const user = makeUser({ projects: { proj1: 'developer' } });
    expect(isProjectMember(user, 'proj2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isProjectAdmin
// ---------------------------------------------------------------------------

describe('isProjectAdmin', () => {
  it('returns true for superadmin', () => {
    const user = makeUser({ role: 'superadmin' });
    expect(isProjectAdmin(user, 'any')).toBe(true);
  });

  it('returns true for project admin', () => {
    const user = makeUser({ projects: { proj1: 'admin' } });
    expect(isProjectAdmin(user, 'proj1')).toBe(true);
  });

  it('returns false for developer role', () => {
    const user = makeUser({ projects: { proj1: 'developer' } });
    expect(isProjectAdmin(user, 'proj1')).toBe(false);
  });

  it('returns false for non-member', () => {
    const user = makeUser();
    expect(isProjectAdmin(user, 'proj_other')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canEditCard
// ---------------------------------------------------------------------------

describe('canEditCard', () => {
  it('superadmin can edit any card', () => {
    const user = makeUser({ role: 'superadmin' });
    const card = makeCard({ developer: { id: 'other', name: 'Other', email: '' } });
    expect(canEditCard(card, user, PROJECT)).toBe(true);
  });

  it('admin can edit any card in their project', () => {
    const user = makeUser({ projects: { proj1: 'admin' } });
    const card = makeCard({ developer: { id: 'other', name: 'Other', email: '' } });
    expect(canEditCard(card, user, PROJECT)).toBe(true);
  });

  it('developer can edit their own card', () => {
    const user = makeUser({ uid: 'user_001' });
    const card = makeCard({ developer: { id: 'user_001', name: 'Alice', email: '' } });
    expect(canEditCard(card, user, PROJECT)).toBe(true);
  });

  it('developer can edit unassigned card', () => {
    const user = makeUser();
    const card = makeCard({ developer: null });
    expect(canEditCard(card, user, PROJECT)).toBe(true);
  });

  it('developer cannot edit card assigned to someone else', () => {
    const user = makeUser({ uid: 'user_001' });
    const card = makeCard({ developer: { id: 'user_002', name: 'Bob', email: '' } });
    expect(canEditCard(card, user, PROJECT)).toBe(false);
  });

  it('consultant cannot edit any card', () => {
    const user = makeUser({ projects: { proj1: 'consultant' } });
    const card = makeCard();
    expect(canEditCard(card, user, PROJECT)).toBe(false);
  });

  it('stakeholder can edit proposals', () => {
    const user = makeUser({ projects: { proj1: 'stakeholder' } });
    const card = makeCard({ type: 'proposal' });
    expect(canEditCard(card, user, PROJECT)).toBe(true);
  });

  it('stakeholder cannot edit tasks', () => {
    const user = makeUser({ projects: { proj1: 'stakeholder' } });
    const card = makeCard({ type: 'task' });
    expect(canEditCard(card, user, PROJECT)).toBe(false);
  });

  it('non-member cannot edit', () => {
    const user = makeUser();
    const card = makeCard();
    expect(canEditCard(card, user, OTHER_PROJECT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canDeleteCard
// ---------------------------------------------------------------------------

describe('canDeleteCard', () => {
  it('superadmin can delete any card', () => {
    const user = makeUser({ role: 'superadmin' });
    const card = makeCard();
    expect(canDeleteCard(card, user, PROJECT)).toBe(true);
  });

  it('admin can delete any card in their project', () => {
    const user = makeUser({ projects: { proj1: 'admin' } });
    const card = makeCard();
    expect(canDeleteCard(card, user, PROJECT)).toBe(true);
  });

  it('developer can delete card they created', () => {
    const user = makeUser({ uid: 'user_002' });
    const card = makeCard({ createdBy: 'user_002' });
    expect(canDeleteCard(card, user, PROJECT)).toBe(true);
  });

  it('developer cannot delete card created by someone else', () => {
    const user = makeUser({ uid: 'user_001' });
    const card = makeCard({ createdBy: 'user_002' });
    expect(canDeleteCard(card, user, PROJECT)).toBe(false);
  });

  it('consultant cannot delete any card', () => {
    const user = makeUser({ uid: 'user_002', projects: { proj1: 'consultant' } });
    const card = makeCard({ createdBy: 'user_002' });
    expect(canDeleteCard(card, user, PROJECT)).toBe(false);
  });

  it('non-member cannot delete', () => {
    const user = makeUser();
    const card = makeCard();
    expect(canDeleteCard(card, user, OTHER_PROJECT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canChangeStatus
// ---------------------------------------------------------------------------

describe('canChangeStatus', () => {
  it('allows status change for developer', () => {
    const user = makeUser();
    const card = makeCard();
    const result = canChangeStatus(card, 'In Progress', user, PROJECT);
    expect(result.allowed).toBe(true);
  });

  it('rejects status change for consultant', () => {
    const user = makeUser({ projects: { proj1: 'consultant' } });
    const card = makeCard();
    const result = canChangeStatus(card, 'In Progress', user, PROJECT);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/read-only/i);
  });

  it('rejects status change for non-member', () => {
    const user = makeUser();
    const card = makeCard();
    const result = canChangeStatus(card, 'In Progress', user, OTHER_PROJECT);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not a member/i);
  });

  it('stakeholder can only change proposal status', () => {
    const user = makeUser({ projects: { proj1: 'stakeholder' } });

    const proposal = makeCard({ type: 'proposal' });
    expect(canChangeStatus(proposal, 'Planned', user, PROJECT).allowed).toBe(true);

    const task = makeCard({ type: 'task' });
    expect(canChangeStatus(task, 'In Progress', user, PROJECT).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAssignDeveloper
// ---------------------------------------------------------------------------

describe('canAssignDeveloper', () => {
  it('superadmin can assign anyone', () => {
    const user = makeUser({ role: 'superadmin' });
    expect(canAssignDeveloper(user, PROJECT)).toBe(true);
  });

  it('admin can assign anyone', () => {
    const user = makeUser({ projects: { proj1: 'admin' } });
    expect(canAssignDeveloper(user, PROJECT)).toBe(true);
  });

  it('developer cannot assign others (self-assign only)', () => {
    const user = makeUser({ projects: { proj1: 'developer' } });
    expect(canAssignDeveloper(user, PROJECT)).toBe(false);
  });

  it('non-member cannot assign', () => {
    const user = makeUser();
    expect(canAssignDeveloper(user, OTHER_PROJECT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canEditPastYear
// ---------------------------------------------------------------------------

describe('canEditPastYear', () => {
  it('allows editing current year cards for any user', () => {
    const user = makeUser();
    const card = makeCard({ year: new Date().getFullYear() });
    expect(canEditPastYear(card, user)).toBe(true);
  });

  it('allows editing future year cards for any user', () => {
    const user = makeUser();
    const card = makeCard({ year: new Date().getFullYear() + 1 });
    expect(canEditPastYear(card, user)).toBe(true);
  });

  it('allows superadmin to edit past year cards', () => {
    const user = makeUser({ role: 'superadmin' });
    const card = makeCard({ year: 2020 });
    expect(canEditPastYear(card, user)).toBe(true);
  });

  it('rejects editing past year cards for normal users', () => {
    const user = makeUser();
    const card = makeCard({ year: 2020 });
    expect(canEditPastYear(card, user)).toBe(false);
  });
});

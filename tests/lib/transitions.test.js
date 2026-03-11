/**
 * Tests for the status transition engine.
 * Covers: valid transitions, invalid transitions, missing fields,
 * validator-only actions, and all card types.
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getAvailableTransitions,
  getRequiredFields,
  isValidatorAction,
  TRANSITION_RULES,
} from '@lib/transitions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @returns {Record<string, unknown>} */
function makeTask(overrides = {}) {
  return {
    type: 'task',
    status: 'To Do',
    title: 'Test task',
    cardId: 'PLN-TSK-0001',
    developer: { id: 'dev_001', name: 'Alice', email: 'a@b.com' },
    validator: { id: 'stk_001', name: 'Bob', email: 'b@b.com' },
    epic: 'PLN-EPC-0001',
    sprint: 'PLN-SPR-0001',
    devPoints: 3,
    businessPoints: 5,
    acceptanceCriteria: [{ given: 'x', when: 'y', then: 'z' }],
    startDate: '2026-01-15',
    commits: [{ hash: 'abc123', message: 'feat: init', date: '2026-01-15', author: 'Alice' }],
    ...overrides,
  };
}

/** @returns {Record<string, unknown>} */
function makeBug(overrides = {}) {
  return {
    type: 'bug',
    status: 'Created',
    title: 'Test bug',
    cardId: 'PLN-BUG-0001',
    developer: { id: 'dev_001', name: 'Alice', email: 'a@b.com' },
    validator: { id: 'stk_001', name: 'Bob', email: 'b@b.com' },
    commits: [{ hash: 'def456', message: 'fix: bug', date: '2026-01-15', author: 'Alice' }],
    rootCause: 'Missing null check',
    resolution: 'Added null guard',
    ...overrides,
  };
}

const DEV_USER = { uid: 'dev_001', role: 'user' };
const VALIDATOR_USER = { uid: 'stk_001', role: 'user' };
const SUPERADMIN = { uid: 'admin_001', role: 'superadmin' };

// ---------------------------------------------------------------------------
// TRANSITION_RULES export
// ---------------------------------------------------------------------------

describe('TRANSITION_RULES', () => {
  it('exports task and bug rule sets', () => {
    expect(TRANSITION_RULES).toHaveProperty('task');
    expect(TRANSITION_RULES).toHaveProperty('bug');
    expect(Object.keys(TRANSITION_RULES.task).length).toBeGreaterThan(0);
    expect(Object.keys(TRANSITION_RULES.bug).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// canTransition — Task transitions
// ---------------------------------------------------------------------------

describe('canTransition — Task', () => {
  it('allows To Do -> In Progress with all required fields', () => {
    const card = makeTask({ status: 'To Do' });
    const result = canTransition(card, 'In Progress', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects To Do -> In Progress when developer is missing', () => {
    const card = makeTask({ status: 'To Do', developer: null });
    const result = canTransition(card, 'In Progress', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('developer');
  });

  it('rejects To Do -> In Progress when acceptanceCriteria is empty', () => {
    const card = makeTask({ status: 'To Do', acceptanceCriteria: [] });
    const result = canTransition(card, 'In Progress', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('acceptanceCriteria');
  });

  it('rejects To Do -> In Progress when multiple fields are missing', () => {
    const card = makeTask({
      status: 'To Do',
      developer: null,
      validator: null,
      devPoints: null,
    });
    const result = canTransition(card, 'In Progress', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('developer');
    expect(result.missing).toContain('validator');
    expect(result.missing).toContain('devPoints');
  });

  it('allows To Do -> Blocked with blockedReason', () => {
    const card = makeTask({ status: 'To Do', blockedReason: 'Waiting for API' });
    const result = canTransition(card, 'Blocked', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects To Do -> Blocked without blockedReason', () => {
    const card = makeTask({ status: 'To Do' });
    const result = canTransition(card, 'Blocked', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('blockedReason');
  });

  it('allows In Progress -> To Validate with startDate and commits', () => {
    const card = makeTask({ status: 'In Progress' });
    const result = canTransition(card, 'To Validate', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects In Progress -> To Validate without commits', () => {
    const card = makeTask({ status: 'In Progress', commits: [] });
    const result = canTransition(card, 'To Validate', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('commits');
  });

  it('allows In Progress -> To Do (pause)', () => {
    const card = makeTask({ status: 'In Progress' });
    const result = canTransition(card, 'To Do', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('allows In Progress -> Blocked', () => {
    const card = makeTask({ status: 'In Progress', blockedReason: 'External dep' });
    const result = canTransition(card, 'Blocked', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('allows To Validate -> Done for validator', () => {
    const card = makeTask({ status: 'To Validate' });
    const result = canTransition(card, 'Done', VALIDATOR_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects To Validate -> Done for non-validator', () => {
    const card = makeTask({ status: 'To Validate' });
    const result = canTransition(card, 'Done', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/validator/i);
  });

  it('allows To Validate -> Done for superadmin', () => {
    const card = makeTask({ status: 'To Validate' });
    const result = canTransition(card, 'Done', SUPERADMIN);
    expect(result.allowed).toBe(true);
  });

  it('allows To Validate -> Done&Validated for validator', () => {
    const card = makeTask({ status: 'To Validate' });
    const result = canTransition(card, 'Done&Validated', VALIDATOR_USER);
    expect(result.allowed).toBe(true);
  });

  it('allows To Validate -> Reopened for validator', () => {
    const card = makeTask({ status: 'To Validate' });
    const result = canTransition(card, 'Reopened', VALIDATOR_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects To Validate -> Reopened for developer', () => {
    const card = makeTask({ status: 'To Validate' });
    const result = canTransition(card, 'Reopened', DEV_USER);
    expect(result.allowed).toBe(false);
  });

  it('allows Done -> Done&Validated for validator', () => {
    const card = makeTask({ status: 'Done' });
    const result = canTransition(card, 'Done&Validated', VALIDATOR_USER);
    expect(result.allowed).toBe(true);
  });

  it('allows Reopened -> In Progress with developer', () => {
    const card = makeTask({ status: 'Reopened' });
    const result = canTransition(card, 'In Progress', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects Reopened -> In Progress without developer', () => {
    const card = makeTask({ status: 'Reopened', developer: null });
    const result = canTransition(card, 'In Progress', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('developer');
  });

  it('allows Reopened -> To Do', () => {
    const card = makeTask({ status: 'Reopened' });
    const result = canTransition(card, 'To Do', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('allows Blocked -> To Do', () => {
    const card = makeTask({ status: 'Blocked' });
    const result = canTransition(card, 'To Do', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('allows Blocked -> In Progress with developer', () => {
    const card = makeTask({ status: 'Blocked' });
    const result = canTransition(card, 'In Progress', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects invalid transition To Do -> Done', () => {
    const card = makeTask({ status: 'To Do' });
    const result = canTransition(card, 'Done', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });

  it('rejects transitioning to same status', () => {
    const card = makeTask({ status: 'To Do' });
    const result = canTransition(card, 'To Do', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already/i);
  });

  it('rejects Done&Validated -> any (terminal state)', () => {
    const card = makeTask({ status: 'Done&Validated' });
    const result = canTransition(card, 'To Do', DEV_USER);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canTransition — Bug transitions
// ---------------------------------------------------------------------------

describe('canTransition — Bug', () => {
  it('allows Created -> Assigned with developer', () => {
    const card = makeBug({ status: 'Created' });
    const result = canTransition(card, 'Assigned', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects Created -> Assigned without developer', () => {
    const card = makeBug({ status: 'Created', developer: null });
    const result = canTransition(card, 'Assigned', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('developer');
  });

  it('allows Assigned -> Fixed with commits', () => {
    const card = makeBug({ status: 'Assigned' });
    const result = canTransition(card, 'Fixed', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects Assigned -> Fixed without commits', () => {
    const card = makeBug({ status: 'Assigned', commits: [] });
    const result = canTransition(card, 'Fixed', DEV_USER);
    expect(result.allowed).toBe(false);
  });

  it('allows Fixed -> Verified for validator', () => {
    const card = makeBug({ status: 'Fixed' });
    const result = canTransition(card, 'Verified', VALIDATOR_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects Fixed -> Verified for non-validator', () => {
    const card = makeBug({ status: 'Fixed' });
    const result = canTransition(card, 'Verified', DEV_USER);
    expect(result.allowed).toBe(false);
  });

  it('allows Verified -> Closed with rootCause and resolution', () => {
    const card = makeBug({ status: 'Verified' });
    const result = canTransition(card, 'Closed', DEV_USER);
    expect(result.allowed).toBe(true);
  });

  it('rejects Verified -> Closed without rootCause', () => {
    const card = makeBug({ status: 'Verified', rootCause: null });
    const result = canTransition(card, 'Closed', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('rootCause');
  });

  it('rejects invalid transition Created -> Fixed', () => {
    const card = makeBug({ status: 'Created' });
    const result = canTransition(card, 'Fixed', DEV_USER);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canTransition — unsupported card types
// ---------------------------------------------------------------------------

describe('canTransition — unsupported types', () => {
  it('rejects transitions for epic type', () => {
    const card = { type: 'epic', status: 'Active' };
    const result = canTransition(card, 'Completed', DEV_USER);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/no transition rules/i);
  });

  it('rejects transitions for sprint type', () => {
    const card = { type: 'sprint', status: 'Active' };
    const result = canTransition(card, 'Completed', DEV_USER);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAvailableTransitions
// ---------------------------------------------------------------------------

describe('getAvailableTransitions', () => {
  it('returns all valid targets from To Do with all fields present', () => {
    const card = makeTask({ status: 'To Do', blockedReason: 'Something' });
    const transitions = getAvailableTransitions(card, DEV_USER);
    expect(transitions).toContain('In Progress');
    expect(transitions).toContain('Blocked');
  });

  it('returns only allowed targets (excludes those with missing fields)', () => {
    const card = makeTask({ status: 'To Do' }); // no blockedReason
    const transitions = getAvailableTransitions(card, DEV_USER);
    expect(transitions).toContain('In Progress');
    expect(transitions).not.toContain('Blocked'); // missing blockedReason
  });

  it('returns empty for terminal status Done&Validated', () => {
    const card = makeTask({ status: 'Done&Validated' });
    const transitions = getAvailableTransitions(card, DEV_USER);
    expect(transitions).toEqual([]);
  });

  it('returns validator-only transitions only for validators', () => {
    const card = makeTask({ status: 'To Validate' });

    const devTransitions = getAvailableTransitions(card, DEV_USER);
    expect(devTransitions).toEqual([]);

    const valTransitions = getAvailableTransitions(card, VALIDATOR_USER);
    expect(valTransitions).toContain('Done');
    expect(valTransitions).toContain('Done&Validated');
    expect(valTransitions).toContain('Reopened');
  });

  it('returns empty for unsupported card types', () => {
    const card = { type: 'epic', status: 'Active' };
    const transitions = getAvailableTransitions(card, DEV_USER);
    expect(transitions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRequiredFields
// ---------------------------------------------------------------------------

describe('getRequiredFields', () => {
  it('returns required fields for task To Do -> In Progress', () => {
    const fields = getRequiredFields('task', 'To Do', 'In Progress');
    expect(fields).toContain('developer');
    expect(fields).toContain('validator');
    expect(fields).toContain('epic');
    expect(fields).toContain('sprint');
    expect(fields).toContain('devPoints');
    expect(fields).toContain('businessPoints');
    expect(fields).toContain('acceptanceCriteria');
  });

  it('returns empty array for transitions with no required fields', () => {
    const fields = getRequiredFields('task', 'In Progress', 'To Do');
    expect(fields).toEqual([]);
  });

  it('returns empty for invalid transition', () => {
    const fields = getRequiredFields('task', 'To Do', 'Done');
    expect(fields).toEqual([]);
  });

  it('returns empty for unknown card type', () => {
    const fields = getRequiredFields('epic', 'Active', 'Completed');
    expect(fields).toEqual([]);
  });

  it('returns required fields for bug Created -> Assigned', () => {
    const fields = getRequiredFields('bug', 'Created', 'Assigned');
    expect(fields).toContain('developer');
  });

  it('returns required fields for bug Verified -> Closed', () => {
    const fields = getRequiredFields('bug', 'Verified', 'Closed');
    expect(fields).toContain('rootCause');
    expect(fields).toContain('resolution');
  });

  it('returns a new array (not the internal reference)', () => {
    const fields1 = getRequiredFields('task', 'To Do', 'In Progress');
    const fields2 = getRequiredFields('task', 'To Do', 'In Progress');
    expect(fields1).toEqual(fields2);
    expect(fields1).not.toBe(fields2); // different instances
  });
});

// ---------------------------------------------------------------------------
// isValidatorAction
// ---------------------------------------------------------------------------

describe('isValidatorAction', () => {
  it('returns true for To Validate -> Done', () => {
    expect(isValidatorAction('To Validate', 'Done')).toBe(true);
  });

  it('returns true for To Validate -> Done&Validated', () => {
    expect(isValidatorAction('To Validate', 'Done&Validated')).toBe(true);
  });

  it('returns true for To Validate -> Reopened', () => {
    expect(isValidatorAction('To Validate', 'Reopened')).toBe(true);
  });

  it('returns true for Done -> Done&Validated', () => {
    expect(isValidatorAction('Done', 'Done&Validated')).toBe(true);
  });

  it('returns true for Fixed -> Verified (bug)', () => {
    expect(isValidatorAction('Fixed', 'Verified')).toBe(true);
  });

  it('returns false for To Do -> In Progress', () => {
    expect(isValidatorAction('To Do', 'In Progress')).toBe(false);
  });

  it('returns false for In Progress -> To Validate', () => {
    expect(isValidatorAction('In Progress', 'To Validate')).toBe(false);
  });

  it('returns false for unknown transition', () => {
    expect(isValidatorAction('Done&Validated', 'To Do')).toBe(false);
  });
});

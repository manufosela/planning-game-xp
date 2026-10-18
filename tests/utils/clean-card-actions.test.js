/**
 * PLN-TSK-0366: validate / request-changes logic shared by the clean view
 * detail modal and the bulk action.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const updateCard = vi.fn().mockResolvedValue(undefined);
vi.mock('../../public/js/services/firebase-service.js', () => ({
  FirebaseService: { updateCard }
}));

const {
  getCardSection,
  isAwaitingValidation,
  canValidateCard,
  buildValidateUpdate,
  buildRequestChangesUpdate,
  validateCard,
  requestCardChanges
} = await import('@/utils/clean-card-actions.js');

const NOW = new Date('2026-10-17T10:00:00.000Z');

describe('getCardSection', () => {
  it('should map card types to their section', () => {
    expect(getCardSection('bugs')).toBe('bugs');
    expect(getCardSection('bug-card')).toBe('bugs');
    expect(getCardSection('proposal-card')).toBe('proposals');
    expect(getCardSection('task-card')).toBe('tasks');
    expect(getCardSection('')).toBe('tasks');
  });
});

describe('isAwaitingValidation', () => {
  it('should be true only for To Validate and Fixed', () => {
    expect(isAwaitingValidation('To Validate')).toBe(true);
    expect(isAwaitingValidation('Fixed')).toBe(true);
    expect(isAwaitingValidation('In Progress')).toBe(false);
    expect(isAwaitingValidation('Done&Validated')).toBe(false);
  });
});

// PLN-BUG-0128: same actors the status-validation Cloud Function accepts.
describe('canValidateCard', () => {
  const card = { validator: 'stk_002', coValidator: 'stk_003' };

  it('should allow the validator and the co-validator', () => {
    expect(canValidateCard(card, { stakeholderId: 'stk_002', isSuperAdmin: false })).toBe(true);
    expect(canValidateCard(card, { stakeholderId: 'stk_003', isSuperAdmin: false })).toBe(true);
  });

  it('should allow a SuperAdmin on any card', () => {
    expect(canValidateCard(card, { stakeholderId: 'stk_001', isSuperAdmin: true })).toBe(true);
    expect(canValidateCard({}, { stakeholderId: '', isSuperAdmin: true })).toBe(true);
  });

  it('should deny anyone else', () => {
    expect(canValidateCard(card, { stakeholderId: 'stk_001', isSuperAdmin: false })).toBe(false);
    expect(canValidateCard({}, { stakeholderId: '', isSuperAdmin: false })).toBe(false);
  });
});

describe('buildValidateUpdate', () => {
  it('should set Done&Validated with validatedAt and updatedBy', () => {
    expect(buildValidateUpdate({ userEmail: 'v@example.com', now: NOW })).toEqual({
      status: 'Done&Validated',
      validatedAt: '2026-10-17T10:00:00.000Z',
      updatedBy: 'v@example.com'
    });
  });
});

describe('buildRequestChangesUpdate', () => {
  const base = { status: 'To Validate', reason: 'Missing tests', userEmail: 'v@example.com', now: NOW };

  it('should reopen tasks and record the first reopen cycle', () => {
    const update = buildRequestChangesUpdate({ ...base, section: 'tasks' });
    expect(update.status).toBe('Reopened');
    expect(update.reopenCount).toBe(1);
    expect(update.reopenCycles).toEqual([{
      cycle: 1,
      reopenedAt: '2026-10-17T10:00:00.000Z',
      reopenedBy: 'v@example.com',
      previousStatus: 'To Validate',
      reason: 'Missing tests'
    }]);
    expect(update.notes).toMatch(/^\[REOPEN #1\] Solicitud de cambios \(.+\): Missing tests$/);
    expect(update).toMatchObject({ endDate: '', validatedAt: '', updatedBy: 'v@example.com' });
  });

  it('should send bugs back to In Progress', () => {
    const update = buildRequestChangesUpdate({ ...base, section: 'bugs', status: 'Fixed' });
    expect(update.status).toBe('In Progress');
  });

  it('should append to existing cycles and prepend the note to existing notes', () => {
    const previousCycle = { cycle: 1, reason: 'old' };
    const update = buildRequestChangesUpdate({
      ...base, section: 'tasks', reopenCount: 1, reopenCycles: [previousCycle], notesRaw: 'Old note'
    });
    expect(update.reopenCount).toBe(2);
    expect(update.reopenCycles).toHaveLength(2);
    expect(update.reopenCycles[0]).toBe(previousCycle);
    expect(update.notes).toMatch(/^\[REOPEN #2\].*Missing tests\n\nOld note$/);
  });

  it('should trim the reason and reject an empty one', () => {
    expect(buildRequestChangesUpdate({ ...base, section: 'tasks', reason: '  Fix it  ' }).reopenCycles[0].reason)
      .toBe('Fix it');
    expect(() => buildRequestChangesUpdate({ ...base, section: 'tasks', reason: '   ' }))
      .toThrow('reason is required');
  });
});

describe('validateCard / requestCardChanges', () => {
  beforeEach(() => updateCard.mockClear());

  it('should write the validate update to the card section', async () => {
    const newStatus = await validateCard({
      projectId: 'PlanningGame', cardType: 'bugs', firebaseId: '-abc', userEmail: 'v@example.com'
    });
    expect(newStatus).toBe('Done&Validated');
    expect(updateCard).toHaveBeenCalledWith('PlanningGame', 'BUGS', '-abc',
      expect.objectContaining({ status: 'Done&Validated', updatedBy: 'v@example.com' }));
  });

  it('should write the request-changes update to the card section', async () => {
    const newStatus = await requestCardChanges({
      projectId: 'PlanningGame', cardType: 'tasks', firebaseId: '-abc', userEmail: 'v@example.com',
      status: 'To Validate', reason: 'Missing tests'
    });
    expect(newStatus).toBe('Reopened');
    expect(updateCard).toHaveBeenCalledWith('PlanningGame', 'TASKS', '-abc',
      expect.objectContaining({ status: 'Reopened', reopenCount: 1 }));
  });

  it('should fail when firebaseId is missing', async () => {
    await expect(validateCard({ projectId: 'PlanningGame', cardType: 'tasks', firebaseId: '', userEmail: 'v@example.com' }))
      .rejects.toThrow('firebaseId is required');
    expect(updateCard).not.toHaveBeenCalled();
  });
});

/**
 * Tests for ChangeStatus use case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeStatus } from '../../../src/application/use-cases/change-status.js';

describe('ChangeStatus', () => {
  /** @type {any} */
  let cardRepo;
  /** @type {any} */
  let historyRepo;
  /** @type {any} */
  let transitionRepo;
  /** @type {any} */
  let backlogRepo;
  /** @type {ChangeStatus} */
  let useCase;

  const user = { uid: 'dev_001', role: 'developer', projects: { proj1: 'developer' } };
  const project = { id: 'proj1', wipLimit: 3 };

  beforeEach(() => {
    cardRepo = {
      get: vi.fn().mockResolvedValue({
        cardId: 'PLN-TSK-0001', type: 'task', title: 'Test task',
        status: 'To Do', year: 2026, createdBy: 'dev_001',
        developer: { id: 'dev_001', name: 'Dev', email: 'd@t.com' },
        validator: { id: 'stk_001', name: 'Val', email: 'v@t.com' },
        epic: 'PLN-EPC-0001', sprint: 'PLN-SPR-0001',
        devPoints: 2, businessPoints: 3,
        acceptanceCriteria: ['AC1'],
      }),
      update: vi.fn().mockResolvedValue(undefined),
      countByStatus: vi.fn().mockResolvedValue(1),
    };
    historyRepo = {
      add: vi.fn().mockResolvedValue(undefined),
    };
    transitionRepo = {
      getWipLimit: vi.fn().mockResolvedValue(5),
    };
    backlogRepo = {
      addCard: vi.fn().mockResolvedValue(undefined),
      removeCard: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ChangeStatus({
      cardRepository: cardRepo,
      historyRepository: historyRepo,
      stateTransitionRepository: transitionRepo,
      backlogRepository: backlogRepo,
    });
  });

  it('should transition To Do → In Progress', async () => {
    const result = await useCase.execute('proj1', 'PLN-TSK-0001', 'In Progress', user, project);

    expect(result.previousStatus).toBe('To Do');
    expect(result.newStatus).toBe('In Progress');
    expect(cardRepo.update).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', expect.objectContaining({
      status: 'In Progress',
    }));
  });

  it('should add startDate and workCycle when entering In Progress', async () => {
    await useCase.execute('proj1', 'PLN-TSK-0001', 'In Progress', user, project);

    const updateCall = cardRepo.update.mock.calls[0][2];
    expect(updateCall.startDate).toBeDefined();
    expect(updateCall.workCycles).toBeDefined();
    expect(updateCall.workCycles[0]).toHaveProperty('startDate');
    expect(updateCall.workCycles[0]).not.toHaveProperty('endDate');
  });

  it('should add endDate and close workCycle when leaving In Progress', async () => {
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-TSK-0001', type: 'task', title: 'Test task',
      status: 'In Progress', year: 2026, createdBy: 'dev_001',
      developer: { id: 'dev_001', name: 'Dev', email: 'd@t.com' },
      validator: { id: 'stk_001', name: 'Val', email: 'v@t.com' },
      startDate: '2026-03-01T00:00:00Z', commits: [{ hash: 'abc', message: 'feat', date: '2026-03-01', author: 'dev' }],
      workCycles: [{ startDate: '2026-03-01T00:00:00Z' }],
    });

    const result = await useCase.execute('proj1', 'PLN-TSK-0001', 'To Validate', user, project);

    expect(result.previousStatus).toBe('In Progress');
    expect(result.newStatus).toBe('To Validate');
    const updateCall = cardRepo.update.mock.calls[0][2];
    expect(updateCall.endDate).toBeDefined();
    expect(updateCall.workCycles[0]).toHaveProperty('endDate');
  });

  it('should throw if transition is not allowed', async () => {
    // To Do → Done is not a valid transition
    await expect(
      useCase.execute('proj1', 'PLN-TSK-0001', 'Done', user, project)
    ).rejects.toThrow();
  });

  it('should throw if user cannot change status', async () => {
    const consultant = { uid: 'c1', role: 'user', projects: { proj1: 'consultant' } };
    await expect(
      useCase.execute('proj1', 'PLN-TSK-0001', 'In Progress', consultant, project)
    ).rejects.toThrow();
  });

  it('should check WIP limit before entering In Progress', async () => {
    transitionRepo.getWipLimit.mockResolvedValue(1);
    cardRepo.countByStatus.mockResolvedValue(1);

    await expect(
      useCase.execute('proj1', 'PLN-TSK-0001', 'In Progress', user, project)
    ).rejects.toThrow(/WIP/i);
  });

  it('should register history entry', async () => {
    await useCase.execute('proj1', 'PLN-TSK-0001', 'In Progress', user, project);

    expect(historyRepo.add).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', expect.objectContaining({
      action: 'status_changed',
      userId: 'dev_001',
    }));
  });

  it('should throw if card not found', async () => {
    cardRepo.get.mockResolvedValue(null);
    await expect(
      useCase.execute('proj1', 'NOPE', 'In Progress', user, project)
    ).rejects.toThrow('Card not found');
  });

  it('should add card to developer backlog when entering In Progress (R-2)', async () => {
    await useCase.execute('proj1', 'PLN-TSK-0001', 'In Progress', user, project);

    expect(backlogRepo.addCard).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', 'dev_001');
  });

  it('should remove card from developer backlog when leaving In Progress (R-2)', async () => {
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-TSK-0001', type: 'task', title: 'Test task',
      status: 'In Progress', year: 2026, createdBy: 'dev_001',
      developer: { id: 'dev_001', name: 'Dev', email: 'd@t.com' },
      validator: { id: 'stk_001', name: 'Val', email: 'v@t.com' },
      startDate: '2026-03-01T00:00:00Z', commits: [{ hash: 'abc', message: 'feat', date: '2026-03-01', author: 'dev' }],
      workCycles: [{ startDate: '2026-03-01T00:00:00Z' }],
    });

    await useCase.execute('proj1', 'PLN-TSK-0001', 'To Validate', user, project);

    expect(backlogRepo.removeCard).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', 'dev_001');
  });

  it('should allow valid status change on proposal cards (R-1)', async () => {
    const stakeholder = { uid: 'stk_001', role: 'user', projects: { proj1: 'stakeholder' } };
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-PRP-0001', type: 'proposal', title: 'Feature idea',
      status: 'Pending', year: 2026, createdBy: 'stk_001',
    });

    const result = await useCase.execute('proj1', 'PLN-PRP-0001', 'Planned', stakeholder, project);

    expect(result.previousStatus).toBe('Pending');
    expect(result.newStatus).toBe('Planned');
    expect(cardRepo.update).toHaveBeenCalledWith('proj1', 'PLN-PRP-0001', expect.objectContaining({
      status: 'Planned',
    }));
  });

  it('should reject invalid status on proposal cards (R-1)', async () => {
    const stakeholder = { uid: 'stk_001', role: 'user', projects: { proj1: 'stakeholder' } };
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-PRP-0001', type: 'proposal', title: 'Feature idea',
      status: 'Pending', year: 2026, createdBy: 'stk_001',
    });

    await expect(
      useCase.execute('proj1', 'PLN-PRP-0001', 'SomeGarbage', stakeholder, project)
    ).rejects.toThrow(/Invalid status.*SomeGarbage.*proposal/);
  });

  it('should reject invalid status on epic cards (R-1)', async () => {
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-EPC-0001', type: 'epic', title: 'Epic one',
      status: 'Draft', year: 2026, createdBy: 'dev_001',
    });

    await expect(
      useCase.execute('proj1', 'PLN-EPC-0001', 'In Progress', user, project)
    ).rejects.toThrow(/Invalid status.*In Progress.*epic/);
  });

  it('should reject unknown card types without status rules (R-1)', async () => {
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-UNK-0001', type: 'unknown_type', title: 'Unknown',
      status: 'Open', year: 2026, createdBy: 'dev_001',
    });

    await expect(
      useCase.execute('proj1', 'PLN-UNK-0001', 'Closed', user, project)
    ).rejects.toThrow(/No status rules defined/);
  });

  it('should still enforce permission checks on proposal cards (R-1)', async () => {
    const consultant = { uid: 'c1', role: 'user', projects: { proj1: 'consultant' } };
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-PRP-0001', type: 'proposal', title: 'Feature idea',
      status: 'Pending', year: 2026, createdBy: 'stk_001',
    });

    await expect(
      useCase.execute('proj1', 'PLN-PRP-0001', 'Planned', consultant, project)
    ).rejects.toThrow();
  });

  it('should reset startDate and clear endDate when re-entering In Progress (R-2)', async () => {
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-TSK-0001', type: 'task', title: 'Test task',
      status: 'Reopened', year: 2026, createdBy: 'dev_001',
      developer: { id: 'dev_001', name: 'Dev', email: 'd@t.com' },
      validator: { id: 'stk_001', name: 'Val', email: 'v@t.com' },
      startDate: '2026-02-01T00:00:00Z',
      endDate: '2026-02-05T00:00:00Z',
      workCycles: [
        { startDate: '2026-02-01T00:00:00Z', endDate: '2026-02-05T00:00:00Z' },
      ],
    });

    await useCase.execute('proj1', 'PLN-TSK-0001', 'In Progress', user, project);

    const updateCall = cardRepo.update.mock.calls[0][2];
    // startDate must be fresh, not the old '2026-02-01T00:00:00Z'
    expect(updateCall.startDate).not.toBe('2026-02-01T00:00:00Z');
    expect(updateCall.startDate).toBeDefined();
    // endDate must be cleared
    expect(updateCall.endDate).toBeNull();
    // A new workCycle must be appended
    expect(updateCall.workCycles).toHaveLength(2);
    expect(updateCall.workCycles[1]).toHaveProperty('startDate');
    expect(updateCall.workCycles[1]).not.toHaveProperty('endDate');
  });

  it('should not touch backlog for transitions not involving In Progress (R-2)', async () => {
    // Reopened → To Do (neither from nor to In Progress)
    cardRepo.get.mockResolvedValue({
      cardId: 'PLN-TSK-0001', type: 'task', title: 'Test task',
      status: 'Reopened', year: 2026, createdBy: 'dev_001',
      developer: { id: 'dev_001', name: 'Dev', email: 'd@t.com' },
      validator: { id: 'stk_001', name: 'Val', email: 'v@t.com' },
    });

    await useCase.execute('proj1', 'PLN-TSK-0001', 'To Do', user, project);

    expect(backlogRepo.addCard).not.toHaveBeenCalled();
    expect(backlogRepo.removeCard).not.toHaveBeenCalled();
  });
});

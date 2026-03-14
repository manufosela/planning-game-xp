/**
 * Tests for CreateCard use case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateCard } from '../../../src/application/use-cases/create-card.js';

describe('CreateCard', () => {
  /** @type {any} */
  let cardRepo;
  /** @type {any} */
  let historyRepo;
  /** @type {any} */
  let backlogRepo;
  /** @type {CreateCard} */
  let useCase;

  const user = { uid: 'dev_001', role: 'developer', projects: { proj1: 'developer' } };
  const project = { id: 'proj1' };

  beforeEach(() => {
    cardRepo = {
      generateId: vi.fn().mockReturnValue('PLN-TSK-0001'),
      save: vi.fn().mockResolvedValue(undefined),
    };
    historyRepo = {
      add: vi.fn().mockResolvedValue(undefined),
    };
    backlogRepo = {
      addCard: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new CreateCard({ cardRepository: cardRepo, historyRepository: historyRepo, backlogRepository: backlogRepo });
  });

  it('should create a card and return cardId', async () => {
    const data = { title: 'Test card', type: 'task', status: 'To Do', year: 2026 };
    const result = await useCase.execute('proj1', data, user, project);

    expect(result.cardId).toBe('PLN-TSK-0001');
    expect(cardRepo.generateId).toHaveBeenCalledWith('proj1', 'task');
    expect(cardRepo.save).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', expect.objectContaining({
      title: 'Test card',
      cardId: 'PLN-TSK-0001',
      createdBy: 'dev_001',
    }));
  });

  it('should register history entry', async () => {
    const data = { title: 'Test card', type: 'task', status: 'To Do', year: 2026 };
    await useCase.execute('proj1', data, user, project);

    expect(historyRepo.add).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', expect.objectContaining({
      action: 'created',
      userId: 'dev_001',
    }));
  });

  it('should add to backlog if card has a developer', async () => {
    const admin = { uid: 'admin_001', role: 'superadmin', projects: { proj1: 'admin' } };
    const data = { title: 'Assigned card', type: 'task', status: 'To Do', year: 2026, developer: { id: 'dev_002' } };
    await useCase.execute('proj1', data, admin, project);

    expect(backlogRepo.addCard).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', 'dev_002');
  });

  it('should NOT add to backlog if card has no developer', async () => {
    const data = { title: 'Unassigned', type: 'task', status: 'To Do', year: 2026 };
    await useCase.execute('proj1', data, user, project);

    expect(backlogRepo.addCard).not.toHaveBeenCalled();
  });

  it('should throw if user is not a project member', async () => {
    const outsideUser = { uid: 'u1', role: 'user', projects: {} };
    const data = { title: 'x', type: 'task', status: 'To Do', year: 2026 };

    await expect(useCase.execute('proj1', data, outsideUser, project)).rejects.toThrow('Permission denied');
  });

  it('should throw if consultant tries to create a card (R-1: role-based check)', async () => {
    const consultant = { uid: 'c1', role: 'user', projects: { proj1: 'consultant' } };
    const data = { title: 'x', type: 'task', status: 'To Do', year: 2026 };

    await expect(useCase.execute('proj1', data, consultant, project)).rejects.toThrow('Permission denied');
  });

  it('should allow stakeholder to create a proposal but not a task (R-1)', async () => {
    const stakeholder = { uid: 's1', role: 'user', projects: { proj1: 'stakeholder' } };
    const proposal = { title: 'Feature idea', type: 'proposal', status: 'Pending', year: 2026 };

    const result = await useCase.execute('proj1', proposal, stakeholder, project);
    expect(result.cardId).toBe('PLN-TSK-0001');

    const task = { title: 'Task', type: 'task', status: 'To Do', year: 2026 };
    await expect(useCase.execute('proj1', task, stakeholder, project)).rejects.toThrow('Permission denied');
  });
});

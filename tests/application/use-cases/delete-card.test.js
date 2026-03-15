/**
 * Tests for DeleteCard use case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteCard } from '../../../src/application/use-cases/delete-card.js';

describe('DeleteCard', () => {
  /** @type {any} */
  let cardRepo;
  /** @type {any} */
  let historyRepo;
  /** @type {DeleteCard} */
  let useCase;

  const admin = { uid: 'admin_001', role: 'superadmin', projects: { proj1: 'admin' } };
  const project = { id: 'proj1' };

  beforeEach(() => {
    cardRepo = {
      get: vi.fn().mockResolvedValue({
        cardId: 'PLN-TSK-0001', type: 'task', title: 'To delete',
        status: 'To Do', year: 2026, createdBy: 'admin_001',
      }),
      moveToTrash: vi.fn().mockResolvedValue(undefined),
    };
    historyRepo = {
      add: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new DeleteCard({ cardRepository: cardRepo, historyRepository: historyRepo });
  });

  it('should soft-delete the card', async () => {
    const result = await useCase.execute('proj1', 'PLN-TSK-0001', admin, project);

    expect(result.deleted).toBe(true);
    expect(cardRepo.moveToTrash).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001');
  });

  it('should register history entry', async () => {
    await useCase.execute('proj1', 'PLN-TSK-0001', admin, project);

    expect(historyRepo.add).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', expect.objectContaining({
      action: 'deleted',
      userId: 'admin_001',
    }));
  });

  it('should throw if user cannot delete the card', async () => {
    const consultant = { uid: 'c1', role: 'user', projects: { proj1: 'consultant' } };
    await expect(
      useCase.execute('proj1', 'PLN-TSK-0001', consultant, project)
    ).rejects.toThrow('Permission denied');
  });

  it('should throw if card not found', async () => {
    cardRepo.get.mockResolvedValue(null);
    await expect(
      useCase.execute('proj1', 'NOPE', admin, project)
    ).rejects.toThrow('Card not found');
  });
});

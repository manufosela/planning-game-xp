/**
 * Tests for UpdateCard use case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateCard } from '../../../src/application/use-cases/update-card.js';

describe('UpdateCard', () => {
  /** @type {any} */
  let cardRepo;
  /** @type {any} */
  let historyRepo;
  /** @type {UpdateCard} */
  let useCase;

  const user = { uid: 'dev_001', role: 'developer', projects: { proj1: 'admin' } };
  const project = { id: 'proj1' };

  beforeEach(() => {
    cardRepo = {
      get: vi.fn().mockResolvedValue({
        cardId: 'PLN-TSK-0001', type: 'task', title: 'Old title',
        status: 'To Do', year: 2026, createdBy: 'dev_001',
      }),
      update: vi.fn().mockResolvedValue(undefined),
    };
    historyRepo = {
      add: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new UpdateCard({ cardRepository: cardRepo, historyRepository: historyRepo });
  });

  it('should update card fields', async () => {
    const result = await useCase.execute('proj1', 'PLN-TSK-0001', { title: 'New title' }, user, project);

    expect(result.updated).toBe(true);
    expect(cardRepo.update).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', { title: 'New title' });
  });

  it('should register history with diff of changes', async () => {
    await useCase.execute('proj1', 'PLN-TSK-0001', { title: 'New title' }, user, project);

    expect(historyRepo.add).toHaveBeenCalledWith('proj1', 'PLN-TSK-0001', expect.objectContaining({
      action: 'updated',
      userId: 'dev_001',
      changes: expect.objectContaining({
        title: { from: 'Old title', to: 'New title' },
      }),
    }));
  });

  it('should throw if user cannot edit the card', async () => {
    const outsideUser = { uid: 'u2', role: 'user', projects: {} };
    await expect(
      useCase.execute('proj1', 'PLN-TSK-0001', { title: 'x' }, outsideUser, project)
    ).rejects.toThrow('Permission denied');
  });

  it('should throw if card not found', async () => {
    cardRepo.get.mockResolvedValue(null);
    await expect(
      useCase.execute('proj1', 'NOPE', { title: 'x' }, user, project)
    ).rejects.toThrow('Card not found');
  });
});

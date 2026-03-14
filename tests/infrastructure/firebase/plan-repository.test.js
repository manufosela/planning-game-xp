import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/firestore.js', () => ({
  getPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
}));

import { FirebasePlanRepository } from '../../../src/infrastructure/firebase/plan-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebasePlanRepository', () => {
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebasePlanRepository();
  });

  describe('getPlans', () => {
    it('delegates to firestore.getPlans', async () => {
      const plans = [{ planId: 'pl1', title: 'Plan 1' }];
      firestore.getPlans.mockResolvedValue(plans);

      const result = await repo.getPlans('p1');

      expect(firestore.getPlans).toHaveBeenCalledWith('p1');
      expect(result).toEqual(plans);
    });
  });

  describe('getPlan', () => {
    it('finds plan by id from getPlans result', async () => {
      const plans = [
        { planId: 'pl1', title: 'Plan 1' },
        { planId: 'pl2', title: 'Plan 2' },
      ];
      firestore.getPlans.mockResolvedValue(plans);

      const result = await repo.getPlan('p1', 'pl2');

      expect(result).toEqual({ planId: 'pl2', title: 'Plan 2' });
    });

    it('returns null when plan not found', async () => {
      firestore.getPlans.mockResolvedValue([]);

      const result = await repo.getPlan('p1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('savePlan', () => {
    it('calls createPlan for new plans (no planId)', async () => {
      firestore.createPlan.mockResolvedValue('new-id');

      await repo.savePlan('p1', { title: 'New Plan' });

      expect(firestore.createPlan).toHaveBeenCalledWith('p1', { title: 'New Plan' });
      expect(firestore.updatePlan).not.toHaveBeenCalled();
    });

    it('calls updatePlan for existing plans (with planId)', async () => {
      firestore.updatePlan.mockResolvedValue(undefined);

      await repo.savePlan('p1', { planId: 'pl1', title: 'Updated' });

      expect(firestore.updatePlan).toHaveBeenCalledWith('p1', 'pl1', { title: 'Updated' });
      expect(firestore.createPlan).not.toHaveBeenCalled();
    });
  });

  describe('deletePlan', () => {
    it('delegates to firestore.deletePlan', async () => {
      firestore.deletePlan.mockResolvedValue(undefined);

      await repo.deletePlan('p1', 'pl1');

      expect(firestore.deletePlan).toHaveBeenCalledWith('p1', 'pl1');
    });
  });
});

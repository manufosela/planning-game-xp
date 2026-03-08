import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockListCards = vi.fn();
const mockGetGlobalProposalOrder = vi.fn();
const mockSetGlobalProposalOrder = vi.fn();
const mockSubscribeToGlobalProposalOrder = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    cards: {
      listCards: (...args) => mockListCards(...args),
    },
    config: {
      getGlobalProposalOrder: (...args) => mockGetGlobalProposalOrder(...args),
      setGlobalProposalOrder: (...args) => mockSetGlobalProposalOrder(...args),
      subscribeToGlobalProposalOrder: (...args) => mockSubscribeToGlobalProposalOrder(...args),
    },
  },
}));

const { globalProposalsService } = await import('../../public/js/services/global-proposals-service.js');

beforeEach(() => {
  mockListCards.mockReset();
  mockGetGlobalProposalOrder.mockReset();
  mockSetGlobalProposalOrder.mockReset();
  mockSubscribeToGlobalProposalOrder.mockReset();
});

describe('globalProposalsService', () => {
  describe('loadAllProposals', () => {
    it('loads proposals from multiple projects via DAL', async () => {
      mockListCards
        .mockResolvedValueOnce({
          '-abc': { title: 'Prop 1', status: 'To Do' },
          '-def': { title: 'Prop 2', status: 'To Do' }
        })
        .mockResolvedValueOnce({
          '-ghi': { title: 'Prop 3', status: 'To Do' }
        });

      const result = await globalProposalsService.loadAllProposals(['ProjectA', 'ProjectB']);

      expect(mockListCards).toHaveBeenCalledWith('ProjectA', 'proposal');
      expect(mockListCards).toHaveBeenCalledWith('ProjectB', 'proposal');
      expect(result).toHaveLength(3);
      expect(result[0].firebaseId).toBe('-abc');
      expect(result[0].projectId).toBe('ProjectA');
      expect(result[0].compositeKey).toBe('ProjectA/-abc');
    });

    it('handles projects with no proposals', async () => {
      mockListCards.mockResolvedValueOnce(null);

      const result = await globalProposalsService.loadAllProposals(['EmptyProject']);

      expect(result).toHaveLength(0);
    });

    it('silently ignores errors from individual projects', async () => {
      mockListCards
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce({ '-abc': { title: 'Prop 1' } });

      const result = await globalProposalsService.loadAllProposals(['FailProject', 'OkProject']);

      expect(result).toHaveLength(1);
    });
  });

  describe('loadGlobalOrder', () => {
    it('returns order data from DAL', async () => {
      const orderData = { order: ['A/-abc', 'B/-def'], lastUpdatedBy: 'user@test.com' };
      mockGetGlobalProposalOrder.mockResolvedValueOnce(orderData);

      const result = await globalProposalsService.loadGlobalOrder();

      expect(result).toEqual(orderData);
    });

    it('returns default when no data exists', async () => {
      mockGetGlobalProposalOrder.mockResolvedValueOnce(null);

      const result = await globalProposalsService.loadGlobalOrder();

      expect(result).toEqual({ order: [], lastUpdatedBy: null, lastUpdatedAt: null });
    });

    it('returns default on error', async () => {
      mockGetGlobalProposalOrder.mockRejectedValueOnce(new Error('fail'));

      const result = await globalProposalsService.loadGlobalOrder();

      expect(result).toEqual({ order: [], lastUpdatedBy: null, lastUpdatedAt: null });
    });
  });

  describe('saveGlobalOrder', () => {
    it('saves order via DAL config', async () => {
      mockSetGlobalProposalOrder.mockResolvedValueOnce(undefined);
      const proposals = [
        { compositeKey: 'A/-abc', projectId: 'A', firebaseId: '-abc' },
        { compositeKey: 'B/-def', projectId: 'B', firebaseId: '-def' }
      ];

      await globalProposalsService.saveGlobalOrder(proposals, 'user@test.com');

      expect(mockSetGlobalProposalOrder).toHaveBeenCalledOnce();
      const savedData = mockSetGlobalProposalOrder.mock.calls[0][0];
      expect(savedData.order).toEqual(['A/-abc', 'B/-def']);
      expect(savedData.lastUpdatedBy).toBe('user@test.com');
      expect(savedData.lastUpdatedAt).toBeTruthy();
    });
  });

  describe('mergeWithOrder', () => {
    it('orders proposals according to stored order', () => {
      const proposals = [
        { compositeKey: 'A/-abc', title: 'First' },
        { compositeKey: 'B/-def', title: 'Second' },
        { compositeKey: 'C/-ghi', title: 'Third' }
      ];
      const storedOrder = ['C/-ghi', 'A/-abc'];

      const result = globalProposalsService.mergeWithOrder(proposals, storedOrder);

      expect(result[0].compositeKey).toBe('C/-ghi');
      expect(result[1].compositeKey).toBe('A/-abc');
      expect(result[2].compositeKey).toBe('B/-def');
    });

    it('appends new proposals not in order', () => {
      const proposals = [
        { compositeKey: 'A/-new', title: 'New' }
      ];

      const result = globalProposalsService.mergeWithOrder(proposals, []);

      expect(result).toHaveLength(1);
      expect(result[0].compositeKey).toBe('A/-new');
    });
  });

  describe('subscribeToOrderChanges', () => {
    it('delegates to DAL config subscribe', () => {
      const callback = vi.fn();
      const unsubscribe = vi.fn();
      mockSubscribeToGlobalProposalOrder.mockReturnValueOnce(unsubscribe);

      const result = globalProposalsService.subscribeToOrderChanges(callback);

      expect(mockSubscribeToGlobalProposalOrder).toHaveBeenCalledOnce();
      expect(result).toBe(unsubscribe);
    });

    it('wraps callback to provide default value for null data', () => {
      const callback = vi.fn();
      mockSubscribeToGlobalProposalOrder.mockImplementation((cb) => {
        cb(null);
        return vi.fn();
      });

      globalProposalsService.subscribeToOrderChanges(callback);

      expect(callback).toHaveBeenCalledWith({ order: [] });
    });
  });
});

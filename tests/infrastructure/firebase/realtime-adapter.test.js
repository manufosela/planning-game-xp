import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/realtime.js', () => ({
  subscribeToCards: vi.fn(),
  subscribeToCard: vi.fn(),
  subscribeToNotifications: vi.fn(),
}));

import { FirebaseRealtimeAdapter } from '../../../src/infrastructure/firebase/realtime-adapter.js';
import * as realtime from '../../../src/lib/realtime.js';

describe('FirebaseRealtimeAdapter', () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new FirebaseRealtimeAdapter();
  });

  describe('subscribeToCards', () => {
    it('delegates to realtime.subscribeToCards and returns unsubscribe', () => {
      const unsubscribe = vi.fn();
      realtime.subscribeToCards.mockReturnValue(unsubscribe);
      const onUpdate = vi.fn();

      const unsub = adapter.subscribeToCards('p1', onUpdate);

      expect(realtime.subscribeToCards).toHaveBeenCalledWith('p1', onUpdate);
      expect(unsub).toBe(unsubscribe);
    });
  });

  describe('subscribeToCard', () => {
    it('delegates to realtime.subscribeToCard and returns unsubscribe', () => {
      const unsubscribe = vi.fn();
      realtime.subscribeToCard.mockReturnValue(unsubscribe);
      const onUpdate = vi.fn();

      const unsub = adapter.subscribeToCard('p1', 'c1', onUpdate);

      expect(realtime.subscribeToCard).toHaveBeenCalledWith('p1', 'c1', onUpdate);
      expect(unsub).toBe(unsubscribe);
    });
  });

  describe('subscribeToNotifications', () => {
    it('delegates to realtime.subscribeToNotifications and returns unsubscribe', () => {
      const unsubscribe = vi.fn();
      realtime.subscribeToNotifications.mockReturnValue(unsubscribe);
      const onUpdate = vi.fn();

      const unsub = adapter.subscribeToNotifications('u1', onUpdate);

      expect(realtime.subscribeToNotifications).toHaveBeenCalledWith('u1', onUpdate);
      expect(unsub).toBe(unsubscribe);
    });
  });
});

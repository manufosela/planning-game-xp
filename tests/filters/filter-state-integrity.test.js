/**
 * Regression tests for PLN-BUG-0119 — FilterState key integrity.
 *
 * Two latent defects surfaced during the PLN-BUG-0117 analysis:
 *  1. _notifyAllSubscribers split the subscriber key with split('_'),
 *     so a projectId containing underscores ('MI_PRJ') was notified as
 *     projectId='MI' / cardType='PRJ' with empty filters. The rest of
 *     the file already used lastIndexOf('_') correctly.
 *  2. setFilter/setFilters accepted empty projectId/cardType, silently
 *     polluting state under malformed keys ('pgxp_filters__task') that
 *     no view ever reads back.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FilterState } from '@/filters/core/filter-state.js';

describe('FilterState — key integrity (PLN-BUG-0119)', () => {
  let filterState;
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = {
      store: {},
      getItem: vi.fn((key) => localStorageMock.store[key] || null),
      setItem: vi.fn((key, value) => { localStorageMock.store[key] = value; }),
      removeItem: vi.fn((key) => { delete localStorageMock.store[key]; }),
      clear: vi.fn(() => { localStorageMock.store = {}; }),
      key: vi.fn((i) => Object.keys(localStorageMock.store)[i]),
      get length() { return Object.keys(localStorageMock.store).length; }
    };
    vi.stubGlobal('localStorage', localStorageMock);
    filterState = new FilterState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('_notifyAllSubscribers with underscore projectIds', () => {
    it('notifies the REAL filters for a projectId containing underscores', () => {
      const received = [];
      filterState.setFilter('MI_PRJ', 'task', 'status', ['To Do']);
      filterState.subscribe('MI_PRJ', 'task', (filters) => received.push(filters));

      filterState._notifyAllSubscribers();

      expect(received).toHaveLength(1);
      // The old split('_') resolved projectId='MI' → getFilters returned {}.
      expect(received[0]).toEqual({ status: ['To Do'] });
    });

    it('still notifies simple projectIds correctly', () => {
      const received = [];
      filterState.setFilter('Simple', 'bug', 'status', ['Created']);
      filterState.subscribe('Simple', 'bug', (filters) => received.push(filters));

      filterState._notifyAllSubscribers();

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ status: ['Created'] });
    });
  });

  describe('setFilter/setFilters guards against malformed keys', () => {
    it('ignores setFilter with empty projectId (no state, no storage)', () => {
      filterState.setFilter('', 'task', 'status', ['To Do']);

      expect(filterState.getFilters('', 'task')).toEqual({});
      const pollutedKeys = Object.keys(localStorageMock.store)
        .filter(k => k.includes('__') || k.endsWith('_'));
      expect(pollutedKeys).toEqual([]);
    });

    it('ignores setFilter with empty cardType', () => {
      filterState.setFilter('PROJECT1', '', 'status', ['To Do']);
      expect(filterState.getFilters('PROJECT1', '')).toEqual({});
    });

    it('ignores setFilters with empty projectId', () => {
      filterState.setFilters('', 'task', { status: ['To Do'] });
      expect(filterState.getFilters('', 'task')).toEqual({});
    });

    it('valid calls keep working as before', () => {
      filterState.setFilter('PROJECT1', 'task', 'status', ['To Do']);
      expect(filterState.getFilter('PROJECT1', 'task', 'status')).toEqual(['To Do']);
    });
  });
});

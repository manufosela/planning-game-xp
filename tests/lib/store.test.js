/**
 * Tests for the signal-based reactive store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { cards, filters, filteredCards, theme, authUser, currentProject } from '../../src/lib/store.js';

describe('store signals', () => {
  describe('initial values', () => {
    it('should have authUser as null', () => {
      expect(authUser.value).toBeNull();
    });

    it('should have currentProject as null', () => {
      expect(currentProject.value).toBeNull();
    });

    it('should have cards as empty array', () => {
      expect(cards.value).toEqual([]);
    });

    it('should have theme as system', () => {
      expect(theme.value).toBe('system');
    });

    it('should have filters with default year', () => {
      const f = filters.value;
      expect(f.type).toBe('all');
      expect(f.status).toBe('all');
      expect(f.year).toBe(new Date().getFullYear());
      expect(f.developer).toBeNull();
      expect(f.sprint).toBe('');
      expect(f.epic).toBe('');
      expect(f.tags).toEqual([]);
      expect(f.search).toBe('');
    });
  });

  describe('filteredCards computed', () => {
    const mockCards = [
      { cardId: 'PLN-TSK-0001', type: 'task', title: 'Setup project', status: 'To Do', year: 2026, tags: ['INFRA'] },
      { cardId: 'PLN-TSK-0002', type: 'task', title: 'Add auth', status: 'In Progress', year: 2026, developer: { id: 'dev_001', name: 'Dev', email: 'dev@test.com' } },
      { cardId: 'PLN-BUG-0001', type: 'bug', title: 'Fix login crash', status: 'Created', year: 2025 },
      { cardId: 'PLN-TSK-0003', type: 'task', title: 'Dashboard', status: 'Done', year: 2026, sprint: 'PLN-SPR-0001', epic: 'PLN-EPC-0001', tags: ['UI'] },
    ];

    beforeEach(() => {
      cards.value = /** @type {any} */ (mockCards);
      filters.value = {
        type: 'all',
        status: 'all',
        year: null,
        developer: null,
        sprint: '',
        epic: '',
        tags: [],
        query: '',
        search: '',
      };
    });

    it('should return all cards when no filters set', () => {
      expect(filteredCards.value).toHaveLength(4);
    });

    it('should filter by type', () => {
      filters.value = { ...filters.value, type: 'task' };
      expect(filteredCards.value).toHaveLength(3);
      expect(filteredCards.value.every((c) => c.type === 'task')).toBe(true);
    });

    it('should filter by status', () => {
      filters.value = { ...filters.value, status: 'To Do' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-TSK-0001');
    });

    it('should filter by year', () => {
      filters.value = { ...filters.value, year: 2025 };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-BUG-0001');
    });

    it('should filter by developer', () => {
      filters.value = { ...filters.value, developer: 'dev_001' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-TSK-0002');
    });

    it('should filter by sprint', () => {
      filters.value = { ...filters.value, sprint: 'PLN-SPR-0001' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-TSK-0003');
    });

    it('should filter by epic', () => {
      filters.value = { ...filters.value, epic: 'PLN-EPC-0001' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-TSK-0003');
    });

    it('should filter by tags', () => {
      filters.value = { ...filters.value, tags: ['INFRA'] };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-TSK-0001');
    });

    it('should filter by search on title', () => {
      filters.value = { ...filters.value, search: 'login' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-BUG-0001');
    });

    it('should filter by search on cardId', () => {
      filters.value = { ...filters.value, search: 'BUG' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-BUG-0001');
    });

    it('should combine multiple filters', () => {
      filters.value = { ...filters.value, type: 'task', year: 2026, status: 'Done' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('PLN-TSK-0003');
    });

    it('should return empty when no matches', () => {
      filters.value = { ...filters.value, type: 'epic' };
      expect(filteredCards.value).toHaveLength(0);
    });
  });

  describe('theme signal', () => {
    it('should accept valid theme values', () => {
      theme.value = 'light';
      expect(theme.value).toBe('light');

      theme.value = 'dark';
      expect(theme.value).toBe('dark');

      theme.value = 'system';
      expect(theme.value).toBe('system');
    });
  });
});

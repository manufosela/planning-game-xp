/**
 * Tests for the enhanced application store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  authUser, currentProject, cards, filters, filteredCards,
  projects, currentCard, panelOpen, theme, notifications,
  unreadCount, wipTasks, team, sprints, epics, adrs, plans,
  loading, error, setFilters, resetFilters, withValue,
} from '../../src/application/store.js';

describe('application store', () => {
  describe('existing signals retain defaults', () => {
    it('authUser defaults to null', () => {
      expect(authUser.value).toBeNull();
    });

    it('cards defaults to empty array', () => {
      expect(cards.value).toEqual([]);
    });

    it('theme defaults to system', () => {
      expect(theme.value).toBe('system');
    });

    it('panelOpen defaults to false', () => {
      expect(panelOpen.value).toBe(false);
    });
  });

  describe('new signals', () => {
    it('team defaults to empty array', () => {
      expect(team.value).toEqual([]);
    });

    it('sprints defaults to empty array', () => {
      expect(sprints.value).toEqual([]);
    });

    it('epics defaults to empty array', () => {
      expect(epics.value).toEqual([]);
    });

    it('adrs defaults to empty array', () => {
      expect(adrs.value).toEqual([]);
    });

    it('plans defaults to empty array', () => {
      expect(plans.value).toEqual([]);
    });

    it('loading defaults to false', () => {
      expect(loading.value).toBe(false);
    });

    it('error defaults to null', () => {
      expect(error.value).toBeNull();
    });
  });

  describe('withValue helper', () => {
    it('should be exported as a function', () => {
      expect(typeof withValue).toBe('function');
    });
  });

  describe('filteredCards computed uses applyFilters', () => {
    const mockCards = /** @type {any[]} */ ([
      { cardId: 'TSK-0001', type: 'task', title: 'Setup', status: 'To Do', year: 2026, tags: ['INFRA'] },
      { cardId: 'TSK-0002', type: 'task', title: 'Auth', status: 'In Progress', year: 2026, developer: { id: 'dev_001' } },
      { cardId: 'BUG-0001', type: 'bug', title: 'Fix crash', status: 'Created', year: 2025, description: 'login crash' },
    ]);

    beforeEach(() => {
      cards.value = mockCards;
      filters.value = {
        type: 'all', status: 'all', year: null, developer: null,
        sprint: '', epic: '', tags: [], query: '', search: '',
      };
    });

    it('returns all cards with no filters', () => {
      expect(filteredCards.value).toHaveLength(3);
    });

    it('filters by type', () => {
      filters.value = { ...filters.value, type: 'bug' };
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('BUG-0001');
    });

    it('filters by search including description (applyFilters feature)', () => {
      filters.value = { ...filters.value, search: 'login' };
      // applyFilters uses matchesSearch which checks description too
      expect(filteredCards.value).toHaveLength(1);
      expect(filteredCards.value[0].cardId).toBe('BUG-0001');
    });
  });

  describe('setFilters / resetFilters', () => {
    beforeEach(() => {
      resetFilters();
    });

    it('setFilters merges partial updates', () => {
      setFilters({ type: 'bug' });
      expect(filters.value.type).toBe('bug');
      expect(filters.value.year).toBe(new Date().getFullYear());
    });

    it('resetFilters restores defaults', () => {
      setFilters({ type: 'bug', status: 'Created' });
      resetFilters();
      expect(filters.value.type).toBe('all');
      expect(filters.value.status).toBe('all');
    });
  });
});

/**
 * Coverage gap tests: application store signals.
 * Tests filteredCards computed signal, loading/error state management,
 * and signal reactivity (set → get reflects change).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  authUser, currentProject, cards, currentCard, filters, filteredCards,
  projects, panelOpen, theme, notifications, unreadCount, wipTasks,
  team, sprints, epics, adrs, plans, loading, error,
  setFilters, resetFilters, withValue,
} from '../../src/application/store.js';

describe('coverage: store signals', () => {
  describe('filteredCards computed signal filters correctly', () => {
    const mockCards = [
      { cardId: 'TSK-0001', type: 'task', title: 'Setup project', status: 'To Do', year: 2026, tags: ['INFRA'], developer: null },
      { cardId: 'TSK-0002', type: 'task', title: 'Auth module', status: 'In Progress', year: 2026, developer: { id: 'dev_001' }, tags: [] },
      { cardId: 'BUG-0001', type: 'bug', title: 'Fix login crash', status: 'Created', year: 2025, description: 'crash on login page', tags: [] },
      { cardId: 'TSK-0003', type: 'task', title: 'Dashboard', status: 'Done', year: 2026, developer: { id: 'dev_002' }, tags: ['UI'] },
      { cardId: 'EPC-0001', type: 'epic', title: 'MVP', status: 'Active', year: 2026, tags: [] },
    ];

    beforeEach(() => {
      cards.value = mockCards;
      filters.value = {
        type: 'all', status: 'all', year: null, developer: null,
        sprint: '', epic: '', tags: [], query: '', search: '',
      };
    });

    it('returns all cards when no filters applied', () => {
      expect(filteredCards.value).toHaveLength(5);
    });

    it('filters by type=task', () => {
      filters.value = { ...filters.value, type: 'task' };
      const result = filteredCards.value;

      expect(result).toHaveLength(3);
      expect(result.every((c) => c.type === 'task')).toBe(true);
    });

    it('filters by type=bug', () => {
      filters.value = { ...filters.value, type: 'bug' };
      const result = filteredCards.value;

      expect(result).toHaveLength(1);
      expect(result[0].cardId).toBe('BUG-0001');
    });

    it('filters by type=epic', () => {
      filters.value = { ...filters.value, type: 'epic' };
      const result = filteredCards.value;

      expect(result).toHaveLength(1);
      expect(result[0].cardId).toBe('EPC-0001');
    });

    it('filters by status', () => {
      filters.value = { ...filters.value, status: 'To Do' };
      const result = filteredCards.value;

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('To Do');
    });

    it('filters by year', () => {
      filters.value = { ...filters.value, year: 2025 };
      const result = filteredCards.value;

      expect(result).toHaveLength(1);
      expect(result[0].year).toBe(2025);
    });

    it('filters by search query in title', () => {
      filters.value = { ...filters.value, search: 'Auth' };
      const result = filteredCards.value;

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some((c) => c.title.includes('Auth'))).toBe(true);
    });

    it('filters by search query in description', () => {
      filters.value = { ...filters.value, search: 'crash' };
      const result = filteredCards.value;

      expect(result).toHaveLength(1);
      expect(result[0].cardId).toBe('BUG-0001');
    });

    it('combined filters narrow results', () => {
      filters.value = { ...filters.value, type: 'task', status: 'In Progress' };
      const result = filteredCards.value;

      expect(result).toHaveLength(1);
      expect(result[0].cardId).toBe('TSK-0002');
    });

    it('no match returns empty array', () => {
      filters.value = { ...filters.value, type: 'qa' };
      expect(filteredCards.value).toHaveLength(0);
    });
  });

  describe('loading/error state management', () => {
    beforeEach(() => {
      loading.value = false;
      error.value = null;
    });

    it('loading starts as false', () => {
      expect(loading.value).toBe(false);
    });

    it('setting loading to true reflects immediately', () => {
      loading.value = true;
      expect(loading.value).toBe(true);
    });

    it('setting loading back to false works', () => {
      loading.value = true;
      loading.value = false;
      expect(loading.value).toBe(false);
    });

    it('error starts as null', () => {
      expect(error.value).toBeNull();
    });

    it('setting an error message reflects immediately', () => {
      error.value = 'Something went wrong';
      expect(error.value).toBe('Something went wrong');
    });

    it('clearing error back to null works', () => {
      error.value = 'Error';
      error.value = null;
      expect(error.value).toBeNull();
    });
  });

  describe('signal reactivity (set → get reflects change)', () => {
    it('authUser: set a user, get it back', () => {
      const user = { uid: 'u1', email: 'test@test.com', role: 'developer' };
      authUser.value = user;
      expect(authUser.value).toEqual(user);
      authUser.value = null; // cleanup
    });

    it('currentProject: set and get', () => {
      const proj = { id: 'PLN', name: 'Planning Game' };
      currentProject.value = proj;
      expect(currentProject.value).toEqual(proj);
      currentProject.value = null; // cleanup
    });

    it('projects: set array and get back', () => {
      const projs = [{ id: 'P1', name: 'A' }, { id: 'P2', name: 'B' }];
      projects.value = projs;
      expect(projects.value).toHaveLength(2);
      expect(projects.value[0].id).toBe('P1');
      projects.value = []; // cleanup
    });

    it('currentCard: set and get', () => {
      const card = { cardId: 'TSK-0001', title: 'Test', type: 'task' };
      currentCard.value = card;
      expect(currentCard.value.cardId).toBe('TSK-0001');
      currentCard.value = null; // cleanup
    });

    it('panelOpen: toggle', () => {
      panelOpen.value = true;
      expect(panelOpen.value).toBe(true);
      panelOpen.value = false;
      expect(panelOpen.value).toBe(false);
    });

    it('theme: change and read back', () => {
      theme.value = 'dark';
      expect(theme.value).toBe('dark');
      theme.value = 'light';
      expect(theme.value).toBe('light');
      theme.value = 'system'; // cleanup
    });

    it('notifications: set and compute unreadCount', () => {
      notifications.value = [
        { id: 'n1', title: 'A', read: false },
        { id: 'n2', title: 'B', read: true },
        { id: 'n3', title: 'C', read: false },
      ];
      expect(unreadCount.value).toBe(2);
      notifications.value = []; // cleanup
    });

    it('wipTasks: set and get', () => {
      const tasks = [{ cardId: 'TSK-0001', status: 'In Progress' }];
      wipTasks.value = tasks;
      expect(wipTasks.value).toHaveLength(1);
      wipTasks.value = []; // cleanup
    });

    it('team: set and get', () => {
      team.value = [{ uid: 'u1', name: 'Dev' }];
      expect(team.value).toHaveLength(1);
      team.value = []; // cleanup
    });

    it('sprints: set and get', () => {
      sprints.value = [{ id: 'SPR-0001' }];
      expect(sprints.value).toHaveLength(1);
      sprints.value = []; // cleanup
    });

    it('epics: set and get', () => {
      epics.value = [{ id: 'EPC-0001' }];
      expect(epics.value).toHaveLength(1);
      epics.value = []; // cleanup
    });

    it('adrs: set and get', () => {
      adrs.value = [{ id: 'ADR-0001', title: 'Use signals' }];
      expect(adrs.value).toHaveLength(1);
      adrs.value = []; // cleanup
    });

    it('plans: set and get', () => {
      plans.value = [{ id: 'PLN-0001' }];
      expect(plans.value).toHaveLength(1);
      plans.value = []; // cleanup
    });
  });

  describe('withValue helper', () => {
    it('adds .value getter/setter to a signal-like object', async () => {
      const { signal } = await import('@lit-labs/signals');
      const s = withValue(signal(42));

      expect(s.value).toBe(42);
      s.value = 100;
      expect(s.value).toBe(100);
    });
  });

  describe('setFilters advanced scenarios', () => {
    beforeEach(() => {
      resetFilters();
    });

    it('setFilters with assignee maps to developer', () => {
      setFilters({ assignee: 'dev_001' });
      expect(filters.value.developer).toBe('dev_001');
    });

    it('setFilters with query updates both query and search', () => {
      setFilters({ query: 'login' });
      expect(filters.value.query).toBe('login');
      expect(filters.value.search).toBe('login');
    });

    it('multiple setFilters calls accumulate', () => {
      setFilters({ type: 'bug' });
      setFilters({ status: 'Created' });
      expect(filters.value.type).toBe('bug');
      expect(filters.value.status).toBe('Created');
    });

    it('resetFilters clears all filter state', () => {
      setFilters({ type: 'bug', status: 'Created', query: 'test' });
      resetFilters();

      expect(filters.value.type).toBe('all');
      expect(filters.value.status).toBe('all');
      expect(filters.value.query).toBe('');
      expect(filters.value.search).toBe('');
      expect(filters.value.developer).toBeNull();
      expect(filters.value.sprint).toBe('');
      expect(filters.value.epic).toBe('');
      expect(filters.value.tags).toEqual([]);
    });
  });
});

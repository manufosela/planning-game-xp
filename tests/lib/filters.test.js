/**
 * Tests for src/lib/filters.js — pure filter functions.
 */

import { describe, it, expect } from 'vitest';
import { applyFilters, getStatusesForType, matchesSearch, matchesTags } from '@lib/filters.js';

// ---------------------------------------------------------------------------
// Helpers — mock card factory
// ---------------------------------------------------------------------------

/**
 * @param {Partial<any>} overrides
 * @returns {any}
 */
function makeCard(overrides = {}) {
  return {
    cardId: 'PLN-TSK-0001',
    type: 'task',
    title: 'Fix login bug',
    description: 'Users cannot log in with Google',
    status: 'To Do',
    year: 2026,
    epic: 'EPC-AUTH',
    sprint: 'SPR-005',
    tags: ['frontend', 'auth'],
    developer: { id: 'dev_001', name: 'Alice', email: 'alice@test.com' },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getStatusesForType
// ---------------------------------------------------------------------------

describe('getStatusesForType', () => {
  it('should return task statuses', () => {
    const statuses = getStatusesForType('task');
    expect(statuses).toContain('To Do');
    expect(statuses).toContain('In Progress');
    expect(statuses).toContain('Done');
    expect(statuses).toContain('Blocked');
  });

  it('should return bug statuses', () => {
    const statuses = getStatusesForType('bug');
    expect(statuses).toContain('Created');
    expect(statuses).toContain('Fixed');
    expect(statuses).toContain('Closed');
  });

  it('should return epic statuses', () => {
    const statuses = getStatusesForType('epic');
    expect(statuses).toContain('Active');
    expect(statuses).toContain('Completed');
    expect(statuses).toContain('Archived');
  });

  it('should return proposal statuses', () => {
    const statuses = getStatusesForType('proposal');
    expect(statuses).toContain('Pending');
    expect(statuses).toContain('Planned');
    expect(statuses).toContain('Rejected');
  });

  it('should return qa statuses', () => {
    const statuses = getStatusesForType('qa');
    expect(statuses).toContain('Pending');
    expect(statuses).toContain('Passed');
    expect(statuses).toContain('Failed');
  });

  it('should return all unique statuses for "all" type', () => {
    const statuses = getStatusesForType('all');
    expect(statuses.length).toBeGreaterThan(0);
    // Should contain statuses from multiple types
    expect(statuses).toContain('To Do');
    expect(statuses).toContain('Created');
    expect(statuses).toContain('Active');
    // No duplicates
    expect(new Set(statuses).size).toBe(statuses.length);
  });

  it('should return all statuses for null type', () => {
    const statuses = getStatusesForType(null);
    expect(statuses.length).toBeGreaterThan(0);
  });

  it('should return empty array for unknown type', () => {
    const statuses = getStatusesForType('unknown');
    expect(statuses).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// matchesSearch
// ---------------------------------------------------------------------------

describe('matchesSearch', () => {
  const card = makeCard();

  it('should return true if term is empty', () => {
    expect(matchesSearch(card, '')).toBe(true);
  });

  it('should match title case-insensitively', () => {
    expect(matchesSearch(card, 'fix login')).toBe(true);
    expect(matchesSearch(card, 'FIX LOGIN')).toBe(true);
  });

  it('should match cardId', () => {
    expect(matchesSearch(card, 'PLN-TSK-0001')).toBe(true);
    expect(matchesSearch(card, 'pln-tsk')).toBe(true);
  });

  it('should match description', () => {
    expect(matchesSearch(card, 'Google')).toBe(true);
  });

  it('should not match unrelated terms', () => {
    expect(matchesSearch(card, 'deploy')).toBe(false);
  });

  it('should handle cards with no description', () => {
    const noDesc = makeCard({ description: undefined });
    expect(matchesSearch(noDesc, 'fix')).toBe(true);
    expect(matchesSearch(noDesc, 'Google')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchesTags
// ---------------------------------------------------------------------------

describe('matchesTags', () => {
  const card = makeCard({ tags: ['frontend', 'auth', 'urgent'] });

  it('should return true if tags filter is empty', () => {
    expect(matchesTags(card, [])).toBe(true);
    expect(matchesTags(card, [], 'and')).toBe(true);
  });

  it('should match with OR mode (default)', () => {
    expect(matchesTags(card, ['frontend'])).toBe(true);
    expect(matchesTags(card, ['backend'])).toBe(false);
    expect(matchesTags(card, ['frontend', 'backend'])).toBe(true); // at least one matches
  });

  it('should match with AND mode', () => {
    expect(matchesTags(card, ['frontend', 'auth'], 'and')).toBe(true);
    expect(matchesTags(card, ['frontend', 'backend'], 'and')).toBe(false); // backend missing
  });

  it('should return false if card has no tags', () => {
    const noTags = makeCard({ tags: [] });
    expect(matchesTags(noTags, ['frontend'])).toBe(false);
  });

  it('should return false if card tags is undefined', () => {
    const noTags = makeCard({ tags: undefined });
    expect(matchesTags(noTags, ['frontend'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe('applyFilters', () => {
  const cards = [
    makeCard({ cardId: 'PLN-TSK-0001', type: 'task', status: 'To Do', year: 2026, developer: { id: 'dev_001', name: 'Alice' }, sprint: 'SPR-005', epic: 'EPC-AUTH', tags: ['frontend'] }),
    makeCard({ cardId: 'PLN-TSK-0002', type: 'task', status: 'In Progress', year: 2026, developer: { id: 'dev_002', name: 'Bob' }, sprint: 'SPR-005', epic: 'EPC-API', tags: ['backend'] }),
    makeCard({ cardId: 'PLN-BUG-0001', type: 'bug', status: 'Created', year: 2026, developer: null, sprint: 'SPR-006', epic: 'EPC-AUTH', tags: ['frontend', 'urgent'] }),
    makeCard({ cardId: 'PLN-TSK-0003', type: 'task', status: 'Done', year: 2025, developer: { id: 'dev_001', name: 'Alice' }, sprint: 'SPR-003', epic: 'EPC-AUTH', tags: [] }),
    makeCard({ cardId: 'PLN-EPC-0001', type: 'epic', title: 'Authentication Epic', status: 'Active', year: 2026, tags: [], developer: null, sprint: '', epic: '' }),
  ];

  const defaultFilters = {
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

  it('should return all cards with default filters', () => {
    const result = applyFilters(cards, defaultFilters);
    expect(result.length).toBe(5);
  });

  it('should filter by type', () => {
    const result = applyFilters(cards, { ...defaultFilters, type: 'task' });
    expect(result.length).toBe(3);
    expect(result.every((c) => c.type === 'task')).toBe(true);
  });

  it('should filter by status', () => {
    const result = applyFilters(cards, { ...defaultFilters, status: 'To Do' });
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe('PLN-TSK-0001');
  });

  it('should filter by year', () => {
    const result = applyFilters(cards, { ...defaultFilters, year: 2025 });
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe('PLN-TSK-0003');
  });

  it('should filter by developer', () => {
    const result = applyFilters(cards, { ...defaultFilters, developer: 'dev_001' });
    expect(result.length).toBe(2);
    expect(result.every((c) => c.developer?.id === 'dev_001')).toBe(true);
  });

  it('should filter by sprint', () => {
    const result = applyFilters(cards, { ...defaultFilters, sprint: 'SPR-005' });
    expect(result.length).toBe(2);
  });

  it('should filter by epic', () => {
    const result = applyFilters(cards, { ...defaultFilters, epic: 'EPC-AUTH' });
    expect(result.length).toBe(3);
  });

  it('should filter by tags (OR mode)', () => {
    const result = applyFilters(cards, { ...defaultFilters, tags: ['urgent'] });
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe('PLN-BUG-0001');
  });

  it('should filter by tags (AND mode)', () => {
    const result = applyFilters(
      cards,
      { ...defaultFilters, tags: ['frontend', 'urgent'] },
      { tagMode: 'and' },
    );
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe('PLN-BUG-0001');
  });

  it('should filter by search query', () => {
    const result = applyFilters(cards, { ...defaultFilters, query: 'Authentication' });
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe('PLN-EPC-0001');
  });

  it('should filter by search field', () => {
    const result = applyFilters(cards, { ...defaultFilters, search: 'PLN-BUG' });
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('bug');
  });

  it('should combine multiple filters', () => {
    const result = applyFilters(cards, {
      ...defaultFilters,
      type: 'task',
      year: 2026,
      developer: 'dev_001',
    });
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe('PLN-TSK-0001');
  });

  it('should return empty array when no cards match', () => {
    const result = applyFilters(cards, {
      ...defaultFilters,
      type: 'qa',
    });
    expect(result).toEqual([]);
  });

  it('should handle empty cards array', () => {
    const result = applyFilters([], defaultFilters);
    expect(result).toEqual([]);
  });
});

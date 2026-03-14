import { describe, it, expect } from 'vitest';
import { filterCards } from '../../../packages/domain/services/filter-service.js';

const cards = [
  { cardId: 'PLN-TSK-0001', cardType: 'task-card', title: 'Setup auth', description: 'Configure Firebase auth', status: 'To Do', developer: 'dev_001', sprint: 'PLN-SPR-0001', epic: 'PLN-EPC-0001', year: 2026, priority: 200 },
  { cardId: 'PLN-TSK-0002', cardType: 'task-card', title: 'Create dashboard', description: 'Build dashboard page', status: 'In Progress', developer: 'dev_002', sprint: 'PLN-SPR-0001', epic: 'PLN-EPC-0002', year: 2026, priority: 100 },
  { cardId: 'PLN-BUG-0001', cardType: 'bug-card', title: 'Login crash', description: 'App crashes on login', status: 'Created', developer: 'dev_001', sprint: 'PLN-SPR-0002', epic: 'PLN-EPC-0001', year: 2025, priority: 300 },
  { cardId: 'PLN-TSK-0003', cardType: 'task-card', title: 'Add tests', description: 'Unit tests for services', status: 'Done', developer: 'dev_003', sprint: 'PLN-SPR-0002', epic: 'PLN-EPC-0002', year: 2026, priority: 50 },
];

describe('FilterService', () => {
  it('should return all cards with empty filters', () => {
    expect(filterCards(cards, {})).toEqual(cards);
  });

  it('should filter by year', () => {
    const result = filterCards(cards, { year: 2025 });
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe('PLN-BUG-0001');
  });

  it('should filter by status', () => {
    const result = filterCards(cards, { status: 'To Do' });
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe('PLN-TSK-0001');
  });

  it('should filter by developer', () => {
    const result = filterCards(cards, { developer: 'dev_001' });
    expect(result).toHaveLength(2);
  });

  it('should filter by sprint', () => {
    const result = filterCards(cards, { sprint: 'PLN-SPR-0002' });
    expect(result).toHaveLength(2);
  });

  it('should filter by epic', () => {
    const result = filterCards(cards, { epic: 'PLN-EPC-0001' });
    expect(result).toHaveLength(2);
  });

  it('should filter by cardType', () => {
    const result = filterCards(cards, { cardType: 'bug-card' });
    expect(result).toHaveLength(1);
  });

  it('should filter by search (case-insensitive) on title', () => {
    const result = filterCards(cards, { search: 'dashboard' });
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe('PLN-TSK-0002');
  });

  it('should filter by search on description', () => {
    const result = filterCards(cards, { search: 'firebase' });
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe('PLN-TSK-0001');
  });

  it('should filter by search on cardId', () => {
    const result = filterCards(cards, { search: 'BUG-0001' });
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe('PLN-BUG-0001');
  });

  it('should filter by priorityMin', () => {
    const result = filterCards(cards, { priorityMin: 150 });
    expect(result).toHaveLength(2);
  });

  it('should filter by priorityMax', () => {
    const result = filterCards(cards, { priorityMax: 150 });
    expect(result).toHaveLength(2);
  });

  it('should combine filters with AND logic', () => {
    const result = filterCards(cards, { year: 2026, status: 'In Progress' });
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe('PLN-TSK-0002');
  });

  it('should return empty array when no cards match', () => {
    const result = filterCards(cards, { year: 2024 });
    expect(result).toHaveLength(0);
  });

  it('should handle null/undefined cards gracefully', () => {
    expect(filterCards([], { year: 2026 })).toEqual([]);
  });
});

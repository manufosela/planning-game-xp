import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TASK_STATUSES,
  slugifyStatus,
  buildColumn,
  generateDefaultColumns,
  normalizeColumns,
  moveColumn,
  findDuplicateStatusKeys,
  bucketCardsByColumn,
  countCardsPerColumn,
  computeWipStatus,
  isExpediteCard,
  shouldBlockDrop
} from '../../shared/board-columns.js';

describe('slugifyStatus', () => {
  it('converts to lowercase kebab', () => {
    expect(slugifyStatus('To Do')).toBe('to-do');
    expect(slugifyStatus('In Progress')).toBe('in-progress');
    expect(slugifyStatus('Done&Validated')).toBe('done-validated');
  });
  it('strips diacritics', () => {
    expect(slugifyStatus('Acción')).toBe('accion');
  });
  it('returns empty for falsy', () => {
    expect(slugifyStatus('')).toBe('');
    expect(slugifyStatus(null)).toBe('');
  });
});

describe('buildColumn', () => {
  it('returns the canonical shape', () => {
    expect(buildColumn({ id: 'todo', name: 'To Do', order: 0, statusKey: 'To Do', wipLimit: 3 })).toEqual({
      id: 'todo', name: 'To Do', order: 0, statusKey: 'To Do', wipLimit: 3
    });
  });
  it('derives id from statusKey when missing', () => {
    expect(buildColumn({ name: 'In Progress', order: 1, statusKey: 'In Progress' }).id).toBe('in-progress');
  });
  it('defaults wipLimit to null and order to 0', () => {
    const c = buildColumn({ name: 'X', statusKey: 'X' });
    expect(c.wipLimit).toBeNull();
    expect(c.order).toBe(0);
  });
  it('rejects empty statusKey', () => {
    expect(() => buildColumn({ name: 'X', statusKey: '' })).toThrow();
  });
  it('rejects negative wipLimit', () => {
    expect(() => buildColumn({ name: 'X', statusKey: 'X', wipLimit: -1 })).toThrow();
  });
});

describe('generateDefaultColumns', () => {
  it('uses DEFAULT_TASK_STATUSES when no input', () => {
    const cols = generateDefaultColumns();
    expect(cols).toHaveLength(DEFAULT_TASK_STATUSES.length);
    expect(cols.map((c) => c.statusKey)).toEqual(DEFAULT_TASK_STATUSES);
    expect(cols[0].order).toBe(0);
    expect(cols[cols.length - 1].order).toBe(cols.length - 1);
  });
  it('uses the input list when provided', () => {
    const cols = generateDefaultColumns(['Backlog', 'Ready', 'Done']);
    expect(cols.map((c) => c.name)).toEqual(['Backlog', 'Ready', 'Done']);
    expect(cols.map((c) => c.id)).toEqual(['backlog', 'ready', 'done']);
  });
  it('filters out empty strings', () => {
    const cols = generateDefaultColumns(['A', '', 'B']);
    expect(cols.map((c) => c.statusKey)).toEqual(['A', 'B']);
  });
});

describe('normalizeColumns', () => {
  it('sorts by order then by name', () => {
    const raw = {
      a: { id: 'a', name: 'Alpha', order: 2, statusKey: 'A' },
      b: { id: 'b', name: 'Beta', order: 0, statusKey: 'B' },
      c: { id: 'c', name: 'Gamma', order: 0, statusKey: 'G' }
    };
    const cols = normalizeColumns(raw);
    expect(cols.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });
  it('drops invalid entries', () => {
    const raw = [
      { id: 'ok', name: 'OK', order: 0, statusKey: 'OK' },
      { name: 'Bad', order: 1 }, // no statusKey
      null,
      'string'
    ];
    expect(normalizeColumns(raw).map((c) => c.id)).toEqual(['ok']);
  });
  it('returns [] for falsy', () => {
    expect(normalizeColumns(null)).toEqual([]);
    expect(normalizeColumns({})).toEqual([]);
    expect(normalizeColumns([])).toEqual([]);
  });
});

describe('moveColumn', () => {
  const cols = generateDefaultColumns(['A', 'B', 'C', 'D']);

  it('moves a column to a later index', () => {
    const moved = moveColumn(cols, 'a', 2);
    expect(moved.map((c) => c.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved.map((c) => c.order)).toEqual([0, 1, 2, 3]);
  });
  it('moves a column to an earlier index', () => {
    const moved = moveColumn(cols, 'd', 0);
    expect(moved.map((c) => c.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('clamps target index to bounds', () => {
    const moved = moveColumn(cols, 'a', 99);
    expect(moved.map((c) => c.id)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('is a no-op when id not found', () => {
    expect(moveColumn(cols, 'missing', 0).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('findDuplicateStatusKeys', () => {
  it('returns [] when all unique', () => {
    expect(findDuplicateStatusKeys(generateDefaultColumns())).toEqual([]);
  });
  it('detects duplicates', () => {
    const cols = [
      buildColumn({ id: 'a', name: 'A', order: 0, statusKey: 'X' }),
      buildColumn({ id: 'b', name: 'B', order: 1, statusKey: 'X' }),
      buildColumn({ id: 'c', name: 'C', order: 2, statusKey: 'Y' })
    ];
    expect(findDuplicateStatusKeys(cols)).toEqual(['X']);
  });
});

describe('bucketCardsByColumn', () => {
  const cols = generateDefaultColumns(['To Do', 'In Progress', 'Done&Validated']);
  const cards = [
    { cardId: 'T1', status: 'To Do' },
    { cardId: 'T2', status: 'In Progress' },
    { cardId: 'T3', status: 'In Progress' },
    { cardId: 'T4', status: 'Done&Validated' },
    { cardId: 'T5', status: 'Reopened' },
    { cardId: 'T6', status: 'To Do', deletedAt: '2026-01-01' }
  ];

  it('buckets cards by matching statusKey', () => {
    const result = bucketCardsByColumn(cols, cards);
    expect(result.byColumn['to-do'].map((c) => c.cardId)).toEqual(['T1']);
    expect(result.byColumn['in-progress'].map((c) => c.cardId)).toEqual(['T2', 'T3']);
    expect(result.byColumn['done-validated'].map((c) => c.cardId)).toEqual(['T4']);
  });

  it('places unmapped statuses in unbucketed', () => {
    const result = bucketCardsByColumn(cols, cards);
    expect(result.unbucketed.map((c) => c.cardId)).toEqual(['T5']);
  });

  it('skips deleted cards', () => {
    const result = bucketCardsByColumn(cols, cards);
    const allBucketed = Object.values(result.byColumn).flat();
    expect(allBucketed.find((c) => c.cardId === 'T6')).toBeUndefined();
  });

  it('produces empty columns when no cards match', () => {
    const result = bucketCardsByColumn(cols, []);
    expect(Object.values(result.byColumn).every((arr) => arr.length === 0)).toBe(true);
    expect(result.unbucketed).toEqual([]);
  });
});

describe('countCardsPerColumn', () => {
  const cols = generateDefaultColumns(['To Do', 'In Progress']);

  it('returns 0 for empty input', () => {
    expect(countCardsPerColumn(cols, [])).toEqual({ 'to-do': 0, 'in-progress': 0 });
  });

  it('counts only non-deleted matching cards', () => {
    const cards = [
      { status: 'To Do' },
      { status: 'In Progress' },
      { status: 'In Progress' },
      { status: 'In Progress', deletedAt: 'now' },
      { status: 'Done' }
    ];
    expect(countCardsPerColumn(cols, cards)).toEqual({ 'to-do': 1, 'in-progress': 2 });
  });
});

describe('isExpediteCard', () => {
  it('detects boolean expedite flag', () => {
    expect(isExpediteCard({ expedite: true })).toBe(true);
    expect(isExpediteCard({ expedited: true })).toBe(true);
  });
  it('detects expedite via priorityClass / priority text', () => {
    expect(isExpediteCard({ priorityClass: 'Expedite' })).toBe(true);
    expect(isExpediteCard({ priority: 'URGENT-hotfix' })).toBe(true);
  });
  it('returns false otherwise', () => {
    expect(isExpediteCard({})).toBe(false);
    expect(isExpediteCard(null)).toBe(false);
    expect(isExpediteCard({ priority: 'normal' })).toBe(false);
  });
});

describe('computeWipStatus', () => {
  it('returns "none" when limit is null/undefined/invalid', () => {
    expect(computeWipStatus({ wipLimit: null }, 5)).toBe('none');
    expect(computeWipStatus({}, 5)).toBe('none');
    expect(computeWipStatus({ wipLimit: -1 }, 5)).toBe('none');
  });
  it('compares against the limit', () => {
    expect(computeWipStatus({ wipLimit: 3 }, 0)).toBe('under');
    expect(computeWipStatus({ wipLimit: 3 }, 2)).toBe('under');
    expect(computeWipStatus({ wipLimit: 3 }, 3)).toBe('at-limit');
    expect(computeWipStatus({ wipLimit: 3 }, 4)).toBe('over-limit');
  });
  it('treats wipLimit 0 as at-limit at count 0', () => {
    expect(computeWipStatus({ wipLimit: 0 }, 0)).toBe('at-limit');
    expect(computeWipStatus({ wipLimit: 0 }, 1)).toBe('over-limit');
  });
});

describe('shouldBlockDrop', () => {
  it('never blocks when enforceWip=false', () => {
    expect(shouldBlockDrop({
      column: { wipLimit: 1 }, currentCount: 5, card: {}, enforceWip: false
    })).toEqual({ blocked: false, reason: null });
  });
  it('never blocks when column has no limit', () => {
    expect(shouldBlockDrop({
      column: { wipLimit: null }, currentCount: 99, card: {}, enforceWip: true
    })).toEqual({ blocked: false, reason: null });
  });
  it('blocks at-limit when enforceWip=true and non-expedite', () => {
    const result = shouldBlockDrop({
      column: { wipLimit: 3, name: 'In Progress' }, currentCount: 3, card: {}, enforceWip: true
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('In Progress');
    expect(result.reason).toContain('3');
  });
  it('blocks over-limit when enforceWip=true and non-expedite', () => {
    expect(shouldBlockDrop({
      column: { wipLimit: 3 }, currentCount: 5, card: {}, enforceWip: true
    }).blocked).toBe(true);
  });
  it('lets expedite cards bypass the block', () => {
    expect(shouldBlockDrop({
      column: { wipLimit: 3 }, currentCount: 5, card: { expedite: true }, enforceWip: true
    })).toEqual({ blocked: false, reason: 'expedite-bypass' });
  });
  it('does not block when under limit', () => {
    expect(shouldBlockDrop({
      column: { wipLimit: 3 }, currentCount: 1, card: {}, enforceWip: true
    })).toEqual({ blocked: false, reason: null });
  });
});

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TASK_STATUSES,
  slugifyStatus,
  buildColumn,
  generateDefaultColumns,
  normalizeColumns,
  moveColumn,
  findDuplicateStatusKeys,
  bucketCardsByColumn
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

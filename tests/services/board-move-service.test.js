/**
 * board-move-service helpers — pure tests only. The Firebase-touching
 * exports (persistCardMove, persistColumnRespread) are mocked away.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the real public/firebase-config.js to avoid remote https:// imports
vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn(),
  update: vi.fn(async () => {}),
  runTransaction: vi.fn(async (_ref, fn) => fn(null))
}));

const {
  assignRankAtIndex,
  ranksNeedRespread,
  computeRespread,
  compareByRank,
  RANK_STEP
} = await import('../../public/js/services/board-move-service.js');

describe('assignRankAtIndex', () => {
  it('returns RANK_STEP for an empty list', () => {
    expect(assignRankAtIndex([], 0)).toBe(RANK_STEP);
  });
  it('returns prev - RANK_STEP when inserting at the head', () => {
    expect(assignRankAtIndex([1000, 2000, 3000], 0)).toBe(0);
  });
  it('returns last + RANK_STEP when inserting at the tail', () => {
    expect(assignRankAtIndex([1000, 2000, 3000], 3)).toBe(4000);
    expect(assignRankAtIndex([1000, 2000, 3000], 99)).toBe(4000);
  });
  it('returns midpoint when inserting in the middle', () => {
    expect(assignRankAtIndex([1000, 2000, 3000], 1)).toBe(1500);
    expect(assignRankAtIndex([1000, 2000, 3000], 2)).toBe(2500);
  });
  it('throws when neighbors are too close to fit', () => {
    expect(() => assignRankAtIndex([10, 11], 1)).toThrow(/respread/);
  });
});

describe('ranksNeedRespread', () => {
  it('false for spaced ranks', () => {
    expect(ranksNeedRespread([1000, 2000, 3000])).toBe(false);
  });
  it('true when any gap < 2', () => {
    expect(ranksNeedRespread([1, 2, 3])).toBe(true);
    expect(ranksNeedRespread([0, 1])).toBe(true);
  });
  it('false for 0 or 1 items', () => {
    expect(ranksNeedRespread([])).toBe(false);
    expect(ranksNeedRespread([42])).toBe(false);
  });
});

describe('computeRespread', () => {
  it('assigns RANK_STEP increments in order', () => {
    const result = computeRespread([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(result).toEqual({ a: 1000, b: 2000, c: 3000 });
  });
  it('skips items without id', () => {
    const result = computeRespread([{ id: 'a' }, {}, { id: 'b' }]);
    expect(result).toEqual({ a: 1000, b: 3000 });
  });
  it('handles empty/null input', () => {
    expect(computeRespread([])).toEqual({});
    expect(computeRespread(null)).toEqual({});
  });
});

describe('compareByRank', () => {
  it('sorts ascending by boardRank', () => {
    const a = [{ cardId: 'X', boardRank: 3000 }, { cardId: 'Y', boardRank: 1000 }, { cardId: 'Z', boardRank: 2000 }];
    a.sort(compareByRank);
    expect(a.map((c) => c.cardId)).toEqual(['Y', 'Z', 'X']);
  });
  it('falls back to cardId when ranks tie', () => {
    const a = [{ cardId: 'B', boardRank: 1000 }, { cardId: 'A', boardRank: 1000 }];
    a.sort(compareByRank);
    expect(a.map((c) => c.cardId)).toEqual(['A', 'B']);
  });
  it('pushes cards without rank to the end', () => {
    const a = [{ cardId: 'A' }, { cardId: 'B', boardRank: 1000 }];
    a.sort(compareByRank);
    expect(a.map((c) => c.cardId)).toEqual(['B', 'A']);
  });
});

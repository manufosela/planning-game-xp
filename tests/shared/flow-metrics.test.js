import { describe, it, expect } from 'vitest';
import {
  avgActiveWip,
  peakActiveWip,
  throughputPerPeriod,
  avgCycleTimeLittle,
  bottleneck,
  priorityOf,
  avgRealCycleTime,
  cumulativeFlowSeries
} from '../../shared/flow-metrics.js';

const snapshots = [
  { at: '2026-06-21T08:00:00Z', perColumn: { backlog: 5, ready: 1, doing: 2, qa: 1, done: 0 }, done: 0 },
  { at: '2026-06-21T09:00:00Z', perColumn: { backlog: 4, ready: 1, doing: 3, qa: 2, done: 1 }, done: 1 },
  { at: '2026-06-21T10:00:00Z', perColumn: { backlog: 4, ready: 0, doing: 3, qa: 3, done: 2 }, done: 2 },
  { at: '2026-06-21T11:00:00Z', perColumn: { backlog: 3, ready: 0, doing: 2, qa: 1, done: 5 }, done: 5 }
];

const EXCLUDE = new Set(['backlog', 'done']);

describe('avgActiveWip', () => {
  it('averages the active columns across snapshots', () => {
    const result = avgActiveWip(snapshots, EXCLUDE);
    // (4+6+6+3)/4 = 4.75
    expect(result).toBeCloseTo(4.75, 5);
  });
  it('returns null for empty input', () => {
    expect(avgActiveWip([], EXCLUDE)).toBeNull();
    expect(avgActiveWip(null, EXCLUDE)).toBeNull();
  });
  it('accepts array exclude input', () => {
    expect(avgActiveWip(snapshots, ['backlog', 'done'])).toBeCloseTo(4.75, 5);
  });
});

describe('peakActiveWip', () => {
  it('returns the highest single-tick active sum', () => {
    expect(peakActiveWip(snapshots, EXCLUDE)).toBe(6);
  });
  it('returns null for empty input', () => {
    expect(peakActiveWip([])).toBeNull();
  });
});

describe('throughputPerPeriod', () => {
  it('uses the max cumulative done across snapshots', () => {
    // max done = 5; snapshots = 4 → 5/4 = 1.25
    expect(throughputPerPeriod(snapshots)).toBeCloseTo(1.25, 5);
  });
  it('returns null when no snapshot has a done count', () => {
    const noDone = [{ at: 1, perColumn: {}, done: 0 }];
    expect(throughputPerPeriod(noDone)).toBe(0);
  });
});

describe('avgCycleTimeLittle', () => {
  it('computes L / lambda', () => {
    // L=4.75, lambda=1.25 → 3.8
    expect(avgCycleTimeLittle(snapshots, EXCLUDE)).toBeCloseTo(3.8, 5);
  });
  it('returns null when throughput is zero', () => {
    const zero = [{ at: 1, perColumn: { doing: 2 }, done: 0 }];
    expect(avgCycleTimeLittle(zero, EXCLUDE)).toBeNull();
  });
});

describe('bottleneck', () => {
  it('identifies the active column with highest average', () => {
    // sums: ready 2, doing 10, qa 7 → avg: ready 0.5, doing 2.5, qa 1.75 → doing
    expect(bottleneck(snapshots, EXCLUDE)).toEqual({ colId: 'doing', avg: 2.5 });
  });
  it('returns null for empty input', () => {
    expect(bottleneck([])).toBeNull();
  });
});

describe('priorityOf', () => {
  it('computes business / dev * 100', () => {
    expect(priorityOf({ businessPoints: 5, devPoints: 2 })).toBe(250);
  });
  it('falls back to business/dev aliases', () => {
    expect(priorityOf({ business: 3, dev: 1 })).toBe(300);
  });
  it('returns 0 when either side is missing or zero', () => {
    expect(priorityOf({})).toBe(0);
    expect(priorityOf({ businessPoints: 0, devPoints: 1 })).toBe(0);
    expect(priorityOf(null)).toBe(0);
  });
});

describe('avgRealCycleTime', () => {
  it('averages doneAt - enteredInProgressAt across done cards', () => {
    const cards = [
      { enteredInProgressAt: 1000, doneAt: 4000 }, // 3000
      { enteredInProgressAt: 2000, doneAt: 9000 }, // 7000
      { enteredInProgressAt: 0,    doneAt: 0    }  // skipped
    ];
    expect(avgRealCycleTime(cards)).toBe(5000);
  });
  it('returns null when no completed pairs', () => {
    expect(avgRealCycleTime([])).toBeNull();
    expect(avgRealCycleTime([{ enteredInProgressAt: 1 }])).toBeNull();
  });
});

describe('cumulativeFlowSeries', () => {
  it('projects snapshots onto the given column order', () => {
    const series = cumulativeFlowSeries(snapshots, ['backlog', 'doing', 'done']);
    expect(series).toHaveLength(4);
    expect(series[0]).toEqual({ at: '2026-06-21T08:00:00Z', values: [5, 2, 0], done: 0 });
    expect(series[3]).toEqual({ at: '2026-06-21T11:00:00Z', values: [3, 2, 5], done: 5 });
  });
  it('fills missing columns with 0', () => {
    const s = [{ at: 1, perColumn: { x: 2 }, done: 0 }];
    expect(cumulativeFlowSeries(s, ['x', 'y'])).toEqual([{ at: 1, values: [2, 0], done: 0 }]);
  });
  it('sorts by at when timestamps are valid dates', () => {
    const out = cumulativeFlowSeries([
      { at: '2026-06-21T10:00:00Z', perColumn: { a: 2 }, done: 1 },
      { at: '2026-06-21T08:00:00Z', perColumn: { a: 1 }, done: 0 }
    ], ['a']);
    expect(out.map((p) => p.values[0])).toEqual([1, 2]);
  });
});

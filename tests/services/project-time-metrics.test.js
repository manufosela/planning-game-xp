import { describe, it, expect } from 'vitest';
import {
  AI_DEVELOPER_ID,
  aggregateProjectTimeMetrics,
  formatDurationShort,
  taskElapsedMs,
  taskElapsedWorkdays,
  taskMonthBucket,
  taskNetMs
} from '../../public/js/services/project-time-metrics.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function task(overrides = {}) {
  return {
    cardId: 'TST-TSK-0001',
    status: 'To Validate',
    developer: 'dev_001',
    startDate: '2026-06-01T09:00:00.000Z',
    endDate: '2026-06-02T18:00:00.000Z',
    ...overrides
  };
}

describe('taskNetMs', () => {
  it('returns totalWorkDurationMs when present', () => {
    expect(taskNetMs(task({ totalWorkDurationMs: 3 * HOUR }))).toBe(3 * HOUR);
  });

  it('falls back to summing closed workCycles', () => {
    const t = task({
      totalWorkDurationMs: 0,
      workCycles: [
        { startDate: '2026-06-01T09:00:00Z', endDate: '2026-06-01T11:00:00Z', durationMs: 2 * HOUR },
        { startDate: '2026-06-01T13:00:00Z', endDate: '2026-06-01T15:30:00Z', durationMs: 2.5 * HOUR }
      ]
    });
    expect(taskNetMs(t)).toBe(4.5 * HOUR);
  });

  it('computes durationMs from start/end when missing', () => {
    const t = task({
      totalWorkDurationMs: 0,
      workCycles: [{ startDate: '2026-06-01T09:00:00Z', endDate: '2026-06-01T12:00:00Z' }]
    });
    expect(taskNetMs(t)).toBe(3 * HOUR);
  });

  it('ignores open cycles (endDate null)', () => {
    const t = task({
      totalWorkDurationMs: 0,
      workCycles: [
        { startDate: '2026-06-01T09:00:00Z', endDate: '2026-06-01T11:00:00Z', durationMs: 2 * HOUR },
        { startDate: '2026-06-01T13:00:00Z', endDate: null, durationMs: 0 }
      ]
    });
    expect(taskNetMs(t)).toBe(2 * HOUR);
  });

  it('returns 0 for tasks without workCycles nor totalWorkDurationMs', () => {
    expect(taskNetMs(task({ totalWorkDurationMs: 0 }))).toBe(0);
    expect(taskNetMs(task({ totalWorkDurationMs: undefined }))).toBe(0);
    expect(taskNetMs({})).toBe(0);
    expect(taskNetMs(null)).toBe(0);
  });
});

describe('taskElapsedMs', () => {
  it('returns endDate - startDate in ms', () => {
    expect(taskElapsedMs(task({
      startDate: '2026-06-01T00:00:00Z',
      endDate:   '2026-06-03T00:00:00Z'
    }))).toBe(2 * DAY);
  });

  it('returns 0 when start/end missing or inverted', () => {
    expect(taskElapsedMs(task({ startDate: null }))).toBe(0);
    expect(taskElapsedMs(task({ endDate: null }))).toBe(0);
    expect(taskElapsedMs(task({
      startDate: '2026-06-03T00:00:00Z',
      endDate:   '2026-06-01T00:00:00Z'
    }))).toBe(0);
  });
});

describe('taskElapsedWorkdays', () => {
  it('counts at least a fraction of a workday for same-day tasks', () => {
    const wd = taskElapsedWorkdays(task({
      startDate: '2026-06-01T09:00:00Z', // Mon
      endDate:   '2026-06-01T17:00:00Z'
    }));
    expect(wd).toBeGreaterThan(0);
    expect(wd).toBeLessThanOrEqual(1);
  });

  it('returns 0 when dates are missing', () => {
    expect(taskElapsedWorkdays(task({ endDate: null }))).toBe(0);
  });
});

describe('taskMonthBucket', () => {
  it('returns YYYY-MM in UTC', () => {
    expect(taskMonthBucket(task({ endDate: '2026-01-31T23:00:00Z' }))).toBe('2026-01');
    expect(taskMonthBucket(task({ endDate: '2026-12-01T00:00:00Z' }))).toBe('2026-12');
  });

  it('returns null when endDate is missing or invalid', () => {
    expect(taskMonthBucket(task({ endDate: null }))).toBeNull();
    expect(taskMonthBucket(task({ endDate: 'not-a-date' }))).toBeNull();
    expect(taskMonthBucket({})).toBeNull();
  });
});

describe('aggregateProjectTimeMetrics', () => {
  it('returns zeros for an empty input', () => {
    const result = aggregateProjectTimeMetrics({});
    expect(result.totals.completedCount).toBe(0);
    expect(result.totals.netMs).toBe(0);
    expect(result.byDeveloper).toEqual([]);
    expect(result.byMonth).toEqual([]);
  });

  it('skips tasks without endDate and soft-deleted tasks', () => {
    const tasks = {
      '-open':    task({ endDate: null }),
      '-deleted': task({ deletedAt: '2026-06-10T00:00:00Z' }),
      '-good':    task({ totalWorkDurationMs: HOUR })
    };
    const r = aggregateProjectTimeMetrics(tasks);
    expect(r.totals.completedCount).toBe(1);
    expect(r.totals.netMs).toBe(HOUR);
  });

  it('separates human and AI work via the configured ai developer id', () => {
    const tasks = [
      task({ developer: 'dev_001', totalWorkDurationMs: 2 * HOUR }),
      task({ developer: AI_DEVELOPER_ID, totalWorkDurationMs: 3 * HOUR }),
      task({ developer: AI_DEVELOPER_ID, totalWorkDurationMs: 1 * HOUR })
    ];
    const r = aggregateProjectTimeMetrics(tasks);
    expect(r.byKind.human.netMs).toBe(2 * HOUR);
    expect(r.byKind.ai.netMs).toBe(4 * HOUR);
    expect(r.byKind.ai.completedCount).toBe(2);
    expect(r.byKind.unknown.completedCount).toBe(0);
  });

  it('buckets unknown developers separately', () => {
    const tasks = [
      task({ developer: '', totalWorkDurationMs: HOUR }),
      task({ developer: null, totalWorkDurationMs: HOUR })
    ];
    const r = aggregateProjectTimeMetrics(tasks);
    expect(r.byKind.unknown.completedCount).toBe(2);
    expect(r.byKind.unknown.netMs).toBe(2 * HOUR);
  });

  it('reports per-month buckets sorted chronologically with average elapsed workdays', () => {
    const tasks = [
      task({ startDate: '2026-01-05T09:00:00Z', endDate: '2026-01-06T18:00:00Z' }),
      task({ startDate: '2026-01-05T09:00:00Z', endDate: '2026-01-05T18:00:00Z' }),
      task({ startDate: '2026-03-01T09:00:00Z', endDate: '2026-03-03T18:00:00Z' })
    ];
    const r = aggregateProjectTimeMetrics(tasks);
    expect(r.byMonth.map((m) => m.month)).toEqual(['2026-01', '2026-03']);
    expect(r.byMonth[0].completedCount).toBe(2);
    expect(r.byMonth[0].avgElapsedWorkdays).toBeGreaterThan(0);
    expect(r.byMonth[1].completedCount).toBe(1);
  });

  it('sorts developers by descending netMs', () => {
    const tasks = [
      task({ developer: 'dev_A', totalWorkDurationMs: 1 * HOUR }),
      task({ developer: 'dev_B', totalWorkDurationMs: 5 * HOUR }),
      task({ developer: 'dev_C', totalWorkDurationMs: 3 * HOUR })
    ];
    const r = aggregateProjectTimeMetrics(tasks);
    expect(r.byDeveloper.map((d) => d.developer)).toEqual(['dev_B', 'dev_C', 'dev_A']);
  });

  it('computes netCoverage based on completed tasks with non-zero net', () => {
    const tasks = [
      task({ totalWorkDurationMs: HOUR }),       // covered
      task({ totalWorkDurationMs: 0 }),          // not covered
      task({ totalWorkDurationMs: 2 * HOUR }),   // covered
      task({ totalWorkDurationMs: 0 })           // not covered
    ];
    const r = aggregateProjectTimeMetrics(tasks);
    expect(r.totals.netCoveredCount).toBe(2);
    expect(r.totals.netCoverage).toBe(0.5);
  });

  it('accepts an explicit aiDeveloperId override', () => {
    const tasks = [
      task({ developer: 'custom_ai', totalWorkDurationMs: HOUR })
    ];
    const r = aggregateProjectTimeMetrics(tasks, { aiDeveloperId: 'custom_ai' });
    expect(r.byKind.ai.netMs).toBe(HOUR);
    expect(r.byKind.human.netMs).toBe(0);
  });
});

describe('formatDurationShort', () => {
  it('formats minutes', () => {
    expect(formatDurationShort(0)).toBe('0m');
    expect(formatDurationShort(5 * 60_000)).toBe('5m');
    expect(formatDurationShort(59 * 60_000)).toBe('59m');
  });

  it('formats hours and minutes', () => {
    expect(formatDurationShort(60 * 60_000)).toBe('1h');
    expect(formatDurationShort(2 * 60 * 60_000 + 15 * 60_000)).toBe('2h 15m');
  });

  it('formats days and hours', () => {
    expect(formatDurationShort(24 * 60 * 60_000)).toBe('1d');
    expect(formatDurationShort(25 * 60 * 60_000)).toBe('1d 1h');
  });

  it('falls back to 0m on invalid input', () => {
    expect(formatDurationShort(-1)).toBe('0m');
    expect(formatDurationShort(NaN)).toBe('0m');
  });
});

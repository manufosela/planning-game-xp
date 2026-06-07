import { describe, it, expect } from 'vitest';
import {
  SPRINT_NAME_REGEX,
  formatSprintDateTag,
  formatSprintIsoDate,
  parseSprintName,
  isValidSprintName,
  buildSprintName,
  isoDateToTag,
  tagToIsoDate,
  getSprintBoundsForDay,
  findSprintForDay,
  getNextSprintNumberForYear
} from '../../shared/sprint-naming.js';

const SAMPLE_DATE = new Date('2026-06-07T15:30:00.000Z');

describe('formatSprintDateTag / formatSprintIsoDate', () => {
  it('formats UTC YYYYMMDD and YYYY-MM-DD', () => {
    expect(formatSprintDateTag(SAMPLE_DATE)).toBe('20260607');
    expect(formatSprintIsoDate(SAMPLE_DATE)).toBe('2026-06-07');
  });

  it('pads single-digit month and day', () => {
    const d = new Date('2026-01-05T00:00:00Z');
    expect(formatSprintDateTag(d)).toBe('20260105');
    expect(formatSprintIsoDate(d)).toBe('2026-01-05');
  });
});

describe('parseSprintName / isValidSprintName / SPRINT_NAME_REGEX', () => {
  it('accepts plain "Sprint N - YYYYMMDD"', () => {
    expect(parseSprintName('Sprint 1 - 20260607')).toEqual({
      number: 1, dateTag: '20260607', suffix: null
    });
    expect(isValidSprintName('Sprint 12 - 20261231')).toBe(true);
  });

  it('accepts an optional human suffix after " - "', () => {
    expect(parseSprintName('Sprint 42 - 20260607 - Foundations')).toEqual({
      number: 42, dateTag: '20260607', suffix: 'Foundations'
    });
    expect(parseSprintName('Sprint 1 - 20260607 - retro - extra')).toEqual({
      number: 1, dateTag: '20260607', suffix: 'retro - extra'
    });
  });

  it('rejects names without "Sprint" prefix or wrong shape', () => {
    expect(parseSprintName('1 - 20260607')).toBeNull();
    expect(parseSprintName('Sprint 1 - 2026-06-07')).toBeNull();
    expect(parseSprintName('Sprint 1 - 2026-06-07 - x')).toBeNull();
    expect(parseSprintName('Sprint - 20260607')).toBeNull();
    expect(parseSprintName('Sprint 0 - 20260607')).not.toBeNull(); // regex allows 0 but build refuses
    expect(parseSprintName('')).toBeNull();
    expect(parseSprintName(null)).toBeNull();
    expect(parseSprintName(undefined)).toBeNull();
  });
});

describe('buildSprintName', () => {
  it('builds the canonical form from a Date', () => {
    expect(buildSprintName(1, SAMPLE_DATE)).toBe('Sprint 1 - 20260607');
  });

  it('builds the canonical form from a tag string', () => {
    expect(buildSprintName(7, '20260101')).toBe('Sprint 7 - 20260101');
  });

  it('appends suffix after " - " and trims', () => {
    expect(buildSprintName(3, SAMPLE_DATE, '  Foundations  ')).toBe('Sprint 3 - 20260607 - Foundations');
  });

  it('omits suffix when empty / whitespace-only', () => {
    expect(buildSprintName(3, SAMPLE_DATE, '')).toBe('Sprint 3 - 20260607');
    expect(buildSprintName(3, SAMPLE_DATE, '   ')).toBe('Sprint 3 - 20260607');
  });

  it('throws on invalid inputs', () => {
    expect(() => buildSprintName(0, SAMPLE_DATE)).toThrow();
    expect(() => buildSprintName(-1, SAMPLE_DATE)).toThrow();
    expect(() => buildSprintName(1.5, SAMPLE_DATE)).toThrow();
    expect(() => buildSprintName(1, '2026-06-07')).toThrow();
    expect(() => buildSprintName(1, SAMPLE_DATE, 'bad\nsuffix')).toThrow();
  });
});

describe('isoDateToTag / tagToIsoDate', () => {
  it('round-trips both directions', () => {
    expect(isoDateToTag('2026-06-07')).toBe('20260607');
    expect(tagToIsoDate('20260607')).toBe('2026-06-07');
    expect(tagToIsoDate(isoDateToTag('2026-12-31'))).toBe('2026-12-31');
  });

  it('rejects malformed input', () => {
    expect(() => isoDateToTag('2026/06/07')).toThrow();
    expect(() => tagToIsoDate('2026-06-07')).toThrow();
    expect(() => tagToIsoDate('2026067')).toThrow();
  });
});

describe('getSprintBoundsForDay', () => {
  it('returns UTC bounds for the given day', () => {
    expect(getSprintBoundsForDay(SAMPLE_DATE)).toEqual({
      isoDate: '2026-06-07',
      dateTag: '20260607',
      startDate: '2026-06-07T00:00:00.000Z',
      endDate: '2026-06-07T23:59:59.999Z'
    });
  });

  it('handles year boundary', () => {
    const last = new Date('2026-12-31T23:59:00.000Z');
    expect(getSprintBoundsForDay(last)).toEqual({
      isoDate: '2026-12-31',
      dateTag: '20261231',
      startDate: '2026-12-31T00:00:00.000Z',
      endDate: '2026-12-31T23:59:59.999Z'
    });
  });

  it('defaults to "now" when no date passed', () => {
    const { dateTag } = getSprintBoundsForDay();
    expect(dateTag).toMatch(/^\d{8}$/);
  });
});

describe('findSprintForDay', () => {
  it('returns null when snapshot is empty', () => {
    expect(findSprintForDay(null, SAMPLE_DATE)).toBeNull();
    expect(findSprintForDay({}, SAMPLE_DATE)).toBeNull();
  });

  it('finds a sprint whose startDate starts with YYYY-MM-DD', () => {
    const snapshot = {
      '-A': { startDate: '2026-06-06T00:00:00.000Z', title: 'Sprint 1 - 20260606' },
      '-B': { startDate: '2026-06-07T00:00:00.000Z', title: 'Sprint 2 - 20260607' },
      '-C': { startDate: '2026-06-08T00:00:00.000Z', title: 'Sprint 3 - 20260608' }
    };
    const found = findSprintForDay(snapshot, SAMPLE_DATE);
    expect(found?.firebaseId).toBe('-B');
  });

  it('matches legacy sprints stored as plain YYYY-MM-DD (no time)', () => {
    const snapshot = {
      '-Legacy': { startDate: '2026-06-07', title: 'Sprint Global 2026' }
    };
    const found = findSprintForDay(snapshot, SAMPLE_DATE);
    expect(found?.firebaseId).toBe('-Legacy');
  });

  it('ignores sprints from other days', () => {
    const snapshot = {
      '-X': { startDate: '2026-06-06T00:00:00.000Z', title: 'Sprint 1 - 20260606' }
    };
    expect(findSprintForDay(snapshot, SAMPLE_DATE)).toBeNull();
  });
});

describe('getNextSprintNumberForYear', () => {
  it('starts at 1 when no sprint exists', () => {
    expect(getNextSprintNumberForYear(null, 2026)).toBe(1);
    expect(getNextSprintNumberForYear({}, 2026)).toBe(1);
  });

  it('uses max(N)+1 across the year, ignores other years', () => {
    const snapshot = {
      '-A': { title: 'Sprint 1 - 20260101' },
      '-B': { title: 'Sprint 7 - 20260607' },
      '-C': { title: 'Sprint 3 - 20250228' }, // other year — ignored
      '-D': { title: 'Sprint Global 2026' },   // unparseable — ignored
      '-E': { title: 'Sprint 5 - 20260315' }
    };
    expect(getNextSprintNumberForYear(snapshot, 2026)).toBe(8);
    expect(getNextSprintNumberForYear(snapshot, 2025)).toBe(4);
    expect(getNextSprintNumberForYear(snapshot, 2027)).toBe(1);
  });

  it('throws on invalid year', () => {
    expect(() => getNextSprintNumberForYear({}, '2026')).toThrow();
  });
});

describe('SPRINT_NAME_REGEX', () => {
  it('is exported and matches the canonical examples', () => {
    expect(SPRINT_NAME_REGEX.test('Sprint 1 - 20260607')).toBe(true);
    expect(SPRINT_NAME_REGEX.test('Sprint 12 - 20260101 - Foo')).toBe(true);
    expect(SPRINT_NAME_REGEX.test('Sprint 1 - June 2026')).toBe(false);
  });
});

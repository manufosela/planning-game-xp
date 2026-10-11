/**
 * PLN-BUG-0125: moving a bug to "Fixed" did not fill its dates. Only
 * endDate was auto-filled; startDate was never set from a status change,
 * so the transition was blocked asking for it.
 */
import { describe, it, expect } from 'vitest';
import { getAutoBugDates } from '@/utils/bug-status-dates.js';

const NOW = new Date(2026, 9, 10, 12, 30, 0);
const STAMP = '2026-10-10T12:30:00';

describe('getAutoBugDates (PLN-BUG-0125)', () => {
  it('should fill startDate and endDate when a bug without dates is fixed', () => {
    expect(getAutoBugDates({ previousStatus: 'Created', newStatus: 'Fixed', startDate: '', endDate: '', now: NOW }))
      .toEqual({ startDate: STAMP, endDate: STAMP });
  });

  it('should fill only startDate when work on a bug starts', () => {
    expect(getAutoBugDates({ previousStatus: 'Created', newStatus: 'In Progress', startDate: '', endDate: '', now: NOW }))
      .toEqual({ startDate: STAMP });
  });

  it('should fill only endDate when the bug already has a startDate', () => {
    expect(getAutoBugDates({ previousStatus: 'In Progress', newStatus: 'Fixed', startDate: '2026-10-01T09:00:00', endDate: '', now: NOW }))
      .toEqual({ endDate: STAMP });
  });

  it('should never overwrite existing dates', () => {
    expect(getAutoBugDates({
      previousStatus: 'In Progress', newStatus: 'Fixed',
      startDate: '2026-10-01T09:00:00', endDate: '2026-10-02T09:00:00', now: NOW
    })).toEqual({});
  });

  it('should not fill endDate when moving between final statuses', () => {
    expect(getAutoBugDates({ previousStatus: 'Fixed', newStatus: 'Done&Validated', startDate: '2026-10-01T09:00:00', endDate: '', now: NOW }))
      .toEqual({});
  });

  it('should fill no dates when a report is rejected as not a bug', () => {
    expect(getAutoBugDates({ previousStatus: 'Created', newStatus: 'Rejected', startDate: '', endDate: '', now: NOW }))
      .toEqual({});
  });

  it('should fill nothing for "Created"', () => {
    expect(getAutoBugDates({ previousStatus: 'In Progress', newStatus: 'Created', startDate: '', endDate: '', now: NOW }))
      .toEqual({});
  });
});

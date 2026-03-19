import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateTimestamp,
  extractDatePart,
  extractDateTimeLocal,
  isToday,
  formatDateOnly
} from '@/utils/timestamp-utils.js';

describe('timestamp-utils', () => {
  describe('generateTimestamp', () => {
    it('should return timestamp with current time when date is today', () => {
      const now = new Date(2026, 1, 9, 14, 30, 45); // Feb 9, 2026 14:30:45
      vi.setSystemTime(now);

      const result = generateTimestamp(now, 'start');

      expect(result).toBe('2026-02-09T14:30:45');
    });

    it('should return timestamp with 09:00:00 for past date with start context', () => {
      vi.setSystemTime(new Date(2026, 1, 9));

      const pastDate = new Date(2026, 1, 7); // Feb 7, 2026
      const result = generateTimestamp(pastDate, 'start');

      expect(result).toBe('2026-02-07T09:00:00');
    });

    it('should return timestamp with 17:00:00 for past date with end context', () => {
      vi.setSystemTime(new Date(2026, 1, 9));

      const pastDate = new Date(2026, 1, 7); // Feb 7, 2026
      const result = generateTimestamp(pastDate, 'end');

      expect(result).toBe('2026-02-07T17:00:00');
    });

    it('should default to start context when not specified', () => {
      vi.setSystemTime(new Date(2026, 1, 9));

      const pastDate = new Date(2026, 1, 5);
      const result = generateTimestamp(pastDate);

      expect(result).toBe('2026-02-05T09:00:00');
    });

    it('should default to current date when no date provided', () => {
      const now = new Date(2026, 1, 9, 10, 15, 30);
      vi.setSystemTime(now);

      const result = generateTimestamp();

      expect(result).toBe('2026-02-09T10:15:30');
    });

    it('should handle date string in YYYY-MM-DD format for today', () => {
      const now = new Date(2026, 1, 9, 16, 45, 12);
      vi.setSystemTime(now);

      const result = generateTimestamp('2026-02-09', 'end');

      expect(result).toBe('2026-02-09T16:45:12');
    });

    it('should handle date string in YYYY-MM-DD format for past date', () => {
      vi.setSystemTime(new Date(2026, 1, 9));

      const result = generateTimestamp('2026-02-01', 'start');

      expect(result).toBe('2026-02-01T09:00:00');
    });

    it('should pad single-digit months and days', () => {
      vi.setSystemTime(new Date(2026, 0, 5)); // Jan 5

      const result = generateTimestamp(new Date(2026, 0, 3), 'start');

      expect(result).toBe('2026-01-03T09:00:00');
    });

    it('should pad single-digit hours, minutes and seconds for today', () => {
      const now = new Date(2026, 1, 9, 8, 5, 3);
      vi.setSystemTime(now);

      const result = generateTimestamp(now, 'start');

      expect(result).toBe('2026-02-09T08:05:03');
    });

    it('should preserve explicit time from datetime-local input (YYYY-MM-DDTHH:mm)', () => {
      vi.setSystemTime(new Date(2026, 1, 9));

      const result = generateTimestamp('2026-02-07T14:30', 'start');

      expect(result).toBe('2026-02-07T14:30:00');
    });

    it('should preserve explicit time even for today from datetime-local', () => {
      vi.setSystemTime(new Date(2026, 1, 9, 10, 0, 0));

      const result = generateTimestamp('2026-02-09T08:15', 'start');

      expect(result).toBe('2026-02-09T08:15:00');
    });

    it('should handle datetime-local with seconds already present', () => {
      const result = generateTimestamp('2026-02-07T14:30:45', 'start');

      expect(result).toBe('2026-02-07T14:30:45');
    });

    it('should convert UTC (Z suffix) timestamp to local time', () => {
      const input = '2026-02-09T14:30:00Z';
      const date = new Date(input);
      const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      expect(generateTimestamp(input, 'start')).toBe(expected);
    });

    it('should convert timezone offset timestamp to local time', () => {
      const input = '2026-02-09T14:30:00+05:00';
      const date = new Date(input);
      const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      expect(generateTimestamp(input, 'start')).toBe(expected);
    });
  });

  describe('extractDateTimeLocal', () => {
    it('should extract YYYY-MM-DDTHH:mm from full timestamp', () => {
      expect(extractDateTimeLocal('2026-02-09T14:30:45')).toBe('2026-02-09T14:30');
    });

    it('should add default start time for date-only values', () => {
      expect(extractDateTimeLocal('2026-02-09', 'start')).toBe('2026-02-09T09:00');
    });

    it('should add default end time for date-only values', () => {
      expect(extractDateTimeLocal('2026-02-09', 'end')).toBe('2026-02-09T17:00');
    });

    it('should default to start context', () => {
      expect(extractDateTimeLocal('2026-02-09')).toBe('2026-02-09T09:00');
    });

    it('should handle empty string', () => {
      expect(extractDateTimeLocal('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(extractDateTimeLocal(null)).toBe('');
      expect(extractDateTimeLocal(undefined)).toBe('');
    });

    it('should convert UTC timestamp (Z suffix) to local time', () => {
      const input = '2026-02-09T14:30:45.000Z';
      const date = new Date(input);
      const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      expect(extractDateTimeLocal(input)).toBe(expected);
    });

    it('should convert timezone offset timestamp to local time', () => {
      const input = '2026-02-09T14:30:45+05:00';
      const date = new Date(input);
      const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      expect(extractDateTimeLocal(input)).toBe(expected);
    });

    it('should not alter local time strings (no timezone suffix)', () => {
      expect(extractDateTimeLocal('2026-02-09T14:30:45')).toBe('2026-02-09T14:30');
    });
  });

  describe('extractDatePart', () => {
    it('should extract date from timestamp with time', () => {
      expect(extractDatePart('2026-02-09T14:30:45')).toBe('2026-02-09');
    });

    it('should return date as-is when no time component (backward compat)', () => {
      expect(extractDatePart('2026-02-09')).toBe('2026-02-09');
    });

    it('should handle empty string', () => {
      expect(extractDatePart('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(extractDatePart(null)).toBe('');
      expect(extractDatePart(undefined)).toBe('');
    });

    it('should handle ISO string with timezone', () => {
      expect(extractDatePart('2026-02-09T14:30:45.000Z')).toBe('2026-02-09');
    });
  });

  describe('isToday', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 1, 9, 14, 0, 0));
    });

    it('should return true for today Date object', () => {
      expect(isToday(new Date(2026, 1, 9))).toBe(true);
    });

    it('should return true for today string', () => {
      expect(isToday('2026-02-09')).toBe(true);
    });

    it('should return false for yesterday', () => {
      expect(isToday(new Date(2026, 1, 8))).toBe(false);
    });

    it('should return false for tomorrow', () => {
      expect(isToday(new Date(2026, 1, 10))).toBe(false);
    });

    it('should return true for today with different time', () => {
      expect(isToday(new Date(2026, 1, 9, 23, 59, 59))).toBe(true);
    });

    it('should handle timestamp string with time', () => {
      expect(isToday('2026-02-09T10:30:00')).toBe(true);
    });

    it('should return false for past date string', () => {
      expect(isToday('2026-01-15')).toBe(false);
    });
  });

  describe('formatDateOnly', () => {
    it('should format Date object to YYYY-MM-DD', () => {
      const date = new Date(2026, 1, 9);
      expect(formatDateOnly(date)).toBe('2026-02-09');
    });

    it('should pad single-digit month and day', () => {
      const date = new Date(2026, 0, 5); // Jan 5
      expect(formatDateOnly(date)).toBe('2026-01-05');
    });

    it('should handle end of year', () => {
      const date = new Date(2026, 11, 31); // Dec 31
      expect(formatDateOnly(date)).toBe('2026-12-31');
    });
  });
});

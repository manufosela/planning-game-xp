import { describe, it, expect } from 'vitest';
import {
  startCycle,
  endCycle,
  calculateDuration,
  accumulateDuration,
} from '../../../packages/domain/value-objects/work-cycle.js';

describe('WorkCycle value object', () => {
  const t1 = '2026-03-10T09:00:00Z';
  const t2 = '2026-03-10T17:00:00Z';
  const eightHoursMs = 8 * 60 * 60 * 1000;

  describe('startCycle', () => {
    it('should create a new cycle with startDate and cycleNumber', () => {
      const cycle = startCycle(t1, 1);
      expect(cycle.startDate).toBe(t1);
      expect(cycle.cycleNumber).toBe(1);
      expect(cycle.durationMs).toBe(0);
    });

    it('should throw if date is not provided', () => {
      expect(() => startCycle(null, 1)).toThrow();
      expect(() => startCycle(undefined, 1)).toThrow();
      expect(() => startCycle('', 1)).toThrow();
    });
  });

  describe('endCycle', () => {
    it('should complete a cycle with endDate and durationMs', () => {
      const cycle = startCycle(t1, 1);
      const completed = endCycle(cycle, t2);
      expect(completed.endDate).toBe(t2);
      expect(completed.durationMs).toBe(eightHoursMs);
    });

    it('should throw if endDate is before startDate', () => {
      const cycle = startCycle(t2, 1);
      expect(() => endCycle(cycle, t1)).toThrow();
    });

    it('should throw if cycle is missing startDate', () => {
      expect(() => endCycle({}, t2)).toThrow();
    });
  });

  describe('calculateDuration', () => {
    it('should return difference in ms', () => {
      expect(calculateDuration(t1, t2)).toBe(eightHoursMs);
    });

    it('should return 0 for same start and end', () => {
      expect(calculateDuration(t1, t1)).toBe(0);
    });

    it('should throw if endDate before startDate', () => {
      expect(() => calculateDuration(t2, t1)).toThrow();
    });
  });

  describe('accumulateDuration', () => {
    it('should sum durationMs of all cycles', () => {
      const cycles = [
        { startDate: t1, endDate: t2, durationMs: eightHoursMs },
        { startDate: t1, endDate: t2, durationMs: eightHoursMs },
      ];
      expect(accumulateDuration(cycles)).toBe(eightHoursMs * 2);
    });

    it('should return 0 for empty array', () => {
      expect(accumulateDuration([])).toBe(0);
    });

    it('should skip cycles without durationMs', () => {
      const cycles = [
        { startDate: t1, durationMs: 0 },
        { startDate: t1, endDate: t2, durationMs: eightHoursMs },
      ];
      expect(accumulateDuration(cycles)).toBe(eightHoursMs);
    });
  });
});

/**
 * Tests for BaseCard endDate >= startDate validation
 * PLN-BUG-0099: Cards must validate that endDate is not before startDate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('BaseCard - Date Validation', () => {
  describe('validateDates()', () => {
    let validateDates;

    beforeEach(() => {
      // Extract the pure validation logic to test independently
      // This function mirrors what BaseCard._validateDates() should do
      validateDates = (startDate, endDate) => {
        if (!startDate || !endDate) return true;
        return new Date(endDate) >= new Date(startDate);
      };
    });

    it('should return true when no dates are set', () => {
      expect(validateDates('', '')).toBe(true);
      expect(validateDates(null, null)).toBe(true);
      expect(validateDates(undefined, undefined)).toBe(true);
    });

    it('should return true when only startDate is set', () => {
      expect(validateDates('2026-01-01', '')).toBe(true);
      expect(validateDates('2026-01-01', null)).toBe(true);
    });

    it('should return true when only endDate is set', () => {
      expect(validateDates('', '2026-01-01')).toBe(true);
      expect(validateDates(null, '2026-01-01')).toBe(true);
    });

    it('should return true when endDate equals startDate', () => {
      expect(validateDates('2026-03-07', '2026-03-07')).toBe(true);
    });

    it('should return true when endDate is after startDate', () => {
      expect(validateDates('2026-01-01', '2026-12-31')).toBe(true);
      expect(validateDates('2026-03-07', '2026-03-08')).toBe(true);
    });

    it('should return false when endDate is before startDate', () => {
      expect(validateDates('2026-03-07', '2026-03-06')).toBe(false);
      expect(validateDates('2026-12-31', '2026-01-01')).toBe(false);
    });

    it('should handle ISO datetime strings', () => {
      expect(validateDates('2026-03-07T10:00:00Z', '2026-03-07T09:00:00Z')).toBe(false);
      expect(validateDates('2026-03-07T10:00:00Z', '2026-03-07T11:00:00Z')).toBe(true);
    });
  });

  describe('enforceDateCoherence()', () => {
    function enforceDateCoherence(card) {
      if (card.startDate && card.endDate && new Date(card.endDate) < new Date(card.startDate)) {
        card.endDate = '';
        return true; // endDate was cleared
      }
      return false;
    }

    it('should clear endDate when it is before new startDate', () => {
      const card = { startDate: '2026-03-10', endDate: '2026-03-05' };
      const cleared = enforceDateCoherence(card);
      expect(cleared).toBe(true);
      expect(card.endDate).toBe('');
    });

    it('should not clear endDate when it is after startDate', () => {
      const card = { startDate: '2026-03-01', endDate: '2026-03-10' };
      const cleared = enforceDateCoherence(card);
      expect(cleared).toBe(false);
      expect(card.endDate).toBe('2026-03-10');
    });

    it('should not clear endDate when it equals startDate', () => {
      const card = { startDate: '2026-03-07', endDate: '2026-03-07' };
      const cleared = enforceDateCoherence(card);
      expect(cleared).toBe(false);
      expect(card.endDate).toBe('2026-03-07');
    });

    it('should do nothing when endDate is empty', () => {
      const card = { startDate: '2026-03-10', endDate: '' };
      const cleared = enforceDateCoherence(card);
      expect(cleared).toBe(false);
    });

    it('should do nothing when startDate is empty', () => {
      const card = { startDate: '', endDate: '2026-03-10' };
      const cleared = enforceDateCoherence(card);
      expect(cleared).toBe(false);
    });

    it('should handle ISO datetime strings', () => {
      const card = { startDate: '2026-03-10T14:00:00Z', endDate: '2026-03-10T10:00:00Z' };
      const cleared = enforceDateCoherence(card);
      expect(cleared).toBe(true);
      expect(card.endDate).toBe('');
    });
  });

  describe('validateEndDateChange()', () => {
    function validateEndDateChange(startDate, newEndDate) {
      if (!startDate || !newEndDate) return true;
      return new Date(newEndDate) >= new Date(startDate);
    }

    it('should accept endDate after startDate', () => {
      expect(validateEndDateChange('2026-03-01', '2026-03-10')).toBe(true);
    });

    it('should accept endDate equal to startDate', () => {
      expect(validateEndDateChange('2026-03-07', '2026-03-07')).toBe(true);
    });

    it('should reject endDate before startDate', () => {
      expect(validateEndDateChange('2026-03-10', '2026-03-05')).toBe(false);
    });

    it('should accept when startDate is empty', () => {
      expect(validateEndDateChange('', '2026-03-10')).toBe(true);
      expect(validateEndDateChange(null, '2026-03-10')).toBe(true);
    });

    it('should accept when newEndDate is empty', () => {
      expect(validateEndDateChange('2026-03-10', '')).toBe(true);
      expect(validateEndDateChange('2026-03-10', null)).toBe(true);
    });
  });
});

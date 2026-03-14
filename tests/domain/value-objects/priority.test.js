import { describe, it, expect } from 'vitest';
import { calculate, validatePoints } from '../../../packages/domain/value-objects/priority.js';

describe('Priority value object', () => {
  describe('validatePoints', () => {
    it('should accept valid points (1-5)', () => {
      for (let i = 1; i <= 5; i++) {
        expect(validatePoints(i)).toBe(true);
      }
    });

    it('should reject zero', () => {
      expect(validatePoints(0)).toBe(false);
    });

    it('should reject values above 5', () => {
      expect(validatePoints(6)).toBe(false);
    });

    it('should reject negative values', () => {
      expect(validatePoints(-1)).toBe(false);
    });

    it('should reject non-integers', () => {
      expect(validatePoints(2.5)).toBe(false);
    });

    it('should reject null/undefined/NaN', () => {
      expect(validatePoints(null)).toBe(false);
      expect(validatePoints(undefined)).toBe(false);
      expect(validatePoints(NaN)).toBe(false);
    });

    it('should reject strings', () => {
      expect(validatePoints('3')).toBe(false);
    });
  });

  describe('calculate', () => {
    it('should calculate priority as (businessPoints / devPoints) * 100', () => {
      expect(calculate(1, 5)).toBe(500);
      expect(calculate(5, 1)).toBe(20);
      expect(calculate(2, 4)).toBe(200);
      expect(calculate(3, 3)).toBe(100);
    });

    it('should throw on invalid devPoints', () => {
      expect(() => calculate(0, 3)).toThrow();
      expect(() => calculate(6, 3)).toThrow();
      expect(() => calculate(-1, 3)).toThrow();
      expect(() => calculate(null, 3)).toThrow();
    });

    it('should throw on invalid businessPoints', () => {
      expect(() => calculate(3, 0)).toThrow();
      expect(() => calculate(3, 6)).toThrow();
      expect(() => calculate(3, -1)).toThrow();
      expect(() => calculate(3, null)).toThrow();
    });
  });
});

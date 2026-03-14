import { describe, it, expect } from 'vitest';
import { parse, format, validate, getType, getProject } from '../../../packages/domain/value-objects/card-id.js';

describe('CardId value object', () => {
  describe('validate', () => {
    it('should accept valid card IDs', () => {
      expect(validate('PLN-TSK-0042')).toBe(true);
      expect(validate('C4D-BUG-0001')).toBe(true);
      expect(validate('EX2-EPC-1234')).toBe(true);
      expect(validate('NTR-SPR-0010')).toBe(true);
      expect(validate('PLN-PRP-0099')).toBe(true);
      expect(validate('GSP-QA-0001')).toBe(true);
    });

    it('should accept projects with digits in abbreviation', () => {
      expect(validate('EX2-TSK-0001')).toBe(true);
      expect(validate('C4D-BUG-0002')).toBe(true);
    });

    it('should accept card IDs with more than 4 digits', () => {
      expect(validate('PLN-TSK-00042')).toBe(true);
      expect(validate('PLN-TSK-123456')).toBe(true);
    });

    it('should reject invalid card IDs', () => {
      expect(validate('')).toBe(false);
      expect(validate('PLN')).toBe(false);
      expect(validate('PLN-TSK')).toBe(false);
      expect(validate('PLN-TSK-')).toBe(false);
      expect(validate('PLN-TSK-abc')).toBe(false);
      expect(validate('PLN-XXX-0001')).toBe(false);
      expect(validate('pln-TSK-0001')).toBe(false);
      expect(validate('P-TSK-0001')).toBe(false);
      expect(validate('PLN-TSK-01')).toBe(false);
      expect(validate(null)).toBe(false);
      expect(validate(undefined)).toBe(false);
      expect(validate(123)).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse a valid card ID into components', () => {
      const result = parse('PLN-TSK-0042');
      expect(result).toEqual({ project: 'PLN', type: 'TSK', number: 42 });
    });

    it('should parse multi-digit project abbreviations', () => {
      const result = parse('C4D-BUG-0001');
      expect(result).toEqual({ project: 'C4D', type: 'BUG', number: 1 });
    });

    it('should throw on invalid card ID', () => {
      expect(() => parse('')).toThrow();
      expect(() => parse('INVALID')).toThrow();
      expect(() => parse(null)).toThrow();
    });
  });

  describe('format', () => {
    it('should format components into a card ID string', () => {
      expect(format('PLN', 'TSK', 42)).toBe('PLN-TSK-0042');
    });

    it('should pad numbers to at least 4 digits', () => {
      expect(format('PLN', 'TSK', 1)).toBe('PLN-TSK-0001');
      expect(format('PLN', 'TSK', 9999)).toBe('PLN-TSK-9999');
      expect(format('PLN', 'TSK', 10000)).toBe('PLN-TSK-10000');
    });

    it('should throw on invalid project', () => {
      expect(() => format('', 'TSK', 1)).toThrow();
      expect(() => format('p', 'TSK', 1)).toThrow();
    });

    it('should throw on invalid type', () => {
      expect(() => format('PLN', 'XXX', 1)).toThrow();
    });

    it('should throw on invalid number', () => {
      expect(() => format('PLN', 'TSK', 0)).toThrow();
      expect(() => format('PLN', 'TSK', -1)).toThrow();
      expect(() => format('PLN', 'TSK', null)).toThrow();
    });
  });

  describe('parse/format roundtrip', () => {
    it('should roundtrip correctly', () => {
      const id = 'PLN-TSK-0042';
      const { project, type, number } = parse(id);
      expect(format(project, type, number)).toBe(id);
    });
  });

  describe('getType', () => {
    it('should extract type from valid card ID', () => {
      expect(getType('PLN-TSK-0001')).toBe('TSK');
      expect(getType('PLN-BUG-0001')).toBe('BUG');
      expect(getType('PLN-EPC-0001')).toBe('EPC');
      expect(getType('PLN-SPR-0001')).toBe('SPR');
      expect(getType('PLN-PRP-0001')).toBe('PRP');
      expect(getType('PLN-QA-0001')).toBe('QA');
    });

    it('should throw on invalid card ID', () => {
      expect(() => getType('INVALID')).toThrow();
    });
  });

  describe('getProject', () => {
    it('should extract project from valid card ID', () => {
      expect(getProject('PLN-TSK-0001')).toBe('PLN');
      expect(getProject('C4D-BUG-0002')).toBe('C4D');
    });

    it('should throw on invalid card ID', () => {
      expect(() => getProject('INVALID')).toThrow();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { validateCard, validateRequiredFields } from '../../../packages/domain/validators/card-validator.js';

describe('CardValidator', () => {
  describe('validateCard', () => {
    it('should validate a minimal valid task card', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        cardType: 'task-card',
        title: 'Test task',
        projectId: 'PLN',
        createdBy: 'user@test.com',
      };
      const result = validateCard(card);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing cardId', () => {
      const card = {
        cardType: 'task-card',
        title: 'Test',
        projectId: 'PLN',
        createdBy: 'user@test.com',
      };
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cardId is required');
    });

    it('should detect missing title', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        cardType: 'task-card',
        projectId: 'PLN',
        createdBy: 'user@test.com',
      };
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title is required');
    });

    it('should detect missing cardType', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        title: 'Test',
        projectId: 'PLN',
        createdBy: 'user@test.com',
      };
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cardType is required');
    });

    it('should detect invalid cardId format', () => {
      const card = {
        cardId: 'INVALID',
        cardType: 'task-card',
        title: 'Test',
        projectId: 'PLN',
        createdBy: 'user@test.com',
      };
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cardId format'))).toBe(true);
    });

    it('should detect invalid cardType', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        cardType: 'invalid-type',
        title: 'Test',
        projectId: 'PLN',
        createdBy: 'user@test.com',
      };
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cardType'))).toBe(true);
    });

    it('should validate devPoints range for task cards', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        cardType: 'task-card',
        title: 'Test',
        projectId: 'PLN',
        createdBy: 'user@test.com',
        devPoints: 6,
      };
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('devPoints'))).toBe(true);
    });

    it('should validate businessPoints range for task cards', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        cardType: 'task-card',
        title: 'Test',
        projectId: 'PLN',
        createdBy: 'user@test.com',
        businessPoints: 0,
      };
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('businessPoints'))).toBe(true);
    });

    it('should accept valid devPoints and businessPoints', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        cardType: 'task-card',
        title: 'Test',
        projectId: 'PLN',
        createdBy: 'user@test.com',
        devPoints: 3,
        businessPoints: 4,
      };
      const result = validateCard(card);
      expect(result.valid).toBe(true);
    });

    it('should validate bug card with no extra errors', () => {
      const card = {
        cardId: 'PLN-BUG-0001',
        cardType: 'bug-card',
        title: 'Login crash',
        projectId: 'PLN',
        createdBy: 'user@test.com',
      };
      const result = validateCard(card);
      expect(result.valid).toBe(true);
    });

    it('should collect multiple errors', () => {
      const card = {};
      const result = validateCard(card);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validateRequiredFields', () => {
    it('should detect all missing fields', () => {
      const card = { name: 'test' };
      const result = validateRequiredFields(card, ['title', 'status', 'developer']);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['title', 'status', 'developer']);
    });

    it('should pass when all fields present', () => {
      const card = { title: 'Test', status: 'To Do', developer: 'dev_001' };
      const result = validateRequiredFields(card, ['title', 'status', 'developer']);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should consider empty string as missing', () => {
      const card = { title: '' };
      const result = validateRequiredFields(card, ['title']);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['title']);
    });

    it('should consider empty array as missing', () => {
      const card = { commits: [] };
      const result = validateRequiredFields(card, ['commits']);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['commits']);
    });
  });
});

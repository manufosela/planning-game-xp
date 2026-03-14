import { describe, it, expect } from 'vitest';
import { validateTransitionRequirements } from '../../../packages/domain/validators/transition-validator.js';

describe('TransitionValidator', () => {
  describe('validateTransitionRequirements', () => {
    it('should validate task To Do → In Progress with all fields present', () => {
      const card = {
        cardType: 'task-card',
        status: 'To Do',
        developer: 'dev_001',
        validator: 'stk_001',
        epic: 'PLN-EPC-0001',
        sprint: 'PLN-SPR-0001',
        devPoints: 3,
        businessPoints: 4,
        acceptanceCriteria: 'Some criteria',
        startDate: '2026-03-14',
      };
      const result = validateTransitionRequirements(card, 'In Progress');
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.reason).toBeUndefined();
    });

    it('should detect missing fields for To Do → In Progress', () => {
      const card = {
        cardType: 'task-card',
        status: 'To Do',
        epic: 'PLN-EPC-0001',
      };
      const result = validateTransitionRequirements(card, 'In Progress');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('developer');
      expect(result.missing).toContain('validator');
      expect(result.missing).toContain('sprint');
      expect(result.missing).toContain('devPoints');
      expect(result.missing).toContain('businessPoints');
      expect(result.missing).toContain('acceptanceCriteria');
      expect(result.missing).toContain('startDate');
    });

    it('should validate In Progress → To Validate with commits and pipelineStatus.prCreated', () => {
      const card = {
        cardType: 'task-card',
        status: 'In Progress',
        startDate: '2026-03-14',
        endDate: '2026-03-14',
        commits: [{ hash: 'abc123', message: 'feat: something' }],
        pipelineStatus: {
          prCreated: { date: '2026-03-14', prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 },
        },
      };
      const result = validateTransitionRequirements(card, 'To Validate');
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing nested field pipelineStatus.prCreated', () => {
      const card = {
        cardType: 'task-card',
        status: 'In Progress',
        startDate: '2026-03-14',
        endDate: '2026-03-14',
        commits: [{ hash: 'abc123', message: 'feat: something' }],
        pipelineStatus: {},
      };
      const result = validateTransitionRequirements(card, 'To Validate');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('pipelineStatus.prCreated');
    });

    it('should treat empty commits array as missing', () => {
      const card = {
        cardType: 'task-card',
        status: 'In Progress',
        startDate: '2026-03-14',
        endDate: '2026-03-14',
        commits: [],
        pipelineStatus: {
          prCreated: { date: '2026-03-14', prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 },
        },
      };
      const result = validateTransitionRequirements(card, 'To Validate');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('commits');
    });

    it('should return reason for invalid transition (To Do → Done)', () => {
      const card = {
        cardType: 'task-card',
        status: 'To Do',
      };
      const result = validateTransitionRequirements(card, 'Done');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed');
      expect(result.missing).toEqual([]);
    });

    it('should validate bug Created → Assigned needs developer', () => {
      const card = {
        cardType: 'bug-card',
        status: 'Created',
      };
      const result = validateTransitionRequirements(card, 'Assigned');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('developer');
    });

    it('should validate bug Created → Assigned with developer present', () => {
      const card = {
        cardType: 'bug-card',
        status: 'Created',
        developer: 'dev_001',
      };
      const result = validateTransitionRequirements(card, 'Assigned');
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should validate bug Verified → Closed needs rootCause and resolution', () => {
      const card = {
        cardType: 'bug-card',
        status: 'Verified',
      };
      const result = validateTransitionRequirements(card, 'Closed');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('rootCause');
      expect(result.missing).toContain('resolution');
    });

    it('should validate bug Verified → Closed with all fields', () => {
      const card = {
        cardType: 'bug-card',
        status: 'Verified',
        rootCause: 'Null pointer in handler',
        resolution: 'Added null check',
      };
      const result = validateTransitionRequirements(card, 'Closed');
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should accept acceptanceCriteriaStructured as alternative to acceptanceCriteria', () => {
      const card = {
        cardType: 'task-card',
        status: 'To Do',
        developer: 'dev_001',
        validator: 'stk_001',
        epic: 'PLN-EPC-0001',
        sprint: 'PLN-SPR-0001',
        devPoints: 3,
        businessPoints: 4,
        acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
        startDate: '2026-03-14',
      };
      const result = validateTransitionRequirements(card, 'In Progress');
      expect(result.valid).toBe(true);
    });
  });
});

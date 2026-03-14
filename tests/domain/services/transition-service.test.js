import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getRequiredFields,
  validateTransition,
  getAvailableTransitions,
} from '../../../packages/domain/services/transition-service.js';

describe('TransitionService', () => {
  describe('canTransition', () => {
    it('should allow valid task transitions', () => {
      expect(canTransition('task-card', 'To Do', 'In Progress')).toBe(true);
      expect(canTransition('task-card', 'In Progress', 'To Validate')).toBe(true);
      expect(canTransition('task-card', 'In Progress', 'Blocked')).toBe(true);
      expect(canTransition('task-card', 'In Progress', 'To Do')).toBe(true);
    });

    it('should reject invalid task transitions', () => {
      expect(canTransition('task-card', 'To Do', 'Done')).toBe(false);
      expect(canTransition('task-card', 'To Do', 'To Validate')).toBe(false);
    });

    it('should allow valid bug transitions', () => {
      expect(canTransition('bug-card', 'Created', 'Assigned')).toBe(true);
      expect(canTransition('bug-card', 'Assigned', 'Fixed')).toBe(true);
      expect(canTransition('bug-card', 'Verified', 'Closed')).toBe(true);
    });

    it('should reject invalid bug transitions', () => {
      expect(canTransition('bug-card', 'Created', 'Fixed')).toBe(false);
      expect(canTransition('bug-card', 'Closed', 'Created')).toBe(false);
    });

    it('should allow valid proposal transitions', () => {
      expect(canTransition('proposal-card', 'Pending', 'Planned')).toBe(true);
      expect(canTransition('proposal-card', 'Pending', 'Rejected')).toBe(true);
    });

    it('should return false for unknown card type', () => {
      expect(canTransition('unknown', 'A', 'B')).toBe(false);
    });
  });

  describe('getRequiredFields', () => {
    it('should return required fields for task To Do → In Progress', () => {
      const fields = getRequiredFields('task-card', 'To Do', 'In Progress');
      expect(fields).toContain('developer');
      expect(fields).toContain('validator');
      expect(fields).toContain('epic');
      expect(fields).toContain('sprint');
      expect(fields).toContain('devPoints');
      expect(fields).toContain('businessPoints');
      expect(fields).toContain('acceptanceCriteria');
      expect(fields).toContain('startDate');
    });

    it('should return required fields for task In Progress → To Validate', () => {
      const fields = getRequiredFields('task-card', 'In Progress', 'To Validate');
      expect(fields).toContain('startDate');
      expect(fields).toContain('endDate');
      expect(fields).toContain('commits');
      expect(fields).toContain('pipelineStatus.prCreated');
    });

    it('should return required fields for bug Created → Assigned', () => {
      const fields = getRequiredFields('bug-card', 'Created', 'Assigned');
      expect(fields).toContain('developer');
    });

    it('should return required fields for bug Assigned → Fixed', () => {
      const fields = getRequiredFields('bug-card', 'Assigned', 'Fixed');
      expect(fields).toContain('commits');
    });

    it('should return required fields for bug Verified → Closed', () => {
      const fields = getRequiredFields('bug-card', 'Verified', 'Closed');
      expect(fields).toContain('rootCause');
      expect(fields).toContain('resolution');
    });

    it('should return empty array for transitions without requirements', () => {
      const fields = getRequiredFields('task-card', 'In Progress', 'Blocked');
      expect(fields).toEqual([]);
    });

    it('should return empty array for invalid transition', () => {
      const fields = getRequiredFields('task-card', 'To Do', 'Done');
      expect(fields).toEqual([]);
    });
  });

  describe('validateTransition', () => {
    it('should validate a complete task card for To Do → In Progress', () => {
      const card = {
        cardType: 'task-card',
        status: 'To Do',
        developer: 'dev_001',
        validator: 'stk_001',
        epic: 'PLN-EPC-0001',
        sprint: 'PLN-SPR-0001',
        devPoints: 3,
        businessPoints: 4,
        acceptanceCriteria: 'Given X when Y then Z',
        startDate: '2026-03-10',
      };
      const result = validateTransition(card, 'In Progress');
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing fields for task To Do → In Progress', () => {
      const card = {
        cardType: 'task-card',
        status: 'To Do',
        developer: 'dev_001',
      };
      const result = validateTransition(card, 'In Progress');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('validator');
      expect(result.missing).toContain('epic');
    });

    it('should detect missing nested field pipelineStatus.prCreated', () => {
      const card = {
        cardType: 'task-card',
        status: 'In Progress',
        startDate: '2026-03-10',
        endDate: '2026-03-11',
        commits: [{ hash: 'abc', message: 'feat: x', date: '2026-03-11', author: 'dev' }],
      };
      const result = validateTransition(card, 'To Validate');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('pipelineStatus.prCreated');
    });

    it('should pass when pipelineStatus.prCreated is present', () => {
      const card = {
        cardType: 'task-card',
        status: 'In Progress',
        startDate: '2026-03-10',
        endDate: '2026-03-11',
        commits: [{ hash: 'abc', message: 'feat: x', date: '2026-03-11', author: 'dev' }],
        pipelineStatus: { prCreated: { date: '2026-03-11', prUrl: 'https://x', prNumber: 1 } },
      };
      const result = validateTransition(card, 'To Validate');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid transition', () => {
      const card = { cardType: 'task-card', status: 'To Do' };
      const result = validateTransition(card, 'Done');
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
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
        acceptanceCriteriaStructured: [{ given: 'X', when: 'Y', then: 'Z', raw: '' }],
        startDate: '2026-03-10',
      };
      const result = validateTransition(card, 'In Progress');
      expect(result.valid).toBe(true);
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return next statuses for task-card To Do', () => {
      const transitions = getAvailableTransitions('task-card', 'To Do');
      expect(transitions).toContain('In Progress');
    });

    it('should return empty for terminal status', () => {
      const transitions = getAvailableTransitions('task-card', 'Done&Validated');
      expect(transitions).toEqual([]);
    });

    it('should throw for unknown card type', () => {
      expect(() => getAvailableTransitions('unknown', 'X')).toThrow();
    });
  });
});

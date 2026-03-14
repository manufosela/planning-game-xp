import { describe, it, expect } from 'vitest';
import {
  TaskStatus,
  BugStatus,
  ProposalStatus,
  getStatuses,
  isValidStatus,
  getNextStatuses,
} from '../../../packages/domain/value-objects/status.js';

describe('Status value object', () => {
  describe('TaskStatus enum', () => {
    it('should contain all task statuses', () => {
      expect(TaskStatus.TODO).toBe('To Do');
      expect(TaskStatus.IN_PROGRESS).toBe('In Progress');
      expect(TaskStatus.TO_VALIDATE).toBe('To Validate');
      expect(TaskStatus.DONE).toBe('Done');
      expect(TaskStatus.DONE_VALIDATED).toBe('Done&Validated');
      expect(TaskStatus.BLOCKED).toBe('Blocked');
      expect(TaskStatus.REOPENED).toBe('Reopened');
    });
  });

  describe('BugStatus enum', () => {
    it('should contain all bug statuses', () => {
      expect(BugStatus.CREATED).toBe('Created');
      expect(BugStatus.ASSIGNED).toBe('Assigned');
      expect(BugStatus.FIXED).toBe('Fixed');
      expect(BugStatus.VERIFIED).toBe('Verified');
      expect(BugStatus.CLOSED).toBe('Closed');
    });
  });

  describe('ProposalStatus enum', () => {
    it('should contain all proposal statuses', () => {
      expect(ProposalStatus.PENDING).toBe('Pending');
      expect(ProposalStatus.PLANNED).toBe('Planned');
      expect(ProposalStatus.REJECTED).toBe('Rejected');
    });
  });

  describe('getStatuses', () => {
    it('should return task statuses for task-card', () => {
      const statuses = getStatuses('task-card');
      expect(statuses).toContain('To Do');
      expect(statuses).toContain('In Progress');
      expect(statuses).toContain('Done&Validated');
      expect(statuses.length).toBe(7);
    });

    it('should return bug statuses for bug-card', () => {
      const statuses = getStatuses('bug-card');
      expect(statuses).toContain('Created');
      expect(statuses).toContain('Closed');
      expect(statuses.length).toBe(5);
    });

    it('should return proposal statuses for proposal-card', () => {
      const statuses = getStatuses('proposal-card');
      expect(statuses).toContain('Pending');
      expect(statuses.length).toBe(3);
    });

    it('should throw for unknown card type', () => {
      expect(() => getStatuses('unknown-card')).toThrow();
    });
  });

  describe('isValidStatus', () => {
    it('should return true for valid task statuses', () => {
      expect(isValidStatus('task-card', 'To Do')).toBe(true);
      expect(isValidStatus('task-card', 'Blocked')).toBe(true);
    });

    it('should return false for invalid task statuses', () => {
      expect(isValidStatus('task-card', 'Created')).toBe(false);
      expect(isValidStatus('task-card', 'Invalid')).toBe(false);
    });

    it('should return true for valid bug statuses', () => {
      expect(isValidStatus('bug-card', 'Created')).toBe(true);
      expect(isValidStatus('bug-card', 'Fixed')).toBe(true);
    });

    it('should return false for invalid bug statuses', () => {
      expect(isValidStatus('bug-card', 'To Do')).toBe(false);
    });
  });

  describe('getNextStatuses', () => {
    it('should return valid next statuses for task To Do', () => {
      const next = getNextStatuses('task-card', 'To Do');
      expect(next).toContain('In Progress');
      expect(next).not.toContain('Done');
    });

    it('should return valid next statuses for task In Progress', () => {
      const next = getNextStatuses('task-card', 'In Progress');
      expect(next).toContain('To Validate');
      expect(next).toContain('Blocked');
      expect(next).toContain('To Do');
    });

    it('should return valid next statuses for bug Created', () => {
      const next = getNextStatuses('bug-card', 'Created');
      expect(next).toContain('Assigned');
    });

    it('should return valid next statuses for bug Assigned', () => {
      const next = getNextStatuses('bug-card', 'Assigned');
      expect(next).toContain('Fixed');
    });

    it('should return empty array for terminal status', () => {
      const next = getNextStatuses('proposal-card', 'Rejected');
      expect(next).toEqual([]);
    });

    it('should throw for unknown card type', () => {
      expect(() => getNextStatuses('unknown-card', 'To Do')).toThrow();
    });

    it('should return empty for unknown status in valid card type', () => {
      const next = getNextStatuses('task-card', 'NonExistent');
      expect(next).toEqual([]);
    });
  });
});

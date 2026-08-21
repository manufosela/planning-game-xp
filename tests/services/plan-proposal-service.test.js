/**
 * Tests for Plan Proposal Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PROPOSAL_STATUSES } from '../../public/js/services/plan-proposal-service.js';

describe('Plan Proposal Service constants', () => {
  describe('PROPOSAL_STATUSES', () => {
    it('should include pending status', () => {
      expect(PROPOSAL_STATUSES).toContain('pending');
    });

    it('should include planned status', () => {
      expect(PROPOSAL_STATUSES).toContain('planned');
    });

    it('should include rejected status', () => {
      expect(PROPOSAL_STATUSES).toContain('rejected');
    });

    it('should have exactly 3 statuses', () => {
      expect(PROPOSAL_STATUSES).toHaveLength(3);
    });
  });
});

describe('Plan Proposal Service unit tests', () => {
  class MockPlanProposalService {
    constructor() {
      this.cache = new Map();
      this.projectCache = new Map();
    }

    _getCacheKey(projectId, proposalId) {
      return `${projectId}/${proposalId}`;
    }

    validateStatus(status) {
      if (!PROPOSAL_STATUSES.includes(status)) {
        throw new Error(`Invalid proposal status: ${status}. Valid: ${PROPOSAL_STATUSES.join(', ')}`);
      }
      return true;
    }

    validateTitle(title) {
      if (!title) {
        throw new Error('Title is required');
      }
      if (title.length > 200) {
        throw new Error('Title must be 200 characters or less');
      }
      return true;
    }

    validateDescription(description) {
      if (description && description.length > 5000) {
        throw new Error('Description must be 5000 characters or less');
      }
      return true;
    }

    clearCache(projectId) {
      if (projectId) {
        this.projectCache.delete(projectId);
        for (const key of this.cache.keys()) {
          if (key.startsWith(`${projectId}/`)) {
            this.cache.delete(key);
          }
        }
      } else {
        this.cache.clear();
        this.projectCache.clear();
      }
    }
  }

  let service;

  beforeEach(() => {
    service = new MockPlanProposalService();
  });

  describe('_getCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = service._getCacheKey('PLN', 'proposal_001');
      expect(key).toBe('PLN/proposal_001');
    });
  });

  describe('validateStatus', () => {
    it('should accept valid statuses', () => {
      for (const status of PROPOSAL_STATUSES) {
        expect(service.validateStatus(status)).toBe(true);
      }
    });

    it('should reject invalid statuses', () => {
      expect(() => service.validateStatus('invalid')).toThrow('Invalid proposal status');
    });

    it('should reject empty status', () => {
      expect(() => service.validateStatus('')).toThrow('Invalid proposal status');
    });
  });

  describe('validateTitle', () => {
    it('should accept valid title', () => {
      expect(service.validateTitle('My Proposal')).toBe(true);
    });

    it('should reject empty title', () => {
      expect(() => service.validateTitle('')).toThrow('Title is required');
    });

    it('should reject null title', () => {
      expect(() => service.validateTitle(null)).toThrow('Title is required');
    });

    it('should reject title over 200 characters', () => {
      const longTitle = 'a'.repeat(201);
      expect(() => service.validateTitle(longTitle)).toThrow('200 characters or less');
    });

    it('should accept title of exactly 200 characters', () => {
      const title = 'a'.repeat(200);
      expect(service.validateTitle(title)).toBe(true);
    });
  });

  describe('validateDescription', () => {
    it('should accept valid description', () => {
      expect(service.validateDescription('Some description')).toBe(true);
    });

    it('should accept empty description', () => {
      expect(service.validateDescription('')).toBe(true);
    });

    it('should accept null description', () => {
      expect(service.validateDescription(null)).toBe(true);
    });

    it('should reject description over 5000 characters', () => {
      const longDesc = 'a'.repeat(5001);
      expect(() => service.validateDescription(longDesc)).toThrow('5000 characters or less');
    });
  });

  describe('clearCache', () => {
    it('should clear all caches when no projectId provided', () => {
      service.cache.set('PLN/1', { id: '1' });
      service.cache.set('PMC/2', { id: '2' });
      service.projectCache.set('PLN', []);

      service.clearCache();

      expect(service.cache.size).toBe(0);
      expect(service.projectCache.size).toBe(0);
    });

    it('should clear only specific project cache', () => {
      service.cache.set('PLN/1', { id: '1' });
      service.cache.set('PMC/2', { id: '2' });
      service.projectCache.set('PLN', []);
      service.projectCache.set('PMC', []);

      service.clearCache('PLN');

      expect(service.cache.size).toBe(1);
      expect(service.cache.has('PMC/2')).toBe(true);
      expect(service.projectCache.has('PLN')).toBe(false);
      expect(service.projectCache.has('PMC')).toBe(true);
    });
  });
});

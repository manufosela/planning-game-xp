/**
 * Tests for Plan Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Plan Service unit tests', () => {
  class MockPlanService {
    constructor() {
      this.cache = new Map();
      this.projectCache = new Map();
    }

    _getCacheKey(projectId, planId) {
      return `${projectId}/${planId}`;
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

    sortPlans(plans) {
      return [...plans].sort((a, b) => {
        const order = { draft: 0, accepted: 1 };
        const sa = order[a.status] ?? 99;
        const sb = order[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
    }

    convertAIPlan(generatedPlan, context) {
      return {
        title: generatedPlan.title || '',
        objective: generatedPlan.objective || '',
        status: 'draft',
        phases: (generatedPlan.phases || []).map(p => ({
          name: p.name || '',
          description: p.description || '',
          tasks: p.tasks || [],
          epicIds: [],
          taskIds: [],
          status: 'pending'
        })),
        _aiContext: context
      };
    }
  }

  let service;

  beforeEach(() => {
    service = new MockPlanService();
  });

  describe('_getCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = service._getCacheKey('PLN', 'plan_001');
      expect(key).toBe('PLN/plan_001');
    });
  });

  describe('clearCache', () => {
    it('should clear all caches when no projectId provided', () => {
      service.cache.set('PLN/1', { _id: '1' });
      service.cache.set('PMC/2', { _id: '2' });
      service.projectCache.set('PLN', []);

      service.clearCache();

      expect(service.cache.size).toBe(0);
      expect(service.projectCache.size).toBe(0);
    });

    it('should clear only specific project cache', () => {
      service.cache.set('PLN/1', { _id: '1' });
      service.cache.set('PMC/2', { _id: '2' });
      service.projectCache.set('PLN', []);
      service.projectCache.set('PMC', []);

      service.clearCache('PLN');

      expect(service.cache.size).toBe(1);
      expect(service.cache.has('PMC/2')).toBe(true);
      expect(service.projectCache.has('PLN')).toBe(false);
      expect(service.projectCache.has('PMC')).toBe(true);
    });
  });

  describe('sortPlans', () => {
    it('should sort drafts before accepted', () => {
      const plans = [
        { _id: '1', status: 'accepted', updatedAt: '2026-01-01' },
        { _id: '2', status: 'draft', updatedAt: '2026-01-01' }
      ];
      const sorted = service.sortPlans(plans);
      expect(sorted[0].status).toBe('draft');
      expect(sorted[1].status).toBe('accepted');
    });

    it('should sort by updatedAt within same status', () => {
      const plans = [
        { _id: '1', status: 'draft', updatedAt: '2026-01-01' },
        { _id: '2', status: 'draft', updatedAt: '2026-02-01' }
      ];
      const sorted = service.sortPlans(plans);
      expect(sorted[0]._id).toBe('2');
      expect(sorted[1]._id).toBe('1');
    });

    it('should handle empty array', () => {
      const sorted = service.sortPlans([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('convertAIPlan', () => {
    it('should convert AI response to internal format', () => {
      const aiPlan = {
        title: 'Test Plan',
        objective: 'Test objective',
        phases: [
          { name: 'Phase 1', description: 'Desc 1', tasks: [{ title: 'Task 1' }] }
        ]
      };
      const result = service.convertAIPlan(aiPlan, 'test context');

      expect(result.title).toBe('Test Plan');
      expect(result.objective).toBe('Test objective');
      expect(result.status).toBe('draft');
      expect(result._aiContext).toBe('test context');
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].name).toBe('Phase 1');
      expect(result.phases[0].epicIds).toEqual([]);
      expect(result.phases[0].taskIds).toEqual([]);
      expect(result.phases[0].status).toBe('pending');
      expect(result.phases[0].tasks).toHaveLength(1);
    });

    it('should handle missing fields', () => {
      const result = service.convertAIPlan({}, 'context');

      expect(result.title).toBe('');
      expect(result.objective).toBe('');
      expect(result.phases).toEqual([]);
    });

    it('should handle null phases', () => {
      const result = service.convertAIPlan({ phases: null }, 'context');
      expect(result.phases).toEqual([]);
    });
  });
});

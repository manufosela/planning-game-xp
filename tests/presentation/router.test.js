/**
 * Tests for the client-side SPA router.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { matchRoute, parseParams, ROUTES, currentRoute, navigate } from '../../src/presentation/router.js';

describe('presentation/router', () => {
  describe('ROUTES', () => {
    it('exports an array of route definitions', () => {
      expect(Array.isArray(ROUTES)).toBe(true);
      expect(ROUTES.length).toBeGreaterThan(0);
    });

    it('each route has a name and pattern', () => {
      for (const route of ROUTES) {
        expect(route).toHaveProperty('name');
        expect(route).toHaveProperty('pattern');
      }
    });
  });

  describe('matchRoute', () => {
    it('matches /projects', () => {
      const match = matchRoute('/projects');
      expect(match).not.toBeNull();
      expect(match.name).toBe('projects');
    });

    it('matches /project/:id', () => {
      const match = matchRoute('/project/PLN');
      expect(match).not.toBeNull();
      expect(match.name).toBe('project');
      expect(match.params.id).toBe('PLN');
    });

    it('matches /dashboard', () => {
      const match = matchRoute('/dashboard');
      expect(match).not.toBeNull();
      expect(match.name).toBe('dashboard');
    });

    it('matches /wip', () => {
      const match = matchRoute('/wip');
      expect(match).not.toBeNull();
      expect(match.name).toBe('wip');
    });

    it('matches /admin', () => {
      const match = matchRoute('/admin');
      expect(match).not.toBeNull();
      expect(match.name).toBe('admin');
    });

    it('matches /login', () => {
      const match = matchRoute('/login');
      expect(match).not.toBeNull();
      expect(match.name).toBe('login');
    });

    it('returns null for unknown routes', () => {
      const match = matchRoute('/unknown/path');
      expect(match).toBeNull();
    });

    it('handles trailing slashes', () => {
      const match = matchRoute('/projects/');
      expect(match).not.toBeNull();
      expect(match.name).toBe('projects');
    });
  });

  describe('parseParams', () => {
    it('extracts named params from pattern', () => {
      const params = parseParams('/project/:id', '/project/PLN');
      expect(params).toEqual({ id: 'PLN' });
    });

    it('returns empty object for static routes', () => {
      const params = parseParams('/dashboard', '/dashboard');
      expect(params).toEqual({});
    });
  });

  describe('currentRoute signal', () => {
    it('exports a signal with route state', () => {
      expect(currentRoute).toBeDefined();
      expect(currentRoute.value).toHaveProperty('name');
      expect(currentRoute.value).toHaveProperty('params');
      expect(currentRoute.value).toHaveProperty('query');
    });
  });

  describe('navigate function', () => {
    it('is exported as a function', () => {
      expect(typeof navigate).toBe('function');
    });
  });

  describe('query string parsing', () => {
    it('extracts query params from path', () => {
      const match = matchRoute('/project/PLN?card=TSK-0001');
      expect(match).not.toBeNull();
      expect(match.name).toBe('project');
      expect(match.params.id).toBe('PLN');
      expect(match.query.card).toBe('TSK-0001');
    });

    it('handles multiple query params', () => {
      const match = matchRoute('/project/PLN?card=TSK-0001&view=board');
      expect(match).not.toBeNull();
      expect(match.query.card).toBe('TSK-0001');
      expect(match.query.view).toBe('board');
    });

    it('handles no query params', () => {
      const match = matchRoute('/projects');
      expect(match.query).toEqual({});
    });
  });
});

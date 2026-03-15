/**
 * Integration test: router integrates with presentation layer.
 * Verifies navigate() updates currentRoute signal, route params are extracted,
 * and query params work for deep linking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { navigate, currentRoute, matchRoute, ROUTES } from '../../src/presentation/router.js';

describe('integration: router ↔ navigation', () => {
  beforeEach(() => {
    // Reset currentRoute to default state
    currentRoute.set({
      name: 'projects',
      params: {},
      query: {},
      path: '/projects',
    });
  });

  describe('navigate() updates currentRoute signal', () => {
    it('navigating to /dashboard updates currentRoute', () => {
      navigate('/dashboard');

      expect(currentRoute.value.name).toBe('dashboard');
      expect(currentRoute.value.path).toBe('/dashboard');
      expect(currentRoute.value.params).toEqual({});
    });

    it('navigating to /project/:id updates params', () => {
      navigate('/project/PLN');

      expect(currentRoute.value.name).toBe('project');
      expect(currentRoute.value.params).toEqual({ id: 'PLN' });
      expect(currentRoute.value.path).toBe('/project/PLN');
    });

    it('navigating to /login updates route', () => {
      navigate('/login');

      expect(currentRoute.value.name).toBe('login');
    });

    it('navigating to /wip updates route', () => {
      navigate('/wip');

      expect(currentRoute.value.name).toBe('wip');
    });

    it('navigating to /admin updates route', () => {
      navigate('/admin');

      expect(currentRoute.value.name).toBe('admin');
    });

    it('navigating to unknown route does NOT update currentRoute', () => {
      navigate('/dashboard');
      navigate('/nonexistent/path');

      // Should still be dashboard since /nonexistent/path doesn't match
      expect(currentRoute.value.name).toBe('dashboard');
    });

    it('sequential navigation updates signal each time', () => {
      navigate('/projects');
      expect(currentRoute.value.name).toBe('projects');

      navigate('/project/PLN');
      expect(currentRoute.value.name).toBe('project');
      expect(currentRoute.value.params.id).toBe('PLN');

      navigate('/dashboard');
      expect(currentRoute.value.name).toBe('dashboard');
    });
  });

  describe('route params extracted correctly for /project/:id', () => {
    it('extracts project ID from path', () => {
      const match = matchRoute('/project/EX2');

      expect(match).not.toBeNull();
      expect(match.name).toBe('project');
      expect(match.params.id).toBe('EX2');
    });

    it('handles alphanumeric IDs', () => {
      const match = matchRoute('/project/PLN-V2');

      expect(match).not.toBeNull();
      expect(match.params.id).toBe('PLN-V2');
    });

    it('handles numeric IDs', () => {
      const match = matchRoute('/project/12345');

      expect(match).not.toBeNull();
      expect(match.params.id).toBe('12345');
    });
  });

  describe('query params extracted for ?card=X', () => {
    it('extracts card query param', () => {
      const match = matchRoute('/project/PLN?card=TSK-0001');

      expect(match).not.toBeNull();
      expect(match.query.card).toBe('TSK-0001');
    });

    it('navigate with query params updates signal', () => {
      navigate('/project/PLN?card=TSK-0001&view=board');

      expect(currentRoute.value.name).toBe('project');
      expect(currentRoute.value.params.id).toBe('PLN');
      expect(currentRoute.value.query.card).toBe('TSK-0001');
      expect(currentRoute.value.query.view).toBe('board');
    });

    it('handles encoded query values', () => {
      const match = matchRoute('/project/PLN?filter=To%20Do');

      expect(match.query.filter).toBe('To Do');
    });

    it('handles empty query string', () => {
      const match = matchRoute('/project/PLN');

      expect(match.query).toEqual({});
    });

    it('handles trailing question mark with no params', () => {
      const match = matchRoute('/project/PLN?');

      expect(match).not.toBeNull();
      expect(match.query).toEqual({});
    });
  });

  describe('all defined routes are navigable', () => {
    const routeTestCases = ROUTES.map((route) => {
      const path = route.pattern.replace(':id', 'TEST-ID');
      return [route.name, path];
    });

    it.each(routeTestCases)('route "%s" matches path %s', (name, path) => {
      const match = matchRoute(path);
      expect(match).not.toBeNull();
      expect(match.name).toBe(name);
    });
  });
});

/**
 * Coverage gap tests: presentation layer exports.
 * Verifies all exports from src/presentation/index.js are defined and functional.
 */

import { describe, it, expect } from 'vitest';
import {
  currentRoute, navigate, matchRoute, parseParams, initRouter, ROUTES,
  PgApp, ROUTE_COMPONENTS,
  PgCommand, fuzzyMatch, DEFAULT_ACTIONS,
  registerShortcuts, unregisterShortcuts, SHORTCUTS, isInputFocused,
} from '../../src/presentation/index.js';

describe('coverage: presentation exports', () => {
  describe('router exports', () => {
    it('currentRoute is a signal with route state', () => {
      expect(currentRoute).toBeDefined();
      const val = currentRoute.value;
      expect(val).toHaveProperty('name');
      expect(val).toHaveProperty('params');
      expect(val).toHaveProperty('query');
      expect(val).toHaveProperty('path');
    });

    it('navigate is a function', () => {
      expect(typeof navigate).toBe('function');
    });

    it('matchRoute is a function', () => {
      expect(typeof matchRoute).toBe('function');
    });

    it('matchRoute returns correct structure', () => {
      const result = matchRoute('/projects');
      expect(result).toHaveProperty('name', 'projects');
      expect(result).toHaveProperty('params');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('path');
    });

    it('parseParams is a function', () => {
      expect(typeof parseParams).toBe('function');
    });

    it('parseParams extracts params from pattern', () => {
      expect(parseParams('/project/:id', '/project/ABC')).toEqual({ id: 'ABC' });
    });

    it('initRouter is a function', () => {
      expect(typeof initRouter).toBe('function');
    });

    it('ROUTES is an array with route definitions', () => {
      expect(Array.isArray(ROUTES)).toBe(true);
      expect(ROUTES.length).toBeGreaterThan(0);
      for (const route of ROUTES) {
        expect(route).toHaveProperty('name');
        expect(route).toHaveProperty('pattern');
        expect(typeof route.name).toBe('string');
        expect(typeof route.pattern).toBe('string');
      }
    });

    it('ROUTES includes expected route names', () => {
      const names = ROUTES.map((r) => r.name);
      expect(names).toContain('projects');
      expect(names).toContain('project');
      expect(names).toContain('dashboard');
      expect(names).toContain('login');
    });
  });

  describe('PgApp exports', () => {
    it('PgApp is defined (Lit component class)', () => {
      expect(PgApp).toBeDefined();
    });

    it('ROUTE_COMPONENTS is an object mapping route names to component tags', () => {
      expect(ROUTE_COMPONENTS).toBeDefined();
      expect(typeof ROUTE_COMPONENTS).toBe('object');
    });
  });

  describe('PgCommand exports', () => {
    it('PgCommand is defined (Lit component class)', () => {
      expect(PgCommand).toBeDefined();
    });

    it('fuzzyMatch is a function', () => {
      expect(typeof fuzzyMatch).toBe('function');
    });

    it('fuzzyMatch matches correctly', () => {
      expect(fuzzyMatch('tsk', 'task')).toBe(true);
      expect(fuzzyMatch('xyz', 'task')).toBe(false);
    });

    it('fuzzyMatch is case-insensitive', () => {
      expect(fuzzyMatch('TSK', 'task')).toBe(true);
      expect(fuzzyMatch('tsk', 'TASK')).toBe(true);
    });

    it('fuzzyMatch handles empty query', () => {
      expect(fuzzyMatch('', 'anything')).toBe(true);
    });

    it('DEFAULT_ACTIONS is an array', () => {
      expect(Array.isArray(DEFAULT_ACTIONS)).toBe(true);
    });

    it('DEFAULT_ACTIONS entries have id and label', () => {
      if (DEFAULT_ACTIONS.length > 0) {
        const first = DEFAULT_ACTIONS[0];
        expect(first).toHaveProperty('id');
        expect(first).toHaveProperty('label');
      }
    });
  });

  describe('keyboard shortcuts exports', () => {
    it('registerShortcuts is a function', () => {
      expect(typeof registerShortcuts).toBe('function');
    });

    it('unregisterShortcuts is a function', () => {
      expect(typeof unregisterShortcuts).toBe('function');
    });

    it('SHORTCUTS is an object with shortcut definitions', () => {
      expect(SHORTCUTS).toBeDefined();
      expect(typeof SHORTCUTS).toBe('object');
    });

    it('SHORTCUTS has expected keys', () => {
      expect(SHORTCUTS).toHaveProperty('Meta+k');
      expect(SHORTCUTS).toHaveProperty('c');
      expect(SHORTCUTS).toHaveProperty('Escape');
      expect(SHORTCUTS).toHaveProperty('/');
    });

    it('each shortcut has id, key, and description', () => {
      for (const [, def] of Object.entries(SHORTCUTS)) {
        expect(def).toHaveProperty('id');
        expect(def).toHaveProperty('key');
        expect(def).toHaveProperty('description');
        expect(typeof def.id).toBe('string');
        expect(typeof def.key).toBe('string');
        expect(typeof def.description).toBe('string');
      }
    });

    it('Meta+k shortcut has meta flag set', () => {
      expect(SHORTCUTS['Meta+k'].meta).toBe(true);
    });

    it('isInputFocused is a function', () => {
      expect(typeof isInputFocused).toBe('function');
    });

    it('isInputFocused returns false in Node environment (no document)', () => {
      expect(isInputFocused()).toBe(false);
    });
  });
});

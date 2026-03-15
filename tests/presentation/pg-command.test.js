/**
 * Tests for the command palette module.
 */

import { describe, it, expect } from 'vitest';
import { fuzzyMatch, DEFAULT_ACTIONS } from '../../src/presentation/pg-command.js';

describe('presentation/pg-command', () => {
  describe('fuzzyMatch', () => {
    it('matches exact substring', () => {
      expect(fuzzyMatch('card', 'Search cards')).toBe(true);
    });

    it('matches case-insensitively', () => {
      expect(fuzzyMatch('CARD', 'Search cards')).toBe(true);
    });

    it('matches fuzzy characters in order', () => {
      expect(fuzzyMatch('sc', 'Search cards')).toBe(true);
    });

    it('returns false for non-matching query', () => {
      expect(fuzzyMatch('xyz', 'Search cards')).toBe(false);
    });

    it('returns true for empty query', () => {
      expect(fuzzyMatch('', 'Search cards')).toBe(true);
    });

    it('handles special characters', () => {
      expect(fuzzyMatch('proj', 'Switch project')).toBe(true);
    });
  });

  describe('DEFAULT_ACTIONS', () => {
    it('exports an array of actions', () => {
      expect(Array.isArray(DEFAULT_ACTIONS)).toBe(true);
      expect(DEFAULT_ACTIONS.length).toBeGreaterThan(0);
    });

    it('each action has id, label, and category', () => {
      for (const action of DEFAULT_ACTIONS) {
        expect(action).toHaveProperty('id');
        expect(action).toHaveProperty('label');
        expect(action).toHaveProperty('category');
      }
    });

    it('includes search cards action', () => {
      const found = DEFAULT_ACTIONS.find((a) => a.id === 'search-cards');
      expect(found).toBeDefined();
    });

    it('includes switch project action', () => {
      const found = DEFAULT_ACTIONS.find((a) => a.id === 'switch-project');
      expect(found).toBeDefined();
    });

    it('includes create card action', () => {
      const found = DEFAULT_ACTIONS.find((a) => a.id === 'create-card');
      expect(found).toBeDefined();
    });

    it('includes jump to card action', () => {
      const found = DEFAULT_ACTIONS.find((a) => a.id === 'jump-to-card');
      expect(found).toBeDefined();
    });

    it('includes change view action', () => {
      const found = DEFAULT_ACTIONS.find((a) => a.id === 'change-view');
      expect(found).toBeDefined();
    });
  });
});

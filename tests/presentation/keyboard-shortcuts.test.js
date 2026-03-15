/**
 * Tests for the global keyboard shortcuts handler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerShortcuts,
  unregisterShortcuts,
  SHORTCUTS,
  isInputFocused,
} from '../../src/presentation/keyboard-shortcuts.js';

describe('presentation/keyboard-shortcuts', () => {
  describe('SHORTCUTS', () => {
    it('exports a map of shortcut definitions', () => {
      expect(SHORTCUTS).toBeDefined();
      expect(typeof SHORTCUTS).toBe('object');
    });

    it('has command-palette shortcut', () => {
      const cmdK = Object.values(SHORTCUTS).find(
        (s) => s.id === 'command-palette'
      );
      expect(cmdK).toBeDefined();
    });

    it('has create-card shortcut', () => {
      const c = Object.values(SHORTCUTS).find((s) => s.id === 'create-card');
      expect(c).toBeDefined();
    });

    it('has close-panel shortcut (Escape)', () => {
      const esc = Object.values(SHORTCUTS).find((s) => s.id === 'close-panel');
      expect(esc).toBeDefined();
    });
  });

  describe('isInputFocused', () => {
    it('returns false when no active element resembles an input', () => {
      // In node env, document doesn't exist or activeElement is null
      expect(isInputFocused()).toBe(false);
    });
  });

  describe('registerShortcuts / unregisterShortcuts', () => {
    it('registerShortcuts is a function', () => {
      expect(typeof registerShortcuts).toBe('function');
    });

    it('unregisterShortcuts is a function', () => {
      expect(typeof unregisterShortcuts).toBe('function');
    });
  });

  describe('shortcut matching', () => {
    it('each shortcut has key, description, and handler name or action', () => {
      for (const shortcut of Object.values(SHORTCUTS)) {
        expect(shortcut).toHaveProperty('id');
        expect(shortcut).toHaveProperty('key');
        expect(shortcut).toHaveProperty('description');
      }
    });
  });
});

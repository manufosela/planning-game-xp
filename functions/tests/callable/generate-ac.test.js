/**
 * Tests for the generateAC callable function.
 * Verifies: prompt building, placeholder generation.
 */

import { describe, it, expect } from 'vitest';
import {
  buildACPrompt,
  generatePlaceholderAC,
} from '../../src/callable/generate-ac.js';

// ---------------------------------------------------------------------------
// buildACPrompt
// ---------------------------------------------------------------------------

describe('buildACPrompt', () => {
  it('builds prompt with title and description', () => {
    const prompt = buildACPrompt('User login', 'Allow users to log in with email');
    expect(prompt).toContain('User login');
    expect(prompt).toContain('Allow users to log in with email');
    expect(prompt).toContain('Given/When/Then');
    expect(prompt).toContain('given');
    expect(prompt).toContain('when');
    expect(prompt).toContain('then');
  });

  it('requests JSON array format', () => {
    const prompt = buildACPrompt('Story', 'Desc');
    expect(prompt).toContain('JSON array');
  });
});

// ---------------------------------------------------------------------------
// generatePlaceholderAC
// ---------------------------------------------------------------------------

describe('generatePlaceholderAC', () => {
  it('returns an array of criteria', () => {
    const result = generatePlaceholderAC('User login');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('each criterion has given/when/then fields', () => {
    const result = generatePlaceholderAC('User login');
    for (const criterion of result) {
      expect(criterion).toHaveProperty('given');
      expect(criterion).toHaveProperty('when');
      expect(criterion).toHaveProperty('then');
      expect(typeof criterion.given).toBe('string');
      expect(typeof criterion.when).toBe('string');
      expect(typeof criterion.then).toBe('string');
    }
  });

  it('includes the title in the criteria', () => {
    const result = generatePlaceholderAC('User login');
    const allText = result.map((c) => `${c.given} ${c.when} ${c.then}`).join(' ');
    expect(allText).toContain('User login');
  });
});

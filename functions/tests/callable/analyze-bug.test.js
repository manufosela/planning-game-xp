/**
 * Tests for the analyzeBug callable function.
 * Verifies: prompt building, placeholder generation, input validation.
 */

import { describe, it, expect } from 'vitest';
import {
  buildBugAnalysisPrompt,
  generatePlaceholderAnalysis,
} from '../../src/callable/analyze-bug.js';

// ---------------------------------------------------------------------------
// buildBugAnalysisPrompt
// ---------------------------------------------------------------------------

describe('buildBugAnalysisPrompt', () => {
  it('builds prompt with title and description', () => {
    const prompt = buildBugAnalysisPrompt('Login fails', 'Users see 500 error');
    expect(prompt).toContain('Login fails');
    expect(prompt).toContain('Users see 500 error');
    expect(prompt).toContain('rootCause');
    expect(prompt).toContain('suggestedFix');
    expect(prompt).toContain('severity');
  });

  it('includes context when provided', () => {
    const prompt = buildBugAnalysisPrompt('Bug', 'Desc', 'auth.js line 42');
    expect(prompt).toContain('auth.js line 42');
    expect(prompt).toContain('Related code context');
  });

  it('omits context section when not provided', () => {
    const prompt = buildBugAnalysisPrompt('Bug', 'Desc');
    expect(prompt).not.toContain('Related code context');
  });
});

// ---------------------------------------------------------------------------
// generatePlaceholderAnalysis
// ---------------------------------------------------------------------------

describe('generatePlaceholderAnalysis', () => {
  it('returns object with required fields', () => {
    const result = generatePlaceholderAnalysis('Login fails');
    expect(result).toHaveProperty('rootCause');
    expect(result).toHaveProperty('suggestedFix');
    expect(result).toHaveProperty('severity');
  });

  it('includes the title in the rootCause', () => {
    const result = generatePlaceholderAnalysis('Login fails');
    expect(result.rootCause).toContain('Login fails');
  });

  it('returns medium severity by default', () => {
    const result = generatePlaceholderAnalysis('Any bug');
    expect(result.severity).toBe('medium');
  });
});

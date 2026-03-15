/**
 * Tests for the importCards callable function.
 * Verifies: card validation including domain status validation.
 */

import { describe, it, expect } from 'vitest';
import { validateImportCard, getDefaultStatusForType } from '../../src/callable/import-cards.js';

// ---------------------------------------------------------------------------
// validateImportCard
// ---------------------------------------------------------------------------

describe('validateImportCard', () => {
  it('accepts a valid task card', () => {
    const result = validateImportCard({ title: 'Test task', type: 'task' });
    expect(result.valid).toBe(true);
  });

  it('accepts a valid bug card', () => {
    const result = validateImportCard({ title: 'Bug report', type: 'bug' });
    expect(result.valid).toBe(true);
  });

  it('accepts all valid card types', () => {
    const types = ['task', 'bug', 'epic', 'sprint', 'proposal', 'qa'];
    for (const type of types) {
      const result = validateImportCard({ title: 'Test', type });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects missing title', () => {
    const result = validateImportCard({ type: 'task' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/title/i);
  });

  it('rejects empty title', () => {
    const result = validateImportCard({ title: '   ', type: 'task' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/title/i);
  });

  it('rejects non-string title', () => {
    const result = validateImportCard({ title: 42, type: 'task' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/title/i);
  });

  it('rejects invalid type', () => {
    const result = validateImportCard({ title: 'Test', type: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it('rejects missing type', () => {
    const result = validateImportCard({ title: 'Test' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/type/i);
  });

  // Domain status validation
  it('accepts valid status for task type', () => {
    const result = validateImportCard({ title: 'Test', type: 'task', status: 'To Do' });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid status for task type', () => {
    const result = validateImportCard({ title: 'Test', type: 'task', status: 'InvalidStatus' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/status/i);
  });

  it('accepts valid status for bug type', () => {
    const result = validateImportCard({ title: 'Test', type: 'bug', status: 'Created' });
    expect(result.valid).toBe(true);
  });

  it('rejects bug status on task type', () => {
    const result = validateImportCard({ title: 'Test', type: 'task', status: 'Created' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/status/i);
  });

  it('accepts card without status (defaults later)', () => {
    const result = validateImportCard({ title: 'Test', type: 'task' });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getDefaultStatusForType
// ---------------------------------------------------------------------------

describe('getDefaultStatusForType', () => {
  it('returns "To Do" for task type', () => {
    expect(getDefaultStatusForType('task')).toBe('To Do');
  });

  it('returns "Created" for bug type', () => {
    expect(getDefaultStatusForType('bug')).toBe('Created');
  });

  it('returns "Active" for epic type', () => {
    expect(getDefaultStatusForType('epic')).toBe('Active');
  });

  it('returns "Active" for sprint type', () => {
    expect(getDefaultStatusForType('sprint')).toBe('Active');
  });

  it('returns "Pending" for proposal type', () => {
    expect(getDefaultStatusForType('proposal')).toBe('Pending');
  });

  it('returns "Pending" for qa type', () => {
    expect(getDefaultStatusForType('qa')).toBe('Pending');
  });

  it('returns "To Do" for unknown type as fallback', () => {
    expect(getDefaultStatusForType('unknown')).toBe('To Do');
  });
});

// ---------------------------------------------------------------------------
// Per-type status validation (domain integration)
// ---------------------------------------------------------------------------

describe('validateImportCard — per-type status validation', () => {
  it('accepts all valid task statuses', () => {
    const validStatuses = ['To Do', 'In Progress', 'To Validate', 'Done', 'Done&Validated', 'Blocked', 'Reopened'];
    for (const status of validStatuses) {
      const result = validateImportCard({ title: 'Test', type: 'task', status });
      expect(result.valid, `Expected "${status}" to be valid for task`).toBe(true);
    }
  });

  it('accepts all valid bug statuses', () => {
    const validStatuses = ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed'];
    for (const status of validStatuses) {
      const result = validateImportCard({ title: 'Test', type: 'bug', status });
      expect(result.valid, `Expected "${status}" to be valid for bug`).toBe(true);
    }
  });

  it('accepts all valid epic statuses', () => {
    const validStatuses = ['Active', 'Completed', 'Archived'];
    for (const status of validStatuses) {
      const result = validateImportCard({ title: 'Test', type: 'epic', status });
      expect(result.valid, `Expected "${status}" to be valid for epic`).toBe(true);
    }
  });

  it('rejects epic status on bug type', () => {
    const result = validateImportCard({ title: 'Test', type: 'bug', status: 'Active' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/status/i);
  });

  it('rejects task status on epic type', () => {
    const result = validateImportCard({ title: 'Test', type: 'epic', status: 'In Progress' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/status/i);
  });

  it('accepts proposal with valid Pending status', () => {
    const result = validateImportCard({ title: 'Test', type: 'proposal', status: 'Pending' });
    expect(result.valid).toBe(true);
  });

  it('rejects proposal with invalid status', () => {
    const result = validateImportCard({ title: 'Test', type: 'proposal', status: 'To Do' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/status/i);
  });

  it('accepts qa with valid Passed status', () => {
    const result = validateImportCard({ title: 'Test', type: 'qa', status: 'Passed' });
    expect(result.valid).toBe(true);
  });
});

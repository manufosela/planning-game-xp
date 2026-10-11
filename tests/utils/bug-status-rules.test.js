/**
 * PLN-TSK-0365: bug workflow Created → In Progress → Fixed → Done&Validated,
 * plus Rejected for reports that are not bugs.
 */
import { describe, it, expect } from 'vitest';
import { getMissingBugFields } from '@/utils/bug-status-rules.js';

const COMPLETE = {
  developer: 'dev_001',
  startDate: '2026-10-01T09:00:00',
  endDate: '2026-10-02T09:00:00',
  priority: 'User Experience Issue',
  description: 'Steps to reproduce'
};

describe('getMissingBugFields (PLN-TSK-0365)', () => {
  it('should require developer and startDate to start working on a bug', () => {
    expect(getMissingBugFields({ previousStatus: 'Created', newStatus: 'In Progress', card: {} }))
      .toEqual(['developer', 'startDate']);
  });

  it('should require dates, developer, priority and description to fix a bug', () => {
    expect(getMissingBugFields({ previousStatus: 'In Progress', newStatus: 'Fixed', card: { developer: 'dev_001' } }))
      .toEqual(['startDate', 'endDate', 'priority', 'description']);
  });

  it('should not ask again when moving from Fixed to Done&Validated', () => {
    expect(getMissingBugFields({ previousStatus: 'Fixed', newStatus: 'Done&Validated', card: {} })).toEqual([]);
  });

  it('should only require a reason to reject a bug', () => {
    expect(getMissingBugFields({ previousStatus: 'Created', newStatus: 'Rejected', card: { rejectionReason: '  ' } }))
      .toEqual(['rejectionReason']);
    expect(getMissingBugFields({ previousStatus: 'Created', newStatus: 'Rejected', card: { rejectionReason: 'Duplicate' } }))
      .toEqual([]);
  });

  it('should return nothing when all fields are present', () => {
    expect(getMissingBugFields({ previousStatus: 'In Progress', newStatus: 'Fixed', card: COMPLETE })).toEqual([]);
  });

  it('should require nothing to go back to Created', () => {
    expect(getMissingBugFields({ previousStatus: 'In Progress', newStatus: 'Created', card: {} })).toEqual([]);
  });
});

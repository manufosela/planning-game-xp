/**
 * CI test: verifies that app-constants.js (frontend ESM) stays aligned
 * with shared/constants.js (ESM single source of truth).
 * Also verifies shared/index.cjs (CJS wrapper) alignment.
 * Also verifies priority-utils.js alignment with shared/priority.js.
 */
import { describe, it, expect } from 'vitest';

const shared = await import('../../shared/constants.js');
const { APP_CONSTANTS } = await import('../../public/js/constants/app-constants.js');
const cjs = await import('../../shared/index.cjs');
const sharedPriority = await import('../../shared/priority.js');
const { calculatePriorityRank, getAllPriorityRanks } = await import('../../public/js/utils/priority-utils.js');

describe('shared/constants.js ↔ app-constants.js alignment', () => {
  it('BUG_STATUS_ORDER should match VALID_BUG_STATUSES', () => {
    expect(APP_CONSTANTS.BUG_STATUS_ORDER).toEqual(shared.VALID_BUG_STATUSES);
  });

  it('TASK_STATUS_ORDER should match VALID_TASK_STATUSES', () => {
    expect(APP_CONSTANTS.TASK_STATUS_ORDER).toEqual(shared.VALID_TASK_STATUSES);
  });

  it('BUG_PRIORITY_ORDER should match VALID_BUG_PRIORITIES', () => {
    expect(APP_CONSTANTS.BUG_PRIORITY_ORDER).toEqual(shared.VALID_BUG_PRIORITIES);
  });

  it('KANBAN_COLORS should have an entry for every bug status', () => {
    for (const status of shared.VALID_BUG_STATUSES) {
      expect(APP_CONSTANTS.KANBAN_COLORS).toHaveProperty(status);
    }
  });

  it('KANBAN_COLORS should NOT have entries for removed bug statuses', () => {
    const removed = ['Triaged', 'Assigned', 'In Testing', 'Verified', 'Closed'];
    for (const status of removed) {
      expect(APP_CONSTANTS.KANBAN_COLORS).not.toHaveProperty(status);
    }
  });

  it('BUG_COMPLETED_STATUSES should be a subset of VALID_BUG_STATUSES (lowercase)', () => {
    const lowerStatuses = shared.VALID_BUG_STATUSES.map(s => s.toLowerCase());
    for (const cs of APP_CONSTANTS.BUG_COMPLETED_STATUSES) {
      expect(lowerStatuses).toContain(cs);
    }
  });

  it('shared BUG_COMPLETED_STATUSES should match app-constants', () => {
    expect(shared.BUG_COMPLETED_STATUSES).toEqual(APP_CONSTANTS.BUG_COMPLETED_STATUSES);
  });

  it('shared TASK_COMPLETED_STATUSES should match app-constants', () => {
    expect(shared.TASK_COMPLETED_STATUSES).toEqual(APP_CONSTANTS.TASK_COMPLETED_STATUSES);
  });

  it('shared PROPOSAL_COMPLETED_STATUSES should match app-constants', () => {
    expect(shared.PROPOSAL_COMPLETED_STATUSES).toEqual(APP_CONSTANTS.PROPOSAL_COMPLETED_STATUSES);
  });
});

describe('shared/index.cjs ↔ shared/constants.js alignment', () => {
  it('CJS VALID_BUG_STATUSES should match ESM', () => {
    expect(cjs.VALID_BUG_STATUSES).toEqual(shared.VALID_BUG_STATUSES);
  });

  it('CJS VALID_TASK_STATUSES should match ESM', () => {
    expect(cjs.VALID_TASK_STATUSES).toEqual(shared.VALID_TASK_STATUSES);
  });

  it('CJS VALID_BUG_PRIORITIES should match ESM', () => {
    expect(cjs.VALID_BUG_PRIORITIES).toEqual(shared.VALID_BUG_PRIORITIES);
  });

  it('CJS VALIDATOR_ONLY_STATUSES should match ESM', () => {
    expect(cjs.VALIDATOR_ONLY_STATUSES).toEqual(shared.VALIDATOR_ONLY_STATUSES);
  });

  it('CJS MCP_RESTRICTED_STATUSES should match ESM', () => {
    expect(cjs.MCP_RESTRICTED_STATUSES).toEqual(shared.MCP_RESTRICTED_STATUSES);
  });

  it('CJS REQUIRED_FIELDS_TO_LEAVE_TODO should match ESM', () => {
    expect(cjs.REQUIRED_FIELDS_TO_LEAVE_TODO).toEqual(shared.REQUIRED_FIELDS_TO_LEAVE_TODO);
  });

  it('CJS FRIENDLY_FIELD_NAMES should match ESM', () => {
    expect(cjs.FRIENDLY_FIELD_NAMES).toEqual(shared.FRIENDLY_FIELD_NAMES);
  });
});

describe('shared/priority.js ↔ priority-utils.js alignment', () => {
  it('calculatePriority should match calculatePriorityRank for all 1-5 combinations', () => {
    for (let b = 1; b <= 5; b++) {
      for (let d = 1; d <= 5; d++) {
        const fromShared = sharedPriority.calculatePriority(b, d, '1-5');
        const fromFrontend = calculatePriorityRank(b, d, '1-5');
        expect(fromFrontend).toBe(fromShared);
      }
    }
  });

  it('getAllPriorityRanks count should match shared PRIORITY_MAP_1_5 length', () => {
    expect(getAllPriorityRanks('1-5').length).toBe(sharedPriority.PRIORITY_MAP_1_5.length);
  });

  it('getAllPriorityRanks fibonacci count should match shared PRIORITY_MAP_FIBONACCI length', () => {
    expect(getAllPriorityRanks('fibonacci').length).toBe(sharedPriority.PRIORITY_MAP_FIBONACCI.length);
  });
});

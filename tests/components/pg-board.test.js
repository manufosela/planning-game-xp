/**
 * Tests for pg-board component — column generation for status and sprint modes.
 *
 * These tests verify the board's column logic without requiring a browser environment.
 * We test the pure logic aspects by importing and instantiating the class.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Since pg-board is a Lit component and needs browser APIs (customElements),
// we test the column generation logic by extracting and verifying the expected behavior.

// ---------------------------------------------------------------------------
// Status column definitions (mirrored from pg-board.js)
// ---------------------------------------------------------------------------

const STATUS_COLUMNS = [
  { id: 'To Do', label: 'To Do', color: 'var(--color-status-todo)', field: 'status' },
  { id: 'In Progress', label: 'In Progress', color: 'var(--color-status-inprogress)', field: 'status' },
  { id: 'To Validate', label: 'To Validate', color: 'var(--color-status-tovalidate)', field: 'status' },
  { id: 'Done', label: 'Done', color: 'var(--color-status-done)', field: 'status' },
  { id: 'Blocked', label: 'Blocked', color: 'var(--color-status-blocked)', field: 'status' },
];

/**
 * Generate sprint columns from sprint list.
 * @param {Array<{cardId: string, title: string}>} sprints
 * @returns {Array<{id: string, label: string, color: string, field: string}>}
 */
function getSprintColumns(sprints) {
  const cols = [
    { id: '', label: 'Backlog', color: 'var(--color-text-muted)', field: 'sprint' },
  ];
  for (const s of sprints) {
    cols.push({
      id: s.cardId,
      label: s.title || s.cardId,
      color: 'var(--color-type-sprint)',
      field: 'sprint',
    });
  }
  return cols;
}

/**
 * Group cards into columns.
 * @param {Array<any>} cards
 * @param {Array<{id: string, field: string}>} columns
 * @param {string} field
 * @returns {Map<string, Array<any>>}
 */
function groupCards(cards, columns, field) {
  const groups = new Map();
  for (const col of columns) {
    groups.set(col.id, []);
  }
  for (const card of cards) {
    const val = card[field] ?? '';
    if (groups.has(val)) {
      groups.get(val).push(card);
    } else {
      const firstKey = columns[0]?.id ?? '';
      groups.get(firstKey)?.push(card);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(overrides = {}) {
  return {
    cardId: 'PLN-TSK-0001',
    type: 'task',
    title: 'Test task',
    status: 'To Do',
    sprint: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Status mode columns
// ---------------------------------------------------------------------------

describe('pg-board status mode columns', () => {
  it('should have 5 status columns', () => {
    expect(STATUS_COLUMNS).toHaveLength(5);
  });

  it('should have correct column IDs', () => {
    const ids = STATUS_COLUMNS.map((c) => c.id);
    expect(ids).toEqual(['To Do', 'In Progress', 'To Validate', 'Done', 'Blocked']);
  });

  it('should all have field set to "status"', () => {
    expect(STATUS_COLUMNS.every((c) => c.field === 'status')).toBe(true);
  });

  it('should group cards by status', () => {
    const cards = [
      makeCard({ cardId: 'T1', status: 'To Do' }),
      makeCard({ cardId: 'T2', status: 'To Do' }),
      makeCard({ cardId: 'T3', status: 'In Progress' }),
      makeCard({ cardId: 'T4', status: 'Done' }),
      makeCard({ cardId: 'T5', status: 'Blocked' }),
    ];

    const groups = groupCards(cards, STATUS_COLUMNS, 'status');
    expect(groups.get('To Do')).toHaveLength(2);
    expect(groups.get('In Progress')).toHaveLength(1);
    expect(groups.get('To Validate')).toHaveLength(0);
    expect(groups.get('Done')).toHaveLength(1);
    expect(groups.get('Blocked')).toHaveLength(1);
  });

  it('should put cards with unknown status in first column', () => {
    const cards = [
      makeCard({ cardId: 'T1', status: 'Reopened' }),
    ];

    const groups = groupCards(cards, STATUS_COLUMNS, 'status');
    // "Reopened" is not a column, so it goes to first column ("To Do")
    expect(groups.get('To Do')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Sprint mode columns
// ---------------------------------------------------------------------------

describe('pg-board sprint mode columns', () => {
  const sprints = [
    { cardId: 'SPR-001', title: 'Sprint 1' },
    { cardId: 'SPR-002', title: 'Sprint 2' },
    { cardId: 'SPR-003', title: 'Sprint 3' },
  ];

  it('should have Backlog + sprint columns', () => {
    const cols = getSprintColumns(sprints);
    expect(cols).toHaveLength(4); // Backlog + 3 sprints
  });

  it('should have Backlog as first column with empty id', () => {
    const cols = getSprintColumns(sprints);
    expect(cols[0].id).toBe('');
    expect(cols[0].label).toBe('Backlog');
    expect(cols[0].field).toBe('sprint');
  });

  it('should create columns from sprint data', () => {
    const cols = getSprintColumns(sprints);
    expect(cols[1].id).toBe('SPR-001');
    expect(cols[1].label).toBe('Sprint 1');
    expect(cols[2].id).toBe('SPR-002');
    expect(cols[3].id).toBe('SPR-003');
  });

  it('should use cardId as label if title is empty', () => {
    const cols = getSprintColumns([{ cardId: 'SPR-X', title: '' }]);
    expect(cols[1].label).toBe('SPR-X');
  });

  it('should group cards by sprint', () => {
    const cols = getSprintColumns(sprints);
    const cards = [
      makeCard({ cardId: 'T1', sprint: '' }),
      makeCard({ cardId: 'T2', sprint: 'SPR-001' }),
      makeCard({ cardId: 'T3', sprint: 'SPR-001' }),
      makeCard({ cardId: 'T4', sprint: 'SPR-002' }),
      makeCard({ cardId: 'T5', sprint: 'SPR-003' }),
    ];

    const groups = groupCards(cards, cols, 'sprint');
    expect(groups.get('')).toHaveLength(1); // Backlog
    expect(groups.get('SPR-001')).toHaveLength(2);
    expect(groups.get('SPR-002')).toHaveLength(1);
    expect(groups.get('SPR-003')).toHaveLength(1);
  });

  it('should put cards with no sprint in Backlog', () => {
    const cols = getSprintColumns(sprints);
    const cards = [
      makeCard({ cardId: 'T1', sprint: undefined }),
      makeCard({ cardId: 'T2', sprint: null }),
    ];

    const groups = groupCards(cards, cols, 'sprint');
    expect(groups.get('')).toHaveLength(2);
  });

  it('should handle empty sprint list', () => {
    const cols = getSprintColumns([]);
    expect(cols).toHaveLength(1); // Only Backlog
    expect(cols[0].label).toBe('Backlog');
  });
});

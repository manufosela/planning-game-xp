/**
 * Regression tests for the shared TaskCard hydration helper.
 *
 * Root cause of PLN-BUG-0105 (PgBoard) and PLN-BUG-0115 (sprint-renderer):
 * renderers spread a raw RTDB snapshot onto a <task-card> element. Any
 * derived getter that also appears in the snapshot (notably `priority`,
 * computed from businessPoints/devPoints) throws `Cannot set property X
 * which has only a getter` and breaks the whole render loop.
 *
 * The helper must:
 *   - copy only the allowlisted fields
 *   - swallow assignment throws (getter-only props)
 *   - skip undefined values so a partial snapshot doesn't wipe defaults
 */
import { describe, it, expect } from 'vitest';
import {
  hydrateTaskCard,
  TASK_CARD_HYDRATE_FIELDS
} from '../../public/js/utils/task-card-hydrate.js';

function makeFakeCard() {
  const el = {};
  Object.defineProperty(el, 'priority', {
    get() { return 42; }
    // no setter — assignment must throw
  });
  return el;
}

describe('hydrateTaskCard', () => {
  it('copies allowlisted fields from snapshot to element', () => {
    const el = {};
    hydrateTaskCard(el, {
      cardId: 'PRJ-TSK-0001',
      title: 'Do the thing',
      status: 'To Do',
      devPoints: 3,
      businessPoints: 4
    });
    expect(el.cardId).toBe('PRJ-TSK-0001');
    expect(el.title).toBe('Do the thing');
    expect(el.status).toBe('To Do');
    expect(el.devPoints).toBe(3);
    expect(el.businessPoints).toBe(4);
  });

  it('does NOT copy fields that are not in the allowlist', () => {
    const el = {};
    hydrateTaskCard(el, {
      cardId: 'X',
      // Not in allowlist — must be ignored so the component stays in charge.
      priority: 12,
      randomInternalField: 'nope'
    });
    expect(el.cardId).toBe('X');
    expect(el.priority).toBeUndefined();
    expect(el.randomInternalField).toBeUndefined();
  });

  it('skips undefined values (partial snapshots do not wipe defaults)', () => {
    const el = { title: 'Existing default' };
    hydrateTaskCard(el, { cardId: 'X', title: undefined });
    expect(el.cardId).toBe('X');
    expect(el.title).toBe('Existing default');
  });

  it('does NOT throw when a snapshot brings a getter-only prop that is IN the allowlist', () => {
    // Simulate a snapshot that (wrongly) carries `businessPoints` when the
    // element defined it as getter-only. hydrate must swallow the throw.
    const el = {};
    Object.defineProperty(el, 'businessPoints', {
      get() { return 5; }
    });
    expect(() => hydrateTaskCard(el, { businessPoints: 99, cardId: 'X' })).not.toThrow();
    expect(el.cardId).toBe('X');
    // getter is preserved
    expect(el.businessPoints).toBe(5);
  });

  it('is a no-op for null/undefined snapshot or element', () => {
    expect(() => hydrateTaskCard(null, { cardId: 'X' })).not.toThrow();
    expect(() => hydrateTaskCard({}, null)).not.toThrow();
    expect(() => hydrateTaskCard({}, undefined)).not.toThrow();
    expect(() => hydrateTaskCard({}, 'not an object')).not.toThrow();
  });

  it('the allowlist keeps the fields TaskCard historically expected from a snapshot', () => {
    // A guard: if someone accidentally drops a field, tests catch it.
    const expected = [
      'cardId', 'title', 'status', 'devPoints', 'businessPoints',
      'developer', 'validator', 'epic', 'sprint',
      'startDate', 'endDate', 'commits',
      'taskCategory', 'completionNote'
    ];
    for (const f of expected) {
      expect(TASK_CARD_HYDRATE_FIELDS).toContain(f);
    }
    expect(TASK_CARD_HYDRATE_FIELDS).not.toContain('priority');
  });
});

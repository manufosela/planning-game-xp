/**
 * Tests for scripts/backfill-public-projects.js — the one-shot migration that
 * seeds /publicProjects/ from the existing public-flagged /projects/.
 *
 * Only the pure planner (planBackfill + isProjectPublic) is tested here; the
 * I/O wrapper (run) lives behind admin.initializeApp and is exercised manually.
 */
import { describe, it, expect } from 'vitest';
import { planBackfill, isProjectPublic } from '../../scripts/backfill-public-projects.js';

const NOW = '2026-06-04T10:00:00.000Z';

describe('isProjectPublic', () => {
  it('true when public flag is true', () => {
    expect(isProjectPublic({ public: true })).toBe(true);
  });

  it('true when publicToken is a non-empty string', () => {
    expect(isProjectPublic({ publicToken: 'tk-abc' })).toBe(true);
  });

  it('false when both flags are absent or falsy', () => {
    expect(isProjectPublic({})).toBe(false);
    expect(isProjectPublic({ public: false })).toBe(false);
    expect(isProjectPublic({ publicToken: '' })).toBe(false);
  });

  it('false on null/undefined', () => {
    expect(isProjectPublic(null)).toBe(false);
    expect(isProjectPublic(undefined)).toBe(false);
  });
});

describe('planBackfill', () => {
  it('writes whitelisted snapshots only for public projects', () => {
    const projects = {
      PubA: { public: true, name: 'A', description: 'desc A', abbreviation: 'PRA', developers: { x: true } },
      PubB: { publicToken: 'tk-1', name: 'B', frameworks: ['astro'] },
      Priv: { public: false, name: 'private' }
    };
    const { toWrite, toRemove } = planBackfill(projects, {}, null, NOW);

    expect(Object.keys(toWrite).sort()).toEqual(['PubA', 'PubB']);
    expect(toWrite.PubA).toEqual({
      updatedAt: NOW,
      name: 'A',
      description: 'desc A',
      abbreviation: 'PRA'
    });
    expect(toWrite.PubB).toEqual({
      updatedAt: NOW,
      name: 'B',
      frameworks: ['astro']
    });
    expect(toRemove).toEqual([]);
  });

  it('removes /publicProjects/ entries for projects that are no longer public', () => {
    const projects = {
      P1: { public: false, name: 'P1' }
    };
    const existing = {
      P1: { updatedAt: '2026-05-01T00:00:00Z', name: 'P1 old' }
    };
    const { toWrite, toRemove } = planBackfill(projects, existing, null, NOW);

    expect(toWrite).toEqual({});
    expect(toRemove).toEqual(['P1']);
  });

  it('removes stale entries whose project no longer exists', () => {
    const projects = {};
    const existing = {
      Ghost: { updatedAt: NOW, name: 'Ghost' }
    };
    const { toWrite, toRemove } = planBackfill(projects, existing, null, NOW);

    expect(toWrite).toEqual({});
    expect(toRemove).toEqual(['Ghost']);
  });

  it('respects projectFilter for both write and remove sides', () => {
    const projects = {
      Keep: { public: true, name: 'Keep' },
      Other: { public: true, name: 'Other' }
    };
    const existing = {
      Stale: { updatedAt: NOW, name: 'Stale' },
      KeepStaleSibling: { updatedAt: NOW, name: 'sibling' }
    };
    const { toWrite, toRemove } = planBackfill(projects, existing, 'Keep', NOW);

    expect(Object.keys(toWrite)).toEqual(['Keep']);
    expect(toRemove).toEqual([]);
  });

  it('is idempotent: running the plan against its own previous output is a no-op', () => {
    const projects = {
      P1: { public: true, name: 'P1', description: 'd' }
    };
    const first = planBackfill(projects, {}, null, NOW);
    const fakeExisting = { ...first.toWrite };
    const second = planBackfill(projects, fakeExisting, null, NOW);

    // Both writes carry identical content; removals are empty both times.
    expect(second.toWrite).toEqual(first.toWrite);
    expect(second.toRemove).toEqual([]);
  });

  it('tolerates undefined inputs by returning an empty plan', () => {
    const { toWrite, toRemove } = planBackfill(undefined, undefined, null, NOW);
    expect(toWrite).toEqual({});
    expect(toRemove).toEqual([]);
  });

  it('drops sensitive fields (developers, stakeholders, serviceAccountKey, publicToken)', () => {
    const projects = {
      P: {
        public: true,
        name: 'P',
        developers: { dev_001: true },
        stakeholders: { stk_001: true },
        serviceAccountKey: 'secret',
        publicToken: 'tk-1',
        businessContext: 'internal'
      }
    };
    const { toWrite } = planBackfill(projects, {}, null, NOW);
    expect(toWrite.P).toEqual({ updatedAt: NOW, name: 'P' });
  });
});

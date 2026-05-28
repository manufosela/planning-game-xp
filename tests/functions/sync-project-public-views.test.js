/**
 * Tests for syncProjectPublicViews — backfill/clear on project public-flag transitions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  backfillPublicViewsForProject,
  clearPublicViewsForProject,
  decideProjectPublicAction,
  handleSyncProjectPublicViews,
  getCardTypeForPublicType
} from '../../functions/handlers/sync-card-views.js';

/**
 * Builds a db mock backed by an in-memory store.
 * Tracks every update(batch) and remove() call for assertions.
 *
 * @param {Object} state - Map of full paths → values, e.g. { '/cards/PRJ': {...} }
 */
function makeDb(state = {}) {
  const updates = [];
  const removes = [];

  function once(path) {
    return {
      val: () => state[path] ?? null,
      exists: () => state[path] !== undefined && state[path] !== null
    };
  }

  function ref(path) {
    // ref() with no args → root, used for batch updates
    if (path === undefined) {
      return {
        update: vi.fn(async (batch) => {
          updates.push(batch);
          Object.assign(state, batch);
        })
      };
    }
    return {
      once: vi.fn(async () => once(path)),
      remove: vi.fn(async () => {
        removes.push(path);
        delete state[path];
      }),
      update: vi.fn(async (batch) => {
        updates.push({ __at: path, ...batch });
      })
    };
  }

  return { ref: vi.fn(ref), __state: state, __updates: updates, __removes: removes };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const PRJ = 'TestProject';

describe('getCardTypeForPublicType', () => {
  it('maps tasks → task, bugs → bug, epics → epic', () => {
    expect(getCardTypeForPublicType('tasks')).toBe('task');
    expect(getCardTypeForPublicType('bugs')).toBe('bug');
    expect(getCardTypeForPublicType('epics')).toBe('epic');
  });

  it('returns null for unknown types', () => {
    expect(getCardTypeForPublicType('proposals')).toBeNull();
    expect(getCardTypeForPublicType('')).toBeNull();
    expect(getCardTypeForPublicType(null)).toBeNull();
  });
});

describe('decideProjectPublicAction', () => {
  it('returns backfill when public goes false → true', () => {
    expect(decideProjectPublicAction({ public: false }, { public: true })).toBe('backfill');
  });

  it('returns backfill when project is created public', () => {
    expect(decideProjectPublicAction(null, { public: true })).toBe('backfill');
  });

  it('returns backfill when a publicToken is added (without public flag)', () => {
    expect(decideProjectPublicAction({}, { publicToken: 'abc-123' })).toBe('backfill');
  });

  it('returns clear when public goes true → false and no token', () => {
    expect(decideProjectPublicAction({ public: true }, { public: false })).toBe('clear');
  });

  it('returns clear when publicToken is removed and no public flag', () => {
    expect(decideProjectPublicAction({ publicToken: 'abc' }, {})).toBe('clear');
  });

  it('returns clear when project is deleted', () => {
    expect(decideProjectPublicAction({ public: true }, null)).toBe('clear');
  });

  it('returns noop when both before and after are non-public', () => {
    expect(decideProjectPublicAction({ public: false }, { public: false, description: 'updated' })).toBe('noop');
    expect(decideProjectPublicAction(null, null)).toBe('noop');
  });

  it('returns noop when project stays public (unrelated field changes)', () => {
    expect(decideProjectPublicAction(
      { public: true, description: 'old' },
      { public: true, description: 'new' }
    )).toBe('noop');
  });

  it('returns noop when project stays public via token only', () => {
    expect(decideProjectPublicAction(
      { publicToken: 'tk-1' },
      { publicToken: 'tk-1', description: 'changed' }
    )).toBe('noop');
  });

  it('treats empty-string publicToken as non-public', () => {
    expect(decideProjectPublicAction({ publicToken: '' }, { publicToken: 'real-token' })).toBe('backfill');
    expect(decideProjectPublicAction({ publicToken: 'tk' }, { publicToken: '' })).toBe('clear');
  });
});

describe('backfillPublicViewsForProject', () => {
  it('writes only TASKS/BUGS/EPICS, ignores PROPOSALS/SPRINTS/QA', async () => {
    const db = makeDb({
      [`/cards/${PRJ}`]: {
        TASKS_TestProject: {
          'fb-t1': { cardId: 'TST-TSK-0001', title: 'T1', status: 'To Do' },
          'fb-t2': { cardId: 'TST-TSK-0002', title: 'T2', status: 'Done' }
        },
        BUGS_TestProject: {
          'fb-b1': { cardId: 'TST-BUG-0001', title: 'B1', status: 'Created' }
        },
        EPICS_TestProject: {
          'fb-e1': { cardId: 'TST-PCS-0001', title: 'E1' }
        },
        PROPOSALS_TestProject: {
          'fb-p1': { title: 'should be ignored' }
        },
        SPRINTS_TestProject: {
          'fb-s1': { title: 'should be ignored' }
        }
      }
    });
    const logger = makeLogger();

    const result = await backfillPublicViewsForProject(PRJ, db, logger);

    expect(result).toEqual({ written: 4, sections: 3 });
    expect(db.__updates).toHaveLength(1); // 4 cards fit in one batch of 20

    const batch = db.__updates[0];
    expect(batch[`/publicViews/${PRJ}/tasks/fb-t1`]).toMatchObject({
      firebaseId: 'fb-t1', type: 'task', cardId: 'TST-TSK-0001', title: 'T1', status: 'To Do'
    });
    expect(batch[`/publicViews/${PRJ}/bugs/fb-b1`]).toMatchObject({
      firebaseId: 'fb-b1', type: 'bug', cardId: 'TST-BUG-0001', status: 'Created'
    });
    expect(batch[`/publicViews/${PRJ}/epics/fb-e1`]).toMatchObject({
      firebaseId: 'fb-e1', type: 'epic', cardId: 'TST-PCS-0001'
    });
    // No proposal or sprint paths
    expect(Object.keys(batch).some(k => k.includes('/proposals/') || k.includes('/sprints/'))).toBe(false);
  });

  it('skips cards with deletedAt', async () => {
    const db = makeDb({
      [`/cards/${PRJ}`]: {
        TASKS_TestProject: {
          'fb-alive': { cardId: 'TST-TSK-0001', title: 'alive' },
          'fb-dead':  { cardId: 'TST-TSK-0002', title: 'dead', deletedAt: '2024-01-01T00:00:00Z' }
        }
      }
    });
    const result = await backfillPublicViewsForProject(PRJ, makeDb({}), makeLogger());
    // empty store → 0 written
    expect(result.written).toBe(0);

    const result2 = await backfillPublicViewsForProject(PRJ, db, makeLogger());
    expect(result2.written).toBe(1);
    const batch = db.__updates[0];
    expect(batch[`/publicViews/${PRJ}/tasks/fb-alive`]).toBeDefined();
    expect(batch[`/publicViews/${PRJ}/tasks/fb-dead`]).toBeUndefined();
  });

  it('splits writes into batches of 20', async () => {
    const cards = {};
    for (let i = 1; i <= 45; i++) {
      cards[`fb-${i}`] = { cardId: `TST-TSK-${String(i).padStart(4, '0')}`, title: `T${i}` };
    }
    const db = makeDb({ [`/cards/${PRJ}`]: { TASKS_TestProject: cards } });

    const result = await backfillPublicViewsForProject(PRJ, db, makeLogger());

    expect(result.written).toBe(45);
    expect(db.__updates).toHaveLength(3); // 20 + 20 + 5
    expect(Object.keys(db.__updates[0])).toHaveLength(20);
    expect(Object.keys(db.__updates[1])).toHaveLength(20);
    expect(Object.keys(db.__updates[2])).toHaveLength(5);
  });

  it('returns zeros when project has no eligible sections', async () => {
    const db = makeDb({
      [`/cards/${PRJ}`]: {
        PROPOSALS_TestProject: { 'fb-p1': { title: 'x' } }
      }
    });
    const result = await backfillPublicViewsForProject(PRJ, db, makeLogger());
    expect(result).toEqual({ written: 0, sections: 0 });
    expect(db.__updates).toHaveLength(0);
  });

  it('returns zeros when project has no cards at all', async () => {
    const db = makeDb({});
    const result = await backfillPublicViewsForProject(PRJ, db, makeLogger());
    expect(result).toEqual({ written: 0, sections: 0 });
  });

  it('is idempotent: running twice produces the same final state', async () => {
    const initial = {
      [`/cards/${PRJ}`]: {
        TASKS_TestProject: {
          'fb-1': { cardId: 'TST-TSK-0001', title: 'T1', status: 'To Do' }
        }
      }
    };
    const db1 = makeDb({ ...initial });
    const db2 = makeDb({ ...initial });

    await backfillPublicViewsForProject(PRJ, db1, makeLogger());
    await backfillPublicViewsForProject(PRJ, db2, makeLogger());
    await backfillPublicViewsForProject(PRJ, db2, makeLogger());

    expect(db1.__updates[0]).toEqual(db2.__updates[1]);
  });
});

describe('clearPublicViewsForProject', () => {
  it('removes /publicViews/{projectId}', async () => {
    const db = makeDb({});
    const logger = makeLogger();

    await clearPublicViewsForProject(PRJ, db, logger);

    expect(db.ref).toHaveBeenCalledWith(`/publicViews/${PRJ}`);
    expect(db.__removes).toContain(`/publicViews/${PRJ}`);
  });
});

describe('handleSyncProjectPublicViews', () => {
  it('triggers backfill on false → true transition', async () => {
    const db = makeDb({
      [`/cards/${PRJ}`]: {
        TASKS_TestProject: { 'fb-1': { cardId: 'TST-TSK-0001', title: 'T1' } }
      }
    });

    const result = await handleSyncProjectPublicViews(
      { projectId: PRJ },
      { public: false, name: 'P' },
      { public: true, name: 'P' },
      { db, logger: makeLogger() }
    );

    expect(result).toEqual({ action: 'backfill', written: 1 });
    expect(db.__updates).toHaveLength(1);
  });

  it('triggers clear on true → false transition', async () => {
    const db = makeDb({});

    const result = await handleSyncProjectPublicViews(
      { projectId: PRJ },
      { public: true },
      { public: false },
      { db, logger: makeLogger() }
    );

    expect(result).toEqual({ action: 'clear' });
    expect(db.__removes).toContain(`/publicViews/${PRJ}`);
  });

  it('is a no-op for unrelated project edits while staying public', async () => {
    const db = makeDb({});

    const result = await handleSyncProjectPublicViews(
      { projectId: PRJ },
      { public: true, description: 'old' },
      { public: true, description: 'new' },
      { db, logger: makeLogger() }
    );

    expect(result).toEqual({ action: 'noop' });
    expect(db.__updates).toHaveLength(0);
    expect(db.__removes).toHaveLength(0);
    // Critical: must NOT read /cards/ when noop
    expect(db.ref).not.toHaveBeenCalledWith(`/cards/${PRJ}`);
  });

  it('is a no-op for unrelated edits while staying non-public', async () => {
    const db = makeDb({});

    const result = await handleSyncProjectPublicViews(
      { projectId: PRJ },
      { public: false, description: 'old' },
      { public: false, description: 'new' },
      { db, logger: makeLogger() }
    );

    expect(result).toEqual({ action: 'noop' });
  });

  it('treats publicToken added (empty → set) as backfill', async () => {
    const db = makeDb({
      [`/cards/${PRJ}`]: {
        TASKS_TestProject: { 'fb-1': { cardId: 'TST-TSK-0001', title: 'T1' } }
      }
    });

    const result = await handleSyncProjectPublicViews(
      { projectId: PRJ },
      { publicToken: '' },
      { publicToken: 'uuid-abc' },
      { db, logger: makeLogger() }
    );

    expect(result.action).toBe('backfill');
    expect(result.written).toBe(1);
  });

  it('clears when project is deleted from /projects/', async () => {
    const db = makeDb({});

    const result = await handleSyncProjectPublicViews(
      { projectId: PRJ },
      { public: true },
      null,
      { db, logger: makeLogger() }
    );

    expect(result.action).toBe('clear');
  });
});

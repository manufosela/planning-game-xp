/**
 * Regression tests for PLN-BUG-0112 — team members added from the project
 * form must be upserted into the global /data/{developers,stakeholders}
 * collections so entityDirectoryService can resolve them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncTeamToDataCollections, collectIds } from '../../public/js/utils/team-data-sync.js';

function makeDeps({ existingDevs = {}, existingStks = {} } = {}) {
  const writes = [];
  const refFn = (_db, path) => ({ __path: path });
  const getFn = vi.fn(async (r) => {
    const path = r.__path;
    if (path.startsWith('/data/developers/')) {
      const id = path.slice('/data/developers/'.length);
      return { exists: () => id in existingDevs, val: () => existingDevs[id] };
    }
    if (path.startsWith('/data/stakeholders/')) {
      const id = path.slice('/data/stakeholders/'.length);
      return { exists: () => id in existingStks, val: () => existingStks[id] };
    }
    return { exists: () => false };
  });
  const setFn = vi.fn(async (r, value) => { writes.push({ path: r.__path, value }); });
  return { deps: { database: {}, ref: refFn, get: getFn, set: setFn }, writes };
}

describe('collectIds', () => {
  it('extracts ids with the required prefix, dedupes, and keeps object payloads', () => {
    const result = collectIds(
      [{ id: 'dev_001', name: 'Mánu', email: 'm@x' }, { id: 'dev_016', name: 'IA', email: 'ia@x' }, { id: 'dev_001', name: 'dup' }],
      'dev_'
    );
    expect([...result.keys()]).toEqual(['dev_001', 'dev_016']);
    expect(result.get('dev_001')).toEqual({ name: 'Mánu', email: 'm@x' });
  });

  it('drops entries without the required prefix', () => {
    const result = collectIds(
      [{ id: 'stk_001' }, { id: 'dev_010' }, { id: 'BecarIA' }, { id: null }, 'stk_002'],
      'stk_'
    );
    expect([...result.keys()]).toEqual(['stk_001', 'stk_002']);
  });

  it('returns empty map for non-array input', () => {
    expect(collectIds(null, 'dev_').size).toBe(0);
    expect(collectIds(undefined, 'dev_').size).toBe(0);
    expect(collectIds({}, 'dev_').size).toBe(0);
  });
});

describe('syncTeamToDataCollections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts a new stakeholder under /data/stakeholders/{id}', async () => {
    const { deps, writes } = makeDeps({ existingStks: { stk_001: {} } });

    const result = await syncTeamToDataCollections({
      developers: [],
      stakeholders: [
        { id: 'stk_001', name: 'Mánu', email: 'm@x' },
        { id: 'stk_002', name: 'Nathan', email: 'nathan@tribbuapp.com' }
      ],
      deps
    });

    expect(result.createdStks).toEqual(['stk_002']);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('/data/stakeholders/stk_002');
    expect(writes[0].value).toEqual({ name: 'Nathan', email: 'nathan@tribbuapp.com', active: true });
  });

  it('upserts a new developer under /data/developers/{id}', async () => {
    const { deps, writes } = makeDeps({ existingDevs: { dev_001: {} } });

    const result = await syncTeamToDataCollections({
      developers: [
        { id: 'dev_001', name: 'M', email: 'm@x' },
        { id: 'dev_017', name: 'Aitor', email: 'aitor@x' }
      ],
      stakeholders: [],
      deps
    });

    expect(result.createdDevs).toEqual(['dev_017']);
    expect(writes[0].path).toBe('/data/developers/dev_017');
  });

  it('does not overwrite an existing entry', async () => {
    const { deps, writes } = makeDeps({
      existingDevs: { dev_001: { name: 'Old', email: 'old@x' } }
    });
    await syncTeamToDataCollections({
      developers: [{ id: 'dev_001', name: 'New', email: 'new@x' }],
      stakeholders: [],
      deps
    });
    expect(writes).toHaveLength(0);
  });

  it('skips entries without a valid prefix (e.g. legacy names like BecarIA)', async () => {
    const { deps, writes } = makeDeps();
    await syncTeamToDataCollections({
      developers: [{ id: 'BecarIA', name: 'IA' }, { id: 'dev_016', name: 'IA valida' }],
      stakeholders: [{ id: 'stk_001' }],
      deps
    });
    const paths = writes.map(w => w.path);
    expect(paths).toContain('/data/developers/dev_016');
    expect(paths).toContain('/data/stakeholders/stk_001');
    expect(paths.some(p => p.endsWith('/BecarIA'))).toBe(false);
  });

  it('is idempotent — running twice does nothing on the second pass', async () => {
    const state = { existingStks: {} };
    const { deps: deps1, writes: writes1 } = makeDeps(state);
    await syncTeamToDataCollections({
      developers: [],
      stakeholders: [{ id: 'stk_002', name: 'Nathan', email: 'n@x' }],
      deps: deps1
    });
    // Simulate the write propagating so the second call sees stk_002 as existing.
    state.existingStks.stk_002 = writes1[0].value;
    const { deps: deps2, writes: writes2 } = makeDeps(state);
    await syncTeamToDataCollections({
      developers: [],
      stakeholders: [{ id: 'stk_002', name: 'Nathan', email: 'n@x' }],
      deps: deps2
    });
    expect(writes2).toHaveLength(0);
  });
});

/**
 * Regression tests for PLN-BUG-0110 — loadColumnsForProject must NOT persist
 * default columns when the target project does not exist. Doing so leaves
 * a ghost /projects/{id} entry that later appears as a phantom project in
 * the UI (root cause of the "two GREBLA" incident after PLN-BUG-0109).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue();
const mockUpdate = vi.fn().mockResolvedValue();
const mockRemove = vi.fn().mockResolvedValue();
const mockRef = vi.fn((_db, path) => ({ __path: path }));

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: (db, path) => mockRef(db, path),
  get: (r) => mockGet(r),
  set: (r, v) => mockSet(r, v),
  update: (r, v) => mockUpdate(r, v),
  remove: (r) => mockRemove(r)
}));

const { loadColumnsForProject } = await import('../../public/js/services/board-config-service.js');

function snapshot(value) {
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value
  };
}

describe('loadColumnsForProject — ghost project guard (PLN-BUG-0110)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT persist defaults when the project does not exist', async () => {
    mockGet.mockImplementation((r) => {
      const path = r.__path;
      if (path === '/projects/GhostProject/board/columns') return Promise.resolve(snapshot(null));
      if (path === '/projects/GhostProject') return Promise.resolve(snapshot(null));
      return Promise.resolve(snapshot(null));
    });

    const cols = await loadColumnsForProject('GhostProject');

    expect(cols.length).toBeGreaterThan(0);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('persists defaults when the project exists but has no board config yet', async () => {
    mockGet.mockImplementation((r) => {
      const path = r.__path;
      if (path === '/projects/RealProject/board/columns') return Promise.resolve(snapshot(null));
      if (path === '/projects/RealProject') return Promise.resolve(snapshot({ name: 'Real', abbreviation: 'RP' }));
      return Promise.resolve(snapshot(null));
    });

    const cols = await loadColumnsForProject('RealProject');

    expect(cols.length).toBeGreaterThan(0);
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0][0].__path).toBe('/projects/RealProject/board/columns');
  });

  it('returns existing columns without any write when config is already present', async () => {
    const existing = {
      todo: { id: 'todo', name: 'To Do', order: 0, statusKey: 'To Do' },
      done: { id: 'done', name: 'Done', order: 1, statusKey: 'Done' }
    };
    mockGet.mockImplementation((r) => {
      const path = r.__path;
      if (path === '/projects/RealProject/board/columns') return Promise.resolve(snapshot(existing));
      if (path === '/projects/RealProject') return Promise.resolve(snapshot({ name: 'Real' }));
      return Promise.resolve(snapshot(null));
    });

    const cols = await loadColumnsForProject('RealProject');

    expect(cols).toHaveLength(2);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

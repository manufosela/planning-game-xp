/**
 * Tests for bugFilterConfig option providers (PLN-BUG-0123).
 *
 * Root problem: at runtime `statusBugList` and `globalBugPriorityList` are
 * arrays of strings (sorted by FirebaseService), but the option providers
 * treated them as `{ key: { label } }` maps, so the selects showed the
 * array indices ("0", "1", ...) instead of the status/priority names.
 */
import { describe, it, expect, afterEach } from 'vitest';

const { bugFilterConfig } = await import('@/filters/configs/bug-filter-config.js');

const statusOptions = () => bugFilterConfig.filters.status.optionsProvider();
const priorityOptions = () => bugFilterConfig.filters.priority.optionsProvider();

describe('bugFilterConfig option providers (PLN-BUG-0123)', () => {
  afterEach(() => {
    delete globalThis.statusBugList;
    delete globalThis.globalBugPriorityList;
  });

  it('should use status names as value and label when statusBugList is an array', async () => {
    globalThis.statusBugList = ['Created', 'Assigned', 'Fixed'];
    expect(await statusOptions()).toEqual([
      { value: 'Created', label: 'Created' },
      { value: 'Assigned', label: 'Assigned' },
      { value: 'Fixed', label: 'Fixed' }
    ]);
  });

  it('should use priority names as value and label when globalBugPriorityList is an array', async () => {
    globalThis.globalBugPriorityList = ['Application Blocker', 'User Experience Issue'];
    expect(await priorityOptions()).toEqual([
      { value: 'Application Blocker', label: 'Application Blocker' },
      { value: 'User Experience Issue', label: 'User Experience Issue' }
    ]);
  });

  it('should keep supporting { key: { label } } maps', async () => {
    globalThis.statusBugList = { Created: { label: 'Creado' } };
    expect(await statusOptions()).toEqual([{ value: 'Created', label: 'Creado' }]);
  });

  it('should fall back to constants when globals are not loaded', async () => {
    const values = (await statusOptions()).map((o) => o.value);
    expect(values).toEqual(['Created', 'Assigned', 'Fixed', 'Verified', 'Closed']);
  });
});

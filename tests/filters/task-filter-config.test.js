/**
 * Tests for taskFilterConfig (PLN-TSK-0356).
 *
 * Root problem: a filter can be fully configured in `filters` yet
 * invisible because it's missing from `displayOrder` — that desync hid
 * repositoryLabel for months and shipped taskCategory without UI.
 * These tests pin the alignment in both directions.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/constants/app-constants.js', () => ({
  APP_CONSTANTS: {
    TASK_STATUS_LIST: ['To Do', 'In Progress', 'To Validate', 'Done&Validated', 'Blocked']
  }
}));

const { taskFilterConfig } = await import('@/filters/configs/task-filter-config.js');

describe('taskFilterConfig — filters/displayOrder alignment (PLN-TSK-0356)', () => {
  it('every configured filter is displayed (no configured-but-invisible filters)', () => {
    const configured = Object.keys(taskFilterConfig.filters);
    for (const filterId of configured) {
      expect(taskFilterConfig.displayOrder, `'${filterId}' configured but missing from displayOrder`)
        .toContain(filterId);
    }
  });

  it('every displayed filter is configured (no dangling displayOrder entries)', () => {
    for (const filterId of taskFilterConfig.displayOrder) {
      expect(Object.keys(taskFilterConfig.filters), `'${filterId}' in displayOrder but not configured`)
        .toContain(filterId);
    }
  });

  it('taskCategory filter is configured with matcher + both category options', async () => {
    const cfg = taskFilterConfig.filters.taskCategory;
    expect(cfg).toBeDefined();
    expect(typeof cfg.matcher).toBe('function');

    const options = await cfg.optionsProvider();
    expect(options).toEqual([
      { value: 'code', label: 'Con código' },
      { value: 'nocode', label: 'Sin código' }
    ]);
  });

  it('taskCategory matcher treats legacy cards (no field) as code', () => {
    const { matcher } = taskFilterConfig.filters.taskCategory;
    expect(matcher({ taskCategory: 'nocode' }, ['nocode'])).toBe(true);
    expect(matcher({}, ['code'])).toBe(true);
    expect(matcher({}, ['nocode'])).toBe(false);
  });

  it('repositoryLabel is visible in displayOrder', () => {
    expect(taskFilterConfig.displayOrder).toContain('repositoryLabel');
  });
});

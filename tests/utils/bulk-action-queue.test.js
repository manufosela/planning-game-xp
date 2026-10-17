/**
 * PLN-TSK-0366: bulk actions run one item at a time with a pause between
 * items, like doing it by hand, so Cloud Function triggers are not flooded.
 */
import { describe, expect, it, vi } from 'vitest';
import { runSequentially } from '@/utils/bulk-action-queue.js';

const noWait = () => Promise.resolve();

describe('runSequentially', () => {
  it('should run the action for each item in order, never in parallel', async () => {
    const log = [];
    let running = 0;
    const action = async (item) => {
      running++;
      expect(running).toBe(1);
      log.push(item);
      await Promise.resolve();
      running--;
    };
    const result = await runSequentially(['a', 'b', 'c'], action, { wait: noWait });
    expect(log).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ succeeded: ['a', 'b', 'c'], failed: [], stopped: false });
  });

  it('should pause between items but not after the last one', async () => {
    const wait = vi.fn(noWait);
    await runSequentially([1, 2, 3], async () => {}, { pauseMs: 1000, wait });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1000);
  });

  it('should default to a one second pause', async () => {
    const wait = vi.fn(noWait);
    await runSequentially([1, 2], async () => {}, { wait });
    expect(wait).toHaveBeenCalledWith(1000);
  });

  it('should keep going when an item fails and report it', async () => {
    const error = new Error('denied');
    const action = async (item) => { if (item === 2) throw error; };
    const result = await runSequentially([1, 2, 3], action, { wait: noWait });
    expect(result.succeeded).toEqual([1, 3]);
    expect(result.failed).toEqual([{ item: 2, error }]);
  });

  it('should report progress after each item', async () => {
    const onProgress = vi.fn();
    await runSequentially(['a', 'b'], async () => {}, { wait: noWait, onProgress });
    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it('should stop before the next item when the signal is aborted', async () => {
    const controller = new AbortController();
    const action = vi.fn(async (item) => { if (item === 1) controller.abort(); });
    const result = await runSequentially([1, 2, 3], action, { wait: noWait, signal: controller.signal });
    expect(action).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ succeeded: [1], failed: [], stopped: true });
  });
});

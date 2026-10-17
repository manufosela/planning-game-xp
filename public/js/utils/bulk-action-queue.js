/**
 * Runs a bulk action one item at a time (PLN-TSK-0366).
 *
 * Each item waits for the previous one to finish, plus a short pause, which
 * mirrors validating cards by hand and keeps Cloud Function triggers spaced
 * out. The pause is an intentional throttle, not a synchronisation wait.
 */

const DEFAULT_PAUSE_MS = 1000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function runSequentially(items, action, {
  pauseMs = DEFAULT_PAUSE_MS, signal, onProgress, wait = delay
} = {}) {
  const succeeded = [];
  const failed = [];

  for (const [index, item] of items.entries()) {
    if (index > 0) await wait(pauseMs);
    if (signal?.aborted) return { succeeded, failed, stopped: true };

    try {
      await action(item);
      succeeded.push(item);
    } catch (error) {
      failed.push({ item, error });
    }
    onProgress?.(index + 1, items.length);
  }

  return { succeeded, failed, stopped: false };
}

/**
 * Page lifecycle management for Astro view transitions.
 *
 * Provides helpers to register initialization logic and cleanups
 * so pages can properly tear down listeners, subscriptions, and
 * observers when navigating away via view transitions.
 *
 * Usage:
 *   import { onPageEnter, registerCleanup } from '/js/utils/page-lifecycle.js';
 *
 *   onPageEnter(() => {
 *     // initialization code
 *     const unsubscribe = onSnapshot(ref, callback);
 *     registerCleanup(unsubscribe);
 *
 *     const handler = (e) => { ... };
 *     document.addEventListener('some-event', handler);
 *     registerCleanup(() => document.removeEventListener('some-event', handler));
 *   });
 */

const cleanups = [];

/**
 * Register a cleanup function to be called when leaving the page.
 * @param {Function} fn - Cleanup function (e.g., unsubscribe, removeEventListener)
 */
export function registerCleanup(fn) {
  if (typeof fn === 'function') {
    cleanups.push(fn);
  }
}

/**
 * Run all registered cleanups and clear the list.
 */
export function clearCleanups() {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    try {
      fn();
    } catch (err) {
      console.warn('[page-lifecycle] cleanup error:', err);
    }
  }
}

/**
 * Register a function to run on page enter (astro:page-load).
 * Automatically wires up cleanup on page leave (astro:before-swap).
 *
 * IMPORTANT: Call at script top-level, NOT inside astro:page-load.
 *
 * @param {Function} initFn - Initialization function
 */
export function onPageEnter(initFn) {
  const handlePageLoad = () => {
    initFn();
  };

  const handleBeforeSwap = () => {
    clearCleanups();
    document.removeEventListener('astro:before-swap', handleBeforeSwap);
    document.removeEventListener('astro:page-load', handlePageLoad);
  };

  document.addEventListener('astro:page-load', handlePageLoad);
  document.addEventListener('astro:before-swap', handleBeforeSwap);
}

/**
 * Register a function to run on page leave (astro:before-swap).
 * Runs AFTER all registered cleanups.
 *
 * @param {Function} leaveFn - Function to run on leave
 */
export function onPageLeave(leaveFn) {
  const handler = () => {
    clearCleanups();
    try {
      leaveFn();
    } catch (err) {
      console.warn('[page-lifecycle] onPageLeave error:', err);
    }
    document.removeEventListener('astro:before-swap', handler);
  };
  document.addEventListener('astro:before-swap', handler);
}

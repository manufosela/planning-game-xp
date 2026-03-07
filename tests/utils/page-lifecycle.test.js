import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerCleanup, onPageEnter, onPageLeave, runCleanups, _reset } from '@/utils/page-lifecycle.js';

describe('page-lifecycle', () => {
  beforeEach(() => {
    _reset();
  });

  describe('registerCleanup', () => {
    it('should register a cleanup function', () => {
      const fn = vi.fn();
      registerCleanup(fn);
      runCleanups();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should register multiple cleanup functions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      registerCleanup(fn1);
      registerCleanup(fn2);
      runCleanups();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should clear cleanups after running them', () => {
      const fn = vi.fn();
      registerCleanup(fn);
      runCleanups();
      runCleanups();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not throw if cleanup function throws', () => {
      const fn = vi.fn(() => { throw new Error('cleanup error'); });
      registerCleanup(fn);
      expect(() => runCleanups()).not.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should run all cleanups even if one throws', () => {
      const fn1 = vi.fn(() => { throw new Error('fail'); });
      const fn2 = vi.fn();
      registerCleanup(fn1);
      registerCleanup(fn2);
      runCleanups();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should ignore non-function arguments', () => {
      registerCleanup(null);
      registerCleanup(undefined);
      registerCleanup('string');
      registerCleanup(42);
      expect(() => runCleanups()).not.toThrow();
    });
  });

  describe('onPageEnter', () => {
    it('should call the callback on astro page-load', () => {
      const fn = vi.fn();
      onPageEnter(fn);
      document.dispatchEvent(new Event('astro:page-load'));
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call multiple enter callbacks', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      onPageEnter(fn1);
      onPageEnter(fn2);
      document.dispatchEvent(new Event('astro:page-load'));
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should clear enter callbacks after page-leave', () => {
      const fn = vi.fn();
      onPageEnter(fn);
      document.dispatchEvent(new Event('astro:page-load'));
      expect(fn).toHaveBeenCalledTimes(1);
      runCleanups();
      document.dispatchEvent(new Event('astro:page-load'));
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('onPageLeave', () => {
    it('should register a cleanup that runs on page-leave', () => {
      const fn = vi.fn();
      onPageLeave(fn);
      runCleanups();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should run leave callbacks together with registered cleanups', () => {
      const cleanupFn = vi.fn();
      const leaveFn = vi.fn();
      registerCleanup(cleanupFn);
      onPageLeave(leaveFn);
      runCleanups();
      expect(cleanupFn).toHaveBeenCalledTimes(1);
      expect(leaveFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('runCleanups triggered by astro:before-swap event', () => {
    it('should run cleanups when astro:before-swap is dispatched', () => {
      const fn = vi.fn();
      registerCleanup(fn);
      document.dispatchEvent(new Event('astro:before-swap'));
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration lifecycle', () => {
    it('should support full lifecycle', () => {
      const enter1 = vi.fn();
      const cleanup1 = vi.fn();
      onPageEnter(enter1);
      document.dispatchEvent(new Event('astro:page-load'));
      expect(enter1).toHaveBeenCalledTimes(1);
      registerCleanup(cleanup1);
      runCleanups();
      expect(cleanup1).toHaveBeenCalledTimes(1);
      const enter2 = vi.fn();
      onPageEnter(enter2);
      document.dispatchEvent(new Event('astro:page-load'));
      expect(enter2).toHaveBeenCalledTimes(1);
      expect(enter1).toHaveBeenCalledTimes(1);
    });
  });

  describe('partial page pattern: onPageEnter with registerCleanup inside', () => {
    it('should register cleanups inside onPageEnter and run them on leave', () => {
      const cleanup = vi.fn();
      onPageEnter(() => {
        registerCleanup(cleanup);
      });
      document.dispatchEvent(new Event('astro:page-load'));
      expect(cleanup).not.toHaveBeenCalled();
      document.dispatchEvent(new Event('astro:before-swap'));
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should not duplicate listeners on re-entry', () => {
      let initCount = 0;
      const cleanup = vi.fn();

      function simulatePageLoad() {
        onPageEnter(() => {
          initCount++;
          registerCleanup(cleanup);
        });
        document.dispatchEvent(new Event('astro:page-load'));
      }

      simulatePageLoad();
      expect(initCount).toBe(1);
      document.dispatchEvent(new Event('astro:before-swap'));
      expect(cleanup).toHaveBeenCalledTimes(1);

      simulatePageLoad();
      expect(initCount).toBe(2);
      document.dispatchEvent(new Event('astro:before-swap'));
      expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it('should support multiple cleanups registered inside onPageEnter', () => {
      const cleanupA = vi.fn();
      const cleanupB = vi.fn();
      onPageEnter(() => {
        registerCleanup(cleanupA);
        registerCleanup(cleanupB);
      });
      document.dispatchEvent(new Event('astro:page-load'));
      document.dispatchEvent(new Event('astro:before-swap'));
      expect(cleanupA).toHaveBeenCalledTimes(1);
      expect(cleanupB).toHaveBeenCalledTimes(1);
    });

    it('should not run init code until astro:page-load fires', () => {
      const initFn = vi.fn();
      onPageEnter(initFn);
      expect(initFn).not.toHaveBeenCalled();
      document.dispatchEvent(new Event('astro:page-load'));
      expect(initFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('wip pattern: _cleanupFns array flushed via single registerCleanup', () => {
    it('should flush collected unsubscribes on page leave', () => {
      const unsubFirebase1 = vi.fn();
      const unsubFirebase2 = vi.fn();
      const removeListener = vi.fn();

      onPageEnter(() => {
        const _cleanupFns = [];
        _cleanupFns.push(unsubFirebase1);
        _cleanupFns.push(unsubFirebase2);
        _cleanupFns.push(removeListener);

        registerCleanup(() => {
          _cleanupFns.forEach(fn => fn());
          _cleanupFns.length = 0;
        });
      });

      document.dispatchEvent(new Event('astro:page-load'));
      expect(unsubFirebase1).not.toHaveBeenCalled();
      expect(unsubFirebase2).not.toHaveBeenCalled();
      expect(removeListener).not.toHaveBeenCalled();

      document.dispatchEvent(new Event('astro:before-swap'));
      expect(unsubFirebase1).toHaveBeenCalledTimes(1);
      expect(unsubFirebase2).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledTimes(1);
    });

    it('should not leak listeners across navigations', () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();

      function simulateWipPage(unsub) {
        onPageEnter(() => {
          const _cleanupFns = [];
          _cleanupFns.push(unsub);
          registerCleanup(() => {
            _cleanupFns.forEach(fn => fn());
            _cleanupFns.length = 0;
          });
        });
        document.dispatchEvent(new Event('astro:page-load'));
      }

      simulateWipPage(unsub1);
      document.dispatchEvent(new Event('astro:before-swap'));
      expect(unsub1).toHaveBeenCalledTimes(1);

      simulateWipPage(unsub2);
      document.dispatchEvent(new Event('astro:before-swap'));
      expect(unsub1).toHaveBeenCalledTimes(1);
      expect(unsub2).toHaveBeenCalledTimes(1);
    });
  });

  describe('global-config pattern: DOM event listeners with named handlers', () => {
    it('should add event listeners on enter and remove on leave', () => {
      const handler = vi.fn();
      const el = document.createElement('div');

      onPageEnter(() => {
        el.addEventListener('config-saved', handler);
        registerCleanup(() => {
          el.removeEventListener('config-saved', handler);
        });
      });

      document.dispatchEvent(new Event('astro:page-load'));

      el.dispatchEvent(new Event('config-saved'));
      expect(handler).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new Event('astro:before-swap'));
      el.dispatchEvent(new Event('config-saved'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not duplicate listeners on multiple navigations', () => {
      const handler = vi.fn();
      const el = document.createElement('div');

      function simulateGlobalConfigPage() {
        onPageEnter(() => {
          el.addEventListener('config-saved', handler);
          registerCleanup(() => {
            el.removeEventListener('config-saved', handler);
          });
        });
        document.dispatchEvent(new Event('astro:page-load'));
      }

      simulateGlobalConfigPage();
      el.dispatchEvent(new Event('config-saved'));
      expect(handler).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new Event('astro:before-swap'));

      simulateGlobalConfigPage();
      el.dispatchEvent(new Event('config-saved'));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should clean up multiple event types', () => {
      const onSaved = vi.fn();
      const onDeleted = vi.fn();
      const onCreated = vi.fn();
      const el = document.createElement('div');

      onPageEnter(() => {
        el.addEventListener('config-saved', onSaved);
        el.addEventListener('config-deleted', onDeleted);
        el.addEventListener('config-created', onCreated);

        registerCleanup(() => {
          el.removeEventListener('config-saved', onSaved);
          el.removeEventListener('config-deleted', onDeleted);
          el.removeEventListener('config-created', onCreated);
        });
      });

      document.dispatchEvent(new Event('astro:page-load'));

      el.dispatchEvent(new Event('config-saved'));
      el.dispatchEvent(new Event('config-deleted'));
      el.dispatchEvent(new Event('config-created'));
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new Event('astro:before-swap'));

      el.dispatchEvent(new Event('config-saved'));
      el.dispatchEvent(new Event('config-deleted'));
      el.dispatchEvent(new Event('config-created'));
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  describe('proposals pattern: onPageEnter with no cleanup needed', () => {
    it('should allow onPageEnter with empty body (self-initializing component)', () => {
      const enterFn = vi.fn();
      onPageEnter(enterFn);
      document.dispatchEvent(new Event('astro:page-load'));
      expect(enterFn).toHaveBeenCalledTimes(1);

      expect(() => {
        document.dispatchEvent(new Event('astro:before-swap'));
      }).not.toThrow();
    });

    it('should re-enter cleanly without cleanup on multiple navigations', () => {
      let enterCount = 0;

      function simulateProposalsPage() {
        onPageEnter(() => {
          enterCount++;
        });
        document.dispatchEvent(new Event('astro:page-load'));
      }

      simulateProposalsPage();
      expect(enterCount).toBe(1);
      document.dispatchEvent(new Event('astro:before-swap'));

      simulateProposalsPage();
      expect(enterCount).toBe(2);
      document.dispatchEvent(new Event('astro:before-swap'));

      simulateProposalsPage();
      expect(enterCount).toBe(3);
    });
  });

});

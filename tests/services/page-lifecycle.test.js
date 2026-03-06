import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerCleanup,
  clearCleanups,
  onPageEnter,
  onPageLeave,
  _reset
} from '@/services/page-lifecycle.js';

describe('page-lifecycle', () => {
  let addEventListenerSpy;
  let removeEventListenerSpy;
  const eventHandlers = {};

  beforeEach(() => {
    _reset();

    addEventListenerSpy = vi.spyOn(document, 'addEventListener').mockImplementation((event, handler) => {
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
    });

    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener').mockImplementation((event, handler) => {
      if (eventHandlers[event]) {
        eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
      }
    });
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    Object.keys(eventHandlers).forEach(key => delete eventHandlers[key]);
  });

  function fireEvent(name) {
    const handlers = eventHandlers[name] || [];
    const event = new Event(name);
    handlers.forEach(h => h(event));
  }

  describe('registerCleanup', () => {
    it('should accept a cleanup function', () => {
      const fn = vi.fn();
      registerCleanup(fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should throw if argument is not a function', () => {
      expect(() => registerCleanup('not a function')).toThrow();
      expect(() => registerCleanup(null)).toThrow();
      expect(() => registerCleanup(123)).toThrow();
    });

    it('should return an unregister function', () => {
      const fn = vi.fn();
      const unregister = registerCleanup(fn);
      expect(typeof unregister).toBe('function');
    });

    it('should allow unregistering a cleanup before it runs', () => {
      const fn = vi.fn();
      const unregister = registerCleanup(fn);
      unregister();
      clearCleanups();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('clearCleanups', () => {
    it('should execute all registered cleanup functions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();
      registerCleanup(fn1);
      registerCleanup(fn2);
      registerCleanup(fn3);

      clearCleanups();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn3).toHaveBeenCalledTimes(1);
    });

    it('should clear the registry after execution', () => {
      const fn = vi.fn();
      registerCleanup(fn);

      clearCleanups();
      clearCleanups();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not throw if a cleanup function throws', () => {
      const badFn = vi.fn(() => { throw new Error('cleanup error'); });
      const goodFn = vi.fn();
      registerCleanup(badFn);
      registerCleanup(goodFn);

      expect(() => clearCleanups()).not.toThrow();
      expect(badFn).toHaveBeenCalled();
      expect(goodFn).toHaveBeenCalled();
    });
  });

  describe('onPageLeave', () => {
    it('should register a callback that runs on astro:before-swap', () => {
      const fn = vi.fn();
      onPageLeave(fn);

      fireEvent('astro:before-swap');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should run on every navigation, not just once', () => {
      const fn = vi.fn();
      onPageLeave(fn);

      fireEvent('astro:before-swap');
      fireEvent('astro:before-swap');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should return an unsubscribe function', () => {
      const fn = vi.fn();
      const unsub = onPageLeave(fn);
      expect(typeof unsub).toBe('function');

      unsub();
      fireEvent('astro:before-swap');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should throw if argument is not a function', () => {
      expect(() => onPageLeave(null)).toThrow();
    });
  });

  describe('onPageEnter', () => {
    it('should register a callback that runs on astro:page-load', () => {
      const fn = vi.fn();
      onPageEnter(fn);

      fireEvent('astro:page-load');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should run on every navigation', () => {
      const fn = vi.fn();
      onPageEnter(fn);

      fireEvent('astro:page-load');
      fireEvent('astro:page-load');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should return an unsubscribe function', () => {
      const fn = vi.fn();
      const unsub = onPageEnter(fn);

      unsub();
      fireEvent('astro:page-load');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should throw if argument is not a function', () => {
      expect(() => onPageEnter(42)).toThrow();
    });
  });

  describe('astro:before-swap integration', () => {
    it('should run all registered cleanups when astro:before-swap fires', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      registerCleanup(cleanup1);
      registerCleanup(cleanup2);

      fireEvent('astro:before-swap');

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('should clear the cleanup registry after astro:before-swap', () => {
      const cleanup = vi.fn();
      registerCleanup(cleanup);

      fireEvent('astro:before-swap');
      fireEvent('astro:before-swap');

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should run page-leave callbacks AND cleanups on swap', () => {
      const leave = vi.fn();
      const cleanup = vi.fn();
      onPageLeave(leave);
      registerCleanup(cleanup);

      fireEvent('astro:before-swap');

      expect(leave).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should run page-leave callbacks before cleanups', () => {
      const order = [];
      onPageLeave(() => order.push('leave'));
      registerCleanup(() => order.push('cleanup'));

      fireEvent('astro:before-swap');

      expect(order).toEqual(['leave', 'cleanup']);
    });
  });

  describe('_reset (test helper)', () => {
    it('should clear all state without executing callbacks', () => {
      const fn = vi.fn();
      registerCleanup(fn);
      onPageLeave(fn);
      onPageEnter(fn);

      _reset();

      clearCleanups();
      fireEvent('astro:before-swap');
      fireEvent('astro:page-load');

      expect(fn).not.toHaveBeenCalled();
    });
  });
});

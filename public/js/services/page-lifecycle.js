const cleanups = new Set();
const leaveCallbacks = new Set();
const enterCallbacks = new Set();

let swapHandler = null;

function assertFunction(fn, name) {
  if (typeof fn !== 'function') {
    throw new TypeError(name + ' expects a function, got ' + typeof fn);
  }
}

function bindSwapHandler() {
  if (swapHandler) return;
  swapHandler = () => {
    leaveCallbacks.forEach(fn => {
      try { fn(); } catch (e) { console.error('page-lifecycle: onPageLeave callback error', e); }
    });
    clearCleanups();
  };
  document.addEventListener('astro:before-swap', swapHandler);
}

export function registerCleanup(fn) {
  assertFunction(fn, 'registerCleanup');
  bindSwapHandler();
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}

export function clearCleanups() {
  const pending = [...cleanups];
  cleanups.clear();
  pending.forEach(fn => {
    try { fn(); } catch (e) { console.error('page-lifecycle: cleanup error', e); }
  });
}

export function onPageLeave(fn) {
  assertFunction(fn, 'onPageLeave');
  bindSwapHandler();
  leaveCallbacks.add(fn);
  return () => leaveCallbacks.delete(fn);
}

export function onPageEnter(fn) {
  assertFunction(fn, 'onPageEnter');
  const handler = (e) => {
    try { fn(e); } catch (e2) { console.error('page-lifecycle: onPageEnter callback error', e2); }
  };
  enterCallbacks.add(handler);
  document.addEventListener('astro:page-load', handler);
  return () => {
    enterCallbacks.delete(handler);
    document.removeEventListener('astro:page-load', handler);
  };
}

export function _reset() {
  cleanups.clear();
  leaveCallbacks.clear();
  enterCallbacks.forEach(handler => {
    document.removeEventListener('astro:page-load', handler);
  });
  enterCallbacks.clear();
  if (swapHandler) {
    document.removeEventListener('astro:before-swap', swapHandler);
    swapHandler = null;
  }
}

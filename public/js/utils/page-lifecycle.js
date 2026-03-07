let cleanups = [];
let enterCallbacks = [];

export function registerCleanup(fn) {
  if (typeof fn === 'function') {
    cleanups.push(fn);
  }
}

export function onPageEnter(fn) {
  if (typeof fn === 'function') {
    enterCallbacks.push(fn);
  }
}

export function onPageLeave(fn) {
  registerCleanup(fn);
}

export function runCleanups() {
  const fns = cleanups.splice(0);
  for (const fn of fns) {
    try {
      fn();
    } catch (e) {
      console.error('[page-lifecycle] cleanup error:', e);
    }
  }
  // Clear enter callbacks so old page handlers do not fire on next page-load
  _removeEnterListeners();
}

function _onPageLoad() {
  const cbs = enterCallbacks.splice(0);
  for (const cb of cbs) {
    try {
      cb();
    } catch (e) {
      console.error('[page-lifecycle] enter callback error:', e);
    }
  }
}

let _pageLoadHandler = null;

function _ensurePageLoadListener() {
  if (!_pageLoadHandler) {
    _pageLoadHandler = () => _onPageLoad();
    document.addEventListener('astro:page-load', _pageLoadHandler);
  }
}

function _removeEnterListeners() {
  enterCallbacks.length = 0;
}

// Listen for Astro's before-swap event to run cleanups before page content is replaced
document.addEventListener('astro:before-swap', () => runCleanups());

// Auto-attach page-load listener
_ensurePageLoadListener();

// Test-only reset function
export function _reset() {
  cleanups.length = 0;
  enterCallbacks.length = 0;
  if (_pageLoadHandler) {
    document.removeEventListener('astro:page-load', _pageLoadHandler);
    _pageLoadHandler = null;
  }
  _ensurePageLoadListener();
}

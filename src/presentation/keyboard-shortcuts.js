/**
 * Global keyboard shortcuts handler.
 * Registers/unregisters keyboard shortcuts for the application.
 * Skips shortcuts when an input or textarea is focused.
 *
 * @module presentation/keyboard-shortcuts
 */

/**
 * @typedef {{ id: string; key: string; meta?: boolean; description: string }} ShortcutDef
 */

/** @type {Record<string, ShortcutDef>} */
export const SHORTCUTS = {
  'Meta+k': {
    id: 'command-palette',
    key: 'k',
    meta: true,
    description: 'Open command palette',
  },
  c: {
    id: 'create-card',
    key: 'c',
    description: 'Create new card',
  },
  t: {
    id: 'tab-tasks',
    key: 't',
    description: 'Switch to tasks tab',
  },
  b: {
    id: 'tab-bugs',
    key: 'b',
    description: 'Switch to bugs tab',
  },
  e: {
    id: 'tab-epics',
    key: 'e',
    description: 'Switch to epics tab',
  },
  '1': {
    id: 'view-board',
    key: '1',
    description: 'Board view',
  },
  '2': {
    id: 'view-table',
    key: '2',
    description: 'Table view',
  },
  '3': {
    id: 'view-calendar',
    key: '3',
    description: 'Calendar view',
  },
  '4': {
    id: 'view-gantt',
    key: '4',
    description: 'Gantt view',
  },
  ArrowUp: {
    id: 'navigate-up',
    key: 'ArrowUp',
    description: 'Navigate cards up',
  },
  ArrowDown: {
    id: 'navigate-down',
    key: 'ArrowDown',
    description: 'Navigate cards down',
  },
  Enter: {
    id: 'open-card',
    key: 'Enter',
    description: 'Open selected card',
  },
  Escape: {
    id: 'close-panel',
    key: 'Escape',
    description: 'Close panel / modal',
  },
  '/': {
    id: 'focus-search',
    key: '/',
    description: 'Focus search input',
  },
};

/**
 * Check if an input-like element is currently focused.
 * @returns {boolean}
 */
export function isInputFocused() {
  if (typeof globalThis.document === 'undefined') return false;
  const el = globalThis.document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.getAttribute('contenteditable') === 'true'
  );
}

/** @type {((e: KeyboardEvent) => void) | null} */
let _handler = null;

/**
 * Resolve the shortcut key for a keyboard event.
 * @param {KeyboardEvent} e
 * @returns {ShortcutDef | null}
 */
function resolveShortcut(e) {
  // Meta/Ctrl + key
  if (e.metaKey || e.ctrlKey) {
    const def = SHORTCUTS[`Meta+${e.key.toLowerCase()}`];
    return def || null;
  }
  return SHORTCUTS[e.key] || null;
}

/**
 * Register global keyboard shortcuts.
 * Dispatches 'pg-shortcut' CustomEvents on the document.
 */
export function registerShortcuts() {
  if (typeof globalThis.document === 'undefined') return;
  if (_handler) return; // already registered

  _handler = (/** @type {KeyboardEvent} */ e) => {
    const shortcut = resolveShortcut(e);
    if (!shortcut) return;

    // Meta+K always works (even in inputs)
    if (shortcut.meta) {
      e.preventDefault();
      globalThis.document.dispatchEvent(
        new CustomEvent('pg-shortcut', {
          detail: { shortcutId: shortcut.id },
          bubbles: true,
        })
      );
      return;
    }

    // Skip non-meta shortcuts when input is focused
    if (isInputFocused()) return;

    e.preventDefault();
    globalThis.document.dispatchEvent(
      new CustomEvent('pg-shortcut', {
        detail: { shortcutId: shortcut.id },
        bubbles: true,
      })
    );
  };

  globalThis.document.addEventListener('keydown', _handler);
}

/**
 * Unregister global keyboard shortcuts.
 */
export function unregisterShortcuts() {
  if (typeof globalThis.document === 'undefined') return;
  if (_handler) {
    globalThis.document.removeEventListener('keydown', _handler);
    _handler = null;
  }
}

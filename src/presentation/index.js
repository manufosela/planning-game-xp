/**
 * Barrel export for the presentation layer.
 *
 * @module presentation
 */

export { currentRoute, navigate, matchRoute, parseParams, initRouter, ROUTES } from './router.js';
export { PgApp, ROUTE_COMPONENTS } from './pg-app.js';
export { PgCommand, fuzzyMatch, DEFAULT_ACTIONS } from './pg-command.js';
export {
  registerShortcuts,
  unregisterShortcuts,
  SHORTCUTS,
  isInputFocused,
} from './keyboard-shortcuts.js';

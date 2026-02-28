/**
 * Color Utilities
 *
 * Provides color manipulation functions for the theme system:
 * - Contrast detection (WCAG luminance-based)
 * - Color darkening for gradients
 * - Status-to-CSS-variable mapping
 * - Dynamic status color resolution from CSS variables
 */

const HEX_REGEX = /^#([0-9A-Fa-f]{6})$/;

/**
 * Parse hex color to RGB components
 * @param {string} hex - Hex color string (e.g., '#4a9eff')
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function hexToRgb(hex) {
  const match = HEX_REGEX.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1].substring(0, 2), 16),
    g: parseInt(match[1].substring(2, 4), 16),
    b: parseInt(match[1].substring(4, 6), 16),
  };
}

/**
 * Convert RGB components to hex string
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} Hex color string
 */
export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/**
 * Calculate relative luminance per WCAG 2.0
 * @param {string} hex - Hex color string
 * @returns {number} Luminance value (0-1)
 */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const linearize = (c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

/**
 * Get optimal contrast text color (black or white) for a background
 * Uses WCAG luminance threshold
 * @param {string} hex - Background hex color
 * @returns {string} '#000000' or '#ffffff'
 */
export function getContrastColor(hex) {
  return relativeLuminance(hex) > 0.179 ? '#000000' : '#ffffff';
}

/**
 * Darken a hex color by a percentage
 * @param {string} hex - Hex color string
 * @param {number} amount - Darken amount (0-1, e.g., 0.2 = 20% darker)
 * @returns {string} Darkened hex color
 */
export function darkenColor(hex, amount = 0.2) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r * (1 - amount),
    rgb.g * (1 - amount),
    rgb.b * (1 - amount)
  );
}

/**
 * Generate a gradient string from a base color
 * @param {string} hex - Base hex color
 * @returns {string} CSS linear-gradient value
 */
export function statusGradient(hex) {
  return `linear-gradient(135deg, ${hex}, ${darkenColor(hex, 0.2)})`;
}

/**
 * Map from normalized status names to CSS variable names.
 * Covers task statuses, bug statuses, and priorities.
 */
const STATUS_TO_CSS_VAR = {
  // Task statuses
  'to do': '--status-todo',
  'todo': '--status-todo',
  'backlog': '--status-todo',
  'in progress': '--status-in-progress',
  'doing': '--status-in-progress',
  'pausado': '--status-in-progress',
  'to validate': '--status-to-validate',
  'tovalidate': '--status-to-validate',
  'done': '--status-done',
  'done&validated': '--status-done',
  'completed': '--status-done',
  'blocked': '--status-blocked',
  'reopened': '--status-blocked',
  'expedited': '--status-expedited',
};

/**
 * Hardcoded fallback colors for statuses not in the theme config.
 * These are used when no CSS variable is available.
 */
const STATUS_FALLBACK_COLORS = {
  // Task statuses (match semantic token defaults)
  'to do': '#449bd3',
  'todo': '#449bd3',
  'backlog': '#6c757d',
  'ready': '#20c997',
  'in progress': '#cce500',
  'doing': '#cce500',
  'pausado': '#ff9800',
  'to validate': '#ff6600',
  'tovalidate': '#ff6600',
  'done': '#d4edda',
  'done&validated': '#d4edda',
  'completed': '#d4edda',
  'blocked': '#f8d7da',
  'reopened': '#9c27b0',
  'expedited': '#ec3e95',
  'on hold': '#fd7e14',
  'qa': '#6f42c1',
  'review': '#6f42c1',
  'archived': '#adb5bd',
  // Bug statuses
  'created': '#6c757d',
  'assigned': '#4a9eff',
  'fixed': '#28a745',
  'verified': '#20c997',
  'closed': '#14532d',
  // Bug priorities
  'application blocker': '#dc3545',
  'department blocker': '#fd7e14',
  'individual blocker': '#ffc107',
  'user experience issue': '#28a745',
  'workflow improvement': '#17a2b8',
  'workflow improvment': '#17a2b8',
  'workaround available issue': '#6c757d',
  'not evaluated': '#6c757d',
  'no evaluado': '#6c757d',
  // Priority levels
  'high': '#dc3545',
  'medium': '#ffc107',
  'low': '#28a745',
  'default': '#6c757d',
  // Proposal statuses
  'propuesta': '#6c757d',
  'en revisión': '#0d6efd',
  'en revision': '#0d6efd',
  'aprobada': '#198754',
  'rechazada': '#dc3545',
  'en desarrollo': '#fd7e14',
  'implementada': '#2ab27b',
  'descartada': '#343a40',
  // Other
  'open': '#0d6efd',
  'triaged': '#6c757d',
  'in testing': '#6f42c1',
  'cerrado': '#6c757d',
  'rejected': '#343a40',
};

/**
 * Resolve a status color from CSS variables, falling back to defaults.
 * @param {string} status - Status name (any casing)
 * @returns {string} Hex color string
 */
export function resolveStatusColor(status) {
  const normalized = status.toLowerCase().trim();
  const cssVar = STATUS_TO_CSS_VAR[normalized];

  if (cssVar) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (value && HEX_REGEX.test(value)) {
      return value;
    }
  }

  return STATUS_FALLBACK_COLORS[normalized] || '#6c757d';
}

/**
 * Get status color as an object with background and foreground.
 * Background is a gradient; foreground is auto-contrast text color.
 * @param {string} status - Status name (any casing)
 * @returns {{ bg: string, fg: string }} Background gradient and foreground color
 */
export function getStatusColorPair(status) {
  const baseColor = resolveStatusColor(status);
  return {
    bg: statusGradient(baseColor),
    fg: getContrastColor(baseColor),
  };
}

/**
 * Regression guards for PLN-BUG-0120 — URL filter restoration.
 *
 * The old _restoreFiltersFromUrl looked up the <unified-filters> element
 * and called filterComponent.applyFilters(), a method that only existed
 * on the deprecated BaseFilters. The typeof-guard made it a silent no-op,
 * so filters shared via URL never re-applied. The companion
 * _getPreservedFilters/_restoreFiltersAfterRender pair queried a
 * '<section>-filters' tag that never existed — double dead code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'public/js/controllers/app-controller.js'),
  'utf8'
);

describe('PLN-BUG-0120 — URL filters restore through the service', () => {
  it('_restoreFiltersFromUrl delegates to UnifiedFilterService.setFilters', () => {
    const fnStart = SOURCE.indexOf('_restoreFiltersFromUrl(filters)');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = SOURCE.slice(fnStart, fnStart + 1200);
    expect(fnBody).toMatch(/getUnifiedFilterService\(\)\.setFilters\(/);
  });

  it('does NOT probe for the phantom component method (typeof ... applyFilters)', () => {
    expect(SOURCE).not.toMatch(/typeof\s+filterComponent\.applyFilters/);
  });

  it('the dead preserve/restore pair is gone', () => {
    expect(SOURCE).not.toMatch(/_getPreservedFilters\s*\(/);
    expect(SOURCE).not.toMatch(/_restoreFiltersAfterRender\s*\(/);
    // The phantom selector it used ('<section>-filters') must not return.
    expect(SOURCE).not.toMatch(/querySelector\(`\$\{section\}-filters`\)/);
  });
});

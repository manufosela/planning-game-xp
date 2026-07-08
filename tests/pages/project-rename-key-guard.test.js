/**
 * Regression guard for PLN-BUG-0109
 *
 * Editing the display name of a project must NOT rename the RTDB key.
 * The projectId (the key under /projects/, /cards/, /projectCounters/, etc.)
 * is immutable through the normal edit form — otherwise the project ends up
 * orphaned in the UI because /cards/{oldName}/ still holds the data.
 *
 * This test parses adminproject.astro and projects.astro looking for the
 * dangerous pattern and fails if it reappears.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FILES = [
  'src/pages/partials/adminproject.astro',
  'src/pages/partials/projects.astro'
];

// The unmistakable signature of the bug: wiping /projects/${originalProjectName}
// (the old key) as part of a rename. If this reappears, the fix regressed.
// We deliberately do NOT flag `set(ref(..., `/projects/${formData.projectName}`))`
// alone because that is the legitimate pattern used by createProject on new records.
const DANGEROUS_PATTERNS = [
  /set\(\s*ref\([^,]+,\s*`\/projects\/\$\{originalProjectName\}`\s*\)\s*,\s*null\s*\)/
];

describe('PLN-BUG-0109 — project rename must not touch the RTDB key', () => {
  for (const file of FILES) {
    it(`${file} does not rename /projects/{key} on name change`, () => {
      const content = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const pattern of DANGEROUS_PATTERNS) {
        expect(content, `pattern ${pattern} found in ${file}`).not.toMatch(pattern);
      }
    });
  }
});

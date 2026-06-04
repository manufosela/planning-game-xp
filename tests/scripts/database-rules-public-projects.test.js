/**
 * Tests for the /publicProjects node in database.rules.json — the public
 * directory written by syncProjectPublicViews. Anyone may read; only the
 * Admin SDK writes; the schema is a strict whitelist (name, description,
 * abbreviation, languages, frameworks, repoUrl, updatedAt).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const INSTANCES_DIR = path.join(process.cwd(), 'planning-game-instances');
const INSTANCES = ['manufosela', 'demo'];

function loadRules(instanceName) {
  const rulesPath = path.join(INSTANCES_DIR, instanceName, 'database.rules.json');
  if (!fs.existsSync(rulesPath)) return null;
  return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
}

describe('database.rules.json - /publicProjects directory node', () => {
  for (const instance of INSTANCES) {
    describe(`Instance: ${instance}`, () => {
      const rules = loadRules(instance);

      // Instances live under planning-game-instances/* which is gitignored.
      // Skip on environments (CI, fresh clones) where the instance is absent.
      it('exposes /publicProjects as a top-level node', () => {
        if (!rules) return;
        expect(rules.rules).toHaveProperty('publicProjects');
      });

      it('allows unauthenticated reads (login-less directory)', () => {
        if (!rules) return;
        expect(rules.rules.publicProjects['.read']).toBe(true);
      });

      it('forbids client writes (only Admin SDK populates it)', () => {
        if (!rules) return;
        expect(rules.rules.publicProjects['.write']).toBe(false);
      });

      it('declares a $projectId entry shape with updatedAt as required', () => {
        if (!rules) return;
        const entry = rules.rules.publicProjects['$projectId'];
        expect(entry).toBeDefined();
        expect(entry['.validate']).toContain('updatedAt');
      });

      it('whitelists only the public directory fields', () => {
        if (!rules) return;
        const entry = rules.rules.publicProjects['$projectId'];
        const whitelistedKeys = ['name', 'description', 'abbreviation', 'repoUrl', 'languages', 'frameworks', 'updatedAt'];

        for (const field of whitelistedKeys) {
          expect(entry).toHaveProperty(field);
          expect(entry[field]).toHaveProperty('.validate');
        }
      });

      it('rejects unknown fields via $other ".validate: false"', () => {
        if (!rules) return;
        const entry = rules.rules.publicProjects['$projectId'];
        expect(entry).toHaveProperty('$other');
        expect(entry['$other']['.validate']).toBe(false);
      });

      it('does NOT expose sensitive fields in the schema', () => {
        if (!rules) return;
        const entry = rules.rules.publicProjects['$projectId'];
        const forbidden = ['developers', 'stakeholders', 'serviceAccountKey', 'publicToken', 'businessContext', 'agentsGuidelines'];
        for (const field of forbidden) {
          expect(entry).not.toHaveProperty(field);
        }
      });

      it('keeps the existing /publicViews block (project-public-readable cards)', () => {
        if (!rules) return;
        // Regression: the new node must coexist with /publicViews/, not replace it.
        expect(rules.rules).toHaveProperty('publicViews');
        expect(rules.rules.publicViews).toHaveProperty('$projectId');
      });
    });
  }
});

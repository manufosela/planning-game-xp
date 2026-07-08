/**
 * Verify each instance's database.rules.json declares the taskCategory
 * and completionNote validators under /cards/... (PLN-TSK-0354).
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

describe('database.rules.json — taskCategory + completionNote validators', () => {
  for (const instance of INSTANCES) {
    describe(`Instance: ${instance}`, () => {
      const rules = loadRules(instance);

      it('has a cards block with card-level validation', () => {
        if (!rules) return;
        const cards = rules.rules.cards;
        expect(cards).toBeDefined();
        expect(cards.$projectId).toBeDefined();
        expect(cards.$projectId.$section).toBeDefined();
        expect(cards.$projectId.$section.$cardId).toBeDefined();
      });

      it('taskCategory validate accepts only "code" or "nocode"', () => {
        if (!rules) return;
        const rule = rules.rules.cards.$projectId.$section.$cardId.taskCategory;
        expect(rule).toBeDefined();
        expect(rule['.validate']).toContain("'code'");
        expect(rule['.validate']).toContain("'nocode'");
        expect(rule['.validate']).toContain('!newData.exists()');
      });

      it('completionNote validate ensures string when present', () => {
        if (!rules) return;
        const rule = rules.rules.cards.$projectId.$section.$cardId.completionNote;
        expect(rule).toBeDefined();
        expect(rule['.validate']).toContain('newData.isString()');
        expect(rule['.validate']).toContain('!newData.exists()');
      });
    });
  }
});

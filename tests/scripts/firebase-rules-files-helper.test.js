import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  ensureRequiredFirebaseRuleFiles,
} = await import('../../scripts/firebase-rules-files-helper.cjs');

describe('firebase rules files helper', () => {
  it('should create missing firebase rule files from template sources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-rules-'));
    fs.writeFileSync(path.join(root, 'database.rules.example.json'), '{"rules":{".read":false,".write":false}}');
    fs.writeFileSync(path.join(root, 'storage.rules.example'), 'rules_version = \'2\';');
    fs.writeFileSync(path.join(root, 'backup-firestore.rules'), 'rules_version = \'2\';');

    const result = ensureRequiredFirebaseRuleFiles(root);
    expect(result.created).toContain('database.rules.json');
    expect(result.created).toContain('database.test.rules.json');
    expect(result.created).toContain('firestore.rules');
    expect(result.created).toContain('storage.rules');

    expect(fs.existsSync(path.join(root, 'database.rules.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'database.test.rules.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'firestore.rules'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'storage.rules'))).toBe(true);
  });

  it('should not overwrite existing rule files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-rules-'));
    fs.writeFileSync(path.join(root, 'database.rules.example.json'), '{"rules":{}}');
    fs.writeFileSync(path.join(root, 'database.rules.json'), '{"rules":{"x":true}}');

    const result = ensureRequiredFirebaseRuleFiles(root);
    expect(result.created).not.toContain('database.rules.json');
    expect(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8')).toContain('"x":true');
  });
});

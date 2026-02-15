import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  setDefaultFirebaseProject,
  isActiveFirebaseProject,
} = await import('../../scripts/firebase-project-context-helper.cjs');

describe('firebase-project-context-helper', () => {
  it('should create/update .firebaserc default project', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fbctx-'));
    setDefaultFirebaseProject(root, 'my-project');
    const rc = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
    expect(rc.projects.default).toBe('my-project');
  });

  it('should preserve extra aliases when updating .firebaserc', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fbctx-'));
    fs.writeFileSync(path.join(root, '.firebaserc'), JSON.stringify({
      projects: { default: 'old', staging: 'stage-proj' },
    }, null, 2));
    setDefaultFirebaseProject(root, 'new-project');
    const rc = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
    expect(rc.projects.default).toBe('new-project');
    expect(rc.projects.staging).toBe('stage-proj');
  });

  it('should detect active project from firebase use output', () => {
    const execSync = vi.fn(() => 'Active Project: my-project (my-project)');
    expect(isActiveFirebaseProject('/tmp', 'my-project', { execSync })).toBe(true);
  });
});

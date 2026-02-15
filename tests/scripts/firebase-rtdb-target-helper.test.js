import { describe, it, expect, vi } from 'vitest';

const {
  parseRtdbInstanceNameFromUrl,
  buildDatabaseTargetApplyCommand,
  ensureDatabaseTargets,
  ensureDatabaseTargetsInFirebaserc,
  hasDatabaseTargetConfigured,
} = await import('../../scripts/firebase-rtdb-target-helper.cjs');
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('firebase rtdb target helper', () => {
  it('should parse instance name from RTDB URL', () => {
    const name = parseRtdbInstanceNameFromUrl('https://planning-game-xp-default-rtdb.europe-west1.firebasedatabase.app');
    expect(name).toBe('planning-game-xp-default-rtdb');
  });

  it('should build target apply command with account', () => {
    const cmd = buildDatabaseTargetApplyCommand({
      projectId: 'my-project',
      targetName: 'main',
      instanceName: 'my-project-default-rtdb',
      accountEmail: 'dev@example.com',
    });
    expect(cmd).toContain('firebase target:apply database main my-project-default-rtdb');
    expect(cmd).toContain('--project my-project');
    expect(cmd).toContain('--account dev@example.com');
  });

  it('should apply main and tests targets automatically', () => {
    const run = vi.fn().mockReturnValue('');
    const result = ensureDatabaseTargets({
      projectId: 'my-project',
      databaseUrl: 'https://my-project-default-rtdb.europe-west1.firebasedatabase.app',
      accountEmail: 'dev@example.com',
      deps: { execSync: run },
    });

    expect(result.instanceName).toBe('my-project-default-rtdb');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('should persist targets in .firebaserc', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-targets-'));
    fs.writeFileSync(path.join(root, '.firebaserc'), JSON.stringify({
      projects: { default: 'my-project' },
    }, null, 2));

    ensureDatabaseTargetsInFirebaserc({
      rootDir: root,
      projectId: 'my-project',
      instanceName: 'my-project-default-rtdb',
    });

    expect(hasDatabaseTargetConfigured({
      rootDir: root,
      projectId: 'my-project',
      targetName: 'main',
    })).toBe(true);
    expect(hasDatabaseTargetConfigured({
      rootDir: root,
      projectId: 'my-project',
      targetName: 'tests',
    })).toBe(true);
  });
});

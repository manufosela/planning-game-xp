import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { detectExistingState } = await import('../../scripts/setup-existing-state.cjs');

describe('detectExistingState', () => {
  function makeTmpRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'setup-existing-state-'));
  }

  it('should not mark existing setup when only env files exist', () => {
    const rootDir = makeTmpRoot();
    fs.writeFileSync(
      path.join(rootDir, '.env.dev'),
      'PUBLIC_FIREBASE_PROJECT_ID=planning-gamexp\nPUBLIC_FIREBASE_DATABASE_URL=https://planning-gamexp-default-rtdb.europe-west1.firebasedatabase.app\n',
      'utf8'
    );

    const state = detectExistingState(rootDir, {
      managerFactory: () => ({
        listInstances: () => [],
        findByFirebaseProject: () => null,
      }),
    });

    expect(state.hasExistingSetup).toBe(false);
    expect(state.envFiles.dev).toBe(true);
    expect(state.firebaseProjectId).toBe('planning-gamexp');
  });

  it('should mark existing setup when MCP instances exist', () => {
    const rootDir = makeTmpRoot();

    const state = detectExistingState(rootDir, {
      managerFactory: () => ({
        listInstances: () => [{ name: 'pro', firebaseProjectId: 'planning-gamexp' }],
        findByFirebaseProject: () => null,
      }),
    });

    expect(state.hasExistingSetup).toBe(true);
    expect(state.mcpInstances).toHaveLength(1);
    expect(state.mcpInstances[0].name).toBe('pro');
  });

  it('should resolve matchingInstance when project id matches an MCP instance', () => {
    const rootDir = makeTmpRoot();
    fs.writeFileSync(
      path.join(rootDir, '.env.prod'),
      'PUBLIC_FIREBASE_PROJECT_ID=planning-gamexp\n',
      'utf8'
    );

    const matching = { name: 'pro', firebaseProjectId: 'planning-gamexp' };
    const state = detectExistingState(rootDir, {
      managerFactory: () => ({
        listInstances: () => [matching],
        findByFirebaseProject: (projectId) => (projectId === 'planning-gamexp' ? matching : null),
      }),
    });

    expect(state.hasExistingSetup).toBe(true);
    expect(state.matchingInstance).toEqual(matching);
  });
});

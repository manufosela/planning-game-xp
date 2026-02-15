import { describe, it, expect } from 'vitest';
import { resolveFirebaseProjectId, buildIaContextUrl } from '../../public/js/utils/firebase-project-utils.js';

describe('firebase-project-utils', () => {
  it('should resolve project id from firebase config', () => {
    expect(resolveFirebaseProjectId({ projectId: 'my-project' })).toBe('my-project');
  });

  it('should throw when project id is missing', () => {
    expect(() => resolveFirebaseProjectId({})).toThrow('Missing Firebase projectId');
  });

  it('should build IA context url with resolved project id', () => {
    const url = buildIaContextUrl('abc123', { projectId: 'my-project' });
    expect(url).toBe('https://europe-west1-my-project.cloudfunctions.net/getIaContext/abc123');
  });
});

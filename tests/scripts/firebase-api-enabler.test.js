import { describe, it, expect, vi } from 'vitest';

const {
  buildEnableServicesCommand,
  enableRequiredProjectApis,
} = await import('../../scripts/firebase-api-enabler.cjs');

describe('firebase api enabler', () => {
  it('should build gcloud services enable command', () => {
    const cmd = buildEnableServicesCommand({
      projectId: 'my-project',
      services: ['firebaseextensions.googleapis.com', 'cloudbuild.googleapis.com'],
      accountEmail: 'dev@example.com',
    });

    expect(cmd).toContain('gcloud services enable');
    expect(cmd).toContain('firebaseextensions.googleapis.com');
    expect(cmd).toContain('cloudbuild.googleapis.com');
    expect(cmd).toContain('--project my-project');
    expect(cmd).toContain('--account dev@example.com');
  });

  it('should enable services and return success', () => {
    const run = vi.fn().mockReturnValue('');
    const result = enableRequiredProjectApis({
      projectId: 'my-project',
      services: ['firebaseextensions.googleapis.com'],
      accountEmail: '',
      deps: { execSync: run },
    });

    expect(result.enabled).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('should return false when gcloud is unavailable', () => {
    const run = vi.fn().mockImplementation(() => {
      throw new Error('gcloud: command not found');
    });

    const result = enableRequiredProjectApis({
      projectId: 'my-project',
      services: ['firebaseextensions.googleapis.com'],
      deps: { execSync: run },
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('gcloud');
  });
});

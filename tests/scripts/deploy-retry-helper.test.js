import { describe, it, expect } from 'vitest';

const {
  getMissingApiFromDeployError,
  shouldRetryFunctionsDeploy,
} = await import('../../scripts/deploy-retry-helper.cjs');

describe('deploy retry helper', () => {
  it('should extract missing api on 403 from deploy error', () => {
    const text = 'Request to https://secretmanager.googleapis.com/v1/projects/p/secrets/x had HTTP Error: 403';
    expect(getMissingApiFromDeployError(text)).toBe('secretmanager.googleapis.com');
  });

  it('should return null when no api url is present', () => {
    expect(getMissingApiFromDeployError('Command failed')).toBeNull();
  });

  it('should retry when api is missing and attempts remain', () => {
    const text = 'Request to https://firebaseextensions.googleapis.com/v1beta/projects/p/instances had HTTP Error: 403';
    expect(shouldRetryFunctionsDeploy(text, 1, 3)).toBe(true);
  });

  it('should not retry when no api is missing', () => {
    expect(shouldRetryFunctionsDeploy('Some syntax error', 1, 3)).toBe(false);
  });

  it('should not retry after max attempts', () => {
    const text = 'Request to https://firebaseextensions.googleapis.com/v1beta/projects/p/instances had HTTP Error: 403';
    expect(shouldRetryFunctionsDeploy(text, 3, 3)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';

const {
  getMissingApiFromDeployError,
  getMissingSecretFromDeployError,
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

  it('should extract missing secret from non-interactive firebase error', () => {
    const text = 'Error: In non-interactive mode but have no value for the secret: IA_GLOBAL_ENABLE';
    expect(getMissingSecretFromDeployError(text)).toBe('IA_GLOBAL_ENABLE');
  });

  it('should extract missing secret from firebase hint command', () => {
    const text = 'Set this secret before deploying:\n\tfirebase functions:secrets:set CREATE_CARD_API_KEY';
    expect(getMissingSecretFromDeployError(text)).toBe('CREATE_CARD_API_KEY');
  });

  it('should retry when secret is missing and attempts remain', () => {
    const text = 'Error: In non-interactive mode but have no value for the secret: IA_API_KEY';
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

import { describe, it, expect } from 'vitest';

const {
  extractMissingApiFromErrorText,
} = await import('../../scripts/firebase-api-error-parser.cjs');

describe('firebase api error parser', () => {
  it('should extract secret manager api from firebase error output', () => {
    const text = 'Request to https://secretmanager.googleapis.com/v1/projects/x/secrets/y had HTTP Error: 403';
    expect(extractMissingApiFromErrorText(text)).toBe('secretmanager.googleapis.com');
  });

  it('should extract extensions api from firebase error output', () => {
    const text = 'Request to https://firebaseextensions.googleapis.com/v1beta/projects/x/instances had HTTP Error: 403';
    expect(extractMissingApiFromErrorText(text)).toBe('firebaseextensions.googleapis.com');
  });

  it('should return null when no api url is present', () => {
    expect(extractMissingApiFromErrorText('Command failed')).toBeNull();
  });
});

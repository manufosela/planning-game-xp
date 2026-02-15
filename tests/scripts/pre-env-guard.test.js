import { describe, it, expect } from 'vitest';
import { parseEnvContent, evaluatePreEnvSafety } from '../../scripts/pre-env-guard-lib.js';

describe('pre-env-guard', () => {
  it('should parse env content correctly', () => {
    const parsed = parseEnvContent(`
PUBLIC_FIREBASE_PROJECT_ID=my-pre
PUBLIC_FIREBASE_DATABASE_URL=https://my-pre.firebaseio.com
`);
    expect(parsed.PUBLIC_FIREBASE_PROJECT_ID).toBe('my-pre');
    expect(parsed.PUBLIC_FIREBASE_DATABASE_URL).toBe('https://my-pre.firebaseio.com');
  });

  it('should fail when pre project id equals prod project id', () => {
    const result = evaluatePreEnvSafety(
      { PUBLIC_FIREBASE_PROJECT_ID: 'same-project' },
      { PUBLIC_FIREBASE_PROJECT_ID: 'same-project' }
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('PUBLIC_FIREBASE_PROJECT_ID'))).toBe(true);
  });

  it('should fail when pre database url equals prod database url', () => {
    const result = evaluatePreEnvSafety(
      { PUBLIC_FIREBASE_DATABASE_URL: 'https://same-db' },
      { PUBLIC_FIREBASE_DATABASE_URL: 'https://same-db' }
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('PUBLIC_FIREBASE_DATABASE_URL'))).toBe(true);
  });

  it('should pass when pre and prod are different', () => {
    const result = evaluatePreEnvSafety(
      {
        PUBLIC_FIREBASE_PROJECT_ID: 'pre-project',
        PUBLIC_FIREBASE_DATABASE_URL: 'https://pre-db'
      },
      {
        PUBLIC_FIREBASE_PROJECT_ID: 'prod-project',
        PUBLIC_FIREBASE_DATABASE_URL: 'https://prod-db'
      }
    );
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});

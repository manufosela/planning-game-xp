import { describe, it, expect, vi } from 'vitest';

const {
  checkFirestoreEnabled,
} = await import('../../scripts/firestore-status-checker.cjs');

describe('checkFirestoreEnabled', () => {
  it('should return enabled when firestore list json contains default database', () => {
    const execSync = vi.fn(() => JSON.stringify({
      result: [
        { databaseId: '(default)', type: 'FIRESTORE_NATIVE' },
      ],
    }));

    const result = checkFirestoreEnabled('my-project', { execSync });

    expect(result.enabled).toBe(true);
    expect(result.source).toBe('json');
  });

  it('should return disabled when firestore list json has no databases', () => {
    const execSync = vi.fn(() => JSON.stringify({ result: [] }));

    const result = checkFirestoreEnabled('my-project', { execSync });

    expect(result.enabled).toBe(false);
    expect(result.source).toBe('json');
  });

  it('should fallback to text parsing when json output is invalid', () => {
    const execSync = vi
      .fn()
      .mockImplementationOnce(() => '{not-json')
      .mockImplementationOnce(() => 'default (default)\nlocation: eur3');

    const result = checkFirestoreEnabled('my-project', { execSync });

    expect(result.enabled).toBe(true);
    expect(result.source).toBe('text');
  });

  it('should return unknown when command fails', () => {
    const execSync = vi.fn(() => {
      throw new Error('firebase cli failed');
    });

    const result = checkFirestoreEnabled('my-project', { execSync });

    expect(result.enabled).toBe(null);
    expect(result.source).toBe('error');
    expect(result.reason).toContain('firebase cli failed');
  });
});

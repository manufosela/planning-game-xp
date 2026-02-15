import { describe, it, expect, vi } from 'vitest';

const {
  checkFunctionsEnabled,
} = await import('../../scripts/functions-status-checker.cjs');

describe('checkFunctionsEnabled', () => {
  it('should return enabled when functions list command succeeds', () => {
    const execSync = vi.fn(() => JSON.stringify({ result: [] }));

    const result = checkFunctionsEnabled('my-project', { execSync });

    expect(result.enabled).toBe(true);
    expect(result.source).toBe('json');
  });

  it('should include --account flag when account email is provided', () => {
    const execSync = vi.fn(() => JSON.stringify({ result: [] }));
    checkFunctionsEnabled('my-project', { execSync, accountEmail: 'pro@example.com' });
    expect(execSync.mock.calls[0][0]).toContain('--account pro@example.com');
  });

  it('should return disabled when api-not-enabled error is returned', () => {
    const execSync = vi.fn(() => {
      const err = new Error('Cloud Functions API has not been used in project');
      err.stderr = 'Cloud Functions API has not been used in project';
      throw err;
    });

    const result = checkFunctionsEnabled('my-project', { execSync });

    expect(result.enabled).toBe(false);
    expect(result.source).toBe('error');
    expect(result.reason).toContain('Cloud Functions API has not been used in project');
  });

  it('should return unknown on generic command failure', () => {
    const execSync = vi.fn(() => {
      throw new Error('firebase cli failed');
    });

    const result = checkFunctionsEnabled('my-project', { execSync });

    expect(result.enabled).toBe(null);
    expect(result.source).toBe('error');
    expect(result.reason).toContain('firebase cli failed');
  });
});

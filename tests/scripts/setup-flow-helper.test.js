import { describe, it, expect } from 'vitest';

const {
  shouldClearInstallState,
} = await import('../../scripts/setup-flow-helper.cjs');

describe('setup flow helper', () => {
  it('should clear state when restart is selected', () => {
    expect(shouldClearInstallState('restart')).toBe(true);
  });

  it('should clear state when full setup is selected', () => {
    expect(shouldClearInstallState('full')).toBe(true);
  });

  it('should not clear state when resume is selected', () => {
    expect(shouldClearInstallState('resume')).toBe(false);
  });
});

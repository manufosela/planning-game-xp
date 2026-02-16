import { describe, it, expect } from 'vitest';

const { resolveInstanceName } = await import('../../scripts/instance-dev-helper.cjs');

describe('instance-dev-helper', () => {
  it('should prefer cli argument over env variable', () => {
    const name = resolveInstanceName(['node', 'scripts/instance-dev.cjs', 'manufosela'], { INSTANCE: 'other' });
    expect(name).toBe('manufosela');
  });

  it('should fallback to INSTANCE env when cli arg is missing', () => {
    const name = resolveInstanceName(['node', 'scripts/instance-dev.cjs'], { INSTANCE: 'manufosela' });
    expect(name).toBe('manufosela');
  });

  it('should return empty string when no input is provided', () => {
    const name = resolveInstanceName(['node', 'scripts/instance-dev.cjs'], {});
    expect(name).toBe('');
  });
});

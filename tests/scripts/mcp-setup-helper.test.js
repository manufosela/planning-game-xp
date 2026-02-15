import { describe, it, expect } from 'vitest';

const {
  formatMcpInstanceLabel,
  buildMcpActionOptions,
} = await import('../../scripts/mcp-setup-helper.cjs');

describe('mcp setup helper', () => {
  it('should format instance label with firebase project when available', () => {
    expect(formatMcpInstanceLabel({ name: 'pro', firebaseProjectId: 'my-project' }))
      .toBe('pro (my-project)');
  });

  it('should format instance label with name when project is missing', () => {
    expect(formatMcpInstanceLabel({ name: 'pro' })).toBe('pro');
  });

  it('should return use-existing and create-new options when instances exist', () => {
    const options = buildMcpActionOptions([{ name: 'pro' }]);
    expect(options.map((o) => o.action)).toEqual(['use-existing', 'create-new']);
  });

  it('should return only create-new when no instances exist', () => {
    const options = buildMcpActionOptions([]);
    expect(options.map((o) => o.action)).toEqual(['create-new']);
  });
});

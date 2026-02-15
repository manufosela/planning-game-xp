import { describe, it, expect } from 'vitest';

const {
  buildPreEnvironmentGuidance,
  shouldConfigurePreNowByDefault,
} = await import('../../scripts/pre-environment-guidance.cjs');

describe('pre-environment-guidance', () => {
  it('should include explicit guidance for clean installs', () => {
    const lines = buildPreEnvironmentGuidance();

    expect(lines.some((line) => line.includes('primera instalación'))).toBe(true);
    expect(lines.some((line) => line.includes('no necesitas clonar'))).toBe(true);
  });

  it('should default to not configuring pre overrides now', () => {
    expect(shouldConfigurePreNowByDefault()).toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';

const {
  buildSetupBriefingLines,
  detectFirebaseCliInstalled,
} = await import('../../scripts/setup-briefing.cjs');

describe('setup-briefing', () => {
  it('should render a fixed-width box with firebase cli check enabled', () => {
    const lines = buildSetupBriefingLines({
      firebaseCliInstalled: true,
      repoUrl: 'https://example.com/repo',
    });

    const uniqueLengths = new Set(lines.map((line) => line.length));

    expect(uniqueLengths.size).toBe(1);
    expect(lines.some((line) => line.includes('✅ Firebase CLI instalado'))).toBe(true);
    expect(lines.some((line) => line.includes('Google / Microsoft / GitHub / GitLab'))).toBe(true);
    expect(lines.some((line) => line.includes('PRE recomendado'))).toBe(false);
  });

  it('should render firebase cli as pending when not installed', () => {
    const lines = buildSetupBriefingLines({
      firebaseCliInstalled: false,
      repoUrl: 'https://example.com/repo',
    });

    expect(lines.some((line) => line.includes('☐ Firebase CLI instalado'))).toBe(true);
  });

  it('should detect firebase cli availability from execSync', () => {
    const okExec = vi.fn();
    const failExec = vi.fn(() => {
      throw new Error('not found');
    });

    expect(detectFirebaseCliInstalled({ execSync: okExec })).toBe(true);
    expect(detectFirebaseCliInstalled({ execSync: failExec })).toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';

const {
  detectAvailableAiCli,
  buildAiRescuePrompt,
  attemptAiRescue,
} = await import('../../scripts/ai-rescue-helper.cjs');

describe('ai rescue helper', () => {
  it('should prefer claude when both CLIs are available', () => {
    const run = vi.fn((cmd) => {
      if (cmd === 'which claude') return '/usr/bin/claude\n';
      if (cmd === 'which codex') return '/usr/bin/codex\n';
      throw new Error('unexpected');
    });
    expect(detectAvailableAiCli(run)).toBe('claude');
  });

  it('should fallback to codex when claude is unavailable', () => {
    const run = vi.fn((cmd) => {
      if (cmd === 'which claude') throw new Error('not found');
      if (cmd === 'which codex') return '/usr/bin/codex\n';
      throw new Error('unexpected');
    });
    expect(detectAvailableAiCli(run)).toBe('codex');
  });

  it('should build prompt with step and error context', () => {
    const prompt = buildAiRescuePrompt({
      step: 'deploy',
      rootDir: '/tmp/project',
      errorText: 'HTTP Error: 403',
    });

    expect(prompt).toContain('deploy');
    expect(prompt).toContain('/tmp/project');
    expect(prompt).toContain('HTTP Error: 403');
  });

  it('should skip rescue when no AI CLI is available', () => {
    const run = vi.fn(() => { throw new Error('not found'); });
    const result = attemptAiRescue({
      step: 'deploy',
      rootDir: '/tmp/project',
      errorText: 'error',
      deps: { execSync: run },
    });

    expect(result.attempted).toBe(false);
    expect(result.success).toBe(false);
  });

  it('should attempt rescue when claude is available', () => {
    const run = vi.fn((cmd) => {
      if (cmd === 'which claude') return '/usr/bin/claude\n';
      if (cmd.startsWith('claude -p ')) return '';
      throw new Error(`unexpected command: ${cmd}`);
    });

    const result = attemptAiRescue({
      step: 'deploy',
      rootDir: '/tmp/project',
      errorText: 'boom',
      deps: { execSync: run },
    });

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(true);
  });
});

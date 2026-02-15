import { describe, it, expect } from 'vitest';

const {
  buildDeployCommands,
} = await import('../../scripts/deploy-command-helper.cjs');

describe('buildDeployCommands', () => {
  it('should build deploy commands for the given project id', () => {
    const cmds = buildDeployCommands('planning-game-xp');
    expect(cmds.rules).toContain('--project planning-game-xp');
    expect(cmds.functions).toContain('--project planning-game-xp');
    expect(cmds.hosting).toContain('--project planning-game-xp');
  });

  it('should append account flag when provided', () => {
    const cmds = buildDeployCommands('planning-game-xp', 'pro@example.com');
    expect(cmds.rules).toContain('--account pro@example.com');
    expect(cmds.functions).toContain('--account pro@example.com');
    expect(cmds.hosting).toContain('--account pro@example.com');
  });

  it('should throw when project id is missing', () => {
    expect(() => buildDeployCommands('')).toThrow('projectId is required');
  });
});

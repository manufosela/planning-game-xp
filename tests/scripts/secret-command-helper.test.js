import { describe, it, expect } from 'vitest';

const { buildScopedSecretCommands } = await import('../../scripts/secret-command-helper.cjs');

describe('secret-command-helper', () => {
  it('should append project and account to secret commands', () => {
    const commands = [
      "printf %s 'value' | firebase functions:secrets:set IA_API_KEY",
    ];
    const scoped = buildScopedSecretCommands(commands, {
      projectId: 'planning-game-xp',
      accountEmail: 'user@example.com',
    });

    expect(scoped[0]).toContain('--project planning-game-xp');
    expect(scoped[0]).toContain('--account user@example.com');
  });

  it('should not duplicate project flag when already present', () => {
    const commands = [
      "printf %s 'value' | firebase functions:secrets:set IA_API_KEY --project planning-game-xp",
    ];
    const scoped = buildScopedSecretCommands(commands, {
      projectId: 'planning-game-xp',
      accountEmail: '',
    });

    const projectFlagCount = (scoped[0].match(/--project/g) || []).length;
    expect(projectFlagCount).toBe(1);
  });
});

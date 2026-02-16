const { execSync } = require('child_process');

function shellEscapeSingleQuotes(value) {
  return String(value || '').replace(/'/g, "'\\''");
}

function detectAvailableAiCli(run = execSync) {
  try {
    run('which claude', { stdio: 'pipe' });
    return 'claude';
  } catch {
    // continue
  }

  try {
    run('which codex', { stdio: 'pipe' });
    return 'codex';
  } catch {
    return null;
  }
}

function buildAiRescuePrompt({ step, rootDir, errorText }) {
  return [
    'Act as a setup recovery assistant for Planning Game XP.',
    `Step: ${step || 'unknown'}`,
    `Working directory: ${rootDir || '.'}`,
    'Goal: fix the failure with minimal safe changes and then retry only the failed step.',
    'Constraints: do not use destructive commands, do not use npm audit fix --force unless explicitly justified.',
    'Error output:',
    String(errorText || '').slice(0, 12000),
  ].join('\n');
}

function attemptAiRescue({
  step,
  rootDir,
  errorText,
  deps = {},
}) {
  const run = deps.execSync || execSync;
  const cli = detectAvailableAiCli(run);
  if (!cli) {
    return { attempted: false, success: false, cli: null, reason: 'no_ai_cli' };
  }

  const prompt = buildAiRescuePrompt({ step, rootDir, errorText });
  const escapedPrompt = shellEscapeSingleQuotes(prompt);
  const command = cli === 'claude'
    ? `claude -p '${escapedPrompt}'`
    : `codex '${escapedPrompt}'`;

  try {
    run(command, { cwd: rootDir, stdio: 'inherit', shell: '/bin/bash' });
    return { attempted: true, success: true, cli };
  } catch (error) {
    return { attempted: true, success: false, cli, reason: String(error?.message || 'ai_rescue_failed') };
  }
}

module.exports = {
  detectAvailableAiCli,
  buildAiRescuePrompt,
  attemptAiRescue,
};

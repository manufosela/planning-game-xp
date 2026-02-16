const { extractMissingApiFromErrorText } = require('./firebase-api-error-parser.cjs');

function getMissingApiFromDeployError(errorText) {
  const text = String(errorText || '');
  if (!text.includes('HTTP Error: 403')) return null;
  return extractMissingApiFromErrorText(text);
}

function getMissingSecretFromDeployError(errorText) {
  const text = String(errorText || '');
  const nonInteractive = text.match(/no value for the secret:\s*([A-Z0-9_]+)/i);
  if (nonInteractive?.[1]) return nonInteractive[1];

  const hintCommand = text.match(/functions:secrets:set\s+([A-Z0-9_]+)/i);
  if (hintCommand?.[1]) return hintCommand[1];

  return null;
}

function shouldRetryFunctionsDeploy(errorText, attempt, maxAttempts) {
  const currentAttempt = Number(attempt || 0);
  const max = Number(maxAttempts || 0);
  if (currentAttempt >= max) return false;
  return Boolean(getMissingApiFromDeployError(errorText) || getMissingSecretFromDeployError(errorText));
}

module.exports = {
  getMissingApiFromDeployError,
  getMissingSecretFromDeployError,
  shouldRetryFunctionsDeploy,
};

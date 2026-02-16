const { extractMissingApiFromErrorText } = require('./firebase-api-error-parser.cjs');

function getMissingApiFromDeployError(errorText) {
  const text = String(errorText || '');
  if (!text.includes('HTTP Error: 403')) return null;
  return extractMissingApiFromErrorText(text);
}

function shouldRetryFunctionsDeploy(errorText, attempt, maxAttempts) {
  const currentAttempt = Number(attempt || 0);
  const max = Number(maxAttempts || 0);
  if (currentAttempt >= max) return false;
  return Boolean(getMissingApiFromDeployError(errorText));
}

module.exports = {
  getMissingApiFromDeployError,
  shouldRetryFunctionsDeploy,
};

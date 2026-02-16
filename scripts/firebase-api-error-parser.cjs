function extractMissingApiFromErrorText(text) {
  const input = String(text || '');
  const match = input.match(/https:\/\/([a-z0-9-]+\.googleapis\.com)\//i);
  if (!match) return null;
  return String(match[1] || '').toLowerCase();
}

module.exports = {
  extractMissingApiFromErrorText,
};

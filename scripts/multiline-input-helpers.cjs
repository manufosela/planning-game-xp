function shouldFinalizeMultilineInput({ line, lines, endToken = 'END', validator = null }) {
  const trimmed = String(line || '').trim();
  if (trimmed.toUpperCase() === String(endToken).toUpperCase()) {
    return true;
  }

  if (trimmed === '' && Array.isArray(lines) && lines.length > 0 && typeof validator === 'function') {
    try {
      validator(lines.join('\n'));
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

module.exports = {
  shouldFinalizeMultilineInput,
};

function formatStepHeader(step, total, description, width = 72) {
  const top = `╭${'─'.repeat(width)}╮`;
  const text = ` PASO ${step}/${total} · ${description} `;
  const middle = `│${text.padEnd(width, ' ').slice(0, width)}│`;
  const bottom = `╰${'─'.repeat(width)}╯`;
  return [top, middle, bottom];
}

module.exports = {
  formatStepHeader,
};

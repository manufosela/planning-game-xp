function collectMultilineInput(rl, { endToken = 'END', shouldFinalize }) {
  return new Promise((resolve) => {
    const lines = [];

    const onLine = (line) => {
      if (shouldFinalize({ line, lines, endToken })) {
        rl.removeListener('line', onLine);
        resolve(lines.join('\n'));
        return;
      }

      lines.push(line);
      rl.prompt();
    };

    rl.on('line', onLine);
    rl.prompt();
  });
}

module.exports = {
  collectMultilineInput,
};

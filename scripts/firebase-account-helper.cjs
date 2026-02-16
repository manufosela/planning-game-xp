function parseFirebaseAccounts(output) {
  const text = String(output || '');
  const matches = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  return [...new Set(matches)];
}

function parseActiveFirebaseAccount(output) {
  const text = String(output || '');
  const match = text.match(/Logged in as\s+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
  return match?.[1] || '';
}

function appendFirebaseAccountFlag(command, accountEmail) {
  const account = String(accountEmail || '').trim();
  if (!account) return command;
  return `${command} --account ${account}`;
}

module.exports = {
  parseFirebaseAccounts,
  parseActiveFirebaseAccount,
  appendFirebaseAccountFlag,
};

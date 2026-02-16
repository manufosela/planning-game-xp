const { appendFirebaseAccountFlag } = require('./firebase-account-helper.cjs');

function buildScopedSecretCommands(commands = [], options = {}) {
  const projectId = String(options.projectId || '').trim();
  const accountEmail = String(options.accountEmail || '').trim();

  return commands.map((command) => {
    let scoped = String(command || '');
    if (projectId && !/\s--project\s+/.test(scoped)) {
      scoped += ` --project ${projectId}`;
    }
    if (accountEmail) {
      scoped = appendFirebaseAccountFlag(scoped, accountEmail);
    }
    return scoped;
  });
}

module.exports = {
  buildScopedSecretCommands,
};

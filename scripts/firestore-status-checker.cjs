const { execSync } = require('child_process');
const { appendFirebaseAccountFlag } = require('./firebase-account-helper.cjs');

function checkFirestoreEnabled(projectId, deps = {}) {
  const run = deps.execSync || execSync;
  const commandJson = appendFirebaseAccountFlag(
    `firebase firestore:databases:list --project ${projectId} --json`,
    deps.accountEmail
  );
  const commandText = appendFirebaseAccountFlag(
    `firebase firestore:databases:list --project ${projectId}`,
    deps.accountEmail
  );

  try {
    const output = String(run(commandJson, { stdio: 'pipe', encoding: 'utf8' }) || '').trim();
    const parsed = JSON.parse(output);
    const entries = Array.isArray(parsed?.result) ? parsed.result : [];
    const enabled = entries.length > 0;
    return { enabled, source: 'json', reason: null };
  } catch (jsonError) {
    try {
      const output = String(run(commandText, { stdio: 'pipe', encoding: 'utf8' }) || '');
      const hasDefault = /\(default\)|default/i.test(output);
      return { enabled: hasDefault, source: 'text', reason: null };
    } catch (textError) {
      const reason = String(
        textError?.stderr
        || textError?.message
        || jsonError?.stderr
        || jsonError?.message
        || 'unknown firestore check error'
      );
      return { enabled: null, source: 'error', reason };
    }
  }
}

module.exports = {
  checkFirestoreEnabled,
};

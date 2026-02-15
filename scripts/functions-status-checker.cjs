const { execSync } = require('child_process');
const { appendFirebaseAccountFlag } = require('./firebase-account-helper.cjs');

function checkFunctionsEnabled(projectId, deps = {}) {
  const run = deps.execSync || execSync;
  const commandJson = appendFirebaseAccountFlag(
    `firebase functions:list --project ${projectId} --json`,
    deps.accountEmail
  );
  const commandText = appendFirebaseAccountFlag(
    `firebase functions:list --project ${projectId}`,
    deps.accountEmail
  );

  try {
    run(commandJson, { stdio: 'pipe', encoding: 'utf8' });
    return { enabled: true, source: 'json', reason: null };
  } catch (error) {
    const message = `${error?.message || ''}\n${error?.stderr || ''}`;
    const apiNotEnabled = /Cloud Functions API has not been used|SERVICE_DISABLED|has not been used in project/i.test(message);
    if (apiNotEnabled) {
      return { enabled: false, source: 'error', reason: message.trim() };
    }

    try {
      run(commandText, { stdio: 'pipe', encoding: 'utf8' });
      return { enabled: true, source: 'text', reason: null };
    } catch (fallbackError) {
      const reason = String(
        fallbackError?.stderr
        || fallbackError?.message
        || message
        || 'unknown functions check error'
      ).trim();
      return { enabled: null, source: 'error', reason };
    }
  }
}

module.exports = {
  checkFunctionsEnabled,
};

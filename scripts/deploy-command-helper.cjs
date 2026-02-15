const { appendFirebaseAccountFlag } = require('./firebase-account-helper.cjs');

function buildDeployCommands(projectId, accountEmail = '') {
  const pid = String(projectId || '').trim();
  if (!pid) {
    throw new Error('projectId is required');
  }

  const rules = appendFirebaseAccountFlag(
    `firebase deploy --only firestore,database:main --project ${pid}`,
    accountEmail
  );
  const functions = appendFirebaseAccountFlag(
    `firebase deploy --only functions --project ${pid}`,
    accountEmail
  );
  const hosting = appendFirebaseAccountFlag(
    `firebase deploy --only hosting --project ${pid}`,
    accountEmail
  );

  return { rules, functions, hosting };
}

module.exports = {
  buildDeployCommands,
};

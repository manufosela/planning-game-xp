const { execSync } = require('child_process');
const { appendFirebaseAccountFlag } = require('./firebase-account-helper.cjs');

function parseRtdbInstanceNameFromUrl(databaseUrl) {
  const value = String(databaseUrl || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = String(url.hostname || '').trim();
    if (!host) return null;
    const [instanceName] = host.split('.');
    return instanceName || null;
  } catch {
    return null;
  }
}

function buildDatabaseTargetApplyCommand({
  projectId,
  targetName,
  instanceName,
  accountEmail = '',
}) {
  const pid = String(projectId || '').trim();
  const target = String(targetName || '').trim();
  const instance = String(instanceName || '').trim();
  if (!pid || !target || !instance) {
    throw new Error('projectId, targetName and instanceName are required');
  }

  const base = `firebase target:apply database ${target} ${instance} --project ${pid}`;
  return appendFirebaseAccountFlag(base, accountEmail);
}

function ensureDatabaseTargets({
  projectId,
  databaseUrl,
  accountEmail = '',
  deps = {},
}) {
  const run = deps.execSync || execSync;
  const instanceName = parseRtdbInstanceNameFromUrl(databaseUrl);
  if (!instanceName) {
    return { configured: false, instanceName: null, reason: 'invalid_database_url' };
  }

  const targets = ['main', 'tests'];
  for (const targetName of targets) {
    const cmd = buildDatabaseTargetApplyCommand({
      projectId,
      targetName,
      instanceName,
      accountEmail,
    });
    run(cmd, { stdio: 'pipe' });
  }

  return { configured: true, instanceName };
}

module.exports = {
  parseRtdbInstanceNameFromUrl,
  buildDatabaseTargetApplyCommand,
  ensureDatabaseTargets,
};

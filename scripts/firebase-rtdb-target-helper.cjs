const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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

function ensureDatabaseTargetsInFirebaserc({
  rootDir,
  projectId,
  instanceName,
}) {
  const pid = String(projectId || '').trim();
  const instance = String(instanceName || '').trim();
  if (!pid || !instance) return false;

  const rcPath = path.join(rootDir, '.firebaserc');
  let rc = {};
  if (fs.existsSync(rcPath)) {
    try {
      rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    } catch {
      rc = {};
    }
  }

  rc.projects = rc.projects || {};
  rc.projects.default = rc.projects.default || pid;
  rc.targets = rc.targets || {};

  const keys = new Set([pid]);
  for (const [alias, mappedProjectId] of Object.entries(rc.projects)) {
    if (String(mappedProjectId || '').trim() === pid) {
      keys.add(alias);
    }
  }

  for (const key of keys) {
    rc.targets[key] = rc.targets[key] || {};
    rc.targets[key].database = rc.targets[key].database || {};
    rc.targets[key].database.main = [instance];
    rc.targets[key].database.tests = [instance];
  }

  fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + '\n', 'utf8');
  return true;
}

function hasDatabaseTargetConfigured({
  rootDir,
  projectId,
  targetName,
}) {
  const pid = String(projectId || '').trim();
  const target = String(targetName || '').trim();
  if (!pid || !target) return false;

  const rcPath = path.join(rootDir, '.firebaserc');
  if (!fs.existsSync(rcPath)) return false;

  try {
    const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    const projectTargets = rc.targets?.[pid]?.database?.[target];
    if (Array.isArray(projectTargets) && projectTargets.length > 0) return true;

    for (const [alias, mappedPid] of Object.entries(rc.projects || {})) {
      if (String(mappedPid || '').trim() !== pid) continue;
      const aliasTargets = rc.targets?.[alias]?.database?.[target];
      if (Array.isArray(aliasTargets) && aliasTargets.length > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  parseRtdbInstanceNameFromUrl,
  buildDatabaseTargetApplyCommand,
  ensureDatabaseTargets,
  ensureDatabaseTargetsInFirebaserc,
  hasDatabaseTargetConfigured,
};

const { execSync } = require('child_process');
const { appendFirebaseAccountFlag } = require('./firebase-account-helper.cjs');

function buildEnableServicesCommand({
  projectId,
  services = [],
  accountEmail = '',
}) {
  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId is required');
  const filteredServices = (services || []).map(String).map(s => s.trim()).filter(Boolean);
  if (filteredServices.length === 0) throw new Error('services are required');

  const base = `gcloud services enable ${filteredServices.join(' ')} --project ${pid}`;
  return appendFirebaseAccountFlag(base, accountEmail);
}

function enableRequiredProjectApis({
  projectId,
  services,
  accountEmail = '',
  deps = {},
}) {
  const run = deps.execSync || execSync;
  try {
    const cmd = buildEnableServicesCommand({ projectId, services, accountEmail });
    run(cmd, { stdio: 'pipe', encoding: 'utf8' });
    return { enabled: true, reason: '' };
  } catch (error) {
    const message = String(error?.stderr || error?.stdout || error?.message || 'unknown gcloud error');
    return { enabled: false, reason: message };
  }
}

module.exports = {
  buildEnableServicesCommand,
  enableRequiredProjectApis,
};

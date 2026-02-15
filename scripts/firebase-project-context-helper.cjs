const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function setDefaultFirebaseProject(rootDir, projectId) {
  const rcPath = path.join(rootDir, '.firebaserc');
  let content = {};

  if (fs.existsSync(rcPath)) {
    try {
      content = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    } catch {
      content = {};
    }
  }

  content.projects = content.projects || {};
  content.projects.default = projectId;
  fs.writeFileSync(rcPath, JSON.stringify(content, null, 2) + '\n');
}

function isActiveFirebaseProject(rootDir, projectId, deps = {}) {
  const run = deps.execSync || execSync;
  const command = 'firebase use';
  try {
    const outputRaw = String(run(command, { encoding: 'utf8', stdio: 'pipe', cwd: rootDir }) || '');
    return isExpectedProjectInFirebaseUseOutput(outputRaw, projectId);
  } catch {
    return false;
  }
}

function isExpectedProjectInFirebaseUseOutput(outputRaw, projectId) {
  const output = String(outputRaw || '').replace(/\u001b\[[0-9;]*m/g, '');
  const expected = String(projectId || '').trim();
  if (!expected) return false;
  return output.includes(`Active Project: ${expected}`)
    || output.includes(`Now using project ${expected}`)
    || output.includes(`Proyecto activo: ${expected}`)
    || output.includes(`(${expected})`);
}

module.exports = {
  setDefaultFirebaseProject,
  isActiveFirebaseProject,
  isExpectedProjectInFirebaseUseOutput,
};

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { appendFirebaseAccountFlag } = require('./firebase-account-helper.cjs');

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
  const command = appendFirebaseAccountFlag('firebase use', deps.accountEmail);
  try {
    const output = String(run(command, { encoding: 'utf8', stdio: 'pipe', cwd: rootDir }) || '');
    return output.includes(`Active Project: ${projectId}`) || output.includes(`(${projectId})`);
  } catch {
    return false;
  }
}

module.exports = {
  setDefaultFirebaseProject,
  isActiveFirebaseProject,
};

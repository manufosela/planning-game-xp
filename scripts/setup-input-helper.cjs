const path = require('path');

function resolveInputPath(inputPath, homeDir = process.env.HOME || '') {
  const raw = String(inputPath || '').trim();
  if (!raw) return '';
  if (raw.startsWith('~/') && homeDir) {
    return path.join(homeDir, raw.slice(2));
  }
  return path.resolve(raw);
}

function buildDefaultMcpUserIdentity({ developerName, developerEmail } = {}) {
  return {
    developerId: 'dev_001',
    developerName: String(developerName || '').trim(),
    developerEmail: String(developerEmail || '').trim(),
  };
}

module.exports = {
  resolveInputPath,
  buildDefaultMcpUserIdentity,
};

const fs = require('fs');
const path = require('path');

function resolveDatabaseUrl({ cliArg = '', env = process.env } = {}) {
  return String(
    cliArg
    || env.FIREBASE_DATABASE_URL
    || env.PUBLIC_FIREBASE_DATABASE_URL
    || ''
  ).trim();
}

function loadDatabaseUrlFromEnvFiles(rootDir, candidates = ['.env.prod', '.env.dev', '.env.pre']) {
  for (const file of candidates) {
    const filePath = path.join(rootDir, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^PUBLIC_FIREBASE_DATABASE_URL=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

module.exports = {
  resolveDatabaseUrl,
  loadDatabaseUrlFromEnvFiles,
};

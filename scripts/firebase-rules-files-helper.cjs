const fs = require('fs');
const path = require('path');

function copyIfMissing(rootDir, targetFile, sourceCandidates = []) {
  const targetPath = path.join(rootDir, targetFile);
  if (fs.existsSync(targetPath)) return false;

  for (const candidate of sourceCandidates) {
    const sourcePath = path.join(rootDir, candidate);
    if (!fs.existsSync(sourcePath)) continue;
    fs.copyFileSync(sourcePath, targetPath);
    return true;
  }

  return false;
}

function ensureRequiredFirebaseRuleFiles(rootDir) {
  const created = [];

  if (copyIfMissing(rootDir, 'database.rules.json', ['database.rules.example.json'])) {
    created.push('database.rules.json');
  }
  if (copyIfMissing(rootDir, 'database.test.rules.json', ['database.rules.example.json', 'database.rules.json'])) {
    created.push('database.test.rules.json');
  }
  if (copyIfMissing(rootDir, 'firestore.rules', ['backup-firestore.rules', 'firestore.rules.dev'])) {
    created.push('firestore.rules');
  }
  if (copyIfMissing(rootDir, 'storage.rules', ['storage.rules.example'])) {
    created.push('storage.rules');
  }

  return { created };
}

module.exports = {
  ensureRequiredFirebaseRuleFiles,
};

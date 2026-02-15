const fs = require('fs');
const path = require('path');

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function isValidRtdbRules(content) {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null && Object.prototype.hasOwnProperty.call(parsed, 'rules');
  } catch {
    return false;
  }
}

function isValidFirestoreRules(content) {
  const text = String(content || '').trim();
  return text.includes("rules_version = '2';") && text.includes('service cloud.firestore');
}

function isValidStorageRules(content) {
  const text = String(content || '').trim();
  return text.includes("rules_version = '2';") && text.includes('service firebase.storage');
}

function ensureFromSources({
  rootDir,
  targetFile,
  sourceCandidates = [],
  validator,
}) {
  const targetPath = path.join(rootDir, targetFile);
  const existedBefore = fs.existsSync(targetPath);
  if (fs.existsSync(targetPath)) {
    const existing = readFileSafe(targetPath);
    if (validator(existing)) {
      return { created: false, repaired: false };
    }
  }

  for (const candidate of sourceCandidates) {
    const sourcePath = path.join(rootDir, candidate);
    if (!fs.existsSync(sourcePath)) continue;
    const sourceContent = readFileSafe(sourcePath);
    if (!validator(sourceContent)) continue;
    fs.writeFileSync(targetPath, sourceContent, 'utf8');
    return {
      created: !existedBefore,
      repaired: true,
    };
  }

  return { created: false, repaired: false };
}

function ensureRequiredFirebaseRuleFiles(rootDir) {
  const created = [];
  const repaired = [];

  const rtdbMainResult = ensureFromSources({
    rootDir,
    targetFile: 'database.rules.json',
    sourceCandidates: ['database.rules.example.json'],
    validator: isValidRtdbRules,
  });
  if (rtdbMainResult.created) created.push('database.rules.json');
  if (rtdbMainResult.repaired) repaired.push('database.rules.json');

  const rtdbTestsResult = ensureFromSources({
    rootDir,
    targetFile: 'database.test.rules.json',
    sourceCandidates: ['database.rules.example.json', 'database.rules.json'],
    validator: isValidRtdbRules,
  });
  if (rtdbTestsResult.created) created.push('database.test.rules.json');
  if (rtdbTestsResult.repaired) repaired.push('database.test.rules.json');

  const firestoreResult = ensureFromSources({
    rootDir,
    targetFile: 'firestore.rules',
    sourceCandidates: ['firestore.rules.dev', 'backup-firestore.rules'],
    validator: isValidFirestoreRules,
  });
  if (firestoreResult.created) created.push('firestore.rules');
  if (firestoreResult.repaired) repaired.push('firestore.rules');

  const storageResult = ensureFromSources({
    rootDir,
    targetFile: 'storage.rules',
    sourceCandidates: ['storage.rules.example'],
    validator: isValidStorageRules,
  });
  if (storageResult.created) created.push('storage.rules');
  if (storageResult.repaired) repaired.push('storage.rules');

  return { created, repaired };
}

module.exports = {
  ensureRequiredFirebaseRuleFiles,
};

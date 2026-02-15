const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function shouldInstallFunctionsDependencies(rootDir) {
  const functionsDir = path.join(rootDir, 'functions');
  const packageJsonPath = path.join(functionsDir, 'package.json');
  const firebaseFunctionsModule = path.join(functionsDir, 'node_modules', 'firebase-functions');

  if (!fs.existsSync(packageJsonPath)) return false;
  if (fs.existsSync(firebaseFunctionsModule)) return false;
  return true;
}

function ensureFunctionsDependencies(rootDir, deps = {}) {
  const run = deps.execSync || execSync;
  const functionsDir = path.join(rootDir, 'functions');

  if (!shouldInstallFunctionsDependencies(rootDir)) {
    return { installed: false };
  }

  run('npm install', { cwd: functionsDir, stdio: 'inherit' });
  return { installed: true };
}

module.exports = {
  shouldInstallFunctionsDependencies,
  ensureFunctionsDependencies,
};

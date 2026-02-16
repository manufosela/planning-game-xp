const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function normalizeVulnerabilityCounts(counts = {}) {
  return {
    low: Number(counts.low || 0),
    moderate: Number(counts.moderate || 0),
    high: Number(counts.high || 0),
    critical: Number(counts.critical || 0),
  };
}

function hasBlockingAuditVulnerabilities(counts = {}) {
  const normalized = normalizeVulnerabilityCounts(counts);
  return normalized.moderate > 0 || normalized.high > 0 || normalized.critical > 0;
}

function runAudit(functionsDir, run) {
  try {
    const raw = String(run('npm audit --json', { cwd: functionsDir, stdio: 'pipe', encoding: 'utf8' }) || '');
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeVulnerabilityCounts(parsed?.metadata?.vulnerabilities || {});
  } catch (error) {
    const stdout = String(error?.stdout || '');
    if (!stdout) return normalizeVulnerabilityCounts();
    try {
      const parsed = JSON.parse(stdout);
      return normalizeVulnerabilityCounts(parsed?.metadata?.vulnerabilities || {});
    } catch {
      return normalizeVulnerabilityCounts();
    }
  }
}

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
  const result = {
    installed: false,
    auditBefore: normalizeVulnerabilityCounts(),
    auditAfter: normalizeVulnerabilityCounts(),
    auditFixApplied: false,
  };

  if (!shouldInstallFunctionsDependencies(rootDir)) {
    result.auditBefore = runAudit(functionsDir, run);
    if (hasBlockingAuditVulnerabilities(result.auditBefore)) {
      try {
        run('npm audit fix', { cwd: functionsDir, stdio: 'inherit' });
        result.auditFixApplied = true;
      } catch {
        result.auditFixApplied = true;
      }
      result.auditAfter = runAudit(functionsDir, run);
    } else {
      result.auditAfter = result.auditBefore;
    }
    return result;
  }

  run('npm install', { cwd: functionsDir, stdio: 'inherit' });
  result.installed = true;
  result.auditBefore = runAudit(functionsDir, run);
  if (hasBlockingAuditVulnerabilities(result.auditBefore)) {
    try {
      run('npm audit fix', { cwd: functionsDir, stdio: 'inherit' });
      result.auditFixApplied = true;
    } catch {
      result.auditFixApplied = true;
    }
    result.auditAfter = runAudit(functionsDir, run);
  } else {
    result.auditAfter = result.auditBefore;
  }

  return result;
}

module.exports = {
  shouldInstallFunctionsDependencies,
  ensureFunctionsDependencies,
  hasBlockingAuditVulnerabilities,
};

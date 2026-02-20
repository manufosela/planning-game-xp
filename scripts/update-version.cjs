#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionFilePath = path.join(__dirname, '../version.json');
const publicVersionFilePath = path.join(__dirname, '../public/js/version.js');
const packageJsonPath = path.join(__dirname, '../package.json');
const lastInstancePath = path.join(__dirname, '../.last-instance');

function getActiveInstance() {
  try {
    if (!fs.existsSync(lastInstancePath)) return '';
    return fs.readFileSync(lastInstancePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function getLastCommitMessage() {
  try {
    return execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error('Error getting last commit message:', error.message);
    return '';
  }
}

function commitPendingChanges() {
  try {
    // Check for uncommitted changes (excluding version files)
    const output = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (!output) return false;

    // Filter out version-related files
    const versionFiles = ['version.json', 'public/js/version.js', 'package.json'];
    const changes = output.split('\n').filter(line => {
      const file = line.slice(3).trim();
      return !versionFiles.some(vf => file.endsWith(vf));
    });

    if (changes.length === 0) return false;

    console.log('📦 Detected uncommitted changes, committing before build...');

    // Add all changes except version files
    execSync('git add -A', { encoding: 'utf8' });

    // Reset version files if they were staged
    versionFiles.forEach(file => {
      try {
        execSync(`git reset HEAD ${file} 2>/dev/null || true`, { encoding: 'utf8' });
      } catch (e) {
        // Ignore errors - file might not be staged
      }
    });

    // Create commit with generic message
    execSync('git commit -m "chore: pre-build changes"', { encoding: 'utf8' });
    console.log('✅ Pre-build commit created');
    return true;
  } catch (error) {
    console.error('Error committing pending changes:', error.message);
    return false;
  }
}

function incrementVersion(currentVersion, commitMessage) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  // Analizar el mensaje de commit para determinar el tipo de cambio
  if (commitMessage.startsWith('BREAKING CHANGE:') || commitMessage.includes('BREAKING CHANGE')) {
    // Major version bump (X.0.0)
    return `${major + 1}.0.0`;
  } else if (commitMessage.startsWith('feat:') || commitMessage.startsWith('feat(')) {
    // Minor version bump (X.Y.0)
    return `${major}.${minor + 1}.0`;
  }
  
  // Patch version bump (X.Y.Z) for any other commit type (style, chore, refactor, fix, docs, etc.)
  return `${major}.${minor}.${patch + 1}`;
}

function updateVersionFile(newVersion, lastBuildCommit) {
  const instance = getActiveInstance();
  const versionData = {
    version: newVersion,
    lastUpdated: new Date().toISOString(),
    lastBuildCommit: lastBuildCommit || '',
    instance: instance || ''
  };

  // Update JSON file
  fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));

  // Generate JS file for frontend
  const jsContent = `// Auto-generated version file - Do not edit manually
export const version = '${newVersion}';
export const lastUpdated = '${versionData.lastUpdated}';
export const lastBuildCommit = '${versionData.lastBuildCommit}';
export const instance = '${versionData.instance}';
`;
  
  fs.writeFileSync(publicVersionFilePath, jsContent);

  // Update package.json version to stay in sync
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  
  console.log(`✅ Version updated to ${newVersion}`);
}

function hasNewCommitsSinceLastBuild() {
  if (!fs.existsSync(versionFilePath)) return true;

  try {
    const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
    const lastBuildCommit = versionData.lastBuildCommit;
    if (!lastBuildCommit) return true;

    const headCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    if (lastBuildCommit === headCommit) return false;

    // Check if there are relevant commits (not just version bumps)
    const range = `${lastBuildCommit}..${headCommit}`;
    const logOutput = execSync(`git log ${range} --pretty=%s`, { encoding: 'utf8' }).trim();
    if (!logOutput) return false;

    const commits = logOutput.split('\n').filter(msg =>
      !msg.startsWith('chore: bump client version to')
    );
    return commits.length > 0;
  } catch (error) {
    return true; // If in doubt, allow build
  }
}

function main() {
  // First, check and commit any pending changes
  const hadChanges = commitPendingChanges();

  // Check if there are new commits since last build
  const hasNewCommits = hasNewCommitsSinceLastBuild();

  // If no changes and no new commits and we're not forcing, abort
  if (!hadChanges && !hasNewCommits && !process.env.FORCE_BUILD) {
    console.log('⚠️  No hay cambios pendientes ni commits nuevos. Build cancelado.');
    console.log('   Para forzar el build, usa: FORCE_BUILD=1 npm run build-prod');
    process.exit(1);
  }

  // Read current version
  let currentVersion = '1.0.0';
  let lastBuildCommit = '';
  if (fs.existsSync(versionFilePath)) {
    const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
    currentVersion = versionData.version;
    lastBuildCommit = versionData.lastBuildCommit || '';
  }
  
  let commitMessages = [];
  let headCommit = '';
  try {
    headCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error('Error getting HEAD commit:', error.message);
  }

  if (lastBuildCommit && headCommit && lastBuildCommit !== headCommit) {
    try {
      const range = `${lastBuildCommit}..${headCommit}`;
      const logOutput = execSync(`git log ${range} --pretty=%s`, { encoding: 'utf8' }).trim();
      commitMessages = logOutput ? logOutput.split('\n').map(line => line.trim()).filter(Boolean) : [];
      console.log(`📝 Commits since last build (${range}): ${commitMessages.length}`);
    } catch (error) {
      console.error('Error getting commit range:', error.message);
    }
  } else if (lastBuildCommit && headCommit && lastBuildCommit === headCommit) {
    console.log('📝 No hay commits nuevos desde la última build.');
    updateVersionFile(currentVersion, headCommit);
    return;
  }

  if (commitMessages.length === 0) {
    const commitMessage = getLastCommitMessage();
    if (commitMessage) {
      commitMessages = [commitMessage];
      console.log(`📝 Last commit: ${commitMessage}`);
    }
  }

  const relevantMessages = commitMessages.filter((message) =>
    !message.startsWith('chore: bump client version to')
  );

  if (commitMessages.length > 0 && relevantMessages.length === 0) {
    console.log('📝 Solo hay commits de bump de versión desde la última build.');
    updateVersionFile(currentVersion, headCommit);
    return;
  }

  let newVersion = currentVersion;
  if (relevantMessages.length > 0) {
    const hasBreaking = relevantMessages.some(message =>
      message.startsWith('BREAKING CHANGE:') || message.includes('BREAKING CHANGE')
    );
    const hasFeature = relevantMessages.some(message =>
      message.startsWith('feat:') || message.startsWith('feat(')
    );

    if (hasBreaking) {
      const [major] = currentVersion.split('.').map(Number);
      newVersion = `${major + 1}.0.0`;
    } else if (hasFeature) {
      const [major, minor] = currentVersion.split('.').map(Number);
      newVersion = `${major}.${minor + 1}.0`;
    } else {
      newVersion = incrementVersion(currentVersion, relevantMessages[0]);
    }
  }
  
  if (newVersion === currentVersion) {
    console.log(`📌 Version remains ${currentVersion} (no version bump needed)`);
    // Still generate the JS file in case it doesn't exist
    updateVersionFile(currentVersion, headCommit);
  } else {
    console.log(`🔄 Version bump: ${currentVersion} → ${newVersion}`);
    updateVersionFile(newVersion, headCommit);
  }
}

if (require.main === module) {
  main();
}

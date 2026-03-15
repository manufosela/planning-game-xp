/**
 * Prepares @pgv2/domain for Firebase deploy.
 *
 * In local development, npm workspaces symlink the package automatically.
 * For Firebase deploy, we need to bundle the package because the cloud
 * environment runs `npm install` without access to the monorepo workspace.
 *
 * This script:
 * 1. Copies packages/domain/ → functions/.domain/
 * 2. Patches functions/package.json to use "file:./.domain" so the cloud
 *    install resolves the local copy.
 * 3. Generates a fresh package-lock.json matching the patched package.json.
 *
 * A companion restore-domain.js (postdeploy) reverts the package.json change
 * and removes the generated lockfile.
 *
 * Runs ONLY as predeploy hook — never as preinstall.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const functionsDir = resolve(__dirname, '..');
const source = resolve(__dirname, '../../packages/domain');
const target = resolve(functionsDir, '.domain');
const pkgPath = resolve(functionsDir, 'package.json');

if (!existsSync(source)) {
  // In cloud deploy, source won't exist — .domain/ was already uploaded.
  process.exit(0);
}

// 1. Copy domain package to .domain/
if (existsSync(target)) {
  rmSync(target, { recursive: true });
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

// 2. Patch package.json for deploy: workspace ref → file:./.domain
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.dependencies?.['@pgv2/domain'] && pkg.dependencies['@pgv2/domain'] !== 'file:./.domain') {
  // Save original value for restore
  const original = pkg.dependencies['@pgv2/domain'];
  writeFileSync(resolve(functionsDir, '.domain-dep-backup'), original, 'utf8');

  pkg.dependencies['@pgv2/domain'] = 'file:./.domain';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

// 3. Generate lockfile matching the patched package.json
//    --workspaces=false prevents npm from resolving via the root workspace
//    (which would skip local lockfile generation for this workspace member).
execSync('npm install --package-lock-only --ignore-scripts --workspaces=false', {
  cwd: functionsDir,
  stdio: 'inherit',
});

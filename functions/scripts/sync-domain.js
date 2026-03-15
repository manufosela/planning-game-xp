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
 *
 * A companion restore-domain.js (postdeploy) reverts the package.json change.
 *
 * Runs ONLY as predeploy hook — never as preinstall.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = resolve(__dirname, '../../packages/domain');
const target = resolve(__dirname, '../.domain');
const pkgPath = resolve(__dirname, '../package.json');

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
  writeFileSync(resolve(__dirname, '../.domain-dep-backup'), original, 'utf8');

  pkg.dependencies['@pgv2/domain'] = 'file:./.domain';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

/**
 * Restores functions/package.json after Firebase deploy.
 *
 * The predeploy sync-domain.js patches the @pgv2/domain dependency to
 * "file:./.domain" for the cloud install and generates a matching lockfile.
 * This postdeploy script reverts the package.json change and removes the
 * deploy-generated lockfile (not tracked in git).
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const functionsDir = resolve(__dirname, '..');
const pkgPath = resolve(functionsDir, 'package.json');
const backupPath = resolve(functionsDir, '.domain-dep-backup');
const lockPath = resolve(functionsDir, 'package-lock.json');

if (!existsSync(backupPath)) {
  process.exit(0);
}

const original = readFileSync(backupPath, 'utf8').trim();
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

if (pkg.dependencies?.['@pgv2/domain']) {
  pkg.dependencies['@pgv2/domain'] = original;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

unlinkSync(backupPath);

// Remove the deploy-generated lockfile (not tracked in git).
if (existsSync(lockPath)) {
  unlinkSync(lockPath);
}

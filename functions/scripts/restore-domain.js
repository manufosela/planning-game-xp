/**
 * Restores functions/package.json after Firebase deploy.
 *
 * The predeploy sync-domain.js patches the @pgv2/domain dependency to
 * "file:./.domain" for the cloud install. This postdeploy script reverts
 * it to the workspace-compatible value.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '../package.json');
const backupPath = resolve(__dirname, '../.domain-dep-backup');

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

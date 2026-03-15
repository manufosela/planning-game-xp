/**
 * Copies packages/domain/ into functions/.domain/ so that the
 * "file:./.domain" dependency resolves both locally and in Firebase deploy.
 *
 * - Runs as preinstall hook (local dev) and predeploy hook (firebase deploy).
 * - Silently skips if the source directory is missing (handles cloud installs
 *   where .domain/ was already included in the uploaded bundle).
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = resolve(__dirname, '../../packages/domain');
const target = resolve(__dirname, '../.domain');

if (!existsSync(source)) {
  // In cloud deploy, source won't exist — .domain/ was already uploaded.
  process.exit(0);
}

// Clean previous copy
if (existsSync(target)) {
  rmSync(target, { recursive: true });
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

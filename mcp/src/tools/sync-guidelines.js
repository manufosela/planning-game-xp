/**
 * MCP tool for syncing guidelines from Firestore to local files.
 * @module mcp/tools/sync-guidelines
 */

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import * as db from '../services/firestore-service.js';

const { readFileSync, writeFileSync, mkdirSync, existsSync } = fs;
const { resolve, dirname, isAbsolute, normalize } = path;

const VERSIONS_FILE = '.pg-guidelines-versions.json';

export const syncGuidelinesSchema = z.object({
  dryRun: z.boolean().optional().default(false).describe('Preview changes without writing files'),
  force: z.boolean().optional().default(false).describe('Force sync even if versions match'),
});

/**
 * Validate that a path is safe.
 * @param {string} targetFile
 * @returns {string | null} Error message or null if safe
 */
function isPathSafe(targetFile) {
  if (!targetFile || typeof targetFile !== 'string') return 'targetFile is required';
  if (isAbsolute(targetFile)) return `Must be relative path, got: "${targetFile}"`;
  const normalized = normalize(targetFile);
  if (normalized.startsWith('..')) return `Path traversal not allowed: "${targetFile}"`;
  return null;
}

function readLocalVersions() {
  const p = resolve(process.cwd(), VERSIONS_FILE);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return {}; }
}

function writeLocalVersions(versions) {
  writeFileSync(resolve(process.cwd(), VERSIONS_FILE), JSON.stringify(versions, null, 2), 'utf-8');
}

/**
 * Sync guidelines from Firestore globalConfig to local files.
 */
export async function syncGuidelines({ dryRun = false, force = false } = {}) {
  const configs = await db.getGlobalConfigs({ type: 'guideline' });
  const guidelines = configs.filter((c) => c.targetFile);

  if (guidelines.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ message: 'No guidelines with targetFile found.', synced: 0, skipped: 0, errors: 0 }, null, 2),
      }],
    };
  }

  const localVersions = readLocalVersions();
  const results = [];
  const errors = [];
  let syncedCount = 0;
  let skippedCount = 0;

  for (const guideline of guidelines) {
    const { id: configId, targetFile, version, content, name } = guideline;
    const firebaseVersion = version || 1;

    const pathError = isPathSafe(targetFile);
    if (pathError) {
      errors.push({ configId, targetFile, error: pathError });
      continue;
    }

    const localEntry = localVersions[configId];
    const localVersion = localEntry ? localEntry.version : 0;
    const needsSync = force || (firebaseVersion > localVersion);

    if (!needsSync) {
      skippedCount++;
      results.push({ configId, name, targetFile, action: 'skipped' });
      continue;
    }

    if (dryRun) {
      syncedCount++;
      results.push({ configId, name, targetFile, action: 'would_sync', version: firebaseVersion });
      continue;
    }

    try {
      const fullPath = resolve(process.cwd(), targetFile);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content || '', 'utf-8');

      localVersions[configId] = { version: firebaseVersion, targetFile, syncedAt: new Date().toISOString() };
      syncedCount++;
      results.push({ configId, name, targetFile, action: localVersion === 0 ? 'created' : 'updated', version: firebaseVersion });
    } catch (err) {
      errors.push({ configId, targetFile, error: err.message });
    }
  }

  if (!dryRun && syncedCount > 0) writeLocalVersions(localVersions);

  const summary = {
    message: dryRun ? `Dry run: ${syncedCount} would sync.` : `Sync complete: ${syncedCount} synced.`,
    synced: syncedCount,
    skipped: skippedCount,
    errors: errors.length,
    details: results,
  };

  if (errors.length > 0) summary.errorDetails = errors;

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

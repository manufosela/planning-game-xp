#!/usr/bin/env node

/**
 * Migration: strip orphan `status` and `priority` fields from epics (PMC-BUG-0005)
 *
 * Epics are containers grouping tasks (start/end dates), not workflow items.
 * Older create paths persisted `status: "To Do"` and `priority` on epics by
 * mistake; the MCP read paths kept surfacing them, misleading agents into
 * thinking epics can be transitioned. The write paths now strip both fields
 * on create/update — this script removes the leftover values.
 *
 * Walks every project, then every epic under
 * `/cards/{projectId}/EPICS_{projectId}/{firebaseId}`, and deletes the
 * `status` and `priority` fields where they exist.
 *
 * Idempotent: epics without those fields are skipped.
 *
 * Usage:
 *   node mcp/scripts/migrate-clean-epic-status.js [--dry-run] [--project <projectId>]
 *
 * Environment:
 *   MCP_INSTANCE_DIR              — path to instance dir with serviceAccountKey.json
 *   GOOGLE_APPLICATION_CREDENTIALS — alternative path to the key
 *   FIREBASE_DATABASE_URL         — optional override of RTDB URL
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import admin from 'firebase-admin';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
};

function parseArgs(argv) {
  const args = { dryRun: false, project: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--project') args.project = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: node mcp/scripts/migrate-clean-epic-status.js [--dry-run] [--project <projectId>]');
      process.exit(0);
    }
  }
  return args;
}

function resolveCredentialsPath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  if (process.env.MCP_INSTANCE_DIR) {
    const path = resolve(process.env.MCP_INSTANCE_DIR, 'serviceAccountKey.json');
    if (existsSync(path)) return path;
  }
  throw new Error('No credentials found. Set MCP_INSTANCE_DIR or GOOGLE_APPLICATION_CREDENTIALS.');
}

async function migrateProject(db, projectId, dryRun) {
  const epicsPath = `cards/${projectId}/EPICS_${projectId}`;
  const epicsSnap = await db.ref(epicsPath).once('value');
  const epics = epicsSnap.val();
  if (!epics) {
    console.log(`${COLORS.dim}  ${projectId}: no epics${COLORS.reset}`);
    return { scanned: 0, cleaned: 0, skipped: 0 };
  }

  let cleaned = 0;
  let skipped = 0;
  const entries = Object.entries(epics);

  for (const [firebaseId, epic] of entries) {
    const hasStatus = epic && Object.prototype.hasOwnProperty.call(epic, 'status');
    const hasPriority = epic && Object.prototype.hasOwnProperty.call(epic, 'priority');
    if (!hasStatus && !hasPriority) {
      skipped++;
      continue;
    }
    const removed = [
      hasStatus ? `status="${epic.status}"` : null,
      hasPriority ? `priority="${epic.priority}"` : null
    ].filter(Boolean).join(', ');
    console.log(`${COLORS.cyan}  ${projectId}/${epic.cardId || firebaseId} → drop ${removed}${COLORS.reset}`);
    if (!dryRun) {
      const updates = {};
      if (hasStatus) updates[`${epicsPath}/${firebaseId}/status`] = null;
      if (hasPriority) updates[`${epicsPath}/${firebaseId}/priority`] = null;
      await db.ref().update(updates);
    }
    cleaned++;
  }

  return { scanned: entries.length, cleaned, skipped };
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`${COLORS.cyan}Strip orphan status/priority from epics${args.dryRun ? ' (DRY RUN)' : ''}${COLORS.reset}`);

  const credentialsPath = resolveCredentialsPath();
  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
  const databaseURL = process.env.FIREBASE_DATABASE_URL
    || `https://${credentials.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    databaseURL
  });

  const db = admin.database();

  let projectIds;
  if (args.project) {
    projectIds = [args.project];
  } else {
    const snap = await db.ref('projects').once('value');
    projectIds = Object.keys(snap.val() || {});
  }

  console.log(`${COLORS.dim}Scanning ${projectIds.length} project(s)...${COLORS.reset}\n`);

  const totals = { scanned: 0, cleaned: 0, skipped: 0 };
  for (const projectId of projectIds) {
    const result = await migrateProject(db, projectId, args.dryRun);
    totals.scanned += result.scanned;
    totals.cleaned += result.cleaned;
    totals.skipped += result.skipped;
  }

  console.log('');
  console.log(`${COLORS.green}Done.${COLORS.reset}`);
  console.log(`  scanned: ${totals.scanned}`);
  console.log(`  cleaned: ${totals.cleaned}`);
  console.log(`  skipped: ${totals.skipped} (no status/priority)`);

  await admin.app().delete();
}

main().catch(err => {
  console.error(`${COLORS.red}Error: ${err.message}${COLORS.reset}`);
  console.error(err.stack);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Migration: backfill cardId for development plans (PMC-BUG-0003)
 *
 * Walks every project under /projects/{projectId}, lists /plans/{projectId},
 * and for each plan without a `cardId` generates one with the Firestore atomic
 * counter (same pattern as cards.js) and writes it back.
 *
 * Does not touch the path key — only adds the `cardId` field. Existing tasks
 * that reference plans by Firebase push key keep working.
 *
 * Idempotent: skips plans that already have `cardId`.
 *
 * Usage:
 *   node mcp/scripts/migrate-add-plan-cardids.js [--dry-run] [--project <projectId>]
 *
 * Environment:
 *   MCP_INSTANCE_DIR              — path to instance dir with serviceAccountKey.json
 *   GOOGLE_APPLICATION_CREDENTIALS — alternative path to the key
 *   FIREBASE_DATABASE_URL         — optional override of RTDB URL
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import admin from 'firebase-admin';
import { getAbbrId } from '../../shared/utils.js';

const PLAN_SECTION_ABBR = getAbbrId('PLANS'); // 'PLA'

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
      console.log('Usage: node mcp/scripts/migrate-add-plan-cardids.js [--dry-run] [--project <projectId>]');
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

// In-memory counter used only during --dry-run to preview the *sequence* of
// IDs that would be assigned without writing to Firestore. Keyed by counterKey.
const dryRunCounters = new Map();

async function nextCardId(firestore, counterKey, dryRun) {
  if (dryRun) {
    if (!dryRunCounters.has(counterKey)) {
      const snap = await firestore.collection('projectCounters').doc(counterKey).get();
      dryRunCounters.set(counterKey, snap.exists ? (snap.data().lastId || 0) : 0);
    }
    const next = dryRunCounters.get(counterKey) + 1;
    dryRunCounters.set(counterKey, next);
    return `${counterKey}-${String(next).padStart(4, '0')} (preview)`;
  }
  const counterRef = firestore.collection('projectCounters').doc(counterKey);
  return firestore.runTransaction(async (tx) => {
    const docSnap = await tx.get(counterRef);
    const last = docSnap.exists ? (docSnap.data().lastId || 0) : 0;
    const next = last + 1;
    tx.set(counterRef, { lastId: next }, { merge: true });
    return `${counterKey}-${String(next).padStart(4, '0')}`;
  });
}

async function migrateProject(db, firestore, projectId, dryRun) {
  const abbrSnap = await db.ref(`projects/${projectId}/abbreviation`).once('value');
  const abbr = abbrSnap.val();
  if (!abbr) {
    console.log(`${COLORS.yellow}  skipping ${projectId}: no abbreviation${COLORS.reset}`);
    return { scanned: 0, migrated: 0, skipped: 0 };
  }

  const plansSnap = await db.ref(`plans/${projectId}`).once('value');
  const plans = plansSnap.val();
  if (!plans) {
    console.log(`${COLORS.dim}  ${projectId}: no plans${COLORS.reset}`);
    return { scanned: 0, migrated: 0, skipped: 0 };
  }

  const counterKey = `${abbr}-${PLAN_SECTION_ABBR}`;
  let migrated = 0;
  let skipped = 0;
  const entries = Object.entries(plans);

  for (const [key, plan] of entries) {
    if (plan?.cardId) {
      skipped++;
      continue;
    }
    const cardId = await nextCardId(firestore, counterKey, dryRun);
    console.log(`${COLORS.cyan}  ${projectId}/${key} → ${cardId}${COLORS.reset}`);
    if (!dryRun) {
      await db.ref(`plans/${projectId}/${key}/cardId`).set(cardId);
    }
    migrated++;
  }

  return { scanned: entries.length, migrated, skipped };
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`${COLORS.cyan}Plan cardId backfill${args.dryRun ? ' (DRY RUN)' : ''}${COLORS.reset}`);

  const credentialsPath = resolveCredentialsPath();
  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
  const databaseURL = process.env.FIREBASE_DATABASE_URL
    || `https://${credentials.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    databaseURL
  });

  const db = admin.database();
  const firestore = admin.firestore();

  let projectIds;
  if (args.project) {
    projectIds = [args.project];
  } else {
    const snap = await db.ref('projects').once('value');
    projectIds = Object.keys(snap.val() || {});
  }

  console.log(`${COLORS.dim}Scanning ${projectIds.length} project(s)...${COLORS.reset}\n`);

  const totals = { scanned: 0, migrated: 0, skipped: 0 };
  for (const projectId of projectIds) {
    const result = await migrateProject(db, firestore, projectId, args.dryRun);
    totals.scanned += result.scanned;
    totals.migrated += result.migrated;
    totals.skipped += result.skipped;
  }

  console.log('');
  console.log(`${COLORS.green}Done.${COLORS.reset}`);
  console.log(`  scanned:  ${totals.scanned}`);
  console.log(`  migrated: ${totals.migrated}`);
  console.log(`  skipped:  ${totals.skipped} (already had cardId)`);

  await admin.app().delete();
}

main().catch(err => {
  console.error(`${COLORS.red}Error: ${err.message}${COLORS.reset}`);
  console.error(err.stack);
  process.exit(1);
});

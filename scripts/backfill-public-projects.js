#!/usr/bin/env node

/**
 * Backfill script: populate /publicProjects/{projectId} from the existing
 * /projects/{projectId} entries that already have public=true (or a non-empty
 * publicToken).
 *
 * The syncProjectPublicViews Cloud Function only writes /publicProjects/ when
 * a project's public flag transitions. This script seeds the directory for
 * the projects that were already public before the function was deployed, so
 * the public landing at /public/ is non-empty from day one.
 *
 * Usage:
 *   node scripts/backfill-public-projects.js [--dry-run] [--project <projectId>]
 *
 * Options:
 *   --dry-run    Print the planned writes/removes without touching RTDB
 *   --project    Restrict the run to a single projectId
 *
 * Environment:
 *   MCP_INSTANCE_DIR        Optional path to an instance dir holding
 *                           serviceAccountKey.json
 *   FIREBASE_DATABASE_URL   Optional override for the RTDB URL (required for
 *                           pgamexp-demo, whose live RTDB is the EU additional
 *                           instance, not the US default).
 *
 * Idempotent: existing /publicProjects/ entries are overwritten with the
 * fresh whitelisted snapshot; entries pointing to projects whose public flag
 * is now false are removed.
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Reuse the same whitelist + extractor the Cloud Function uses, so the
// directory entries written here are byte-for-byte identical to the ones
// the function would write on the next toggle.
const {
  extractPublicProjectFields,
  PUBLIC_PROJECT_FIELDS
} = require(resolve(__dirname, '..', 'functions', 'handlers', 'sync-card-views.js'));

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    projectFilter: args.includes('--project') ? args[args.indexOf('--project') + 1] : null
  };
}

function resolveCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  const instanceDir = process.env.MCP_INSTANCE_DIR;
  if (instanceDir) {
    const p = resolve(instanceDir, 'serviceAccountKey.json');
    if (existsSync(p)) return p;
  }
  return resolve(__dirname, '..', 'serviceAccountKey.json');
}

function initFirebase() {
  const credPath = resolveCredentials();
  if (!existsSync(credPath)) {
    console.error(`serviceAccountKey.json not found at: ${credPath}`);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
  const databaseURL = process.env.FIREBASE_DATABASE_URL ||
    `https://${serviceAccount.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL
  });

  return { db: admin.database(), databaseURL };
}

function isProjectPublic(projectData) {
  if (!projectData) return false;
  if (projectData.public === true) return true;
  if (typeof projectData.publicToken === 'string' && projectData.publicToken.length > 0) return true;
  return false;
}

/**
 * Pure planner: decide which /publicProjects/{id} entries to write or remove
 * given the current /projects and /publicProjects snapshots. No I/O.
 *
 * Idempotent on the same input: running it twice produces identical output.
 *
 * @param {Object} projects - Current /projects snapshot ({projectId: data})
 * @param {Object} existing - Current /publicProjects snapshot ({projectId: entry})
 * @param {string|null} projectFilter - Restrict the plan to a single projectId
 * @param {string} nowIso - ISO timestamp to stamp written entries
 * @returns {{toWrite: Object, toRemove: string[]}}
 */
function planBackfill(projects, existing, projectFilter, nowIso) {
  const safeProjects = projects || {};
  const safeExisting = existing || {};
  const toWrite = {};
  const toRemove = [];

  for (const [projectId, projectData] of Object.entries(safeProjects)) {
    if (projectFilter && projectId !== projectFilter) continue;
    if (!isProjectPublic(projectData)) {
      if (safeExisting[projectId]) toRemove.push(projectId);
      continue;
    }
    toWrite[projectId] = extractPublicProjectFields(projectData, nowIso);
  }

  // Stale entries: /publicProjects/ has an id whose project no longer exists.
  for (const projectId of Object.keys(safeExisting)) {
    if (projectFilter && projectId !== projectFilter) continue;
    if (!safeProjects[projectId] && !toRemove.includes(projectId)) {
      toRemove.push(projectId);
    }
  }

  return { toWrite, toRemove };
}

async function run() {
  const { dryRun, projectFilter } = parseArgs();
  const { db, databaseURL } = initFirebase();

  console.log('=== Backfill /publicProjects ===');
  console.log(`  RTDB: ${databaseURL}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'WRITE'}`);
  if (projectFilter) console.log(`  Filter: project=${projectFilter}`);
  console.log(`  Whitelist: ${PUBLIC_PROJECT_FIELDS.join(', ')}`);

  const projectsSnap = await db.ref('/projects').once('value');
  const projects = projectsSnap.val() || {};
  const existingSnap = await db.ref('/publicProjects').once('value');
  const existing = existingSnap.val() || {};

  const now = new Date().toISOString();
  const { toWrite, toRemove } = planBackfill(projects, existing, projectFilter, now);

  console.log(`\n  Public projects found: ${Object.keys(toWrite).length}`);
  for (const [id, entry] of Object.entries(toWrite)) {
    const kept = Object.keys(entry).filter(k => k !== 'updatedAt');
    console.log(`    + ${id}  [${kept.join(', ') || 'updatedAt only'}]`);
  }
  if (toRemove.length > 0) {
    console.log(`\n  Stale entries to remove: ${toRemove.length}`);
    for (const id of toRemove) console.log(`    - ${id}`);
  }

  if (dryRun) {
    console.log('\nDRY RUN — no writes performed.');
    await db.app.delete();
    return;
  }

  const updates = {};
  for (const [id, entry] of Object.entries(toWrite)) {
    updates[`/publicProjects/${id}`] = entry;
  }
  for (const id of toRemove) {
    updates[`/publicProjects/${id}`] = null;
  }

  if (Object.keys(updates).length === 0) {
    console.log('\nNothing to do.');
    await db.app.delete();
    return;
  }

  await db.ref().update(updates);
  console.log(`\nWrote ${Object.keys(toWrite).length} entries, removed ${toRemove.length}.`);
  await db.app.delete();
}

// Only run when invoked as a script (not when imported by tests).
const isMain = (() => {
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || '');
  } catch {
    return false;
  }
})();

if (isMain) {
  run().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}

export { planBackfill, isProjectPublic };

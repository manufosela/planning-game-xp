#!/usr/bin/env node

/**
 * MCP Smoke Test — verifies the MCP server can start and connect to Firebase.
 *
 * Checks performed:
 *  1. serviceAccountKey.json exists and is readable
 *  2. Firebase Admin SDK initializes successfully
 *  3. list_projects returns data from the database
 *
 * Usage:
 *   node mcp/scripts/smoke-test.js
 *   npm run mcp:test
 *
 * Environment variables (optional):
 *   MCP_INSTANCE_DIR — path to the instance directory
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service account key
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_DIR = resolve(__dirname, '..');

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function pass(msg) {
  console.log(`${COLORS.green}  PASS${COLORS.reset}  ${msg}`);
}

function fail(msg) {
  console.error(`${COLORS.red}  FAIL${COLORS.reset}  ${msg}`);
}

function info(msg) {
  console.log(`${COLORS.cyan}  INFO${COLORS.reset}  ${msg}`);
}

function header(msg) {
  console.log(`\n${COLORS.bold}${msg}${COLORS.reset}`);
}

/**
 * Resolve credentials path using the same logic as firebase-adapter.js
 */
function resolveCredentialsPath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  const instanceDir = process.env.MCP_INSTANCE_DIR;
  if (instanceDir) {
    const instancePath = resolve(instanceDir, 'serviceAccountKey.json');
    if (existsSync(instancePath)) {
      return instancePath;
    }
  }

  return resolve(MCP_DIR, '..', 'serviceAccountKey.json');
}

/**
 * Run all smoke test checks. Returns { passed, failed, errors[] }.
 */
export async function runSmokeTest() {
  const results = { passed: 0, failed: 0, errors: [] };

  header('Planning Game MCP — Smoke Test');
  console.log('');

  // --- Step 1: Check serviceAccountKey.json ---
  const credentialsPath = resolveCredentialsPath();
  info(`Credentials path: ${credentialsPath}`);

  if (!existsSync(credentialsPath)) {
    fail('serviceAccountKey.json not found');
    console.error('');
    console.error(`  Expected at: ${credentialsPath}`);
    console.error('');
    console.error('  How to fix:');
    console.error('  1. Go to Firebase Console > Project Settings > Service Accounts');
    console.error('  2. Click "Generate new private key"');
    console.error('  3. Save the file as serviceAccountKey.json in your instance directory');
    console.error('  4. Run: npm run mcp:test');
    console.error('');
    results.failed++;
    results.errors.push('serviceAccountKey.json not found');
    return results;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    if (!serviceAccount.project_id) {
      throw new Error('Missing project_id field');
    }
    pass(`serviceAccountKey.json found (project: ${serviceAccount.project_id})`);
    results.passed++;
  } catch (err) {
    fail(`serviceAccountKey.json is invalid: ${err.message}`);
    results.failed++;
    results.errors.push(`Invalid serviceAccountKey.json: ${err.message}`);
    return results;
  }

  // --- Step 2: Firebase initialization ---
  let admin;
  let app;
  try {
    admin = (await import('firebase-admin')).default;

    const databaseURL = process.env.FIREBASE_DATABASE_URL ||
      `https://${serviceAccount.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    }, `smoke-test-${Date.now()}`);

    pass('Firebase Admin SDK initialized');
    results.passed++;
  } catch (err) {
    fail(`Firebase initialization failed: ${err.message}`);
    results.failed++;
    results.errors.push(`Firebase init error: ${err.message}`);
    return results;
  }

  // --- Step 3: list_projects connectivity ---
  try {
    const db = admin.database(app);
    const snapshot = await db.ref('/projects').once('value');
    const data = snapshot.val();

    if (!data || typeof data !== 'object') {
      throw new Error('No projects found in database — expected at least one project');
    }

    const projectNames = Object.keys(data);
    pass(`Database connected — ${projectNames.length} project(s) found: ${projectNames.join(', ')}`);
    results.passed++;
  } catch (err) {
    fail(`Database query failed: ${err.message}`);
    results.failed++;
    results.errors.push(`Database query error: ${err.message}`);
  }

  // --- Cleanup ---
  try {
    await app.delete();
  } catch {
    // ignore cleanup errors
  }

  return results;
}

/**
 * Print summary and exit with appropriate code.
 */
function printSummary(results) {
  console.log('');
  header('Summary');

  if (results.failed === 0) {
    console.log(`${COLORS.green}${COLORS.bold}  All ${results.passed} checks passed!${COLORS.reset}`);
    console.log(`${COLORS.green}  MCP is ready to use.${COLORS.reset}`);
  } else {
    console.log(`${COLORS.red}  ${results.failed} check(s) failed, ${results.passed} passed.${COLORS.reset}`);
    console.log('');
    console.log('  To retry:');
    console.log(`${COLORS.yellow}    npm run mcp:test${COLORS.reset}`);
  }
  console.log('');
}

// --- Main execution ---
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const results = await runSmokeTest();
  printSummary(results);
  process.exit(results.failed > 0 ? 1 : 0);
}

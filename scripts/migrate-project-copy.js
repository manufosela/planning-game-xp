#!/usr/bin/env node

/**
 * migrate-project-copy.js
 *
 * Copies all cards (tasks, bugs, epics, sprints, proposals, QA) from one
 * Planning Game project to another in Firebase RTDB, transforming card IDs
 * and references (sprint, epic) to match the new project abbreviation.
 *
 * Also updates the Firestore projectCounters so new cards get sequential IDs.
 *
 * Usage:
 *   node scripts/migrate-project-copy.js \
 *     --source "Lean Construction" \
 *     --target "Manuelearning" \
 *     --source-abbr LCT \
 *     --target-abbr MEL \
 *     --credentials ./planning-game-instances/manufosela/serviceAccountKey.json
 *
 * Options:
 *   --dry-run   Show what would be written without actually writing
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- CLI args ---
const { values: args } = parseArgs({
  options: {
    source: { type: 'string' },
    target: { type: 'string' },
    'source-abbr': { type: 'string' },
    'target-abbr': { type: 'string' },
    credentials: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const SOURCE_PROJECT = args.source;
const TARGET_PROJECT = args.target;
const SOURCE_ABBR = args['source-abbr'];
const TARGET_ABBR = args['target-abbr'];
const DRY_RUN = args['dry-run'] || false;
const CREDENTIALS_PATH = resolve(args.credentials || resolve(__dirname, '..', 'planning-game-instances/manufosela/serviceAccountKey.json'));

if (!SOURCE_PROJECT || !TARGET_PROJECT || !SOURCE_ABBR || !TARGET_ABBR) {
  console.error('Usage: node scripts/migrate-project-copy.js --source "Project A" --target "Project B" --source-abbr AAA --target-abbr BBB [--credentials path] [--dry-run]');
  process.exit(1);
}

// --- Sections in RTDB ---
const SECTIONS = ['TASKS', 'BUGS', 'EPICS', 'SPRINTS', 'PROPOSALS', 'QA'];

// Mapping from section name to cardId prefix
const SECTION_TO_PREFIX = {
  TASKS: 'TSK',
  BUGS: 'BUG',
  EPICS: 'PCS',
  SPRINTS: 'SPR',
  PROPOSALS: 'PRP',
  QA: '_QA',
};

// Mapping from section name to Firestore counter key suffix
// NOTE: MCP uses format WITHOUT leading underscore (e.g., "MEL-TSK")
const SECTION_TO_COUNTER = {
  TASKS: 'TSK',
  BUGS: 'BUG',
  EPICS: 'PCS',
  SPRINTS: 'SPR',
  PROPOSALS: 'PRP',
  QA: '_QA',
};

// --- Init Firebase ---
const serviceAccount = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
const databaseURL = `https://${serviceAccount.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
});

const db = admin.database();
const firestore = admin.firestore();

// --- Helpers ---

/**
 * Replace all occurrences of source abbreviation with target in a string value.
 * Handles patterns like "LCT-TSK-0001" → "MEL-TSK-0001"
 */
function transformId(value) {
  if (typeof value !== 'string') return value;
  // Replace project abbreviation prefix in card IDs
  const regex = new RegExp(`^${SOURCE_ABBR}-`, '');
  if (regex.test(value)) {
    return value.replace(regex, `${TARGET_ABBR}-`);
  }
  return value;
}

/**
 * Deep-transform all string values in an object, replacing source IDs with target IDs.
 */
function transformCard(card) {
  const result = {};

  for (const [key, value] of Object.entries(card)) {
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    // Fields that contain card IDs to transform
    if (['cardId', 'sprint', 'epic', 'parentEpic'].includes(key) && typeof value === 'string') {
      result[key] = transformId(value);
      continue;
    }

    // projectId field → replace with target project
    if (key === 'projectId' && value === SOURCE_PROJECT) {
      result[key] = TARGET_PROJECT;
      continue;
    }

    // Arrays (e.g., relatedCards, commits, etc.)
    if (Array.isArray(value)) {
      result[key] = value.map(item => {
        if (typeof item === 'string') return transformId(item);
        if (typeof item === 'object' && item !== null) return transformCard(item);
        return item;
      });
      continue;
    }

    // Nested objects
    if (typeof value === 'object') {
      result[key] = transformCard(value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

// --- Main ---
async function main() {
  console.log(`\n📋 Copying project: "${SOURCE_PROJECT}" (${SOURCE_ABBR}) → "${TARGET_PROJECT}" (${TARGET_ABBR})`);
  console.log(`   Credentials: ${CREDENTIALS_PATH}`);
  console.log(`   Firebase project: ${serviceAccount.project_id}`);
  console.log(`   Dry run: ${DRY_RUN}\n`);

  const stats = {};
  const counterUpdates = {};

  for (const section of SECTIONS) {
    const sourcePath = `/cards/${SOURCE_PROJECT}/${section}_${SOURCE_PROJECT}`;
    const targetPath = `/cards/${TARGET_PROJECT}/${section}_${TARGET_PROJECT}`;

    console.log(`📂 Reading ${sourcePath}...`);
    const snapshot = await db.ref(sourcePath).once('value');
    const data = snapshot.val();

    if (!data) {
      console.log(`   ⏭️  No data in ${section}, skipping.\n`);
      stats[section] = 0;
      continue;
    }

    const entries = Object.entries(data);
    stats[section] = entries.length;
    console.log(`   Found ${entries.length} cards.`);

    // Track highest card number for counter update
    let maxNumber = 0;
    const prefix = SECTION_TO_PREFIX[section];

    const transformedData = {};
    for (const [firebaseId, card] of entries) {
      const transformed = transformCard(card);
      transformedData[firebaseId] = transformed;

      // Extract card number for counter
      if (transformed.cardId) {
        const match = transformed.cardId.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }

      if (DRY_RUN) {
        console.log(`   ${card.cardId} → ${transformed.cardId}`);
      }
    }

    // Write to target
    if (!DRY_RUN) {
      console.log(`   ✍️  Writing to ${targetPath}...`);
      await db.ref(targetPath).set(transformedData);
      console.log(`   ✅ Written ${entries.length} cards.\n`);
    } else {
      console.log(`   [DRY RUN] Would write ${entries.length} cards to ${targetPath}\n`);
    }

    // Track counter
    const counterKey = `${TARGET_ABBR}-${SECTION_TO_COUNTER[section]}`;
    counterUpdates[counterKey] = maxNumber;
  }

  // Update Firestore counters
  console.log('🔢 Updating Firestore projectCounters...');
  for (const [counterKey, lastId] of Object.entries(counterUpdates)) {
    if (lastId === 0) continue;

    if (!DRY_RUN) {
      await firestore.collection('projectCounters').doc(counterKey).set(
        { lastId },
        { merge: true }
      );
      console.log(`   ✅ ${counterKey}: lastId = ${lastId}`);
    } else {
      console.log(`   [DRY RUN] ${counterKey}: lastId = ${lastId}`);
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  for (const [section, count] of Object.entries(stats)) {
    console.log(`   ${section}: ${count} cards`);
  }
  console.log(`\n${DRY_RUN ? '⚠️  DRY RUN - nothing was written.' : '🎉 Migration complete!'}\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

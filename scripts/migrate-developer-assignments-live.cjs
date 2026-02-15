#!/usr/bin/env node
/**
 * Script to migrate developer assignments IN PRODUCTION (live updates)
 *
 * This script connects to Firebase and updates ONLY the developer field
 * of cards that are assigned to the duplicate developer IDs.
 *
 * Usage:
 *   node scripts/migrate-developer-assignments-live.cjs [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be changed without making changes
 *
 * Requirements:
 *   - Firebase Admin SDK credentials (service account)
 *   - Or run with emulator for testing
 */

const admin = require('firebase-admin');
const path = require('path');

// Mapping: old duplicate ID -> consolidated ID
const DEVELOPER_MIGRATION = {
  'dev_018': 'dev_002',  // aamartinez_maurerlabs.com#ext#@... -> Alex Martínez
  'dev_019': 'dev_011',  // ogiriepar_maurerlabs.com#ext#@... -> Oscar Giriepar
  'dev_020': 'dev_004',  // dglopez_maurerlabs.com#ext#@... -> Dani González
};

const DEVELOPER_NAMES = {
  'dev_002': 'Alex Martínez',
  'dev_011': 'Oscar Giriepar',
  'dev_004': 'Dani González',
};

const isDryRun = process.argv.includes('--dry-run');
const databaseURL =
  process.env.PUBLIC_FIREBASE_DATABASE_URL ||
  process.env.FIREBASE_DATABASE_URL ||
  process.env.DATABASE_URL;

async function initializeFirebase() {
  // Try to load service account from common locations
  const possiblePaths = [
    path.join(__dirname, '..', 'serviceAccountKey.json'),
    path.join(__dirname, '..', 'firebase-admin-key.json'),
    path.join(__dirname, '..', '.firebase-admin-key.json'),
  ];

  let serviceAccount = null;
  for (const p of possiblePaths) {
    try {
      serviceAccount = require(p);
      console.log(`Using service account from: ${p}`);
      break;
    } catch (e) {
      // Continue trying
    }
  }

  if (!serviceAccount) {
    console.error('Error: No service account key found.');
    console.error('Please place your Firebase Admin SDK key in one of these locations:');
    possiblePaths.forEach(p => console.error(`  - ${p}`));
    console.error('\nYou can download it from Firebase Console > Project Settings > Service Accounts');
    process.exit(1);
  }

  if (!databaseURL) {
    console.error('Error: Missing PUBLIC_FIREBASE_DATABASE_URL/FIREBASE_DATABASE_URL.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL
  });

  return admin.database();
}

async function findAndMigrateCards(db) {
  const updates = [];

  console.log('\nScanning for cards with duplicate developer assignments...\n');

  // Get all cards
  const cardsRef = db.ref('/cards');
  const snapshot = await cardsRef.once('value');
  const cardsData = snapshot.val();

  if (!cardsData) {
    console.log('No cards found in database.');
    return;
  }

  // Recursively scan for cards
  function scanForCards(data, currentPath) {
    if (!data || typeof data !== 'object') return;

    // Check if this looks like a card
    if (data.cardId || data.cardType) {
      // Check developer field
      if (data.developer && DEVELOPER_MIGRATION[data.developer]) {
        updates.push({
          path: `/cards${currentPath}/developer`,
          oldValue: data.developer,
          newValue: DEVELOPER_MIGRATION[data.developer],
          cardId: data.cardId || 'unknown',
          field: 'developer'
        });
        // Also update developerName if it exists
        if (data.developerName !== undefined) {
          updates.push({
            path: `/cards${currentPath}/developerName`,
            oldValue: data.developerName,
            newValue: DEVELOPER_NAMES[DEVELOPER_MIGRATION[data.developer]],
            cardId: data.cardId || 'unknown',
            field: 'developerName'
          });
        }
      }

      // Check assignee field
      if (data.assignee && DEVELOPER_MIGRATION[data.assignee]) {
        updates.push({
          path: `/cards${currentPath}/assignee`,
          oldValue: data.assignee,
          newValue: DEVELOPER_MIGRATION[data.assignee],
          cardId: data.cardId || 'unknown',
          field: 'assignee'
        });
      }

      // Check coDevelopers array
      if (Array.isArray(data.coDevelopers)) {
        data.coDevelopers.forEach((coDev, index) => {
          if (DEVELOPER_MIGRATION[coDev]) {
            updates.push({
              path: `/cards${currentPath}/coDevelopers/${index}`,
              oldValue: coDev,
              newValue: DEVELOPER_MIGRATION[coDev],
              cardId: data.cardId || 'unknown',
              field: `coDevelopers[${index}]`
            });
          }
        });
      }

      return; // Don't recurse into card properties
    }

    // Recurse into nested objects
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object') {
        scanForCards(value, `${currentPath}/${key}`);
      }
    }
  }

  scanForCards(cardsData, '');

  // Report findings
  if (updates.length === 0) {
    console.log('✅ No cards found with duplicate developer assignments.');
    return;
  }

  console.log(`Found ${updates.length} fields to update:\n`);

  // Group by cardId for cleaner output
  const byCard = {};
  for (const update of updates) {
    if (!byCard[update.cardId]) {
      byCard[update.cardId] = [];
    }
    byCard[update.cardId].push(update);
  }

  for (const [cardId, cardUpdates] of Object.entries(byCard)) {
    console.log(`  ${cardId}:`);
    for (const update of cardUpdates) {
      console.log(`    ${update.field}: ${update.oldValue} -> ${update.newValue}`);
    }
  }

  if (isDryRun) {
    console.log('\n🔍 DRY RUN - No changes made.');
    console.log('Run without --dry-run to apply these changes.');
    return;
  }

  // Apply updates
  console.log('\nApplying updates...\n');

  for (const update of updates) {
    try {
      await db.ref(update.path).set(update.newValue);
      console.log(`  ✅ Updated ${update.path}`);
    } catch (error) {
      console.error(`  ❌ Failed to update ${update.path}: ${error.message}`);
    }
  }

  console.log(`\n✅ Migration complete. ${updates.length} fields updated.`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Developer Assignment Migration (LIVE)');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('\n⚠️  LIVE MODE - Changes will be applied to production!\n');
  }

  console.log('Migration mapping:');
  for (const [oldId, newId] of Object.entries(DEVELOPER_MIGRATION)) {
    console.log(`  ${oldId} -> ${newId} (${DEVELOPER_NAMES[newId]})`);
  }

  const db = await initializeFirebase();
  await findAndMigrateCards(db);

  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

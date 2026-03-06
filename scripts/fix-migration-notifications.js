#!/usr/bin/env node

/**
 * fix-migration-notifications.js
 *
 * After a migration, the Cloud Function onTaskStatusValidation may have:
 * 1. Reverted "Done&Validated" cards back to a previous status
 * 2. Created error notifications in /notifications/{email}
 *
 * This script:
 * - Checks if any cards were reverted (_validationReverted flag)
 * - Cleans up validation-error notifications
 * - Re-applies the correct status if cards were reverted
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    credentials: { type: 'string' },
    'clean-notifications': { type: 'boolean', default: false },
    'fix-reverted': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const PROJECT = args.project;
const DRY_RUN = args['dry-run'] || false;
const CLEAN_NOTIFICATIONS = args['clean-notifications'] || false;
const FIX_REVERTED = args['fix-reverted'] || false;
const CREDENTIALS_PATH = resolve(args.credentials || resolve(__dirname, '..', 'planning-game-instances/manufosela/serviceAccountKey.json'));

if (!PROJECT) {
  console.error('Usage: node scripts/fix-migration-notifications.js --project "ProjectName" [--clean-notifications] [--fix-reverted] [--dry-run]');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
const databaseURL = `https://${serviceAccount.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
});

const db = admin.database();

const SECTIONS = ['TASKS', 'BUGS', 'EPICS', 'SPRINTS', 'PROPOSALS', 'QA'];

async function checkRevertedCards() {
  console.log(`\n🔍 Checking cards in project "${PROJECT}" for reverted status...\n`);

  let revertedCount = 0;
  let totalCards = 0;
  const revertedCards = [];

  for (const section of SECTIONS) {
    const path = `/cards/${PROJECT}/${section}_${PROJECT}`;
    const snapshot = await db.ref(path).once('value');
    const data = snapshot.val();
    if (!data) continue;

    for (const [fbId, card] of Object.entries(data)) {
      totalCards++;
      if (card._validationReverted) {
        revertedCount++;
        revertedCards.push({
          firebaseId: fbId,
          cardId: card.cardId,
          currentStatus: card.status,
          section,
          error: card._validationError,
        });
        console.log(`   ⚠️  ${card.cardId} (${section}) — reverted to "${card.status}" — Error: ${card._validationError}`);
      }
    }
  }

  console.log(`\n📊 Total: ${totalCards} cards, ${revertedCount} reverted\n`);
  return revertedCards;
}

async function fixRevertedCards(revertedCards) {
  if (revertedCards.length === 0) {
    console.log('✅ No reverted cards to fix.\n');
    return;
  }

  console.log(`\n🔧 Fixing ${revertedCards.length} reverted cards...\n`);

  for (const card of revertedCards) {
    const path = `/cards/${PROJECT}/${card.section}_${PROJECT}/${card.firebaseId}`;

    // Remove the revert flags and restore Done&Validated
    const updates = {
      '_validationReverted': null,
      '_validationError': null,
      'status': 'Done&Validated',
    };

    if (DRY_RUN) {
      console.log(`   [DRY RUN] ${card.cardId}: would restore to "Done&Validated"`);
    } else {
      await db.ref(path).update(updates);
      console.log(`   ✅ ${card.cardId}: restored to "Done&Validated"`);
    }
  }
}

async function cleanNotifications() {
  console.log('\n🧹 Cleaning validation-error notifications...\n');

  const notifSnapshot = await db.ref('/notifications').once('value');
  const allNotifs = notifSnapshot.val();

  if (!allNotifs) {
    console.log('   No notifications found.\n');
    return;
  }

  let cleaned = 0;
  for (const [userKey, userNotifs] of Object.entries(allNotifs)) {
    if (!userNotifs || typeof userNotifs !== 'object') continue;

    for (const [notifId, notif] of Object.entries(userNotifs)) {
      if (notif.type === 'validation-error' && notif.projectId === PROJECT) {
        if (DRY_RUN) {
          console.log(`   [DRY RUN] Would delete: ${notif.message?.substring(0, 60)}...`);
        } else {
          await db.ref(`/notifications/${userKey}/${notifId}`).remove();
          console.log(`   🗑️  Deleted: ${notif.message?.substring(0, 60)}...`);
        }
        cleaned++;
      }
    }
  }

  console.log(`\n   Total cleaned: ${cleaned} notifications\n`);
}

async function main() {
  const revertedCards = await checkRevertedCards();

  if (FIX_REVERTED) {
    await fixRevertedCards(revertedCards);
  }

  if (CLEAN_NOTIFICATIONS) {
    await cleanNotifications();
  }

  if (!FIX_REVERTED && !CLEAN_NOTIFICATIONS) {
    console.log('💡 Use --fix-reverted to restore reverted cards');
    console.log('💡 Use --clean-notifications to remove error notifications');
    console.log('💡 Add --dry-run to preview without changes\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

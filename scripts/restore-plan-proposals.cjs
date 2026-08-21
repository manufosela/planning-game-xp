#!/usr/bin/env node
/**
 * Reverse of scripts/migrate-plan-proposals.cjs — PLN-TSK-0359.
 *
 * PLN-TSK-0357 moved the plan proposals (/planProposals, free text) into
 * proposal CARDS. They are NOT the same thing: a plan proposal is free text
 * written by the AI and turned into a development plan, while a proposal card
 * is a Como/Quiero/Para user story so people outside the team can propose
 * work. This script puts the plan proposals back.
 *
 * Usage:
 *   node scripts/restore-plan-proposals.cjs <instanceName> [--dry-run]
 *
 * For each entry archived at /planProposals-migrated/{proj}/{key}:
 *   - Restores it to /planProposals/{proj}/{key} exactly as it was
 *     (title, description, tags, sourceDocumentUrl, status, planIds).
 *   - Removes the proposal card that the migration created for it
 *     (the one whose migratedFromPlanProposal === key).
 *   - Leaves the plans untouched: they still carry their original proposalId.
 *
 * Idempotent: skips entries already present in /planProposals.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scripts/restore-plan-proposals.cjs <instanceName> [--dry-run]');
  process.exit(1);
}
const [instanceName, ...flags] = args;
const dryRun = flags.includes('--dry-run');

const instanceDir = path.join(__dirname, '..', 'planning-game-instances', instanceName);
const sa = JSON.parse(fs.readFileSync(path.join(instanceDir, 'serviceAccountKey.json'), 'utf8'));
const rc = JSON.parse(fs.readFileSync(path.join(instanceDir, '.firebaserc'), 'utf8'));
const projectId = rc.projects.default;
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: process.env.FIREBASE_DATABASE_URL ||
    `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`
});

async function main() {
  const db = admin.database();

  console.log(`Instance: ${instanceName} (${projectId}) — ${dryRun ? 'DRY RUN' : 'WRITE'}\n`);

  const archived = (await db.ref('/planProposals-migrated').once('value')).val() || {};
  if (Object.keys(archived).length === 0) {
    console.log('Nothing archived at /planProposals-migrated — nothing to restore.');
    process.exit(0);
  }

  let restored = 0;
  let skipped = 0;
  let cardsRemoved = 0;

  for (const [proj, proposals] of Object.entries(archived)) {
    const cardsPath = `/cards/${proj}/PROPOSALS_${proj}`;
    const cards = (await db.ref(cardsPath).once('value')).val() || {};

    for (const [key, proposal] of Object.entries(proposals || {})) {
      if (!proposal) continue;

      const alreadyLive = (await db.ref(`/planProposals/${proj}/${key}`).once('value')).exists();
      if (alreadyLive) {
        console.log(`  SKIP  ${proj}/${key} (already in /planProposals)`);
        skipped++;
        continue;
      }

      // The proposal card the migration created for this entry, if still there.
      const cardEntry = Object.entries(cards)
        .find(([, card]) => card && card.migratedFromPlanProposal === key);

      if (dryRun) {
        console.log(`  PLAN  restore ${proj}/${key} "${proposal.title}"` +
          (cardEntry ? ` + remove card ${cardEntry[1].cardId}` : ' (no card to remove)'));
        restored++;
        continue;
      }

      await db.ref(`/planProposals/${proj}/${key}`).set(proposal);
      await db.ref(`/planProposals-migrated/${proj}/${key}`).remove();

      let removedNote = '';
      if (cardEntry) {
        const [cardKey, card] = cardEntry;
        await db.ref(`${cardsPath}/${cardKey}`).remove();
        // The optimized view row must go with it.
        await db.ref(`/views/proposal-list/${proj}/${cardKey}`).remove();
        removedNote = ` + removed card ${card.cardId}`;
        cardsRemoved++;
      }

      console.log(`  OK    ${proj}/${key} "${proposal.title}"${removedNote}`);
      restored++;
    }
  }

  console.log(`\nSummary: ${restored} ${dryRun ? 'would be restored' : 'restored'}, ` +
    `${cardsRemoved} cards removed, ${skipped} skipped.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Restore failed:', err);
  process.exit(1);
});

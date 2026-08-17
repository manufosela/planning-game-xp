#!/usr/bin/env node
/**
 * Migrate legacy plan proposals (/planProposals/{proj}) into proposal CARDS
 * (/cards/{proj}/PROPOSALS_{proj}) — PLN-TSK-0357 unification.
 *
 * Usage:
 *   node scripts/migrate-plan-proposals.cjs <instanceName> [--dry-run]
 *
 * For each legacy proposal:
 *   - Creates a proposal card (cardId XXX-PRP-NNNN via Firestore counter)
 *     with the description enriched with tags / sourceDocumentUrl and a
 *     migration note referencing the plan(s) it generated.
 *   - Sets convertedToPlan=<planCardId> when a linked plan exists.
 *   - Sets migratedFromPlanProposal=<originalKey> (idempotency marker).
 *   - Moves the original to /planProposals-migrated/{proj}/{key}.
 *
 * Idempotent: proposals whose key already appears as
 * migratedFromPlanProposal in an existing card are skipped.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scripts/migrate-plan-proposals.cjs <instanceName> [--dry-run]');
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
  databaseURL: `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`
});

async function nextCardId(firestore, projectAbbr) {
  const counterRef = firestore.collection('projectCounters').doc(`${projectAbbr}-PRP`);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const lastId = snap.exists ? (snap.data().lastId || 0) : 0;
    const newId = lastId + 1;
    tx.set(counterRef, { lastId: newId }, { merge: true });
    return `${projectAbbr}-PRP-${String(newId).padStart(4, '0')}`;
  });
}

async function main() {
  const db = admin.database();
  const firestore = admin.firestore();

  console.log(`Instance: ${instanceName} (${projectId}) — ${dryRun ? 'DRY RUN' : 'WRITE'}\n`);

  const allProposals = (await db.ref('/planProposals').once('value')).val() || {};
  let migrated = 0;
  let skipped = 0;

  for (const [proj, proposals] of Object.entries(allProposals)) {
    const abbrSnap = await db.ref(`/projects/${proj}/abbreviation`).once('value');
    const projectAbbr = abbrSnap.val();
    if (!projectAbbr) {
      console.warn(`  SKIP project "${proj}" — no abbreviation configured`);
      continue;
    }

    const cardsPath = `/cards/${proj}/PROPOSALS_${proj}`;
    const existingCards = (await db.ref(cardsPath).once('value')).val() || {};
    const alreadyMigrated = new Set(
      Object.values(existingCards)
        .map(c => c && c.migratedFromPlanProposal)
        .filter(Boolean)
    );

    const plans = (await db.ref(`/plans/${proj}`).once('value')).val() || {};

    for (const [key, prop] of Object.entries(proposals || {})) {
      if (!prop) continue;
      if (alreadyMigrated.has(key)) {
        console.log(`  SKIP  ${proj}/${key} (already migrated)`);
        skipped++;
        continue;
      }

      const linkedPlans = Object.values(plans)
        .filter(p => p && (p.proposalId === key || (prop.planIds || []).includes(p.firebaseId)))
        .map(p => p.cardId)
        .filter(Boolean);
      // planIds on the proposal reference plan push keys — resolve those too.
      for (const planKey of prop.planIds || []) {
        const plan = plans[planKey];
        if (plan && plan.cardId && !linkedPlans.includes(plan.cardId)) {
          linkedPlans.push(plan.cardId);
        }
      }

      const noteLines = [
        prop.description || '',
        '',
        '---',
        `_Migrada desde plan proposal (${key}) el ${new Date().toISOString().slice(0, 10)} — PLN-TSK-0357._`
      ];
      if ((prop.tags || []).length > 0) noteLines.push(`_Tags: ${prop.tags.join(', ')}_`);
      if (prop.sourceDocumentUrl) noteLines.push(`_Fuente: ${prop.sourceDocumentUrl}_`);
      if (linkedPlans.length > 0) noteLines.push(`_Plan(es) generado(s): ${linkedPlans.join(', ')}_`);

      if (dryRun) {
        console.log(`  PLAN  ${proj}/${key} "${prop.title}" -> ${projectAbbr}-PRP-NNNN` +
          (linkedPlans.length ? ` (convertedToPlan: ${linkedPlans[0]})` : ''));
        migrated++;
        continue;
      }

      const cardId = await nextCardId(firestore, projectAbbr);
      const newRef = db.ref(cardsPath).push();
      const cardData = {
        cardId,
        cardType: 'proposal-card',
        group: 'proposals',
        projectId: proj,
        title: prop.title || 'Sin título',
        description: noteLines.join('\n'),
        status: 'To Do',
        year: prop.createdAt ? Number(prop.createdAt.slice(0, 4)) : new Date().getFullYear(),
        createdAt: prop.createdAt || new Date().toISOString(),
        createdBy: prop.createdBy || 'migrate-plan-proposals',
        migratedFromPlanProposal: key,
        firebaseId: newRef.key
      };
      if (linkedPlans.length > 0) cardData.convertedToPlan = linkedPlans[0];

      await newRef.set(cardData);
      await db.ref(`/planProposals-migrated/${proj}/${key}`).set(prop);
      await db.ref(`/planProposals/${proj}/${key}`).remove();

      console.log(`  OK    ${proj}/${key} "${prop.title}" -> ${cardId}` +
        (linkedPlans.length ? ` (convertedToPlan: ${linkedPlans[0]})` : ''));
      migrated++;
    }
  }

  console.log(`\nSummary: ${migrated} ${dryRun ? 'would migrate' : 'migrated'}, ${skipped} skipped.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

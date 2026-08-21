#!/usr/bin/env node
/**
 * Put every proposal where it belongs and in the shape it deserves — PLN-TSK-0360.
 *
 * A proposal CARD is a TASK proposal: a Como/Quiero/Para user story for one
 * unit of work. Free-text ideas of plan size are PLAN proposals and belong in
 * /planProposals (the Proposals sub-tab of Dev Plans). Historically the MCP
 * accepted anything, so prose ended up dumped in the "Como" field.
 *
 * Driven by a decisions file: { "<cardId>": {action: "story", role, goal, benefit}
 *                             | {action: "plan"} }
 *
 * - action "story": writes descDado/descCuando/descPara, keeps the original
 *   text in the card notes so nothing is lost, and cleans the leaked
 *   tool-call fragments some descriptions carry.
 * - action "plan": creates /planProposals/{project}/<key> with the full text
 *   and removes the proposal card (and its optimized view row).
 *
 * Everything is archived to /proposals-archived/{project}/<key> first, so the
 * whole run is reversible.
 *
 * Usage:
 *   node scripts/fix-proposals.cjs <instanceName> <decisions.json> [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const [instanceName, decisionsPath, ...flags] = process.argv.slice(2);
if (!instanceName || !decisionsPath) {
  console.error('Usage: node scripts/fix-proposals.cjs <instanceName> <decisions.json> [--dry-run]');
  process.exit(1);
}
const dryRun = flags.includes('--dry-run');

const instanceDir = path.join(__dirname, '..', 'planning-game-instances', instanceName);
const sa = JSON.parse(fs.readFileSync(path.join(instanceDir, 'serviceAccountKey.json'), 'utf8'));
const rc = JSON.parse(fs.readFileSync(path.join(instanceDir, '.firebaserc'), 'utf8'));
const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: process.env.FIREBASE_DATABASE_URL ||
    `https://${rc.projects.default}-default-rtdb.europe-west1.firebasedatabase.app`
});

/**
 * Some descriptions carry leaked tool-call fragments from bad MCP calls
 * (e.g. "</description><parameter name=\"_hasContext\">true").
 * @param {string} text
 * @returns {string}
 */
function stripToolCallLeftovers(text) {
  return text
    .replace(/<\/?(description|parameter|invoke|_hasContext|priority)[^>]*>/g, '')
    .replace(/\btrue\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const db = admin.database();
  const all = (await db.ref('/cards').once('value')).val() || {};

  const stats = { stories: 0, movedToPlan: 0, skipped: 0 };

  for (const [proj, sections] of Object.entries(all)) {
    const cardsPath = `/cards/${proj}/PROPOSALS_${proj}`;
    const cards = sections[`PROPOSALS_${proj}`] || {};

    for (const [key, card] of Object.entries(cards)) {
      if (!card || card.deletedAt) continue;
      const decision = decisions[card.cardId];
      if (!decision) continue;

      const originalText = stripToolCallLeftovers(
        (card.descDado || '').trim() || (card.description || '').trim()
      );

      if (decision.action === 'story') {
        const description = `**Como** ${decision.role}\n**Quiero** ${decision.goal}\n**Para** ${decision.benefit}`;
        const keptNote = `Texto original de la propuesta (antes de darle forma de historia de usuario, PLN-TSK-0360):\n\n${originalText}`;

        if (dryRun) {
          console.log(`  STORY  ${card.cardId} [${proj}]`);
          console.log(`         Como   ${decision.role}`);
          console.log(`         Quiero ${decision.goal}`);
          console.log(`         Para   ${decision.benefit}`);
          stats.stories++;
          continue;
        }

        await db.ref(`/proposals-archived/${proj}/${key}`).set(card);
        await db.ref(`${cardsPath}/${key}`).update({
          descDado: decision.role,
          descCuando: decision.goal,
          descPara: decision.benefit,
          description,
          notes: card.notes ? `${card.notes}\n\n---\n\n${keptNote}` : keptNote,
          updatedAt: new Date().toISOString(),
          updatedBy: 'fix-proposals (PLN-TSK-0360)'
        });
        console.log(`  STORY  ${card.cardId} [${proj}] reescrita como historia de usuario`);
        stats.stories++;
        continue;
      }

      if (decision.action === 'plan') {
        if (dryRun) {
          console.log(`  PLAN   ${card.cardId} [${proj}] → /planProposals (${originalText.length} chars) "${(card.title || '').slice(0, 60)}"`);
          stats.movedToPlan++;
          continue;
        }

        const now = new Date().toISOString();
        const proposalRef = db.ref(`/planProposals/${proj}`).push();
        await proposalRef.set({
          title: (card.title || 'Sin título').slice(0, 200),
          description: originalText.slice(0, 5000),
          status: 'pending',
          tags: [],
          planIds: [],
          createdAt: card.createdAt || now,
          updatedAt: now,
          createdBy: card.createdBy || 'fix-proposals',
          movedFromProposalCard: card.cardId
        });

        await db.ref(`/proposals-archived/${proj}/${key}`).set(card);
        await db.ref(`${cardsPath}/${key}`).remove();
        await db.ref(`/views/proposal-list/${proj}/${key}`).remove();

        console.log(`  PLAN   ${card.cardId} [${proj}] → plan proposal ${proposalRef.key}`);
        stats.movedToPlan++;
      }
    }
  }

  console.log(`\nResumen (${dryRun ? 'DRY RUN' : 'ESCRITO'}): ` +
    `${stats.stories} reescritas como historia, ${stats.movedToPlan} movidas a propuestas de plan.`);
  process.exit(0);
}

main().catch(err => {
  console.error('fix-proposals failed:', err);
  process.exit(1);
});

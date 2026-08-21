#!/usr/bin/env node
/**
 * Inventory of proposal CARDS that are not task proposals — PMC-TSK-0075 / PLN.
 *
 * A proposal card is meant to be a Como/Quiero/Para user story. Anything
 * without "Quiero" and "Para" is prose, i.e. a PLAN proposal sitting in the
 * wrong place. This script only REPORTS; it never writes.
 *
 * Usage: node scripts/classify-proposals.cjs <instanceName>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const instanceName = process.argv[2];
if (!instanceName) {
  console.error('Usage: node scripts/classify-proposals.cjs <instanceName>');
  process.exit(1);
}

const dir = path.join(__dirname, '..', 'planning-game-instances', instanceName);
const sa = JSON.parse(fs.readFileSync(path.join(dir, 'serviceAccountKey.json'), 'utf8'));
const rc = JSON.parse(fs.readFileSync(path.join(dir, '.firebaserc'), 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: process.env.FIREBASE_DATABASE_URL ||
    `https://${rc.projects.default}-default-rtdb.europe-west1.firebasedatabase.app`
});

(async () => {
  const db = admin.database();
  const all = (await db.ref('/cards').once('value')).val() || {};

  const byProject = {};
  let stories = 0;
  let prose = 0;
  let emptyOnes = 0;

  for (const [proj, sections] of Object.entries(all)) {
    const props = sections[`PROPOSALS_${proj}`] || {};
    for (const [key, card] of Object.entries(props)) {
      if (!card || card.deletedAt) continue;

      const goal = (card.descCuando || '').trim();
      const benefit = (card.descPara || '').trim();
      const role = (card.descDado || '').trim();
      const legacy = (card.description || '').trim();

      if (goal && benefit) { stories++; continue; }

      const text = role || legacy;
      if (!text) { emptyOnes++; continue; }

      prose++;
      byProject[proj] = byProject[proj] || [];
      byProject[proj].push({
        key,
        cardId: card.cardId,
        title: (card.title || '').slice(0, 70),
        chars: text.length,
        createdBy: card.createdBy || '?',
        convertedToPlan: card.convertedToPlan || null
      });
    }
  }

  console.log(`Instancia ${instanceName}\n`);
  console.log(`  Propuestas de TAREA de verdad (Quiero + Para): ${stories}`);
  console.log(`  Propuestas que son TEXTO (deberian ser plan proposals): ${prose}`);
  console.log(`  Sin contenido: ${emptyOnes}\n`);

  for (const [proj, items] of Object.entries(byProject)) {
    console.log(`  ${proj} (${items.length}):`);
    items.sort((a, b) => b.chars - a.chars);
    for (const it of items) {
      console.log(`    ${it.cardId}  ${String(it.chars).padStart(5)} chars  ${it.title}`);
    }
    console.log('');
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

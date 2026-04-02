#!/usr/bin/env node

/**
 * migrate-generate-public-views.js
 *
 * Generates /publicViews/{projectId}/{type}/{cardId} entries for all cards
 * in projects that have public=true or publicToken set.
 *
 * Usage:
 *   node scripts/migrate-generate-public-views.js [--dry-run]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const dryRun = process.argv.includes('--dry-run');

const PUBLIC_VIEW_FIELDS = [
  'cardId', 'title', 'status', 'devPoints', 'businessPoints',
  'startDate', 'endDate', 'priority', 'sprint', 'epic', 'year'
];

const SECTION_MAP = {
  TASKS: { publicType: 'tasks', cardType: 'task' },
  BUGS: { publicType: 'bugs', cardType: 'bug' },
  EPICS: { publicType: 'epics', cardType: 'epic' }
};

const INSTANCES = [
  {
    name: 'geniova',
    keyPath: 'planning-game-instances/geniova/serviceAccountKey.json',
    databaseURL: 'https://planning-gamexp-default-rtdb.europe-west1.firebasedatabase.app'
  },
  {
    name: 'manufosela',
    keyPath: 'planning-game-instances/manufosela/serviceAccountKey.json',
    databaseURL: 'https://planning-game-xp-default-rtdb.europe-west1.firebasedatabase.app'
  },
  {
    name: 'demo',
    keyPath: 'planning-game-instances/demo/serviceAccountKey.json',
    databaseURL: 'https://pgamexp-demo-default-rtdb.firebaseio.com'
  }
];

function extractPublicFields(cardData, firebaseId, cardType) {
  const view = { firebaseId, type: cardType };
  for (const field of PUBLIC_VIEW_FIELDS) {
    if (cardData[field] !== undefined) {
      view[field] = cardData[field];
    }
  }
  return view;
}

async function migrateInstance(instanceConfig) {
  const keyFullPath = resolve(projectRoot, instanceConfig.keyPath);
  if (!existsSync(keyFullPath)) {
    console.log(`  SKIP: ${instanceConfig.name} (no serviceAccountKey.json)`);
    return { name: instanceConfig.name, skipped: true, projects: 0, cards: 0 };
  }

  const serviceAccount = JSON.parse(readFileSync(keyFullPath, 'utf8'));
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: instanceConfig.databaseURL
  }, instanceConfig.name);

  const db = app.database();

  try {
    // Find public projects
    const projectsSnap = await db.ref('/projects').once('value');
    const allProjects = projectsSnap.val() || {};

    const publicProjects = Object.entries(allProjects).filter(
      ([, p]) => p && (p.public === true || p.publicToken)
    );

    if (publicProjects.length === 0) {
      console.log('    No public projects found.');
      return { name: instanceConfig.name, skipped: false, projects: 0, cards: 0 };
    }

    console.log(`    Found ${publicProjects.length} public project(s): ${publicProjects.map(([id]) => id).join(', ')}`);

    let totalCards = 0;
    const BATCH_SIZE = 20;

    for (const [projectId] of publicProjects) {
      const cardsSnap = await db.ref(`/cards/${projectId}`).once('value');
      const allSections = cardsSnap.val() || {};
      const updates = {};

      for (const [sectionKey, cards] of Object.entries(allSections)) {
        // Match section to type
        const prefix = sectionKey.split('_')[0];
        const mapping = SECTION_MAP[prefix];
        if (!mapping || !cards || typeof cards !== 'object') continue;

        for (const [cardKey, card] of Object.entries(cards)) {
          if (!card || typeof card !== 'object' || card.deletedAt) continue;
          const viewData = extractPublicFields(card, cardKey, mapping.cardType);
          updates[`/publicViews/${projectId}/${mapping.publicType}/${cardKey}`] = viewData;
          totalCards++;
        }
      }

      const keys = Object.keys(updates);
      if (keys.length === 0) {
        console.log(`    ${projectId}: no cards to sync`);
        continue;
      }

      console.log(`    ${projectId}: ${keys.length} cards`);

      if (!dryRun) {
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
          const batch = {};
          keys.slice(i, i + BATCH_SIZE).forEach(k => { batch[k] = updates[k]; });
          await db.ref().update(batch);
        }
        console.log(`      Written in ${Math.ceil(keys.length / BATCH_SIZE)} batches.`);
      }
    }

    return { name: instanceConfig.name, skipped: false, projects: publicProjects.length, cards: totalCards };
  } finally {
    await app.delete();
  }
}

async function main() {
  console.log(`\n========================================`);
  console.log(`  Generate Public Views`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`========================================\n`);

  const results = [];

  for (const instance of INSTANCES) {
    console.log(`[${instance.name}]`);
    try {
      const result = await migrateInstance(instance);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ name: instance.name, skipped: false, projects: 0, cards: 0, error: err.message });
    }
    console.log('');
  }

  console.log(`========================================`);
  console.log(`  Summary`);
  console.log(`========================================`);
  for (const r of results) {
    const status = r.skipped ? 'SKIP' : r.error ? 'ERROR' : 'OK';
    console.log(`  ${status}  ${r.name}: ${r.projects} projects, ${r.cards} cards`);
  }

  if (dryRun) {
    console.log(`\n  DRY RUN — no changes written.`);
    console.log(`  Run without --dry-run to apply.\n`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

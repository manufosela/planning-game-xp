#!/usr/bin/env node

/**
 * cleanup-epic-fields.js
 *
 * Removes `status` and `priority` fields from all epic cards across all instances.
 * Epics should NOT have these fields — they are containers, not work items.
 *
 * Usage:
 *   node scripts/cleanup-epic-fields.js [--dry-run]
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

async function cleanupInstance(instanceConfig) {
  const keyFullPath = resolve(projectRoot, instanceConfig.keyPath);
  if (!existsSync(keyFullPath)) {
    console.log(`  SKIP: ${instanceConfig.name} (no serviceAccountKey.json)`);
    return { name: instanceConfig.name, skipped: true, cleaned: 0 };
  }

  const serviceAccount = JSON.parse(readFileSync(keyFullPath, 'utf8'));
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: instanceConfig.databaseURL
  }, instanceConfig.name);

  const db = app.database();

  try {
    const cardsSnap = await db.ref('/cards').once('value');
    const allCards = cardsSnap.val() || {};

    const updates = {};
    let cleaned = 0;

    for (const [projectId, sections] of Object.entries(allCards)) {
      if (!sections || typeof sections !== 'object') continue;

      for (const [sectionKey, cards] of Object.entries(sections)) {
        if (!sectionKey.startsWith('EPICS_')) continue;
        if (!cards || typeof cards !== 'object') continue;

        for (const [cardKey, card] of Object.entries(cards)) {
          if (!card || typeof card !== 'object') continue;

          const fieldsToRemove = [];
          if ('status' in card) fieldsToRemove.push('status');
          if ('priority' in card) fieldsToRemove.push('priority');

          if (fieldsToRemove.length > 0) {
            for (const field of fieldsToRemove) {
              updates[`/cards/${projectId}/${sectionKey}/${cardKey}/${field}`] = null;
            }
            cleaned++;
            console.log(`    ${card.cardId || cardKey}: removing ${fieldsToRemove.join(', ')}`);
          }
        }
      }
    }

    if (cleaned === 0) {
      console.log('    All epics clean.');
    } else if (!dryRun) {
      // Batch updates to avoid TOO_MANY_TRIGGERS error
      const BATCH_SIZE = 20;
      const keys = Object.keys(updates);
      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        const batch = {};
        keys.slice(i, i + BATCH_SIZE).forEach(k => { batch[k] = updates[k]; });
        await db.ref().update(batch);
        console.log(`    Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Object.keys(batch).length} deletions written.`);
      }
      console.log(`    Total: ${keys.length} deletions across ${Math.ceil(keys.length / BATCH_SIZE)} batches.`);
    }

    return { name: instanceConfig.name, skipped: false, cleaned };
  } finally {
    await app.delete();
  }
}

async function main() {
  console.log(`\n========================================`);
  console.log(`  Cleanup Epic Fields (status, priority)`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`========================================\n`);

  const results = [];

  for (const instance of INSTANCES) {
    console.log(`[${instance.name}]`);
    try {
      const result = await cleanupInstance(instance);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ name: instance.name, skipped: false, cleaned: 0, error: err.message });
    }
    console.log('');
  }

  console.log(`========================================`);
  console.log(`  Summary`);
  console.log(`========================================`);
  for (const r of results) {
    const status = r.skipped ? 'SKIP' : r.error ? 'ERROR' : 'OK';
    console.log(`  ${status}  ${r.name}: ${r.cleaned} epics cleaned`);
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

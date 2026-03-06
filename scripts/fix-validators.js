import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
  },
});

const DRY_RUN = args['dry-run'] || false;

const sa = JSON.parse(readFileSync('./planning-game-instances/manufosela/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: 'https://planning-game-xp-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

const OLD_VALIDATOR = 'stk_018';
const NEW_VALIDATOR = 'stk_001';
const PROJECTS = ['Manuelearning', 'Lean Construction'];

for (const project of PROJECTS) {
  console.log(`\n📂 Fixing validators in "${project}"...`);
  const path = `/cards/${project}/TASKS_${project}`;
  const snap = await db.ref(path).once('value');
  const data = snap.val();
  if (!data) { console.log('   No data.'); continue; }

  let fixed = 0;
  for (const [fbId, card] of Object.entries(data)) {
    if (card.validator === OLD_VALIDATOR) {
      if (DRY_RUN) {
        console.log(`   [DRY RUN] ${card.cardId}: ${OLD_VALIDATOR} → ${NEW_VALIDATOR}`);
      } else {
        await db.ref(`${path}/${fbId}/validator`).set(NEW_VALIDATOR);
      }
      fixed++;
    }
  }
  console.log(`   ${DRY_RUN ? '[DRY RUN] Would fix' : 'Fixed'}: ${fixed} tasks`);
}

console.log('\nDone.');
process.exit(0);

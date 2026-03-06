import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./planning-game-instances/manufosela/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: 'https://planning-game-xp-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

const stk = await db.ref('/data/stakeholders').once('value');
console.log('=== STAKEHOLDERS ===');
const stkData = stk.val();
for (const [id, s] of Object.entries(stkData || {})) {
  console.log(id, '-', s.name || s.displayName, '-', s.email);
}

for (const project of ['Manuelearning', 'Lean Construction']) {
  console.log(`\n=== VALIDATORS EN ${project} TASKS ===`);
  const snap = await db.ref(`/cards/${project}/TASKS_${project}`).once('value');
  const data = snap.val();
  const validators = {};
  for (const [fbId, card] of Object.entries(data || {})) {
    const v = card.validator || '(none)';
    if (!validators[v]) validators[v] = [];
    validators[v].push(card.cardId);
  }
  for (const [v, cards] of Object.entries(validators)) {
    console.log(v, ':', cards.length, 'tasks', '-', cards.slice(0, 3).join(', '), cards.length > 3 ? '...' : '');
  }
}

process.exit(0);

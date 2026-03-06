import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./planning-game-instances/manufosela/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: 'https://planning-game-xp-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

const PROJECT = 'Manuelearning';
const RENAMES = {
  'Sprint 7': 'Sprint 3',
  'Sprint 8': 'Sprint 4',
  'Sprint 9': 'Sprint 5',
  'Sprint 10': 'Sprint 6',
};

const path = `/cards/${PROJECT}/SPRINTS_${PROJECT}`;
const snap = await db.ref(path).once('value');
const data = snap.val();

let fixed = 0;
for (const [fbId, sprint] of Object.entries(data || {})) {
  for (const [oldNum, newNum] of Object.entries(RENAMES)) {
    if (sprint.title && sprint.title.startsWith(oldNum)) {
      const newTitle = sprint.title.replace(oldNum, newNum);
      console.log(`${sprint.cardId}: "${sprint.title}" → "${newTitle}"`);
      await db.ref(`${path}/${fbId}/title`).set(newTitle);
      fixed++;
    }
  }
}

console.log(`\nFixed: ${fixed} sprints`);
process.exit(0);

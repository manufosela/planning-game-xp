import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    abbr: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'fix-card': { type: 'string' },
    'fix-card-new-id': { type: 'string' },
  },
});

const PROJECT = args.project;
const ABBR = args.abbr;
const DRY_RUN = args['dry-run'] || false;
const FIX_CARD_FIREBASE_ID = args['fix-card'];
const FIX_CARD_NEW_ID = args['fix-card-new-id'];

if (!PROJECT || !ABBR) {
  console.error('Usage: node scripts/fix-counters.js --project "Name" --abbr "ABC" [--fix-card firebaseId --fix-card-new-id "ABC-TSK-0046"] [--dry-run]');
  process.exit(1);
}

const sa = JSON.parse(readFileSync('./planning-game-instances/manufosela/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: `https://${sa.project_id}-default-rtdb.europe-west1.firebasedatabase.app`
});

const db = admin.database();
const firestore = admin.firestore();

const SECTIONS = {
  TASKS: { prefix: 'TSK', counterSuffix: '_TSK' },
  BUGS: { prefix: 'BUG', counterSuffix: '_BUG' },
  EPICS: { prefix: 'PCS', counterSuffix: '_PCS' },
  SPRINTS: { prefix: 'SPR', counterSuffix: '_SPR' },
  PROPOSALS: { prefix: 'PRP', counterSuffix: '_PRP' },
  QA: { prefix: '_QA', counterSuffix: '__QA' },
};

console.log(`\nChecking counters for "${PROJECT}" (${ABBR})...\n`);

for (const [section, { prefix, counterSuffix }] of Object.entries(SECTIONS)) {
  const rtdbPath = `/cards/${PROJECT}/${section}_${PROJECT}`;
  const snap = await db.ref(rtdbPath).once('value');
  const data = snap.val();

  // Find max card number in RTDB
  let maxNum = 0;
  let count = 0;
  if (data) {
    for (const [fbId, card] of Object.entries(data)) {
      count++;
      if (card.cardId) {
        const match = card.cardId.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  }

  // Check Firestore counter
  const counterKey = `${ABBR}-${counterSuffix}`;
  const counterDoc = await firestore.collection('projectCounters').doc(counterKey).get();
  const currentCounter = counterDoc.exists ? counterDoc.data().lastId : 0;

  const needsFix = currentCounter !== maxNum;
  const status = needsFix ? '⚠️  MISMATCH' : '✅ OK';

  console.log(`${status} ${section} (${counterKey}): RTDB max=${maxNum} (${count} cards), Firestore lastId=${currentCounter}`);

  if (needsFix && !DRY_RUN) {
    await firestore.collection('projectCounters').doc(counterKey).set({ lastId: maxNum }, { merge: true });
    console.log(`   → Fixed: lastId set to ${maxNum}`);
  } else if (needsFix && DRY_RUN) {
    console.log(`   → [DRY RUN] Would set lastId to ${maxNum}`);
  }
}

// Fix specific card ID if requested
if (FIX_CARD_FIREBASE_ID && FIX_CARD_NEW_ID) {
  console.log(`\n🔧 Fixing card ${FIX_CARD_FIREBASE_ID} → ${FIX_CARD_NEW_ID}...`);

  // Determine section from the new card ID
  let section = null;
  if (FIX_CARD_NEW_ID.includes('-TSK-')) section = 'TASKS';
  else if (FIX_CARD_NEW_ID.includes('-BUG-')) section = 'BUGS';
  else if (FIX_CARD_NEW_ID.includes('-PCS-')) section = 'EPICS';
  else if (FIX_CARD_NEW_ID.includes('-SPR-')) section = 'SPRINTS';

  if (section) {
    const cardPath = `/cards/${PROJECT}/${section}_${PROJECT}/${FIX_CARD_FIREBASE_ID}`;
    const cardSnap = await db.ref(cardPath).once('value');
    const card = cardSnap.val();

    if (card) {
      console.log(`   Current cardId: ${card.cardId}`);
      if (!DRY_RUN) {
        await db.ref(`${cardPath}/cardId`).set(FIX_CARD_NEW_ID);
        console.log(`   ✅ Updated to: ${FIX_CARD_NEW_ID}`);
      } else {
        console.log(`   [DRY RUN] Would update to: ${FIX_CARD_NEW_ID}`);
      }
    } else {
      console.log(`   ❌ Card not found at ${cardPath}`);
    }
  }
}

console.log('\nDone.');
process.exit(0);

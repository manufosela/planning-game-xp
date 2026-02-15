#!/usr/bin/env node
/**
 * Script to fix cards that have cardId as their Firebase key instead of a proper Firebase push ID.
 *
 * Problem: Some cards were saved with their cardId (e.g., "NTR-TSK-0147") as the Firebase key
 * instead of a proper Firebase push ID (e.g., "-OjURK1Vdf_X0bC8B85v").
 *
 * Solution: This script identifies those entries and generates proper Firebase push IDs for them.
 *
 * Usage:
 *   node scripts/fix-cardid-as-firebase-key.js data/cards.json
 *   node scripts/fix-cardid-as-firebase-key.js data/cards.json data/cards_fixed.json
 *
 * The script will:
 * 1. Read the exported cards JSON
 * 2. Identify keys that are NOT valid Firebase push IDs (they start with '-' and are ~20 chars)
 * 3. Generate new Firebase push IDs for those entries
 * 4. Update the internal 'id' and 'firebaseId' fields
 * 5. Output the fixed JSON
 */

import fs from 'fs';
import path from 'path';

// Firebase push ID generation (simplified version)
// Based on Firebase's push ID algorithm
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPushTime = 0;
let lastRandChars = [];

function generateFirebasePushId() {
  let now = Date.now();
  const duplicateTime = (now === lastPushTime);
  lastPushTime = now;

  const timeStampChars = new Array(8);
  for (let i = 7; i >= 0; i--) {
    timeStampChars[i] = PUSH_CHARS.charAt(now % 64);
    now = Math.floor(now / 64);
  }

  let id = timeStampChars.join('');

  if (!duplicateTime) {
    lastRandChars = [];
    for (let i = 0; i < 12; i++) {
      lastRandChars[i] = Math.floor(Math.random() * 64);
    }
  } else {
    // If same millisecond, increment the last random chars
    let i = 11;
    while (i >= 0 && lastRandChars[i] === 63) {
      lastRandChars[i] = 0;
      i--;
    }
    if (i >= 0) {
      lastRandChars[i]++;
    }
  }

  for (let i = 0; i < 12; i++) {
    id += PUSH_CHARS.charAt(lastRandChars[i]);
  }

  return id;
}

function isValidFirebasePushId(key) {
  // Firebase push IDs:
  // - Start with '-'
  // - Are exactly 20 characters long
  // - Contain only characters from PUSH_CHARS
  if (!key || typeof key !== 'string') return false;
  if (!key.startsWith('-')) return false;
  if (key.length !== 20) return false;

  for (const char of key) {
    if (!PUSH_CHARS.includes(char)) return false;
  }

  return true;
}

function isCardIdFormat(key) {
  // Card IDs have format like: NTR-TSK-0147, C4D-BUG-0001, EX2-PCS-0005
  // Pattern: 2-4 uppercase letters, dash, 2-4 uppercase letters, dash, 4 digits
  return /^[A-Z]{2,4}-[A-Z]{2,4}-\d{4}$/.test(key);
}

function processCards(inputFile, outputFile) {
  console.log(`\n📂 Reading: ${inputFile}\n`);

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  let totalCards = 0;
  let invalidKeys = 0;
  let fixedCards = 0;
  const issues = [];
  const keyMapping = {}; // Old key -> New key mapping for reference

  // Process each project
  for (const [projectName, sections] of Object.entries(data)) {
    if (!sections || typeof sections !== 'object') continue;

    // Process each section (TASKS_ProjectName, BUGS_ProjectName, etc.)
    for (const [sectionKey, cards] of Object.entries(sections)) {
      if (!cards || typeof cards !== 'object') continue;

      const keysToFix = [];

      // First pass: identify invalid keys
      for (const [cardKey, cardData] of Object.entries(cards)) {
        totalCards++;

        if (!isValidFirebasePushId(cardKey)) {
          invalidKeys++;
          keysToFix.push(cardKey);

          const issue = {
            project: projectName,
            section: sectionKey,
            oldKey: cardKey,
            cardId: cardData?.cardId || 'N/A',
            internalId: cardData?.id || 'N/A',
            firebaseId: cardData?.firebaseId || 'N/A',
            isCardIdFormat: isCardIdFormat(cardKey)
          };
          issues.push(issue);
        }
      }

      // Second pass: fix invalid keys
      for (const oldKey of keysToFix) {
        const cardData = cards[oldKey];
        const newKey = generateFirebasePushId();

        // Update internal fields
        cardData.id = newKey;
        cardData.firebaseId = newKey;

        // If the old key was a cardId format and cardId field is different or missing,
        // we might need to preserve the cardId
        if (isCardIdFormat(oldKey) && (!cardData.cardId || cardData.cardId !== oldKey)) {
          // The key was being used as cardId, but the actual cardId field has a different value
          // This is the bug case mentioned by the user
          console.log(`  ⚠️  Key mismatch: key=${oldKey}, cardId=${cardData.cardId || 'N/A'}`);
        }

        // Move the card to the new key
        cards[newKey] = cardData;
        delete cards[oldKey];

        keyMapping[`${projectName}/${sectionKey}/${oldKey}`] = newKey;
        fixedCards++;

        // Small delay to ensure unique push IDs
        // (In real Firebase, this is handled differently, but for our script this helps)
      }
    }
  }

  // Output summary
  console.log('📊 Summary:');
  console.log(`   Total cards scanned: ${totalCards}`);
  console.log(`   Invalid keys found: ${invalidKeys}`);
  console.log(`   Cards fixed: ${fixedCards}`);
  console.log('');

  if (issues.length > 0) {
    console.log('🔍 Issues found:');
    console.log('─'.repeat(100));
    console.log('Project'.padEnd(15) + 'Section'.padEnd(25) + 'Old Key'.padEnd(20) + 'CardId'.padEnd(18) + 'Internal ID'.padEnd(20));
    console.log('─'.repeat(100));

    for (const issue of issues) {
      console.log(
        issue.project.substring(0, 14).padEnd(15) +
        issue.section.substring(0, 24).padEnd(25) +
        issue.oldKey.substring(0, 19).padEnd(20) +
        (issue.cardId || '').substring(0, 17).padEnd(18) +
        (issue.internalId || '').substring(0, 19).padEnd(20)
      );
    }
    console.log('─'.repeat(100));
  }

  // Write fixed data
  const output = outputFile || inputFile.replace('.json', '_fixed.json');
  fs.writeFileSync(output, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n✅ Fixed data written to: ${output}`);

  // Write key mapping for reference
  if (Object.keys(keyMapping).length > 0) {
    const mappingFile = output.replace('.json', '_key_mapping.json');
    fs.writeFileSync(mappingFile, JSON.stringify(keyMapping, null, 2), 'utf8');
    console.log(`📋 Key mapping written to: ${mappingFile}`);
  }

  console.log('\n⚠️  IMPORTANT: Review the fixed file before importing to Firebase!');
  console.log('   Import command: firebase database:set /cards data/cards_fixed.json --project <your-project-id>\n');
}

// Main
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/fix-cardid-as-firebase-key.js <input.json> [output.json]');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/fix-cardid-as-firebase-key.js data/cards.json');
  console.log('  node scripts/fix-cardid-as-firebase-key.js data/cards.json data/cards_fixed.json');
  process.exit(1);
}

processCards(args[0], args[1]);

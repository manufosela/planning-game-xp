#!/usr/bin/env node
/**
 * Script to clean invalid fields from cards that should NOT be persisted to Firebase.
 *
 * These fields are Lit component state/props that got accidentally saved:
 * - expanded: Lit reactive property for UI state
 * - group: Runtime property assigned by renderers
 * - id: Internal Lit element ID (conflicts with firebaseId)
 *
 * Usage:
 *   node scripts/clean-invalid-card-fields.js data/cards.json
 *   node scripts/clean-invalid-card-fields.js data/cards.json data/cards_cleaned.json
 */

import fs from 'fs';

const FIELDS_TO_REMOVE = ['expanded', 'group', 'section', 'id'];

function cleanCards(inputFile, outputFile) {
  console.log(`\nReading: ${inputFile}\n`);

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  let totalCards = 0;
  let cleanedCards = 0;
  const cleanedDetails = [];

  // Process each project
  for (const [projectName, sections] of Object.entries(data)) {
    if (!sections || typeof sections !== 'object') continue;

    // Process each section
    for (const [sectionKey, cards] of Object.entries(sections)) {
      if (!cards || typeof cards !== 'object') continue;

      for (const [cardKey, cardData] of Object.entries(cards)) {
        totalCards++;

        const removedFields = [];
        for (const field of FIELDS_TO_REMOVE) {
          if (field in cardData) {
            removedFields.push(`${field}=${JSON.stringify(cardData[field])}`);
            delete cardData[field];
          }
        }

        if (removedFields.length > 0) {
          cleanedCards++;
          cleanedDetails.push({
            project: projectName,
            section: sectionKey,
            cardId: cardData.cardId || cardKey,
            removed: removedFields
          });
        }
      }
    }
  }

  // Output summary
  console.log('Summary:');
  console.log(`   Total cards scanned: ${totalCards}`);
  console.log(`   Cards cleaned: ${cleanedCards}`);
  console.log('');

  if (cleanedDetails.length > 0) {
    console.log('Cleaned cards:');
    console.log('-'.repeat(100));
    for (const detail of cleanedDetails) {
      console.log(`  ${detail.project}/${detail.cardId}: removed [${detail.removed.join(', ')}]`);
    }
    console.log('-'.repeat(100));
  }

  // Write cleaned data
  const output = outputFile || inputFile.replace('.json', '_cleaned.json');
  fs.writeFileSync(output, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nCleaned data written to: ${output}`);
  console.log('\nImport command:');
  console.log(`  firebase database:set /cards ${output} --project <your-project-id>\n`);
}

// Main
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/clean-invalid-card-fields.js <input.json> [output.json]');
  process.exit(1);
}

cleanCards(args[0], args[1]);

import fs from 'fs';
import path from 'path';

const inputPath = process.argv[2] || 'data/sample-default-rtdb-export.json';
const outputPath = process.argv[3] || 'data/sample-default-rtdb-export.cleaned.json';

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const data = loadJson(inputPath);

let removedDevelopers = 0;
let removedStakeholders = 0;
let filledDescriptions = 0;

const ensureStructuredDescription = (card) => {
  const hasStructured =
    Array.isArray(card.descriptionStructured) && card.descriptionStructured.length > 0 ||
    (card.descriptionStructured && typeof card.descriptionStructured === 'object' && Object.keys(card.descriptionStructured).length > 0);

  if (hasStructured) return;

  const legacy = typeof card.description === 'string' ? card.description.trim() : '';
  const entry = { role: '', goal: '', benefit: '', legacy };
  card.descriptionStructured = [entry];
  filledDescriptions += 1;
};

Object.entries(data.cards || {}).forEach(([projectId, projectCards]) => {
  Object.entries(projectCards || {}).forEach(([sectionKey, sectionCards]) => {
    Object.entries(sectionCards || {}).forEach(([cardId, card]) => {
      if (!card || typeof card !== 'object') return;

      if (card.developers && typeof card.developers === 'object') {
        delete card.developers;
        removedDevelopers += 1;
      }

      if (card.stakeholders && typeof card.stakeholders === 'object') {
        delete card.stakeholders;
        removedStakeholders += 1;
      }

      if ((card.cardType || '').toLowerCase() === 'task-card') {
        ensureStructuredDescription(card);
      }
    });
  });
});

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

console.log('✅ Export cleaned');
console.log(`Removed developers lists: ${removedDevelopers}`);
console.log(`Removed stakeholders lists: ${removedStakeholders}`);
console.log(`Filled descriptionStructured: ${filledDescriptions}`);
console.log(`Output: ${path.resolve(outputPath)}`);

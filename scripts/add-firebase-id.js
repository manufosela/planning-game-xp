import fs from 'fs';
import path from 'path';

const inputPath = process.argv[2] || 'data/sample-default-rtdb-export.json';
const outputPath = process.argv[3] || 'data/sample-default-rtdb-export.with-ids.json';

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const data = loadJson(inputPath);

let updated = 0;

Object.entries(data.cards || {}).forEach(([projectId, projectCards]) => {
  Object.entries(projectCards || {}).forEach(([sectionKey, sectionCards]) => {
    Object.entries(sectionCards || {}).forEach(([firebaseId, card]) => {
      if (!card || typeof card !== 'object') return;
      if (!card.id || card.id !== firebaseId) {
        card.id = firebaseId;
        updated += 1;
      }
    });
  });
});

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

console.log('✅ IDs asignados cuando faltaban.');
console.log(`Total cards actualizadas: ${updated}`);
console.log(`Salida: ${path.resolve(outputPath)}`);

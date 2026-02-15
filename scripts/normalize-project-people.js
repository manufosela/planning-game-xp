import fs from 'fs';
import path from 'path';

const defaultPaths = {
  projects: 'data/sample-default-rtdb-projects-export (4).json',
  developers: 'data/sample-default-rtdb-developers-export (2).json',
  stakeholders: 'data/sample-default-rtdb-stakeholders-export (2).json',
  cards: 'data/sample-default-rtdb-cards-export (5).json'
};

const inputPaths = {
  projects: process.argv[2] || defaultPaths.projects,
  developers: process.argv[3] || defaultPaths.developers,
  stakeholders: process.argv[4] || defaultPaths.stakeholders,
  cards: process.argv[5] || defaultPaths.cards
};

const buildOutputPath = (inputPath, suffix) => {
  const parsed = path.parse(inputPath);
  const name = `${parsed.name}.${suffix}`;
  return path.join(parsed.dir, `${name}${parsed.ext || '.json'}`);
};

const outputPaths = {
  projects: buildOutputPath(inputPaths.projects, 'normalized'),
  cards: buildOutputPath(inputPaths.cards, 'normalized'),
  report: buildOutputPath(inputPaths.projects, 'normalized-report')
};

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const normalizeEmail = (email) => (email || '').toString().trim().toLowerCase();

const normalizeKey = (value) => {
  if (value === undefined || value === null) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const buildDirectory = (entries = {}) => {
  const byId = new Map();
  const byEmail = new Map();
  const byName = new Map();

  Object.entries(entries).forEach(([id, data]) => {
    if (!id) return;
    byId.set(id, id);

    const email = normalizeEmail(data?.email);
    if (email) {
      byEmail.set(email, id);
    }

    const nameKey = normalizeKey(data?.name);
    if (nameKey) {
      byName.set(nameKey, id);
    }
  });

  return { byId, byEmail, byName };
};

const resolveId = (value, directory, prefix) => {
  if (!value) return null;
  const raw = value.toString().trim();
  const normalizedEmail = normalizeEmail(raw);
  const normalizedName = normalizeKey(raw);

  if (raw.startsWith(prefix)) {
    return directory.byId.get(raw) || null;
  }

  if (normalizedEmail && directory.byEmail.has(normalizedEmail)) {
    return directory.byEmail.get(normalizedEmail);
  }

  if (normalizedName && directory.byName.has(normalizedName)) {
    return directory.byName.get(normalizedName);
  }

  return null;
};

const normalizeProjectList = (entries, directory, prefix, report, projectId, field) => {
  const resolved = [];
  const seen = new Set();

  const pushResolved = (candidate, original) => {
    if (!candidate) {
      if (original) {
        report.projects.push({
          projectId,
          field,
          value: original
        });
      }
      return;
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      resolved.push(candidate);
    }
  };

  const addEntry = (entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      const resolvedId = resolveId(entry, directory, prefix);
      pushResolved(resolvedId, entry);
      return;
    }
    if (typeof entry === 'object') {
      const candidate = entry.id || entry.email || entry.name || entry.value || '';
      const resolvedId = resolveId(candidate, directory, prefix);
      pushResolved(resolvedId, candidate || JSON.stringify(entry));
    }
  };

  if (Array.isArray(entries)) {
    entries.forEach(addEntry);
  } else if (typeof entries === 'object' && entries !== null) {
    Object.values(entries).forEach(addEntry);
  } else if (typeof entries === 'string') {
    addEntry(entries);
  }

  return resolved;
};

const normalizeCards = (cardsData, directories, report) => {
  const updatedCards = JSON.parse(JSON.stringify(cardsData));
  const projects = Object.entries(updatedCards || {});

  projects.forEach(([projectId, projectCards]) => {
    Object.entries(projectCards || {}).forEach(([sectionKey, sectionCards]) => {
      Object.entries(sectionCards || {}).forEach(([firebaseId, card]) => {
        if (!card || typeof card !== 'object') return;

        const cardId = card.cardId || firebaseId;

        if (card.developer) {
          const resolved = resolveId(card.developer, directories.developers, 'dev_');
          if (resolved) {
            card.developer = resolved;
          } else {
            report.cards.push({
              projectId,
              cardId,
              firebaseId,
              field: 'developer',
              value: card.developer
            });
          }
        }

        if (card.validator) {
          const resolved = resolveId(card.validator, directories.stakeholders, 'stk_');
          if (resolved) {
            card.validator = resolved;
          } else {
            report.cards.push({
              projectId,
              cardId,
              firebaseId,
              field: 'validator',
              value: card.validator
            });
          }
        }
      });
    });
  });

  return updatedCards;
};

const developersData = loadJson(inputPaths.developers);
const stakeholdersData = loadJson(inputPaths.stakeholders);
const projectsData = loadJson(inputPaths.projects);
const cardsData = loadJson(inputPaths.cards);

const directories = {
  developers: buildDirectory(developersData),
  stakeholders: buildDirectory(stakeholdersData)
};

const report = {
  projects: [],
  cards: []
};

const normalizedProjects = JSON.parse(JSON.stringify(projectsData));
Object.entries(normalizedProjects).forEach(([projectId, projectData]) => {
  if (!projectData || typeof projectData !== 'object') return;
  if (projectData.developers) {
    projectData.developers = normalizeProjectList(
      projectData.developers,
      directories.developers,
      'dev_',
      report,
      projectId,
      'developers'
    );
  }
  if (projectData.stakeholders) {
    projectData.stakeholders = normalizeProjectList(
      projectData.stakeholders,
      directories.stakeholders,
      'stk_',
      report,
      projectId,
      'stakeholders'
    );
  }
});

const normalizedCards = normalizeCards(cardsData, directories, report);

fs.writeFileSync(outputPaths.projects, JSON.stringify(normalizedProjects, null, 2), 'utf8');
fs.writeFileSync(outputPaths.cards, JSON.stringify(normalizedCards, null, 2), 'utf8');
fs.writeFileSync(outputPaths.report, JSON.stringify(report, null, 2), 'utf8');

console.log('✅ Normalización completada.');
console.log(`Projects: ${path.resolve(outputPaths.projects)}`);
console.log(`Cards: ${path.resolve(outputPaths.cards)}`);
console.log(`Report: ${path.resolve(outputPaths.report)}`);

#!/usr/bin/env node
/**
 * Normaliza developers y stakeholders a email en un dump RTDB.
 * - Convierte nombres/alias a email usando usersDirectory y developerDirectory.
 * - Reescribe entradas WIP con la clave canónica (email codificado).
 *
 * Uso:
 *   node scripts/normalize-people.js input.json output.json [usersDirectory.json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { developerDirectory } from '../public/js/config/developer-directory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = process.argv[2] || 'sample-default-rtdb-2-cleaned.json';
const outputPath = process.argv[3] || inputPath.replace(/\.json$/, '-normalized.json');
const usersDirPath = process.argv[4] || path.join(__dirname, '..', 'data', 'users', 'usersDirectory.firebase.json');

const decodeEmailFromFirebase = (encoded) =>
  (encoded || '').replace(/\|/g, '@').replace(/!/g, '.').replace(/-/g, '#');
const encodeEmailForFirebase = (email) =>
  (email || '').replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
const sanitizeEmailForFirebase = (email) =>
  (email || '').replace(/[.#$/\[\]]/g, '_');

const stripAccents = (val) =>
  (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const canonical = (val) =>
  stripAccents((val || '').toLowerCase().trim())
    .replace(/[#\s]/g, '')
    .replace(/[^a-z0-9@_.-]/g, '');

function buildResolver() {
  const aliasToEmail = new Map();

  const register = (key, email) => {
    if (!key || !email) return;
    aliasToEmail.set(canonical(key), email.toLowerCase());
  };

  // developerDirectory
  developerDirectory.forEach((entry) => {
    const email = (entry.primaryEmail || entry.emails?.[0] || '').toLowerCase();
    if (!email) return;
    register(email, email);
    (entry.emails || []).forEach((e) => register(e, email));
    (entry.aliases || []).forEach((a) => register(a, email));
    register(entry.name, email);
  });

  // usersDirectory (dump)
  if (fs.existsSync(usersDirPath)) {
    const rawUsers = JSON.parse(fs.readFileSync(usersDirPath, 'utf8'));
    Object.entries(rawUsers).forEach(([key, value]) => {
      const decodedKey = decodeEmailFromFirebase(key);
      const email = (value?.email || decodedKey || '').toLowerCase();
      if (!email) return;
      register(email, email);
      register(decodedKey, email);
      (value.aliases || []).forEach((a) => register(a, email));
      register(value.name, email);
    });
  } else {
    console.warn(`⚠️ No se encontró usersDirectory en ${usersDirPath}, se usará solo developerDirectory`);
  }

  return (value) => {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (trimmed.includes('@')) return trimmed.toLowerCase();
    const key = canonical(trimmed);
    return aliasToEmail.get(key) || trimmed;
  };
}

const resolveEmail = buildResolver();
const summary = { developers: 0, stakeholders: 0, wip: 0, tasks: 0, rootGuessed: '' };

function normalizeCard(card) {
  if (card.developer) {
    const resolved = resolveEmail(card.developer);
    if (resolved) {
      card.developer = resolved;
      summary.developers++;
    }
  }
  if (Array.isArray(card.stakeholders)) {
    card.stakeholders = card.stakeholders
      .map(resolveEmail)
      .filter(Boolean);
    summary.stakeholders += card.stakeholders.length;
  }
}

function normalizeProjectTeams(projects) {
  Object.entries(projects || {}).forEach(([projectId, data]) => {
    if (!data) return;
    if (Array.isArray(data.developers)) {
      data.developers = data.developers.map(resolveEmail).filter(Boolean);
    }
    if (Array.isArray(data.stakeholders)) {
      data.stakeholders = data.stakeholders.map(resolveEmail).filter(Boolean);
    }
  });
}

function normalizeWip(wip) {
  const normalized = {};
  Object.entries(wip || {}).forEach(([projectId, byDev]) => {
    if (!byDev) return;
    normalized[projectId] = {};
    Object.entries(byDev).forEach(([devKey, entry]) => {
      if (!entry) return;
      const resolved = resolveEmail(entry.developer || devKey);
      const newKey = resolved ? encodeEmailForFirebase(resolved) : devKey;
      normalized[projectId][newKey] = {
        ...entry,
        developer: resolved || entry.developer
      };
      summary.wip++;
    });
  });
  return normalized;
}

function detectCardsRoot(data) {
  if (data.cards) {
    return { root: data.cards, guessed: 'data.cards' };
  }
  const keys = Object.keys(data || {});
  const looksLikeCards = keys.some((k) => {
    const v = data[k];
    return v && typeof v === 'object' && Object.keys(v).some((sk) => sk.startsWith('TASKS_'));
  });
  if (looksLikeCards) {
    return { root: data, guessed: 'top-level' };
  }
  return { root: null, guessed: 'not-detected' };
}

function detectWipRoot(data) {
  if (data.wip) {
    return { root: data.wip, guessed: 'data.wip' };
  }
  const keys = Object.keys(data || {});
  const looksLikeWip = keys.some((k) => {
    const v = data[k];
    if (!v || typeof v !== 'object') return false;
    return Object.values(v).some((byDev) =>
      byDev && typeof byDev === 'object' && Object.values(byDev).some((entry) => entry && entry.startedAt)
    );
  });
  if (looksLikeWip) {
    return { root: data, guessed: 'top-level' };
  }
  return { root: null, guessed: 'not-detected' };
}

function normalizeTasks(cardsRoot) {
  Object.entries(cardsRoot || {}).forEach(([projectId, sections]) => {
    Object.entries(sections || {}).forEach(([sectionKey, items]) => {
      if (!items || !sectionKey.startsWith('TASKS_')) return;
      Object.values(items).forEach((card) => {
        if (card) {
          normalizeCard(card);
          summary.tasks++;
        }
      });
    });
  });
}

function main() {
  console.log(`📥 Leyendo ${inputPath}`);
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  const { root: cardsRoot, guessed: cardsGuess } = detectCardsRoot(data);
  summary.rootGuessed = cardsGuess;
  if (cardsRoot) {
    normalizeTasks(cardsRoot);
  } else {
    console.warn('⚠️ No se detectó raíz de cards. Keys top-level:', Object.keys(data || {}).slice(0, 20));
  }

  if (data.projects) {
    normalizeProjectTeams(data.projects);
  }

  const { root: wipRoot } = detectWipRoot(data);
  if (wipRoot) {
    const normalizedWip = normalizeWip(wipRoot);
    if (data.wip) {
      data.wip = normalizedWip;
    } else {
      data.wip = normalizedWip;
    }
  }

  console.log(`💾 Escribiendo ${outputPath}`);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('✅ Normalización completa');
  console.table(summary);
}

main();

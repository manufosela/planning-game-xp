#!/usr/bin/env node

/**
 * Post-migration validation script.
 *
 * Compares V1 JSON export against V2 Firestore data to verify
 * zero data loss. Run after migrate-v1-to-v2.js.
 *
 * Usage:
 *   node scripts/validate-migration.js <v1-export.json>
 *
 * Requires Firebase Admin SDK initialized (serviceAccountKey.json).
 *
 * @module scripts/validate-migration
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Count cards in V1 export per project.
 * @param {Record<string, *>} v1Data
 * @returns {Record<string, Record<string, number>>}
 */
export function countV1Cards(v1Data) {
  const counts = {};
  const cards = v1Data.cards || {};

  for (const [projectId, sections] of Object.entries(cards)) {
    counts[projectId] = {};

    for (const [sectionKey, sectionCards] of Object.entries(sections)) {
      if (!sectionCards || typeof sectionCards !== 'object') continue;
      const type = sectionKey.split('_')[0].toLowerCase();
      counts[projectId][type] = Object.keys(sectionCards).length;
    }
  }

  return counts;
}

/**
 * Count cards in V2 Firestore per project.
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns {Promise<Record<string, Record<string, number>>>}
 */
export async function countV2Cards(firestore) {
  const counts = {};
  const projectsSnap = await firestore.collection('projects').get();

  for (const projectDoc of projectsSnap.docs) {
    const projectId = projectDoc.id;
    counts[projectId] = {};

    const cardsSnap = await firestore
      .collection('projects')
      .doc(projectId)
      .collection('cards')
      .get();

    for (const cardDoc of cardsSnap.docs) {
      const type = cardDoc.data().type;
      counts[projectId][type] = (counts[projectId][type] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Verify card IDs are unique within each project.
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns {Promise<Array<{ projectId: string; duplicates: string[] }>>}
 */
export async function checkDuplicateCardIds(firestore) {
  const issues = [];
  const projectsSnap = await firestore.collection('projects').get();

  for (const projectDoc of projectsSnap.docs) {
    const projectId = projectDoc.id;
    const cardsSnap = await firestore
      .collection('projects')
      .doc(projectId)
      .collection('cards')
      .get();

    const seen = new Set();
    const duplicates = [];

    for (const cardDoc of cardsSnap.docs) {
      const cardId = cardDoc.data().cardId;
      if (seen.has(cardId)) {
        duplicates.push(cardId);
      }
      seen.add(cardId);
    }

    if (duplicates.length > 0) {
      issues.push({ projectId, duplicates });
    }
  }

  return issues;
}

/**
 * Verify required fields are present on all cards.
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns {Promise<Array<{ projectId: string; cardId: string; missing: string[] }>>}
 */
export async function checkRequiredFields(firestore) {
  const requiredBase = ['cardId', 'type', 'title', 'status', 'year'];
  const issues = [];
  const projectsSnap = await firestore.collection('projects').get();

  for (const projectDoc of projectsSnap.docs) {
    const projectId = projectDoc.id;
    const cardsSnap = await firestore
      .collection('projects')
      .doc(projectId)
      .collection('cards')
      .get();

    for (const cardDoc of cardsSnap.docs) {
      const data = cardDoc.data();
      const missing = requiredBase.filter((field) => !data[field] && data[field] !== 0);

      if (missing.length > 0) {
        issues.push({ projectId, cardId: data.cardId || cardDoc.id, missing });
      }
    }
  }

  return issues;
}

/**
 * Verify counter consistency.
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns {Promise<Array<{ projectId: string; type: string; counter: number; maxCard: number }>>}
 */
export async function checkCounters(firestore) {
  const issues = [];
  const projectsSnap = await firestore.collection('projects').get();

  for (const projectDoc of projectsSnap.docs) {
    const projectId = projectDoc.id;
    const counterSnap = await firestore.collection('counters').doc(projectId).get();

    if (!counterSnap.exists) {
      issues.push({ projectId, type: 'all', counter: -1, maxCard: 0 });
      continue;
    }

    const counters = counterSnap.data();
    const cardsSnap = await firestore
      .collection('projects')
      .doc(projectId)
      .collection('cards')
      .get();

    // Find max card number per type
    const maxByType = {};
    for (const cardDoc of cardsSnap.docs) {
      const data = cardDoc.data();
      const match = data.cardId?.match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        const type = data.type;
        if (!maxByType[type] || num > maxByType[type]) {
          maxByType[type] = num;
        }
      }
    }

    // Compare counters with max card numbers
    for (const [type, counter] of Object.entries(counters)) {
      const maxCard = maxByType[type] || 0;
      if (counter < maxCard) {
        issues.push({ projectId, type, counter, maxCard });
      }
    }
  }

  return issues;
}

/**
 * Run full validation and produce a report.
 * @param {string} v1ExportPath
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns {Promise<Record<string, *>>}
 */
export async function validate(v1ExportPath, firestore) {
  const v1Data = JSON.parse(readFileSync(resolve(v1ExportPath), 'utf8'));

  const v1Counts = countV1Cards(v1Data);
  const v2Counts = await countV2Cards(firestore);
  const duplicates = await checkDuplicateCardIds(firestore);
  const missingFields = await checkRequiredFields(firestore);
  const counterIssues = await checkCounters(firestore);

  // Compare counts
  const countDiscrepancies = [];
  for (const [projectId, v1Types] of Object.entries(v1Counts)) {
    const v2Types = v2Counts[projectId] || {};
    for (const [type, v1Count] of Object.entries(v1Types)) {
      const v2Count = v2Types[type] || 0;
      if (v1Count !== v2Count) {
        countDiscrepancies.push({ projectId, type, v1: v1Count, v2: v2Count });
      }
    }
  }

  const allPassed = countDiscrepancies.length === 0 &&
    duplicates.length === 0 &&
    missingFields.length === 0 &&
    counterIssues.length === 0;

  return {
    status: allPassed ? 'PASSED' : 'FAILED',
    checks: {
      cardCounts: {
        status: countDiscrepancies.length === 0 ? 'pass' : 'fail',
        discrepancies: countDiscrepancies,
      },
      uniqueCardIds: {
        status: duplicates.length === 0 ? 'pass' : 'fail',
        issues: duplicates,
      },
      requiredFields: {
        status: missingFields.length === 0 ? 'pass' : 'fail',
        issues: missingFields.slice(0, 20), // Limit output
        total: missingFields.length,
      },
      counterConsistency: {
        status: counterIssues.length === 0 ? 'pass' : 'fail',
        issues: counterIssues,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('validate-migration.js')) {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('Usage: node scripts/validate-migration.js <v1-export.json>');
    process.exit(1);
  }

  console.error('Validation requires Firebase Admin SDK initialization.');
  console.error('Import this module and pass a Firestore instance to validate().');
  process.exit(1);
}

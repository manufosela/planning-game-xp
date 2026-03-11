#!/usr/bin/env node

/**
 * Migration script: V1 RTDB JSON export -> V2 Firestore.
 *
 * Transforms the V1 Realtime Database structure into V2 Firestore documents
 * and writes them via the Firebase Admin SDK.
 *
 * Usage:
 *   node scripts/migrate-v1-to-v2.js <v1-export.json> [--dry-run]
 *
 * Input: V1 RTDB JSON export file
 * Output: V2 Firestore batch writes (or dry-run report)
 *
 * @module scripts/migrate-v1-to-v2
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Type prefix mapping (V1 -> V2)
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
const V1_SECTION_TO_TYPE = {
  TASKS: 'task',
  BUGS: 'bug',
  EPICS: 'epic',
  SPRINTS: 'sprint',
  PROPOSALS: 'proposal',
  QA: 'qa',
};

/** @type {Record<string, string>} */
const V1_CARD_TYPE_TO_V2 = {
  'task-card': 'task',
  'bug-card': 'bug',
  'epic-card': 'epic',
  'sprint-card': 'sprint',
  'proposal-card': 'proposal',
  'qa-card': 'qa',
};

/** @type {Record<string, string>} */
const V2_TYPE_PREFIX = {
  task: 'TSK',
  bug: 'BUG',
  epic: 'EPC',
  sprint: 'SPR',
  proposal: 'PRP',
  qa: 'QAI',
};

// ---------------------------------------------------------------------------
// Pure transformation functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Load and parse V1 JSON export.
 * @param {string} filePath
 * @returns {Record<string, *>}
 */
export function loadV1Export(filePath) {
  const raw = readFileSync(resolve(filePath), 'utf8');
  return JSON.parse(raw);
}

/**
 * Extract project data from V1 export.
 * @param {Record<string, *>} v1Data
 * @returns {Array<{ id: string; data: Record<string, *> }>}
 */
export function transformProjects(v1Data) {
  const projects = v1Data.projects || {};
  const result = [];

  for (const [projectId, project] of Object.entries(projects)) {
    if (!project || typeof project !== 'object') continue;

    result.push({
      id: projectId,
      data: {
        name: project.name || projectId,
        abbreviation: project.abbreviation || projectId.slice(0, 3).toUpperCase(),
        description: project.description || '',
        repoUrl: project.repoUrl || '',
        scoringSystem: project.scoringSystem || '1-5',
        archived: project.archived || false,
        sortOrder: project.order || 0,
        createdAt: project.createdAt || new Date().toISOString(),
        createdBy: project.createdBy || 'migration',
        updatedAt: project.updatedAt || new Date().toISOString(),
        developerCount: 0,
        stakeholderCount: 0,
      },
    });
  }

  return result;
}

/**
 * Transform V1 cards for a project into V2 format.
 * @param {Record<string, *>} v1Data
 * @param {string} projectId
 * @returns {Array<{ cardId: string; data: Record<string, *> }>}
 */
export function transformCards(v1Data, projectId) {
  const cards = v1Data.cards?.[projectId] || {};
  const result = [];

  for (const [sectionKey, sectionCards] of Object.entries(cards)) {
    // sectionKey is like "TASKS_ProjectName", "BUGS_ProjectName"
    const sectionType = sectionKey.split('_')[0];
    const v2Type = V1_SECTION_TO_TYPE[sectionType];
    if (!v2Type) continue;

    if (!sectionCards || typeof sectionCards !== 'object') continue;

    for (const [firebaseId, card] of Object.entries(sectionCards)) {
      if (!card || typeof card !== 'object') continue;

      const cardId = card.cardId || `${projectId}-${V2_TYPE_PREFIX[v2Type]}-0000`;

      const v2Card = {
        cardId,
        type: v2Type,
        title: card.title || 'Untitled',
        description: card.description || '',
        status: card.status || getDefaultStatus(v2Type),
        year: card.year || new Date().getFullYear(),
        createdAt: card.createdAt || new Date().toISOString(),
        createdBy: card.createdBy || 'migration',
        updatedAt: card.updatedAt || card.createdAt || new Date().toISOString(),
        updatedBy: card.updatedBy || 'migration',
      };

      // Optional fields
      if (card.epic) v2Card.epic = card.epic;
      if (card.sprint) v2Card.sprint = card.sprint;
      if (card.notes) v2Card.notes = card.notes;
      if (card.tags) v2Card.tags = Array.isArray(card.tags) ? card.tags : [];

      // Task-specific
      if (v2Type === 'task') {
        // Transform userStory from descriptionStructured
        if (card.descriptionStructured && Array.isArray(card.descriptionStructured) && card.descriptionStructured.length > 0) {
          const ds = card.descriptionStructured[0];
          v2Card.userStory = {
            role: ds.role || ds.como || '',
            goal: ds.goal || ds.quiero || '',
            benefit: ds.benefit || ds.para || '',
          };
        }

        // Transform acceptance criteria
        if (card.acceptanceCriteriaStructured && Array.isArray(card.acceptanceCriteriaStructured)) {
          v2Card.acceptanceCriteria = card.acceptanceCriteriaStructured.map((ac) => ({
            given: ac.given || '',
            when: ac.when || '',
            then: ac.then || '',
          }));
        } else if (card.acceptanceCriteria) {
          v2Card.acceptanceCriteria = [{ given: '', when: '', then: String(card.acceptanceCriteria) }];
        }

        v2Card.devPoints = card.devPoints || 0;
        v2Card.businessPoints = card.businessPoints || 0;

        // Recalculate priority
        if (v2Card.devPoints > 0 && v2Card.businessPoints > 0) {
          v2Card.priority = Math.round((v2Card.businessPoints / v2Card.devPoints) * 100);
        } else {
          v2Card.priority = 0;
        }

        // Developer/validator as TeamMemberRef
        if (card.developer && typeof card.developer === 'string') {
          v2Card.developer = { id: card.developer, name: '', email: '' };
        }
        if (card.validator && typeof card.validator === 'string') {
          v2Card.validator = { id: card.validator, name: '', email: '' };
        }
        if (card.codeveloper) {
          v2Card.codeveloper = typeof card.codeveloper === 'string'
            ? { id: card.codeveloper, name: '', email: '' }
            : card.codeveloper;
        }

        if (card.startDate) v2Card.startDate = card.startDate;
        if (card.endDate) v2Card.endDate = card.endDate;
        if (card.commits) v2Card.commits = card.commits;
        if (card.implementationPlan) v2Card.implementationPlan = card.implementationPlan;
        if (card.aiUsage) v2Card.aiUsage = card.aiUsage;

        // Pipeline from pipelineStatus
        if (card.pipelineStatus) {
          v2Card.pipeline = {};
          if (card.pipelineStatus.committed?.branch) v2Card.pipeline.branch = card.pipelineStatus.committed.branch;
          if (card.pipelineStatus.prCreated?.prUrl) v2Card.pipeline.prUrl = card.pipelineStatus.prCreated.prUrl;
          if (card.pipelineStatus.prCreated?.prNumber) v2Card.pipeline.prNumber = card.pipelineStatus.prCreated.prNumber;
        }
      }

      // Bug-specific
      if (v2Type === 'bug') {
        v2Card.bugPriority = card.priority || 'USER EXPERIENCE ISSUE';
        v2Card.registeredAt = card.registerDate || card.createdAt || new Date().toISOString();
        if (card.developer) {
          v2Card.developer = typeof card.developer === 'string'
            ? { id: card.developer, name: '', email: '' }
            : card.developer;
        }
        if (card.rootCause) v2Card.rootCause = card.rootCause;
        if (card.resolution) v2Card.resolution = card.resolution;
        if (card.commits) v2Card.commits = card.commits;
      }

      // Sprint-specific
      if (v2Type === 'sprint') {
        if (card.startDate) v2Card.startDate = card.startDate;
        if (card.endDate) v2Card.endDate = card.endDate;
        v2Card.locked = card.locked || false;
        if (card.goals) v2Card.goals = Array.isArray(card.goals) ? card.goals : [];
      }

      // Epic-specific
      if (v2Type === 'epic') {
        if (card.color) v2Card.color = card.color;
      }

      // Proposal-specific
      if (v2Type === 'proposal') {
        if (card.descriptionStructured && Array.isArray(card.descriptionStructured) && card.descriptionStructured.length > 0) {
          const ds = card.descriptionStructured[0];
          v2Card.userStory = {
            role: ds.role || ds.como || '',
            goal: ds.goal || ds.quiero || '',
            benefit: ds.benefit || ds.para || '',
          };
        }
      }

      // QA-specific
      if (v2Type === 'qa') {
        v2Card.suite = card.suite || '';
        v2Card.steps = card.steps || [];
        v2Card.expectedResult = card.expectedResult || '';
        if (card.actualResult) v2Card.actualResult = card.actualResult;
      }

      result.push({ cardId, data: v2Card });
    }
  }

  return result;
}

/**
 * Transform V1 developers/stakeholders into V2 team members per project.
 * @param {Record<string, *>} v1Data
 * @param {string} projectId
 * @returns {Array<{ memberId: string; data: Record<string, *> }>}
 */
export function transformTeam(v1Data, projectId) {
  const project = v1Data.projects?.[projectId];
  if (!project) return [];

  const team = [];

  // Developers
  const devs = project.developers;
  if (devs && Array.isArray(devs)) {
    for (const dev of devs) {
      if (!dev || typeof dev !== 'object') continue;
      team.push({
        memberId: dev.id || `dev_${team.length + 1}`,
        data: {
          name: dev.name || '',
          email: dev.email || '',
          role: 'developer',
          active: true,
          joinedAt: new Date().toISOString(),
        },
      });
    }
  } else if (devs && typeof devs === 'object') {
    for (const [key, val] of Object.entries(devs)) {
      const name = typeof val === 'object' ? val.name || key : key;
      const email = typeof val === 'object' ? val.email || '' : typeof val === 'string' ? val : '';
      const id = typeof val === 'object' ? val.id || key : key;
      team.push({
        memberId: id,
        data: { name, email, role: 'developer', active: true, joinedAt: new Date().toISOString() },
      });
    }
  }

  // Stakeholders
  const stks = project.stakeholders;
  if (stks && Array.isArray(stks)) {
    for (const stk of stks) {
      if (!stk || typeof stk !== 'object') continue;
      const existingDev = team.find((t) => t.data.email === stk.email);
      if (existingDev) {
        existingDev.data.role = 'both';
      } else {
        team.push({
          memberId: stk.id || `stk_${team.length + 1}`,
          data: {
            name: stk.name || '',
            email: stk.email || '',
            role: 'stakeholder',
            active: true,
            joinedAt: new Date().toISOString(),
          },
        });
      }
    }
  }

  return team;
}

/**
 * Build counters from transformed cards.
 * @param {Array<{ cardId: string; data: Record<string, *> }>} cards
 * @returns {Record<string, number>}
 */
export function buildCounters(cards) {
  const counters = { task: 0, bug: 0, epic: 0, sprint: 0, proposal: 0, qa: 0 };

  for (const { data } of cards) {
    const type = data.type;
    if (!counters.hasOwnProperty(type)) continue;

    // Extract number from cardId (e.g., "PLN-TSK-0042" -> 42)
    const match = data.cardId.match(/-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > counters[type]) {
        counters[type] = num;
      }
    }
  }

  return counters;
}

/**
 * Get default status for a card type.
 * @param {string} type
 * @returns {string}
 */
function getDefaultStatus(type) {
  switch (type) {
    case 'task': return 'To Do';
    case 'bug': return 'Created';
    case 'epic': return 'Active';
    case 'sprint': return 'Planned';
    case 'proposal': return 'Pending';
    case 'qa': return 'Pending';
    default: return 'To Do';
  }
}

/**
 * Write transformed data to Firestore.
 * @param {Record<string, *>} transformedData
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns {Promise<{ projects: number; cards: number; team: number }>}
 */
export async function writeToFirestore(transformedData, firestore) {
  const stats = { projects: 0, cards: 0, team: 0 };

  for (const project of transformedData.projects) {
    // Write project
    await firestore.collection('projects').doc(project.id).set(project.data);
    stats.projects++;

    // Write cards
    const projectCards = transformedData.cards[project.id] || [];
    const cardBatch = firestore.batch();
    let batchCount = 0;

    for (const card of projectCards) {
      const ref = firestore.collection('projects').doc(project.id).collection('cards').doc(card.cardId);
      cardBatch.set(ref, card.data);
      batchCount++;
      stats.cards++;

      // Firestore batch limit is 500
      if (batchCount >= 450) {
        await cardBatch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await cardBatch.commit();
    }

    // Write team members
    const projectTeam = transformedData.team[project.id] || [];
    for (const member of projectTeam) {
      await firestore.collection('projects').doc(project.id)
        .collection('team').doc(member.memberId).set(member.data);
      stats.team++;
    }

    // Write counters
    const counters = buildCounters(projectCards);
    await firestore.collection('counters').doc(project.id).set(counters);

    // Update developer/stakeholder counts
    const devCount = projectTeam.filter((m) => m.data.role === 'developer' || m.data.role === 'both').length;
    const stkCount = projectTeam.filter((m) => m.data.role === 'stakeholder' || m.data.role === 'both').length;
    await firestore.collection('projects').doc(project.id).update({
      developerCount: devCount,
      stakeholderCount: stkCount,
    });
  }

  return stats;
}

/**
 * Run the full migration.
 * @param {string} inputPath
 * @param {{ dryRun?: boolean; firestore?: * }} [options]
 * @returns {Promise<Record<string, *>>}
 */
export async function runMigration(inputPath, options = {}) {
  const v1Data = loadV1Export(inputPath);

  // Transform all data
  const projects = transformProjects(v1Data);
  const cards = {};
  const team = {};

  for (const project of projects) {
    cards[project.id] = transformCards(v1Data, project.id);
    team[project.id] = transformTeam(v1Data, project.id);
  }

  const transformedData = { projects, cards, team };

  // Summary
  const summary = {
    projects: projects.length,
    cards: Object.values(cards).reduce((sum, c) => sum + c.length, 0),
    team: Object.values(team).reduce((sum, t) => sum + t.length, 0),
    perProject: projects.map((p) => ({
      id: p.id,
      cards: cards[p.id].length,
      team: team[p.id].length,
      cardsByType: cards[p.id].reduce((acc, c) => {
        acc[c.data.type] = (acc[c.data.type] || 0) + 1;
        return acc;
      }, {}),
    })),
  };

  if (options.dryRun) {
    console.log('\n=== DRY RUN — Migration Summary ===\n');
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  if (!options.firestore) {
    throw new Error('Firestore instance required for non-dry-run migration.');
  }

  const stats = await writeToFirestore(transformedData, options.firestore);
  console.log('\n=== Migration Complete ===\n');
  console.log(`Projects: ${stats.projects}`);
  console.log(`Cards: ${stats.cards}`);
  console.log(`Team members: ${stats.team}`);

  return { ...summary, written: stats };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('migrate-v1-to-v2.js')) {
  const inputPath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!inputPath) {
    console.error('Usage: node scripts/migrate-v1-to-v2.js <v1-export.json> [--dry-run]');
    process.exit(1);
  }

  if (dryRun) {
    runMigration(inputPath, { dryRun: true }).catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
  } else {
    // For actual migration, need to initialize Firebase
    console.error('Non-dry-run migration requires Firebase initialization.');
    console.error('Use --dry-run to preview, or import this module and pass a Firestore instance.');
    process.exit(1);
  }
}

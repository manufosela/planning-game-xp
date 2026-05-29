/**
 * Shared utility functions for Firebase path building and card ID generation.
 * Used by: MCP server, Cloud Functions, migration scripts.
 */

export const SECTION_MAP = {
  task: 'TASKS',
  bug: 'BUGS',
  epic: 'EPICS',
  sprint: 'SPRINTS',
  proposal: 'PROPOSALS',
  qa: 'QA'
};

export const CARD_TYPE_MAP = {
  task: 'task-card',
  bug: 'bug-card',
  epic: 'epic-card',
  proposal: 'proposal-card',
  sprint: 'sprint-card',
  qa: 'qa-card'
};

export const GROUP_MAP = {
  task: 'tasks',
  bug: 'bugs',
  epic: 'epics',
  proposal: 'proposals',
  sprint: 'sprints',
  qa: 'qa'
};

export function getAbbrId(wordToAbbr) {
  const upperWord = wordToAbbr.toUpperCase().trim();

  if (upperWord === 'BUGS') return 'BUG';
  if (upperWord === 'CINEMA4D') return 'C4D';
  if (upperWord === 'EXTRANET V1') return 'EX1';
  if (upperWord === 'EXTRANET V2') return 'EX2';
  // 'PLANS' → 'PLA' (development plans). Default heuristic would give 'PLN',
  // which clashes visually with the PlanningGame project abbreviation.
  if (upperWord === 'PLANS') return 'PLA';

  if (upperWord.length <= 3) return upperWord.padStart(3, '_');

  const consonants = upperWord.replace(/[AEIOUÁÉÍÓÚÜ\s\d]/gi, '').split('');
  const vowels = upperWord.replace(/[^AEIOUÁÉÍÓÚÜ]/gi, '').split('');

  const matchNumber = upperWord.match(/\d+$/);
  const lastNumber = matchNumber ? matchNumber[0] : null;

  if (lastNumber && consonants.length >= 3) {
    return consonants.slice(0, 2).join('') + lastNumber;
  }
  if (consonants.length >= 3) return consonants.slice(0, 3).join('');
  if (consonants.length === 2) return consonants.join('') + (vowels[0] || '_');
  if (consonants.length === 1) return consonants[0] + (vowels[0] || '_') + (vowels[vowels.length - 1] || '_');

  return upperWord.slice(0, 3);
}

export function buildSectionPath(projectId, section) {
  const sectionKey = SECTION_MAP[section];
  if (!sectionKey) {
    throw new Error(`Invalid section: "${section}". Valid: ${Object.keys(SECTION_MAP).join(', ')}`);
  }
  return `/cards/${projectId}/${sectionKey}_${projectId}`;
}

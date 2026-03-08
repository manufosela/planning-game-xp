/**
 * Epic inference helpers for createTasksFromPlan.
 * Pure functions extracted for testability.
 */

/**
 * Extract meaningful keywords from a text for matching.
 * Filters stop words in Spanish and English, and short words.
 * @param {string} text - Input text
 * @returns {string[]} Array of lowercase keywords
 */
function extractKeywords(text) {
  if (!text) return [];
  const stopWords = new Set([
    'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'e', 'o', 'u',
    'para', 'por', 'con', 'sin', 'un', 'una', 'que', 'se', 'al', 'es',
    'the', 'and', 'or', 'for', 'with', 'from', 'to', 'in', 'of', 'on', 'at'
  ]);
  return text.toLowerCase()
    .replace(/[^a-záéíóúñü\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Find the best matching epic based on keyword overlap.
 * Requires at least 40% overlap to consider a match.
 * @param {string[]} keywords - Keywords to match
 * @param {Array<{cardId: string, title: string}>} existingEpics - Available epics
 * @returns {string|null} cardId of the best match, or null
 */
function findBestEpicMatch(keywords, existingEpics) {
  if (keywords.length === 0 || existingEpics.length === 0) return null;

  let bestScore = 0;
  let bestEpic = null;

  for (const epic of existingEpics) {
    const epicKeywords = extractKeywords(epic.title);
    const overlap = keywords.filter(k => epicKeywords.some(ek => ek.includes(k) || k.includes(ek))).length;
    const score = overlap / Math.max(keywords.length, 1);
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      bestEpic = epic.cardId;
    }
  }

  return bestEpic;
}

/**
 * Extract combined keywords from a phase (name + task titles).
 * Provides richer context for epic matching than phase name alone.
 * @param {object} phase - Plan phase with name and tasks array
 * @returns {string[]} Combined unique keywords
 */
function extractPhaseKeywords(phase) {
  if (!phase) return [];
  const nameKeywords = extractKeywords(phase.name || '');
  const taskKeywords = (phase.tasks || [])
    .flatMap(t => extractKeywords(t.title || ''));
  // Deduplicate while preserving order (name keywords first)
  return [...new Set([...nameKeywords, ...taskKeywords])];
}

module.exports = {
  extractKeywords,
  findBestEpicMatch,
  extractPhaseKeywords
};

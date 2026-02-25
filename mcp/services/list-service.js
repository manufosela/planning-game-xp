import { getDatabase } from '../firebase-adapter.js';

/**
 * Firebase RTDB paths for each list type
 */
const LIST_PATHS = {
  bugPriority: '/data/bugpriorityList',
  bugStatus: '/data/statusList/bug-card',
  taskStatus: '/data/statusList/task-card'
};

/**
 * Cache for loaded lists
 * Each entry: { data: Object, loadedAt: number }
 */
const cache = {};

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Load a list from Firebase RTDB.
 * Throws on failure — no silent fallbacks.
 * @param {string} listType - One of: bugPriority, bugStatus, taskStatus
 * @returns {Promise<Object>} The list as { text: order } object
 * @throws {Error} If list type is unknown, Firebase fails, or data is empty
 */
async function loadListFromFirebase(listType) {
  const path = LIST_PATHS[listType];
  if (!path) {
    throw new Error(`Unknown list type: "${listType}". Valid types: ${Object.keys(LIST_PATHS).join(', ')}`);
  }

  const db = getDatabase();
  const snapshot = await db.ref(path).once('value');
  const data = snapshot.val();

  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    throw new Error(
      `[ListService] Empty or null data at Firebase path "${path}". ` +
      `Check that the path exists and contains valid list entries.`
    );
  }

  return data;
}

/**
 * Get a list, using cache if available and not expired.
 * @param {string} listType - One of: bugPriority, bugStatus, taskStatus
 * @returns {Promise<Object>} The list as { text: order } object
 * @throws {Error} If Firebase read fails or data is empty
 */
async function getList(listType) {
  const cached = cache[listType];
  if (cached && (Date.now() - cached.loadedAt) < CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await loadListFromFirebase(listType);
  cache[listType] = { data, loadedAt: Date.now() };
  return data;
}

/**
 * Get a sorted array of text values for a list type
 * @param {string} listType - One of: bugPriority, bugStatus, taskStatus
 * @returns {Promise<string[]>} Sorted array of text values
 */
export async function getListTexts(listType) {
  const data = await getList(listType);
  return Object.entries(data)
    .sort((a, b) => a[1] - b[1])
    .map(([text]) => text);
}

/**
 * Get a list as array of {id, text} pairs, sorted by order
 * @param {string} listType - One of: bugPriority, bugStatus, taskStatus
 * @returns {Promise<Array<{id: string, text: string, order: number}>>}
 */
export async function getListPairs(listType) {
  const data = await getList(listType);
  return Object.entries(data)
    .sort((a, b) => a[1] - b[1])
    .map(([text, order]) => ({ id: text, text, order }));
}

/**
 * Validate that a value exists in a list
 * @param {string} listType - One of: bugPriority, bugStatus, taskStatus
 * @param {string} value - Value to validate
 * @returns {Promise<boolean>}
 */
export async function isValidValue(listType, value) {
  const data = await getList(listType);
  return value in data;
}

/**
 * Resolve a value to ensure it's valid for the given list type.
 * Accepts the text value and returns it if valid (case-insensitive).
 * @param {string} listType - One of: bugPriority, bugStatus, taskStatus
 * @param {string} value - Text value to resolve
 * @returns {Promise<string>} The resolved canonical value
 * @throws {Error} If value cannot be resolved
 */
export async function resolveValue(listType, value) {
  const data = await getList(listType);

  // Direct match (value is a known key)
  if (value in data) {
    return value;
  }

  // Case-insensitive match
  const lowerValue = value.toLowerCase();
  for (const key of Object.keys(data)) {
    if (key.toLowerCase() === lowerValue) {
      return key;
    }
  }

  const validValues = Object.keys(data).join(', ');
  throw new Error(
    `Invalid ${listType} value "${value}". Valid values are: ${validValues}`
  );
}

/**
 * Invalidate cache for a specific list or all lists
 * @param {string} [listType] - If provided, only invalidate this list. Otherwise invalidate all.
 */
export function invalidateCache(listType) {
  if (listType) {
    delete cache[listType];
  } else {
    for (const key of Object.keys(cache)) {
      delete cache[key];
    }
  }
}

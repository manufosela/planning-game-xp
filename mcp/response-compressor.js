/**
 * MCP Response Compressor
 *
 * Reduces token consumption by stripping verbose fields from MCP tool responses.
 * Applied as post-processing middleware before responses reach the LLM.
 *
 * Strategies:
 * 1. Strip heavy fields from card objects (full description, structured criteria, etc.)
 * 2. Truncate long arrays with a count summary
 * 3. Compact JSON serialization (no pretty-print indentation)
 * 4. Collapse redundant nested objects
 */

// Fields to strip from card objects in list responses (too verbose for LLM context)
const STRIP_FROM_LIST_ITEMS = [
  'description',
  'descriptionStructured',
  'acceptanceCriteria',
  'acceptanceCriteriaStructured',
  'implementationPlan',
  'implementationNotes',
  'attachment',
  'bbbWho', 'bbbWhy', 'bbdWho', 'bbdWhy',
  'blockedByBusiness', 'blockedByDevelopment',
  'developmentInstructions'
];

// Fields to strip from single card detail (get_card) — keep structured data but trim bulk
const STRIP_FROM_DETAIL = [
  'developmentInstructions'  // These are guidelines, not card data — very heavy
];

// Max items in an array before truncation
const MAX_ARRAY_ITEMS = 20;

/**
 * Compress a parsed JSON response object.
 * Mutates in place for performance.
 * @param {Object} data - Parsed JSON response
 * @param {string} [toolName] - Tool name for context-specific compression
 * @returns {Object} Compressed data
 */
export function compressResponse(data, toolName = '') {
  if (!data || typeof data !== 'object') return data;

  // List responses: strip verbose fields from each card
  if (Array.isArray(data)) {
    return compressArray(data, toolName);
  }

  // Single card response (get_card): strip only the heaviest fields
  if (data.card && typeof data.card === 'object') {
    if (toolName === 'get_card') {
      stripFields(data.card, STRIP_FROM_DETAIL);
    } else {
      stripFields(data.card, STRIP_FROM_LIST_ITEMS);
    }
  }

  // Array of cards in response. A paginated list_cards page is already a lean
  // summary sized by the client, with fields it asked for: leave it whole.
  if (Array.isArray(data.cards) && !data.pagination) {
    data.cards = compressArray(data.cards, toolName);
  }

  // Truncate commits array if too long
  if (data.card?.commits && Array.isArray(data.card.commits) && data.card.commits.length > 5) {
    const total = data.card.commits.length;
    data.card.commits = data.card.commits.slice(-5);
    data.card._commitsNote = `Showing last 5 of ${total} commits`;
  }

  // Truncate availableTransitions to just allowed ones
  if (data.availableTransitions?.transitions) {
    const transitions = data.availableTransitions.transitions;
    const allowed = {};
    for (const [status, info] of Object.entries(transitions)) {
      if (info.allowed) {
        allowed[status] = { allowed: true };
      }
    }
    data.availableTransitions.transitions = allowed;
    data.availableTransitions._note = 'Only allowed transitions shown';
  }

  return data;
}

/**
 * Compress an array of items (cards, sprints, etc.)
 */
function compressArray(arr, toolName) {
  if (!Array.isArray(arr)) return arr;

  // Strip verbose fields from each item
  for (const item of arr) {
    if (item && typeof item === 'object') {
      stripFields(item, STRIP_FROM_LIST_ITEMS);
    }
  }

  // Truncate if too many items
  if (arr.length > MAX_ARRAY_ITEMS) {
    const total = arr.length;
    const truncated = arr.slice(0, MAX_ARRAY_ITEMS);
    truncated.push({ _truncated: true, _totalItems: total, _showing: MAX_ARRAY_ITEMS });
    return truncated;
  }

  return arr;
}

/**
 * Strip specified fields from an object (in place)
 */
function stripFields(obj, fields) {
  for (const field of fields) {
    if (field in obj) {
      delete obj[field];
    }
  }
}

/**
 * Serialize to compact JSON (no indentation).
 * Saves ~30-40% tokens vs JSON.stringify(data, null, 2).
 */
export function compactStringify(data) {
  return JSON.stringify(data);
}

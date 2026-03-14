/**
 * CardId value object — parse, format, and validate card identifiers.
 *
 * Format: {PROJECT}-{TYPE}-{NUMBER}
 * Example: PLN-TSK-0042
 */

const VALID_TYPES = ['TSK', 'BUG', 'EPC', 'SPR', 'PRP', 'QA'];
const CARD_ID_RE = /^([A-Z][A-Z0-9]{1,5})-(TSK|BUG|EPC|SPR|PRP|QA)-(\d{4,})$/;
const PROJECT_RE = /^[A-Z][A-Z0-9]{1,5}$/;

/**
 * Validate whether a string is a well-formed card ID.
 * @param {unknown} cardIdString
 * @returns {boolean}
 */
export function validate(cardIdString) {
  if (typeof cardIdString !== 'string') return false;
  return CARD_ID_RE.test(cardIdString);
}

/**
 * Parse a card ID string into its components.
 * @param {string} cardIdString
 * @returns {{ project: string, type: string, number: number }}
 */
export function parse(cardIdString) {
  if (!validate(cardIdString)) {
    throw new Error(`Invalid card ID: "${cardIdString}"`);
  }
  const match = cardIdString.match(CARD_ID_RE);
  return {
    project: match[1],
    type: match[2],
    number: parseInt(match[3], 10),
  };
}

/**
 * Format components into a card ID string.
 * @param {string} project
 * @param {string} type
 * @param {number} number
 * @returns {string}
 */
export function format(project, type, number) {
  if (!project || !PROJECT_RE.test(project)) {
    throw new Error(`Invalid project abbreviation: "${project}"`);
  }
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid card type: "${type}". Must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid card number: ${number}. Must be a positive integer.`);
  }
  return `${project}-${type}-${String(number).padStart(4, '0')}`;
}

/**
 * Extract the type component from a card ID.
 * @param {string} cardIdString
 * @returns {string}
 */
export function getType(cardIdString) {
  return parse(cardIdString).type;
}

/**
 * Extract the project component from a card ID.
 * @param {string} cardIdString
 * @returns {string}
 */
export function getProject(cardIdString) {
  return parse(cardIdString).project;
}

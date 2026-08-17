/**
 * Email utility functions for Firebase Cloud Functions.
 * Extracted from functions/index.js during monolith refactor.
 *
 * Provides encode/decode for Firebase-safe email keys,
 * Gmail normalization (dot-trick), and directory resolution helpers.
 */
'use strict';

/**
 * Normalize an email: lowercase + trim.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return (email || '').toString().trim().toLowerCase();
}

/**
 * Encode an email for use as a Firebase key.
 * Replaces characters forbidden in RTDB keys: @ . #
 * @param {string} email
 * @returns {string}
 */
function encodeEmailForFirebase(email) {
  if (!email) return '';
  return email.replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
}

/**
 * Decode a Firebase-safe key back to the original email.
 * Reverses: | -> @, ! -> ., - -> #
 * @param {string} encodedEmail
 * @returns {string|null}
 */
function decodeEmailFromFirebase(encodedEmail) {
  if (!encodedEmail) return null;
  return encodedEmail
    .replace(/\|/g, '@')
    .replace(/!/g, '.')
    .replace(/-/g, '#');
}

/**
 * Normalize a Gmail address by removing dots from the local part.
 * Gmail treats "john.doe@gmail.com" and "johndoe@gmail.com" as the same.
 * For non-Gmail addresses, returns the email as-is (lowercased).
 * @param {string} email
 * @returns {string}
 */
function normalizeGmailEmail(email) {
  if (!email) return '';
  const lower = email.trim().toLowerCase();
  const [localPart, domain] = lower.split('@');
  if (!domain) return lower;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return localPart.replace(/\./g, '') + '@' + domain;
  }
  return lower;
}

/**
 * Extract unique emails from raw data (array or object of developer/stakeholder entries).
 * Resolves developer IDs via the provided directory.
 * @param {Array|object} rawData
 * @param {object} directory - Map of dev/stk IDs to { email, name, ... }
 * @returns {string[]}
 */
function extractEmails(rawData, directory = {}) {
  const emails = new Set();
  const addEmail = (value) => {
    if (!value) return;
    if (typeof value === 'string' && value.includes('@')) {
      emails.add(normalizeEmail(value));
      return;
    }
    if (typeof value === 'object') {
      const candidate = value.id || value.email || value.mail || value.value;
      if (typeof candidate === 'string' && candidate.includes('@')) {
        emails.add(normalizeEmail(candidate));
        return;
      }
      if (typeof candidate === 'string' && directory[candidate]?.email) {
        emails.add(normalizeEmail(directory[candidate].email));
        return;
      }
    }
    if (typeof value === 'string' && directory[value]?.email) {
      emails.add(normalizeEmail(directory[value].email));
    }
  };

  if (Array.isArray(rawData)) {
    rawData.forEach(addEmail);
  } else if (rawData && typeof rawData === 'object') {
    Object.values(rawData).forEach(addEmail);
  }

  return Array.from(emails);
}

/**
 * Resolve an email from a developer/stakeholder value.
 * Handles strings (email or ID), objects with email/id fields,
 * and directory lookups.
 * @param {string|object} value
 * @param {object} directory
 * @returns {string|null}
 */
function resolveEmail(value, directory = {}) {
  if (!value) return null;

  // Direct email
  if (typeof value === 'string' && value.includes('@')) {
    return normalizeEmail(value);
  }

  // Object with email/id
  if (typeof value === 'object') {
    const candidate = value.id || value.email || value.mail || value.value;
    if (typeof candidate === 'string' && candidate.includes('@')) {
      return normalizeEmail(candidate);
    }
    if (typeof candidate === 'string' && directory[candidate]?.email) {
      return normalizeEmail(directory[candidate].email);
    }
  }

  // ID lookup in directory
  if (typeof value === 'string' && directory[value]?.email) {
    return normalizeEmail(directory[value].email);
  }

  return null;
}

/**
 * Resolve a display name from a developer/stakeholder value.
 * @param {string|object} value
 * @param {object} directory
 * @returns {string}
 */
function resolveName(value, directory = {}) {
  if (!value) return 'Usuario';

  // Object with name
  if (typeof value === 'object') {
    if (value.name) return value.name;
    const candidate = value.id || value.value;
    if (typeof candidate === 'string' && directory[candidate]?.name) {
      return directory[candidate].name;
    }
  }

  // ID lookup in directory
  if (typeof value === 'string' && directory[value]?.name) {
    return directory[value].name;
  }

  // If it's an email, use the part before @
  if (typeof value === 'string' && value.includes('@')) {
    return value.split('@')[0];
  }

  return 'Usuario';
}

module.exports = {
  normalizeEmail,
  encodeEmailForFirebase,
  decodeEmailFromFirebase,
  normalizeGmailEmail,
  extractEmails,
  resolveEmail,
  resolveName,
};

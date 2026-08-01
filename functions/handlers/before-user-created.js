/**
 * Blocking function handler — rejects registrations whose email domain is not
 * in the instance's allowlist. Applies to ALL sign-in methods (Google OAuth,
 * email/password, etc.), unlike ALLOWED_SIGNUP_EMAIL_DOMAINS in auth-provisioning
 * which only guards the email/password callable flow.
 *
 * Config: PUBLIC_ALLOWED_EMAIL_DOMAINS env var in functions/.env, comma-separated
 * list of lowercase domains (e.g. "tribbuapp.com" or "acme.io,acme.com").
 * Empty / unset → no restriction (backwards-compatible for manufosela/demo).
 *
 * Pre-authorized accounts (already in /allowedUsers or /appAdmins before their
 * first login) bypass the filter — this covers the SuperAdmin bootstrap flow
 * from the CREATE_NEW_INSTANCE wizard.
 */
'use strict';

/**
 * Parse the raw env var into a normalized, deduplicated list of domains.
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseAllowedDomains(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return [...new Set(
    raw
      .split(',')
      .map(d => d.trim().toLowerCase())
      .filter(Boolean)
  )];
}

/**
 * Extract the domain from an email address (lowercased).
 * @param {string|undefined} email
 * @returns {string|null}
 */
function extractDomain(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at === -1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * Handle a beforeUserCreated blocking event.
 *
 * @param {object} event - Firebase identity event (with event.data.email)
 * @param {object} deps
 * @param {string} [deps.allowedDomainsRaw] - value of PUBLIC_ALLOWED_EMAIL_DOMAINS
 * @param {object} deps.db - RTDB admin ref (has .ref(path).once('value'))
 * @param {Function} deps.HttpsError - firebase-functions HttpsError constructor
 * @param {object} [deps.logger]
 * @returns {Promise<void>} throws HttpsError to block, resolves to allow
 */
async function handleBeforeUserCreated(event, deps) {
  const { allowedDomainsRaw, db, HttpsError, logger } = deps;

  const allowedDomains = parseAllowedDomains(allowedDomainsRaw);
  if (allowedDomains.length === 0) {
    // No filter configured for this instance — allow all sign-ups (legacy).
    return;
  }

  const email = event && event.data && event.data.email;
  if (!email) {
    throw new HttpsError(
      'invalid-argument',
      'El registro requiere un email valido.'
    );
  }

  const domain = extractDomain(email);
  if (domain && allowedDomains.includes(domain)) {
    // Domain matches — allow.
    return;
  }

  // Bypass for pre-authorized accounts (allowedUsers or appAdmins). Covers the
  // SuperAdmin bootstrap flow: the wizard seeds /data/allowedUsers/<encEmail>
  // and /data/appAdmins/<encEmail> BEFORE the human logs in for the first time.
  const encodedEmail = email
    .replace(/\./g, '_')
    .replace(/#/g, '_')
    .replace(/\$/g, '_')
    .replace(/\[/g, '_')
    .replace(/\]/g, '_');

  try {
    const [allowedSnap, adminSnap] = await Promise.all([
      db.ref('/data/allowedUsers/' + encodedEmail).once('value'),
      db.ref('/data/appAdmins/' + encodedEmail).once('value')
    ]);
    if (allowedSnap.val() === true || adminSnap.val() === true) {
      if (logger && logger.info) {
        logger.info('beforeUserCreated allow pre-authorized', { email, domain });
      }
      return;
    }
  } catch (err) {
    if (logger && logger.error) {
      logger.error('beforeUserCreated pre-auth lookup failed', { email, err: String(err) });
    }
    // Fall through to reject — we prefer to fail closed if the RTDB read broke.
  }

  if (logger && logger.warn) {
    logger.warn('beforeUserCreated reject', { email, domain, allowedDomains });
  }
  throw new HttpsError(
    'permission-denied',
    'Solo usuarios de ' + allowedDomains.join(', ') + ' pueden registrarse en esta instancia.'
  );
}

module.exports = {
  handleBeforeUserCreated,
  // Exported for tests
  parseAllowedDomains,
  extractDomain
};

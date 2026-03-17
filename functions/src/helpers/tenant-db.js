/**
 * Tenant database routing helpers for multi-tenancy.
 *
 * Claims expected on user tokens: { instance, instanceRole, platformAdmin }
 *
 * @module functions/helpers/tenant-db
 */

import { getFirestore } from 'firebase-admin/firestore';

/**
 * Get the tenant Firestore database from a callable request's auth claims.
 * Reads `request.auth.token.instance` to determine the named database.
 *
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 * @returns {import('firebase-admin/firestore').Firestore}
 * @throws {Error} If no instance claim is present
 */
export function getTenantDb(request) {
  const instance = request.auth?.token?.instance;
  if (!instance) {
    throw new Error('Missing instance claim in auth token. User must belong to a tenant.');
  }
  return getFirestore(instance);
}

/**
 * Get the tenant Firestore database from a Firestore trigger event.
 * Reads `event.database` to determine the named database.
 *
 * @param {{ database?: string }} event
 * @returns {import('firebase-admin/firestore').Firestore}
 * @throws {Error} If no database field is present
 */
export function getTenantDbFromEvent(event) {
  const databaseId = event.database;
  if (!databaseId) {
    throw new Error('Missing database field in event. Cannot determine tenant database.');
  }
  if (databaseId === '(default)') {
    return getFirestore();
  }
  return getFirestore(databaseId);
}

/**
 * Get the platform (default) Firestore database.
 *
 * @returns {import('firebase-admin/firestore').Firestore}
 */
export function getPlatformDb() {
  return getFirestore();
}

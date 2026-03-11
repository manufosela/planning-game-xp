/**
 * Firebase Admin SDK adapter for MCP V2.
 *
 * Initializes Firebase Admin with service account credentials and provides
 * access to the Firestore instance. V2 uses Firestore exclusively (no RTDB).
 *
 * @module mcp/firebase-adapter
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {admin.app.App | null} */
let app = null;

/** @type {admin.firestore.Firestore | null} */
let firestore = null;

/** @type {string | null} */
let firebaseProjectId = null;

/**
 * Resolve the path to serviceAccountKey.json.
 * Priority: GOOGLE_APPLICATION_CREDENTIALS > MCP_INSTANCE_DIR > mcp root
 * @returns {string}
 */
export function resolveCredentialsPath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  const instanceDir = process.env.MCP_INSTANCE_DIR;
  if (instanceDir) {
    const instancePath = resolve(instanceDir, 'serviceAccountKey.json');
    if (existsSync(instancePath)) {
      return instancePath;
    }
  }

  return resolve(__dirname, '..', 'serviceAccountKey.json');
}

/**
 * Initialize Firebase Admin SDK.
 * @returns {{ app: admin.app.App, firestore: admin.firestore.Firestore }}
 */
export function initFirebase() {
  if (app) {
    return { app, firestore };
  }

  const credentialsPath = resolveCredentialsPath();

  if (!existsSync(credentialsPath)) {
    const msg = [
      '[MCP FATAL] serviceAccountKey.json not found.',
      `  Expected at: ${credentialsPath}`,
      '',
      '  How to fix:',
      '  1. Go to Firebase Console > Project Settings > Service Accounts',
      '  2. Click "Generate new private key"',
      '  3. Save the file as serviceAccountKey.json',
      '  4. Restart the MCP server',
    ].join('\n');
    process.stderr.write(msg + '\n');
    throw new Error(`serviceAccountKey.json not found at ${credentialsPath}`);
  }

  /** @type {Record<string, string>} */
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid serviceAccountKey.json: ${err.message}`);
  }

  if (!serviceAccount.project_id) {
    throw new Error('serviceAccountKey.json missing project_id');
  }

  firebaseProjectId = serviceAccount.project_id;

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  firestore = admin.firestore();

  return { app, firestore };
}

/**
 * Get the Firebase project ID from the service account.
 * @returns {string | null}
 */
export function getFirebaseProjectId() {
  return firebaseProjectId;
}

/**
 * Get the Firestore instance.
 * @returns {admin.firestore.Firestore}
 */
export function getFirestore() {
  if (!firestore) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return firestore;
}

/**
 * Get the Firebase Admin app.
 * @returns {admin.app.App}
 */
export function getApp() {
  if (!app) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return app;
}

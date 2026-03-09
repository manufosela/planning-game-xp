import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let app;
let db;
let firestore;
let firebaseProjectId = null;

/**
 * Resolve the path to serviceAccountKey.json.
 * Priority: GOOGLE_APPLICATION_CREDENTIALS > MCP_INSTANCE_DIR/serviceAccountKey.json > repo root/serviceAccountKey.json
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

export function initFirebase() {
  const credentialsPath = resolveCredentialsPath();

  if (!existsSync(credentialsPath)) {
    const msg = [
      '[MCP FATAL] serviceAccountKey.json not found.',
      `  Expected at: ${credentialsPath}`,
      '',
      '  How to fix:',
      '  1. Go to Firebase Console > Project Settings > Service Accounts',
      '  2. Click "Generate new private key"',
      '  3. Save the file as serviceAccountKey.json in your instance directory',
      '  4. Restart the MCP server',
    ].join('\n');
    process.stderr.write(msg + '\n');
    throw new Error(`serviceAccountKey.json not found at ${credentialsPath}`);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  } catch (err) {
    const msg = `[MCP FATAL] serviceAccountKey.json is invalid JSON: ${err.message}\n  Path: ${credentialsPath}`;
    process.stderr.write(msg + '\n');
    throw new Error(`Invalid serviceAccountKey.json: ${err.message}`);
  }

  if (!serviceAccount.project_id) {
    const msg = '[MCP FATAL] serviceAccountKey.json is missing the "project_id" field.';
    process.stderr.write(msg + '\n');
    throw new Error('serviceAccountKey.json missing project_id');
  }

  firebaseProjectId = serviceAccount.project_id;

  const databaseURL = process.env.FIREBASE_DATABASE_URL ||
    `https://${serviceAccount.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL
  });

  db = admin.database();
  firestore = admin.firestore();

  return { app, db, firestore };
}

export function getFirebaseProjectId() {
  return firebaseProjectId;
}

export function getDatabase() {
  if (!db) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return db;
}

export function getFirestore() {
  if (!firestore) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return firestore;
}

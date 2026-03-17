import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { currentInstance } from './store.js';

const REQUIRED_KEYS = [
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN',
  'PUBLIC_FIREBASE_PROJECT_ID',
  'PUBLIC_FIREBASE_APP_ID',
];

/**
 * @returns {import('firebase/app').FirebaseOptions}
 */
function getFirebaseConfig() {
  const config = {
    apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
    authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  };

  const missingKeys = REQUIRED_KEYS.filter((key) => !import.meta.env[key]);
  if (missingKeys.length > 0) {
    throw new Error(`Missing Firebase environment variables: ${missingKeys.join(', ')}`);
  }

  return config;
}

/**
 * @returns {import('firebase/app').FirebaseApp}
 */
export function getFirebaseApp() {
  return getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig());
}

/**
 * @returns {import('firebase/firestore').Firestore}
 */
export function getDb() {
  // Priority: Custom Claim signal > env var > default
  const claimInstance = currentInstance.get();
  if (claimInstance) {
    return getFirestore(getFirebaseApp(), claimInstance);
  }

  const databaseId = import.meta.env.PUBLIC_FIREBASE_DATABASE_ID;
  if (databaseId && databaseId !== '(default)') {
    return getFirestore(getFirebaseApp(), databaseId);
  }
  return getFirestore(getFirebaseApp());
}

/**
 * @returns {import('firebase/auth').Auth}
 */
export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

/**
 * Firestore data converter for cards.
 * Passes data through as-is (Firestore handles serialization).
 * @type {import('firebase/firestore').FirestoreDataConverter<import('./types.d.ts').Card>}
 */
export const cardConverter = {
  /** @param {import('./types.d.ts').Card} card */
  toFirestore(card) {
    return { ...card };
  },
  /** @param {import('firebase/firestore').QueryDocumentSnapshot} snapshot */
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return /** @type {import('./types.d.ts').Card} */ (data);
  },
};

/**
 * Returns a typed reference to the cards subcollection for a project.
 * @param {string} projectId
 * @returns {import('firebase/firestore').CollectionReference<import('./types.d.ts').Card>}
 */
export function cardsRef(projectId) {
  if (!projectId) {
    throw new Error('cardsRef requires a projectId');
  }

  return collection(getDb(), 'projects', projectId, 'cards').withConverter(cardConverter);
}

/**
 * Returns a reference to the projects collection.
 * @returns {import('firebase/firestore').CollectionReference<import('./types.d.ts').Project>}
 */
export function projectsRef() {
  return /** @type {import('firebase/firestore').CollectionReference<import('./types.d.ts').Project>} */ (
    collection(getDb(), 'projects')
  );
}

/**
 * Returns a reference to the users collection.
 * @returns {import('firebase/firestore').CollectionReference<import('./types.d.ts').User>}
 */
export function usersRef() {
  return /** @type {import('firebase/firestore').CollectionReference<import('./types.d.ts').User>} */ (
    collection(getDb(), 'users')
  );
}

/**
 * Returns a reference to the team subcollection for a project.
 * @param {string} projectId
 * @returns {import('firebase/firestore').CollectionReference<import('./types.d.ts').TeamMember>}
 */
export function teamRef(projectId) {
  return /** @type {import('firebase/firestore').CollectionReference<import('./types.d.ts').TeamMember>} */ (
    collection(getDb(), 'projects', projectId, 'team')
  );
}

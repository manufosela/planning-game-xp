/**
 * Authentication module — Google and Microsoft OAuth, auth state management.
 * @module lib/auth
 */

import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getIdTokenResult,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ContextProvider, createContext } from '@lit/context';
import { signal } from '@lit-labs/signals';
import { getFirebaseAuth, getDb } from './firebase.js';
import { authUser, theme as themeSignal } from './store.js';

/**
 * Lit context key for the authenticated user.
 * @type {import('@lit/context').Context<'auth-user', import('firebase/auth').User | null>}
 */
export const authContext = createContext('auth-user');

export const authState = signal({
  status: 'idle',
  user: /** @type {import('./types.d.ts').User | import('firebase/auth').User | null} */ (null),
});

const googleProvider = new GoogleAuthProvider();

const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({ prompt: 'select_account' });

export function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function createMicrosoftProvider() {
  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/**
 * @param {import('./types.d.ts').User | import('firebase/auth').User | null} user
 */
export function applyAuthUser(user) {
  authState.set({
    status: user ? 'authenticated' : 'anonymous',
    user,
  });
  authUser.set(/** @type {import('./types.d.ts').User | null} */ (user));
}

export function attachAuthContext(host) {
  return new ContextProvider(host, {
    context: authContext,
    initialValue: {
      authState,
      signInWithGoogle,
      signInWithMicrosoft,
      signOutUser,
    },
  });
}

/**
 * Sign in with Google OAuth popup.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithGoogle() {
  const credential = await signInWithPopup(getFirebaseAuth(), googleProvider);
  await saveUserToFirestore(credential.user);
  applyAuthUser(credential.user);
  return credential;
}

/**
 * Sign in with Microsoft OAuth popup.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithMicrosoft() {
  const credential = await signInWithPopup(getFirebaseAuth(), microsoftProvider);
  await saveUserToFirestore(credential.user);
  applyAuthUser(credential.user);
  return credential;
}

/**
 * Sign out the current user.
 * @returns {Promise<void>}
 */
export async function signOut() {
  await firebaseSignOut(getFirebaseAuth());
  applyAuthUser(null);
}

export async function signOutUser() {
  await signOut();
}

/**
 * Subscribe to auth state changes.
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function onAuthStateChange(callback) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

/**
 * @param {(user: import('firebase/auth').User | null) => void} [onChange]
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function startAuthListener(onChange) {
  authState.set({ ...authState.get(), status: 'loading' });
  return onAuthStateChanged(getFirebaseAuth(), (user) => {
    applyAuthUser(user);
    if (user && 'preferences' in user && user.preferences?.theme) {
      themeSignal.set(user.preferences.theme);
    }
    onChange?.(user);
  });
}

/**
 * Get the currently authenticated user (may be null).
 * @returns {import('firebase/auth').User | null}
 */
export function getCurrentUser() {
  return getFirebaseAuth().currentUser;
}

/**
 * @param {import('./types.d.ts').User | import('firebase/auth').User | null | undefined} user
 * @param {string} [redirectTo]
 * @returns {import('./types.d.ts').TransitionResult & { redirectTo?: string }}
 */
export function authGuard(user, redirectTo = '/login') {
  if (!redirectTo.startsWith('/')) {
    throw new Error('authGuard redirectTo must be an absolute path');
  }

  if (!user) {
    return {
      allowed: false,
      reason: 'Authentication required',
      redirectTo,
    };
  }

  return { allowed: true };
}

/**
 * Extract custom claims (instance, instanceRole, platformAdmin) from user's ID token.
 * @param {import('firebase/auth').User} user
 * @returns {Promise<{ instance?: string, instanceRole?: string, platformAdmin?: boolean }>}
 */
export async function getIdTokenClaims(user) {
  const tokenResult = await getIdTokenResult(user);
  const { instance, instanceRole, platformAdmin } = tokenResult.claims;
  return {
    instance: /** @type {string | undefined} */ (instance),
    instanceRole: /** @type {string | undefined} */ (instanceRole),
    platformAdmin: /** @type {boolean | undefined} */ (platformAdmin),
  };
}

/**
 * Save or update user document in Firestore after sign-in.
 * Creates the doc if it doesn't exist; updates lastLoginAt if it does.
 * @param {import('firebase/auth').User} user
 * @returns {Promise<void>}
 */
export async function saveUserToFirestore(user) {
  const userRef = doc(getDb(), 'users', user.uid);
  await setDoc(
    userRef,
    {
      name: user.displayName ?? '',
      email: user.email ?? '',
      photoUrl: user.photoURL ?? null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
}

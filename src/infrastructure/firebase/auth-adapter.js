import {
  signInWithGoogle as authSignInWithGoogle,
  signInWithMicrosoft as authSignInWithMicrosoft,
  signOut as authSignOut,
  onAuthStateChange,
  getCurrentUser as authGetCurrentUser,
  getIdTokenClaims,
} from '../../lib/auth.js';

/**
 * Transforms a Firebase User into an AuthUser domain object.
 * @param {import('firebase/auth').User | null} firebaseUser
 * @returns {import('@pgv2/domain/ports').AuthUser | null}
 */
function toAuthUser(firebaseUser) {
  if (!firebaseUser) return null;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName: firebaseUser.displayName ?? '',
    photoURL: firebaseUser.photoURL ?? undefined,
  };
}

/**
 * Firebase implementation of AuthPort.
 * @implements {import('@pgv2/domain/ports').AuthPort}
 */
export class FirebaseAuthAdapter {
  /** @returns {Promise<import('@pgv2/domain/ports').AuthUser>} */
  async signInWithGoogle() {
    const credential = await authSignInWithGoogle();
    return toAuthUser(credential.user);
  }

  /** @returns {Promise<import('@pgv2/domain/ports').AuthUser>} */
  async signInWithMicrosoft() {
    const credential = await authSignInWithMicrosoft();
    return toAuthUser(credential.user);
  }

  /** @returns {Promise<void>} */
  async signOut() {
    await authSignOut();
  }

  /**
   * @param {(user: import('@pgv2/domain/ports').AuthUser | null) => void} callback
   * @returns {import('@pgv2/domain/ports').Unsubscribe}
   */
  onAuthStateChanged(callback) {
    return onAuthStateChange((firebaseUser) => {
      callback(toAuthUser(firebaseUser));
    });
  }

  /** @returns {import('@pgv2/domain/ports').AuthUser | null} */
  getCurrentUser() {
    const firebaseUser = authGetCurrentUser();
    return toAuthUser(firebaseUser);
  }

  /**
   * Extract custom claims from a Firebase user's ID token.
   * @param {import('firebase/auth').User | null} user
   * @returns {Promise<{ instance?: string, instanceRole?: string, platformAdmin?: boolean }>}
   */
  async getCustomClaims(user) {
    if (!user) {
      return { instance: undefined, instanceRole: undefined, platformAdmin: undefined };
    }
    return getIdTokenClaims(user);
  }
}

/**
 * ManageAuth use case — authentication operations via injected ports.
 * @module application/use-cases/manage-auth
 */

/**
 * @typedef {Object} ManageAuthDeps
 * @property {{ login: (provider: string) => Promise<any>, logout: () => Promise<void>, onAuthStateChanged: (cb: Function) => Function }} authPort
 * @property {{ get: (uid: string) => Promise<any> }} userRepository
 */

export class ManageAuth {
  /** @param {ManageAuthDeps} deps */
  constructor({ authPort, userRepository }) {
    this._authPort = authPort;
    this._userRepo = userRepository;
  }

  /**
   * Login with a given provider.
   * @param {string} provider - e.g. 'google', 'microsoft'
   * @returns {Promise<any>} Firebase auth user
   */
  async login(provider) {
    return this._authPort.login(provider);
  }

  /** Logout the current user. */
  async logout() {
    return this._authPort.logout();
  }

  /**
   * Subscribe to auth state changes. Enriches the Firebase auth user
   * with the full user profile from Firestore.
   * @param {(user: any) => void} callback
   * @returns {Function} unsubscribe
   */
  onAuthChange(callback) {
    return this._authPort.onAuthStateChanged(async (/** @type {any} */ firebaseUser) => {
      if (!firebaseUser) {
        callback(null);
        return;
      }
      const profile = await this._userRepo.get(firebaseUser.uid);
      callback(profile);
    });
  }
}

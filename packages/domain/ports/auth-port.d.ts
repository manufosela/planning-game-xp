export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export type Unsubscribe = () => void;

export interface AuthPort {
  signInWithGoogle(): Promise<AuthUser>;
  signInWithMicrosoft(): Promise<AuthUser>;
  signOut(): Promise<void>;
  onAuthStateChanged(callback: (user: AuthUser | null) => void): Unsubscribe;
  getCurrentUser(): AuthUser | null;
}

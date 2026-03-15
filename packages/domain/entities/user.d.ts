import { Timestamp } from './timestamp';

export type UserRole = 'superadmin' | 'user';
export type ProjectRole = 'admin' | 'developer' | 'stakeholder' | 'consultant';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  defaultYear: number;
  locale: 'en' | 'es';
}

export interface User {
  uid: string;
  name: string;
  email: string;
  photoUrl?: string;
  role: UserRole;
  projects: Record<string, ProjectRole>;
  preferences: UserPreferences;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

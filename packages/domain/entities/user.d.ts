/**
 * @pgv2/domain — User entity type definitions
 */

export type UserRole =
  | 'SuperAdmin'
  | 'Admin'
  | 'Developer'
  | 'Validator'
  | 'Consultant';

export interface BacklogItem {
  cardId: string;
  projectId: string;
  cardType: string;
  title: string;
  status: string;
}

export interface UserBacklog {
  order: string[];
  items: Record<string, BacklogItem>;
}

export interface User {
  userId: string;
  name: string;
  email: string;
  developerId?: string;
  stakeholderId?: string;
  role: UserRole;
  projects?: Record<string, { role: UserRole }>;
  backlog?: UserBacklog;
}

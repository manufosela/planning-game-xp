/**
 * Planning Game V2 — Type Definitions
 *
 * All runtime code is .js with JSDoc annotations.
 * This file provides type information only — no runtime code.
 */

import type { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Card types
// ---------------------------------------------------------------------------

export type CardType = 'task' | 'bug' | 'epic' | 'sprint' | 'proposal' | 'qa';

export interface BaseCard {
  cardId: string;
  type: CardType;
  title: string;
  description: string;
  status: string;
  year: number;
  epic?: string;
  sprint?: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  notes?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface UserStory {
  role: string;
  goal: string;
  benefit: string;
}

export interface AcceptanceCriteria {
  given: string;
  when: string;
  then: string;
}

export interface Commit {
  hash: string;
  message: string;
  date: string;
  author: string;
}

export interface Pipeline {
  branch?: string;
  prUrl?: string;
  prNumber?: number;
  mergedAt?: Timestamp;
  deployedAt?: Timestamp;
}

export interface ImplementationPlan {
  approach: string;
  steps: string[];
  risks?: string[];
  outOfScope?: string[];
  status: 'proposed' | 'validated';
}

export interface WorkCycle {
  startedAt: Timestamp;
  endedAt?: Timestamp;
  durationMs?: number;
}

export interface AiUsageEntry {
  sessionId: string;
  model: string;
  action: string;
  timestamp: Timestamp;
  durationMinutes: number;
}

export interface TeamMemberRef {
  id: string;
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Card variants
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'To Do'
  | 'In Progress'
  | 'To Validate'
  | 'Done'
  | 'Done&Validated'
  | 'Blocked'
  | 'Reopened';

export interface Task extends BaseCard {
  type: 'task';
  status: TaskStatus;
  userStory: UserStory;
  acceptanceCriteria: AcceptanceCriteria[];
  devPoints: number;
  businessPoints: number;
  priority: number;
  developer?: TeamMemberRef;
  codeveloper?: TeamMemberRef;
  validator?: TeamMemberRef;
  covalidator?: TeamMemberRef;
  startDate?: Timestamp;
  endDate?: Timestamp;
  commits?: Commit[];
  pipeline?: Pipeline;
  implementationPlan?: ImplementationPlan;
  workCycles?: WorkCycle[];
  totalWorkMs?: number;
  aiUsage?: AiUsageEntry[];
}

export type BugPriority =
  | 'APPLICATION BLOCKER'
  | 'DEPARTMENT BLOCKER'
  | 'INDIVIDUAL BLOCKER'
  | 'USER EXPERIENCE ISSUE'
  | 'WORKFLOW IMPROVEMENT'
  | 'WORKAROUND AVAILABLE ISSUE';

export type BugStatus = 'Created' | 'Assigned' | 'Fixed' | 'Verified' | 'Closed';

export interface Bug extends BaseCard {
  type: 'bug';
  status: BugStatus;
  bugPriority: BugPriority;
  registeredAt: Timestamp;
  developer?: TeamMemberRef;
  validator?: TeamMemberRef;
  rootCause?: string;
  resolution?: string;
  commits?: Commit[];
  pipeline?: Pipeline;
  attachments?: string[];
}

export type EpicStatus = 'Active' | 'Completed' | 'Archived';

export interface Epic extends BaseCard {
  type: 'epic';
  status: EpicStatus;
  color?: string;
}

export interface Sprint extends BaseCard {
  type: 'sprint';
  startDate: Timestamp;
  endDate: Timestamp;
  locked: boolean;
  goals?: string[];
}

export type ProposalStatus = 'Pending' | 'Planned' | 'Rejected';

export interface Proposal extends BaseCard {
  type: 'proposal';
  status: ProposalStatus;
  userStory?: UserStory;
  convertedToTaskId?: string;
}

export type QAStatus = 'Pending' | 'Passed' | 'Failed';

export interface QA extends BaseCard {
  type: 'qa';
  status: QAStatus;
  suite: string;
  steps: string[];
  expectedResult: string;
  actualResult?: string;
}

export type Card = Task | Bug | Epic | Sprint | Proposal | QA;

// ---------------------------------------------------------------------------
// Team & Users
// ---------------------------------------------------------------------------

export interface TeamMember {
  uid?: string;
  name: string;
  email: string;
  role: 'developer' | 'stakeholder' | 'both';
  active: boolean;
  joinedAt: Timestamp;
}

export type ProjectRole = 'admin' | 'developer' | 'stakeholder' | 'consultant';

export interface Project {
  name: string;
  abbreviation: string;
  description?: string;
  repoUrl?: string;
  scoringSystem: '1-5' | 'fibonacci';
  archived: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  developerCount: number;
  stakeholderCount: number;
}

export type UserRole = 'superadmin' | 'user';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  defaultYear: number;
  locale: 'en' | 'es';
}

export interface User {
  name: string;
  email: string;
  photoUrl?: string;
  role: UserRole;
  projects: Record<string, ProjectRole>;
  preferences: UserPreferences;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationType = 'info' | 'warning' | 'action';

export interface Notification {
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  cardRef?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export interface TagRegistryEntry {
  name: string;
  color: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface FieldChange {
  from: unknown;
  to: unknown;
}

export interface HistoryEntry {
  timestamp: Timestamp;
  changedBy: string;
  changedByName: string;
  changes: Record<string, FieldChange>;
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

export interface FilterState {
  type: CardType | 'all' | null;
  status: string | 'all' | null;
  year: number | null;
  developer: string | null;
  sprint: string | null;
  epic: string | null;
  tags: string[];
  query?: string;
  search: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  missing?: string[];
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export type PlanStatus = 'draft' | 'accepted' | 'rejected';

export interface PlanPhase {
  title: string;
  description: string;
  estimatedPoints: number;
  taskIds?: string[];
}

export interface Plan {
  id?: string;
  projectId: string;
  title: string;
  objective: string;
  status: PlanStatus;
  phases: PlanPhase[];
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// ADRs (Architecture Decision Records)
// ---------------------------------------------------------------------------

export type AdrStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

export interface Adr {
  id?: string;
  projectId: string;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: AdrStatus;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Global Configuration
// ---------------------------------------------------------------------------

export type ConfigType = 'agent' | 'prompt' | 'instruction' | 'guideline';

export interface ConfigVersion {
  version: number;
  content: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface GlobalConfig {
  id?: string;
  type: ConfigType;
  name: string;
  description: string;
  content: string;
  category?: string;
  targetFile?: string;
  version: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

export interface TrashedCard extends BaseCard {
  deletedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface HoursReportRow {
  developer: string;
  cardId: string;
  title: string;
  startDate: string;
  endDate: string;
  durationHours: number;
}

export interface PointsReportRow {
  developer: string;
  sprint: string;
  completedPoints: number;
}

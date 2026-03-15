import { Timestamp } from './timestamp';

export type CardType = 'task' | 'bug' | 'epic' | 'sprint' | 'proposal' | 'qa';

export interface TeamMemberRef {
  id: string;
  name: string;
  email: string;
}

export interface TeamMember {
  uid?: string;
  name: string;
  email: string;
  role: 'developer' | 'stakeholder' | 'both';
  active: boolean;
  joinedAt: Timestamp;
}

export interface TagRegistryEntry {
  name: string;
  color: string;
  description?: string;
}

export type TagRegistry = TagRegistryEntry[];

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
  startDate?: Timestamp;
  endDate?: Timestamp;
  commits?: Commit[];
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
  developer?: TeamMemberRef;
  validator?: TeamMemberRef;
  rootCause?: string;
  resolution?: string;
  commits?: Commit[];
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

/**
 * @pgv2/domain — Card entity type definitions
 */

/** Commit reference attached to a card */
export interface CardCommit {
  hash: string;
  message: string;
  date: string;
  author: string;
}

/** User story format: Como / Quiero / Para */
export interface DescriptionStructured {
  role: string;
  goal: string;
  benefit: string;
}

/** Gherkin-style acceptance criteria */
export interface AcceptanceCriteria {
  given: string;
  when: string;
  then: string;
  raw: string;
}

/** Pipeline tracking events */
export interface PipelineStatus {
  committed?: { date: string; commitHash: string; branch: string };
  prCreated?: { date: string; prUrl: string; prNumber: number };
  merged?: { date: string; mergedBy: string };
  deployed?: { date: string; environment: string };
}

/** AI usage tracking */
export interface AiUsageEntry {
  sessionId: string;
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  durationMinutes: number;
  action: string;
}

/** Work cycle for reopened task tracking */
export interface WorkCycle {
  startDate: string;
  endDate?: string;
  durationMs: number;
  cycleNumber?: number;
}

/** Implementation plan */
export interface ImplementationPlan {
  approach: string;
  steps: string[];
  dataModelChanges?: string;
  apiChanges?: string;
  risks?: string[];
  outOfScope?: string[];
}

/** History entry */
export interface HistoryEntry {
  changedBy: string;
  timestamp: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

/** Note attached to a card */
export interface CardNote {
  author: string;
  date: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Card type enum values
// ---------------------------------------------------------------------------

export type CardType =
  | 'task-card'
  | 'bug-card'
  | 'epic-card'
  | 'proposal-card'
  | 'qa-card'
  | 'sprint-card';

// ---------------------------------------------------------------------------
// Base card — fields shared by every card type
// ---------------------------------------------------------------------------

export interface BaseCard {
  cardId: string;
  cardType: CardType;
  title: string;
  description?: string;
  status: string;
  projectId: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  year?: number;
  epic?: string;
  sprint?: string;
  developer?: string;
  codeveloper?: string;
  validator?: string;
  covalidator?: string;
  notes?: CardNote[];
  history?: HistoryEntry[];
}

// ---------------------------------------------------------------------------
// Type-specific cards
// ---------------------------------------------------------------------------

export interface TaskCard extends BaseCard {
  cardType: 'task-card';
  descriptionStructured?: DescriptionStructured[];
  acceptanceCriteria?: string;
  acceptanceCriteriaStructured?: AcceptanceCriteria[];
  devPoints?: number;
  businessPoints?: number;
  priority?: number;
  startDate?: string;
  endDate?: string;
  commits?: CardCommit[];
  implementationPlan?: ImplementationPlan;
  planStatus?: 'proposed' | 'validated';
  pipelineStatus?: PipelineStatus;
  aiUsage?: AiUsageEntry[];
  workCycles?: WorkCycle[];
  totalWorkDurationMs?: number;
}

export interface BugCard extends BaseCard {
  cardType: 'bug-card';
  bugType?: string;
  bugTypeList?: string[];
  registerDate?: string;
  rootCause?: string;
  resolution?: string;
  cinemaFile?: string;
  exportedFile?: string;
  priority?: BugPriority;
}

export type BugPriority =
  | 'APPLICATION BLOCKER'
  | 'DEPARTMENT BLOCKER'
  | 'INDIVIDUAL BLOCKER'
  | 'USER EXPERIENCE ISSUE'
  | 'WORKFLOW IMPROVEMENT'
  | 'WORKAROUND AVAILABLE ISSUE';

export interface EpicCard extends BaseCard {
  cardType: 'epic-card';
  epicType?: string;
  epicTypeList?: string[];
}

export interface ProposalCard extends BaseCard {
  cardType: 'proposal-card';
  descriptionStructured?: DescriptionStructured[];
  acceptanceCriteria?: string;
  acceptanceCriteriaStructured?: AcceptanceCriteria[];
}

export interface QACard extends BaseCard {
  cardType: 'qa-card';
  testSuite?: string;
  testResult?: string;
  testDate?: string;
}

/** Union of all card types */
export type Card = TaskCard | BugCard | EpicCard | ProposalCard | QACard;

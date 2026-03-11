# Planning Game V2 — Data Model (Firestore)

## Design Principles

1. **Subcollections over flat paths** — cards live under projects, history lives under cards
2. **uid as document ID for users** — no email encoding
3. **Discriminated unions** — one `cards` collection with a `type` field, not 6 separate collections (types in `d.ts`)
4. **Denormalize for reads** — store developer name + email on the card, not just dev_XXX
5. **Atomic counters** — Firestore increment() for card numbering
6. **Security at document level** — rules check user's project membership per document

## Collections

### `/projects/{projectId}`

```typescript
interface Project {
  name: string;
  abbreviation: string;           // e.g., "PLN" — used for card IDs
  description?: string;
  repoUrl?: string;
  scoringSystem: '1-5' | 'fibonacci';
  archived: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  createdBy: string;              // uid
  updatedAt: Timestamp;

  // Denormalized team (source of truth: team subcollection)
  developerCount: number;
  stakeholderCount: number;
}
```

### `/projects/{projectId}/team/{memberId}`

```typescript
interface TeamMember {
  uid?: string;                   // Firebase Auth uid (if registered)
  name: string;
  email: string;
  role: 'developer' | 'stakeholder' | 'both';
  active: boolean;
  joinedAt: Timestamp;
}
```

Replaces V1's separate `/data/developers` and `/data/stakeholders` global paths.
Team is per-project. A person in 3 projects has 3 team member docs.

### `/projects/{projectId}/cards/{cardId}`

All card types in ONE subcollection, discriminated by `type`.

Types defined in `src/lib/types.d.ts`:

```typescript
// types.d.ts — type definitions only, no runtime code
type CardType = 'task' | 'bug' | 'epic' | 'sprint' | 'proposal' | 'qa';

// Base fields (all card types)
interface BaseCard {
  cardId: string;                 // e.g., "PLN-TSK-0042" (human-readable, immutable)
  type: CardType;
  title: string;
  description: string;
  status: string;
  year: number;
  epic?: string;                  // epic cardId reference
  sprint?: string;                // sprint cardId reference
  createdAt: Timestamp;
  createdBy: string;              // uid
  updatedAt: Timestamp;
  updatedBy: string;              // uid
  notes?: string;
  tags?: string[];                // e.g., ["INFRA", "REFACTOR"] — free-form, project-scoped
}

// Tag registry (per project, optional — enables autocomplete + colors)
// Stored in /projects/{projectId}/settings/tags
interface TagRegistry {
  tags: Array<{
    name: string;                   // e.g., "INFRA", "SW", "TESTS", "REFACTOR", "GESTION"
    color: string;                  // hex color for badge, e.g., "#6366f1"
    description?: string;           // optional tooltip
  }>;
}

// Task-specific
interface Task extends BaseCard {
  type: 'task';
  status: 'To Do' | 'In Progress' | 'To Validate' | 'Done' | 'Done&Validated' | 'Blocked' | 'Reopened';
  userStory: {
    role: string;                 // Como...
    goal: string;                 // Quiero...
    benefit: string;              // Para...
  };
  acceptanceCriteria: Array<{
    given: string;
    when: string;
    then: string;
  }>;
  devPoints: number;              // 1-5
  businessPoints: number;         // 1-5
  priority: number;               // Calculated: (businessPoints/devPoints)*100
  developer?: TeamMemberRef;      // {id, name, email}
  codeveloper?: TeamMemberRef;
  validator?: TeamMemberRef;
  covalidator?: TeamMemberRef;
  startDate?: Timestamp;
  endDate?: Timestamp;
  commits?: Array<{
    hash: string;
    message: string;
    date: string;
    author: string;
  }>;
  pipeline?: {
    branch?: string;
    prUrl?: string;
    prNumber?: number;
    mergedAt?: Timestamp;
    deployedAt?: Timestamp;
  };
  implementationPlan?: {
    approach: string;
    steps: string[];
    risks?: string[];
    outOfScope?: string[];
    status: 'proposed' | 'validated';
  };
  workCycles?: Array<{
    startedAt: Timestamp;
    endedAt?: Timestamp;
    durationMs?: number;
  }>;
  totalWorkMs?: number;
  aiUsage?: Array<{
    sessionId: string;
    model: string;
    action: string;
    timestamp: Timestamp;
    durationMinutes: number;
  }>;
}

// Bug-specific
interface Bug extends BaseCard {
  type: 'bug';
  status: 'Created' | 'Assigned' | 'Fixed' | 'Verified' | 'Closed';
  bugPriority: BugPriority;
  registeredAt: Timestamp;
  developer?: TeamMemberRef;
  validator?: TeamMemberRef;
  rootCause?: string;
  resolution?: string;
  commits?: Commit[];
  pipeline?: Pipeline;
  attachments?: string[];         // Storage paths
}

type BugPriority =
  | 'APPLICATION BLOCKER'
  | 'DEPARTMENT BLOCKER'
  | 'INDIVIDUAL BLOCKER'
  | 'USER EXPERIENCE ISSUE'
  | 'WORKFLOW IMPROVEMENT'
  | 'WORKAROUND AVAILABLE ISSUE';

// Epic
interface Epic extends BaseCard {
  type: 'epic';
  status: 'Active' | 'Completed' | 'Archived';
  color?: string;                 // For Gantt visualization
}

// Sprint
interface Sprint extends BaseCard {
  type: 'sprint';
  startDate: Timestamp;
  endDate: Timestamp;
  locked: boolean;                // Immutable when cards in progress
  goals?: string[];
}

// Proposal
interface Proposal extends BaseCard {
  type: 'proposal';
  status: 'Pending' | 'Planned' | 'Rejected';
  userStory?: UserStory;
  convertedToTaskId?: string;     // If converted
}

// QA
interface QA extends BaseCard {
  type: 'qa';
  status: 'Pending' | 'Passed' | 'Failed';
  suite: string;
  steps: string[];
  expectedResult: string;
  actualResult?: string;
}

// Union type
type Card = Task | Bug | Epic | Sprint | Proposal | QA;

// Denormalized reference (avoids joins)
interface TeamMemberRef {
  id: string;                     // team member doc ID
  name: string;
  email: string;
}
```

### `/projects/{projectId}/cards/{cardId}/history/{historyId}`

```typescript
interface HistoryEntry {
  timestamp: Timestamp;
  changedBy: string;              // uid
  changedByName: string;          // denormalized
  changes: Record<string, { from: any; to: any }>;
}
```

### `/projects/{projectId}/plans/{planId}`

```typescript
interface Plan {
  title: string;
  objective: string;
  status: 'draft' | 'accepted' | 'rejected';
  phases: Array<{
    name: string;
    tasks: string[];              // Proposed task descriptions
    estimatedPoints: number;
  }>;
  createdAt: Timestamp;
  createdBy: string;
}
```

### `/projects/{projectId}/adrs/{adrId}`

```typescript
interface ADR {
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  createdAt: Timestamp;
  createdBy: string;
}
```

### `/users/{uid}`

```typescript
interface User {
  name: string;
  email: string;
  photoUrl?: string;
  role: 'superadmin' | 'user';
  projects: Record<string, 'admin' | 'developer' | 'stakeholder' | 'consultant'>;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    defaultYear: number;
    locale: 'en' | 'es';
  };
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}
```

No email encoding. Document ID = Firebase Auth `uid`.

### `/users/{uid}/notifications/{notifId}`

```typescript
interface Notification {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'action';
  read: boolean;
  cardRef?: string;               // "projects/PLN/cards/PLN-TSK-0042"
  createdAt: Timestamp;
  expiresAt: Timestamp;           // Auto-cleanup via TTL
}
```

### `/global/config/{configId}`

```typescript
interface GlobalConfig {
  type: 'agent' | 'prompt' | 'instruction' | 'guideline';
  name: string;
  description: string;
  content: string;
  category: string;
  version: number;                // Auto-increment for guidelines
  targetFile?: string;            // For guidelines sync
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `/global/config/{configId}/versions/{version}`

```typescript
interface ConfigVersion {
  content: string;
  updatedAt: Timestamp;
  updatedBy: string;
}
```

## Indexes

```
// Composite indexes (firestore.indexes.json)
projects/{projectId}/cards:
  - type ASC, status ASC, year ASC
  - type ASC, developer.id ASC, status ASC
  - type ASC, sprint ASC, status ASC
  - type ASC, year ASC, priority DESC
  - type ASC, epic ASC
  - tags ARRAY_CONTAINS, type ASC, year ASC   // For tag filtering

// Collection group index (cross-project queries)
cards:
  - type ASC, developer.id ASC, status ASC   // For WIP page
```

## Counter Strategy

```typescript
// /counters/{projectId}
interface ProjectCounters {
  task: number;     // Next task number
  bug: number;
  epic: number;
  sprint: number;
  proposal: number;
  qa: number;
}

// Atomic increment on card creation:
await updateDoc(counterRef, {
  [cardType]: increment(1)
});
```

## Migration Script (V1 RTDB → V2 Firestore)

Strategy for the switchover weekend:

1. Export V1 RTDB as JSON
2. Transform: flatten card paths → subcollection structure, decode emails → uids, calculate derived fields
3. Import to new Firebase project
4. Verify counts match
5. Switch DNS/config to point to new project
6. Keep V1 read-only as backup for 30 days

Key transformations:
- `/cards/{projectId}/TASKS_{projectId}/{fbId}` → `/projects/{projectId}/cards/{cardId}`
- `/data/developers/{devId}` → per-project `/projects/{pid}/team/{memberId}`
- Email-encoded paths → uid-based paths
- `priority: "Medium"` (string on bugs) stays, `priority: 150` (calculated on tasks) recalculated

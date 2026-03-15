# Planning Game V2 — Clean Architecture

## Overview

This document defines the Clean Architecture adaptation for Planning Game V2, a complete rewrite of an agile project management application following eXtreme Programming (XP) methodology.

The architecture enforces strict separation of concerns across four layers, ensuring that business logic remains pure, testable, and independent of frameworks and infrastructure.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                              │
│  SPA shell (Astro) + Lit views + reusable Lit web components        │
│  Responsive (mobile-first) + PWA                                    │
├─────────────────────────────────────────────────────────────────────┤
│                     APPLICATION LAYER                               │
│  Use cases + signals store                                          │
│  Orchestrates domain logic, manages reactive state                  │
├─────────────────────────────────────────────────────────────────────┤
│                     DOMAIN LAYER                                    │
│  Entities + value objects + domain services + ports                  │
│  ZERO external dependencies — pure JavaScript                       │
├─────────────────────────────────────────────────────────────────────┤
│                     INFRASTRUCTURE LAYER                            │
│  Firebase adapters (Firestore, Auth, FCM, Storage)                  │
│  Implements domain ports                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technologies |
|-------|-------------|
| Presentation | Astro 5 (shell + static), Lit 3 (SPA views + reusable components), CSS Layers + Design Tokens, PWA |
| Application | @lit-labs/signals, Zod |
| Domain | Pure JavaScript (JSDoc + d.ts) |
| Infrastructure | Firebase (Auth, Firestore, Cloud Functions, Storage, FCM) |
| Testing | Vitest (unit/integration), Playwright (E2E) |

---

## The Dependency Rule

Dependencies point **inward**. Outer layers depend on inner layers, never the reverse.

```
  Presentation ──► Application ──► Domain ◄── Infrastructure
       │                │              ▲            │
       │                │              │            │
       │                │              └────────────┘
       │                │           Infrastructure implements
       │                │           domain ports (interfaces)
       │                │
       │                └── Uses domain services + ports
       │
       └── Reads signals, calls use cases
```

**Critical rules:**

1. **Domain** has ZERO external dependencies. No Firebase, no Lit, no signals, no Zod. Pure JavaScript functions and type definitions.
2. **Application** depends on Domain. Uses ports (interfaces defined in Domain). Manages signals and state. Orchestrates use cases.
3. **Infrastructure** implements Domain ports with concrete Firebase adapters. Depends on Domain, never on Application or Presentation.
4. **Presentation** depends on Application (reads signals, calls use cases). Never imports from Infrastructure directly.

---

## Domain Layer

The innermost layer. Contains entities, value objects, domain services, and port definitions. Everything here is a pure JavaScript function or a TypeScript type definition (`.d.ts`). No side effects, no I/O, no framework code.

### Entities

All entity types are defined in `.d.ts` files for editor IntelliSense and documentation, with no runtime overhead.

#### Card (Discriminated Union)

Cards are the core domain entity. All card types share a `BaseCard` structure and are discriminated by the `type` field.

```typescript
// domain/entities/card.d.ts

type CardType = 'task' | 'bug' | 'epic' | 'sprint' | 'proposal' | 'qa';

interface BaseCard {
  cardId: string;                   // e.g., "PLN-TSK-0042" — human-readable, immutable
  type: CardType;
  title: string;
  description: string;
  status: string;
  year: number;
  epic?: string;                    // epic cardId reference
  sprint?: string;                  // sprint cardId reference
  createdAt: Timestamp;
  createdBy: string;                // uid
  updatedAt: Timestamp;
  updatedBy: string;                // uid
  notes?: string;
  tags?: string[];                  // e.g., ["INFRA", "REFACTOR"]
}

type Card = Task | Bug | Epic | Sprint | Proposal | QA;
```

#### Task

```typescript
interface Task extends BaseCard {
  type: 'task';
  status: 'To Do' | 'In Progress' | 'Pausado' | 'To Validate'
        | 'Done' | 'Done&Validated' | 'Blocked' | 'Reopened';

  userStory: {
    role: string;                   // Como...
    goal: string;                   // Quiero...
    benefit: string;                // Para...
  };

  // ONLY structured format — no plain text acceptanceCriteria
  acceptanceCriteriaStructured: Array<{
    given: string;
    when: string;
    then: string;
  }>;

  devPoints: number;                // 1-5 or fibonacci
  businessPoints: number;           // 1-5 or fibonacci
  // priority is NEVER stored — always calculated dynamically
  // via Priority value object: calculatePriority(devPoints, businessPoints, scoringSystem)

  developer?: TeamMemberRef;
  codeveloper?: TeamMemberRef;
  validator?: TeamMemberRef;
  covalidator?: TeamMemberRef;

  startDate?: Timestamp;            // IMMUTABLE — set once on first "In Progress", never changes
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

  // Tracks each In Progress → pause/complete cycle
  workCycles?: Array<{
    startedAt: Timestamp;
    endedAt?: Timestamp;
    durationMs?: number;
  }>;
  totalWorkMs?: number;

  blockedBy?: Array<{
    type: 'business' | 'development';
    why: string;
    who: string;
  }>;

  aiUsage?: Array<{
    sessionId: string;
    model: string;
    action: string;
    timestamp: Timestamp;
    durationMinutes: number;
  }>;
}
```

#### Bug

```typescript
interface Bug extends BaseCard {
  type: 'bug';
  status: 'Created' | 'Assigned' | 'Fixed' | 'Verified' | 'Closed';

  bugPriority: 'APPLICATION BLOCKER'
             | 'DEPARTMENT BLOCKER'
             | 'INDIVIDUAL BLOCKER'
             | 'USER EXPERIENCE ISSUE'
             | 'WORKFLOW IMPROVEMENT'
             | 'WORKAROUND AVAILABLE ISSUE';

  developer?: TeamMemberRef;
  validator?: TeamMemberRef;
  commits?: Commit[];
  pipeline?: Pipeline;
  attachments?: string[];           // Storage paths

  rootCause?: string;
  resolution?: string;
}
```

#### Epic

```typescript
interface Epic extends BaseCard {
  type: 'epic';
  status: 'Active' | 'Completed' | 'Archived';
  color?: string;                   // For Gantt visualization
  // CRUD restricted to admin/superadmin only (enforced by PermissionService)
}
```

#### Sprint

```typescript
interface Sprint extends BaseCard {
  type: 'sprint';
  startDate: Timestamp;             // required
  endDate: Timestamp;               // required
  locked: boolean;                  // immutable when cards in progress
  goals?: string[];
}
```

#### Proposal

```typescript
interface Proposal extends BaseCard {
  type: 'proposal';
  status: 'Pending' | 'Planned' | 'Rejected';
  userStory?: UserStory;
  convertedToTaskId?: string;       // if converted to task
}
```

#### QA

```typescript
interface QA extends BaseCard {
  type: 'qa';
  status: 'Pending' | 'Passed' | 'Failed';
  suite: string;
  steps: string[];
  expectedResult: string;
  actualResult?: string;
}
```

#### Project

```typescript
// domain/entities/project.d.ts

interface Project {
  name: string;
  abbreviation: string;             // e.g., "PLN" — used for card IDs
  description?: string;
  repoUrl?: string;
  scoringSystem: '1-5' | 'fibonacci';
  archived: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  createdBy: string;                // uid
  updatedAt: Timestamp;

  // Denormalized counters (source of truth: team subcollection)
  developerCount: number;
  stakeholderCount: number;
}
```

#### TagRegistry (per project)

```typescript
interface TagRegistry {
  tags: Array<{
    name: string;                   // e.g., "INFRA", "SW", "TESTS"
    color: string;                  // hex color for badge, e.g., "#6366f1"
    description?: string;           // optional tooltip
  }>;
}
```

#### User

```typescript
// domain/entities/user.d.ts

interface User {
  name: string;
  email: string;
  photoUrl?: string;
  role: 'superadmin' | 'user';
  projects: Record<string, 'admin' | 'developer' | 'stakeholder' | 'consultant'>;
  preferences: {
    theme: 'system' | 'light' | 'dark';
    defaultYear: number;
    locale: string;
  };
}
```

#### TeamMember and TeamMemberRef

```typescript
interface TeamMember {
  uid?: string;                     // Firebase Auth uid (if registered)
  name: string;
  email: string;
  role: 'developer' | 'stakeholder' | 'both';
  active: boolean;
}

// Denormalized on cards to avoid joins
interface TeamMemberRef {
  id: string;                       // team member doc ID
  name: string;
  email: string;
}
```

---

### Value Objects

Pure functions with no side effects. Encapsulate domain concepts that have no identity of their own.

#### CardId

Generates human-readable card identifiers and manages type/project abbreviation mapping.

```javascript
// domain/value-objects/card-id.js

/**
 * Type abbreviation map.
 * @type {Record<import('../entities/card').CardType, string>}
 */
const TYPE_ABBREVIATIONS = {
  task: 'TSK',
  bug: 'BUG',
  epic: 'PCS',
  sprint: 'SPR',
  proposal: 'PRP',
  qa: 'QAS',
};

/**
 * Fixed project abbreviation exceptions.
 * V1 algorithm must be preserved exactly for migration compatibility.
 * @type {Record<string, string>}
 */
const PROJECT_EXCEPTIONS = {
  'CINEMA4D': 'C4D',
  'PLANNING-GAME': 'PLN',
  'BUGS': 'BUG',
  // ... additional V1 exceptions
};

/**
 * Generates a card ID in format "{PROJECT}-{TYPE}-{NUMBER}".
 *
 * @param {string} abbreviation - Project abbreviation (e.g., "PLN")
 * @param {import('../entities/card').CardType} type - Card type
 * @param {number} nextNumber - Sequential number from counter
 * @returns {string} e.g., "PLN-TSK-0042"
 */
export function generateCardId(abbreviation, type, nextNumber) {
  const typeAbbr = getTypeAbbreviation(type);
  const paddedNumber = String(nextNumber).padStart(4, '0');
  return `${abbreviation}-${typeAbbr}-${paddedNumber}`;
}

/**
 * Returns the abbreviation for a card type.
 *
 * @param {import('../entities/card').CardType} type
 * @returns {string}
 */
export function getTypeAbbreviation(type) {
  const abbr = TYPE_ABBREVIATIONS[type];
  if (!abbr) {
    throw new Error(`Unknown card type: ${type}`);
  }
  return abbr;
}

/**
 * Derives project abbreviation from project name.
 * Uses V1 consonant extraction algorithm with fixed exceptions
 * for migration compatibility.
 *
 * @param {string} name - Project name
 * @returns {string} Abbreviation (e.g., "PLN")
 */
export function getProjectAbbreviation(name) {
  const normalized = name.toUpperCase().replace(/\s+/g, '-');
  if (PROJECT_EXCEPTIONS[normalized]) {
    return PROJECT_EXCEPTIONS[normalized];
  }
  // V1 consonant extraction algorithm
  // ... (must match V1 exactly)
}
```

#### Priority

Encapsulates the priority calculation algorithm. Priority is NEVER stored on cards; it is always computed dynamically.

```javascript
// domain/value-objects/priority.js

/**
 * Calculates dynamic priority from devPoints and businessPoints.
 * Higher businessPoints and lower devPoints result in higher priority (lower number = higher priority).
 *
 * @param {number} devPoints - Development effort (1-5 or fibonacci)
 * @param {number} businessPoints - Business value (1-5 or fibonacci)
 * @param {'1-5' | 'fibonacci'} scoringSystem - Project scoring system
 * @returns {number} Priority rank (1 = highest priority)
 */
export function calculatePriority(devPoints, businessPoints, scoringSystem) {
  if (!devPoints || !businessPoints) return Infinity;

  const ratio = (businessPoints / devPoints) * 100;
  const combinations = getPriorityCombinations(scoringSystem);
  const rank = combinations.findIndex(c => c.ratio === ratio);
  return rank >= 0 ? rank + 1 : combinations.length + 1;
}

/**
 * Returns all possible dev/business point combinations sorted by priority.
 * Used for priority ranking and UI display.
 *
 * @param {'1-5' | 'fibonacci'} scoringSystem
 * @returns {Array<{dev: number, bus: number, ratio: number, rank: number}>}
 */
export function getPriorityCombinations(scoringSystem) {
  const scale = scoringSystem === 'fibonacci'
    ? [1, 2, 3, 5, 8]
    : [1, 2, 3, 4, 5];

  const combinations = [];
  for (const bus of scale) {
    for (const dev of scale) {
      combinations.push({ dev, bus, ratio: (bus / dev) * 100 });
    }
  }

  // Sort descending by ratio (highest business value per dev effort first)
  combinations.sort((a, b) => b.ratio - a.ratio);

  // Assign rank (1-based)
  return combinations.map((c, i) => ({ ...c, rank: i + 1 }));
}
```

#### WorkCycle

Tracks time spent in "In Progress" state across pause/resume cycles.

```javascript
// domain/value-objects/work-cycle.js

/**
 * @typedef {Object} WorkCycle
 * @property {Timestamp} startedAt
 * @property {Timestamp} [endedAt]
 * @property {number} [durationMs]
 */

/**
 * Starts a new work cycle. Appends an open cycle to the existing list.
 * Throws if there is already an open cycle (no endedAt).
 *
 * @param {WorkCycle[]} existingCycles - Current work cycles
 * @param {Timestamp} now - Current timestamp
 * @returns {WorkCycle[]} Updated cycles with new open entry
 */
export function startCycle(existingCycles, now) {
  const cycles = existingCycles ?? [];
  const openCycle = cycles.find(c => !c.endedAt);
  if (openCycle) {
    throw new Error('Cannot start a new cycle: there is already an open cycle');
  }
  return [...cycles, { startedAt: now }];
}

/**
 * Ends the last open work cycle. Sets endedAt and calculates durationMs.
 * Throws if there is no open cycle.
 *
 * @param {WorkCycle[]} existingCycles - Current work cycles
 * @param {Timestamp} now - Current timestamp
 * @returns {WorkCycle[]} Updated cycles with last entry closed
 */
export function endCycle(existingCycles, now) {
  const cycles = existingCycles ?? [];
  const lastIndex = cycles.findLastIndex(c => !c.endedAt);
  if (lastIndex === -1) {
    throw new Error('Cannot end cycle: no open cycle found');
  }

  const updated = [...cycles];
  const startMs = updated[lastIndex].startedAt.toMillis();
  const endMs = now.toMillis();
  updated[lastIndex] = {
    ...updated[lastIndex],
    endedAt: now,
    durationMs: endMs - startMs,
  };
  return updated;
}

/**
 * Calculates total work time across all completed cycles.
 *
 * @param {WorkCycle[]} cycles
 * @returns {number} Total milliseconds worked
 */
export function calculateTotalWorkMs(cycles) {
  if (!cycles) return 0;
  return cycles.reduce((total, cycle) => total + (cycle.durationMs ?? 0), 0);
}
```

---

### Domain Services

Pure functions that encode core business rules. No I/O, no framework dependencies. Fully testable with plain unit tests.

#### TransitionService

Defines all valid status transitions and their requirements. This is the single source of truth for "what transitions are allowed and what fields are needed."

```javascript
// domain/services/transitions.js

/**
 * @typedef {Object} TransitionResult
 * @property {boolean} allowed
 * @property {string} [reason]
 * @property {string[]} [missing] - Missing required fields
 */

/**
 * Task status transition rules.
 * Key = fromStatus, value = map of targetStatus → requirements.
 */
const TASK_TRANSITIONS = {
  'To Do': {
    'In Progress': {
      requiredFields: [
        'developer', 'validator', 'epic', 'sprint',
        'devPoints', 'businessPoints', 'acceptanceCriteriaStructured',
      ],
    },
    'Blocked': {
      requiredFields: ['blockedBy'],
      validate: (card) => card.blockedBy?.length > 0
        ? null
        : 'blockedBy must have at least one entry',
    },
  },
  'In Progress': {
    'Pausado': { requiredFields: [] },
    'To Validate': { requiredFields: ['startDate', 'commits'] },
    'Blocked': { requiredFields: ['blockedBy'] },
    'To Do': { requiredFields: [] },
  },
  'Pausado': {
    'In Progress': { requiredFields: [] },
    'To Do': { requiredFields: [] },
    'Blocked': { requiredFields: ['blockedBy'] },
  },
  'To Validate': {
    'Done': { requiredFields: [], validatorOnly: true },
    'Done&Validated': { requiredFields: [], validatorOnly: true },
    'Reopened': { requiredFields: [], validatorOnly: true },
  },
  'Done': {
    'Done&Validated': { requiredFields: [], validatorOnly: true },
  },
  'Reopened': {
    'In Progress': { requiredFields: ['developer'] },
    'To Do': { requiredFields: [] },
  },
  'Blocked': {
    'To Do': { requiredFields: [] },
    'In Progress': { requiredFields: ['developer'] },
  },
};

/**
 * Bug status transition rules.
 */
const BUG_TRANSITIONS = {
  'Created': {
    'Assigned': { requiredFields: ['developer'] },
  },
  'Assigned': {
    'Fixed': { requiredFields: ['commits'] },
    'Created': { requiredFields: [] },
  },
  'Fixed': {
    'Verified': { requiredFields: [], validatorOnly: true },
    'Assigned': { requiredFields: [] },
  },
  'Verified': {
    'Closed': { requiredFields: ['rootCause', 'resolution'] },
  },
};

/**
 * All transition rules indexed by card type.
 */
const TRANSITION_RULES = {
  task: TASK_TRANSITIONS,
  bug: BUG_TRANSITIONS,
  epic: { /* Active ↔ Completed ↔ Archived */ },
  sprint: { /* no status transitions — locked/unlocked only */ },
  proposal: { /* Pending → Planned | Rejected */ },
  qa: { /* Pending → Passed | Failed */ },
};

/**
 * Checks whether a card can transition to a target status.
 *
 * @param {import('../entities/card').Card} card - Current card state
 * @param {string} targetStatus - Desired target status
 * @param {import('../entities/user').User} user - User attempting the transition
 * @returns {TransitionResult}
 */
export function canTransition(card, targetStatus, user) {
  const rules = TRANSITION_RULES[card.type];
  if (!rules) {
    return { allowed: false, reason: `No transition rules for type: ${card.type}` };
  }

  const fromRules = rules[card.status];
  if (!fromRules) {
    return { allowed: false, reason: `No transitions from status: ${card.status}` };
  }

  const transition = fromRules[targetStatus];
  if (!transition) {
    return {
      allowed: false,
      reason: `Invalid transition: ${card.status} → ${targetStatus}`,
    };
  }

  // Check required fields
  const missing = transition.requiredFields.filter(field => {
    const value = card[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return { allowed: false, missing };
  }

  // Custom validation
  if (transition.validate) {
    const error = transition.validate(card);
    if (error) return { allowed: false, reason: error };
  }

  return { allowed: true };
}

/**
 * Returns all valid target statuses for a card given the current user.
 *
 * @param {import('../entities/card').Card} card
 * @param {import('../entities/user').User} user
 * @returns {string[]}
 */
export function getAvailableTransitions(card, user) {
  const rules = TRANSITION_RULES[card.type];
  if (!rules) return [];

  const fromRules = rules[card.status];
  if (!fromRules) return [];

  return Object.keys(fromRules);
}

/**
 * Returns the list of required fields for a specific transition.
 *
 * @param {import('../entities/card').CardType} type
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {string[]}
 */
export function getRequiredFields(type, fromStatus, toStatus) {
  const transition = TRANSITION_RULES[type]?.[fromStatus]?.[toStatus];
  return transition?.requiredFields ?? [];
}

/**
 * Checks if a transition requires validator permissions.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function isValidatorAction(fromStatus, toStatus) {
  // All transitions FROM "To Validate" and "Done" → "Done&Validated"
  // require the assigned validator or co-validator
  const validatorTransitions = [
    ['To Validate', 'Done'],
    ['To Validate', 'Done&Validated'],
    ['To Validate', 'Reopened'],
    ['Done', 'Done&Validated'],
    ['Fixed', 'Verified'],
  ];
  return validatorTransitions.some(
    ([from, to]) => from === fromStatus && to === toStatus
  );
}
```

**Complete task transition diagram:**

```
                          ┌──────────┐
                    ┌────►│ Blocked  │◄────────────────────┐
                    │     └────┬─────┘                     │
                    │          │                            │
                    │     To Do / In Progress               │
                    │          │                            │
                    │          ▼                            │
               ┌────┴───┐         ┌─────────────┐    ┌────┴────────┐
           ┌──►│ To Do  ├────────►│ In Progress ├───►│  Pausado    │
           │   └────┬───┘         └──────┬──────┘    └─────┬───────┘
           │        ▲                    │                  │
           │        │                    │          In Progress / To Do
           │        │                    ▼                  │
           │   ┌────┴─────┐      ┌──────┴───────┐         │
           │   │ Reopened │◄─────┤ To Validate  │◄────────┘
           │   └──────────┘      └──────┬───────┘
           │                            │
           │                    VALIDATOR ONLY
           │                            │
           │                   ┌────────┴────────┐
           │                   ▼                  ▼
           │            ┌──────────┐    ┌────────────────┐
           └────────────┤   Done   ├───►│ Done&Validated │
                        └──────────┘    └────────────────┘
                                    VALIDATOR ONLY
```

#### PermissionService

Pure functions for role-based access control. No framework dependencies.

```javascript
// domain/services/permissions.js

/**
 * @typedef {'superadmin'|'admin'|'developer'|'stakeholder'|'consultant'|null} ProjectRole
 */

/**
 * Gets the user's role within a specific project.
 *
 * @param {import('../entities/user').User} user
 * @param {string} projectId
 * @returns {ProjectRole}
 */
export function getUserRole(user, projectId) {
  if (user.role === 'superadmin') return 'superadmin';
  return user.projects?.[projectId] ?? null;
}

/**
 * Checks if a user can edit a card.
 *
 * @param {import('../entities/card').Card} card
 * @param {import('../entities/user').User} user
 * @param {import('../entities/project').Project} project
 * @returns {boolean}
 */
export function canEditCard(card, user, project) {
  const role = getUserRole(user, project.name);
  if (!role) return false;
  if (role === 'superadmin' || role === 'admin') return true;
  if (role === 'consultant') return false;

  // Developers can edit cards assigned to them
  if (role === 'developer') {
    return card.developer?.email === user.email
        || card.codeveloper?.email === user.email;
  }

  // Stakeholders can edit cards they validate
  if (role === 'stakeholder') {
    return card.validator?.email === user.email
        || card.covalidator?.email === user.email;
  }

  return false;
}

/**
 * Checks if a user can delete a card.
 * Only admin and superadmin can delete.
 *
 * @param {import('../entities/card').Card} card
 * @param {import('../entities/user').User} user
 * @param {import('../entities/project').Project} project
 * @returns {boolean}
 */
export function canDeleteCard(card, user, project) {
  const role = getUserRole(user, project.name);
  return role === 'superadmin' || role === 'admin';
}

/**
 * Checks if a user can change a card's status to a target status.
 * Validator-only transitions require the assigned validator or co-validator.
 *
 * @param {import('../entities/card').Card} card
 * @param {string} targetStatus
 * @param {import('../entities/user').User} user
 * @param {import('../entities/project').Project} project
 * @returns {boolean}
 */
export function canChangeStatus(card, targetStatus, user, project) {
  const role = getUserRole(user, project.name);
  if (!role || role === 'consultant') return false;
  if (role === 'superadmin') return true;

  if (isValidatorAction(card.status, targetStatus)) {
    return card.validator?.email === user.email
        || card.covalidator?.email === user.email;
  }

  return canEditCard(card, user, project);
}

/**
 * Checks if a user can assign developers to cards.
 * Only admin/superadmin can assign others; developers can only self-assign.
 *
 * @param {import('../entities/user').User} user
 * @param {import('../entities/project').Project} project
 * @returns {boolean}
 */
export function canAssignDeveloper(user, project) {
  const role = getUserRole(user, project.name);
  return role === 'superadmin' || role === 'admin';
}

/**
 * Checks if a user can edit cards from a past year.
 * Only superadmin can edit past year data.
 *
 * @param {import('../entities/card').Card} card
 * @param {import('../entities/user').User} user
 * @returns {boolean}
 */
export function canEditPastYear(card, user) {
  const currentYear = new Date().getFullYear();
  if (card.year >= currentYear) return true;
  return user.role === 'superadmin';
}

/**
 * Checks if a user can manage epics (create, edit, delete).
 * Only admin and superadmin.
 *
 * @param {import('../entities/user').User} user
 * @param {import('../entities/project').Project} project
 * @returns {boolean}
 */
export function canManageEpics(user, project) {
  const role = getUserRole(user, project.name);
  return role === 'superadmin' || role === 'admin';
}
```

#### FilterService

Pure filtering logic for cards. Used by the application layer's computed signals.

```javascript
// domain/services/filters.js

/**
 * @typedef {Object} FilterState
 * @property {string} [search] - Free text search
 * @property {string[]} [statuses] - Status filter
 * @property {string[]} [types] - Card type filter
 * @property {string} [developer] - Developer ID filter
 * @property {string} [sprint] - Sprint cardId filter
 * @property {string} [epic] - Epic cardId filter
 * @property {string[]} [tags] - Tag filter
 * @property {'AND' | 'OR'} [tagMode] - Tag matching mode
 * @property {number} [year] - Year filter
 */

/**
 * Applies all active filters to a list of cards.
 *
 * @param {import('../entities/card').Card[]} cards
 * @param {FilterState} filters
 * @returns {import('../entities/card').Card[]}
 */
export function applyFilters(cards, filters) {
  return cards.filter(card => {
    if (filters.types?.length && !filters.types.includes(card.type)) return false;
    if (filters.statuses?.length && !filters.statuses.includes(card.status)) return false;
    if (filters.year && card.year !== filters.year) return false;
    if (filters.developer && card.developer?.id !== filters.developer) return false;
    if (filters.sprint && card.sprint !== filters.sprint) return false;
    if (filters.epic && card.epic !== filters.epic) return false;
    if (filters.tags?.length && !matchesTags(card, filters.tags, filters.tagMode ?? 'OR')) return false;
    if (filters.search && !matchesSearch(card, filters.search)) return false;
    return true;
  });
}

/**
 * Checks if a card matches a free text search term.
 * Searches in cardId, title, and description.
 *
 * @param {import('../entities/card').Card} card
 * @param {string} term
 * @returns {boolean}
 */
export function matchesSearch(card, term) {
  const lower = term.toLowerCase();
  return card.cardId.toLowerCase().includes(lower)
      || card.title.toLowerCase().includes(lower)
      || (card.description ?? '').toLowerCase().includes(lower);
}

/**
 * Checks if a card matches tag filters with AND or OR logic.
 *
 * @param {import('../entities/card').Card} card
 * @param {string[]} tags
 * @param {'AND' | 'OR'} mode
 * @returns {boolean}
 */
export function matchesTags(card, tags, mode) {
  const cardTags = card.tags ?? [];
  if (mode === 'AND') {
    return tags.every(tag => cardTags.includes(tag));
  }
  return tags.some(tag => cardTags.includes(tag));
}

/**
 * Returns valid statuses for a given card type.
 * Includes 'Pausado' for tasks.
 *
 * @param {import('../entities/card').CardType} type
 * @returns {string[]}
 */
export function getStatusesForType(type) {
  const statuses = {
    task: ['To Do', 'In Progress', 'Pausado', 'To Validate', 'Done', 'Done&Validated', 'Blocked', 'Reopened'],
    bug: ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed'],
    epic: ['Active', 'Completed', 'Archived'],
    sprint: [],
    proposal: ['Pending', 'Planned', 'Rejected'],
    qa: ['Pending', 'Passed', 'Failed'],
  };
  return statuses[type] ?? [];
}
```

---

### Ports (Contracts)

Ports define the interfaces that the infrastructure layer must implement. They are defined as `.d.ts` files so they carry no runtime weight but provide full editor IntelliSense.

The domain layer references these ports via JSDoc `@param` and `@returns` annotations. The application layer consumes them. The infrastructure layer implements them.

#### CardRepository

```typescript
// domain/ports/card-repository.d.ts

import { Card, CardType } from '../entities/card';

interface QueryFilters {
  type?: CardType;
  status?: string;
  year?: number;
  developer?: string;
  sprint?: string;
  epic?: string;
}

interface CardRepository {
  getCards(projectId: string, filters?: QueryFilters): Promise<Card[]>;
  getCard(projectId: string, cardId: string): Promise<Card | null>;
  saveCard(projectId: string, card: Card): Promise<void>;
  deleteCard(projectId: string, cardId: string): Promise<void>;
  getNextCardNumber(projectId: string, type: CardType): Promise<number>;
  moveToTrash(projectId: string, cardId: string): Promise<void>;
  restoreFromTrash(projectId: string, cardId: string): Promise<void>;
}
```

#### ProjectRepository

```typescript
// domain/ports/project-repository.d.ts

import { Project } from '../entities/project';

interface ProjectRepository {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  archiveProject(id: string): Promise<void>;
}
```

#### TeamRepository

```typescript
// domain/ports/team-repository.d.ts

import { TeamMember, TagRegistry } from '../entities/card';

interface TeamRepository {
  getTeam(projectId: string): Promise<TeamMember[]>;
  addMember(projectId: string, member: TeamMember): Promise<void>;
  removeMember(projectId: string, memberId: string): Promise<void>;
  getTagRegistry(projectId: string): Promise<TagRegistry>;
  saveTagRegistry(projectId: string, tags: TagRegistry): Promise<void>;
}
```

#### UserRepository

```typescript
// domain/ports/user-repository.d.ts

import { User } from '../entities/user';

interface UserRepository {
  getUser(uid: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  getUsers(): Promise<User[]>;
  deleteUser(uid: string): Promise<void>;
}
```

#### NotificationRepository

```typescript
// domain/ports/notification-repository.d.ts

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'action';
  read: boolean;
  cardRef?: string;
  createdAt: Timestamp;
}

interface NotificationRepository {
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  markAsRead(userId: string, notifId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
}
```

#### HistoryRepository

```typescript
// domain/ports/history-repository.d.ts

interface HistoryEntry {
  timestamp: Timestamp;
  changedBy: string;
  changedByName: string;
  changes: Record<string, { from: any; to: any }>;
}

interface HistoryRepository {
  addEntry(projectId: string, cardId: string, entry: HistoryEntry): Promise<void>;
  getHistory(projectId: string, cardId: string): Promise<HistoryEntry[]>;
}
```

#### StateTransitionRepository

```typescript
// domain/ports/state-transition-repository.d.ts

interface StateTransition {
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  changedAt: Timestamp;
  durationInPreviousStatus?: number;
}

interface MetricFilters {
  year?: number;
  sprint?: string;
  developer?: string;
  type?: string;
}

interface TransitionMetrics {
  avgCycleTime: Record<string, number>;
  transitionCounts: Record<string, number>;
  bottlenecks: Array<{ status: string; avgDuration: number }>;
}

interface StateTransitionRepository {
  recordTransition(projectId: string, cardId: string, transition: StateTransition): Promise<void>;
  getTransitions(projectId: string, cardId: string): Promise<StateTransition[]>;
  getMetrics(projectId: string, filters?: MetricFilters): Promise<TransitionMetrics>;
}
```

#### BacklogRepository

```typescript
// domain/ports/backlog-repository.d.ts

interface BacklogEntry {
  cardId: string;
  projectId: string;
  cardType: string;
  title: string;
  status: string;
}

interface BacklogRepository {
  getBacklog(developerId: string): Promise<BacklogEntry[]>;
  reorderBacklog(developerId: string, orderedCardIds: string[]): Promise<void>;
  addToBacklog(developerId: string, entry: BacklogEntry): Promise<void>;
  removeFromBacklog(developerId: string, cardId: string): Promise<void>;
}
```

#### AuthPort

```typescript
// domain/ports/auth-port.d.ts

interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

type Unsubscribe = () => void;

interface AuthPort {
  signInWithGoogle(): Promise<AuthUser>;
  signInWithMicrosoft(): Promise<AuthUser>;
  signOut(): Promise<void>;
  onAuthStateChanged(callback: (user: AuthUser | null) => void): Unsubscribe;
  getCurrentUser(): AuthUser | null;
}
```

#### RealtimePort

```typescript
// domain/ports/realtime-port.d.ts

import { Card } from '../entities/card';
import { Notification } from './notification-repository';

type Unsubscribe = () => void;

interface RealtimePort {
  subscribeToCards(projectId: string, onUpdate: (cards: Card[]) => void): Unsubscribe;
  subscribeToCard(projectId: string, cardId: string, onUpdate: (card: Card) => void): Unsubscribe;
  subscribeToNotifications(userId: string, onUpdate: (notifs: Notification[]) => void): Unsubscribe;
}
```

#### Additional Ports

`PlanRepository`, `AdrRepository`, and `GlobalConfigRepository` follow the same CRUD pattern:

```typescript
// domain/ports/plan-repository.d.ts
interface PlanRepository {
  getPlans(projectId: string): Promise<Plan[]>;
  getPlan(projectId: string, planId: string): Promise<Plan | null>;
  savePlan(projectId: string, plan: Plan): Promise<void>;
  deletePlan(projectId: string, planId: string): Promise<void>;
}

// domain/ports/adr-repository.d.ts
interface AdrRepository {
  getAdrs(projectId: string): Promise<ADR[]>;
  getAdr(projectId: string, adrId: string): Promise<ADR | null>;
  saveAdr(projectId: string, adr: ADR): Promise<void>;
  deleteAdr(projectId: string, adrId: string): Promise<void>;
}

// domain/ports/global-config-repository.d.ts
interface GlobalConfigRepository {
  getConfigs(type?: string): Promise<GlobalConfig[]>;
  getConfig(type: string, configId: string): Promise<GlobalConfig | null>;
  saveConfig(config: GlobalConfig): Promise<void>;
  deleteConfig(type: string, configId: string): Promise<void>;
}
```

---

## Application Layer

The application layer orchestrates domain logic and manages reactive state. It depends on the domain layer (entities, services, ports) and uses `@lit-labs/signals` for reactive state management. Use cases are the entry points for all operations.

### Application Store (Signals)

The store is the single source of truth for UI state. All components read from signals; all mutations go through use cases that update signals after successful persistence.

```javascript
// application/store.js

import { signal, computed } from '@lit-labs/signals';
import { applyFilters } from '../domain/services/filters.js';

/** @type {import('@lit-labs/signals').Signal<import('../domain/entities/user').User | null>} */
export const authUser = signal(null);

/** @type {import('@lit-labs/signals').Signal<import('../domain/entities/project').Project | null>} */
export const currentProject = signal(null);

/** @type {import('@lit-labs/signals').Signal<import('../domain/entities/card').Card | null>} */
export const currentCard = signal(null);

/** @type {import('@lit-labs/signals').Signal<boolean>} */
export const panelOpen = signal(false);

/** @type {import('@lit-labs/signals').Signal<import('../domain/entities/project').Project[]>} */
export const projects = signal([]);

/** @type {import('@lit-labs/signals').Signal<import('../domain/entities/card').Card[]>} */
export const cards = signal([]);

/** @type {import('@lit-labs/signals').Signal<import('../domain/services/filters').FilterState>} */
export const filters = signal({});

/**
 * Derived signal: cards filtered by active filters.
 * Automatically recomputes when `cards` or `filters` change.
 */
export const filteredCards = computed(() =>
  applyFilters(cards.value, filters.value)
);

/** @type {import('@lit-labs/signals').Signal<import('../domain/ports/notification-repository').Notification[]>} */
export const notifications = signal([]);

/** Derived: count of unread notifications */
export const unreadCount = computed(() =>
  notifications.value.filter(n => !n.read).length
);

/** @type {import('@lit-labs/signals').Signal<'system' | 'light' | 'dark'>} */
export const theme = signal('system');
```

### Use Cases

Each use case is a class that receives its dependencies (ports) via constructor injection. This makes them testable with mock repositories.

#### CreateCard

```javascript
// application/use-cases/create-card.js

import { generateCardId } from '../../domain/value-objects/card-id.js';
import { canEditCard, canManageEpics } from '../../domain/services/permissions.js';

/**
 * @typedef {Object} CreateCardDeps
 * @property {import('../../domain/ports/card-repository').CardRepository} cardRepository
 * @property {import('../../domain/ports/history-repository').HistoryRepository} historyRepository
 * @property {import('../../domain/ports/backlog-repository').BacklogRepository} backlogRepository
 */

export class CreateCard {
  /** @param {CreateCardDeps} deps */
  constructor(deps) {
    this._cardRepo = deps.cardRepository;
    this._historyRepo = deps.historyRepository;
    this._backlogRepo = deps.backlogRepository;
  }

  /**
   * Creates a new card.
   *
   * 1. Validate with Zod schema
   * 2. Check permissions
   * 3. Generate cardId
   * 4. Save via CardRepository
   * 5. Add to developer backlog if applicable
   * 6. Record in history
   *
   * @param {string} projectId
   * @param {Partial<import('../../domain/entities/card').Card>} data
   * @param {import('../../domain/entities/user').User} user
   * @param {import('../../domain/entities/project').Project} project
   * @returns {Promise<import('../../domain/entities/card').Card>}
   */
  async execute(projectId, data, user, project) {
    // 1. Validate
    // cardSchema.parse(data) — Zod validation

    // 2. Check permissions
    if (data.type === 'epic' && !canManageEpics(user, project)) {
      throw new Error('Only admin/superadmin can create epics');
    }

    // 3. Generate cardId
    const nextNumber = await this._cardRepo.getNextCardNumber(projectId, data.type);
    const cardId = generateCardId(project.abbreviation, data.type, nextNumber);

    const card = {
      ...data,
      cardId,
      createdAt: new Date(),
      createdBy: user.email,
      updatedAt: new Date(),
      updatedBy: user.email,
    };

    // 4. Save
    await this._cardRepo.saveCard(projectId, card);

    // 5. Add to backlog if developer assigned and status is "To Do"
    if (card.developer && card.status === 'To Do') {
      await this._backlogRepo.addToBacklog(card.developer.id, {
        cardId: card.cardId,
        projectId,
        cardType: card.type,
        title: card.title,
        status: card.status,
      });
    }

    // 6. Record history
    await this._historyRepo.addEntry(projectId, card.cardId, {
      timestamp: new Date(),
      changedBy: user.email,
      changedByName: user.name,
      changes: { _created: { from: null, to: card.cardId } },
    });

    return card;
  }
}
```

#### ChangeStatus

The most complex use case. Handles WIP enforcement, work cycle tracking, backlog management, and notification triggers.

```javascript
// application/use-cases/change-status.js

import { canTransition, isValidatorAction } from '../../domain/services/transitions.js';
import { canChangeStatus } from '../../domain/services/permissions.js';
import { startCycle, endCycle, calculateTotalWorkMs } from '../../domain/value-objects/work-cycle.js';

/**
 * @typedef {Object} ChangeStatusDeps
 * @property {import('../../domain/ports/card-repository').CardRepository} cardRepository
 * @property {import('../../domain/ports/history-repository').HistoryRepository} historyRepository
 * @property {import('../../domain/ports/state-transition-repository').StateTransitionRepository} stateTransitionRepository
 * @property {import('../../domain/ports/backlog-repository').BacklogRepository} backlogRepository
 */

export class ChangeStatus {
  /** @param {ChangeStatusDeps} deps */
  constructor(deps) {
    this._cardRepo = deps.cardRepository;
    this._historyRepo = deps.historyRepository;
    this._transitionRepo = deps.stateTransitionRepository;
    this._backlogRepo = deps.backlogRepository;
  }

  /**
   * Changes a card's status with full business rule enforcement.
   *
   * @param {string} projectId
   * @param {string} cardId
   * @param {string} targetStatus
   * @param {import('../../domain/entities/user').User} user
   * @param {import('../../domain/entities/project').Project} project
   * @returns {Promise<import('../../domain/entities/card').Card>}
   */
  async execute(projectId, cardId, targetStatus, user, project) {
    const card = await this._cardRepo.getCard(projectId, cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    const previousStatus = card.status;
    const now = new Date();

    // 1. Check transition validity
    const result = canTransition(card, targetStatus, user);
    if (!result.allowed) {
      const detail = result.missing
        ? `Missing required fields: ${result.missing.join(', ')}`
        : result.reason;
      throw new Error(`Cannot transition ${previousStatus} → ${targetStatus}: ${detail}`);
    }

    // 2. Check permissions
    if (!canChangeStatus(card, targetStatus, user, project)) {
      if (isValidatorAction(previousStatus, targetStatus)) {
        throw new Error('Only the assigned validator can perform this action');
      }
      throw new Error('Insufficient permissions for this transition');
    }

    // 3. Status-specific logic
    const updates = { status: targetStatus, updatedAt: now, updatedBy: user.email };

    // Entering "In Progress"
    if (targetStatus === 'In Progress') {
      // WIP check: only 1 "In Progress" per developer (co-developers do not count)
      if (card.developer) {
        const inProgress = await this._cardRepo.getCards(projectId, {
          developer: card.developer.id,
          status: 'In Progress',
        });
        const otherInProgress = inProgress.filter(c => c.cardId !== cardId);
        if (otherInProgress.length > 0) {
          throw new Error(
            `WIP limit: ${card.developer.name} already has "${otherInProgress[0].cardId}" In Progress`
          );
        }
      }

      // startDate is IMMUTABLE — set only on first "In Progress"
      if (!card.startDate) {
        updates.startDate = now;
      }

      // Start work cycle
      updates.workCycles = startCycle(card.workCycles, now);
    }

    // Entering "Pausado"
    if (targetStatus === 'Pausado') {
      updates.workCycles = endCycle(card.workCycles, now);
      updates.totalWorkMs = calculateTotalWorkMs(updates.workCycles);
    }

    // Leaving "Pausado" to "In Progress" (resume)
    if (previousStatus === 'Pausado' && targetStatus === 'In Progress') {
      // WIP check again (same as above)
      // startCycle already handled above in "In Progress" block
    }

    // Entering "To Validate"
    if (targetStatus === 'To Validate') {
      updates.workCycles = endCycle(card.workCycles, now);
      updates.totalWorkMs = calculateTotalWorkMs(updates.workCycles);
    }

    // Entering "Blocked"
    if (targetStatus === 'Blocked') {
      updates.workCycles = endCycle(card.workCycles, now);
      updates.totalWorkMs = calculateTotalWorkMs(updates.workCycles);
    }

    // 4. Save
    const updatedCard = { ...card, ...updates };
    await this._cardRepo.saveCard(projectId, updatedCard);

    // 5. Record state transition (for metrics)
    await this._transitionRepo.recordTransition(projectId, cardId, {
      fromStatus: previousStatus,
      toStatus: targetStatus,
      changedBy: user.email,
      changedAt: now,
    });

    // 6. Record history
    await this._historyRepo.addEntry(projectId, cardId, {
      timestamp: now,
      changedBy: user.email,
      changedByName: user.name,
      changes: { status: { from: previousStatus, to: targetStatus } },
    });

    // 7. Backlog management
    const exitStatuses = ['Done', 'Done&Validated', 'Closed', 'Verified'];
    if (exitStatuses.includes(targetStatus) && card.developer) {
      await this._backlogRepo.removeFromBacklog(card.developer.id, cardId);
    }

    return updatedCard;
  }
}
```

#### ManageBacklog

The backlog is the single source of truth for "what tasks does a developer have." It contains ALL assigned tasks regardless of status. WIP is just a filtered view.

```javascript
// application/use-cases/manage-backlog.js

/**
 * Backlog rules:
 *
 * - Backlog = all tasks assigned to a developer (To Do, In Progress, Pausado, Blocked)
 * - WIP = backlog filtered to "In Progress" (max 1 per developer)
 * - Tasks LEAVE the backlog when: Done, Done&Validated, Closed, or developer unassigned
 * - Drag-and-drop reorders priority within the backlog
 * - "In Progress" task is visually highlighted but remains in the backlog
 */

export class ManageBacklog {
  /** @param {{ backlogRepository: import('../../domain/ports/backlog-repository').BacklogRepository }} deps */
  constructor(deps) {
    this._backlogRepo = deps.backlogRepository;
  }

  /**
   * Gets a developer's full backlog (all assigned, non-completed tasks).
   *
   * @param {string} developerId
   * @returns {Promise<import('../../domain/ports/backlog-repository').BacklogEntry[]>}
   */
  async getBacklog(developerId) {
    return this._backlogRepo.getBacklog(developerId);
  }

  /**
   * Reorders the backlog via drag-and-drop.
   *
   * @param {string} developerId
   * @param {string[]} orderedCardIds
   * @returns {Promise<void>}
   */
  async reorder(developerId, orderedCardIds) {
    return this._backlogRepo.reorderBacklog(developerId, orderedCardIds);
  }
}
```

#### Additional Use Cases

| Use Case | Purpose |
|----------|---------|
| `UpdateCard` | Get current card, validate changes (Zod), check permissions, delegate status changes to `ChangeStatus`, save, record diffs in history |
| `DeleteCard` | Check permissions (admin/superadmin only), move to trash via `CardRepository.moveToTrash()` |
| `ManageProject` | CRUD for projects, archive/unarchive, reorder |
| `ManageTeam` | Add/remove team members, update roles, sync denormalized counts |
| `ManageTags` | CRUD for project tag registry, validate tag uniqueness |
| `ManagePlans` | CRUD for development plans |
| `ManageAdrs` | CRUD for Architecture Decision Records |
| `ManageConfig` | CRUD for global config (agents, prompts, guidelines) with versioning |
| `ImportCards` | Bulk card import from CSV/JSON, validate each card, generate IDs |
| `GenerateReport` | Aggregate data for dashboards, sprint burndown, velocity |

### Auth Service

Wraps the `AuthPort` and manages the `authUser` signal.

```javascript
// application/auth-service.js

import { authUser } from './store.js';

export class AuthService {
  /** @param {{ authPort: import('../domain/ports/auth-port').AuthPort }} deps */
  constructor(deps) {
    this._auth = deps.authPort;
  }

  /** Initializes auth state listener */
  init() {
    this._auth.onAuthStateChanged(user => {
      authUser.set(user);
    });
  }

  async signInWithGoogle() {
    return this._auth.signInWithGoogle();
  }

  async signInWithMicrosoft() {
    return this._auth.signInWithMicrosoft();
  }

  async signOut() {
    await this._auth.signOut();
    authUser.set(null);
  }
}
```

---

## Infrastructure Layer

The infrastructure layer implements domain ports with concrete Firebase adapters. Each adapter translates between domain entities and Firestore documents.

### Firestore Adapters

#### FirestoreCardRepository

```javascript
// infrastructure/firebase/card-repository.js

import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, updateDoc, increment,
} from 'firebase/firestore';

/**
 * Implements CardRepository port using Firestore.
 *
 * Collection: projects/{projectId}/cards/{cardId}
 * Counter:    counters/{projectId}
 *
 * @implements {import('../../domain/ports/card-repository').CardRepository}
 */
export class FirestoreCardRepository {
  /** @param {import('firebase/firestore').Firestore} db */
  constructor(db) {
    this._db = db;
  }

  /** @param {string} projectId */
  _cardsRef(projectId) {
    return collection(this._db, 'projects', projectId, 'cards');
  }

  /** @param {string} projectId */
  _counterRef(projectId) {
    return doc(this._db, 'counters', projectId);
  }

  async getCards(projectId, filters) {
    let q = query(this._cardsRef(projectId));
    if (filters?.type) q = query(q, where('type', '==', filters.type));
    if (filters?.status) q = query(q, where('status', '==', filters.status));
    if (filters?.year) q = query(q, where('year', '==', filters.year));
    if (filters?.developer) q = query(q, where('developer.id', '==', filters.developer));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data());
  }

  async getCard(projectId, cardId) {
    const snap = await getDoc(doc(this._cardsRef(projectId), cardId));
    return snap.exists() ? snap.data() : null;
  }

  async saveCard(projectId, card) {
    await setDoc(doc(this._cardsRef(projectId), card.cardId), card);
  }

  async deleteCard(projectId, cardId) {
    await deleteDoc(doc(this._cardsRef(projectId), cardId));
  }

  async getNextCardNumber(projectId, type) {
    const counterRef = this._counterRef(projectId);
    await updateDoc(counterRef, { [type]: increment(1) });
    const snap = await getDoc(counterRef);
    return snap.data()[type];
  }

  async moveToTrash(projectId, cardId) {
    const card = await this.getCard(projectId, cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    const trashRef = doc(this._db, 'projects', projectId, 'trash', cardId);
    await setDoc(trashRef, { ...card, deletedAt: new Date() });
    await this.deleteCard(projectId, cardId);
  }

  async restoreFromTrash(projectId, cardId) {
    const trashRef = doc(this._db, 'projects', projectId, 'trash', cardId);
    const snap = await getDoc(trashRef);
    if (!snap.exists()) throw new Error(`Card not found in trash: ${cardId}`);

    const { deletedAt, ...card } = snap.data();
    await this.saveCard(projectId, card);
    await deleteDoc(trashRef);
  }
}
```

#### FirestoreRealtimeAdapter

```javascript
// infrastructure/firebase/realtime-adapter.js

import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';

/**
 * Implements RealtimePort using Firestore onSnapshot listeners.
 * Updates application signals when data changes.
 *
 * @implements {import('../../domain/ports/realtime-port').RealtimePort}
 */
export class FirestoreRealtimeAdapter {
  /** @param {import('firebase/firestore').Firestore} db */
  constructor(db) {
    this._db = db;
  }

  subscribeToCards(projectId, onUpdate) {
    const q = query(collection(this._db, 'projects', projectId, 'cards'));
    return onSnapshot(q, snapshot => {
      const cards = snapshot.docs.map(d => d.data());
      onUpdate(cards);
    });
  }

  subscribeToCard(projectId, cardId, onUpdate) {
    const ref = doc(this._db, 'projects', projectId, 'cards', cardId);
    return onSnapshot(ref, snapshot => {
      onUpdate(snapshot.exists() ? snapshot.data() : null);
    });
  }

  subscribeToNotifications(userId, onUpdate) {
    const q = query(
      collection(this._db, 'users', userId, 'notifications'),
      where('read', '==', false)
    );
    return onSnapshot(q, snapshot => {
      const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      onUpdate(notifs);
    });
  }
}
```

#### FirebaseAuthAdapter

```javascript
// infrastructure/firebase/auth-adapter.js

import {
  getAuth, signInWithPopup,
  GoogleAuthProvider, OAuthProvider,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth';

/**
 * Implements AuthPort using Firebase Authentication.
 *
 * @implements {import('../../domain/ports/auth-port').AuthPort}
 */
export class FirebaseAuthAdapter {
  constructor() {
    this._auth = getAuth();
  }

  async signInWithGoogle() {
    const result = await signInWithPopup(this._auth, new GoogleAuthProvider());
    return this._mapUser(result.user);
  }

  async signInWithMicrosoft() {
    const provider = new OAuthProvider('microsoft.com');
    const result = await signInWithPopup(this._auth, provider);
    return this._mapUser(result.user);
  }

  async signOut() {
    await this._auth.signOut();
  }

  onAuthStateChanged(callback) {
    return firebaseOnAuthStateChanged(this._auth, user => {
      callback(user ? this._mapUser(user) : null);
    });
  }

  getCurrentUser() {
    const user = this._auth.currentUser;
    return user ? this._mapUser(user) : null;
  }

  /** @private */
  _mapUser(firebaseUser) {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
  }
}
```

### Firestore Converters

Type-safe conversion between domain entities and Firestore documents.

```javascript
// infrastructure/converters/firestore-converter.js

/**
 * Creates a Firestore converter for a domain entity type.
 * Handles Timestamp ↔ Date conversion and field mapping.
 *
 * @template T
 * @param {Object} config
 * @param {(data: any) => T} config.fromFirestore - Transform Firestore doc to domain entity
 * @param {(entity: T) => any} config.toFirestore - Transform domain entity to Firestore doc
 * @returns {import('firebase/firestore').FirestoreDataConverter<T>}
 */
export function createConverter(config) {
  return {
    toFirestore: (entity) => config.toFirestore(entity),
    fromFirestore: (snapshot, options) => {
      const data = snapshot.data(options);
      return config.fromFirestore(data);
    },
  };
}
```

### Cloud Functions (Server-side Infrastructure)

Cloud Functions serve as a safety net for business rule enforcement and handle server-side operations.

```
functions/
├── src/
│   ├── triggers/
│   │   ├── on-card-update.js      # Validates transitions, enforces WIP, tracks work cycles
│   │   └── on-status-change.js    # Sends FCM notifications, manages backlog updates
│   ├── callable/
│   │   ├── generate-ac.js         # AI: generate acceptance criteria from user story
│   │   ├── analyze-bug.js         # AI: analyze bug description for root cause hints
│   │   └── import-cards.js        # Bulk card import with validation
│   └── shared/
│       └── domain/                # Domain services shared with frontend (symlink or copy)
```

**Important**: Cloud Functions import domain services directly (transitions, permissions). The domain layer is shared between frontend and backend because it has zero external dependencies.

### Data Flow for State Transitions

State transitions generate data useful for analytics. The storage strategy uses Firestore subcollections for real-time access and PostgreSQL (via Data Connect) for analytical queries.

```
Card status change
       │
       ├──► Firestore: projects/{projectId}/cards/{cardId}/stateTransitions/{id}
       │    (real-time access, subcollection queries)
       │
       ├──► Firestore: projects/{projectId}/cards/{cardId}/history/{id}
       │    (field-level diffs for audit trail)
       │
       └──► Cloud Function sync → PostgreSQL
            (analytical queries: avg cycle time, bottlenecks, velocity)
```

---

## Presentation Layer

### Architecture: SPA + Astro Shell

The app is a **Single Page Application** for all user-facing pages. Astro serves as the **build tool and shell generator**, not as the runtime renderer. Admin/superadmin pages may use traditional Astro MPA if they don't need real-time reactivity.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ASTRO (build-time)                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ login.astro (static)   admin.astro (static/MPA)            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ app.astro → SPA Shell                                      │ │
│  │  ┌───────────────────────────────────────────────────────┐  │ │
│  │  │ <pg-app> (Lit root component)                        │  │ │
│  │  │  ├── Client-side router                              │  │ │
│  │  │  ├── Auth gate                                       │  │ │
│  │  │  ├── Nav bar                                         │  │ │
│  │  │  └── <main> (view outlet)                            │  │ │
│  │  │       ├── /projects → projectsView()                 │  │ │
│  │  │       ├── /project/:id → projectView()               │  │ │
│  │  │       ├── /dashboard → dashboardView()               │  │ │
│  │  │       └── /wip → wipView()                           │  │ │
│  │  └───────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Why this split:**
- `login.astro` — Static HTML, no JS framework needed. Two OAuth buttons + redirect.
- `app.astro` — SPA shell. Loads `<pg-app>` which owns the entire client-side experience.
- `admin.astro` — Optional MPA. Admin features (user provisioning, trash) are low-frequency and don't need SPA navigation. Can be Astro + islands.

### Routing Strategy

Client-side routing via the History API. Lightweight — no external router library needed.

```javascript
// presentation/router.js

/** @type {Record<string, () => import('lit').TemplateResult>} */
const routes = {
  '/projects':      () => projectsView(),
  '/project/:id':   (params) => projectView(params.id),
  '/dashboard':     () => dashboardView(),
  '/wip':           () => wipView(),
};

// Navigation: history.pushState + popstate listener
// Pattern matching: simple regex for :param segments
// Default: /projects
```

### Component Strategy: Lit vs Astro vs CSS-only

**Decision criteria for each UI element:**

1. **Is it reusable outside this project?** → Lit Web Component (custom element)
2. **Is it static/build-time content?** → Astro Component
3. **Is it purely visual, no JS needed?** → CSS-only (classes, data attributes)
4. **Is it project-specific and dynamic?** → Lit template function (not a custom element)

#### Lit Web Components (reusable, registered as custom elements)

These are **genuine web components** — usable in any project, any framework.

| Component | Tag | Why Lit |
|-----------|-----|---------|
| `PgToast` | `<pg-toast>` | Imperative API (`PgToast.show()`), manages own DOM lifecycle, useful anywhere |
| `PgModal` | `<pg-modal>` | Imperative API (`PgModal.confirm()`), portal-like behavior, stacking context |
| `PgSelect` | `<pg-select>` | Complex widget: search, multi-select, keyboard navigation, dropdown positioning |

**Total: 3 Lit web components.** Everything else is either a template function or CSS.

#### Lit Template Functions (project-specific, NOT custom elements)

These are **render functions** that return `html` tagged template literals. They live inside the `<pg-app>` component tree but are NOT registered as custom elements. They are simply functions that produce DOM.

```javascript
// presentation/views/project-view.js

import { html } from 'lit';
import { filteredCards, filters, currentCard, panelOpen } from '../../application/store.js';

/**
 * Renders the project view with tabs, filters, view switcher, and card list.
 * This is a template function, NOT a custom element.
 *
 * @param {string} projectId
 * @returns {import('lit').TemplateResult}
 */
export function projectView(projectId) {
  return html`
    <section class="project-view">
      ${filtersBar()}
      ${viewSwitcher()}
      ${currentViewContent()}
      ${panelOpen.value ? cardPanel(currentCard.value) : ''}
    </section>
  `;
}
```

| Template Function | Purpose |
|-------------------|---------|
| `projectsView()` | Project listing, create/edit/archive |
| `projectView(id)` | Full project: tabs, filters, views, panel |
| `dashboardView()` | Multi-project charts and metrics |
| `wipView()` | Developer backlog + WIP |
| `navBar()` | Top nav: brand, project selector, user menu, bell, theme |
| `filtersBar()` | Unified filter controls |
| `viewSwitcher()` | Table/Kanban/List/Gantt toggle |
| `tableView(cards)` | Sortable data table |
| `boardView(cards, mode)` | Kanban (status) or Sprint (sprint) board |
| `ganttView(cards)` | Gantt chart timeline |
| `cardCollapsed(card)` | One-line card row (table) |
| `cardPreview(card)` | Card format (kanban/list) |
| `cardPanel(card)` | Full edit panel (slide-in) |
| `cardForm(card, type)` | Dynamic form fields by card type |
| `statusTransition(card)` | Status change dropdown with validation |
| `bellDropdown()` | Notification list |
| `yearSelector()` | Year picker |
| `tabBar(tabs)` | Tab navigation |
| `chartCanvas(config)` | Chart rendering wrapper |
| `plansView(projectId)` | Plans CRUD |
| `adrsView(projectId)` | ADR CRUD |
| `teamManager(projectId)` | Team member management |
| `configEditor()` | Global config with versioning |
| `uploadForm()` | CSV/JSON import |

#### Astro Components (static, build-time)

| Component | Purpose |
|-----------|---------|
| `AppShell.astro` | HTML head, meta tags, PWA manifest link, `<pg-app>` mount point |
| `LoginPage.astro` | Static login page (Google/Microsoft buttons as islands) |
| `AdminPage.astro` | Admin console (optional MPA, or can be a view in the SPA) |

#### CSS-only (zero JavaScript)

| Element | Implementation |
|---------|---------------|
| Badges (status, type, priority, tags) | CSS classes: `.badge--status-in-progress`, `.badge--tag-infra` |
| Card layout (collapsed/preview) | CSS Grid/Flexbox with data attributes |
| Responsive breakpoints | CSS custom media queries |
| Theme (light/dark) | CSS custom properties + `[data-theme]` attribute |
| Loading spinners | CSS animations |
| Empty states | CSS `:empty` + `::after` content |

### Component Rules

All dynamic rendering (template functions + Lit components) follows these rules:

**DO:**
- Read from application store signals (reactive via `SignalWatcher` on `<pg-app>`)
- Call use case methods in response to user actions
- Use CSS design tokens for all styling
- Delegate DOM events for internal communication

**NEVER:**
- Import from the infrastructure layer (no Firestore, no Firebase Auth)
- Contain business logic (no transition rules, no permission checks inline)
- Make database calls directly
- Manage application state outside of signals

### `<pg-app>`: The SPA Root

One single Lit component owns the entire SPA lifecycle.

```javascript
// presentation/pg-app.js

import { LitElement, html, css } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { authUser, theme } from '../application/store.js';
import { router, currentRoute } from './router.js';

export class PgApp extends SignalWatcher(LitElement) {
  static styles = css`
    :host { display: block; min-height: 100dvh; }
    /* ... responsive layout ... */
  `;

  connectedCallback() {
    super.connectedCallback();
    router.init(); // Start client-side routing
  }

  render() {
    if (!authUser.value) {
      window.location.href = '/login';
      return html``;
    }

    return html`
      ${navBar()}
      <main class="app-main">
        ${currentRoute.value.render()}
      </main>
      <pg-toast></pg-toast>
    `;
  }
}
customElements.define('pg-app', PgApp);
```

### Responsive Design (Mobile-First)

```
┌──────────────────────────────────────────────────┐
│ BREAKPOINTS                                       │
├──────────────────────────────────────────────────┤
│ --bp-sm: 640px   (mobile landscape)              │
│ --bp-md: 768px   (tablet)                        │
│ --bp-lg: 1024px  (desktop)                       │
│ --bp-xl: 1280px  (wide desktop)                  │
├──────────────────────────────────────────────────┤
│ MOBILE (< 768px)                                 │
│ ├── Nav: hamburger menu                          │
│ ├── Views: table scrolls horizontal, kanban 1col │
│ ├── Panel: full-screen overlay (not side panel)  │
│ ├── Filters: collapsible drawer                  │
│ └── Gantt: horizontal scroll                     │
├──────────────────────────────────────────────────┤
│ TABLET (768px - 1023px)                          │
│ ├── Nav: full bar, compact                       │
│ ├── Views: kanban 2-3 columns                   │
│ ├── Panel: side panel (60% width)                │
│ └── Filters: inline bar                          │
├──────────────────────────────────────────────────┤
│ DESKTOP (≥ 1024px)                               │
│ ├── Nav: full bar with all controls              │
│ ├── Views: all columns visible                   │
│ ├── Panel: side panel (500px fixed)              │
│ └── Filters: inline bar with all options         │
└──────────────────────────────────────────────────┘
```

Implementation: CSS custom properties + container queries (not just media queries).

```css
/* tokens.css */
@custom-media --mobile (max-width: 767px);
@custom-media --tablet (min-width: 768px) and (max-width: 1023px);
@custom-media --desktop (min-width: 1024px);

/* Component-level responsiveness via container queries */
.card-panel {
  container-type: inline-size;
}

@container (max-width: 500px) {
  .card-panel .form-grid { grid-template-columns: 1fr; }
}

@container (min-width: 501px) {
  .card-panel .form-grid { grid-template-columns: 1fr 1fr; }
}
```

### Progressive Web App (PWA)

The app is installable and works offline for cached data.

#### Web App Manifest

```json
{
  "name": "Planning Game",
  "short_name": "PG",
  "description": "Agile project management with XP methodology",
  "start_url": "/app",
  "display": "standalone",
  "theme_color": "#4f46e5",
  "background_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

#### Service Worker Strategy

```
┌──────────────────────────────────────────────────┐
│ CACHE STRATEGY                                    │
├──────────────────────────────────────────────────┤
│ App Shell (HTML, CSS, JS):                       │
│   → Cache-first, update in background            │
│   → Versioned cache name for cache busting       │
│                                                   │
│ API/Firestore data:                              │
│   → Network-first, fallback to cache             │
│   → Firestore SDK handles offline persistence    │
│                                                   │
│ Static assets (icons, fonts):                    │
│   → Cache-first, long TTL                        │
│                                                   │
│ Firebase Auth:                                   │
│   → Network-only (no caching auth tokens)        │
└──────────────────────────────────────────────────┘
```

Firestore SDK has built-in offline persistence (`enablePersistence()`). The service worker complements it by caching the app shell, so the app loads instantly even offline.

#### PWA Files

```
public/
├── manifest.json              # Web App Manifest
├── sw.js                      # Service Worker (generated at build)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable.png
    ├── apple-touch-icon.png
    └── favicon.svg
```

### Example Flow: User Clicks "Start" on a Task

This illustrates how a user action traverses all four layers in the SPA.

```
USER ACTION (tap "In Progress" button on mobile or desktop)
    │
    ▼
┌─────────────────────────────────────────────────┐
│ PRESENTATION: statusTransition() template fn     │
│                                                  │
│  onClick → changeStatus.execute(                │
│    projectId, cardId, 'In Progress', user, proj │
│  )                                              │
└───────────────────┬─────────────────────────────┘
                    │ calls use case
                    ▼
┌─────────────────────────────────────────────────┐
│ APPLICATION: ChangeStatus use case               │
│                                                  │
│  1. cardRepo.getCard(projectId, cardId)          │
│  2. TransitionService.canTransition(card, ...)   │  ──► DOMAIN
│  3. PermissionService.canChangeStatus(...)       │  ──► DOMAIN
│  4. WIP check via cardRepo.getCards(...)         │  ──► INFRA (port)
│  5. WorkCycle.startCycle(card.workCycles)        │  ──► DOMAIN
│  6. cardRepo.saveCard(projectId, updatedCard)    │  ──► INFRA (port)
│  7. historyRepo.addEntry(...)                    │  ──► INFRA (port)
│  8. transitionRepo.recordTransition(...)         │  ──► INFRA (port)
│  9. backlogRepo update                           │  ──► INFRA (port)
└───────────────────┬─────────────────────────────┘
                    │ Firestore write triggers onSnapshot
                    ▼
┌─────────────────────────────────────────────────┐
│ INFRASTRUCTURE: FirestoreRealtimeAdapter         │
│                                                  │
│  onSnapshot fires → store.cards.set(newCards)    │
└───────────────────┬─────────────────────────────┘
                    │ signal change triggers re-render
                    ▼
┌─────────────────────────────────────────────────┐
│ PRESENTATION: <pg-app> re-renders                │
│                                                  │
│  SignalWatcher detects filteredCards changed      │
│  → boardView() / tableView() re-renders          │
│  → card moves to new column (kanban)             │
│  → panel updates if open                         │
└─────────────────────────────────────────────────┘
```

---

## Testing Strategy

Clean Architecture enables precise testing at each layer, with the domain layer being the easiest and most thoroughly tested.

| Layer | What to Test | Approach | Coverage Target |
|-------|-------------|----------|-----------------|
| **Domain** | Transitions, permissions, filters, value objects, CardId generation | Pure unit tests — no mocks needed | 95%+ |
| **Application** | Use case orchestration, signal updates, error flows | Mock ports (repositories), test flow and side effects | 80%+ |
| **Infrastructure** | Firestore adapters, converters, auth adapter | Integration tests with Firebase emulator | 70%+ |
| **Presentation** | Component rendering, user interactions, signal reactivity | Vitest + @open-wc/testing | 70%+ |
| **E2E** | Full workflows (create project, create task, kanban drag, validate) | Playwright | Critical paths |

### Testing Domain (Example)

```javascript
// tests/domain/services/transitions.test.js

import { describe, it, expect } from 'vitest';
import { canTransition, getAvailableTransitions } from '@/domain/services/transitions.js';

describe('TransitionService', () => {
  describe('canTransition', () => {
    it('should allow To Do → In Progress when all fields present', () => {
      const card = {
        type: 'task',
        status: 'To Do',
        developer: { id: 'dev_001', name: 'Dev', email: 'dev@test.com' },
        validator: { id: 'stk_001', name: 'Val', email: 'val@test.com' },
        epic: 'PLN-PCS-0001',
        sprint: 'PLN-SPR-0001',
        devPoints: 3,
        businessPoints: 4,
        acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
      };

      const result = canTransition(card, 'In Progress', {});
      expect(result.allowed).toBe(true);
    });

    it('should reject To Do → In Progress when missing developer', () => {
      const card = { type: 'task', status: 'To Do' };

      const result = canTransition(card, 'In Progress', {});
      expect(result.allowed).toBe(false);
      expect(result.missing).toContain('developer');
    });

    it('should allow In Progress → Pausado with no requirements', () => {
      const card = { type: 'task', status: 'In Progress' };

      const result = canTransition(card, 'Pausado', {});
      expect(result.allowed).toBe(true);
    });

    it('should reject invalid transition To Do → Done', () => {
      const card = { type: 'task', status: 'To Do' };

      const result = canTransition(card, 'Done', {});
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid transition');
    });
  });
});
```

### Testing Application (Example)

```javascript
// tests/application/use-cases/change-status.test.js

import { describe, it, expect, vi } from 'vitest';
import { ChangeStatus } from '@/application/use-cases/change-status.js';

describe('ChangeStatus', () => {
  it('should enforce WIP limit of 1 In Progress task per developer', async () => {
    const mockCardRepo = {
      getCard: vi.fn().mockResolvedValue({
        cardId: 'PLN-TSK-0002',
        type: 'task',
        status: 'To Do',
        developer: { id: 'dev_001', name: 'Dev', email: 'dev@test.com' },
        validator: { id: 'stk_001', name: 'Val', email: 'val@test.com' },
        epic: 'PLN-PCS-0001',
        sprint: 'PLN-SPR-0001',
        devPoints: 2,
        businessPoints: 3,
        acceptanceCriteriaStructured: [{ given: 'x', when: 'y', then: 'z' }],
      }),
      getCards: vi.fn().mockResolvedValue([
        { cardId: 'PLN-TSK-0001', status: 'In Progress' },
      ]),
      saveCard: vi.fn(),
    };

    const useCase = new ChangeStatus({
      cardRepository: mockCardRepo,
      historyRepository: { addEntry: vi.fn() },
      stateTransitionRepository: { recordTransition: vi.fn() },
      backlogRepository: { removeFromBacklog: vi.fn() },
    });

    await expect(
      useCase.execute('PLN', 'PLN-TSK-0002', 'In Progress', { email: 'dev@test.com' }, {})
    ).rejects.toThrow('WIP limit');
  });
});
```

---

## File Structure

```
src/
├── domain/
│   ├── entities/
│   │   ├── card.d.ts                      # Card, Task, Bug, Epic, Sprint, Proposal, QA
│   │   ├── project.d.ts                   # Project, TagRegistry
│   │   ├── user.d.ts                      # User, TeamMember, TeamMemberRef
│   │   └── plan.d.ts                      # Plan, ADR, GlobalConfig
│   ├── value-objects/
│   │   ├── card-id.js                     # generateCardId, getTypeAbbreviation, getProjectAbbreviation
│   │   ├── priority.js                    # calculatePriority, getPriorityCombinations
│   │   └── work-cycle.js                  # startCycle, endCycle, calculateTotalWorkMs
│   ├── services/
│   │   ├── transitions.js                 # canTransition, getAvailableTransitions, getRequiredFields
│   │   ├── permissions.js                 # getUserRole, canEditCard, canDeleteCard, canChangeStatus
│   │   └── filters.js                     # applyFilters, matchesSearch, matchesTags, getStatusesForType
│   ├── schemas/
│   │   └── cards.js                       # Zod validation schemas (shared frontend + Cloud Functions)
│   └── ports/
│       ├── card-repository.d.ts
│       ├── project-repository.d.ts
│       ├── team-repository.d.ts
│       ├── user-repository.d.ts
│       ├── notification-repository.d.ts
│       ├── history-repository.d.ts
│       ├── state-transition-repository.d.ts
│       ├── backlog-repository.d.ts
│       ├── auth-port.d.ts
│       ├── realtime-port.d.ts
│       ├── plan-repository.d.ts
│       ├── adr-repository.d.ts
│       └── global-config-repository.d.ts
│
├── application/
│   ├── use-cases/
│   │   ├── create-card.js
│   │   ├── update-card.js
│   │   ├── change-status.js
│   │   ├── delete-card.js
│   │   ├── manage-project.js
│   │   ├── manage-team.js
│   │   ├── manage-tags.js
│   │   ├── manage-backlog.js
│   │   ├── manage-plans.js
│   │   ├── manage-adrs.js
│   │   ├── manage-config.js
│   │   ├── import-cards.js
│   │   └── generate-report.js
│   ├── store.js                           # Signal-based reactive store
│   └── auth-service.js                    # Auth orchestration
│
├── infrastructure/
│   ├── firebase/
│   │   ├── init.js                        # Firebase app initialization
│   │   ├── card-repository.js             # FirestoreCardRepository
│   │   ├── project-repository.js          # FirestoreProjectRepository
│   │   ├── team-repository.js             # FirestoreTeamRepository
│   │   ├── user-repository.js             # FirestoreUserRepository
│   │   ├── notification-repository.js     # FirestoreNotificationRepository
│   │   ├── history-repository.js          # FirestoreHistoryRepository
│   │   ├── state-transition-repository.js # FirestoreStateTransitionRepository
│   │   ├── backlog-repository.js          # FirestoreBacklogRepository
│   │   ├── auth-adapter.js                # FirebaseAuthAdapter
│   │   ├── realtime-adapter.js            # FirestoreRealtimeAdapter
│   │   ├── plan-repository.js
│   │   ├── adr-repository.js
│   │   └── global-config-repository.js
│   └── converters/
│       └── firestore-converter.js         # Generic Firestore ↔ domain converters
│
├── presentation/
│   ├── components/
│   │   ├── pg-card.js                     # Polymorphic card (collapsed/preview/full)
│   │   ├── pg-card-panel.js               # Right-side slide panel for card editing
│   │   ├── pg-board.js                    # Kanban/Sprint board with drag-drop
│   │   ├── pg-table.js                    # Sortable data table
│   │   ├── pg-gantt.js                    # Gantt chart visualization
│   │   ├── pg-filters.js                  # Unified filter bar
│   │   ├── pg-form.js                     # Dynamic schema-driven form builder
│   │   ├── pg-modal.js                    # Lightweight modal (confirmations only)
│   │   ├── pg-select.js                   # Dropdown with search + multi-select
│   │   ├── pg-badge.js                    # Status/priority/tag badges
│   │   ├── pg-nav.js                      # Top navigation bar
│   │   ├── pg-theme-toggle.js             # Light/dark theme toggle
│   │   ├── pg-toast.js                    # Toast notifications
│   │   ├── pg-bell.js                     # Notification bell with unread count
│   │   ├── pg-tabs.js                     # Tab navigation
│   │   ├── pg-view-switcher.js            # Table/Kanban/List/Gantt switcher
│   │   ├── pg-year.js                     # Year selector
│   │   ├── pg-status-transition.js        # Status change button/dropdown
│   │   ├── pg-wip.js                      # WIP dashboard
│   │   ├── pg-chart.js                    # Chart wrapper (burndown, velocity)
│   │   ├── pg-dashboard.js                # Dashboard aggregations
│   │   ├── pg-plans.js                    # Plans management
│   │   ├── pg-adrs.js                     # ADR management
│   │   ├── pg-config.js                   # Global config editor
│   │   ├── pg-project.js                  # Project management
│   │   ├── pg-team.js                     # Team member management
│   │   ├── pg-admin.js                    # Admin console
│   │   └── pg-upload.js                   # File upload + bulk import
│   ├── pages/
│   │   ├── index.astro                    # Main view (project cards)
│   │   ├── login.astro                    # Login page
│   │   ├── projects.astro                 # Project listing
│   │   ├── project/[id].astro             # Project detail with tabs + views
│   │   ├── dashboard.astro                # Multi-project dashboard
│   │   ├── wip.astro                      # WIP + developer backlog
│   │   └── admin.astro                    # Administration
│   └── styles/
│       ├── tokens.css                     # Design tokens (colors, spacing, radii, shadows)
│       ├── base.css                       # Reset + global styles
│       └── layers.css                     # CSS layer definitions
│
├── shared/
│   └── types.d.ts                         # Re-exports from domain entities
│
functions/
├── src/
│   ├── triggers/
│   │   ├── on-card-update.js              # Validate transitions, track work cycles
│   │   └── on-status-change.js            # FCM notifications, backlog sync
│   ├── callable/
│   │   ├── generate-ac.js                 # AI: generate acceptance criteria
│   │   ├── analyze-bug.js                 # AI: bug analysis
│   │   └── import-cards.js                # Bulk card import
│   └── shared/
│       └── domain/                        # Domain services (symlink or copy from src/domain)
│
mcp/
├── src/
│   ├── index.js                           # MCP server entry point
│   ├── firebase-adapter.js                # Firebase Admin SDK adapter
│   ├── services/
│   │   └── firestore-service.js           # Firestore operations for MCP
│   └── tools/
│       ├── cards.js                        # Card CRUD tools
│       ├── projects.js                    # Project tools
│       └── ...                            # Additional tool groups
```

---

## Dependency Injection

Use cases receive their dependencies via constructor injection. A composition root wires everything together at application startup.

```javascript
// src/bootstrap.js — Composition root (runs once at app init)

import { getFirestore } from 'firebase/firestore';
import { FirestoreCardRepository } from './infrastructure/firebase/card-repository.js';
import { FirestoreHistoryRepository } from './infrastructure/firebase/history-repository.js';
import { FirestoreBacklogRepository } from './infrastructure/firebase/backlog-repository.js';
import { FirestoreStateTransitionRepository } from './infrastructure/firebase/state-transition-repository.js';
import { FirestoreRealtimeAdapter } from './infrastructure/firebase/realtime-adapter.js';
import { FirebaseAuthAdapter } from './infrastructure/firebase/auth-adapter.js';
import { CreateCard } from './application/use-cases/create-card.js';
import { ChangeStatus } from './application/use-cases/change-status.js';
import { AuthService } from './application/auth-service.js';

const db = getFirestore();

// Infrastructure (implements ports)
const cardRepository = new FirestoreCardRepository(db);
const historyRepository = new FirestoreHistoryRepository(db);
const backlogRepository = new FirestoreBacklogRepository(db);
const stateTransitionRepository = new FirestoreStateTransitionRepository(db);
const realtimeAdapter = new FirestoreRealtimeAdapter(db);
const authAdapter = new FirebaseAuthAdapter();

// Application (use cases with injected dependencies)
export const createCard = new CreateCard({ cardRepository, historyRepository, backlogRepository });
export const changeStatus = new ChangeStatus({
  cardRepository, historyRepository, stateTransitionRepository, backlogRepository,
});
export const authService = new AuthService({ authPort: authAdapter });

// Initialize real-time subscriptions
// realtimeAdapter.subscribeToCards(...) → updates store signals
```

Components import use cases from the composition root:

```javascript
// presentation/components/pg-card-panel.js

import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { changeStatus } from '../../bootstrap.js';
import { currentCard, authUser, currentProject } from '../../application/store.js';

export class PgCardPanel extends SignalWatcher(LitElement) {
  render() {
    const card = currentCard.value;
    if (!card) return html``;

    return html`
      <div class="panel">
        <h2>${card.cardId} — ${card.title}</h2>
        <!-- ... card fields ... -->
        <pg-status-transition
          .card=${card}
          @status-change=${this._onStatusChange}
        ></pg-status-transition>
      </div>
    `;
  }

  /** @param {CustomEvent} e */
  async _onStatusChange(e) {
    const { targetStatus } = e.detail;
    const user = authUser.value;
    const project = currentProject.value;
    const card = currentCard.value;

    try {
      await changeStatus.execute(project.name, card.cardId, targetStatus, user, project);
      // Signal updates happen automatically via onSnapshot → store.cards
    } catch (err) {
      // Show error toast with missing fields or permission message
      this.dispatchEvent(new CustomEvent('toast', {
        detail: { message: err.message, type: 'error' },
        bubbles: true, composed: true,
      }));
    }
  }
}
customElements.define('pg-card-panel', PgCardPanel);
```

---

## Key Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| Domain layer has ZERO dependencies | Ensures business rules are testable without any framework, database, or UI concern |
| Ports defined as `.d.ts` files | Zero runtime overhead; full IntelliSense in editors; enforced by JSDoc annotations |
| Priority is never stored | Algorithm may change; always computed dynamically from devPoints and businessPoints |
| `startDate` is immutable | Set once on first "In Progress" transition; pause/resume does not reset it |
| `workCycles` tracks time granularly | Enables accurate time tracking across In Progress / Pausado / Blocked cycles |
| Backlog is the single source of truth | Contains ALL assigned tasks (To Do, In Progress, Pausado, Blocked); WIP is a filtered view |
| Zod schemas in domain layer | Validation logic is domain concern; shared between frontend, Cloud Functions, and MCP |
| Use cases receive dependencies via constructor | Enables testing with mock repositories; no global singletons |
| Components read signals, call use cases | Strict separation prevents business logic leaking into the UI |
| Cloud Functions share domain services | Same transition/permission rules enforced server-side as safety net |
| `Pausado` status for tasks | Supports pause/resume workflow; distinct from Blocked (which requires a reason) |
| Structured acceptance criteria only | No plain text `acceptanceCriteria` field; always Given/When/Then format |

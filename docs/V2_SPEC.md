# Planning Game XP — V2 Rewrite Specification

> AI-friendly functional spec generated from V1 codebase audit.
> Use this document as the source of truth for rebuilding the app from scratch.

---

## 1. PRODUCT OVERVIEW

### What is Planning Game XP?
Agile project management app following eXtreme Programming (XP) practices. Manages Sprints, Epics, Tasks, Bugs, Proposals, and QA items across multiple projects with real-time collaboration.

### Current Stack (V1)
- **Frontend**: Astro v5.10 + Lit web components
- **Backend**: Firebase (Realtime Database primary, Firestore mirror)
- **Auth**: Firebase Auth (Google + Microsoft OAuth)
- **Functions**: Firebase Cloud Functions (Node.js)
- **Storage**: Firebase Storage
- **Notifications**: FCM (Firebase Cloud Messaging)
- **Testing**: Vitest (unit), Playwright (E2E)
- **MCP Server**: Node.js MCP SDK for AI agent integration

### V2 Target Stack (proposed)
- **Frontend**: Astro + Lit (keep, proven) OR evaluate alternatives
- **Backend**: Firestore (primary, replace RTDB)
- **Auth**: Firebase Auth (keep, add Custom Claims fully)
- **Functions**: Firebase Cloud Functions (keep, modernize)
- **MCP**: Keep and extend

---

## 2. USER ROLES & PERMISSIONS

### Roles
| Role | Capabilities |
|------|-------------|
| **SuperAdmin** | Full access: assign tasks to others, edit past years, admin pages, user provisioning |
| **Project Admin** | Manage specific projects they're assigned to |
| **Developer** | Self-assign tasks, update own tasks, view WIP |
| **Validator/Stakeholder** | Approve tasks (To Validate → Done), co-validate |
| **Consultant** | Read-only access |

### Permission Rules
- Developers can ONLY self-assign tasks (except SuperAdmin)
- Past year data is read-only (except SuperAdmin)
- Card editing requires ownership or admin role
- Concurrent edit protection (ownership lock per card)

---

## 3. PAGES & NAVIGATION

### 3.1 Landing Page (`/`)
- Static hero with logo, tagline, CTA buttons
- Feature cards: Task management, Sprints, Collaboration, Metrics
- Links to `/projects` and documentation

### 3.2 Projects Page (`/projects`)
- List all projects (name, abbreviation, team)
- Create/edit/archive projects (admin only)
- Drag-and-drop project reordering
- Points conversion tool (1-5 ↔ Fibonacci)
- Project archiving with visual indicator

### 3.3 Admin Project Page (`/adminproject`) — MAIN APP HUB
Tabbed interface with 6 sections:

#### Tab: Tasks
- **Views**: Table, List, Kanban, Gantt
- **Filters**: Year, Status, Developer, Priority, Sprint, Epic, search text
- **Actions**: Create, edit (modal), drag-drop status change (Kanban), drag-drop sprint assignment
- **Table**: Sortable columns (ID, Title, Status, Priority, Developer, Sprint, Points)
- **Kanban**: Columns by status, colored headers, drag-drop between columns
- **List**: Card grid with flex wrap
- **Gantt**: Timeline by epic/sprint

#### Tab: Bugs
- **Views**: Table, List, Kanban
- **Filters**: Year, Status, Priority, Developer, Register date
- **Bug priorities**: APPLICATION BLOCKER, DEPARTMENT BLOCKER, INDIVIDUAL BLOCKER, USER EXPERIENCE ISSUE, WORKFLOW IMPROVEMENT, WORKAROUND AVAILABLE ISSUE

#### Tab: Sprints
- Sprint cards with dates, points summary
- Sprint planning view (columns by sprint with drag-drop)

#### Tab: Epics
- Epic management with Gantt visualization
- Epic types tracking

#### Tab: Proposals
- Feature proposals with user story format
- Conversion to tasks

#### Tab: QA
- QA items grouped by test suite
- Pass/fail tracking

#### Admin Section (within project)
- Developers & Stakeholders management (EntityDirectoryManager)
- Project settings
- Guidelines management (GuidelinesManager)
- Development plans (DevPlansSection)
- Theme editor

### 3.4 Dashboard (`/dashboard`)
- Multi-project selector (up to 3 projects)
- Gantt charts comparing projects side-by-side
- Sprint analytics (burndown, velocity)
- Developer performance metrics
- Year selector

### 3.5 WIP Page (`/wip`)
- **Tab: WIP actual** — Tasks "In Progress" per developer (max 1 per dev enforced)
- **Tab: Backlog por developer** — All "To Do" tasks assigned to each developer
- Workday duration calculation
- Drag-drop backlog reordering
- SuperAdmin bulk backlog sync

### 3.6 Sprint View (`/sprintview`)
- Project selector
- Gantt chart for single project
- Year filtering

### 3.7 Clean View (`/cleanview`) — Validator Dashboard
- **Tab: A Validar** — Tasks awaiting validation
- **Tab: Mis Tareas** — Current user's tasks
- **Tab: Todas** — All project tasks
- Summary cards with task counts
- FAB menu for quick create (Task/Bug/Proposal)
- Notification bell

### 3.8 Proposals (`/proposals`)
- Cross-project proposals list (GlobalProposalsList)
- No project context needed
- Status tracking (Pending, Planned, Rejected)

### 3.9 Development (`/development`)
- Development metrics and performance analytics
- Card counts, sprint metrics, developer stats

### 3.10 Global Config (`/global-config`)
- Manage shared configurations (agents, prompts, instructions, guidelines)
- CRUD operations per config type

### 3.11 Admin Console (`/admin`)
- **Firebase**: Direct JSON write to Firebase paths (merge mode available)
- **Informes**: Report generation
- **Informes ISO**: ISO compliance reports
- **Informe de Horas**: Hours/workday reports
- **Configuración**: Settings
- **Usuarios**: User management and provisioning
- **Papelera**: Deleted items recovery (trash)

### 3.12 Upload Stories (`/upload-stories`)
- Bulk story import (CSV/JSON)
- AI-assisted document parsing → card creation

### 3.13 App Share (`/app-share`)
- Password-protected file sharing
- Download tracking
- Canary vs Release badges

### 3.14 Documentation (`/doc/*`)
- In-app docs (DocLayout, DocSidebar, DocBreadcrumbs)
- Pages: index, git, deploy, ai, planninggame

---

## 4. CARD DATA MODEL

### Common Fields (all card types)
```
cardId:          string    # Format: {PROJECT}-{TYPE}-{NUMBER} (e.g., PLN-TSK-0042)
cardType:        string    # "task-card", "bug-card", "epic-card", etc.
title:           string    # Required
description:     string    # Plain text
status:          string    # Type-dependent lifecycle
projectId:       string    # Parent project
createdBy:       string    # Creator email/ID
createdAt:       string    # ISO timestamp
updatedAt:       string    # ISO timestamp
updatedBy:       string    # Last modifier
year:            number    # Year filter (2025, 2026, etc.)
epic:            string    # Epic ID reference
sprint:          string    # Sprint ID reference
developer:       string    # Assigned developer (dev_XXX)
codeveloper:     string    # Co-developer (for AI tasks)
validator:       string    # Assigned validator (stk_XXX)
covalidator:     string    # Co-validator
notes:           string    # Free-text notes
history:         array     # Change history
```

### Task-Specific Fields
```
descriptionStructured:          [{role, goal, benefit}]     # Como/Quiero/Para
acceptanceCriteria:             string                       # Plain text AC
acceptanceCriteriaStructured:   [{given, when, then, raw}]  # Gherkin format
devPoints:                      number (1-5)                 # Technical effort
businessPoints:                 number (1-5)                 # Business value
priority:                       number                       # Calculated: (businessPoints/devPoints)*100
startDate:                      string                       # ISO date when In Progress
endDate:                        string                       # ISO date when To Validate
commits:                        [{hash, message, date, author}]
implementationPlan:             object                       # approach, steps, risks, etc.
planStatus:                     string                       # "proposed", "validated"
pipelineStatus:                 object                       # {committed, prCreated, merged, deployed}
aiUsage:                        [{sessionId, model, tokens, cost, action}]
workCycles:                     [{startDate, endDate, durationMs}]  # Reopened tracking
totalWorkDurationMs:            number                       # Accumulated work time
```

### Bug-Specific Fields
```
bugType:         string    # Bug classification
bugTypeList:     array     # Available bug types
registerDate:    string    # When bug was registered
rootCause:       string    # Root cause analysis (on close)
resolution:      string    # How it was resolved (on close)
cinemaFile:      string    # Cinema4D file reference
exportedFile:    string    # Exported file reference
priority:        string    # From fixed enum (see bug priorities)
```

### Sprint-Specific Fields
```
startDate:       string    # Sprint start
endDate:         string    # Sprint end
locked:          boolean   # Immutable when tasks In Progress/To Validate
totalDevPoints:  number    # Sum of task devPoints
totalBizPoints:  number    # Sum of task businessPoints
```

### Status Lifecycles

**Tasks**: To Do → In Progress → To Validate → Done → Done&Validated (+ Blocked, Reopened)
**Bugs**: Created → Assigned → Fixed → Verified → Closed
**Proposals**: Pending → Planned → Rejected

### Transition Requirements

| Transition | Required Fields |
|-----------|----------------|
| To Do → In Progress | developer, validator, epic, sprint, devPoints, businessPoints, acceptanceCriteria, startDate |
| In Progress → To Validate | startDate, endDate, commits, pipelineStatus.prCreated |
| To Validate → Done | Only validator can do this |
| To Validate → Done&Validated | Only validator/covalidator |

---

## 5. FIREBASE DATA STRUCTURE (V1 — RTDB)

```
/projects/{projectId}/
  name, abbreviation, description, repoUrl, scoringSystem
  developers: [{id, name, email}]
  stakeholders: [{id, name, email}]
  statuses: {tasks: [...], bugs: [...]}
  agentsGuidelines: string

/cards/{projectId}/
  TASKS_{projectId}/{firebaseId}/     → task card data
  BUGS_{projectId}/{firebaseId}/      → bug card data
  EPICS_{projectId}/{firebaseId}/     → epic card data
  SPRINTS_{projectId}/{firebaseId}/   → sprint card data
  PROPOSALS_{projectId}/{firebaseId}/ → proposal card data
  QA_{projectId}/{firebaseId}/        → QA card data

/users/{encodedEmail}/
  name, email, developerId, stakeholderId
  projects: {projectId: {role, permissions}}

/data/
  developers/{devId}/         → {name, email}
  stakeholders/{stkId}/       → {name, email}
  projectsByUser/{email}/     → project access map
  appAdmins/{email}/          → admin flag
  teams/{teamId}/             → team grouping

/history/{projectId}/{cardType}/{cardId}/
  {pushId}: {changedBy, timestamp, changes: {field: {from, to}}}

/stateTransitions/{projectId}/{cardType}/{cardId}/
  firstInProgressDate, validationCycles, reopenCycles, transitions

/developerBacklogs/{developerId}/
  items: {cardKey: {cardId, projectId, status, title}}
  order: [cardKey1, cardKey2, ...]

/plans/{projectId}/{planId}/
  title, objective, status, phases: [...]

/planProposals/{projectId}/{proposalId}/
  title, description, status, tags, planIds

/adrs/{projectId}/{adrId}/
  title, context, decision, consequences, status

/global/
  agents/{configId}/       → agent configurations
  prompts/{configId}/      → prompt templates
  instructions/{configId}/ → coding instructions
  guidelines/{configId}/   → project guidelines (versioned)

/notifications/{sanitizedEmail}/{notifId}/
  title, message, type, timestamp, read

/userTokens/{sanitizedEmail}/
  token, timestamp, email
```

---

## 6. CLOUD FUNCTIONS (28 functions)

### Card Lifecycle Triggers
| Function | Trigger | Purpose |
|----------|---------|---------|
| `onTaskStatusValidation` | RTDB write on task status | Validate transitions, revert invalid, enforce required fields |
| `onCardToValidate` | RTDB write | Notify validator when task reaches "To Validate" |
| `onBugFixed` | RTDB write | Notify when bug is marked "Fixed" |
| `onTaskReopen` | RTDB write | Handle task reopening workflow |
| `onTaskDoneValidated` | RTDB write | Handle validation completion |

### Sync Functions
| Function | Trigger | Purpose |
|----------|---------|---------|
| `syncCardToFirestore` | RTDB write | Mirror card data RTDB → Firestore |
| `syncProjectToFirestore` | RTDB write | Mirror project data |
| `syncCardViews` | RTDB write | Maintain optimized card views (70-80% size reduction) |

### Email Functions (MS Graph API)
| Function | Trigger | Purpose |
|----------|---------|---------|
| `weeklyTaskSummary` | Scheduled (weekly) | Email digest of task status |
| `hourlyValidationDigest` | Scheduled (hourly) | Pending validation reminders |

### Auth & Admin Functions
| Function | Trigger | Purpose |
|----------|---------|---------|
| `setEncodedEmailClaim` | Auth onCreate | Set custom claims on user creation |
| `requestEmailAccess` | Callable | User provisioning request |
| `addAppAdmin` | Callable | Add admin permissions |
| `syncAppAdminClaim` | RTDB write | Sync admin status to custom claims |
| `updateAppPermissions` | RTDB write | Sync project permissions to claims |

### AI Functions (Claude Integration)
| Function | Trigger | Purpose |
|----------|---------|---------|
| `generateAcceptanceCriteria` | Callable | Generate Gherkin AC from user story |
| `analyzeBugDescription` | Callable | Analyze bug report, suggest priority |
| `createTasksFromPlan` | Callable | Generate tasks from development plan |
| `parseDocumentForCards` | Callable | Parse uploaded document into cards |

### Counter Functions
| Function | Trigger | Purpose |
|----------|---------|---------|
| `projectCounters` | Firestore write | Maintain project-level counters |

---

## 7. SERVICES ARCHITECTURE (37 services)

### Core Data Services
| Service | Responsibility | Firebase Paths |
|---------|---------------|----------------|
| `FirebaseService` | Central CRUD for all entities | `/cards/*`, `/projects/*`, `/users/*` |
| `CardService` | Card ordering, filtering, validation | `/cards/*` |
| `CardRealtimeService` | Real-time per-card listeners | `/cards/{projectId}/{section}/{id}` |
| `GlobalDataManager` | Centralized state (projects, devs, sprints) | Multiple paths |
| `DALService` | Data access layer abstraction | Wraps Firebase |

### Permission & Auth
| Service | Responsibility |
|---------|---------------|
| `PermissionService` | Role-based access per card type |
| `EntityDirectoryService` | Developer/stakeholder ID ↔ email resolution |
| `UserDirectoryService` | User display name resolution |

### Workflow
| Service | Responsibility |
|---------|---------------|
| `HistoryService` | Differential change tracking (audit trail) |
| `StateTransitionService` | Status transition recording and validation |
| `DeveloperBacklogService` | Per-developer task ordering, WIP enforcement |

### Planning
| Service | Responsibility |
|---------|---------------|
| `PlanService` | Development plans CRUD |
| `PlanProposalService` | Plan proposals CRUD |
| `AdrService` | Architecture Decision Records CRUD |
| `GlobalConfigService` | Shared configs (agents, prompts, guidelines) |

### UI
| Service | Responsibility |
|---------|---------------|
| `ModalService` | Modal stack management (LIFO), z-index |
| `ThemeManagerService` | CSS variable theme system (dark/light/custom) |
| `PushNotificationService` | FCM integration, token management |
| `UpdateService` | App version checking (GitHub releases) |

### Communication
| Service | Responsibility |
|---------|---------------|
| `AppEventBus` | Promise-based pub/sub (`emit`, `once`, `waitFor`) |
| `ServiceCommunicator` | Request/response between services via events |
| `EventDelegationManager` | Centralized DOM event delegation |

---

## 8. WEB COMPONENTS (49 components)

### Card Components (extend BaseCard)
| Tag | Purpose | Key Features |
|-----|---------|-------------|
| `<task-card>` | Task editing | User story (Como/Quiero/Para), AC, points, sprint, implementation plan |
| `<bug-card>` | Bug editing | Priority enum, register date, root cause, Cinema4D fields |
| `<proposal-card>` | Proposal editing | User story format, convert to task |
| `<epic-card>` | Epic editing | Type tracking, related tasks |
| `<sprint-card>` | Sprint editing | Dates, points summary, locked state |
| `<qa-card>` | QA item editing | Suite grouping, pass/fail |

### BaseCard (abstract) — 36 reactive properties
Key methods: `_showNotification()`, `_showSavingOverlay()`, `_hideSavingOverlay()`, `showDeleteModal()`, concurrent edit protection

### Filter Components
| Tag | Purpose |
|-----|---------|
| `<unified-filters>` | Combined task/bug filters (year, status, dev, priority, sprint, epic) |
| `<task-filters>` | Task-specific filters |
| `<bug-filters>` | Bug-specific filters |

### Navigation & Layout
| Tag | Purpose |
|-----|---------|
| `<app-manager>` | App initialization (auth, theme, data loading) |
| `<color-tabs>` / `<color-tab>` | Tabbed interface with colored borders |
| `<year-selector>` | Year picker (persists in localStorage) |
| `<project-selector>` | Project dropdown |
| `<notification-bell>` | Bell icon with unread count |
| `<update-manager>` | Version update notifications |

### Data Visualization
| Tag | Purpose |
|-----|---------|
| `<gantt-chart>` | Gantt timeline visualization |
| `<sprint-points-chart>` | Burndown/velocity chart |
| `<card-history-viewer>` | Card change history viewer |

### Admin Components
| Tag | Purpose |
|-----|---------|
| `<entity-directory-manager>` | Developers/stakeholders admin panel |
| `<guidelines-manager>` | Guidelines CRUD with markdown editor |
| `<dev-plans-section>` | Development plans management |
| `<theme-editor>` | Theme customization UI |
| `<project-form>` | Project create/edit form |
| `<global-proposals-list>` | Cross-project proposals |

### Upload Components
| Tag | Purpose |
|-----|---------|
| `<firebase-storage-uploader>` | File upload to Firebase Storage |
| `<ai-document-uploader>` | AI-powered doc → cards |
| `<story-upload>` | Bulk story import |
| `<project-card-upload>` | Bulk card import |

### Utility Components
| Tag | Purpose |
|-----|---------|
| `<slide-notification>` | Toast notifications |
| `<push-notification>` | FCM push handler (native HTMLElement) |
| `<system-requirements-checker>` | Browser/hardware validation |

---

## 9. RENDERING SYSTEM (5 renderers + 5 view managers)

### Renderers (produce DOM)
| Renderer | Output |
|----------|--------|
| `TableRenderer` | HTML table with sortable columns |
| `ListRenderer` | Flex card grid |
| `KanbanRenderer` | Status columns with drag-drop |
| `SprintRenderer` | Sprint columns with drag-drop |
| `GanttRenderer` | Gantt chart web component |

### View Managers (handle interactions)
| Manager | Responsibility |
|---------|---------------|
| `TableViewManager` | Sorting, editing, row interactions |
| `ListViewManager` | Card layout, interactions |
| `KanbanViewManager` | Drag-drop between status columns |
| `SprintViewManager` | Drag-drop between sprints |
| `EpicViewManager` | Epic grouping, Gantt interactions |

### ViewFactory
Orchestrates view switching: caches rendered views, listens to year/filter changes, coordinates renderers + managers.

---

## 10. KEY BUSINESS RULES

1. **WIP Limit**: Only 1 task "In Progress" per developer (BecarIA/AI can have multiple)
2. **Priority Formula**: `priority = (businessPoints / devPoints) * 100` — NEVER stored directly
3. **Self-assignment only**: Developers can only assign tasks to themselves (except SuperAdmin)
4. **Validator approval**: Only validators can transition To Validate → Done/Done&Validated
5. **Pipeline required**: commits + PR info required to move to "To Validate"
6. **Sprint immutability**: Sprint dates locked when tasks are In Progress or To Validate
7. **Year filtering**: Cards filtered by year, past years read-only (except SuperAdmin)
8. **Email encoding**: `@ → |`, `. → !` for Firebase keys (legacy, migrate to custom claims)
9. **Card IDs**: Format `{PROJECT}-{TYPE}-{NUMBER}` auto-generated, immutable
10. **History**: Differential-only tracking (only changed fields saved)

---

## 11. THEME SYSTEM

- CSS custom properties on `:root` (`--bg-primary`, `--text-primary`, etc.)
- Persisted in localStorage (`pgxp-theme-config`)
- Inline blocking script prevents FOUC
- Dark/light mode + custom colors
- ThemeEditor component for admin customization

---

## 12. REAL-TIME COLLABORATION

- `CardRealtimeService`: Per-card Firebase listeners (subscribe on expand/modal, unsubscribe on close)
- Concurrent edit protection: ownership lock per card, warning if another user editing
- Live Kanban updates: cards move between columns in real-time
- Notification bell: real-time unread count

---

## 13. MCP SERVER (45+ tools)

### Tool Categories
| Category | Tools |
|----------|-------|
| Projects | list, get, update, create, discover |
| Cards | list, get, create, update, relate, transition_rules |
| Sprints | list, get, create, update |
| Team | list_developers, list_stakeholders |
| ADRs | list, get, create, update, delete |
| Plans | list, get, create, update, delete |
| Plan Proposals | list, get, create, update, delete |
| Global Config | list, get, create, update, delete |
| Guidelines | sync, get_history, restore_version |
| Users | setup_mcp_user, provision_user, delete_user |
| Diagnostics | pg_doctor, pg_config |
| Admin | get_mcp_status, update_mcp, publish_mcp_version |

### MCP Features
- Fuzzy project resolution (name, abbreviation, URL)
- Instance metadata in every response
- Auto-versioning guidelines
- Setup wizard (`planning-game-mcp init`)
- Guidelines auto-check on startup
- Status transition validation with clear error messages

---

## 14. DAL LAYER (prepared for migration)

### Current Architecture
```
Mode: RTDB_ONLY (production)
Prepared modes: DUAL_WRITE → READ_SWITCH → FIRESTORE_ONLY

shared/dal/
  base-repository.js          # Abstract interface
  repository-factory.js       # Mode switching
  card-repository.js          # Card interface
  project-repository.js       # Project interface
  counter-service.js          # Counter interface
  rtdb/                       # RTDB implementations (active)
  firestore/                  # Firestore implementations (ready, inactive)
  dual-write-card-repository.js   # Write to both (prepared)
  read-switch-card-repository.js  # Switch read source (prepared)
```

### Migration Path
1. **RTDB_ONLY** (current) — All reads/writes go to RTDB
2. **DUAL_WRITE** — Writes go to both RTDB + Firestore, reads from RTDB
3. **READ_SWITCH** — Writes go to both, reads switch to Firestore
4. **FIRESTORE_ONLY** — Full Firestore, RTDB deprecated

---

## 15. TESTING STRUCTURE

### Unit Tests (Vitest)
- Mirror source structure in `/tests/`
- Path alias: `@` → `/public/js`
- Coverage targets: Services 80%, Utils 90%, Components 70%

### E2E Tests (Playwright)
- Dev server on `http://localhost:4321`
- Auto OAuth + 2FA flow
- TestDataManager for unique test data
- Auto-cleanup after each run

---

## 16. V2 IMPROVEMENT OPPORTUNITIES

### Architecture
- [ ] Unified state management (replace GlobalDataManager + AppEventBus)
- [ ] Firestore as primary DB (subcollections, composite indexes, security rules)
- [ ] Typed data layer (TypeScript)
- [ ] Component library with design tokens
- [ ] Server-side rendering for initial load performance

### UX/UI
- [ ] Modern design system (consistent spacing, typography, colors)
- [ ] Responsive mobile-first layout
- [ ] Accessibility (WCAG 2.1 AA)
- [ ] Keyboard navigation throughout
- [ ] Better onboarding flow
- [ ] Contextual help/tooltips
- [ ] Inline editing (reduce modal dependency)
- [ ] Better Kanban UX (swimlanes, WIP indicators)
- [ ] Dashboard with actionable insights (not just charts)

### Features
- [ ] Comments/discussions on cards
- [ ] @mentions and notifications
- [ ] Time tracking (built-in, not calculated)
- [ ] Custom fields per project
- [ ] Saved filter presets
- [ ] Bulk operations (multi-select cards)
- [ ] Card templates
- [ ] Sprint retrospective support
- [ ] Integration with GitHub Issues/PRs (two-way sync)

### Technical Debt
- [ ] Remove email encoding (use custom claims fully)
- [ ] Remove legacy filter system (unify to UnifiedFilterService)
- [ ] Remove fallback chains (`||` for IDs)
- [ ] Consolidate duplicate developer data sources
- [ ] Remove Cinema4D-specific code (generalize file references)

---

## 17. PROPOSED V2 FIRESTORE SCHEMA

```
/projects/{projectId}
  name, abbreviation, description, repoUrl, scoringSystem
  team: {developers: [{id, name, email}], stakeholders: [...]}
  settings: {statuses, scoringSystem, guidelines}

/projects/{projectId}/cards/{cardId}
  All card fields (tasks, bugs, epics, proposals, QA, sprints)
  type: "task" | "bug" | "epic" | "proposal" | "qa" | "sprint"
  Composite indexes: [type+status], [type+year], [type+developer], [type+sprint]

/projects/{projectId}/cards/{cardId}/history/{historyId}
  changedBy, timestamp, changes: {field: {from, to}}

/projects/{projectId}/plans/{planId}
  title, objective, status, phases

/projects/{projectId}/adrs/{adrId}
  title, context, decision, consequences, status

/users/{userId}
  name, email, developerId, stakeholderId
  projects: {projectId: role}
  backlog: {order: [], items: {}}
  notifications: subcollection

/global/config/{type}/{configId}
  agents, prompts, instructions, guidelines (with versioning)

/counters/{projectId}
  tasks, bugs, epics, sprints, proposals, qa (atomic increments)
```

### Advantages of Firestore
- Subcollections (cards under projects, history under cards)
- Composite queries (type + status + year in one query)
- Offline support (built-in)
- Better security rules (per-document)
- Real-time listeners with query support
- Automatic scaling

---

*Document generated: 2026-03-11*
*Source: Planning Game XP V1 codebase audit*

# Planning Game V2 — Implementation Phases

## Overview

6 phases, each delivers a working product increment.
Each phase = 1 prompt block that an AI agent can execute autonomously.

```
Phase 1: Foundation        → Project skeleton, auth, Firestore, design tokens
Phase 2: Core CRUD         → Cards, projects, team — the data backbone
Phase 3: Views             → Table, Kanban, Gantt — the visual layer
Phase 4: Workflow          → Status transitions, WIP, notifications, real-time
Phase 5: Advanced Features → Dashboard, plans, ADRs, admin, reports
Phase 6: MCP + Migration   → MCP server v2, migration script, deploy
```

---

## Phase 1: Foundation

**Goal**: Bootable app with auth, Firestore connection, design system, and navigation shell.

**Deliverables**:
- Astro project initialized with JavaScript (JSDoc + d.ts for types)
- Lit components setup with signals and context
- Firebase project configured (Auth, Firestore, Storage)
- Design token system (CSS custom properties, light/dark theme)
- Auth flow (Google + Microsoft OAuth via Firebase)
- App shell: nav bar, sidebar, auth gate, theme toggle
- Firestore security rules (base structure)
- Empty pages wired: `/`, `/projects`, `/project/[id]`, `/dashboard`, `/wip`, `/admin`
- CI: Vitest configured, Playwright scaffolded

**Key files**:
```
src/layouts/App.astro           # Auth gate + shell
src/lib/firebase.js             # Firebase init + typed helpers
src/lib/auth.js                 # Auth context provider
src/lib/store.js                # Signal-based reactive store
src/lib/types.d.ts              # Shared type definitions
src/styles/tokens.css           # Design tokens
src/styles/base.css             # Reset + globals
src/components/pg-nav.js        # Navigation component
src/components/pg-toast.js      # Toast notifications
firestore.rules                 # Security rules
```

**Acceptance criteria**:
- [ ] `npm run dev` serves the app on localhost
- [ ] Google/Microsoft login works, user stored in Firestore `/users/{uid}`
- [ ] Auth-protected routes redirect to login
- [ ] Light/dark theme toggle works, persists
- [ ] Design tokens applied consistently
- [ ] Navigation between all pages works (empty content OK)
- [ ] Firestore rules block unauthenticated access
- [ ] JSDoc + d.ts types enforced, zero untyped public APIs

---

## Phase 2: Core CRUD

**Goal**: Create, read, update, delete cards and projects. The data backbone.

**Deliverables**:
- `<pg-card>` polymorphic component (task, bug, epic, sprint, proposal, QA)
- `<pg-modal>` with form builder for card create/edit
- `<pg-form>` dynamic form based on card type schema
- Project CRUD (create, edit, archive, reorder)
- Team management per project (add/remove developers, stakeholders)
- Card creation with auto-generated IDs (PLN-TSK-0001)
- Card tagging system (free-form tags: INFRA, SW, REFACTOR, TESTS, GESTION...)
- Tag registry per project (name, color, description) for autocomplete and badges
- Card editing in modal (all fields by type)
- Card deletion (soft delete to trash)
- Zod schemas for validation (shared frontend + functions)
- Firestore converters for typed reads/writes
- Counter service for sequential card IDs
- History tracking (Firestore trigger writes diff on card update)

**Key files**:
```
src/components/pg-card.js       # Polymorphic card component
src/components/pg-modal.js      # Modal system
src/components/pg-form.js       # Dynamic form builder
src/components/pg-project.js    # Project management
src/components/pg-team.js       # Team member management
src/schemas/cards.js            # Zod validation schemas
src/lib/firestore.js            # Typed Firestore helpers + converters
functions/src/triggers/          # onWrite triggers for history
```

**Acceptance criteria**:
- [ ] Can create a project with name, abbreviation, team
- [ ] Can add developers and stakeholders to a project
- [ ] Can create task/bug/epic/sprint/proposal/QA cards
- [ ] Card IDs auto-generated: PLN-TSK-0001, PLN-BUG-0001, etc.
- [ ] Can edit any card field in modal
- [ ] Form validates required fields (Zod)
- [ ] History written automatically on every card update
- [ ] Can add/remove tags on any card (autocomplete from project registry)
- [ ] Tag registry manageable per project (name, color)
- [ ] Soft delete moves card to trash subcollection
- [ ] JSDoc + d.ts types enforced end-to-end
- [ ] Unit tests for schemas, converters, pure functions

---

## Phase 3: Views

**Goal**: Multiple ways to visualize cards — table, kanban, list, gantt.

**Deliverables**:
- `<pg-table>` sortable table with column configs per card type
- `<pg-board>` Kanban board (columns by status, drag-drop)
- `<pg-board mode="sprint">` Sprint board (columns by sprint)
- `<pg-gantt>` Gantt chart (epics + tasks timeline)
- `<pg-filters>` unified filter bar (type, status, year, developer, sprint, epic, tags, search)
- View switcher (table/kanban/list/gantt) with URL persistence
- List view = CSS grid of `<pg-card>` (no separate component needed)
- Filtered cards as computed signal (reactive, no manual refresh)
- Year selector with localStorage persistence
- Project page (`/project/[id]`) fully functional with tabs and views

**Key files**:
```
src/components/pg-table.js      # Sortable data table
src/components/pg-board.js      # Kanban/Sprint board with drag-drop
src/components/pg-gantt.js      # Gantt chart
src/components/pg-filters.js    # Unified filter bar
src/components/pg-year.js       # Year selector
src/components/pg-tabs.js       # Tab navigation
src/pages/project/[id].astro    # Project detail page
src/lib/filters.js              # Filter logic (pure functions)
```

**Acceptance criteria**:
- [ ] Table view: sortable columns, click row to open card modal
- [ ] Kanban view: columns by status, drag-drop changes status
- [ ] Sprint view: columns by sprint, drag-drop assigns sprint
- [ ] Gantt view: timeline shows epics and tasks
- [ ] List view: responsive card grid
- [ ] Filters: type, status, year, developer, sprint, epic, tags, free text search
- [ ] Tag filter: multi-select with colored badges, AND/OR logic
- [ ] Group-by tags in table and list views
- [ ] View selection persists in URL (`?view=kanban`)
- [ ] Year selection persists in localStorage
- [ ] Filtered state is reactive (change filter → instant update)
- [ ] Tabs: Tasks, Bugs, Sprints, Epics, Proposals, QA
- [ ] All views handle empty state gracefully

---

## Phase 4: Workflow

**Goal**: Business rules, real-time collaboration, notifications.

**Deliverables**:
- Status transition engine (pure functions + Cloud Function enforcement)
- WIP enforcement (1 task In Progress per developer)
- Real-time updates (Firestore `onSnapshot` on active queries)
- Concurrent edit detection (optimistic locking via `updatedAt`)
- Notification system (Firestore subcollection + `<pg-bell>`)
- FCM push notifications (Cloud Function on status change)
- Pipeline tracking (commits, PR, merge, deploy metadata)
- Work cycles tracking (In Progress time accounting)
- Sprint immutability (locked when tasks in progress)
- Developer backlog page (`/wip`)
- Validator dashboard (`/cleanview` equivalent)
- Permission enforcement in UI (disable buttons, hide fields)

**Key files**:
```
src/lib/transitions.js          # Status transition rules (pure)
src/lib/permissions.js          # Permission checks (pure)
src/components/pg-bell.js       # Notification bell
src/components/pg-wip.js        # WIP dashboard
src/pages/wip.astro             # WIP page
functions/src/triggers/
  on-card-update.js             # Validate transitions, track cycles
  on-status-change.js           # Notify validator, update backlog
functions/src/scheduled/
  validation-digest.js          # Hourly reminder emails
```

**Acceptance criteria**:
- [ ] Can't transition without required fields (UI shows what's missing)
- [ ] Only 1 task In Progress per developer (enforced UI + server)
- [ ] Validators see "To Validate" cards, can approve/reject
- [ ] Cards update in real-time across browser tabs
- [ ] Concurrent edit shows warning, doesn't overwrite silently
- [ ] Notification bell shows unread count, click opens list
- [ ] Push notifications on: task assigned, status change, mention
- [ ] WIP page shows per-developer In Progress tasks
- [ ] Work cycles tracked (start/end times, accumulated duration)
- [ ] Sprint dates locked when cards are In Progress
- [ ] Past year cards read-only (except SuperAdmin)

---

## Phase 5: Advanced Features

**Goal**: Dashboard, plans, ADRs, admin tools, reports.

**Deliverables**:
- Dashboard page with multi-project charts
- Sprint burndown / velocity charts
- Development plans CRUD
- Plan proposals CRUD
- Architecture Decision Records (ADRs) CRUD
- Global config management (agents, prompts, guidelines)
- Guidelines with versioning and sync
- Admin console: user provisioning, trash recovery, reports
- Hours/workday reports
- AI-assisted features: generate AC from user story, analyze bugs
- Upload stories (CSV/JSON import)
- Project settings page (statuses, scoring, guidelines)

**Key files**:
```
src/pages/dashboard.astro
src/pages/admin.astro
src/components/pg-chart.js      # Chart wrapper (Chart.js or similar)
src/components/pg-plans.js      # Plans management
src/components/pg-adrs.js       # ADR management
src/components/pg-config.js     # Global config management
src/components/pg-upload.js     # File upload + import
functions/src/callable/
  generate-ac.js                # AI: acceptance criteria
  analyze-bug.js                # AI: bug analysis
  import-cards.js               # Bulk card import
```

**Acceptance criteria**:
- [ ] Dashboard shows burndown charts for selected projects
- [ ] Can create/edit development plans with phases
- [ ] Can create/manage ADRs per project
- [ ] Global config CRUD (guidelines with versioning)
- [ ] Admin can provision users, recover from trash
- [ ] Hours report shows worked time per developer
- [ ] AI generates acceptance criteria from user story description
- [ ] CSV/JSON import creates cards in batch
- [ ] All features respect permissions

---

## Phase 6: MCP Server + Migration

**Goal**: JavaScript MCP server, migration script, production deploy.

**Deliverables**:
- MCP server rewritten in JavaScript (JSDoc + d.ts)
- All 45+ tools migrated to Firestore backend
- Setup wizard (`planning-game-mcp init`)
- Guidelines sync tool
- Migration script: V1 RTDB → V2 Firestore
- Data validation (counts, integrity checks)
- E2E tests covering critical paths
- Performance audit (Lighthouse, bundle size)
- Production deploy to new Firebase project
- DNS switchover plan

**Key files**:
```
mcp/src/index.js                # MCP entry point
mcp/src/tools/*.js              # All MCP tools (JSDoc + d.ts)
mcp/src/services/*.js           # Firestore operations
scripts/migrate-v1-to-v2.js     # Migration script
scripts/validate-migration.js   # Post-migration checks
```

**Acceptance criteria**:
- [ ] All MCP tools work against Firestore
- [ ] `planning-game-mcp init` configures new instance
- [ ] Migration script transforms V1 data → V2 schema
- [ ] Validation script confirms zero data loss
- [ ] E2E tests pass: create project → create task → kanban → validate → done
- [ ] Lighthouse performance score > 90
- [ ] Bundle size < 200KB (excluding Lit)
- [ ] Production deployment successful
- [ ] V1 stays read-only as backup

---

## Execution Strategy

### Per-phase workflow
1. Generate detailed prompt for the phase
2. AI implements phase in a feature branch
3. Review + corrections
4. Merge to main
5. Deploy to staging Firebase project
6. Manual validation
7. Next phase

### Estimated scope
| Phase | Components | LOC estimate | Complexity |
|-------|-----------|-------------|------------|
| 1. Foundation | 3 | ~1,500 | Low |
| 2. Core CRUD | 5 | ~3,000 | Medium |
| 3. Views | 6 | ~3,500 | Medium-High |
| 4. Workflow | 4 | ~2,500 | High |
| 5. Advanced | 6 | ~3,000 | Medium |
| 6. MCP + Migration | - | ~4,000 | High |
| **Total** | **~20** | **~17,500** | |

Compare with V1: 49 components, 37 services, ~50,000+ LOC.
V2 targets **~1/3 of the code** for the same functionality.

### Firebase projects
- **V2 Development**: New Firebase project for development/staging
- **V2 Production**: New Firebase project for production
- **V1 Production**: Keep running, read-only after migration
- Switchover: DNS redirect + update MCP configs + notify users

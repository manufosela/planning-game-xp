# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- @import "ARCHITECTURE.md" -->
<!-- @import "FIREBASE_REALTIME_DATABASE_STRUCTURE.md" -->
<!-- @import "CARD_API.md" -->

## Communication & Commit Guidelines

### Language Preferences
- **User communication**: Always speak to the user in Spanish
- **Code, comments, variables, functions**: Always in English

### Git Commits
- **NEVER** include references to Claude or AI in commit messages
- **NEVER** add "Generated with Claude Code" or similar footers
- **NEVER** add "Co-Authored-By: Claude" or similar attributions
- Keep commit messages clean and professional, as if written by a human developer, follow **conventional commits**

### UI/UX Guidelines
- **NEVER** use native browser dialogs (`alert()`, `confirm()`, `prompt()`)
- Always use the application's modal system (`ModalService` or `AppModal` component)
- Modals should follow the existing design patterns in the codebase

### Async/Event Guidelines
- **NEVER** use `setTimeout` for synchronization or waiting for async operations
- Use proper event-driven patterns instead:
  - **AppEventBus**: For component synchronization (`AppEventBus.once()`, `AppEventBus.waitFor()`)
  - **Lit lifecycle**: Use `updateComplete.then()` or `firstUpdated()` instead of `setTimeout(fn, 10)`
  - **DOM events**: Use `addEventListener` with `{ once: true }` for one-time events
  - **requestAnimationFrame**: Only for waiting for next render frame (not for arbitrary delays)
- `setTimeout` is only acceptable for:
  - Debouncing user input (e.g., search)
  - Retry mechanisms with exponential backoff
  - CSS animations timing
- See `docs/SETTIMEOUT_TECHNICAL_DEBT.md` for detailed guidelines

## Development Commands

### Core Development

```bash
npm run dev              # Start development server with .env.dev
npm run emulator         # Start Firebase emulator with demo data (Firestore:8080, Database:9000, Storage:9199, UI:4000)
npm run emulator:export  # Export current emulator data (optional, for backup)
npm run build            # Production build with security check
npm run build-preview    # Preview build with .env.pre
npm run build-prod       # Production build with .env.pro
npm run generate-sw      # Generate service worker
```

### Testing

```bash
npm run test             # Run unit tests (Vitest)
npm run test:coverage    # Run tests with coverage
npm run test:watch       # Run tests in watch mode
npm run test:e2e         # Run E2E tests (Playwright)
npm run test:e2e:ui      # Run E2E tests with UI
npm run test:e2e:debug   # Debug E2E tests
```

### Single Test Execution

```bash
npm test -- tests/specific-test.test.js    # Run specific unit test file
npm test -- -t "test name"                 # Run test by name pattern
npx playwright test specific.spec.js       # Run specific E2E test
npm run test:e2e:cleanup                   # Clean up E2E test data manually
npm run test:e2e:headed                    # Run E2E tests with browser visible
npm run test:e2e:report                    # Show Playwright test report
```

### Deployment

```bash
npm run deploy           # Deploy to Firebase hosting (dist directory)
npm run deploy:functions # Deploy only Cloud Functions
npm run deploy:hosting   # Deploy only hosting
npm run deploy:rules     # Deploy Firestore and Database rules
npm run security-check   # Run security audit (blocks build if vulnerabilities found)
npm run security:fix     # Fix security vulnerabilities automatically
```

### Emulator-Specific Commands

```bash
npm run emulator:check   # Check emulator status and verify demo data is loaded
npm run emulator:export  # Export emulator data for backup
./scripts/emulation/start-emulators.sh  # Direct emulator start with demo data loading
```

## Architecture Overview

### Tech Stack

- **Frontend**: Astro (v5.10.0) with Lit web components
- **Backend**: Firebase (Realtime Database, Firestore, Auth, Cloud Functions, Storage, FCM)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Current Version**: See `package.json` (auto-incremented on each build)

### Application Type

Agile project management application following eXtreme Programming (XP) practices for managing Sprints, Epics, Tasks, Bugs, Proposals, and QA items.

### Key Architectural Patterns

1. **Service-Oriented Architecture** - Centralized services for core functionality
2. **Event Delegation Pattern** - Single event listeners with centralized management
3. **Factory Pattern** - CardFactory and ViewFactory for different types/views
4. **Web Component Architecture** - Lit-based components with reactive properties

### Critical Services

- **Permission Service** (`/public/js/services/permission-service.js`) - Role-based access control
- **Filter Service** (`/public/js/services/filter-service.js`) - Generic filtering system
- **Modal Service** (`/public/js/services/modal-service.js`) - Modal management with LIFO stacking
- **Event Delegation Manager** (`/public/js/events/event-delegation-manager.js`) - Centralized event handling
- **Firebase Service** (`/public/js/services/firebase-service.js`) - Central Firebase operations
- **Card Service** (`/public/js/services/card-service.js`) - CRUD operations for all card types
- **Card Realtime Service** (`/public/js/services/card-realtime-service.js`) - Real-time data synchronization
- **Push Notification Service** (`/public/js/services/push-notification-service.js`) - FCM integration
- **Global Data Manager** (`/public/js/services/global-data-manager.js`) - Centralized state management
- **Update Service** (`/public/js/services/update-service.js`) - Application version management
- **History Service** (`/public/js/services/history-service.js`) - Change tracking and audit trail
- **System Requirements Service** (`/public/js/services/system-requirements-service.js`) - System compatibility verification
- **Entity Directory Service** (`/public/js/services/entity-directory-service.js`) - Developer/Stakeholder resolution
- **User Directory Service** (`/public/js/services/user-directory-service.js`) - User display name resolution

### Main Entry Points

- **App Bootstrap**: `/public/js/main.js` - Component imports and AppController initialization
- **App Controller**: `/public/js/controllers/app-controller.js` - Main application coordinator
- **Astro Pages**: `/src/pages/`
  - `index.astro` - Main tasks/bugs view with filters
  - `dashboard.astro` - Project dashboard
  - `adminproject.astro` - Project administration (developers, stakeholders, settings)
  - `sprintview.astro` - Sprint planning and backlog management
  - `proposals.astro` - Global proposals view across all projects
  - `development.astro` - Development metrics and charts
  - `wip.astro` - Work in progress view

### Project Structure

```
public/js/
├── services/          # Centralized services (v1.2.0 refactoring)
├── controllers/       # Application controllers
├── events/           # Event delegation system
├── wc/               # Web Components (Lit-based)
├── renderers/        # View renderers
├── factories/        # Factory patterns
├── filters/          # Filtering system
├── utils/           # Utility functions
└── constants/       # Application constants

src/
├── pages/           # Astro pages
├── layouts/         # Page layouts
└── firebase/        # Firebase configuration

functions/           # Firebase Cloud Functions
tests/              # Unit tests (Vitest)
playwright/         # E2E tests
scripts/            # Build and maintenance scripts
```

### Environment & Configuration

- **Environment Files**: `.env.dev`, `.env.pre`, `.env.pro` (from Google Drive `APP-CONFIG/Planning-GameXP`)
- **Firebase Config**: Auto-generated from environment variables
- **Build Directory**: `dist` (NOT `public` - critical for Firebase deployment)
- **Firebase Project**: `planning-gamexp`

### Key Features

- Multi-view support (List, Kanban, Sprint, Gantt)
- Real-time collaboration via Firebase Realtime Database
- Role-based permissions (Admin, User, Consultant)
- Push notifications via Firebase Cloud Messaging
- File upload via Firebase Storage
- Advanced filtering and search capabilities
- **Year-based filtering** for all card types (Tasks, Bugs, Proposals, Sprints)
- **Backlog migration** between years (move incomplete tasks to next year)
- **Project archiving** with drag-and-drop ordering
- **Global Proposals view** with cross-project visibility
- **AI-generated acceptance criteria** using Cloud Functions

### Task Assignment & WIP Rules

**Developer Assignment:**
- Tasks are created without a developer assigned (status: "To Do" by default)
- Developers can **only self-assign** tasks to themselves
- Only **SuperAdmin** can assign tasks to other developers
- Developer field uses stable IDs (`dev_XXX` format) from `/data/developers`

**Work In Progress (WIP) Rules:**
- Each developer can have **only ONE task "In Progress"** across ALL projects
- The system must enforce this limit when changing status to "In Progress"
- WIP page (`/wip`) shows current In Progress tasks per developer

**Developer Backlog:**
- Located at `/wip` page, tab "Backlog por developer"
- Shows all tasks assigned to each developer (status "To Do" or "In Progress")
- Data stored in `/developerBacklogs/{developerId}` with structure:
  ```json
  {
    "order": ["cardKey1", "cardKey2"],
    "items": {
      "cardKey1": { "cardId", "projectId", "cardType", "title", "status" }
    }
  }
  ```
- Backlog is updated automatically when:
  - A task with "To Do" status is assigned to a developer → added to backlog
  - A task changes to "In Progress" → removed from backlog (shown in WIP)
  - A task is completed ("Done") → removed from backlog
  - Developer is unassigned from task → removed from their backlog

**Manual Sync:**
- SuperAdmin can trigger "Sincronizar Backlogs" button to scan all projects
- Finds all "To Do" tasks with assigned developers and adds to their backlogs

### Card Data Model

All cards (Tasks, Bugs, Epics, Proposals, QA, Sprints) follow a common structure:

- **Card ID Format**: `{PROJECT_PREFIX}-{TYPE}-{NUMBER}` (e.g., `C4D-TSK-0001`, `NTR-BUG-0055`)
- **Firebase Structure**: Stored in `/cards/{projectName}/{cardType}_{projectName}/{cardId}/`
- **Required Fields**: `cardId`, `cardType`, `title`, `createdBy`, `projectId`
- **Common Fields**: `status`, `priority`, `developer`, `description`, `sprint`, `endDate`, `year`
- **Type-Specific Fields**:
  - Tasks: `devPoints`, `businessPoints`, `assignee`, `assigneeEmail`, `acceptanceCriteriaStructured`
  - Bugs: `bugType`, `bugTypeList`, `cinemaFile`, `exportedFile`
  - Epics: `epicType`, `epicTypeList`
  - Proposals: `acceptanceCriteriaStructured` (when converted to task)

### Year Management

Cards are filtered by year using the `year` field:

- **Year field**: All cards (Tasks, Bugs, Proposals, Sprints) have a `year` field
- **YearSelector component**: Located in header, persists selection in localStorage
- **Migration script**: `scripts/migrate-add-year-field.js` adds year field to existing data
- **Backlog migration**: Tasks/Bugs/Proposals without sprint can be migrated to next year
- **Sprint filtering**: Sprint options are filtered by selected year

### Development Setup Requirements

1. Firebase emulators run on multiple ports:
   - **Firestore**: port 8080
   - **Realtime Database**: port 9000 (with demo data auto-import)
   - **Storage**: port 9199 (with demo files)
   - **Emulator UI**: port 4000
2. Environment files must be copied from Google Drive (`APP-CONFIG/Planning-GameXP`)
3. Firebase CLI required for deployment
4. Service worker auto-generated via `npm run generate-sw`
5. Demo data automatically loaded from `emulator-data/database_export/`

### Important Notes

- Always use `dist` directory for Firebase hosting (never `public`)
- Firebase emulator required for local development
- Configuration files auto-generated on startup:
  - **Development**: `public/firebase-config.js` - Firebase SDK initialization with emulator connections
  - **Production**: `dist/firebase-config.js` - Firebase SDK initialization for production (generated during build)
  - `public/firebase-messaging-sw.js` - FCM service worker
  - `public/css/kanban-status-colors.css` - Theme colors
- **Dual Configuration System**: 
  - Development environment uses `/public/firebase-config.js` with emulator support
  - Production build generates `/dist/firebase-config.js` without emulator references
  - Ensures proper environment separation and prevents accidental emulator usage in production
- **Emulator Auto-Connection**: When running on localhost:
  - Automatically detects if emulators are running
  - Connects to available emulators (Firestore: 8080, Database: 9000, Storage: 9199)
  - Falls back to production if emulators are not available
  - Shows red bar at top when using emulators: "🔧 USANDO EMULADORES LOCALES"
- Recent v1.2.0 refactoring focuses on centralized services and reduced coupling
- Web components use separate style files for better maintainability
- Use SOLID principles
- Use DRY principles
- Use KISS principles
- Use YAGNI principles
- **NEVER use fallbacks** - The system either works or it doesn't. If it doesn't work, it must throw an error. Fallbacks hide problems and create technical debt. If data needs to be fixed/migrated, do it externally with a script (export JSON, fix, re-import).
  - **CRITICAL**: Never use `||` chains for critical data like IDs: `this.firebaseId || this.id` is FORBIDDEN
  - **BAD**: `return this._firebaseId || this.getAttribute('data-id') || this.id;`
  - **GOOD**: `return this._firebaseId || '';` (empty string, then validate)
  - **BETTER**: `if (!this._firebaseId) throw new Error('firebaseId is required');`
  - When a required value is missing, throw an error or show a notification - never silently use a wrong value

### Coding Conventions

- **Logging**:
  - `sinsole` is **DEPRECATED** - do not use
  - Use `console.log` only for **temporary debugging** - remove before committing
  - Use `console.error` and `console.warn` for errors and warnings that should persist
  - User feedback should use UI notifications, not console
- **Component Communication**: All web components communicate via events
  - Components identified by `id` and `type`
  - No coupling between components except parent-child relationships
  - Use `ServiceCommunicator` for inter-service communication
- **Card Architecture**: All card components extend from `BaseCard`
  - Cards have Firebase ID and internal ID (different purposes)
  - BaseCard provides common functionality (modals, permissions, notifications)
- **Design Principles**: Follow SOLID, DRY, KISS, YAGNI
- **Testing**: Path alias `@` maps to `/public/js` in tests
- **E2E Tests**: 
  - Development server runs on `http://localhost:4321`
  - Tests use automatic authentication with Microsoft OAuth + 2FA flow
  - Test data automatically cleaned up after each test run
  - Uses TestDataManager for unique test identifiers

### Test-First Development (MANDATORY)

**All changes MUST follow this test-first workflow:**

1. **Before ANY code change** (refactor, bug fix, new feature):
   - Check if tests exist for the affected code (`npm test -- tests/path/to/test.test.js`)
   - If NO tests exist: **CREATE TESTS FIRST** before making any changes
   - If tests exist: Run them to verify current behavior (`npm test`)

2. **Step-by-step implementation**:
   - Make ONE small change at a time
   - Run tests after EACH change: `npm test`
   - Fix any failing tests before proceeding
   - Never batch multiple changes without testing

3. **Test coverage requirements**:
   - All public methods/functions must have tests
   - All services in `/public/js/services/` must have corresponding tests in `/tests/services/`
   - All utilities in `/public/js/utils/` must have tests in `/tests/utils/`
   - Web components should have tests for critical functionality

4. **Creating new tests**:
   - Place tests in `/tests/` mirroring the source structure
   - Use descriptive test names: `should [expected behavior] when [condition]`
   - Include edge cases and error scenarios
   - Run with coverage to verify: `npm run test:coverage`

5. **Never skip tests**:
   - If tests fail, FIX the issue before continuing
   - If you need to modify expected behavior, update tests FIRST
   - Document why tests were changed in commit messages

```bash
# Workflow example for modifying a service:
npm test -- tests/services/my-service.test.js  # 1. Run existing tests
# If no tests exist, create them first
npm test                                        # 2. Run after each change
npm run test:coverage                           # 3. Verify coverage
```

### Development Workflow

1. **Initial Setup**:
   - Copy environment files from Google Drive (`APP-CONFIG/Planning-GameXP`)
   - Run `npm run emulator` in one terminal (loads demo data automatically)
   - Run `npm run dev` in another terminal
   - Access Emulator UI at `http://localhost:4000` to view data

2. **Before Committing**:
   - Security checks run automatically via husky pre-commit hooks (syntax + security)
   - Run tests manually (`npm test` and/or `npm run test:e2e`) only when changes are risky:
     - Important refactors touching multiple files
     - New features that affect several integration points
     - Changes to core services (firebase-service, card-service, etc.)
   - For punctual fixes (adding a listener, small UI tweaks), unit tests are sufficient
   - **Regression tests on bug fixes**: When fixing a bug, create a unit test that reproduces the issue if it makes sense (the bug is reproducible with a unit test that adds real value). Do not force artificial tests for issues that can only be verified with integration or E2E testing.

3. **Deployment Process**:
   - Security check runs automatically before builds: `npm run security-check`
   - Build with appropriate environment: `npm run build-prod`
   - Deploy: `npm run deploy`
   - Verify deployment at Firebase project `planning-gamexp`

### MCP Card Workflow Rules

> **CRITICAL**: Follow the checklists in [MCP_WORKFLOW.md](./MCP_WORKFLOW.md) EXACTLY. Skipping steps will leave cards in incorrect states.
>
> Covers: Task workflow (4 phases), Bug workflow, Creating tasks/bugs, User identification, Automatic validation, Delivery pipeline tracking.

**Key rules summary:**
- ⛔ MCP **CANNOT** set tasks to "Done" or "Done&Validated" (validator's responsibility)
- ⛔ NEVER push directly to main - always use branches + PRs
- Branch naming: `feat/{CARD-ID}-description` (tasks), `fix/{CARD-ID}-description` (bugs)
- `pipelineStatus.prCreated` is **required** to transition tasks to "To Validate" or bugs to "Fixed"
- `aiUsage` is **required** when the developer is BecarIA (`dev_016`)
- User config stored in `.mcp-user.json` (gitignored)

### Database Maintenance Scripts

```bash
python scripts/fix_duplicate_cardids.py      # Fix duplicate card IDs
python scripts/update_sprint_references.py   # Update sprint references
node scripts/migrate-add-year-field.js <input.json> [output.json]  # Add year field to all cards
```

### Lit Components Conventions

- All Lit components should be in the `public/js/wc` directory
- All Lit components should be named like `my-component.js`
- All Lit components must communicate via events, avoiding coupling where possible
- All Lit components must have CSS separated in a different JS file and imported

### Component Catalog

See [docs/COMPONENT_CATALOG.md](./docs/COMPONENT_CATALOG.md) for the full component reference (Base classes, Card components, UI components, Astro components, style files).

## DOM Modern Best Practices

See [docs/DOM_BEST_PRACTICES.md](./docs/DOM_BEST_PRACTICES.md) for the full DOM API reference (element selection, creation, class/style management, DOM manipulation).

## System Requirements

See [SYSTEM_REQUIREMENTS.md](./SYSTEM_REQUIREMENTS.md) for full details (browser, hardware, network, APIs).

## Creating a New Instance

When the user says "crea nueva instancia del PG" (or equivalent), follow [docs/CREATE_NEW_INSTANCE.md](./docs/CREATE_NEW_INSTANCE.md) step by step. It's a wizard that separates HUMAN-only steps (Firebase Console clicks, OAuth) from IA-executable steps, includes all the gotchas discovered in production (Storage Get Started, Identity Platform, Secret Manager, IAM bindings for Cloud Functions, `MS_EMAIL_ENABLED=false`, dummy IA secrets, bootstrap of `allowed` claim for the SuperAdmin), and lists common errors with their fixes. Do NOT reinvent the flow from memory each time — read the wizard.

Key files: `system-requirements-service.js`, `SystemRequirementsChecker.js`, `system-requirements-config.js`

## Common Troubleshooting

### Emulator Issues
- If emulator fails to start, check ports 8080, 9000, 9199, 4000 are not in use
- Demo data is automatically loaded from `emulator-data/database_export/`
- Emulator detection shows red bar: "🔧 USANDO EMULADORES LOCALES"

### Build Issues
- Security check (`npm run security-check`) blocks builds with vulnerabilities
- Always use `dist` directory for deployment, never `public`
- Environment files must exist: `.env.dev`, `.env.pre`, `.env.pro`

### Testing Issues
- E2E tests require dev server running on port 4321
- Unit tests use `@` alias mapping to `/public/js`
- Test cleanup runs automatically, manual cleanup: `npm run test:e2e:cleanup`

### System Requirements Issues
- "Browser not supported": Update to latest version of Chrome, Firefox, Safari, Edge, or Opera
- "Insufficient memory": Close other applications or use a device with more RAM
- "Screen too small": Use a larger monitor or adjust browser zoom
- "Missing features": Update browser or enable JavaScript
- To temporarily disable checks in development, comment out `checkSystemRequirements()` in `/public/js/main.js` (⚠️ never in production)

## Security & Pre-commit Hooks

The project uses husky pre-commit hooks that automatically:
- Run security vulnerability checks
- Attempt to fix fixable vulnerabilities
- Block commits if critical vulnerabilities exist

To bypass (use with caution):
```bash
git commit --no-verify -m "message"
```

## Additional Build Commands

```bash
npm run build:core            # Core build excluding configuration
npm run build:update-package  # Build with package updates
npm run build:installer       # Build installer package
npm run test:ui              # Run unit tests with UI interface
```

## Design Context

### Users
- **Primary**: Development teams (5-30 people) practicing eXtreme Programming (XP)
- **Roles**: Developers, Stakeholders, SuperAdmins, Consultants
- **Context**: Daily tool for sprint planning, task tracking, backlog grooming, and delivery pipeline visibility
- **Job to be done**: Manage agile workflow end-to-end — from planning poker to deployment tracking — with full traceability and real-time collaboration

### Brand Personality
- **Three words**: Robusto, serio, enterprise
- **Voice**: Professional, precise, no-nonsense. The tool speaks through its data, not decoration
- **Emotional goals**: Confidence and control (everything organized and visible), Productivity and flow (fast, frictionless interactions), Calm and clarity (clean interface, no visual noise)

### Aesthetic Direction
- **Visual tone**: Enterprise-grade with Linear-inspired polish. Dense information display without clutter. Serious but not boring
- **Primary reference**: **Linear** — minimal, fast, elegant dark mode, keyboard-first, powerful shortcuts, restrained color use
- **Anti-references**: None explicitly rejected, but avoid: excessive decoration, gratuitous animations, consumer-app simplicity that doesn't scale, or corporate dashboard blandness
- **Theme**: Light and dark mode supported. Primary brand color `#4a9eff` (blue), secondary `#ec3e95` (pink). Status colors are semantic and must remain highly distinguishable
- **Typography**: Inter (UI) + JetBrains Mono (code/IDs). Clean hierarchy with restrained size scale

### Design Principles
1. **Information density over whitespace** — Users need to see many cards, statuses, and metrics at once. Optimize for scanability, not spaciousness
2. **Color communicates status, not decoration** — Every color must mean something (status, priority, role). Avoid decorative color that dilutes the signal
3. **Speed is a feature** — Interactions must feel instant. Keyboard shortcuts, quick filters, bulk actions. Minimize clicks to reach any card
4. **Consistency over creativity** — Every card type, modal, and view should follow the same visual grammar. Predictability builds trust
5. **Progressive disclosure** — Show essential info by default, reveal detail on demand. Cards show title/status/developer; click to expand full story, criteria, commits

### Design Token Architecture
- **3-layer system**: Primitives (raw values) → Semantic (meaningful names) → Components (scoped to UI elements)
- **Key files**: `public/js/ui/styles/tokens/primitives.js`, `semantic.js`, `components.js`
- **Dark theme**: `public/js/ui/styles/themes/dark-theme.js`
- **Runtime config**: `public/theme-config.json` (per-instance branding, status colors)
- **FOUC prevention**: Blocking inline script in `Layout.astro` applies cached tokens before first paint

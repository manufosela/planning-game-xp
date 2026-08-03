# Changelog

All notable changes to this project will be documented in this file.
Auto-generated from git commits on each build.

## [Unreleased]

### Added

- Enforce sprint duration policy + fix TZ quirk (PLN-TSK-0355) (#238)

### Fixed

- Project select shows name instead of projectId (PLN-BUG-0114) (#239)

## [1.193.4] - 2026-08-01

### Fixed

- Upsert team members into /data on create/update (PLN-BUG-0112) (#235)

## [1.193.3] - 2026-08-01

### Other

- Remove beforeCreate blocking function (GCIP upgrade incomplete) (#234)

## [1.193.2] - 2026-08-01

### Fixed

- Register beforeCreate unconditionally (GCIP required on all instances) (#233)

## [1.193.1] - 2026-08-01

### Fixed

- Register beforeCreate only when PUBLIC_ALLOWED_EMAIL_DOMAINS is set (#232)

## [1.193.0] - 2026-08-01

### Added

- BeforeUserCreated blocking function for per-instance domain filter (#231)

## [1.192.1] - 2026-08-01

### Fixed

- Preserve orphan developer/validator in select options (PLN-BUG-0107) (#230)
- Grant allowed=true to app admins even without projects (PLN-BUG-0111) (#229)

## [1.192.0] - 2026-07-08

### Added

- TaskCategory 'code' | 'nocode' con completionNote (PLN-TSK-0354) (#228)

## [1.191.3] - 2026-07-08

### Fixed

- Stop creating ghost projects for stale projectIds (PLN-BUG-0110) (#227)

## [1.191.2] - 2026-07-08

### Fixed

- Stop renaming RTDB key when the project name changes (PLN-BUG-0109) (#226)

## [1.191.1] - 2026-07-08

### Fixed

- Resolve default team from MCP user config (PMC-BUG-0007) (#225)

## [1.191.0] - 2026-06-28

### Added

- Respect explicit sprint dates while keeping 1-day default (PLN-TSK-0346) (#224)

## [1.190.7] - 2026-06-22

### Fixed

- URL projectId wins over last-used localStorage (PLN-BUG-0108) (#223)

## [1.190.6] - 2026-06-22

### Fixed

- Pin status-pill text to literal dark colors (PLN-BUG-0106 follow-up) (#222)

## [1.190.5] - 2026-06-22

### Fixed

- Drop the undefined --surface-* tokens (PLN-BUG-0106) (#221)

## [1.190.4] - 2026-06-22

### Fixed

- Use explicit field list when hydrating TaskCard (PLN-BUG-0105) (#220)

## [1.190.3] - 2026-06-21

### Fixed

- Explain and unblock the empty board state (PLN-BUG-0104) (#219)

## [1.190.2] - 2026-06-21

### Fixed

- Drop Sprint filter and auto-regenerate empty column config (#218)

## [1.190.1] - 2026-06-21

### Fixed

- Inject board styles when in light DOM (PLN-BUG-0103) (#217)

## [1.190.0] - 2026-06-21

### Added

- Phase 6 — filters, swimlanes, search (PLN-TSK-0344) (#216)
- Phase 5 — flow metrics + snapshots (PLN-TSK-0343) (#215)
- Phase 4 — card detail modal on click (PLN-TSK-0342) (#214)
- Phase 3 — drag&drop + real-time board (PLN-TSK-0341) (#213)
- Phase 2 — WIP limits + enforceWip flag (PLN-TSK-0340) (#212)

## [1.189.0] - 2026-06-20

### Added

- Phase 1 — per-project column config (PLN-TSK-0339) (#211)
- SuperAdmin Users tab with permissions matrix (PLN-TSK-0092) (#210)
- "Resumen de trabajo" cross-project analytics tab (PLN-TSK-0056) (#209)

## [1.188.0] - 2026-06-20

### Added

- "Evolución temporal" tab with project time metrics (PLN-TSK-0135) (#208)

## [1.187.0] - 2026-06-07

### Added

- Strict "Sprint = 1 day" policy (PMC-TSK-0072, PLN-TSK-0338) (#207)
- Department view kanban (PLN-TSK-0059) (#206)

## [1.185.0] - 2026-06-04

### Added

- Cross-project directory at /public/ (PLN-TSK-0337) (#205)
- Errores accionables y contrato autodescriptivo de pipelineStatus

## [1.184.0] - 2026-06-02

### Added

- Auto-backfill /publicViews on project visibility toggle (#198)

### Fixed

- Show all projects for admins and persist projectId in URL (#203)
- Stop surfacing status on epics (PMC-BUG-0005) (#201)
- Give development plans a human-readable cardId (PMC-BUG-0003) (#200)
- Detect installed package by module dir, not argv[1] (PMC-BUG-0002) (#199)
- Prevent npm publishes without bundled shared/ (PMC-BUG-0004) (#197)

### Other

- Bump version to 1.21.7 (#202)

## [1.183.4] - 2026-04-06

### Fixed

- Use MCP user email for createdBy/updatedBy instead of geniova-mcp (#196)

## [1.183.3] - 2026-04-06

### Fixed

- Propagate projectId to nav links on click (#195)

## [1.183.2] - 2026-04-06

### Fixed

- Sync CleanView project selection to URL query params (#194)

## [1.183.1] - 2026-04-03

### Fixed

- Separate bug card team fields into own row below status/priority (#193)

## [1.183.0] - 2026-04-03

### Added

- Add validator and coValidator fields to BugCard (#192)

## [1.182.0] - 2026-04-03

### Added

- Auto-inject project context on first MCP call per session (#190)

### Fixed

- CleanView codeveloper filter and date wiping on bug save (#191)

## [1.181.2] - 2026-04-02

### Fixed

- Add preflight validation and complete usage rules for MCP tools (#189)

## [1.181.1] - 2026-04-02

### Fixed

- Revert permissive MCP validations and add strict tool descriptions (#188)

## [1.181.0] - 2026-04-02

### Added

- Add light/dark mode toggle to public project page (#187)

### Fixed

- Remove overly restrictive MCP validations on card creation

## [1.180.0] - 2026-04-02

### Added

- Replace polling with RTDB real-time listeners on public project page (#186)

## [1.179.0] - 2026-04-02

### Added

- Require startDate on bug Assigned and endDate on bug Fixed

### Fixed

- Strip status and priority fields from epics (#185)

## [1.178.0] - 2026-04-01

### Added

- Cloud Function validates bug statuses — reverts task-only statuses on bugs

## [1.177.3] - 2026-04-01

### Fixed

- Public board — pagination (50/page), fix date sorting, remove horizontal scroll

## [1.177.2] - 2026-04-01

### Fixed

- Public board — global styles for dynamic content, visible status badges, no ID wrapping
- Public board — wider ID column, visible status colors, no table-layout:fixed

## [1.177.0] - 2026-04-01

### Added

- Redesign public board page — dense, utilitarian, Linear-inspired

## [1.176.0] - 2026-04-01

### Added

- Add /versions/latest endpoint and recommended flag
- Add version field and version-based lookup to app versions API

## [1.175.1] - 2026-04-01

### Fixed

- Improve public toggles UI layout and endpoint visibility (#183)

## [1.175.0] - 2026-04-01

### Added

- Separate public project view and public app API toggles (#182)

## [1.174.0] - 2026-04-01

### Added

- Add public app versions API endpoints (#181)

## [1.173.1] - 2026-04-01

### Other

- Remove publicApi/publicView split and sharing UI (PRs #179, #180)

## [1.173.0] - 2026-04-01

### Added

- Split public access into publicView and publicApi toggles (#180)

## [1.172.0] - 2026-04-01

### Added

- Add shareable URL and token management to project admin settings (#179)

## [1.171.0] - 2026-04-01

### Added

- Add server instructions for AI clients to reduce token waste (#178)

### Other

- Bump MCP version to 1.21.0 and client to 1.170.1

## [1.170.0] - 2026-04-01

### Added

- Init wizard asks to add new or reconfigure existing instance
- Init wizard detects existing instances for easy multi-instance setup
- Add response compressor middleware to reduce token consumption

### Performance

- Return only summary fields from update_card response

### Other

- Bump version to 1.18.0

## [1.169.0] - 2026-03-31

### Added

- Sync project team roles to /users/ on create and update
- Email notification when Cloud Function reverts invalid status transition

## [1.168.2] - 2026-03-31

### Fixed

- Admin panel checkboxes not reading actual user roles

## [1.168.1] - 2026-03-30

### Fixed

- Use query params instead of dynamic route for public view page

## [1.168.0] - 2026-03-30

### Added

- Add protected project access with shareable token URLs
- Add public read-only view with polling from Cloud Function API

## [1.167.0] - 2026-03-30

### Added

- Init wizard creates ~/pg-instances/{name}/ directory structure

### Fixed

- Update express to resolve path-to-regexp ReDoS vulnerability (GHSA-37ch)
- Remove fake 09:00/17:00 default times from timestamps
- Make serviceAccountKey.json mandatory in init wizard

### Documentation

- Update READMEs to point to pgamexp.com docs and init wizard

## [1.166.8] - 2026-03-26

### Performance

- Replace 2s timeout with rAF for inline module script execution

## [1.166.7] - 2026-03-26

### Performance

- Start table view Firebase subscription before GDM finishes loading

### Testing

- Add regression tests for developer and stakeholder list formats in event data
- Add regression tests for statusList format in provide-taskcard/bugcard-data

## [1.166.6] - 2026-03-26

### Fixed

- Handle statusLists as Array in provide-taskcard/bugcard-data events

## [1.166.5] - 2026-03-26

### Documentation

- Enrich v1.166.4 changelog with detailed performance descriptions

## [1.166.4] - 2026-03-26

### Performance

- Optimize initial load by removing redundant Firebase queries

### Documentation

- Update outdated MCP documentation across all guides

## [1.166.3] - 2026-03-19

### Fixed

- Remove on-change date validation that blocks intermediate input values

## [1.166.2] - 2026-03-19

### Fixed

- Normalize date comparison in BaseCard validation to prevent false rejections

## [1.166.1] - 2026-03-19

### Fixed

- Convert UTC timestamps to local time in datetime inputs (#172)

## [1.166.0] - 2026-03-19

### Added

- Auto-detect user from Firebase in init wizard and support stakeholder role

### Fixed

- Add SPRINT_SCHEMA to CARD_SCHEMAS and add missing filter constant fallbacks (#171)
- Status filters not loading - use getProjectLists status data
- Accessibility and performance audit fixes
- Use binary name in init Claude registration instead of cwd

## [1.165.0] - 2026-03-11

### Added

- Add guidelines admin UI in project administration
- Integrate sync_guidelines into MCP setup wizard
- Add guidelines auto-check on MCP startup
- Add guideline versioning, history and restore capabilities
- Add migration script for CLAUDE.md to Firebase guidelines
- Add CLAUDE.md to Firebase guidelines migration script
- Add sync_guidelines MCP tool for local file synchronization
- Add guidelines type to global_config with versioning and history
- Add instance metadata for MCP instance awareness
- Add work cycles tracking for reopened tasks
- Add sprint validation rules for dates, locking, and task creation
- Add setup wizard (planning-game-mcp init) with pg.config.yml
- Exclude archived projects from MCP operations
- Add --version and --help CLI flags to MCP server
- Add pre-flight checks, pg_doctor and pg_config MCP tools (#155)
- Add velocity metrics, completion rates, and sprint filtering to dashboard (#135)
- Add team specs checklist to tasks and project config (#133)
- Add GitHub Release pipeline for latest-version.json (#131)
- Add public project toggle in admin settings (#130)
- Add public API Cloud Function for project cards (#129)
- Improve epic inference with task-title context and per-phase epics (#128)
- Integrate mcp.user.json setup into wizard Step 9 (#127)
- Auto-generate mcp.user.json with stakeholder info during setup (#126)
- Add DAL service for web client with browser Firebase SDK adapters
- Add Firestore-only factory and mark RTDB backends as deprecated
- Add read-switch repositories for Firestore-first reads with RTDB fallback
- Add dual-write repositories for shadow writing to secondary backend
- Add RTDB to Firestore backfill migration script
- Add Cloud Functions to mirror RTDB changes to Firestore
- Implement Firestore repository layer for DAL
- Implement RTDB repository layer for DAL
- Define DAL interfaces and contracts for database abstraction
- Implement multi-instance MCP setup in wizard step 9 (#115)
- Add MCP smoke test for post-installation verification (#114)
- Add example instance with placeholder configuration (#113)
- Add demo mode with emulators and capped configurations (#112)
- Add demo mode with emulators and capped configurations
- PLN-TSK-0285: Create page-lifecycle.js with cleanup registry for View Tr
- Add quick access icons next to notification bell (#111)
- Make Microsoft Auth optional for Cloud Functions deployment (#110)
- Enforce date coherence across all card types (#109)
- Add PDF export for monthly hours report (#108)
- Add developer detail list in hours report
- Add Hours Report tab in admin console
- Add report-hours-service for dev vs maintenance hours calculation
- Accumulate time entries on task reopens with totalEffectiveHours
- Recalculate effective hours on Done&Validated when timestamps are estimated
- Remove Users tab and EntityDirectoryManager from /adminproject

### Changed

- Migrate view-factory and app-controller to unified-filters (#134)
- Simplify UpdateService to version check notification (#132)

### Fixed

- Add timeouts to Firebase queries to prevent MCP hanging on bad database URL
- Replace ReDoS-vulnerable regex in BugCard Gherkin parser (#107)
- Resolve merge conflict in functions/index.js adding both handlers
- Resolve SPA navigation instability with listener lifecycle and date validation
- Fall back to project-level developer/stakeholder arrays when /users/ has no project assignments

### Performance

- Load only user-assigned projects instead of downloading all
- Optimize page load with lazy WC imports, deferred services and skeleton loaders

### Documentation

- Add MCP v1.14.0 changelog, update README and installation guide with pg_doctor/pg_config tools
- Add Firestore migration architecture document and ADR

### Other

- Bump MCP version to 1.14.1
- Bump MCP version to 1.14.0

## [1.164.10] - 2026-03-07

### Fixed

- Show default tab immediately after partial HTML injection

## [1.164.9] - 2026-03-07

### Fixed

- Resolve blank screen on cold page load

## [1.164.8] - 2026-03-07

### Fixed

- Remove project node fallbacks, add sync-users-project-roles script

## [1.164.7] - 2026-03-06

### Fixed

- Handle object format for developers in project data fallback

## [1.164.6] - 2026-03-06

### Fixed

- Read project developers from project node when entityDirectoryService returns empty (#87)
- Clean validation revert flags from Firebase to prevent repeated toast on reload
- Update endDate when WIP moves to To Validate

### Documentation

- Major documentation cleanup and new guides
- Log WIP to validate endDate fix

## [1.164.5] - 2026-03-05

### Fixed

- Inject partial stylesheets in app-shell-router

## [1.164.4] - 2026-03-05

### Fixed

- Replace hardcoded white text with --text-on-primary CSS variable

### Documentation

- Add pending geniova deploy notes

### Other

- Sync lastBuildCommit

## [1.164.3] - 2026-03-05

### Fixed

- Stabilize app shell routing and nav

## [1.164.2] - 2026-03-05

### Fixed

- Force full page reload on navigation to prevent blank pages

## [1.164.1] - 2026-03-05

### Fixed

- Guard firebase messaging init for unsupported browsers

## [1.164.0] - 2026-03-04

### Added

- Sync Equipo tab team assignments to /users/ path

## [1.163.1] - 2026-03-04

### Fixed

- Add copy-link button to bugs table and fix horizontal scroll

## [1.163.0] - 2026-03-04

### Added

- Add deep links and cleanview URLs for card sharing

### Fixed

- Exclude archived projects from cleanview selector

## [1.162.0] - 2026-03-04

### Added

- Split cleanview into 3 tabs (A Validar, Mis Tareas, Todas)

## [1.161.0] - 2026-03-04

### Added

- Add cleanview link in adminproject header

## [1.160.0] - 2026-03-04

### Added

- Add cleanview stakeholder page with CleanCardDetail (PLN-TSK-0279)

## [1.159.1] - 2026-03-02

### Fixed

- Replace full logo with icon to remove 'de GENIOVA' branding
- Allow SuperAdmin to mark tasks as Done/Done&Validated
- Prevent infinite loop in task status validation CF revert

## [1.159.0] - 2026-03-02

### Added

- Block admin console in demo mode and add custom 404 page
- Replace management/consultation toggle with role-based permissions

### Fixed

- Add RTDB security rules for appMetadata to fix beta display bug

## [1.158.7] - 2026-03-02

### Fixed

- Sync /data/projectsByUser when admin assigns/removes user projects (#80)

## [1.158.6] - 2026-03-02

### Fixed

- Block project and docs write operations in demo mode (#79)

## [1.158.5] - 2026-03-02

### Fixed

- Prevent saving overlay from getting stuck on errors (#78)

## [1.158.4] - 2026-03-02

### Fixed

- Resolve demo instance errors (overlay, push, storage, firestore, filters) (#77)

## [1.158.3] - 2026-03-02

### Fixed

- Optimistic UI update after user delete and project removal

## [1.158.2] - 2026-03-02

### Fixed

- Implement inline confirmation modal for delete/remove actions

## [1.158.1] - 2026-03-02

### Fixed

- Modal overflow clipping MultiSelect and modalService.confirm error

## [1.158.0] - 2026-03-02

### Added

- Render user form in modal overlay instead of inline

## [1.157.0] - 2026-03-02

### Added

- Reorder build pipeline and add post-commit checklist hook (#72)

### Fixed

- Import modalService instead of using undefined window.modalService (#71)

## [1.156.1] - 2026-03-02

### Fixed

- Add version/changelog safeguards and fix Firebase RTDB URL handling

## [1.156.0] - 2026-03-02

### Added

- Add login history frontend and admin UI
- Add login history backend support
- Add seed script for demo project data

### Changed

- Extract IA and admin handlers from index.js
- Extract MS Graph and weekly-email from index.js
- Extract auth-provisioning handlers from index.js
- Extract push-notification and demo-cleanup handlers
- Extract shared utilities from functions/index.js

### Fixed

- Grant demo users access to shared TaskFlow project

## [1.155.1] - 2026-03-01

### Fixed

- Guard onPortalBugResolved behind DEMO_MODE check
- Read DEMO_MODE from .env file as fallback
- Skip defineSecret calls in DEMO_MODE
- Move exports._test inside DEMO_MODE guard block
- Guard exports._test behind DEMO_MODE check
- Move DEMO_MODE declaration before first usage in functions
- Skip secret-dependent functions in DEMO_MODE and normalize DB URL

## [1.155.0] - 2026-03-01

### Added

- Add scheduled cleanup for inactive demo users
- Auto-provision demo users with sample project and data on signup
- Add demo mode limits for card and project creation
- Add demo mode banner and feature-cap service (#64)

## [1.154.0] - 2026-03-01

### Added

- Add demo-specific security rules and DEMO_MODE auto-provision (#63)

## [1.153.6] - 2026-03-01

### Fixed

- Enforce pipelineStatus.prCreated validation on task/bug transitions

## [1.153.5] - 2026-03-01

### Fixed

- Increase header z-index to 200 so popups render above filter components

## [1.153.4] - 2026-03-01

### Fixed

- Header z-index so notification bell and system-status tooltips render above content

## [1.153.3] - 2026-03-01

### Fixed

- Gantt chart text color adapts to dark mode theme

## [1.153.2] - 2026-03-01

### Fixed

- Gantt chart shows all epics with collapsible rows and adaptive timeline

## [1.153.1] - 2026-03-01

### Fixed

- Add project resolver with fuzzy matching for MCP tools

## [1.153.0] - 2026-03-01

### Added

- Modern visual redesign with Indigo/Emerald palette and full dark mode support

## [1.151.1] - 2026-03-01

### Fixed

- Dark mode, View Transitions re-init, Cards View, Kanban order

## [1.151.0] - 2026-02-28

### Added

- Add View Transitions and FOUC prevention

### Fixed

- Correct GitHub repo URL from AvilaManuel to manufosela

### Other

- Bump MCP version to 1.13.1 (fix npm repo URL)

## [1.150.0] - 2026-02-28

### Added

- Add text color pickers and fix hardcoded nav/header theme colors (#58)

## [1.149.0] - 2026-02-28

### Added

- Unify status colors via CSS variables with auto-contrast (#57)

## [1.148.6] - 2026-02-28

### Fixed

- Skip org branding when no ORG_NAME configured
- ThemeEditor handles empty/missing config with sensible defaults
- Change Manager group dropdown placeholder from "developer" to "manager"

## [1.148.5] - 2026-02-28

### Fixed

- Use bg-tertiary for table hover to support dark mode

## [1.148.4] - 2026-02-28

### Fixed

- Only show app permissions gear on projects with allowExecutables

## [1.148.3] - 2026-02-28

### Fixed

- Show all projects in multi-select with assigned ones pre-selected

## [1.148.2] - 2026-02-28

### Fixed

- Import MultiSelect in UserAdminPanel and guard ThemeEditor tokens

## [1.148.1] - 2026-02-28

### Fixed

- Improve user admin panel UX and dark mode support

## [1.148.0] - 2026-02-28

### Added

- Add delete user and unified app permissions management
- Add one-click onboarding and MCP provision_user tool
- Add Users tab to admin and remove legacy user management
- Replace legacy Cloud Functions with centralized /users/ CRUD
- Add migration script for centralized /users/ model
- Define centralized /users/ data model and database rules
- Auto-provision users on first login with Gmail normalization
- Add Allowed Users management tab in EntityDirectoryManager
- Add Cloud Functions deploy support to deploy-all.sh
- Auto-install mcp/ dependencies via postinstall script
- Clear textarea and draft after accepting AI-generated tasks
- Replace email whitelist with Custom Claims in RTDB rules
- Improve setup_mcp_user with name/email auto-matching
- Publish MCP server as npm package planning-game-mcp
- Publish MCP server as npm package planning-game-mcp
- Merge PMC-TSK-0068 MCP standalone packaging
- Add standalone MCP build script and README
- Merge PLN-TSK-0217 admin entity directory manager
- Add admin UI for managing global developers and stakeholders
- Add commit-msg hook to block AI attribution in commits

### Changed

- Read EntityDirectoryService and MCP tools from /users/
- Centralize Firebase CLI account switching in instance-manager

### Fixed

- Set default status for proposals and add save-time fallback
- Read allowExecutables from Firebase to prevent stale App tab visibility
- Migrate storage rules from email whitelists to custom claims
- Ensure developers and stakeholders are created in global collections on project update

### Documentation

- Add GitHub token permission details to MCP installation guide
- Update MCP installation guide with npm package instructions

### Other

- Add version bump to build:all and version check to deploy:all
- Bump version to 1.146.0 and update changelog
- Bump MCP version to 1.13.0

## [1.145.0] - 2026-02-27

### Added

- Extract Dev Plans UI to Lit web components (PLN-TSK-0213 to 0216)
- Enforce plan-first workflow for multi-task creation
- Add proposalId to plans and planId to tasks
- Add PlanProposal entity with CRUD MCP tools
- Add PlanProposal entity with CRUD MCP tools
- Add multi-instance build/deploy pipeline
- Consolidate MCP codebase with tests from separate repo
- Add MCP tools for development plan management
- Add intelligent epic inference when generating tasks from plans
- Make plan tasks editable and fix data loss in collectFormData

### Fixed

- Load env vars in build:core for multi-instance pipeline
- Resolve Dev Plans UI issues - dark mode support and button conflict

### Documentation

- Add MCP multi-Firebase architecture proposal

### Other

- Resolve version conflicts with main for PLN-TSK-0182
- Resolve conflicts with main for PLN-BUG-0084

## [1.143.1] - 2026-02-25

### Fixed

- Use Node 20 and add ESM package.json for shared modules

## [1.143.0] - 2026-02-25

### Added

- Add Pausado status with time tracking for tasks
- Generate task cards from accepted development plans

### Changed

- Use Title Case for bug priorities aligned with Firebase RTDB

### Fixed

- Resolve shared module import path for Cloud Functions deploy
- Auto-set endDate when task transitions to To Validate
- Resolve task status changes not persisting due to Cloud Function revert

## [1.142.0] - 2026-02-25

### Added

- Add generateDevPlan Cloud Function for AI plan creation
- AI-powered plan generation from text/context

## [1.141.0] - 2026-02-25

### Added

- Replace card grid with table view and fix tasksGenerator tab regression

## [1.140.2] - 2026-02-25

### Fixed

- Replace hardcoded colors with theme tokens for dark mode consistency

## [1.140.1] - 2026-02-25

### Fixed

- Resolve broken remove import and move Dev Plans to adminproject

## [1.140.0] - 2026-02-25

### Added

- Add Development Plans tab with CRUD management

### Fixed

- Force build in deploy-all to prevent skip on second instance

## [1.139.0] - 2026-02-25

### Fixed

- Correct broken titleWrapper reference in table badge layout
- Move badges to second line in task table to preserve title visibility

## [1.133.1] - 2026-02-24

### Fixed

- Prevent build loop caused by update-version committing build artifacts

## [1.133.0] - 2026-02-24

### Added

- Add pipeline badges (C/PR/M/D) to table view for tasks and bugs

## [1.132.2] - 2026-02-24

### Added

- Add instance-aware Firebase init helper for scripts
- Integrate MCP server as local module with stdio transport
- Add shared/ module as single source of truth for constants and validation

### Changed

- Migrate 5 scripts from hardcoded Firebase to instance-aware init
- Align bug statuses to 5 and unify imports from shared/

### Fixed

- Enable status select for validators on tasks in "To Validate"
- Derive databaseURL from serviceAccountKey when env var is missing
- Remove references to eliminated bug statuses in UI components

### Documentation

- Add MCP integration status and next steps checklist

## [1.132.1] - 2026-02-22

### Fixed

- Swap avatar-eyes mode to match visual theme

## [1.132.0] - 2026-02-22

### Added

- Replace dark/light SVGs with avatar-eyes web component

### Fixed

- Add commits/pipelineStatus to VIEW_FIELDS and CF sync

## [1.131.0] - 2026-02-22

### Added

- Add pipeline status badges (C/PR/M/D) to card components
- Add Claude Code PostToolUse pipeline reminders
- Add pre-push PR check and post-merge pipeline reminder
- Add delivery pipeline instructions to all AI config files

### Changed

- Move shared emulator rules to project root

## [1.130.0] - 2026-02-22

### Added

- Add restore card functionality from trash

### Fixed

- Require date updates on status transitions

### Documentation

- Require deploy-before-version-notify

## [1.129.1] - 2026-02-22

### Fixed

- Resolve epic title without full reload

## [1.129.0] - 2026-02-21

### Added

- Add AI usage tracking and optimistic locking for AI agents

## [1.128.6] - 2026-02-21

### Fixed

- Use UIUtils.formatDateFriendly instead of non-existent import

## [1.128.5] - 2026-02-21

### Fixed

- Align updateTableRow styles with table-renderer rendering

## [1.128.3] - 2026-02-21

### Fixed

- Resolve table view bugs and add notes tooltip

## [1.128.2] - 2026-02-21

### Fixed

- Use update() instead of set() for existing cards to prevent data loss

## [1.128.1] - 2026-02-21

### Fixed

- Resolve notes badge, dark mode textarea, and date input issues

## [1.128.0] - 2026-02-21

### Added

- Add auto-heal mechanism to version-check-service

### Fixed

- Use git history for version bump detection and notify on deploy:hosting

## [1.126.0] - 2026-02-21

### Added

- Format startDate/endDate in table view with friendly Spanish locale
- Add hourly validation digest scheduled function
- Add email queue module for RTDB-based notification batching

### Changed

- Replace immediate emails with queue-based hourly digest

## [1.126.0] - 2026-02-20

### Added

- Integrate ThemeEditor in admin page as new Theme tab
- Add ThemeEditor component with color pickers and live preview
- Add RTDB persistence and real-time sync to ThemeLoaderService

### Fixed

- Move ThemeEditor from adminproject to admin page

## [1.125.5] - 2026-02-20

### Testing

- Add deep link card opening tests

## [1.125.4] - 2026-02-20

### Fixed

- Remove duplicate cards-rendered dispatch that broke deep links

## [1.125.3] - 2026-02-20

### Style

- Increase theme toggle icon size by 25%

## [1.125.2] - 2026-02-20

### Fixed

- Card deep link not working in table view (#14)

## [1.125.1] - 2026-02-20

### Fixed

- Deploy verifies build instance + org logo auto-detection (#13)

## [1.125.0] - 2026-02-20

### Added

- Add per-instance theming and org branding support (#12)

## [1.124.1] - 2026-02-20

### Fixed

- Navigate to selected project in adminproject page

## [1.124.0] - 2026-02-20

### Added

- Enable Trash tab in adminproject with bin icon

## [1.123.0] - 2026-02-20

### Added

- Multi-instance architecture, trash tab in admin, changelog modal fix
- SPA URL navigation for wip, sprintview and proposals (#10)

### Changed

- Replace notes column with inline badge next to task title (#11)

## [1.122.0] - 2026-02-19

### Added

- Add Trash tab to admin page for viewing deleted cards
- Lock project name and abbreviation when cards exist
- Show notification when deep link cardId not found
- Default table sort by priority (highest first)

### Testing

- Add E2E dark theme tests (toggle, persistence, contrast)
- Add ThemeManagerService unit tests (34 tests)

## [1.121.0] - 2026-02-18

### Added

- Auto-generate changelog from git commits on each build

## [1.120.2] - 2026-02-17

### Fixed

- Improve prompt save UX with overwrite option and auto-assign validator

## [1.120.0] - 2026-02-17

### Added

- Add prompt persistence in Tasks Generator with autosave and named saves

## [1.119.1] - 2026-02-17

### Testing

- Add unit tests for email-sanitizer, workday-utils, cache-manager, developer-normalizer

## [1.119.0] - 2026-02-17

### Added

- Version button in footer opens changelog modal

## [1.118.1] - 2026-02-17

### Fixed

- Dark mode in Tasks Generator by removing ThemeVariables from shadow DOM

## [1.118.0] - 2026-02-17

### Added

- Rename Uploads tab to Tasks Generator with text input support

## [1.117.8] - 2026-02-17

### Changed

- Remove unauthorized Tickets section


---

> Versions below were recovered from Planning Game task history.
> Git history was lost when the repository was reset (Feb 2026).

## [1.60.0 - 1.116.0] - 2026-01 / 2026-02

### Added

- PLN-TSK-0003: Markdown support in card descriptions
- PLN-TSK-0031: Mention users in task notes (@user)
- PLN-TSK-0037: Developer backlog view in WIP page
- PLN-TSK-0040: AI-optimized descriptions for tasks
- PLN-TSK-0043: Upload tasks and bugs from documents via AI
- PLN-TSK-0046: Email + push notification to validator on "To Validate"
- PLN-TSK-0048: Real-time reactivity in task and bug lists
- PLN-TSK-0049: Assigned bugs appear in developer backlog
- PLN-TSK-0053: Mandatory field validation when blocking a task
- PLN-TSK-0055: Weekly email digest - single email per user
- PLN-TSK-0058: Stakeholder column in proposals table view
- PLN-TSK-0063: Descriptive priority visualization
- PLN-TSK-0064: Save implementation plan in task via MCP
- PLN-TSK-0065: Auto-assign BecarIA as co-developer via MCP
- PLN-TSK-0066: MCP list_developers returns global developer IDs
- PLN-TSK-0067: Co-developer field in Bug cards
- PLN-TSK-0068: Reorganize fields in Bug expanded view
- PLN-TSK-0069: Notify bug creator when bug moves to Fixed
- PLN-TSK-0071: Prominent "Improve with AI" button in ProposalCard
- PLN-TSK-0072: Cloud Function to validate task status transitions
- PLN-TSK-0075: implementationNotes field for development summary
- PLN-TSK-0077: Copy task and bug IDs to clipboard
- PLN-TSK-0078: Type validation in MCP server
- PLN-TSK-0079: Automated dev environment setup (MCPs, SonarQube, DevTools)
- PLN-TSK-0080: Allow developers to create and edit documentation
- PLN-TSK-0081: Allow developers and stakeholders to use Uploads section
- PLN-TSK-0082: Documentation buttons in Tasks view
- PLN-TSK-0083: Separate MCP server into independent repository
- PLN-TSK-0084: Markdown description summary in projects table
- PLN-TSK-0085: Remove Project column, add Notes column in table view
- PLN-TSK-0086: Co-developer and co-validator badges
- PLN-TSK-0087: Immutable startDate for task traceability
- PLN-TSK-0088: Optimized Firebase views to reduce data traffic
- PLN-TSK-0089: Migration to populate optimized views with existing data
- PLN-TSK-0090: Frontend uses optimized Firebase views
- PLN-TSK-0093: Centralize card schemas to eliminate field duplication
- PLN-TSK-0099: Friendly message when OAuth credentials expire
- PLN-TSK-0100: Search tasks and bugs by number or title
- PLN-TSK-0101: Real-time new version notification
- PLN-TSK-0102: Date fields and reopen cycle in tasks
- PLN-TSK-0103: Strict mandatory field validation when leaving To Do
- PLN-TSK-0104: Automated installation and setup system
- PLN-TSK-0106: AppEventBus - centralized event system (Phase 1)
- PLN-TSK-0107: Refactor ViewFactory - eliminate setTimeout (Phase 2)
- PLN-TSK-0108: Refactor BaseFilters - eliminate setTimeout (Phase 3)
- PLN-TSK-0109: Refactor AppController - eliminate setTimeout (Phase 4)
- PLN-TSK-0110: Audit Lit components - eliminate setTimeout (Phase 5)
- PLN-TSK-0111: AI Code Review with configurable prompt from Planning Game
- PLN-TSK-0114: Replace agents textarea with business context field
- PLN-TSK-0117: Specs & Plan tab in each task card
- PLN-TSK-0119: rulesync-geniova repo with team base rules
- PLN-TSK-0121: rulesync init-project command for Claude Code
- PLN-TSK-0122: Implementation plan badge on task cards
- PLN-TSK-0125: Refactor admin.astro with tabs/sections system
- PLN-TSK-0126: Move admin.astro content to Firebase section
- PLN-TSK-0127: Reports section with date filters
- PLN-TSK-0128: ReportService for development statistics
- PLN-TSK-0129: Average task development time calculation
- PLN-TSK-0130: Average bug resolution time calculation
- PLN-TSK-0131: DeveloperReportCard component for statistics
- PLN-TSK-0132: Summary statistics table by project
- PLN-TSK-0133: PDF report generator for ISO audits
- PLN-TSK-0134: Multi-project selector in report filters
- PLN-TSK-0136: Dark Theme - Phase 0: Toggle button + CSS infrastructure
- PLN-TSK-0137: Dark Theme - Phase 1: Critical components
- PLN-TSK-0138: Dark Theme - Phase 2: Secondary cards
- PLN-TSK-0139: Dark Theme - Phase 3: UI components
- PLN-TSK-0140: Dark Theme - Phase 4: Astro pages
- PLN-TSK-0145: Automatic timestamps on task and bug status changes
- PLN-TSK-0148: Auto-assign startDate when moving task to In Progress
- PLN-TSK-0149: Implementation plan validation flow when creating tasks
- PLN-TSK-0150: List available epics when task has no epic or invalid epic
- PLN-TSK-0151: Auto-assign validator when creating tasks via MCP
- PLN-TSK-0152: Auto-assign base team when creating projects via MCP
- PLN-TSK-0153: Identify MCP user via mcp.user.json, create MAINTENANCE epic
- PLN-TSK-0154: setup_mcp_user tool to auto-generate mcp.user.json
- PLN-TSK-0157: Notify Portal de Incidencias when portal-created bug is resolved
- PLN-TSK-0158: Fix on-card-to-validate tests (missing PUBLIC_APP_URL env var)
- PLN-TSK-0162: Developer selection checkboxes for ISO PDF export

### Changed

- PLN-TSK-0050: Automatic date updates in Bugs
- PLN-TSK-0051: WIP history saved to /wipHistory

## [1.3.0 - 1.59.0] - 2025

### Added

- PLN-TSK-0001: Notification bell component
- PLN-TSK-0004: Support developers field in tasks
- PLN-TSK-0006: Detect unsaved changes in Card edit mode
- PLN-TSK-0009: Deep links with card IDs
- PLN-TSK-0010: Task view filters
- PLN-TSK-0012: File uploads to Firebase Storage in Bugs
- PLN-TSK-0013: Card change history viewer
- PLN-TSK-0014: Sprint statistics dashboard
- PLN-TSK-0015: Task dependency field (related tasks)
- PLN-TSK-0018: Trash/recycle bin view
- PLN-TSK-0019: Convert proposals to Tasks
- PLN-TSK-0022: Push notifications via FCM
- PLN-TSK-0023: Card IDs system
- PLN-TSK-0024: Display card-id attribute on cards
- PLN-TSK-0029: Project switcher from title
- PLN-TSK-0030: File attachments in Bug cards
- PLN-TSK-0032: Direct link to task from notifications
- PLN-TSK-0033: Table view with sortable columns and filters
- PLN-TSK-0034: WIP (Work In Progress) section
- PLN-TSK-0036: Global proposals list across all projects
- PLN-TSK-0039: App download statistics

## [1.2.0] - 2025-09

### Added

- Architectural refactoring with centralized services
- Event delegation system replacing scattered event listeners
- PermissionService, FilterService, ModalService
- Factory patterns for card creation and filtering

### Changed

- Service-oriented architecture with dependency injection
- Unified filter logic across all card types

## [1.1.0] - 2025-06

### Added

- Project management system with admin permissions
- Real-time notification system via Firebase RTDB
- Developer name-to-email mapping
- Point recalculation when scoring system changes
- Stakeholder management

### Fixed

- "[object Object]" display in validator select
- Notification overflow with infinite lists

## [1.0.0] - 2025-03

### Added

- Complete card system: Tasks, Bugs, Epics, Sprints, Proposals, QA
- Multiple views: List, Kanban, Table, Gantt, Sprint
- Firebase Realtime Database with real-time updates
- Role-based permissions (Admin, User, Consultant)
- Push notifications via FCM
- File attachments via Firebase Storage
- Sprint management with point tracking
- Microsoft authentication
- PWA with service worker

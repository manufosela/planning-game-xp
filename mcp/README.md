# Planning Game MCP Server

MCP (Model Context Protocol) server for **Planning Game XP** — an agile project management system following eXtreme Programming practices.

Integrates with Claude Code, Cline, and any MCP-compatible AI client to manage sprints, tasks, bugs, epics, proposals, ADRs, and development plans via natural language.

## Requirements

- **Node.js** >= 20.0.0
- A **Firebase project** with Planning Game data structure
- A **Service Account Key** (`serviceAccountKey.json`) for that Firebase project

## Quick Start

```bash
# 1. Install
npm install -g planning-game-mcp

# 2. Run the setup wizard (validates credentials, registers in Claude Code)
planning-game-mcp init
```

You need a `serviceAccountKey.json` from your Firebase project ([Firebase Console](https://console.firebase.google.com) > Project Settings > Service Accounts > Generate new private key).

The init wizard handles everything: credential validation, connectivity test, user detection, Claude Code registration, and guidelines sync.

**Alternative: manual registration (skip the wizard)**

```bash
claude mcp add planning-game \
  -e GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app \
  -- planning-game-mcp
```

**If using npx (Option B):**

```bash
claude mcp add planning-game \
  -e GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app \
  -- npx planning-game-mcp
```

**If using from source (Option C):**

```bash
claude mcp add planning-game \
  -e GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app \
  -- node /absolute/path/to/mcp/index.js
```

### 4. First run — set up your identity

Once Claude Code starts with the MCP connected, run:

```
> Use setup_mcp_user to configure my identity
```

This creates a `.mcp-user.json` file with your developer ID, used to track who creates/updates cards.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Absolute path to `serviceAccountKey.json` |
| `FIREBASE_DATABASE_URL` | No | RTDB URL (auto-derived from service account if not set) |
| `MCP_INSTANCE_DIR` | No | Directory for instance-specific config (enables multi-instance) |

\* Either this env var or a `serviceAccountKey.json` file in the MCP directory.

## Available Tools (48)

### Project Management
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `get_project` | Get project details (team, repos, guidelines) |
| `update_project` | Update project settings |
| `create_project` | Create a new project |
| `discover_project` | Discover a project by its repository URL (HTTPS, SSH, with/without .git) |

### Cards (Tasks, Bugs, Epics, Proposals, QA)
| Tool | Description |
|------|-------------|
| `list_cards` | List cards with filters (type, status, sprint, developer, year) |
| `get_card` | Get full card details + available transitions |
| `create_card` | Create a new card with auto-generated ID |
| `update_card` | Update card fields (status, developer, points, etc.) |
| `relate_cards` | Create relations between cards (related, blocks/blockedBy) |
| `get_transition_rules` | Get valid status transitions for a card type |

#### Two kinds of proposal, on purpose

| | **Task proposal** | **Plan proposal** |
|---|---|---|
| Tool | `create_card type=proposal` | `create_plan_proposal` |
| Shape | Como / Quiero / Para (user story) | Free text (prose, markdown) |
| Who writes it | Typically someone outside the team | Typically an AI |
| Size | One unit of work | Bigger: needs several tasks |
| Outcome | A **task** (approved from the UI) | A **development plan** (`create_plan`), which then generates tasks |
| Stored at | `/cards/{project}/PROPOSALS_{project}` | `/planProposals/{project}` |
| Shown in | Proposals tab | Proposals sub-tab of Dev Plans |

They are separate because the content has a different shape: a spec does not
fit in a user-story form, and a user story is not a roadmap.

A task proposal that turns out to be plan-sized can still be approved as a
plan with `create_plan proposalCardId="<XXX-PRP-NNNN>"`, which marks the card
with `convertedToPlan`. `list_cards type=proposal` returns `convertedToPlan` /
`convertedToTask` so you can tell approved proposals from pending ones.

### Sprints
| Tool | Description |
|------|-------------|
| `list_sprints` | List sprints by year |
| `get_sprint` | Get sprint details |
| `create_sprint` | Create a new sprint |
| `update_sprint` | Update sprint fields |

### Team
| Tool | Description |
|------|-------------|
| `list_developers` | List project developers |
| `list_stakeholders` | List project stakeholders/validators |

### Architecture Decision Records (ADRs)
| Tool | Description |
|------|-------------|
| `list_adrs` / `get_adr` / `create_adr` / `update_adr` / `delete_adr` | Full CRUD |

### Development Plans
| Tool | Description |
|------|-------------|
| `list_plans` / `get_plan` / `create_plan` / `update_plan` / `delete_plan` | Development plans |
| `list_plan_proposals` / `get_plan_proposal` / `create_plan_proposal` / `update_plan_proposal` / `delete_plan_proposal` | Plan proposals — free-text ideas that become development plans (see [Two kinds of proposal](#two-kinds-of-proposal-on-purpose)) |

### Global Configuration
| Tool | Description |
|------|-------------|
| `list_global_config` / `get_global_config` / `create_global_config` / `update_global_config` / `delete_global_config` | Shared instructions, prompts, agent configs |

### Guideline Versioning
| Tool | Description |
|------|-------------|
| `get_guideline_history` | Get version history of a guideline (current + all previous versions with timestamps) |
| `restore_guideline_version` | Restore a guideline to a previous version (creates new version preserving full history) |

### Diagnostics
| Tool | Description |
|------|-------------|
| `pg_doctor` | Run comprehensive diagnostics (credentials, connectivity, dependencies, config) |
| `pg_config` | View MCP configuration (instance, Firebase project, env vars, user) |

### System
| Tool | Description |
|------|-------------|
| `setup_mcp_user` | Configure your developer identity |
| `get_mcp_status` | Server status, version, Firebase project |
| `update_mcp` | Pull latest changes from git |
| `publish_mcp_version` | Publish MCP version to Firebase so other users get update notifications |

### User Management
| Tool | Description |
|------|-------------|
| `provision_user` | Provision a new user or update existing one (auto-generates developer/stakeholder IDs, assigns projects) |
| `delete_user` | Delete a user from /users/ and clean up legacy permission paths |

### Sync
| Tool | Description |
|------|-------------|
| `sync_guidelines` | Download guidelines from Firebase and write them as local files (compares versions, only updates changed) |

## Multi-Instance Setup

To connect to multiple Firebase projects simultaneously, register each as a separate MCP server:

```bash
# Instance 1
claude mcp add planning-game-teamA \
  -e GOOGLE_APPLICATION_CREDENTIALS=/path/to/teamA/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://team-a-default-rtdb.firebasedatabase.app \
  -e MCP_INSTANCE_DIR=/path/to/teamA/config \
  -- node /path/to/index.js

# Instance 2
claude mcp add planning-game-teamB \
  -e GOOGLE_APPLICATION_CREDENTIALS=/path/to/teamB/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://team-b-default-rtdb.firebasedatabase.app \
  -e MCP_INSTANCE_DIR=/path/to/teamB/config \
  -- node /path/to/index.js
```

Each instance maintains its own `.mcp-user.json` in its `MCP_INSTANCE_DIR`.

## Docker

```bash
docker build -t planning-game-mcp .
docker run -it \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebasedatabase.app \
  -v /path/to/serviceAccountKey.json:/app/serviceAccountKey.json:ro \
  planning-game-mcp
```

## Publishing to npm

For maintainers — to build and publish a new version:

```bash
# 1. Bump version in mcp/package.json
# 2. From the repo root, build and publish in one step:
npm run mcp:publish
```

That command runs `scripts/build-mcp-standalone.js`, which:

1. Copies `mcp/` into `dist-mcp/`
2. Copies `shared/` into `dist-mcp/lib/shared/` (otherwise external installs break)
3. Rewrites `../shared/...` and `../../shared/...` imports to `./lib/shared/...`
4. Generates a standalone `package.json` with a `bin` entry
5. Validates no residual raw `shared/` imports remain
6. Runs a smoke test (`node dist-mcp/index.js --version`) before publishing

**Do not run `npm publish` from `mcp/`.** That directory is marked `"private": true` and has a `prepublishOnly` guard that blocks direct publishes — the working tree is the development source, not the distributable package.

## License

MIT

# Planning Game V2 — Hybrid Database Architecture

## Strategy: Firestore (hot) + Data Connect/PostgreSQL (cold)

```
┌──────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                      │
├────────────────────────┬─────────────────────────────────┤
│   Firestore SDK        │   Data Connect SDK (generated)  │
│   onSnapshot, CRUD     │   GraphQL queries (read-only)   │
│   Real-time, offline   │   Dashboards, reports, search   │
├────────────────────────┴─────────────────────────────────┤
│                     CLOUD FUNCTIONS                       │
│   onWrite(Firestore) → INSERT/UPDATE PostgreSQL           │
│   Scheduled → cleanup, aggregation, materialized views    │
├────────────────────────┬─────────────────────────────────┤
│   FIRESTORE            │   CLOUD SQL (PostgreSQL)         │
│   Source of truth      │   Analytical replica             │
│   Cards, projects,     │   Same data, relational schema   │
│   users, notifications │   + aggregated views, indexes    │
└────────────────────────┴─────────────────────────────────┘
```

## What lives where

### Firestore (primary — read/write)
Everything the user interacts with in real-time:
- Cards (all types): CRUD, status transitions, real-time sync
- Projects: metadata, settings
- Team members: per-project developers/stakeholders
- User profiles: preferences, permissions
- Notifications: real-time bell
- Developer backlogs: drag-drop ordering
- Global config: guidelines, prompts, agents

**Why**: Real-time listeners, offline support, sub-100ms sync, security rules.

### PostgreSQL via Data Connect (replica — read-only from client)
Everything that benefits from SQL queries:
- Dashboard aggregations (points by status, sprint burndown)
- Cross-project reports (all blocked tasks, velocity trends)
- Hours/workday reports (date math, JOINs with team data)
- Full-text search across cards
- Sprint analytics (AVG velocity, predicted completion)
- ISO compliance reports
- Developer performance metrics
- Future: vector embeddings for semantic card search

**Why**: JOINs, GROUP BY, SUM/AVG/COUNT, full-text search, window functions.

## PostgreSQL Schema

```sql
-- Projects
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,       -- "PlanningGame"
  name        TEXT NOT NULL,
  abbreviation TEXT NOT NULL,         -- "PLN"
  description TEXT,
  repo_url    TEXT,
  scoring     TEXT DEFAULT '1-5',     -- '1-5' | 'fibonacci'
  archived    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL
);

-- Team members (per project)
CREATE TABLE team_members (
  id          TEXT PRIMARY KEY,       -- Firestore doc ID
  project_id  TEXT NOT NULL REFERENCES projects(id),
  uid         TEXT,                   -- Firebase Auth uid
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,          -- 'developer' | 'stakeholder' | 'both'
  active      BOOLEAN DEFAULT TRUE,
  joined_at   TIMESTAMPTZ NOT NULL,
  UNIQUE(project_id, email)
);

-- Cards (all types in one table, discriminated by type)
CREATE TABLE cards (
  id              TEXT PRIMARY KEY,       -- Firestore doc ID
  card_id         TEXT NOT NULL UNIQUE,   -- "PLN-TSK-0042"
  project_id      TEXT NOT NULL REFERENCES projects(id),
  type            TEXT NOT NULL,          -- 'task','bug','epic','sprint','proposal','qa'
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL,
  year            INT NOT NULL,
  epic_id         TEXT,                   -- card_id of parent epic
  sprint_id       TEXT,                   -- card_id of parent sprint
  developer_id    TEXT,                   -- team_member.id
  developer_name  TEXT,                   -- denormalized
  validator_id    TEXT,
  validator_name  TEXT,
  dev_points      INT,
  business_points INT,
  priority        NUMERIC,               -- calculated
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL,
  created_by      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,

  -- Bug-specific
  bug_priority    TEXT,
  registered_at   TIMESTAMPTZ,
  root_cause      TEXT,
  resolution      TEXT,

  -- Sprint-specific
  sprint_start    DATE,
  sprint_end      DATE,
  locked          BOOLEAN,

  -- Proposal-specific
  converted_to    TEXT,                   -- card_id if converted to task

  -- Tags & tracking
  tags            TEXT[],                   -- e.g., {"INFRA","REFACTOR"}
  total_work_ms   BIGINT
);

-- Indexes for common dashboard queries
CREATE INDEX idx_cards_project_type ON cards(project_id, type);
CREATE INDEX idx_cards_project_status ON cards(project_id, type, status);
CREATE INDEX idx_cards_developer ON cards(developer_id, status);
CREATE INDEX idx_cards_year ON cards(year, project_id, type);
CREATE INDEX idx_cards_sprint ON cards(sprint_id, status);
CREATE INDEX idx_cards_search ON cards USING GIN(to_tsvector('spanish', title || ' ' || COALESCE(description, '')));
CREATE INDEX idx_cards_tags ON cards USING GIN(tags);  -- Array containment queries

-- History (append-only audit log)
CREATE TABLE card_history (
  id          BIGSERIAL PRIMARY KEY,
  card_id     TEXT NOT NULL,             -- cards.card_id
  project_id  TEXT NOT NULL,
  changed_by  TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT
);

CREATE INDEX idx_history_card ON card_history(card_id, changed_at DESC);

-- Commits linked to cards
CREATE TABLE card_commits (
  id          BIGSERIAL PRIMARY KEY,
  card_id     TEXT NOT NULL,
  hash        TEXT NOT NULL,
  message     TEXT,
  author      TEXT,
  committed_at TIMESTAMPTZ
);

-- Work cycles (In Progress time tracking)
CREATE TABLE work_cycles (
  id          BIGSERIAL PRIMARY KEY,
  card_id     TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  duration_ms BIGINT
);

-- Plans
CREATE TABLE plans (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  title       TEXT NOT NULL,
  objective   TEXT,
  status      TEXT DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  TEXT NOT NULL
);

-- ADRs
CREATE TABLE adrs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  title       TEXT NOT NULL,
  context     TEXT,
  decision    TEXT,
  consequences TEXT,
  status      TEXT DEFAULT 'proposed',
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  TEXT NOT NULL
);
```

## Data Connect GraphQL Schema

```graphql
# Data Connect schema (maps to PostgreSQL tables)

type Project @table {
  id: ID!
  name: String!
  abbreviation: String!
  description: String
  archived: Boolean
  cards: [Card!]! @relation
  teamMembers: [TeamMember!]! @relation
}

type Card @table {
  id: ID!
  cardId: String! @unique
  project: Project! @relation
  type: String!
  title: String!
  status: String!
  year: Int!
  developerName: String
  devPoints: Int
  businessPoints: Int
  priority: Float
  startDate: DateTime
  endDate: DateTime
  totalWorkMs: Int
}

type TeamMember @table {
  id: ID!
  project: Project! @relation
  name: String!
  email: String!
  role: String!
  active: Boolean
}

# Pre-defined queries (deployed server-side)

query DashboardSummary($projectId: ID!, $year: Int!) @auth(level: USER) {
  cards(where: { project: { id: $projectId }, year: $year }) {
    type
    status
    devPoints
    businessPoints
  }
}

query SprintBurndown($sprintId: String!) @auth(level: USER) {
  cards(where: { sprintId: $sprintId }) {
    cardId
    title
    status
    devPoints
    startDate
    endDate
  }
}

query CrossProjectBlocked @auth(level: USER) {
  cards(where: { status: "Blocked" }) {
    cardId
    title
    project { name abbreviation }
    developerName
  }
}

query SearchCards($term: String!, $projectId: ID) @auth(level: USER) {
  cards_search(query: $term, where: { project: { id: $projectId } }) {
    cardId
    title
    type
    status
    project { name }
  }
}

query DeveloperVelocity($developerId: String!, $year: Int!) @auth(level: USER) {
  cards(where: {
    developerId: $developerId,
    year: $year,
    status_in: ["Done", "Done&Validated"]
  }) {
    devPoints
    endDate
    sprintId
  }
}
```

## Sync Strategy: Firestore → PostgreSQL

### Cloud Function trigger

```javascript
// functions/src/triggers/sync-to-postgres.js

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getDataConnect } = require('firebase-admin/data-connect');

exports.syncCardToPostgres = onDocumentWritten(
  'projects/{projectId}/cards/{cardId}',
  async (event) => {
    const dc = getDataConnect();

    if (!event.data.after.exists) {
      // Deleted
      await dc.mutation('deleteCard', { id: event.params.cardId });
      return;
    }

    const card = event.data.after.data();
    await dc.mutation('upsertCard', {
      id: event.data.after.id,
      cardId: card.cardId,
      projectId: event.params.projectId,
      type: card.type,
      title: card.title,
      status: card.status,
      year: card.year,
      // ... all fields
    });
  }
);
```

### Sync guarantees
- **Eventual consistency**: PostgreSQL replica may lag 1-2 seconds behind Firestore
- **Acceptable for analytics**: Dashboards don't need sub-second accuracy
- **Retry on failure**: Cloud Functions retry on transient errors
- **Idempotent upserts**: UPSERT ensures no duplicates

### What if sync fails?
- Cloud Function retries automatically (up to 5 times)
- Dead letter queue for persistent failures
- Scheduled reconciliation job (daily): compare Firestore doc count vs PostgreSQL row count
- Alert if delta > threshold

## Cost Estimate

| Component | Free tier | Beyond free tier | PG estimate |
|-----------|-----------|-----------------|-------------|
| **Firestore** | 50K reads, 20K writes/day | Standard pricing | ~$5-15/month |
| **Data Connect ops** | 250K ops/month | $4/million | ~$0-2/month |
| **Cloud SQL** | 3-month trial | From $9.37/month | ~$10-15/month |
| **Cloud Functions** | 2M invocations/month | Standard pricing | ~$0-5/month |
| **Total** | | | **~$15-37/month** |

Compare with V1 (RTDB only): ~$5-10/month. The PostgreSQL adds ~$10-15/month but eliminates the need for custom aggregation Cloud Functions and external search services.

## When to query which database

| Use case | Database | Why |
|----------|----------|-----|
| Load card detail | Firestore | Real-time, offline |
| Kanban board | Firestore | onSnapshot for live updates |
| Create/edit card | Firestore | Source of truth, security rules |
| Dashboard charts | Data Connect | GROUP BY, SUM, aggregations |
| Sprint burndown | Data Connect | Date math, window functions |
| Full-text search | Data Connect | PostgreSQL GIN index |
| Cross-project reports | Data Connect | JOINs across projects |
| Hours report | Data Connect | Date ranges, developer JOINs |
| Notification bell | Firestore | Real-time listener |
| Developer backlog | Firestore | Drag-drop, real-time ordering |

## Phase Impact

This hybrid approach affects the implementation phases:

- **Phase 1**: Add Cloud SQL setup, Data Connect initialization
- **Phase 2**: Add sync Cloud Function (Firestore → PostgreSQL)
- **Phase 3**: No change (views read from Firestore)
- **Phase 5**: Dashboard, reports, search → query Data Connect instead of Firestore
- **Phase 6**: MCP server can query both (Firestore for CRUD, PostgreSQL for analytics)

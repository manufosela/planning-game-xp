# Planning Game V2 — Architecture

## Stack

```
Frontend:    Astro 5 + Lit 3 + JavaScript (JSDoc + d.ts)
Styling:     CSS Layers + Design Tokens + Container Queries
State:       Reactive store (Lit Context + SignalWatcher)
Backend:     Firebase (Firestore, Auth, Functions, Storage, FCM)
Functions:   JavaScript Cloud Functions v2 (JSDoc + d.ts)
MCP:         Node.js + MCP SDK (JSDoc + d.ts)
Testing:     Vitest + Playwright
```

## Why this stack

### Astro + Lit (keep)
- Astro gives us SSR pages with zero JS by default
- Lit gives us lightweight reactive components (6KB)
- Web components are framework-agnostic — MCP, embeds, integrations get them for free
- No need for React/Vue/Svelte — we're not building a SPA, we're building a tool

### JSDoc + d.ts (new)
- Type safety without transpilation: code runs as-is, no build step for types
- `d.ts` files define shared types (cards, projects, users) — editors give full IntelliSense
- JSDoc `@param`, `@returns`, `@typedef` annotate functions in place — types ARE the documentation
- Firestore converters get typed via JSDoc casts — no TypeScript converters needed
- Zero abstraction layer: what you write is what runs

### Lit Context + Signals (new, replaces 37 services + 3 event patterns)
- `@lit/context` for dependency injection (auth, firestore, theme)
- `@lit-labs/signals` for reactive state (current project, filters, user)
- No more AppEventBus + ServiceCommunicator + EventDelegationManager
- Components consume state declaratively, not via event subscriptions

### Firestore (replaces RTDB)
- Subcollections: `projects/{id}/cards/{id}` (not flat paths with encoded keys)
- Composite queries: `where type==task AND status==In Progress AND year==2026`
- Per-document security rules (not path-based wildcards)
- Offline persistence built-in
- No email encoding hacks (use `uid` as document ID)

## Project Structure

```
planning-game-xp-v2/
├── src/
│   ├── pages/              # Astro pages (routes)
│   │   ├── index.astro
│   │   ├── project/[id].astro
│   │   ├── dashboard.astro
│   │   ├── wip.astro
│   │   └── admin.astro
│   ├── layouts/
│   │   └── App.astro       # Shell: nav, auth gate, theme
│   ├── components/          # Lit web components
│   │   ├── pg-card.js       # THE card component (polymorphic)
│   │   ├── pg-board.js      # Kanban/Sprint board
│   │   ├── pg-table.js      # Table view
│   │   ├── pg-gantt.js      # Gantt chart
│   │   ├── pg-filters.js    # Unified filters
│   │   ├── pg-modal.js      # Modal system
│   │   ├── pg-form.js       # Dynamic form builder
│   │   ├── pg-nav.js        # Navigation
│   │   ├── pg-toast.js      # Notifications
│   │   └── ...              # ~15-20 components total
│   ├── lib/
│   │   ├── firebase.js      # Firebase init + typed helpers
│   │   ├── store.js         # Reactive state (signals)
│   │   ├── auth.js          # Auth context + guards
│   │   ├── permissions.js   # Role logic (pure functions)
│   │   ├── transitions.js   # Status transition rules (pure functions)
│   │   └── types.d.ts       # Shared type definitions (d.ts)
│   ├── styles/
│   │   ├── tokens.css       # Design tokens (colors, spacing, type)
│   │   ├── base.css         # Reset + global styles
│   │   └── layers.css       # CSS layer definitions
│   └── schemas/
│       └── cards.js         # Zod schemas for card validation
├── functions/               # Cloud Functions (JavaScript + JSDoc)
│   ├── src/
│   │   ├── triggers/        # Firestore triggers
│   │   ├── callable/        # Callable functions
│   │   ├── scheduled/       # Cron jobs
│   │   └── shared/          # Shared types (d.ts) + utils
│   └── jsconfig.json
├── mcp/                     # MCP Server (JavaScript + JSDoc)
│   ├── src/
│   │   ├── tools/
│   │   ├── services/
│   │   └── index.js
│   └── jsconfig.json
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── fixtures/
├── firestore.rules
├── storage.rules
└── firebase.json
```

## Key Architectural Decisions

### 1. One card component, not six

V1 has TaskCard, BugCard, ProposalCard, EpicCard, SprintCard, QACard — all extending BaseCard with 90% shared code.

V2: **`<pg-card>`** — one component that renders differently based on `type`:
```javascript
/** @typedef {import('../types.d.ts').Card} Card */

export class PgCard extends LitElement {
  static properties = {
    card: { type: Object },   // /** @type {Card} */
    expanded: { type: Boolean },
  };

  render() {
    return html`
      <div class="card card--${this.card.type}">
        ${this.renderHeader()}
        ${this.expanded ? this.renderBody() : nothing}
      </div>
    `;
  }

  /** @private */
  renderBody() {
    switch (this.card.type) {
      case 'task': return this.renderTaskBody(this.card);
      case 'bug': return this.renderBugBody(this.card);
      // ...
    }
  }
}
customElements.define('pg-card', PgCard);
```

Type-specific fields handled via `d.ts` discriminated unions, not class inheritance.

### 2. One view switcher, not five renderers

V1 has TableRenderer + ListRenderer + KanbanRenderer + SprintRenderer + GanttRenderer, each with a paired ViewManager.

V2: **`<pg-board>`** handles Kanban + Sprint (same concept: columns + drag-drop), **`<pg-table>`** handles table, **`<pg-gantt>`** handles Gantt. List view is just `<pg-card>` in a CSS grid. Total: 3 view components instead of 10 files.

### 3. Reactive store, not event bus

V1 communication:
```
Component → emit DOM event → Service listens → Service emits response event → Component listens
Component → AppEventBus.emit() → Other component → AppEventBus.on()
Component → ServiceCommunicator.request() → Service → ServiceCommunicator.response()
```

V2 communication:
```javascript
/** @typedef {import('../types.d.ts').Project} Project */
/** @typedef {import('../types.d.ts').Card} Card */

// Define reactive state
const projectStore = signal(/** @type {Project|null} */ (null));
const cardsStore = signal(/** @type {Card[]} */ ([]));
const filtersStore = signal(defaultFilters);

// Derived state (automatic)
const filteredCards = computed(() =>
  applyFilters(cardsStore.value, filtersStore.value)
);

// Components just consume
export class PgBoard extends SignalWatcher(LitElement) {
  render() {
    // Automatically re-renders when filteredCards changes
    return html`${filteredCards.value.map(card =>
      html`<pg-card .card=${card}></pg-card>`
    )}`;
  }
}
customElements.define('pg-board', PgBoard);
```

No events, no subscriptions, no cleanup. Signals auto-track dependencies.

### 4. Firestore-native data access

V1: FirebaseService (900 LOC) + CardService + DALService + CardRealtimeService + GlobalDataManager

V2: Typed Firestore helpers (< 200 LOC total):
```javascript
// lib/firebase.js

/**
 * @param {string} projectId
 * @returns {import('firebase/firestore').CollectionReference<Card>}
 */
const cardsRef = (projectId) =>
  collection(db, 'projects', projectId, 'cards')
    .withConverter(cardConverter);

// Usage in component
const cards = useFirestore(
  query(cardsRef(projectId),
    where('type', '==', 'task'),
    where('year', '==', 2026),
    orderBy('priority', 'desc')
  )
);
```

Real-time listeners are just `onSnapshot` with typed converters. No wrapping service needed.

### 5. Pure function business rules

V1: Business rules scattered across PermissionService, StateTransitionService, CardService, Cloud Functions.

V2: Pure functions, testable without Firebase:
```javascript
// lib/transitions.js

/**
 * @param {Card} card
 * @param {string} target
 * @param {User} user
 * @returns {TransitionResult}
 */
export function canTransition(card, target, user) {
  const rules = TRANSITION_RULES[card.type];
  const transition = rules[card.status]?.[target];
  if (!transition) return { allowed: false, reason: 'Invalid transition' };

  const missing = transition.requiredFields.filter(f => !card[f]);
  if (missing.length) return { allowed: false, missing };

  if (transition.roles && !transition.roles.includes(user.role))
    return { allowed: false, reason: 'Insufficient permissions' };

  return { allowed: true };
}
```

### 6. CSS design tokens, not inline styles

V1: Theme via CSS variables set by JS, scattered color constants, per-component style files.

V2: Design token system:
```css
/* tokens.css */
:root {
  /* Semantic tokens */
  --color-surface: var(--gray-50);
  --color-primary: var(--blue-600);
  --color-status-todo: var(--gray-400);
  --color-status-inprogress: var(--blue-500);
  --color-status-validate: var(--amber-500);
  --color-status-done: var(--green-500);

  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;

  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px oklch(0 0 0 / 0.1);
}

[data-theme="dark"] {
  --color-surface: var(--gray-900);
  /* ... */
}
```

Components use tokens, never raw values. Theme switching = one attribute change on `<html>`.

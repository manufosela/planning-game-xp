# Planning Game V2 — Component Map

## Design Philosophy

V1 has 49 components. V2 targets ~20.

The reduction comes from:
- **1 card component** instead of 6 (polymorphic via `type`)
- **1 board component** instead of 2 renderers + 2 managers (Kanban + Sprint modes)
- **1 filter component** instead of 3 (unified from the start)
- **No separate style files** (Lit CSS tagged templates, design tokens)
- **No wrappers** (no BaseCard, no BaseFilters, no mixins — composition over inheritance)

## Component Inventory

### Shell & Navigation

| Component | Tag | Purpose |
|-----------|-----|---------|
| **Nav** | `<pg-nav>` | Top navigation bar: project selector, year selector, user menu, theme toggle, notification bell |
| **Sidebar** | `<pg-sidebar>` | Left sidebar: tab navigation (Tasks, Bugs, Sprints, Epics, Proposals, QA), view switcher, quick filters |
| **Command** | `<pg-command>` | Command palette (Cmd+K): search, navigation, quick actions |

### Cards

| Component | Tag | Purpose |
|-----------|-----|---------|
| **Card** | `<pg-card>` | THE card component. Renders collapsed (row), preview (card), or full (panel) based on `mode`. Content adapts to `card.type`. |
| **CardPanel** | `<pg-card-panel>` | Right-side slide panel for full card editing. Contains `<pg-card mode="full">` + history + comments |

### Views

| Component | Tag | Purpose |
|-----------|-----|---------|
| **Table** | `<pg-table>` | Sortable data table. Column config per card type. Click row → open panel. |
| **Board** | `<pg-board>` | Kanban board (columns by status) or Sprint board (columns by sprint). Mode prop. Drag-drop between columns. |
| **Gantt** | `<pg-gantt>` | Gantt chart for epics/sprints/tasks timeline. |
| **Filters** | `<pg-filters>` | Unified filter bar: type, status, year, developer, sprint, epic, tags, search. Drives reactive `filtersStore`. Tags filter supports multi-select with AND/OR. |

### Forms & Input

| Component | Tag | Purpose |
|-----------|-----|---------|
| **Form** | `<pg-form>` | Dynamic form builder. Schema-driven (Zod). Renders fields based on card type + status. |
| **Modal** | `<pg-modal>` | Lightweight modal for confirmations, quick forms. NOT for card editing (that's the panel). |
| **Select** | `<pg-select>` | Dropdown with search, multi-select support. Replaces external MultiSelect CDN dependency. |

### Feedback & Status

| Component | Tag | Purpose |
|-----------|-----|---------|
| **Toast** | `<pg-toast>` | Toast notifications (success, error, warning, info). Auto-dismiss. |
| **Bell** | `<pg-bell>` | Notification bell with unread count. Dropdown shows recent notifications. |
| **Badge** | `<pg-badge>` | Status/priority/tag badges. Colored pills for status, priority, card type, and tags. Tag colors from project registry. |

### Data Visualization

| Component | Tag | Purpose |
|-----------|-----|---------|
| **Chart** | `<pg-chart>` | Chart wrapper. Burndown, velocity, distribution charts. Uses Chart.js or similar. |

### Admin & Config

| Component | Tag | Purpose |
|-----------|-----|---------|
| **Team** | `<pg-team>` | Team management: add/remove developers, stakeholders. Per-project. |
| **Config** | `<pg-config>` | Global config editor: agents, prompts, guidelines. Markdown editor for content. |
| **Upload** | `<pg-upload>` | File upload (Storage) + bulk card import (CSV/JSON). |

### Total: ~19 components

## Component Communication

```
                    ┌─────────────┐
                    │  Signals    │
                    │  (store.js) │
                    └──────┬──────┘
                           │
              reads/writes │ reactive
                           │
    ┌──────────┬───────────┼───────────┬──────────┐
    │          │           │           │          │
┌───┴──┐  ┌───┴──┐   ┌────┴───┐  ┌───┴──┐  ┌───┴──┐
│pg-nav│  │pg-   │   │pg-board│  │pg-   │  │pg-   │
│      │  │filter│   │pg-table│  │card  │  │bell  │
└──────┘  └──────┘   └────────┘  └──────┘  └──────┘
```

**Data flows DOWN** via signals (components read from store).
**Actions flow UP** via Firestore writes (components write to Firestore, triggers update store via `onSnapshot`).

No events between components. No service layer in between.
Components are dumb renderers + Firestore writers.

## pg-card: The Polymorphic Card

### Modes
```
mode="collapsed"  → One-line row (table, list)
  [PLN-TSK-0042] Fix login bug  ● In Progress  @John  3pts

mode="preview"    → Card (kanban, list)
  ┌─────────────────────────────┐
  │ PLN-TSK-0042       3 pts   │
  │ Fix login bug               │
  │ ● In Progress   @John      │
  │ Sprint 5 · Epic: Auth      │
  └─────────────────────────────┘

mode="full"       → Panel (editing)
  Full form with all fields,
  history, comments, file attachments
```

### Type-specific rendering
```javascript
/** @private */
renderTypeFields() {
  switch (this.card.type) {
    case 'task':
      return html`
        ${this.renderUserStory()}
        ${this.renderAcceptanceCriteria()}
        ${this.renderPoints()}
        ${this.renderPipeline()}
      `;
    case 'bug':
      return html`
        ${this.renderBugPriority()}
        ${this.renderAttachments()}
        ${this.renderResolution()}
      `;
    case 'sprint':
      return html`
        ${this.renderDateRange()}
        ${this.renderSprintGoals()}
        ${this.renderPointsSummary()}
      `;
    // ...
  }
}
```

## pg-board: Unified Board

### Kanban mode (default)
```
| To Do      | In Progress | To Validate | Done        |
|------------|-------------|-------------|-------------|
| [card]     | [card]      | [card]      | [card]      |
| [card]     |             | [card]      |             |
| [card]     |             |             |             |
```
Drag card between columns → updates `status` field.

### Sprint mode
```
| Backlog    | Sprint 5    | Sprint 6    | Sprint 7    |
|------------|-------------|-------------|-------------|
| [card]     | [card]      | [card]      | [card]      |
| [card]     | [card]      |             |             |
```
Drag card between columns → updates `sprint` field.

Same component, different column source. Column config:
```javascript
/**
 * @typedef {Object} BoardConfig
 * @property {'status'|'sprint'} mode
 * @property {Array<{id: string, label: string, color: string, dropField: string}>} columns
 */
```

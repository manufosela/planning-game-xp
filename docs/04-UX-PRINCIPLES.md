# Planning Game V2 — UX Principles

## Problems with V1 UX

1. **Modal overload** — Everything opens in a modal. Creating a task, editing, viewing history, confirming delete — all modals on top of modals (LIFO stack of 3+)
2. **Information density** — Cards show too little collapsed, too much expanded. No middle ground.
3. **Navigation friction** — Need to click project → tab → view → filter → card. Too many steps to get to work.
4. **No keyboard navigation** — Mouse-only interaction
5. **Mobile unusable** — Desktop-first design that breaks on small screens
6. **Visual noise** — Every status has a different color gradient, Kanban columns look like a rainbow

## V2 UX Direction

### 1. Slide panels, not modals

Card detail opens as a **right-side slide panel** (like Linear, Notion, GitHub Projects).
- Full context preserved: you see the board/table behind the panel
- Panel has its own URL (`/project/PLN?card=PLN-TSK-0042`)
- Deep-linkable, browser back button works
- Only use modals for confirmations and quick dialogs

### 2. Progressive disclosure

Cards have 3 states:
- **Collapsed**: ID + title + status badge + developer avatar (one line)
- **Preview**: + user story summary + points + sprint (hover or list view)
- **Full**: Slide panel with all fields, history, comments

### 3. Command palette (Cmd+K)

Quick access to everything:
- Switch project
- Create card
- Jump to card by ID
- Change view
- Toggle filters
- Search across projects

Reduces clicks from 4-5 to 1 keyboard shortcut.

### 4. Keyboard-first

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `C` | Create card (in current context) |
| `T` / `B` / `E` | Switch to Tasks / Bugs / Epics tab |
| `1` / `2` / `3` / `4` | Switch view (Table / Kanban / List / Gantt) |
| `↑` / `↓` | Navigate cards |
| `Enter` | Open selected card |
| `Esc` | Close panel / clear filters |
| `/` | Focus search |

### 5. Neutral color palette

V1: Every status is a bright gradient. Kanban looks like a circus.

V2: **Muted, functional colors**.
- Surface: neutral grays (light) or dark grays (dark mode)
- Status: subtle colored dots or pills, not full-column backgrounds
- Accent: one primary color (blue), one warning (amber), one success (green)
- Cards: white/dark surface with left border color for type
- Focus on content readability, not decoration

### 6. Responsive from day 1

**Breakpoints**:
- `<640px`: Mobile — single column, bottom nav, swipe between views
- `640-1024px`: Tablet — two columns, collapsible sidebar
- `>1024px`: Desktop — full layout with sidebar + main + panel

**Kanban on mobile**: Horizontal swipe between status columns (one column visible at a time, like Trello mobile)

**Table on mobile**: Becomes a card list (responsive table → stacked cards)

### 7. Smart defaults

- New task: auto-fill current year, current sprint (if one is active), current project
- New bug: auto-fill registerDate=today, priority=USER EXPERIENCE ISSUE
- Filters: remember last used per project (localStorage)
- View: remember last used per project+tab

### 8. Contextual actions

Instead of a FAB button with options:
- **Empty state**: "No tasks yet. Create your first task" with inline button
- **Card hover**: Quick actions (change status, assign, set sprint) without opening
- **Drag-drop**: Status change (Kanban), sprint assignment, priority reorder
- **Right-click**: Context menu with common actions

### 9. Real-time presence

Show who else is viewing the same project:
- Avatar stack in top bar ("3 people viewing")
- Card being edited shows editing user's avatar
- Cursor/selection awareness (optional, P2)

### 10. Accessible

- WCAG 2.1 AA compliance
- All interactive elements focusable
- Color not the only indicator (always label + color)
- Screen reader compatible (ARIA labels)
- Sufficient contrast ratios (4.5:1 text, 3:1 UI)
- Reduced motion support (`prefers-reduced-motion`)

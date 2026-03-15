# Planning Game V2

## Design Context

### Users
Development teams practicing eXtreme Programming (XP): developers, product managers, stakeholders. They use PG2 daily to plan sprints, track tasks/bugs, manage backlogs, and validate deliverables. Context: focused work sessions where speed and clarity matter. The job to be done: manage the full XP lifecycle (planning game, iteration tracking, validation) without friction.

### Brand Personality
**Profesional, limpio, eficiente.** Herramienta productiva estilo Linear — sin adornos, funcional, sobria. Tone of voice: directo, conciso, sin jerga innecesaria.

### Emotional Goals
- **Control y confianza**: el usuario siente que tiene todo bajo control, nada se le escapa
- **Fluidez y velocidad**: todo va rapido, sin friccion, se siente productivo
- **Claridad y calma**: informacion clara sin ruido visual, reduce carga cognitiva

### Aesthetic Direction
- **Visual tone**: Minimal, content-focused, neutral palette with functional color accents
- **References**: Linear.app (slide panels, keyboard-first), Notion (clean typography, progressive disclosure)
- **Anti-references**: Jira (pesado, lento, menus infinitos), Trello (demasiado simple, parece juguete), Asana/Monday (colores saturados, gradientes llamativos)
- **Theme**: Light + Dark mode. Primary: Indigo. Neutrals: Slate scale. Status colors: semantic and muted
- **Typography**: Inter (sans), JetBrains Mono (code). Clean hierarchy, tight tracking on headers

### Design Principles
1. **Content over chrome** — Every pixel serves the information. No decorative elements, no gradients, no unnecessary borders. The data IS the interface.
2. **Keyboard-first, mouse-friendly** — Full keyboard navigation with Cmd+K command palette. Mouse works naturally but power users never need it.
3. **Progressive disclosure** — Show the minimum needed, reveal complexity on demand. Cards: collapsed -> preview -> full. Filters: hidden until needed.
4. **Consistent semantic color** — Color communicates meaning (status, type, severity), never decoration. Same color = same meaning everywhere. Always paired with text/icon for accessibility.
5. **Speed is a feature** — Perceived and real performance matter. Instant feedback, optimistic updates, no loading spinners for < 200ms operations.

### Accessibility
- Target: **WCAG 2.1 AAA** — contrast ratio 7:1 for text, 4.5:1 for UI elements
- Color never sole indicator: always paired with label, icon, or pattern
- `prefers-reduced-motion` respected globally
- Focus visible: 2px primary outline, 2px offset
- Full screen reader support with semantic HTML and ARIA
- Daltonism-safe: status/type colors tested against deuteranopia, protanopia, tritanopia

### Design Tokens Reference
- **Colors**: `src/styles/tokens.css` — slate neutrals, indigo primary, semantic status/type colors
- **Spacing**: 8px base unit, scale from 2px (2xs) to 64px (4xl)
- **Radius**: 4px (sm) to 16px (xl), 9999px for pills
- **Shadows**: 4-level elevation (sm, md, lg, xl)
- **Typography**: 7-step scale from 12px (xs) to 30px (3xl), weights 400-700
- **Transitions**: 150ms (fast), 200ms (base), 300ms (slow)
- **Z-index**: 5-level stack: base(1), dropdown(100), sticky(200), overlay(300), modal(400), toast(500)

### Component Architecture
- ~20 Lit web components (vs V1's 49) — "less code, more product"
- Polymorphic `pg-card` renders all card types in 3 modes (collapsed, preview, full)
- State via `@lit-labs/signals` — one-way data flow, no event bus
- Styles scoped in components via `static styles = css\`...\``
- CSS custom properties for theming across shadow DOM boundaries

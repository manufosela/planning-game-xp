# Planning Game V2 — Vision

## Why a rewrite?

V1 grew organically over years. It works, but carries accumulated debt:
- 49 web components, many with overlapping responsibilities
- 37 services with tangled dependencies and 3 communication patterns
- RTDB data model with email encoding hacks and flat paths
- 5 renderers + 5 view managers doing similar things differently
- No TypeScript, no design system, no component library

A V2 isn't about adding features. It's about building the same product with 1/3 of the code, a modern UX, and a foundation that scales.

## Design Principles

1. **Less code, more product** — Fewer abstractions, fewer files, fewer indirections
2. **Type everything** — JSDoc + d.ts end-to-end, from Firestore to UI
3. **One way to do things** — One state solution, one event pattern, one data layer
4. **Cards are cards** — One polymorphic card component, not 6 classes
5. **Firestore-native** — Design for Firestore from day 1, no RTDB compat
6. **Mobile-ready** — Responsive from the start, not bolted on
7. **AI-first tooling** — MCP server is a first-class citizen, not an addon

## What stays

- **Astro** — SSR/SSG hybrid is perfect for this app
- **Lit** — Web components are the right call (framework-agnostic, lightweight)
- **Firebase** — Auth, Firestore, Functions, Storage, FCM
- **MCP Server** — Keep and evolve
- **XP methodology** — The domain model is solid

## What changes

- **JSDoc + d.ts types** (type safety without transpilation)
- **Firestore primary** (no RTDB, no migration layer)
- **Design tokens + component library** (consistent UI)
- **Unified state** (one reactive store, no event spaghetti)
- **Polymorphic cards** (one component, type-driven rendering)
- **Modern CSS** (container queries, layers, nesting)
- **Simplified rendering** (no separate renderer/viewmanager/factory per view)

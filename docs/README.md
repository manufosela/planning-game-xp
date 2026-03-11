# Planning Game V2 — Design Documents

Complete rewrite specification for Planning Game XP.

## Documents

| # | Document | Content |
|---|----------|---------|
| 00 | [Vision](00-VISION.md) | Why rewrite, design principles, what stays/changes |
| 01 | [Architecture](01-ARCHITECTURE.md) | Stack, project structure, key decisions (signals, polymorphic cards, pure functions) |
| 02 | [Data Model](02-DATA-MODEL.md) | Firestore schema, d.ts type definitions, indexes, migration strategy |
| 03 | [Phases](03-PHASES.md) | 6 implementation phases with deliverables and acceptance criteria |
| 04 | [UX Principles](04-UX-PRINCIPLES.md) | Slide panels, command palette, keyboard-first, responsive, accessible |
| 05 | [Component Map](05-COMPONENT-MAP.md) | ~19 components (vs V1's 49), communication pattern, polymorphic card design |
| 06 | [Hybrid Database](06-HYBRID-DATABASE.md) | Firestore (hot/real-time) + Data Connect/PostgreSQL (cold/analytics), sync strategy, SQL schema |

## Reference

| Document | Content |
|----------|---------|
| [V1 Spec](../planning-game-xp/docs/V2_SPEC.md) | Complete V1 functional audit (pages, services, components, data model, cloud functions) |

## Quick Summary

- **V1**: 49 components, 37 services, 50K+ LOC, RTDB, JavaScript
- **V2 target**: ~19 components, ~5 lib modules, ~17.5K LOC, Firestore, JavaScript (JSDoc + d.ts)
- **Stack**: Astro 5 + Lit 3 + JavaScript (JSDoc + d.ts) + Firestore + Data Connect (PostgreSQL) + Cloud Functions v2
- **UX**: Slide panels, command palette (Cmd+K), keyboard-first, responsive
- **Data**: Firestore (real-time CRUD) + PostgreSQL (analytics, search, reports). One `cards` subcollection, uid-based users
- **State**: Lit Signals (no event bus, no service communicator)
- **Phases**: 6 incremental phases, each deployable

# Documentation

Project docs for the SAT-prep LMS (built on the SAT Question Bank scraper + viewer).

Start with **CLAUDE.md** (repo root) for the project rules, then the docs below.

| File | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Canonical design spec — the conventions every file, migration, and component must follow |
| [SCHEMA.md](./SCHEMA.md) | Current DB schema reference — tables, columns, helper fns, RPCs (check before writing SQL) |
| [MIGRATIONS.md](./MIGRATIONS.md) | Migration ledger — one row per SQL migration, forward-only rules + recurring gotchas |
| [SITEMAP.md](./SITEMAP.md) | Project layout: every directory and what lives in it |
| [PROCEDURES.md](./PROCEDURES.md) | How to run things: scrape, rebuild index, run viewer, deploy |
| [MECHANISMS.md](./MECHANISMS.md) | How the system works internally — API endpoints, filter logic, viewer state |
| [CONTROLLED_TESTS.md](./CONTROLLED_TESTS.md) | Controlled-testing system — teacher-managed students, the full-test runner, RPCs |
| [SKILL_DOMAINS.md](./SKILL_DOMAINS.md) | SAT skill-domain analytics — data, shared `skills.ts` module, the 5 mastery surfaces, RLS/RPCs, how to classify a new test |
| [PROCTORING.md](./PROCTORING.md) | Proctoring & test security — telemetry/timeline, fullscreen lockdown, and the SEB design |
| [LMS_FEATURES.md](./LMS_FEATURES.md) | Feature catalogue — built / partially built / unbuilt / out of scope |
| [LMS_ROADMAP.md](./LMS_ROADMAP.md) | Honest, opinionated roadmap — where we are and what's next |
| [DESIGN.md](./DESIGN.md) | Design system: identity colors, typography, spacing, anti-patterns, audit checklist |
| [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md) | The UX bar — the interaction-quality standard the product is held to |
| [COMPONENTS.md](./COMPONENTS.md) | Reference catalogue of ~60 components organized by purpose |
| [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) | Ops runbook — deploy, monitoring, incident fixes, rollback, rate-limit notes |
| [LEARNINGS.md](./LEARNINGS.md) | Non-obvious things discovered along the way, design decisions, and gotchas |
| [SESSION_RECAP.md](./SESSION_RECAP.md) | What shipped recently, wave by wave |
| [../CHANGELOG.md](../CHANGELOG.md) | Dated changelog — fulltest / skill-domain analytics work |
| [AUTONOMOUS_CHANGELOG.md](./AUTONOMOUS_CHANGELOG.md) | Dated changelog — hooks / assignments / a11y work (parallel session) |

> Two changelogs reflect two parallel autonomous sessions with disjoint scopes
> (skill/fulltest vs hooks/assignments/a11y). Both are dated, newest-first.

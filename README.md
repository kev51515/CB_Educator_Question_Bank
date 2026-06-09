# OmniLMS

An LMS for SAT classes **and** college counseling — Canvas-style courses,
full-length Bluebook-style tests + skill mastery, and a counseling suite
(college lists, applications, tasks, advising). Built on React 19 + Vite +
Supabase. (Repo dir is still `CB_Educator_Question_Bank`; product brand is
OmniLMS.)

## What's here

- **3,444 original SAT questions** scraped and structured under `data/json/` (29 skills × 3 difficulties × 2 sections).
- **Set #1 parallel form**: 3,441 clones that test the same skills at the same difficulty with different surface content (`data/sets/set-1/json/`).
- **Skill template framework**: 29 skill catalogs (`data/templates/`) with 131 aspects, 340 types, and measurable difficulty levers — the spec that drives faithful cloning.
- **Browser viewer** (`viewer/`): React + Vite. Filters, search, command palette, print-set workflow, Set toggle.
- **Canvas-style LMS** (`viewer/`, Supabase backend): courses, modules, assignments, full-length Digital SAT practice tests, gradebook, and **SAT skill-domain analytics** — a class results heatmap (by question / by skill), per-student and student-facing skill profiles, and cross-class comparison. See [`docs/SKILL_DOMAINS.md`](docs/SKILL_DOMAINS.md).
- **Verification pipeline**: subagent-driven template-aware checks; per-clone `templateId` tags; aggregate reports.

## Quick start

```bash
# Run the viewer
cd viewer
npm install
npm run dev
# Open http://localhost:9000
```

## Status

- Set #1: **3,441 / 3,444 (99.9%)** — 3 image-only originals unfilled
- Real-bug rate after cleanup: **~0.15%**
- Verified pass rate: **92.5%**

## Documentation

- [`CHANGELOG.md`](CHANGELOG.md) — dated log of recent changes
- [`docs/SKILL_DOMAINS.md`](docs/SKILL_DOMAINS.md) — SAT skill-domain analytics architecture
- [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) — one row per DB migration
- [`docs/SESSION_REPORT.md`](docs/SESSION_REPORT.md) — comprehensive quality audit + history
- [`docs/SESSION_PROGRESS.md`](docs/SESSION_PROGRESS.md) — current state + resume guide
- [`data/templates/_schema.md`](data/templates/_schema.md) — 6-level taxonomy spec
- Recipes for cloning / verifying / tagging / re-cloning under `data/templates/_*_recipe.md` and `data/sets/set-1/_*_recipe.md`

## Pipeline

```
Original scrape  →  Template distillation  →  v1 cloning  →
Tagging  →  Template-aware verification  →  Triage  →
Reclone real bugs  →  Template-aware regeneration  →
Final index + viewer
```

All scripts under `scripts/` are reusable across sets (`--set set-2`, etc.). Template framework is skill-level so future parallel forms cost ~1/3 the time of Set #1.

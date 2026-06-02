# Modularization plan

Large files hurt: they're slow to edit, collision-prone across concurrent
sessions, and bury cohesion. This is the plan to split them — **pure mechanical
extraction, no behaviour change.**

## Principles
- **Mechanical only** — move code, keep logic identical. If a diff isn't a pure
  move, stop and reconsider.
- **`tsc -b` green + `npm run smoke` between every step.** One file modularized
  per commit; commit + push each (shared tree — never `git add -A`, stage only
  the extracted file + its source).
- **Domain folders** for surface-coupled pieces (CLAUDE.md's "surface-coupled
  components" exception): `teacher/modules/`, `teacher/qbank/`, etc. Barrel-export.
- Pull three things out of each monster: (a) leaf **components**, (b) **hooks**
  (data/state), (c) pure **helpers** (tree-building, drag-drop, formatters).
- Target **200–400 lines/file**.

## The offenders (lines, as of 2026-06)
| File | Lines | Hot? |
|---|---|---|
| `teacher/ModulesPage.tsx` | 4,607 | 🔥 yes |
| `App.tsx` | 1,443 | central |
| `teacher/QuestionBankPage.tsx` | 1,397 | 🔥 yes |
| `admin/AdminAuditPage.tsx` | 1,338 | 🔥 recent |
| `teacher/CourseMaterials.tsx` | 1,199 | safe |
| `teacher/StudentProfilePage.tsx` | 1,170 | 🔥 recent |
| `teacher/DiscussionTopicView.tsx` | 1,168 | 🔥 yes |
| `teacher/TeacherAttemptDetailView.tsx` | 1,025 | safe |
| `dashboard/CohortSummaryWidget.tsx` | 1,011 | 🔥 recent |
| `components/SidebarV2.tsx` | 989 | safe |
| `teacher/CourseGradebook.tsx` | 961 | recent |
| `teacher/ClassRoster.tsx` | 878 | 🔥 recent |
| `teacher/CoursePortfolio.tsx` | 834 | recent |
| `calendar/CalendarPage.tsx` | 808 | safe |

"🔥/recent" = touched by a concurrent session; extracting from these while they
are live-edited collides badly.

## Per-file split boundaries

**`ModulesPage.tsx` (4,607 → ~6 files)** — the priority once it's quiet:
- `modules/moduleTree.ts` — `buildModuleTree` + tree/flatten helpers (pure).
- `modules/dnd.ts` — drag/drop handlers + position math.
- `modules/PublishControls.tsx` — `OptimisticPublishToggle` / `PublishToggle` / `PublishBadge`.
- `modules/AddItemForm.tsx` — the inline add-item picker (~700 lines: chips, per-type branches, `submit()`). Biggest single win.
- `modules/ModuleCard.tsx` + `modules/ModuleItemRow.tsx` — module header + item rows.
- `ModulesPage.tsx` — slim orchestrator (data hook + layout + wiring).

**`QuestionBankPage.tsx` (1,397)** — `qbank/PracticeTestsSection.tsx`,
`qbank/QuestionSetsSection.tsx`, `qbank/CoursePickerDialog.tsx`, filters →
`qbank/usePracticeFilters.ts`. (FullTestCatalog already extracted.)

**`App.tsx` (1,443)** — route groups → a `routes/` module; keep `App` as
providers + shell. (Central — do carefully.)

**1,000–1,300-line pages** (`AdminAuditPage`, `CourseMaterials`,
`StudentProfilePage`, `DiscussionTopicView`, `CourseGradebook`,
`CohortSummaryWidget`, `TeacherAttemptDetailView`): each → a slim page + 2–3
sub-sections + one data hook. Same recipe.

## Sequencing (collision-aware)
1. **Safe non-hot files, on `main`, now:** `CourseMaterials`,
   `TeacherAttemptDetailView`, `SidebarV2`, `CalendarPage`. Low-risk wins.
2. **Hot files (`ModulesPage`, `QuestionBankPage`, `DiscussionTopicView`,
   `CourseGradebook`, …): on a dedicated branch in a coordinated quiet window**,
   extracted in dependency order (helpers → leaf components → forms →
   orchestrator), `tsc`-green per commit, then merged.
3. After each extraction: `npx tsc -b` + `npm run smoke`.

## Already done (this session, toward modularity)
`FullTestCatalog`, `useFullTests`, `TimerSetup` (split from `TimerSession`),
`satScore`, and the `patchModule`/`patchItem` additions to `useCourseModules`
— new logic went into small focused modules rather than the monsters.

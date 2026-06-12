# Journey view — decision record + v1 spec

_Last updated: 2026-06-12_

## What this is

A gamified "journey" rendering of a course's modules/items for students (and a
class-aggregate version for educators), complementing the existing
timeline/list Modules view. Requested by Kevin 2026-06-12 with a Khan Academy
course-mastery screenshot as the seed reference ("think Duolingo style also").

## Decision (2026-06-12)

Three same-data mockups were built and compared
(`design-explorations/journey/compare.html`, commit `586290a8`):

- **A — Ivy expedition map** (winding trail, wax seals, mist-locked stages)
- **B — Duolingo-style path** (3D buttons, XP/streak, START callout, chest)
- **C — Khan-style mastery grid** (units as rows of state-colored cells)

**Chosen: C, the Khan-style mastery grid.** Kevin's verdict: go with Khan for
now; A and B can be reconsidered later, but **as mocked he judged A and B
over-designed with weak aesthetics/layout** — don't resurrect them as-is. If a
"path"-style journey is revisited, it needs a fresh design pass, not a port of
these mockups.

Note on fidelity: the C mockup used Khan's literal palette (purple, Lato) for
honest direction comparison. The **shipped** journey uses our own design
tokens (accent channel, slate scale, Ivy recipes) — Khan's *structure*
(legend, unit rows, state cells, per-unit mastery points, "up next" band),
our *skin*. Per the no-bolted-on rule, it must look native in both ivy and
classic themes, light and dark.

## Locked mechanics (Kevin's answers, 2026-06-12)

| Question | Decision |
|---|---|
| Gold tier ("sealed") | best **effective score ≥ 80%** (uses `assignment_best_attempts.effective_score`, so teacher overrides count) |
| Completion | submitted = done; below-80 shows a "retake for the seal" nudge — retaking is the motivator |
| Mechanics in v1 | **mastery points + levels** — yes. Streaks/leaderboards — no (deferred, maybe never) |
| Placement | **student default** view on the course page (toggle back to List, persisted); educator Modules has a **Journey \| List segmented control with Journey as the PRIMARY/default view** (Kevin, 2026-06-12: "within the module page, it should have 2 views, Journey (primary) and List") |

## v1 design

### Mastery states (per assignment item, from best effective score)

| State | Rule | Cell |
|---|---|---|
| Sealed | submitted, ≥ 80% | gold fill (`.journey-seal`) |
| Proficient | submitted, 60–79% | accent fill |
| Attempted | submitted, < 60% | light accent fill |
| Not started | no submitted attempt | white + border |
| Locked | module `opens_at` in future | muted gray |

Khan's familiar/attempted split was collapsed into one "Attempted" tier — we
show the real % in the tooltip, so two sub-80 tiers added noise, not signal.

### Item kinds → cells

- `qbank_set` (Question Set) → plain state cell.
- `mocktest` assignment (Practice Test) → state cell with a star glyph.
- Full-test **link** items (`/test/:slug`) → star glyph cell; **done/not-done
  only** (via `list_my_test_runs()` — scores are release-gated by design, 0075,
  so no seal tier and no points in v1).
- Links / pages / files → small neutral glyph cells ("side trail", no state,
  no points). Headers are skipped.

### Mastery points + levels (v1: derived, zero migration)

Points are **derived client-side** from `assignment_best_attempts` — no
ledger table, no trigger. Rationale: display-only gamification (no
leaderboard), so derivation is sufficient, fully recomputable, and
anti-gameable by construction — best-attempt-only means retakes can only
*upgrade*, and an item awards once.

- Possible: Question Set = **100 pts**, Practice Test (assignment) = **200 pts**.
- Earned: sealed → 100% of possible · proficient → 75% · attempted → 50%.
- Level (course-scoped) from earned points: thresholds
  `0 / 150 / 400 / 800 / 1300 / 1900 / 2600` → Novice, Apprentice, Scholar,
  Honors Scholar, Dean's List, Summa, Valedictorian.

If a leaderboard or cross-course points ever ship, points must move
server-side (RPC/view) — revisit then.

### Surfaces

- **Student** (`StudentCourseView`): Journey | List segmented toggle, journey
  default for `course_type='class'`, persisted at
  `student.courseView:<courseId>`. HUD (points + level bar) + grid. Cell
  click navigates exactly like the list rows (assignment take path, student
  test runner with `?m=` preserved).
- **Educator** (`ModulesPage`): Journey | List segmented control, **Journey
  default** (persisted `staff.modulesView:<courseId>`; List = the existing
  module editor — toolbar editing pills only show in List). Cell color
  = state of the **class average** effective score among submitted; tooltip =
  `n/N submitted · k sealed · avg x%`. Assignment cells open the assignment;
  test cells open `/educator/tests/:slug`. Only published modules/items are
  shown (it's the student lens). Students who hit this surface always get
  the list (`journeyActive = !isStudent && journeyMode`).

> **Status note (2026-06-12):** the STUDENT-side journey is temporarily
> flagged off (`STUDENT_JOURNEY_ENABLED = false` in `StudentCourseView.tsx`)
> while the rest of the course experience is being tested — students see the
> List only and the toggle is hidden. Flip the flag to restore; saved
> per-course prefs survive. The educator journey is live.

### Code map

- `viewer/src/journey/mastery.ts` — pure state/points/level logic
- `viewer/src/journey/buildJourney.ts` — module rows → journey units
- `viewer/src/journey/JourneyGrid.tsx` — presentational grid (+ legend)
- `viewer/src/journey/JourneyHud.tsx` — points + level header
- `viewer/src/journey/TeacherJourneyPanel.tsx` — educator aggregate wrapper
- `.journey-seal` recipe in `viewer/src/index.css` (gold is the product
  mechanic, not theming — global, both themes)

## v1.1 — interactions (decided + shipped 2026-06-12)

Three interaction moments were mocked two-ways each
(`design-explorations/journey/interactions/compare.html`) and Kevin picked
the recommended direction for all three:

| Screen | Decision | Shipped as |
|---|---|---|
| Cell detail (student) | **1A anchored popover** (over side-peek / direct-nav) | `JourneyCellPopover` — state chip, score, points, due, distance-to-seal bar (gold tick at 80%), Review attempt / Retake-for-the-seal / Start. Full-test cells keep direct nav (runner owns resume state). |
| Educator drill-down | **2A triage popover** (over inline roster band) | `TeacherCellTriage` — distribution bar (sealed/proficient/attempted/not-started), needs-attention list (cap 4: lowest scores, then not-started), **Nudge n students** sends one DM each via `open_thread_with` + `messages` insert. Full roster detail stays Gradebook's job. |
| Seal moment | **3A quiet ledger** (over ceremonial overlay) | Cell stamps gold (`.journey-stamp` press-in + ring), HUD shows rising `+N pts` (`.journey-rise`), standard Toast confirms; level-ups toast too. Diff vs a per-course localStorage snapshot (`journey.snapshot:<courseId>`), gated on meta-loaded-for-current-ids (a plain boolean raced and false-fired). All motion under `prefers-reduced-motion: no-preference`. |

Popover shell lives in `JourneyGrid` (`popover` render prop + `hasPopover`
opt-out; Esc/click-away; anchored + clamped within the section; grid wrapper
must NOT be `overflow-hidden` — it clipped the popover, sections round their
own corners instead).

**QA escape hatch:** `localStorage["journey.preview"]="1"` enables the
student journey while `STUDENT_JOURNEY_ENABLED` is off — used by
`_shot-journey.mjs`, handy for staff preview on a real account.

## Deferred / later

- Full-test seal tier + points (needs a non-release-gated "submitted score
  band" signal — deliberate product question, not just plumbing).
- Streaks, leaderboards, badges beyond the seal.
- Revisit path-style journey (A/B) only with a fresh design pass.

# Full Audit — 2026-05

**Status (Wave 21 — autonomous follow-through pass):** Of 6 blockers + ~35
majors, **all 6 blockers shipped (B6 = MVP) + 30+ majors shipped or partial**
across Waves 20 and 21 (migrations 0050, 0053, 0054 + 50+ files). See
`SESSION_RECAP.md` Wave 20 and Wave 21 sections for the full delivery report.
Remaining items moved to a small parking lot at end of this file with status
markers (✅ done, ⚠️ partial, ⏳ deferred).

Seven parallel read-only audits: 5 personas (Maya, Daniel, Sophia, Jordan, Linda)
+ 2 cross-cutting (accessibility, data integrity + RLS). Each agent wrote a
detailed section under `docs/audit/`; this file is the synthesis + prioritized
backlog.

Per-section reports:
- [Maya — head teacher](audit/maya.md)
- [Daniel — TA](audit/daniel.md)
- [Sophia — motivated student](audit/sophia.md)
- [Jordan — mobile student](audit/jordan.md)
- [Linda — parent](audit/linda.md)
- [Accessibility](audit/accessibility.md)
- [Data integrity + RLS](audit/data-integrity.md)

---

## 1. What's working

Worth naming, so we don't regress it:

- **`ModulesPage` is at the bar** — every persona singles it out as the
  reference. The whole project should keep measuring against it.
- **`CourseSettings`, `CourseMaterials`, `DuplicateCourseModal`** all meet
  the bar; reuse their patterns.
- **Backend discipline holds** — every `SECURITY DEFINER` function has
  `SET search_path` (47/47 migrations clean), all 28 public tables have RLS,
  no recursive-policy pattern in any policy, contiguous migration ledger
  (0001–0047), 0047's autonomous-log fix is correctly applied client-side.
- **`prefers-reduced-motion` honored globally**, all 40 dialogs declare
  `aria-modal="true"`, `PublishToggle` is a proper `role="switch"`,
  `FileDropzone` is keyboard-accessible.
- **`useFocusTrap` already exists** — 14 dialogs use it. The fix for the
  17 that don't is a one-line wire-up per file.

---

## 2. 🚨 Blockers (interrupt anything to fix)

| # | Status | Severity | Surface | What's broken | File:line |
|---|---|---|---|---|---|
| **B1** | ✅ shipped (mig 0050) | Privilege escalation | Backend | `admin_delete_user` is gated on `is_staff`, not `is_admin`. **Any teacher can delete any user, including admins.** | `supabase/migrations/0009_is_staff.sql:245` |
| **B2** | ✅ shipped (mig 0050) | Silent data loss | Backend | Every student-data FK is `ON DELETE CASCADE` to `profiles(id)`. Fixed via `BEFORE DELETE` audit trigger snapshotting 8-table dependent counts to `audit_events`. Cascade preserved (intentional); the trail is now forensic. | `0004:76`, `0017:147`, `0026:3`, `0029:7`, `0033:15` |
| **B3** | ✅ shipped | SAT-accommodation gap | Mock test runner | Timer state changes are silent to screen readers — fixed via `sr-only role="status" aria-live="polite" aria-atomic="true"` sibling region firing only on threshold cross (10m/5m/1m/30s/10s). | `mocktest/components/TestPhaseHeader.tsx:91-97` |
| **B4** | ✅ shipped | SAT-accommodation gap | Mock test runner | `AnswerChoices` rewritten as `role="radiogroup"` with `role="radio" aria-checked` items, roving tabindex, arrow-key wrap-cycle, explicit position-in-set. | `mocktest/components/AnswerChoices.tsx` |
| **B5** | ✅ shipped | Contrast | Mock test runner + SubmitConfirmDialog | All `text-red-500` / `text-amber-500/600` swapped to `text-rose-700 dark:text-rose-300` / `text-amber-700 dark:text-amber-300`. | `SubmitConfirmDialog.tsx:33-69`, `TestPhaseHeader.tsx:40-42`, `TestPhaseFooter.tsx` |
| **B6** | ⚠️ MVP shipped | Resume broken | Student | Resume prompt + question-pool hydration shipped. **Follow-up needed**: MockTestApp answer-state hydration requires coordinated edit in `viewer/src/mocktest/` (Lane scoping prevented in Wave 20). | `student/AssignmentRunner.tsx` |

**Recommended ship order**: B1+B2 same migration (privilege fix +
`audit_profile_delete` trigger + soft-delete consideration). B3+B4+B5 ship as
one PR — they're all in the mock-test runner. B6 separately.

---

## 3. Majors

Grouped by theme. Each item is a real, evidence-cited gap. Complexity is
S/M/L per the audit reports.

### 3a. Multi-cohort blindness (Maya)

The LMS treats every surface as single-course. Maya runs 4–6 cohorts.

| # | Item | File:line | Cx |
|---|---|---|---|
| M1 | Cross-course "Needs attention" panel on Dashboard (ungraded, overdue, new replies) | `dashboard/DashboardPage.tsx:183` | L |
| M2 | Announcement broadcast (multi-course target) + scheduled publish | `teacher/AnnouncementFormModal.tsx:17` | M |
| M3 | Promote Practice Tests tab from empty-state to real catalog with course-picker + due-date | `teacher/QuestionBankPage.tsx:6-10` | M |
| M4 | Gradebook "behind" filter; click-cell-to-message; sticky header + first column | `teacher/CourseGradebook.tsx:566-635` | M |
| M5 | Wire actual commands to ⌘K (currently mounted with empty `commands={[]}`) | `auth/StaffShell.tsx:300-307`, `lib/lmsCommands.ts` | S |

### 3b. TA throughput (Daniel)

| # | Item | File:line | Cx |
|---|---|---|---|
| M6 | **Build a grading UI** in `TeacherAttemptDetailView` — comment box, score override, J/K next/prev, Save&Next, autosave | `teacher/TeacherAttemptDetailView.tsx:91-161` | L |
| M7 | Search inputs on `ClassRoster` and `CourseGradebook` (35-row class, no search today) | `teacher/ClassRoster.tsx:245-292`, `teacher/CourseGradebook.tsx:566-635` | S |
| M8 | Discussion reply restores draft on error (mirrors `ThreadView:149` / `SubmissionDetailDrawer:241`) | `teacher/DiscussionTopicView.tsx:474-481` | S |
| M9 | Stop hiding edit affordances behind hover — 7 surfaces use `opacity-0 group-hover:opacity-60`. Move into existing `KebabMenu` or make visible. | `ModulesPage.tsx:341`, `AssignmentsPage.tsx:215`, `CourseAnnouncements.tsx:154`, `CourseDiscussions.tsx:163`, `ClassRoster.tsx:134`, `DiscussionTopicView.tsx:150`, `CourseMaterials.tsx:180` | S |
| M10 | Toast undo on rename + portfolio drag-nest | (toast util) | M |

### 3c. Pedagogy moat is invisible (Sophia)

The SAT-specific value lives in `my_skill_mastery()` and
`predict_my_sat_score()` (migration 0024) but doesn't surface.

| # | Item | File:line | Cx |
|---|---|---|---|
| M11 | Make `SkillHeatmap` cells clickable → filtered drill (deep-link to `/practice` with skill scoped) | `student/SkillHeatmap.tsx:182-201` | S |
| M12 | `/mock-test/history` — list past attempts, per-question time, compare two attempts | new surface | M |
| M13 | Score trajectory chart (multi-attempt arc, "+80 since diagnostic") next to `ScorePrediction` | `student/ScorePrediction.tsx:123-151` | M |
| M14 | Surface `WeakSkillsToggle` on student home / Dashboard, not buried at `/practice` | `App.tsx:1038`, `auth/AreaSelector.tsx:200-242` | S |
| M15 | `Enter` advances in the mock-test runner | `mocktest/components/TestPhase.tsx:95-125` | S |
| M16 | Student `⌘K` palette (currently `commands={[]}`) — "Resume PT3", "Drill weakest skill", "Next assignment" | `auth/StudentShell.tsx:61-62` | M |

### 3d. Mobile basics (Jordan)

| # | Item | File:line | Cx |
|---|---|---|---|
| M17 | Mount `MobileTabBar` in `StudentShell` (today only in legacy question-bank shell) | `auth/StudentShell.tsx:45-67`, `App.tsx:1175` | M |
| M18 | Reorder `AreaSelector` so "Due soon" is above the fold on 390×844 | `auth/AreaSelector.tsx:154-260` | S |
| M19 | Raise all student buttons to ≥40px; stop `hidden sm:inline` on Submit/Next labels (literally invisible on phone) | `student/AssignmentsPanel.tsx:127,135`, `student/MyClassesPanel.tsx:46-50`, `mocktest/components/TestPhaseFooter.tsx:49-66` | S |
| M20 | Replace `/calendar` `min-w-[560px]` / `[640px]` with vertical day list on mobile | `calendar/CalendarPage.tsx:309,357` | M |
| M21 | Add student `/courses/*` route so `MyClassesPanel` rows are clickable | `auth/AuthGate.tsx:215`, `student/MyClassesPanel.tsx:29-55` | M |
| M22 | Top-left close X on `ConfirmDialog` + `ClassFormModal` (Esc + backdrop only today) | `teacher/ConfirmDialog.tsx:55-95`, `teacher/ClassFormModal.tsx:262` | S |
| M23 | Mobile question-palette on mock test (`hidden lg:flex` today) | `mocktest/components/TestPhase.tsx:160` | S |

### 3e. Greenfield: parent surface (Linda)

The pedagogy moat never reaches the parent who pays. No schema today.

| # | Item | File:line | Cx |
|---|---|---|---|
| M24 | **MVP v1 (no schema)**: "Email weekly summary" button on Gradebook → server generates digest from existing `student_skill_stats` + signs a 7-day JWT magic-link to `/family/<jwt>` (read-only) | `teacher/CourseGradebook.tsx:517` + new edge fn + new route | M |
| M25 | **v2 (schema)**: add `guardians` table + RLS, `guardian_skill_mastery(uuid)` RPC, account flow with email-verified guardian role | new migration | L |

### 3f. Accessibility systemic (a11y)

| # | Item | File:line | Cx |
|---|---|---|---|
| M26 | **17 modals declare `role="dialog"` without focus trap** — `useFocusTrap` hook exists and 14 dialogs already use it; this is one-line wiring per file | various | M |
| M27 | `KebabMenu`: add `aria-haspopup`, `aria-expanded`, arrow-key nav | `components/KebabMenu.tsx:96-107` | S |
| M28 | Toast errors: `role="status"` → `role="alert"` | `components/Toast.tsx:69` | S |
| M29 | Skeleton container: add `aria-busy="true"` + `aria-live="polite"` | `components/Skeleton.tsx` | S |
| M30 | 5 inputs strip `focus:outline-none` with no replacement (MarkdownEditor, CommandPalette, 2 inline rename inputs, TeacherConsole search) | grep | S |
| M31 | `text-slate-400 dark:text-slate-400` body text widely fails AA — restrict to `text-slate-500` for body | global | M |

### 3g. Data integrity remainder

| # | Item | File:line | Cx |
|---|---|---|---|
| M32 | 3 audit triggers missing `, auth` in search_path | `supabase/migrations/0027_audit_more.sql:3,17,31` | S |
| M33 | `test_attempts.user_id` references `auth.users` (norm violation — should be `public.profiles`); no `client_attempt_id` idempotency | `0042:23` | M |
| M34 | Smoke has no cascade/archive scenario — top-10 fix areas (course CRUD, kebab actions, archive cascade) are entirely unprotected | `viewer/scripts/smoke-*.mjs` | S |
| M35 | `AssignmentFormModal` direct `.insert` omits `kind`/`archived` — works today via DEFAULT but matches the PostgREST trap from CLAUDE.md | `teacher/AssignmentFormModal.tsx:273` | S |

---

## 4. Minors (grouped, brief)

- `routeViews.tsx:213,223` use `<CenteredMessage>Loading…</CenteredMessage>` — replace with route-level skeletons.
- `PortfolioItemFormModal.tsx:321` + `AddSetToCourseModal.tsx:277` use raw `<textarea>` — should be `MarkdownEditor` (CLAUDE.md forbidden pattern).
- `AccountSettings.tsx:56-73` uses inline notice triples instead of the `useToast` norm.
- `CoursePortfolio.tsx` is 1840 lines — 2.3× the 800-line ceiling. Split into `<PortfolioTreeView>`, `<PortfolioOverviewGrid>`, `<PortfolioItemNode>`, `usePortfolioDrag`.
- `AssignmentsPage.tsx` is 888 lines — at the ceiling. Extract `<AssignmentCard>`, `<AssignmentsToolbar>`, `<BulkActionsBar>`.
- Submit confirmation is inconsistent between MockTestApp (results screen) and QBankAssignmentRunner (toast). Pick one pattern.
- `NotificationBell` at `bottom-3 right-44` collides with `StudentBadge` on narrow widths.

---

## 5. Recommended sprint plan

### Sprint 0 — emergency (this week) — ✅ SHIPPED (mig 0050)
- **B1 + B2 together** — privilege fix on `admin_delete_user`, new `audit_profile_delete` trigger, consider soft-delete on `profiles` for student accounts. One migration. **Highest priority — interrupt other work.**

### Sprint 1 — SAT-accommodation parity (1 week) — ✅ MOSTLY SHIPPED
- ✅ B3 + B4 + B5 shipped in Lane 2.
- ⏳ M26 batch (focus traps on remaining `role="dialog"` instances) —
  partially shipped (Lane 5 added close X to 12 teacher modals, but
  `useFocusTrap` wire-up on the 17 found by the audit is still pending).
- ✅ M28, M29, M30 shipped in Lane 5.

### Sprint 2 — student trust (1–2 weeks) — ✅ MOSTLY SHIPPED
- ⚠️ B6 MVP shipped (resume prompt + question pool) — answer-state
  hydration is a follow-up Lane 2 + Lane 3 coordinated edit.
- ✅ M19 + M23 shipped (Lane 2).
- ✅ M22 close X shipped (Lane 3 student-side + Lane 5 teacher-side).
- ✅ M11 (clickable heatmap), M15 (Enter advances) shipped.
- ⏳ M16 (student ⌘K commands) deferred — student CommandPalette still
  mounted with empty commands; staff ⌘K shipped (M5).

### Sprint 3 — TA throughput (2 weeks) — ✅ MVP SHIPPED
- ⚠️ M6 MVP grading UI shipped to **localStorage** — follow-up migration
  needed: `assignment_attempts.feedback_text / score_override / graded_at
  / grader_id` + RLS + flush helper.
- ✅ M7 search inputs shipped on ClassRoster + CourseGradebook.
- ✅ M8 discussion draft preserved.
- ✅ M9 hover pencils → persistent on 7 files (Lane 4 + Lane 5).

### Sprint 4 — multi-cohort (2–3 weeks) — ✅ SHIPPED (Wave 21)
- ✅ **M1** cross-course "Needs attention" panel shipped — 3-section
  triage above the Dashboard course grid (To grade / Past due / New
  replies), 3 parallel queries, RLS-scoped, `graded_at` migration
  fallback, collapse-state persisted.
- ✅ **M2** announcement broadcast + schedule shipped — migration 0054
  `publish_at`, `targetCourseIds: string[]`, multi-select picker,
  `SmartDatePicker`, student-side `.or(publish_at.is.null,...)` filter,
  teacher-side "Scheduled" badge. pg_cron fan-out at publish-time is the
  remaining minor parking-lot item.
- ✅ **M3** Practice Test catalog promotion shipped — `useTeacherMockTests`
  hook + course-picker pre-flight + per-row kebab CRUD + filters
  persisted.
- ✅ M5 (⌘K commands) shipped in Wave 20 Lane 6.

### Sprint 5 — parent surface MVP (1 week) — ⏳ DEFERRED (needs design input)
- ⏳ M24 zero-schema magic-link family view — deferred: needs user input
  on JWT lifetime, parent-view scope, FERPA review.

### Sprint 6 — pedagogy moat + polish (Wave 21) — ✅ SHIPPED
- ✅ M10 toast undo cross-cutting (6 sites: 3 renames + 3 archives).
- ✅ M12 mock-test history at `/mock-test/history` with score arc +
  compare-2.
- ✅ M13 multi-attempt score arc (`ScoreArcSparkline.tsx`).
- ✅ M16 student ⌘K with 8 commands.
- ✅ M26 focus-trap sweep — 23 dialogs trapped, 4 documented skips.
- ✅ M31 `text-slate-400` body-text contrast cleanup (26 files edited).
- ✅ B6 follow-up — MockTestApp answer-state hydration on resume
  (localStorage write-through; `resumedXxx` props for future server-side
  hydration).
- ✅ M6 follow-up — grading persistence migration 0053; localStorage
  drain on visit; Mark-as-graded toggle; effective-score view.
- ✅ Forbidden-pattern batch — `MarkdownEditor` for description fields,
  `useToast` for AccountSettings, route-level skeletons.

### Backlog (still parked, smaller list now)
- M24 / M25 — parent magic-link + guardians schema.
- M33 follow-up — FK swap `test_attempts.user_id` → `profiles(id)`.
- **TagInput primitive** for `PortfolioItemFormModal` Choices field.
- **pg_cron fan-out** for scheduled-announcement publish-time push.
- **Gradebook + ScoreHero migration** to `assignment_attempts_effective`
  view.
- **B6 server-side per-question persistence** (vs current localStorage).
- Code-quality refactors (`CoursePortfolio.tsx` 1840L,
  `AssignmentsPage.tsx` 888L) — high regression risk; do as coordinated
  wave.

---

## 6. One-line per persona

- **Maya** would keep using it, but would not recommend it to a peer head
  teacher until cross-cohort triage + broadcast ship.
- **Daniel** can't actually grade essays through the current attempt-detail
  view; he's been working around it via portfolio submissions.
- **Sophia** is using "an LMS that happens to know SAT," not one that
  pushes her where to drill tonight.
- **Jordan** can render the LMS on a phone; he cannot reliably use it on a
  phone — Submit is literally invisible at small sizes.
- **Linda** would not recommend the LMS to a friend, because the LMS
  doesn't acknowledge she exists.

The pedagogy moat is real and the backend discipline is excellent. The gap
is between the data layer and the surfaces the personas actually touch.

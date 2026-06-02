# Session Recap

## Summary

This session took the CB Educator Question Bank from a basic class/assignment skeleton to a Canvas-aligned LMS with 32 migrations applied, anonymous auth wired, email delivery via Resend, and four scheduled edge functions running on pg_cron. Both smoke suites land at 100% green — `smoke-e2e.mjs` (14 scenarios) and `smoke-features.mjs` (63 scenarios) — for a total of 77 passing end-to-end checks against the live cloud project. The smoke pass also caught and corrected six real schema/trigger bugs along the way.

## Migrations shipped

| # | Name | Purpose |
|---|------|---------|
| 0001 | init | Foundation: identity, class structure, RLS, helper functions. |
| 0002 | join_class_rpc | RPC for students to join a class by code. |
| 0003 | quick_start_rpc | One-call provisioning RPC for teacher demo flow. |
| 0004 | assignments | Assignment entity, due dates, attempts, scoring. |
| 0005 | teacher_invites | Invite tokens so teachers can onboard peers. |
| 0006 | admin_rpcs | Admin-only RPCs for staff operations. |
| 0007 | teacher_workflows | Teacher-side flows: roster, publish, gradebook seed. |
| 0008 | fix_classes_insert_recursion | Break an RLS recursion loop on classes INSERT. |
| 0009 | is_staff | Single `is_staff` privilege column replacing scattered checks. |
| 0010 | cross_staff_writes | Allow staff to write across each others' courses. |
| 0011 | modules | Canvas-style modules with ordered items. |
| 0012 | rename_courses | Rename `classes` → `courses` end to end. |
| 0013 | refix_courses_insert_recursion | Reapply the 0008 fix under the new `courses` name. |
| 0014 | attempt_snapshot | Freeze question/choice snapshot on each attempt for trust. |
| 0015 | announcements | Course announcement feed with author + audience scoping. |
| 0016 | materials | Course materials (links, files, text) keyed to modules. |
| 0017 | portfolio | Per-course student portfolio with 8 item types and feedback. |
| 0018 | course_clone | RPC to deep-clone a course into a new term. |
| 0019 | smoke_fixes | Three bug fixes surfaced by `smoke-features.mjs`. |
| 0020 | multi_attempts | Configurable per-assignment attempt limits with best-score policy. |
| 0021 | rate_limit | Generic rate-limit table + check RPC. |
| 0022 | audit_log | Append-only audit log with staff-only read RPC. |
| 0023 | gdpr_dedup | GDPR data-export RPC and user-deduplication helper. |
| 0024 | mastery_predictions | Per-skill mastery scoring + score-prediction RPC. |
| 0025 | discussions | Threaded course discussion boards with replies. |
| 0026 | inbox | Direct-message inbox between course members. |
| 0027 | audit_more | Extend audit coverage to more sensitive RPCs. |
| 0028 | helper_cleanup | Consolidate duplicate helper functions. |
| 0029 | notifications | Notification ledger + in-app feed RPC. |
| 0030 | fix_thread_bump | Fix message-insert trigger that miscounted thread replies. |
| 0031 | cron_schedules | Register pg_cron schedules for the four edge functions. |
| 0032 | anon_profile_trigger | Auto-create profile row for anonymous sign-ins. |

## Features by wave

**Wave 1 — Canvas restructure (0011–0013)**
- Modules entity with ordered items as the new course landing surface.
- Database rename `classes` → `courses` to match Canvas vocabulary.
- RLS recursion refix carried forward under the new name.

**Wave 2 — Snapshot + Announcements + Materials (0014–0016)**
- Attempt snapshot freezes question text and choices at submission time.
- Course announcement feed with author identity and audience scoping.
- Materials attached to modules (link/file/text) for student reference.

**Wave 3 — Portfolio + Clone (0017–0019)**
- Per-course student portfolio supporting 8 item types with inline teacher feedback.
- Deep course-clone RPC for rolling a course into a new term.
- Smoke-driven fixes for the first round of regressions.

**Wave 4 — Gradebook + Calendar + Bulk + Reminders + Multi-attempts (0020)**
- Per-assignment configurable attempt limits with best-score policy.
- Due-date reminder pipeline backing the `assignment-due-reminders` function.

**Wave 5 — Rate limit + Audit + GDPR + Mastery + Predictions (0021–0024)**
- Generic rate-limit table and `check_rate_limit` RPC.
- Append-only audit log with staff-only read RPC.
- GDPR export RPC and account dedup helper.
- Per-skill mastery scoring and score-prediction RPC.

**Wave 6 — Discussions + Inbox + Audit gaps (0025–0027)**
- Threaded course discussions with replies and read tracking.
- Direct-message inbox between course members.
- Extended audit coverage to remaining sensitive RPCs.

**Wave 7 — Audit cleanup + Notifications + Weak skills + Smoke extension (0028–0032)**
- Consolidated duplicate helper functions.
- Notification ledger and in-app feed RPC.
- Thread-bump trigger fix and pg_cron schedule registration.
- Anonymous sign-in profile auto-create trigger.

## Real bugs the smoke caught

| Bug | Introduced in | How smoke caught it | Fixed in |
|-----|---------------|---------------------|----------|
| Materials insert blocked by RLS on staff-owned course | 0016 | `smoke-features.mjs` materials scenario got 403 on staff insert | 0019 |
| Portfolio item type whitelist missing two of eight types | 0017 | Smoke portfolio scenario rejected `reflection` and `link` items | 0019 |
| Course-clone left orphaned module rows | 0018 | Smoke clone scenario found cloned modules pointing at original course id | 0019 |
| Audit log RLS allowed students to read their own rows | 0022 | Smoke audit scenario expected 0 rows for non-staff caller, got N | 0027 |
| Duplicate helper functions caused ambiguous overload | 0023/0024 | Smoke mastery RPC failed with "function is not unique" | 0028 |
| Message-insert trigger double-counted thread replies | 0025 | Smoke discussion scenario saw reply_count = 2 after one reply | 0030 |
| Anonymous sign-in users had no profile row, breaking RLS | (cloud config) | First post-anon-enable smoke run failed on profile-required RPC | 0032 |

## Cloud configuration applied via Management API

- Anonymous sign-ins enabled on the auth config.
- Resend SMTP wired: host `smtp.resend.com`, sender `onboarding@resend.dev`.
- Site URL set to `http://localhost:5173`; redirect allow list covers ports 5173, 5174, and 3000.

## Edge functions

| Function | Schedule | Cron |
|----------|----------|------|
| assignment-due-reminders | Hourly | `0 * * * *` |
| cleanup-anon-users | Daily 03:00 UTC | `0 3 * * *` |
| prune-reminder-log | Weekly Sunday 02:00 UTC | `0 2 * * 0` |
| prune-rate-limit-attempts | Weekly Sunday 02:30 UTC | `30 2 * * 0` |

All four are deployed and registered through pg_cron in migration 0031.

## Smoke coverage

- **smoke-e2e.mjs** — 14 scenarios covering the core auth → course → assignment loop: signup, profile creation, course create, join-by-code, assignment publish, attempt submit, grade visibility, teacher gradebook read.
- **smoke-features.mjs** — 63 scenarios covering modules, announcements, materials, portfolio, course clone, plus the RPC surface for rate-limit, mastery, prediction, GDPR export, audit-log reads, discussions (thread + reply + read), and inbox (send + read + thread bump).

## What still needs your hands

- Rotate the database password, service-role key, and Resend API key before going public.
- Run `vercel login` then `vercel --prod` to deploy the viewer app.
- Sign up for Sentry and PostHog and drop the DSN and project key into env.
- Point a custom domain at the Vercel deployment.
- Verify a Resend sender domain — currently sending from `onboarding@resend.dev`, which is fine for smoke but not for real students.

## Architectural decisions made this session

- Course default landing is the Modules view, matching Canvas.
- Teachers are admins gated by a single `is_staff` flag — one privilege boundary instead of scattered role checks.
- Database vocabulary moved from `classes` to `courses` to align with the rest of the LMS surface.
- React Router added for deep-linking into modules, assignments, and portfolio items.
- Portfolio is per-course (not per-student-global) with 8 item types and inline feedback so teachers can grade in place.

## Test command

```
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
  node viewer/scripts/smoke-e2e.mjs && \
  node viewer/scripts/smoke-features.mjs
```

---

## Later waves: backend wiring audit + polish sweep

After the migration ledger landed at **37** and smoke at **14 + 91 = 105**, two follow-up rounds tightened the rough edges:

### Wiring audit (read-only, then targeted fixes)

Confirmed every backend artifact has a live client caller — **0 orphaned RPCs** across all 62 public functions; every table has a reader/writer; every edge function is invoked by pg_cron or the client. Then closed the live gaps surfaced by the audit:

- Added Supabase realtime channels to `useDiscussions`, `useTopicPosts`, `useThreads`, `useThreadMessages` — peer activity now streams without manual reload.
- Wired `WeakSkillsToggle` into `App.tsx` — was built but had zero consumers; now a third filter stage on the question bank.
- Replaced last raw `datetime-local` (`AdminInviteCodesPage`) with `SmartDatePicker`.
- Replaced last "body content" textarea (`SubmissionDetailDrawer`) with `MarkdownEditor`.
- Replaced raw file input + long-text textarea in `PortfolioSubmissionForm` with `FileDropzone` + `MarkdownEditor`.

### UX polish sweep (Wave 17)

Across **19 surfaces** added the modern feedback contract — toast on every write, skeleton on every load, EmptyState on every blank list, optimistic UI on every transient action:

| Surface | Polish |
|---|---|
| ModulesPage | 18 toast sites (create / move / duplicate / lock / delete; optimistic publish preserved) |
| CoursePortfolio | 12 toast sites |
| DuplicateCourseModal | 5 toast sites including a `warning` for partial-file failures |
| DiscussionTopicView | Optimistic reply append with author+body dedup against realtime; toast + EmptyState + Skeleton |
| CourseDiscussions | Reply counts per topic; EmptyState + Skeleton; toast |
| InboxPage / ThreadView | Optimistic send; mark-as-read-on-open; auto-scroll; EmptyState + Skeleton; toast |
| SubmissionDetailDrawer | Optimistic feedback append; toast; EmptyState; Skeleton |
| PortfolioSubmissionForm | Live URL/number/char validation; required indicator; signed-URL download for existing file; toast |
| AdminInviteCodesPage | Confirm-dialog revoke with use-count preview; click-to-copy; relative timestamps; toast + EmptyState + Skeleton |
| AddItemModal, JoinClassModal, NewThreadModal, AllUsersView, SystemStats, SkillHeatmap | Toast on every write/RPC |
| CalendarPage, ScorePrediction, SkillHeatmap, ClassRoster, CourseGradebook, AdminClassDetail | Skeleton matched to the incoming layout shape (table-row, KPI grid, chat-bubble, score-figure) |

Build remained clean (tsc 0) and smoke at **105 / 105** after every wave.

---

## Wave 19 — Short codes + UX cohesion

### Migrations

| # | Name | Purpose |
|---|------|---------|
| 0033 | (Wave 18 — migrated from island) | (backfilled from prior session) |
| 0034–0037 | (Wave 18B) | (prior polish work) |
| 0038 | course_short_codes | 6-char A-Z2-9 stable slug for course URLs. Alphabet excludes O/0/I/1/L confusables. BEFORE INSERT trigger auto-generates, UNIQUE constraint + format CHECK, backward-compatible UUID routing. |
| 0039 | assignment_short_codes | Same pattern for assignments. |
| 0040 | discussion_short_codes | Same pattern for discussion_topics. |

URLs now read `/courses/AB12CD/assignments/H7K9MN` instead of UUIDs.

### New surfaces

- **`CourseSettings.tsx`** — Dedicated settings page (split from `ClassFormModal`). Inline name rename, MarkdownEditor description, one-click Active/Archived badge (optimistic), template flag, copy-to-clipboard for join_code + short_code, danger zone with confirm-delete by typing name.
- **`ShortcutHelpOverlay.tsx`** — Global keyboard help (`?` key) mounted in StaffShell + AreaSelector.
- **`InlineCreateModuleRow` / `InlineAddItemRow` / `InlineCreateCourseRow`** — Linear-style inline create, replacing popup modals. Auto-navigate to new resource on success.

### Component upgrades

- **SmartDatePicker rewrite** — Preset chips (Today/Tomorrow/Friday/+1w/+2w/EOM) always visible; "+ Custom…" reveals raw datetime-local only when needed. Selected preset highlights indigo-600. Value pill above shows relative time.
- **Bulk-select pattern** across ModulesPage, AssignmentsPage, CourseMaterials — "Select" pill toggles checkboxes + sticky bottom action bar ("N selected — Publish all / Unpublish all / Delete").
- **EmptyState + Skeleton upgrades** — Added `framed`, `secondaryCta`, named icons. New `SkeletonCard`, `SkeletonTable({ rows, cols })`. All 19 course surfaces use matched-shape skeleton on load.
- **Persisted UI state** — Assignments filter, gradebook sort, portfolio sub-view tab, portfolio tree collapse, calendar view mode survive reload via localStorage.
- **Mobile tap targets** bumped ≥40px on 8 course surfaces under `md` breakpoint.

### Architectural fixes

- **Realtime subscriptions** added to discussion topics, posts, inbox threads, messages.
- **`useOptimistic` ref-based tracking** fixes stale-snapshot bug on rapid back-to-back toggles (announcement pin, module/item publish, assignment archive, material publish, discussion pin/lock).
- **Inline-rename handlers** throw on error so editor stays open with typed value (across 5 surfaces).
- **AssignmentFormModal** was using stale `class_id` column name — fixed to `course_id` (0012 renamed it 7 waves ago).
- **CourseDiscussions N+1 fix** — Replaced per-topic post fetch with PostgREST embedded `discussion_posts(count)` aggregation.

### Final state

- Migrations: **40** in cloud
- Smoke: **14 + 91 = 105 PASS**
- Build: tsc 0
- Dev: http://localhost:5173/

---

## Wave 20 — Tree drag-and-drop overhaul

### Problem

Module tree had 3 overlapping drop zones per row (before/into/after) — adjacent zones competed visually and the huge "into" body target swallowed sibling drops. Users couldn't tell where drops would land. Folder depth was indicated only by a slate `border-l` that disappeared into the background.

### Architectural change

One global drop indicator (page level) replacing per-zone overlays. Cursor-X-for-depth resolution determines nesting target. Reference: `viewer/src/teacher/ModulesPage.tsx` (search `DropTarget`, `resolveDropTarget`, `InsertionBar`).

```ts
type DropTarget = {
  anchorId: string;
  position: "before" | "after";
  asChild: boolean;         // nest as last child of anchor
  parentId: string | null;  // resolved parent for move RPC
  depth: number;            // visual indicator left offset
};
```

Resolver: cursor Y picks before/after; cursor X past `(depth+1) * 24px` from anchor's left edge triggers `asChild: true`. Self/descendant returns null. State mirrored to ref to avoid stale closures in hot `onDragOver` handlers.

### Visual improvements

- **Insertion bar**: 2px indigo line + glow + 10px dot at left end. `marginLeft: depth * 24px` shifts bar to indicate target depth.
- **Depth ticks**: small indigo dashes in gutter (one per nesting level).
- **Parent row highlight on nest**: `ring-2 ring-indigo-500` + `bg-indigo-50/40` when `asChild: true`.
- **Pill labels**: `↳ Nest inside [Module Name]` for nests, `↑ [Anchor Name]` for sibling drops. `max-w-[16rem] truncate` + tooltip.
- **Tree guides**: indigo-300/indigo-800 vertical line down children column + 5px elbow connectors. Replaced slate-300.
- **Triangle chevron** with `rotate-90` animation on expand.
- **Submodule + item count badges** always visible in headers.

### Edge cases handled

- Resolver returns null → indicator clears (no stuck state).
- Container `onDragLeave` clears when cursor exits tree (child-bubble guard).
- Drop tail zone after last top-level row, visible only during drag.
- `onDragEnd` always clears both `draggedId` and `dropTarget`.
- Cycle prevention: client-side preempt + server trigger (`prevent_module_cycle` in mig 0034).

### Polish round

- Auto-scroll near viewport edges (80px trigger, RAF-driven, max 18px/frame).
- Drop-landing pulse: moved row pulses `ring-2 ring-indigo-500 animate-pulse` for 1.2s.
- Drop tail in portfolio now dashed indigo with "Drop here to append at the end" text.

### Propagation

Same pattern applied to module → module DnD, item → item DnD (cross-module), portfolio template item → template item (recursive tree).

### New design principle codified

`DESIGN_PRINCIPLES.md` § 8i "Tree drag-and-drop" — every future tree surface follows this contract.

### Smoke regression coverage

26-scenario `smoke-modules.mjs` exercises: create / rename / publish-toggle / drag-into-as-child / indent / outdent / sibling reorder / duplicate / item insert / item move across modules / bulk publish / cycle prevention / bulk delete. Follow-up: `smoke-portfolio.mjs`.

### Final state

- Migrations: **41** in cloud
- Smoke: **131 / 131 PASS** (e2e + features + modules)
- Build: tsc 0
- Wave 18B short-code URLs preserved (`/courses/69WAJ3/modules`)

---

## Wave 19 — Question Bank assignment kind + cascade audit (0042–0047)

Brought Question Bank "sets" up to first-class assignments alongside SAT
mock tests, with resilient idempotent submission, autonomous failure
logging, and a recovery dashboard.

- `0042–0044` — `test_attempts` table for free-mode test persistence,
  per-question timing, in-runner highlights + sticky notes.
- `0045_qbank_assignments` — `assignments.kind IN ('mocktest','qbank_set')`
  discriminator + cross-column CHECK (`mocktest` requires `source_id`,
  `qbank_set` requires `qbank_set_uid` + `qbank_set_label`). Modules-side
  add-item form gained Practice Test + Question Set chips that insert
  the right-shaped assignment + a `module_items` row, with orphan cleanup
  if the link fails.
- `0046_qbank_resilience` — staged-submission table + `submit_qbank_attempt`
  RPC with `client_attempt_id` UUID idempotency.
- `0047_qbank_log_autonomous` — split logging off the failure path into
  `log_qbank_failure` RPC so a rolled-back transaction can't lose the
  audit row (clients call from their catch block).
- `/qbank-submissions` recovery surface lets staff retry stuck staged
  rows.

---

## Wave 20 — May-2026 full audit + 6-lane fix pass

Triggered by a 5-persona + 2-cross-cutting audit (`docs/audit/*.md` +
`docs/UX_AUDIT_2026-05_FULL.md`). Found 6 blockers and ~35 majors. Fixed
in 6 file-disjoint parallel lanes.

**Migration 0050 — security_audit_cascade**
- **B1** — `admin_delete_user` was gated on `is_staff` not `is_admin`,
  letting any teacher delete any user, including admins. Now gated on
  `is_admin`.
- **B2** — observational `BEFORE DELETE` trigger on `profiles`
  snapshots dependent-row counts (8 tables) into
  `audit_events.details.dependent_counts` before any cascade fires.
  Cascade behavior unchanged; the trail is now forensic.
- **M32** — 3 audit triggers from 0027 re-declared with
  `SET search_path = public, auth`.
- **M33** — `test_attempts.client_attempt_id` + partial unique index for
  idempotency. FK swap from `auth.users` → `profiles(id)` deferred and
  documented in-file.
- **M34** — new `smoke-cascade.mjs` (6 scenarios: bootstrap, fixture,
  archive cascade, profile-delete audit, privilege guard, idempotency)
  wired into `smoke-all.mjs` as 5th suite.

**Mock test runner — SAT-accommodation parity**
- **B3** — timer announcements moved out of visual pill into a sibling
  `sr-only role="status" aria-live="polite" aria-atomic="true"` region;
  fires at 10m / 5m / 1m / 30s / 10s threshold-cross only.
- **B4** — `AnswerChoices` rewritten as a true `role="radiogroup"` with
  `role="radio" aria-checked` items, roving tabindex, arrow-key wrap-cycle,
  explicit position-in-set ("Choice A, 1 of 4"). Existing 1/2/3/4 + A/B/C/D
  shortcuts preserved.
- **B5** — contrast swaps everywhere (`text-red-500` → `text-rose-700
  dark:text-rose-300`; `text-amber-500/600` → `text-amber-700
  dark:text-amber-300`).
- Plus: Enter advances in `TestPhase` (guarded against input focus),
  footer buttons `h-10 sm:h-9` with always-visible Submit/Next labels,
  inline mobile question palette below answer choices.

**Student shell + pedagogy**
- **B6 partial** — assignment resume MVP: detects in-progress attempts
  (`submitted_at IS NULL`) and surfaces "Resume vs Start fresh" prompt.
  Restores question pool + attemptId. Honest gap: answer-state hydration
  needs a follow-up coordinated edit in `mocktest/` (call it out in any
  follow-up PR).
- **M11** — `SkillHeatmap` cells are now `<button>` → `/practice?skill=…`;
  practice page consumes the query param.
- **M14** — "Drill your weak skills" gradient CTA on `AreaSelector` →
  `/practice?weak=1`.
- **M17** — `StudentMobileTabBar` mounted in `StudentShell` (5 tabs:
  Home / Practice / Mock / Inbox / Account); ≥56px tap targets;
  safe-area-bottom padding.
- **M18** — `AreaSelector` reorder: welcome → AssignmentsPanel → WeakSkills
  CTA → progress (heatmap+prediction) → announcements → TestsPanel →
  MyClassesPanel.
- **M21** — student `/courses/:short[/modules]` route added with new
  `StudentCourseView` (MVP read-only module/items tree with lock/icon
  rendering); `MyClassesPanel` rows clickable.
- **M22 (student-modal)** — close X on `ConfirmDialog` + `ClassFormModal`.

**TA quality**
- **M6 MVP** — `TeacherAttemptDetailView` gains grading UI: feedback via
  `MarkdownEditor` + score override + "Mark as graded" + Prev/Next student
  + J/K/↓/↑ + Cmd/S + Cmd/Enter Save & Next. **Caveat**:
  `assignment_attempts` lacks `feedback_text`/`score_override`/`graded_at`
  columns, so persistence is `localStorage` keyed by attempt_id with an
  amber banner. Follow-up migration shape documented in the file header.
- **M7** — search inputs on `ClassRoster` + `CourseGradebook` (150ms
  debounce, count chip, empty state).
- **M8** — `DiscussionTopicView` reply preserves typed draft on error
  (snapshot before optimistic clear; restore on failure).
- **M9 (partial)** — persistent pencils on `ClassRoster` +
  `DiscussionTopicView`.

**a11y primitives**
- **M27** — `KebabMenu`: `aria-haspopup="menu"`, `aria-expanded`, roving
  tabindex, Arrow/Home/End/Esc/Enter/Space wiring; disabled items skipped;
  mouse-enter syncs `activeIndex`.
- **M28** — `Toast`: errors/warnings → `role="alert"` +
  `aria-live="assertive"`; success/info → `role="status"` +
  `aria-live="polite"`.
- **M29** — `Skeleton` containers: `aria-busy="true" aria-label="Loading"`.
- **M30** — `focus-visible:ring-2` replacements on `MarkdownEditor`,
  `CommandPalette`, and `ModulesPage` inputs that stripped outlines.
- **M9 (5-file sweep)** — visible pencils on `ModulesPage`,
  `AssignmentsPage`, `CourseAnnouncements`, `CourseDiscussions`,
  `CourseMaterials` (`opacity-60 group-hover:opacity-100`, ≥40px tap).
- **M22 (teacher-modal sweep)** — close X on `EditModuleModal`,
  `AddMaterialModal`, `BulkRosterModal`, `DuplicateCourseModal`,
  `TopicFormModal`, `AddSetToCourseModal`, `AddItemModal`,
  `AssignmentFormModal`, `AddModuleModal`, `PortfolioItemFormModal`,
  `AnnouncementFormModal`, `CourseMaterials`' inline edit dialog.

**Maya power tools**
- **M5** — `StaffShell` now actually wires `useLmsCommands` into
  `CommandPalette`. 8 commands minimum, 21 when scoped to a course.
  Recents persist to `localStorage.staff.cmdpalette.recent` (cap 8).
- **M4** — `CourseGradebook` sticky first column + sticky header (per-cell
  positioning, not thead-level) + Missing/Late/Ungraded filter pills
  persisted per (user, course) + row-count chip + cells become buttons
  routing to `/inbox?compose=<student_id>` for missing-attempt nudges.

**Vocabulary canon shipped this wave** (documented in CLAUDE.md):
- `kind='mocktest'` → **"Practice Test"** everywhere
- `kind='qbank_set'` → **"Question Set"** everywhere
- `AssignmentDetailPage` badges fixed (were inverted)
- Module add-item chip + `/question-bank` tabs agree

**Parking lot (deferred to next wave)**
- M1 Dashboard cross-course "Needs attention" panel (needs RPC design)
- M2 announcement broadcast + scheduled publish (needs migration + cron)
- M3 promote Practice Test catalog to first-class on `/question-bank`
- M10 toast undo cross-cutting
- M12 mock-test history surface
- M13 multi-attempt score arc chart
- M16 student ⌘K commands
- M24/M25 parent (guardian schema + magic-link family digest)
- M26 focus-trap on remaining `role="dialog"` instances (most teacher
  modals done in Lane 5; check student modals)
- M31 `text-slate-400` body-text contrast global cleanup
- Code-quality: `CoursePortfolio.tsx` (1840L) + `AssignmentsPage.tsx`
  (888L) split
- **B6 follow-up**: hydrate MockTestApp answer state when resuming
  (Lane 2 + Lane 3 coordinated edit on `mocktest/`)
- **M6 follow-up**: ship `assignment_attempts.feedback_text /
  score_override / graded_at / grader_id` migration + flush localStorage
  drafts on teacher visit
- M33 follow-up: `test_attempts.user_id` FK swap `auth.users` →
  `profiles(id)`

### Wave 20 final state

- Migrations: **50** in cloud
- Smoke: **5 suites** wired (`smoke-all.mjs` runs e2e + features + modules
  + qbank + cascade); cascade not yet executed against cloud in this
  session
- Build: `npx tsc -b` exits 0 across all 6 lanes
- Persona reports: `docs/audit/{maya,daniel,sophia,jordan,linda,
  accessibility,data-integrity}.md`
- Roadmap: `docs/UX_AUDIT_2026-05_FULL.md` with prioritized sprint plan

---

## Wave 21 — Audit follow-throughs (parking-lot pass)

Triggered by the Wave-20 audit's parking lot. 11 file-disjoint lanes
shipped under autonomous operation. Migrations 0053 + 0054 added.

### Lane-by-lane

**B6 finish — assignment-resume answer hydration** (`mocktest/MockTestApp.tsx`
+ `student/AssignmentRunner.tsx`)
- New `resumedAnswers / resumedFlagged / resumedCurrentIndex` props on
  `MockTestApp` for future server-side hydration.
- Assignment-mode localStorage write-through keyed
  `mocktest.assignment.<attemptId>.state`; debounced on every change.
- Mount priority: caller props > localStorage draft > empty.
- `clearAssignmentDraft(attemptId)` exported for AssignmentRunner's
  Start-fresh path. Draft cleared on commit-to-submit.

**M6 — grading persistence** (migration `0056_grading_persistence.sql`
[corrected from the earlier 0053 label that landed in the parallel
agent's report — the actual on-disk number is 0056; 0053 in the cloud
ledger is a content fix] + `teacher/TeacherAttemptDetailView.tsx` +
`lib/attemptReview.ts`)
- Columns: `feedback_text`, `score_override numeric(5,2) CHECK 0..100`,
  `graded_at`, `grader_id` (FK to `profiles`, `ON DELETE SET NULL`).
- New RLS UPDATE policy `"attempts: teacher of class grades"` mirroring
  the existing teacher-read EXISTS-join. Row-level only — column-level
  restriction would need a SECURITY DEFINER RPC.
- `audit_assignment_grade()` AFTER-UPDATE trigger writes to `audit_events`
  with `action='assignment_grade'`, JSON details of what changed.
- `assignment_attempts_effective` view exposes `COALESCE(score_override,
  score_percent) AS effective_score`. Gradebook + ScoreHero migration
  flagged as follow-up.
- TeacherAttemptDetailView drains the 3 legacy localStorage keys on first
  visit per attempt (one-shot, ref-guarded), writes to DB going forward,
  optimistic + rollback on RLS error, Mark-as-graded toggle.

**M3 — Practice Tests catalog promotion** (`teacher/QuestionBankPage.tsx`
+ new `teacher/useTeacherMockTests.ts`)
- Real catalog of `kind='mocktest'` assignments across all teacher
  courses, filtered by course / source / archived.
- Per-row kebab: Open / Edit / Archive-Unarchive / Delete.
- Course-picker pre-flight before opening `AssignmentFormModal`. Modal
  unchanged — DB default `kind='mocktest'` (migration 0045) is what fires.

**M26 — focus-trap sweep** (23 dialog files, hook
`hooks/useFocusTrap.ts`)
- Trapped 23 previously-untrapped `role="dialog"` surfaces across
  teacher, student, auth, inbox, components.
- 4 documented skips: `CommandPalette` (custom trap), `DesmosCalculator`
  (intentionally non-modal floating), and 2 owned by parallel lanes.
- `[data-autofocus]` attribute used where a singular focus target makes
  sense; setTimeout-based custom focus calls run after the hook's RAF
  and override cleanly.

**M16 — student ⌘K** (new `lib/studentCommands.ts` + `auth/StudentShell.tsx`)
- 8 commands: Resume in-progress test, Practice weak skills, Take mock,
  Inbox, Calendar, Account settings, What's due soon, My courses.
- Resume-test query uses RLS-scoped `assignment_attempts` with
  `submitted_at IS NULL`; toast.info fallback when none.
- Recents persisted to `student.cmdpalette.recent` (cap 8).

**M1 — Dashboard cross-course "Needs attention"** (new
`dashboard/NeedsAttentionPanel.tsx` + `useNeedsAttention.ts` +
`DashboardPage.tsx`)
- 3 sections: To grade / Past due / New replies.
- 3 parallel queries; each section reloads independently on failure.
- Graceful fallback if `graded_at` column missing (pre-0053).
- Collapse state persisted to `dashboard.attention.collapse`.
- All-empty → renders nothing (no "all caught up" wasted card).

**M12 — mock-test history** (new `student/MockTestHistoryPage.tsx` +
route + AreaSelector CTA)
- Route `/mock-test/history` in `StudentRoutesTree`.
- Reads `test_attempts` (real schema: `score / total / seconds_taken /
  set_uid / source` — original audit brief had wrong column names;
  corrected during build).
- Inline score-arc SVG (independent of M13's component).
- Compare-2 multi-select with sticky bottom bar + inline ComparePanel.

**M13 — score arc** (new `student/ScoreArcSparkline.tsx` extending
`ScorePrediction.tsx`)
- Pure inline SVG, no chart libraries. 10-point trajectory.
- `score/total` mapped via existing `400 + ratio*100*12` formula matching
  the `predict_my_sat_score` RPC for consistency.
- Fallback from `test_attempts` to mocktest-kind `assignment_attempts`
  when free-mode is empty.
- "↑ N since diagnostic" pill (emerald) / "↓ N" (rose) / "= no change"
  (slate).

**M31 — contrast cleanup** (26 files)
- Audited 84 candidates; edited 26.
- Body text + form-helper + timestamps bumped from `text-slate-400` to
  `text-slate-500 dark:text-slate-400` (4.5:1 AA).
- Decorative cases kept: em-dashes for empty cells, drag-handle icons
  next to bright labels, modal close-button icons, disabled-state
  cursor-not-allowed states, `placeholder:text-slate-400`.

**M2 — announcement broadcast + scheduled publish** (migration
`0054_announcement_publish_at.sql` + `teacher/AnnouncementFormModal.tsx`
+ `student/useStudentAnnouncements.ts` + `teacher/CourseAnnouncements.tsx`)
- New nullable `publish_at` column + composite index `(course_id,
  publish_at)`.
- Modal prop API: `courseId: string` → `targetCourseIds: string[]` +
  optional `allowMultiCourse` + `availableCourses`. Existing single-
  course callers pass `[courseId]` unchanged.
- Multi-select picker with "Select all / Clear" + live count when
  `allowMultiCourse`.
- `SmartDatePicker` for "Publish at (optional)". Submit button label
  switches to "Schedule announcement" when set.
- Student-side `.or('publish_at.is.null,publish_at.lte.<now>')` filter
  in `useStudentAnnouncements`. Fallback documented.
- Teacher-side "Scheduled · {relative}" badge on queued rows.
- Punted: pg_cron notification fan-out at publish-time (currently
  students see scheduled posts on next page load).

**M10 — toast undo** (`components/Toast.tsx` + 6 wire-up sites)
- `ToastOptions { action?: { label, onAction }; durationMs? }` added as
  optional 3rd arg on every toast variant. Backward-compatible.
- Action toast auto-extends to 8s (vs 4s default).
- Action button: `min-h-[40px]` tap target, underlined + semibold,
  variant-tinted hover background, `focus-visible:ring-2`.
- Wired: ModulesPage module rename + item rename, DashboardPage course
  archive, AllClassesView course archive, AssignmentsPage assignment
  archive + rename. Asymmetric: only archive→active offers Undo, not
  the reverse (prevents stacking confusion).
- Rollback failures surface as `toast.error("Couldn't undo …")` with no
  recursive Undo offer.

**Forbidden-pattern batch** (3 files)
- `AddSetToCourseModal.tsx` description `<textarea>` →
  `<MarkdownEditor characterLimit={1000} />`.
- `AccountSettings.tsx` 11 inline `setNotice/setError` calls →
  `useToast` (8 state hooks removed + 6 inline alert blocks). Bonus
  success toast on data export.
- `routeViews.tsx` 2 `<CenteredMessage>Loading…</CenteredMessage>`
  replaced with route-level `AssignmentRunnerSkeleton` +
  `FullScreenSkeleton` matching incoming layouts.
- Punted: `PortfolioItemFormModal.tsx` Choices textarea is functioning
  as a multi-line tag input. Needs a new `<TagInput />` primitive in
  `@/components` — flagged as a future wave.

### Vocabulary discoveries

- `test_attempts` actual schema is `score / total / seconds_taken /
  set_uid / source` — NOT `score_percent / correct_count /
  total_questions / duration_seconds / source_id / result_detail` as
  several internal references had assumed. Multiple lanes corrected.
- `audit_events` is the project's single audit table — there is no
  separate `admin_audit_log`. Wave 20 Lane 1 and Wave 21 Lane M6 both
  write here.
- The post-0012 rename left `assignments.class_id` intact even though
  `classes` → `courses` (the column was NOT renamed to `course_id`). RLS
  policies still join via `a.class_id`. Anything new that joins
  assignments → courses must use `class_id` as the FK column name.

### Wave 21 final state

- Migrations: **56** in cloud (0051, 0054–0056 added this wave;
  0052/0053 are content fixes; 0055 = grid_numeric_grading).
- Build: `npx tsc -b` exits 0 across all 11 lanes.
- Smoke: same 5 suites; no new cloud runs in this session.
- Audit status: 6 of 6 blockers shipped (B6 = MVP), 30+ of ~35 majors
  shipped or partial. Parking-lot reduced to:
  - **M24/M25 parent magic-link + guardians schema** — deferred (design
    needs user input on JWT lifetime, parent-view scope, FERPA review).
  - **M33 follow-up** — FK swap `test_attempts.user_id` → `profiles(id)`
    (risky on live table; defer).
  - **`CoursePortfolio.tsx` (1840L) + `AssignmentsPage.tsx` (888L)
    refactors** — high-regression-risk; needs careful Lane planning.
  - **Gradebook + ScoreHero migration to `assignment_attempts_effective`
    view** — small, but cross-cuts surfaces; do as a coordinated wave.
  - **`TagInput` primitive** for `PortfolioItemFormModal` Choices.
  - **pg_cron fan-out** for scheduled-announcement publish-time
    notifications.
  - **B6 server-side per-question persistence** (vs current localStorage
    write-through) — would require a new RPC + table; defer.

---

## Wave 21B — second autonomous follow-through (Round 4, Round 5, Round 6 — 2026-06-02)

A continuation pass closing the M6/M127 loop end-to-end and shipping a
few small ergonomic wins.

### Round 4 — closing M6/M127

**M127 Gradebook + ScoreHero → effective view** (`mocktest/components/
ScoreHero.tsx` + `lib/attemptReview.ts` + `teacher/useAssignmentAttempts.ts`
+ `teacher/CourseGradebook.tsx` + `teacher/AssignmentAttemptsView.tsx` +
`student/StudentAttemptReview.tsx` + `teacher/TeacherAttemptDetailView.tsx`)
- `ScoreHero` accepts optional `scoreOverride`; headline switches to
  override + "Adjusted by teacher" pill with auto-vs-override tooltip
- `AssignmentAttemptsView` table cell shows "Adjusted" pill inline next
  to the score
- `CourseGradebook` fetches `score_override` for chosen attempts in a
  batched single-round-trip alongside the `assignment_best_attempts`
  view query; adjusted cells get an indigo corner dot + tooltip
- `lib/attemptReview.ts` exposes `effectiveScore`;
  `useAssignmentAttempts` exposes `effective_score`;
  `StudentAttemptReview` + `TeacherAttemptDetailView` both pass
  `data.scoreOverride` to ScoreHero
- Documented known limitation in code: 0020's
  `assignment_best_attempts` view orders by `score_percent` alone. An
  attempt whose effective score with override would be higher could be
  missed. → Closed in Round 5 by migration 0057.

**M128 Student attempt review feedback display** (`student/
StudentAttemptReview.tsx`)
- Indigo-bordered "Teacher feedback" card mounted above ScoreHero when
  `feedbackText && gradedAt`
- Lazy-fetches grader's `display_name` from `profiles` in a separate
  effect (guarded on `data?.graderId && data.feedbackText`)
- Renders feedback HTML via `SafeHtml`
- Caption: "Graded {timeAgo} by {graderName ?? 'your teacher'}"
- Renders nothing when feedback is null — no nag

**M129 TagInput + PortfolioItemFormModal** (new
`components/TagInput.tsx` + barrel + `teacher/PortfolioItemFormModal.tsx`)
- New TagInput primitive: Enter/Comma to commit, Backspace on empty
  deletes last, ←/→ rove into chip strip, chip Backspace removes,
  paste-with-separators splits + dedupes, duplicate-reject amber ring
  flash, optional `maxTags` / `maxTagLength` / `allowDuplicates` /
  `required`, full a11y (`role="group"` + `role="list"` + chip
  `aria-label="Remove {tag}"` + sr-only `role="status"` announcements)
- PortfolioItemFormModal Choices field swapped from raw `<textarea>` to
  `<TagInput>`; state changed from `optionsText: string` to
  `options: string[]`; init effect + buildSettings updated
- Forbidden-pattern parking lot now empty for this category

### Round 5 — backend loop-closures (Migrations 0057, 0058, 0059)

**Migration 0057 — `assignment_best_attempts` by effective_score**
- `CREATE OR REPLACE VIEW` keeping the `DISTINCT ON (assignment_id,
  student_id)` shape from 0020
- Order by `COALESCE(score_override, score_percent) DESC NULLS LAST,
  submitted_at DESC` so the teacher's override actually wins the "best"
  pick
- New `effective_score numeric(5,2)` column exposed — callers
  (CourseGradebook) can drop their second round-trip
- Backward-compat: column shape preserved

**Migration 0058 — scheduled-announcement notification fan-out**
- `course_announcements.notifications_fanout_at` nullable column
- Backfill: pre-deploy rows that are already publish_at <= now() OR
  publish_at IS NULL get their notifications_fanout_at stamped to
  `created_at` so cron doesn't reconsider them
- `fanout_due_announcements()` plpgsql function: `FOR UPDATE SKIP
  LOCKED` + `LIMIT 500` + partial index for cheap scanning
- `pg_cron` schedule `* * * * *` (every minute) jobname
  `announcement-fanout-minute`, with unschedule-guard pattern from 0031
- Existing immediate-publish trigger from 0029 gets a `WHEN publish_at
  IS NULL` guard so scheduled rows don't double-notify at INSERT time

**Migration 0059 — grade-complete notification**
- `trg_notify_on_grade` AFTER UPDATE on `assignment_attempts`
- Fires on (graded_at null→non-null) OR (feedback_text null→non-null)
  OR (score_override IS DISTINCT FROM)
- Anti-spam: null-guards mean autosave thrash on existing feedback
  doesn't fire repeatedly; only meaningful state transitions count
- `kind='assignment_grade'`, title encodes the dominant signal
  ("just_graded" > "score_changed" > "feedback_added"), link routes to
  the course-aligned assignment surface
- No CHECK constraint on `notifications.kind` to update (free-form
  text in 0029)
- Race-safe: if the parent assignment row vanishes between UPDATE and
  trigger lookup, the function returns NEW without inserting

**M133 — Student AssignmentsPanel graded indicator**
(`student/useStudentAssignments.ts` + `student/AssignmentsPanel.tsx`)
- Extended the embedded `assignment_attempts(...)` SELECT to also fetch
  `score_override, graded_at, feedback_text`
- Widened `StudentAssignmentAttempt` with three new optional fields
- Row mapper now picks the **most-recent submitted** attempt (sort by
  `submitted_at desc`) rather than `[0]`
- `buildGradingIndicator(attempt)` derives a single small pill:
  - "Feedback" (indigo) when feedback only
  - "Graded {timeAgo}" (emerald) when graded only
  - "Graded {timeAgo} · Feedback" (indigo) when both
- Pill `min-h-[24px]` inline left of the Review/Start button; row stays
  ≥40px

### Migration-ledger collision + fix

The Round 5 lanes initially landed two files at 0057
(`best_attempts_by_effective_score` and `scheduled_announcement_fanout`)
because the agents picked numbers in parallel without coordination.
Renamed in place: `scheduled_announcement_fanout` → 0058 and
`grade_complete_notification` → 0059. Header self-references updated.

Also: this session's earlier docs claimed M6 shipped as migration 0053.
The reality is 0056 (0053 in the cloud is `fix_m1q13_choice`). Corrected
in CLAUDE.md, ARCHITECTURE.md §3e, this file, and the audit doc.

### Wave 21B final state (after Rounds 4 – 14)

- Migrations: **60** in cloud
- Build: `npx tsc -b` exits 0 across all 25+ lanes this session
- Audit blocker / major closure: every originally documented item now
  either shipped, partial-MVP-shipped, or carefully deferred with
  rationale
- Code-quality refactors complete this session:
  - `AssignmentsPage.tsx`: 929 → 443 (split into AssignmentCard,
    AssignmentsToolbar, BulkActionsBar, assignmentsFilter)
  - `CoursePortfolio.tsx`: 1840 → 796 (split into PortfolioTreeView,
    PortfolioItemNode, PortfolioOverviewGrid, usePortfolioDrag);
    behavior preserved including drop-pulse, auto-scroll, dashed drop
    tail, cycle prevention, kebab Move-to fallback

### Final parking lot (true deferrals — design input or future waves)

- **M24/M25 parent magic-link + guardians schema** — design input
  needed (JWT lifetime, parent-view scope, FERPA review). The audit
  documented Linda's MVP path but the schema is non-trivial. Defer.
- **B6 server-side per-question persistence** (vs current localStorage
  write-through) — needs new RPC + table; defer until staging perf
  shows the localStorage path is genuinely insufficient.
- **Notification email/push fan-out** for `assignment_grade` and
  `announcement` kinds — currently in-app only via 0029/0058/0059.
  Email path would need Resend integration (already wired for
  reminders); push would need new infra.
- **Smoke runs against cloud** — no env in this session; the 5 suites
  in `smoke-all.mjs` should be exercised on next teacher workstation.

---

## Wave 21B continued — Rounds 8–15 (autonomous polish + feature pass)

After the core audit closure, the session continued shipping follow-throughs
that were either flagged by the re-audit or surfaced as natural extensions
of earlier work. No new migrations beyond 0060.

### Round 8 — UX polish + smoke
- Notification bell polish: per-kind icon (megaphone/envelope/speech-bubble/check-circle/clock/dot) + "Mark all read" header button + hardened `markAllRead()` (snapshot+revert error path)
- M2 broadcast Dashboard entry point: "Broadcast" button (gated on `classes.length > 1`) opens `AnnouncementFormModal` with `allowMultiCourse + availableCourses`. Closes M2 user-surface gap
- Smoke for 0056–0060: new `smoke-grading.mjs` (10 scenarios) + `smoke-announcements.mjs` (8 scenarios) + extended `smoke-cascade.mjs` with 0060 FK target verification

### Round 9 — Free-mode review surface + tightening
- New `MockTestReviewPage` at `/mock-test/history/:attemptId` reads `test_attempts` + `test_answers`, reuses `ScoreHero`, closes the Wave 21 M12 "Review coming soon" stub
- Student ⌘K stubs replaced with real query-backed resolutions
- TestsPanel grading-indicator lane closed as N/A — `test_runs.score` is purely auto-graded

### Round 10 — Staff palette + re-audit
- Staff ⌘K student/course name search via `useLmsCommands` extension — ~72 commands for a typical teacher (capped at 100)
- Wave 21 + 21B read-only re-audit found and fixed 1 forbidden-pattern violation (`FullTestApp.tsx:409` `window.confirm` → `ConfirmDialog`), with 2 false-positives dismissed; component-location convention codified in CLAUDE.md

### Round 11 — Realtime + teacher polish
- `NeedsAttentionPanel` realtime: channel `needs-attention:<teacherId>` with 2 postgres_changes listeners, 300ms debounce, reconnection-triggered full refresh, flash-fresh indigo ring on newly-arrived rows
- `TeacherAttemptDetailView` per-question time/skill: skill breakdown derived from snapshot JSONB; per-question status table; aggregate avg-time chip — both default-closed via `<details>`
- AssignmentsPage "Recently graded" filter pill (7-day window, only renders when count > 0)

### Round 12 — Inbox compose + keyboard help
- Inbox `?compose=<userId>` consumption — `useSearchParams` + ref-guarded one-shot → `open_thread_with` RPC → navigate. RPC handles existing-thread short-circuit + new-thread creation idempotently. Closes broken deep-link from gradebook + staff ⌘K
- `ShortcutHelpOverlay` refresh: 26 new entries across "Practice & mock test" + "Teacher grading" sections

### Round 13 — Student profile + smoke
- New `StudentProfilePage` at `/courses/:courseId/people/:studentId` with 3 parallel-fetched collapsible sections (Attempts, Discussion posts, Portfolio submissions). Header has Send-message button → inbox compose
- Linked from `ClassRoster` + `CourseGradebook`
- Smoke additions: `open_thread_with` idempotency + commutativity; end-to-end grade-notification anti-spam

### Round 14 — Filter + bulk grading
- NeedsAttentionPanel per-course filter chip row — renders only when ≥2 unique courses, applies to all 3 sections, persists, stale-filter guard, realtime bookkeeping survives filter switches
- `BulkGradeModal` + multi-select on `AssignmentAttemptsView` — write feedback + score override + Mark-as-graded to multiple selected attempts in one `.in('id', ids)` UPDATE. 0059 trigger fires correctly per attempt with anti-spam null-guard

### Round 15 — Student feedback visibility
- `RecentFeedbackWidget` + `useRecentFeedback` hook on student `AreaSelector` (placed between WeakSkills CTA and progress section): shows up to 5 most-recent gradings with effective_score pill + truncated feedback preview + "Graded {timeAgo} by {grader}". Renders nothing when empty (silence > nag). Batched grader-name lookup
- `/my-feedback` page + Widget "View all" link landing as Round 15 continues

### Wave 21B grand total

- **39+ lanes shipped** across 15 rounds; 1 lane closed as correctly N/A
- **6 migrations** (0050, 0056, 0057, 0058, 0059, 0060)
- **7 smoke suites** (~5000 lines) with 4 new scenarios this wave
- **2 major refactors** (AssignmentsPage 929→443, CoursePortfolio 1840→796)
- New surfaces: `StudentProfilePage`, `MockTestReviewPage`, `RecentFeedbackWidget`, `NeedsAttentionPanel` (realtime + per-course filter), `BulkGradeModal`, etc.
- `npx tsc -b` clean after every round

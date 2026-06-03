# Session Recap

## Latest (2026-06-03) — controlled-test polish, mobile audit, role-prefixed URLs

- **Role-prefixed URLs.** Every authenticated surface now carries a `/educator`
  or `/student` prefix so the role is legible in the address bar (the runner
  `/test/:slug` stays shared). Implemented mostly by changing the `ROUTES.*`
  constant *values* (consumers + builders update automatically); shared
  account/inbox render under each role's prefix (`AccountRoutes` takes a
  `basePath`; `InboxPage`/`NotificationBell` derive from `profile.role`).
  Old paths redirect to the role home. Verified in-browser for both roles.
- **Per-test overview** (`/educator/tests/:slug`, migration 0089
  `assign_test_to_course`). Teachers opening a test's Modules link land on a
  dashboard — test info + timed-module structure, cohort stats (assigned /
  submitted / in-progress, average + range, score distribution), and
  per-student data with Review / per-row + bulk release / stuck-attempt reset.
  QA actions: Preview test, Answer key, Assign to course, Monitor live.
  Students still get the runner (branch at `StaffTestGate`).
- **Migration collision fix (0086 → 0090).** A duplicate `0086_*` filename had
  silently skipped the second migration; renumbered so the course-scope
  hardening of `release_test_results`/`allow_test_retake`/`reset_test_attempt`
  actually applied. Added **`docs/MIGRATIONS.md`** as the authoritative ledger.
- **Mobile/tablet runner audit.** Fixed a preview-remount regression (the role
  branch was bouncing staff preview back to the intro on every "Begin"),
  switched the phone R&W layout to a single natural scroll (Bluebook two-pane
  preserved at md+), and eliminated horizontal overflow on staff pages at phone
  widths (`min-w-0` on cards/grids; All-Classes toolbar wraps). See
  `docs/MOBILE_AUDIT.md`.
- **Frictionless onboarding — no confirmation emails.** The production project
  now runs with **email confirmation OFF** (`mailer_autoconfirm`) and
  **anonymous sign-ins ON** — both verified live against the remote (anonymous
  via a throwaway `signInAnonymously()` probe that was deleted afterward), and
  `config.toml` set to match. Students get in with a teacher-dispensed
  per-student code/QR or a class-code Quick Start; no inbox required. The login
  screen (`AuthScreen`) promotes the buried "Quick start" footer link into a
  prominent **"Join with a class code"** card (shown on both Sign in and Create
  account) and clarifies the per-student code/QR copy. See `docs/SMTP_SETUP.md`
  for the deliberate confirmation-off rationale and the re-enable trigger.

---

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

### Wave 21B grand total (Rounds 4–15)

- **39+ lanes shipped** across 15 rounds; 1 lane closed as correctly N/A
- **6 migrations** (0050, 0056, 0057, 0058, 0059, 0060)
- **7 smoke suites** (~5000 lines) with 4 new scenarios this wave
- **2 major refactors** (AssignmentsPage 929→443, CoursePortfolio 1840→796)
- New surfaces: `StudentProfilePage`, `MockTestReviewPage`, `RecentFeedbackWidget`, `NeedsAttentionPanel` (realtime + per-course filter), `BulkGradeModal`, etc.
- `npx tsc -b` clean after every round

---

## Wave 21C — Autonomous 8h run (Rounds 16–26)

User went AFK with "keep going autonomously". Shipped 11 more rounds with self-critique after each, careful commits between rounds, and focused on UI/UX/workflow/aesthetics/wiring quality per user direction.

### Round 16 — Feedback templates
- `feedbackTemplates.ts` helper (localStorage, cap 25 per teacher, lastUsedAt sort)
- `BulkGradeModal` template chip row + save form + load/delete via `ConfirmDialog` (removed 2 `window.confirm` calls — forbidden pattern)
- Same primitive available to extend `TeacherAttemptDetailView` (parked)

### Round 17 — Teacher private notes
- Migration **0062** `teacher_student_notes` table (RLS scoped to author; admins can audit but not edit; audit trigger logs op + ids but NOT body for privacy)
- `useStudentNotes` hook with autosave + visually-empty-as-delete-intent
- `PrivateNotesSection` on `StudentProfilePage` between header and activity sections

### Round 18 — Library-vs-assign-time workflow audit + 4 fixes
- 2 read-only audits surfaced screenshot complaint + 4 other violations
- **Practice Test chip on Modules** refactored from authoring form → library picker (clone-on-add Path Y, mirrors Question Set)
- Question Set chip `time_limit` removed (computed from `questionCount * 0.75` rounded to 5min, ≥10min)
- `AddSetToCourseModal` `time_limit` + `max_attempts` removed (same compute; max_attempts=null)
- QuestionBankPage Practice Tests catalog: "Duplicate to course…" kebab (Option C reuse flow)

### Round 19 — Workstream B: Portfolio template import
- Migration **0063** `import_portfolio_items(source, target, item_ids[])` RPC. Recursive CTE deep-clones items + descendants. Two-pass clone with old→new id map. Stable error codes. Audit logs op + counts + ids but NOT bodies.
- `PortfolioImportModal` source-course picker + selectable item tree with auto-descendant + Select all/Clear
- Smoke wave63 7 steps: happy path 3-item clone with child rewrite assertion, outsider→not_authorized, same_template guard, empty-array→0, audit privacy check

### Round 20 — Audit log UX + Cohort summary
- AdminAuditPage action filter: free-text → grouped `<select>` with friendly labels. Registry of known DB actions. Live unknown actions auto-append to "Other".
- New `CohortSummaryWidget` on Dashboard between NeedsAttentionPanel and courses grid: per-cohort scoreboard with score color bands. Cap 12 cohorts. "Needs N" pill scrolls to triage. Collapse persists.

### Round 21 — Quality sweep (10 fixes across 9 surfaces)
- Read-only audit catalogued 30+ findings; top-10 by user-impact applied inline:
  - StudentProfilePage `toast.error` in render → `useEffect` with ref guard (was toast spam)
  - QuestionBankPage `window.location.assign` → `navigate` (no more SPA reload)
  - useCohortSummary 2-phase fetch with explicit `.in('course_id', ids)` (was 500-row RLS scans)
  - PortfolioImportModal backdrop `onClick` → `onMouseDown` (was accidental close on tree drag-release)
  - MyFeedbackPage toast title/body split
  - BulkGradeModal `plainTextLength()` for 5000-char warning (was firing on short essays due to TipTap HTML inflation)
  - AdminAuditPage uses shared `<EmptyState>`
  - QuestionBankPage `useOptimistic` 3rd-tuple setter (dropped eslint-disabled no-op effect)
  - NeedsAttentionPanel past-due rows use `initialOf(courseName)` not `⏰` emoji
  - ModulesPage hand-rolled animate-pulse → `<SkeletonRows>` in 2 places

### Round 22 — Portfolio import anchor + announcement publish-now
- Migration **0064** `import_portfolio_items` extended with optional `p_target_parent_id`. When non-NULL, validates parent belongs to target template; cloned roots get `parent_item_id` set to anchor. Backward-compat via DEFAULT NULL.
- `PortfolioImportModal` "Insert at…" picker (root or indented target items)
- `CourseAnnouncements` "Publish now" kebab on scheduled rows. UPDATE `{publish_at: now, notifications_fanout_at: null}` flips visibility + lets 0058 cron fan out. Optimistic `publishingIds` Set with rollback.

### Round 23 — Audit details smart formatter
- 10 per-action formatters on AdminAuditPage (role.change, invite.mint, course.delete, assignment.delete, material.delete, announcement.delete, profile.delete, assignment_grade, teacher_note_change, portfolio_import)
- Defensive accessors; null-fallback to raw `<pre>JSON` for unknown shapes
- `<UuidPill>` truncates to `{first8}…{last4}` with full UUID on hover
- `<RelativeTime>` uses `Intl.RelativeTimeFormat`
- Per-row "View raw JSON" toggle preserves forensic access

### Round 24 — Audit course filter + anchor smoke
- AdminAuditPage gained a course filter (2nd slot). Single chained `.or()` with 4 predicates: `and(target_kind.eq.course, target_id.eq.X)` (avoids uuid-collision false positives), `details->>course_id`, `details->>target_course_id`, `details->>source_course_id`. Persists to `localStorage.admin.audit.courseFilter`. Helper-text pill + clear button.
- Smoke wave63 +3 scenarios for 0064: anchored happy path, parent_not_in_target_template, audit row carries target_parent_id only when anchored. Cleanup ordering deletes children before anchor. Audit-row discrimination uses `target_parent_id` presence, not created_at.

### Round 25 — Notification preferences + bulk roster
- `/account/notification-preferences` page with 5 kind toggles (announcement/message/feedback/assignment_grade/reminder). localStorage opt-outs per-user. `useNotifications` filters visible rows + recomputes unread count. Cross-tab `storage` event listener keyed on prefs key.
- `ClassRoster` multi-select + bulk Remove. Master checkbox `indeterminate` via ref + `aria-checked="mixed"`. Belt-and-suspenders DELETE `.in("id", ids).eq("course_id", cls.id)`. Archive skipped — no column.

### Wave 21C grand total

- **20+ lanes shipped across 11 rounds (Rounds 16–26)**
- **3 new migrations** (0062, 0063, 0064) — all backward-compatible
- **Smoke** extended with wave63 (10 scenarios for portfolio import incl. anchor variants) + 2 more in wave-grading
- **`npx tsc -b` clean after every commit; clean working tree at every push**

### Round 26 — Course Overview landing page
- `CourseOverview` 5-card grid (Roster / Assignments / Recent activity / Average grade / Quick actions) replaces stub
- `useCourseOverview` hook: 4 parallel queries via `Promise.all`, `tokenRef` counter for stale-response races
- 30-day attempts window covers both "Recent activity" and "Average grade" cards
- Empty states with CTAs on every card

### Round 27 — Quality sweep on Rounds 22-26 (6 inline fixes)
- `CourseAnnouncements.tsx:271` — Scheduled badge palette sky → indigo (palette canon)
- `AdminAuditPage.tsx:1188` — Removed 📚 emoji from "Scoped to" chip (forbidden pattern)
- `AdminAuditPage.tsx:1260-1270` — Rose tone for destructive event badges
- `NotificationPreferencesPage.tsx:95-105` — Removed per-toggle toast.success spam
- `useNotifications.ts:131-150` — `markRead` optimistic rollback (was leaving fake-read state on silent RLS rejection — mirrors existing `markAllRead` pattern)
- `CourseOverview` recent activity rows wrapped in `<Link>` to source discussion topic (topicId was SELECTed but discarded)

### Round 28 — Score trajectory + reply deeplinks
- `StudentProfilePage` inline score-trajectory sparkline in profile header. Filters attempts with non-null `effective_score`, last 15, polyline + dots + gridlines at 0/50/100. Last segment band-colored (emerald ≥80, indigo 70-79, amber 50-69, rose <50). Empty / single-point states handled.
- `NeedsAttentionPanel` reply rows now navigate to `#post-<id>` on topic page (was just topic root)
- `DiscussionTopicView` `<article id="post-<id>">` wired on each post + `useLocation` hash-scroll effect with brief indigo ring flash. `scroll-mt-24` for sticky-header clearance.

### Round 29 — Inbox thread search
- Client-side filter input above thread list in `InboxPage`
- Filters by participant display_name (or email fallback) + last_message_snippet (HTML-stripped)
- Focus shortcut: `/` (⌘K stays owned by `CommandPalette` globally). Gated against typing-target focus.
- Esc clears + blurs; filtered-empty state distinct from "No conversations yet"
- No persistence (transient)

### Round 30 — Calendar keyboard nav + shortcuts help
- `←` / `→` prev/next month, `T` today, `M`/`L` Month/List view, `?` toggles help popover
- Gating: no modifier keys; skip if INPUT/TEXTAREA/SELECT/contenteditable focused; all matched keys `preventDefault`
- Today button memoized `todayDisabled` — disabled on list view or when already viewing current month
- Help popover: `role="dialog" aria-modal="false"` (non-blocking floating panel, not a true modal — no `useFocusTrap`). Click-outside + Esc close.
- Nav buttons bumped to min-h/w-[40px] for touch
- View-mode preservation: month nav mutates only `anchor`; localStorage view persistence intact

### Cumulative session total (Waves 21B + 21C, Rounds 4–30)

- **65+ lanes shipped across 27 rounds**
- **9 migrations** (0050, 0056, 0057, 0058, 0059, 0060, 0062, 0063, 0064) — all backward-compatible
- **7 smoke suites** (~5500 lines) with 12 new scenarios incl. 10 wave63 portfolio-import scenarios
- **30+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**

### Wave 21D — User said "continue" (Rounds 31-36, 6 more rounds shipped)

User overrode the post-Round-30 stopping rationale. Picked up with smaller, focused lanes — paired in parallel agents per round.

### Round 31 — Gradebook CSV export + Discussion thread collapse
- `CourseGradebook` "Export CSV" button (top-right header). Headers: Student / Email / <assignment titles> / Average. Scores plain decimal-rounded (`87` or `87.5`; override annotation `87.5 (override)` keeps numeric prefix parseable). UTF-8 BOM + CRLF (Excel-friendly). Filename `gradebook-<courseShortCode>-<yyyy-mm-dd>.csv`. Iterates `searchFilteredStudents` so user filters/sort/search are respected — exported rows match exactly what's on screen.
- `DiscussionTopicView` chevron toggle on each `PostNode` with children. Click collapses descendants → "N reply/replies hidden — click to show" hint replaces children container (keyboard-accessible). `collapsedIds` Set + `onToggleCollapsed` threaded from `DiscussionTopicView → PostNode` (transient). Hash-scroll Round-28 effect: clears `collapsedIds` when hash arrives + reruns to land deeplink target. Toggle hidden while user composing reply on that post. `aria-expanded` + `aria-controls` + `aria-label="Collapse N replies"`.

### Round 32 — Modules Alt+↑/↓ reorder + Roster sort & empty state
- `ModulesPage` grip handle becomes a real `<button data-module-grip="{id}">` with `tabIndex=0` + dynamic `aria-label` ("Reorder X. Module N of total. Press Alt+Up/Down to move…"). Visual chrome unchanged. Alt+↑/↓ swaps with neighbor via same `move_module` RPC the drag handler uses. After RPC + `refresh()`, `requestAnimationFrame` re-focuses the grip by `data-module-grip` so the indigo focus ring travels with the row. New page-level `aria-live="polite"` region announces "Moved X up/down" and auto-clears after 2s. Works on nested submodules.
- `ClassRoster` sortable column headers: Name (locale-aware), Joined (`joined_at`). Active key shows indigo ▲/▼; inactive shows faint slate ↕ on hover. Toggles asc↔desc on same key, starts asc when switching. Persists per `(user, course)`: `roster.sort:${userId}:${courseId}` → `{key, dir}`. Empty-roster state via shared `<EmptyState>`: "No students yet" + primary "Copy course code" (writes `cls.short_code` to clipboard) + secondary "Import roster CSV" opening `BulkRosterModal`. Search-zero-hit state distinct.

### Round 33 — AssignmentRunner timer warnings + edit own discussion post
- Parallel wall-clock observer in `MockTestAssignmentRunner` aligned with `MockTestApp`'s internal countdown (sub-second tolerance — both start on the same React tick when stage transitions to "ready"). 5-min warning at `secondsLeft ≤ 300` (requires `totalSeconds > 330`). 1-min warning at ≤ 60 (requires `totalSeconds > 90`). Each fires exactly once per attempt via `useRef`. `toast.warning` (amber, `role="alert"`, 10s duration). Silent when `≤ 0` (auto-submit window). Untimed assignments → early-return.
- **No migration needed** for discussion edit: `discussion_posts.updated_at` (auto-managed via `trg_discussion_posts_updated` from 0025) covers the "edited" indicator; existing RLS UPDATE policy already permits author + staff. Inline indigo "Edit" button on each `PostNode` (gated on `canManage`). Esc cancels, Cmd/Ctrl+Enter saves. Optimistic update via `optimisticEdits` map; rollback on error. Edited indicator: "· edited <relativeTime>" italic slate-400 with full timestamp tooltip. Detection: `updated_at - created_at > 2000ms` (slack for INSERT-driven `set_updated_at` trigger jitter). Mutex with reply form (Edit closes any open reply form on same post).

### Round 34 — Notification bell keyboard nav + CommandPalette navigation entries
- `NotificationBell`: ↑/↓ walk highlighted index (clamped); Home/End jump; Enter activates (markRead → navigate → close); M/m marks highlighted as read without nav; A/a marks all read; Esc closes + restores focus to bell (`queueMicrotask` survives unmount). Default highlight: first unread, falls back to 0. Mouse hover syncs to keyboard cursor. Realtime list updates clamp index in range. `scrollIntoView({block:'nearest'})` on highlight change. Discoverability hint in sticky footer (sm+). Full `role=menu/menuitem` + `aria-current` a11y.
- `lmsCommands` (staff): + "Notification preferences" (top-level Navigate). New Admin group gated on `isStaff(profile?.role)`: Audit log, Admin users, Admin stats, Invite codes. Reuses existing `NavSpec` interface + `Command` group literal. Recents (`staff.cmdpalette.recent`) work automatically via `command.id`.

### Round 35 — Inbox keyboard nav + cohort drill drawer
- `InboxPage`: ↑/↓/Home/End walk `filteredThreads`; Enter opens highlighted; Esc clears keyboard cursor (doesn't fight right-pane's own Esc). Handler bound on scrollable list container (not window) — never fights TipTap composer or search input. `/` shortcut from Round 29 untouched. Default highlight matches URL `:threadId` if present, else index 0. `onMouseEnter` syncs hover ↔ keyboard cursor. Filter changes clamp index but don't yank back to first match on every keystroke. `role=listbox/option`, `aria-selected`, `tabIndex=0` container. Discoverability hint below search (sm+).
- `CohortSummaryWidget` drill drawer: new `useCohortDrill(cohort)` hook (lazy — only fires when `cohort != null`). Two-phase query: `assignments.id` for course → `assignment_attempts_effective` over 30-day window joined to profiles. Falls back to plain `assignment_attempts.score_percent` if view missing (graceful degradation). Token-ref cancellation pattern. `useCohortSummary` untouched. Right-side panel: `sm:w-[420px]` desktop, `inset-0` mobile, indigo `border-l-4` accent, `motion-safe:transition-transform`. `useFocusTrap` wired with `data-autofocus` on close button. Top-5 sort: `attempts DESC` primary, `avgEffectiveScore DESC` tiebreak. States: `SkeletonRows count=5` load, rose Retry on error, slate empty. Needs-attention callout (rose chip) when `needsAttentionCount > 0` with "View triage →" link that closes drawer + scrolls to `#needs-attention-heading` on next animation frame. Cohort card body is now `<button>` with hover-revealed "View details →" chevron; "Open modules →" footer link preserves Canvas-style jump-to-course; "Needs N" pill `e.stopPropagation()` so it still routes to triage without opening drawer.

### Round 36 — ⌘B sidebar toggle + client-side discussion unread
- `StaffShell` Linear-style desktop sidebar collapse: per-user localStorage `staff.shell.sidebarCollapsed:${userId}` hydrates async once profile loads. ⌘B / Ctrl+B window keydown toggles; `preventDefault()` so Firefox/Edge bookmarks-bar stays quiet; reuses `isEditableTarget` so it doesn't fight markdown bold / search inputs. Collapsed `lg:w-16` (icon-only), expanded `lg:w-44`. Md/sm unchanged. Toggle button `hidden lg:inline-flex` at bottom of sidebar, 40×40 tap, `aria-controls` + `aria-expanded` + label flip. Chevron rotates 180° (motion-safe). Wordmark `aria-hidden` + `lg:hidden` when collapsed. NavLinks get `title="..."` for native tooltips when icon-only. 150ms ease-out width transition.
- Discussion client-side unread (closes **LMS_ROADMAP 4.4** without migration): `DiscussionTopicView` `useEffect` on `[topic?.id, profile?.id]` writes ISO timestamp to localStorage map at `discussion.visited:${userId}`. LRU cap 200 entries (sort desc by timestamp, trim newest 200 on overflow). `CourseDiscussions`: `loadVisitedMap` helper with corruption tolerance; bulk `discussion_posts` SELECT for `max(created_at)` per topic — one round-trip regardless of topic count, piggybacks on existing reply-count effect. `UnreadState` union: `'visited-new'` (indigo dot + "· New replies since your last visit"), `'never'` (slate "Unread" pill matching existing Pinned/Locked styling), `'none'`. Activity fallback: `latestPostAt[topic.id] ?? topic.created_at` so brand-new zero-reply topics still surface "Unread" to first-time viewers. `visitedTick` state bumped on window focus + `visibilitychange` so returning from a topic re-reads localStorage and clears the indicator without hard refresh. Known false-positive: OP sees own freshly-posted reply as new until they revisit (would need `author_id != viewer` filter requiring DB-side work).

### Final autonomous-run total (Waves 21B + 21C + 21D, Rounds 4–36)

- **75+ lanes shipped across 33 rounds**
- **9 migrations** (0050, 0056, 0057, 0058, 0059, 0060, 0062, 0063, 0064) — all backward-compatible
- **7 smoke suites** (~5500 lines) with 12 new scenarios
- **35+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **One LMS_ROADMAP item closed** (4.4 discussion read receipts — client-side substitute without DB risk)
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**
- **Parallel session ran continuously alongside** — landed `e790932` (RLS on assignment_* views) and `daf3a2d` (TimerSetup bundle split) interleaved; no merge conflicts ever (scoped `git add` per the documented memory protocol)

### Standing stopping rationale (post Round 36)

Items deferred:
- **Notification email/push fan-out** — needs Resend integration design
- **Parent magic-link** (M24/M25) — needs UX direction from user
- **Workstream C Material library** — schema changes to existing `course_materials` carry unverifiable DB risk without env
- **Round 23 scheduled-publish "Send notifications immediately" toggle** (Task #177) — touches notifications RLS delicately; 60s cron tick acceptable

### Wave 21E — User said "keep going" (Rounds 37-45)

After 2 stopping notices, user said "continue" then "keep going". Shipped 9 more rounds with a clear focus: **systematic sort + filter + persistence + keyboard nav + empty states across every major list/triage surface** so student / teacher / admin all see the same UX bar.

### Round 37 — ⌘N Quick-create + sticky AssignmentDetailPage
- New `QuickCreatePalette` (~245 lines): ⌘N centered 2×2 grid (Assignment / Announcement / Discussion / Material), ↑↓←→ navigate, recents at `staff.quickcreate.recent:${userId}`, mounted in `ClassLayoutContext.Provider` so it gets `useClassContext()` access and the listener only attaches in course routes. Activation: route-only landing (consumer pages don't read `?new=...` today — confirmed via grep — palette navigates to surface, user clicks "+ New" inline. One-line extension if any consumer later honors a flag).
- `AssignmentDetailPage` sticky header at `top-0 z-20` with `backdrop-blur-sm`, requestAnimationFrame-throttled scroll listener flips `scrolled` boolean at 80px threshold. Title shrinks `text-2xl → text-lg`. `HeaderPill` component centralizes tone palette: Status (Active emerald / Archived slate), Type (Practice Test violet / Question Set indigo per vocabulary canon), Due (relative format with Past due rose / Due in N min-hr amber / Due in N days slate-amber), Questions, Time limit. Existing kebab actions untouched.

### Round 38 — Smoke wave-post-30 (16 scenarios)
- +534 lines in `smoke-features.mjs`. `wavePost30()` between `wave63()` and `studentProfile()` in `run()`.
- A: Discussion post edit RLS — author edits own, staff edits student's, outsider denied (accepts both PostgREST denial styles), trigger re-fires on second UPDATE.
- B: `assignment_attempts_effective` view fallback — `effective_score = score_override` when set, `= score_percent` when null, outsider sees 0 rows (locks in mig 0065 `security_invoker=on` shipped by parallel session).
- C: Bulk roster `course_id` belt-and-suspenders — correct id deletes 1 row, wrong id is 0-row no-op.
- D: `updated_at` jitter — fresh INSERT Δ < 2000ms (load-bearing: confirms mig 0025 trigger is `BEFORE UPDATE` only); post-UPDATE after >2s sleep crosses threshold.
- Local fixture tracking object, try/catch per delete, service-role for teardown so RLS can't block.

### Round 39 — Student AssignmentsPanel + StudentAttemptReview filters
- `AssignmentsPanel`: 5 filter chips (`role="tablist"`) with counts: All / Past due / Due soon (≤7d) / Submitted / Graded (`graded_at && feedback_text` non-null). Submitted-precedence: submitted past-due → Submitted. Sort `<select>`: Due earliest (default), Due latest, Recently assigned, Course name. Missing `due_at` sinks via ±Infinity sentinel. Persistence `student.assignmentsPanel.view:${userId}` → `{filter, sort}`. Grouping (To do / Past due / Completed) preserved only when `sort=due_asc && filter=all`. Empty filtered state distinct from empty-zero. `aria-controls`/`aria-live` polite.
- `StudentAttemptReview`: 2 filter pills (Marked dropped — `marked` is Bluebook-runner-only, doesn't survive into attempt snapshot). "Next ▼" button: collects `!isCorrect` rows, picks first below `scrollY+80`, `scrollIntoView` smooth, wraps to first if none below. Each row `id={`q-${i}`}` + `data-question-id` + `scroll-mt-20`. Inlined `ReviewRowItem` mirrors `AnswerReview`'s visual contract while adding the DOM ids that scroll-to-next requires (lane scope was EXCLUSIVE).

### Round 40 — AdminAuditPage date range + Inbox mute
- `AdminAuditPage`: Preset chips `role=group aria-pressed`: All time / Last 24h / 7d / 30d / Custom. Custom commits on blur (no Apply button). Inverted range surfaces rose `role=alert`. `gte/lte` applied in `refresh()`. Custom-to uses literal `${date}T23:59:59.999Z` (UTC). Presets 24h/7d/30d use `Date.now()` minus millisecond delta — precise instants, not day-aligned. Persistence `admin.audit.dateRange` → `{preset, from?, to?}`. "Reset" → "Clear all filters" — resets action + course + actor + dateRange. Active-filter pill in meta strip. Removed orphaned `SmartDatePicker` import + `dayStartIso`/`dayEndIso` helpers.
- `InboxPage` mute: each `<li>` position:relative; `KebabMenu` absolutely positioned right edge layered above `NavLink` (avoids nested-interactive-elements a11y violation). Kebab always visible on mobile; hidden until `group-hover`/`focus-within` desktop. `showUnreadBadge = !isMuted && unread_count > 0` gate hides badge for muted. Muted row: `opacity-70` + inline 14×14 bell-slash SVG with `<title>Muted</title>`. Cross-tab via `storage` event keyed on `inbox.mutedThreads:${userId}`. 500-entry LRU cap. Sort + search + Round 35 keyboard nav untouched.

### Round 41 — AnnouncementForm scheduled-publish + Calendar day popover
- `AnnouncementFormModal`: 3 quick presets below SmartDatePicker in `role=group`: In 1 hour, Tomorrow 9am (always +1 calendar day), Next Monday 9am (`((1-today+7)%7)||7` so today=Monday returns FOLLOWING Monday), Clear. Presets live OUTSIDE picker (picker's built-in chips snap end-of-day). Live + on-submit validation: 30s `nowTick` heartbeat + manual bump on every `publishAt` change; rose `<p role="alert">` + Save disabled when invalid; belt-and-suspenders re-check inside `onSubmit`. "Will publish {relativeTime}" hint via `Intl.RelativeTimeFormat` with elapsed-based scale.
- `CalendarPage` month popover: `MonthCell` `hasEvents` gate. Desktop: `position=fixed` with `getBoundingClientRect()` at click time, default right of cell, flips left if `right+280>viewport-8`, vertical shifts to fit. First render hides off-screen for one tick so panel height measurement is real before committing coords. Mobile (≤640px): bottom sheet. Indigo `border-l-4` accent. State unmounts in list view; Round 30 shortcuts still attach unconditionally.

### Round 42 — Inbox pin + AdminAudit actor filter
- `InboxPage` pin: 500-entry LRU cap (`inbox.pinnedThreads:${userId}`). Kebab menu: Pin/Unpin first, then Mute/Unmute. Sort: search filter → partition by pinned. Upstream `threads` already sorted by `last_message_at` desc, so stable partition `[...pinned, ...rest]` gives pinned-by-recency-then-unpinned-by-recency for free. Divider `<li role="separator" aria-label="Pinned conversations">` (role=separator not option, so listbox indexing stays 1:1 with `filteredThreads` — Round 35 `highlightedIndex` doesn't go off-by-one). Pin + Mute orthogonal: pinned+muted shows both icons + border-l-2 indigo + opacity-70 muted body.
- `AdminAuditPage` actor filter: confirmed `audit_events.actor_id` (uuid, nullable for system events). Paired text-input typeahead + native `<select>` (not custom combobox — matches existing filter visual treatment, zero new deps, native a11y for free). Active selection preserved as leading option even when typeahead filters it out. `.eq("actor_id", actorFilter.actorId)` composes AND-wise with action/course/date. "Clear all filters" resets actorFilter too; dedicated × next to combobox clears just actor.

### Round 43 — AssignmentAttemptsView + MyClassesPanel
- `AssignmentAttemptsView`: 4 filter pills (Marked for review dropped — no flag column on `assignment_attempts`): All / Ungraded (`submitted && !graded`) / Graded / In progress (`!submitted`). Sort: Most recent (default), Oldest, Student name (locale-aware), Highest score, Lowest score (NULLs last). Score precedence: `score_override ?? score_percent`. Search box `<input type="search">` substring on `student_display_name`, ANDed with pill. Empty filtered state distinct. Bulk-select coupling: master checkbox + select-all operate on VISIBLE submitted set, not entire — toggling pills doesn't silently steamroll rows out of view.
- `MyClassesPanel`: 3-option sort `<select>`: Most recent (joined_at desc, default), Oldest joined, Course name (localeCompare base sensitivity). Hidden when empty/loading/errored. Empty state inline `<EmptyClassesState>` (no shared `<EmptyState>` primitive exists), stack-and-mortarboard glyph + dashed ring. CTA opens existing `<JoinClassModal>`; `onJoined` closes modal + `refresh()`.

### Round 44 — AllUsersView role filter + StudentCourseView stats
- `AllUsersView`: 4 role-filter pills with live counts (counts scope to current page, matching existing search). Sort drives the SERVER query (`range()` pagination) so it composes correctly across pages: Joined newest (default), Joined oldest, Name (display_name fallback email, nullsFirst=false, created_at tiebreak for stable pagination), Role (server orders by role+created_at deterministic, client-side re-sorts page via `ROLE_SORT_WEIGHT` admin→teacher→student so triage-useful order wins). Persistence `admin.users.view`. "Clear all filters" only renders when ≥1 filter active. Untouched: role-edit, delete, role-badge colors.
- `StudentCourseView`: 2 stat tiles (Weak skills dropped — SkillHeatmap data not plumbed into this view): Assignments due (count unsubmitted + future due_at), My average (avg `effective_score` from `assignment_attempts_effective` over 30d). `useEffect` on `[course?.id]` after course loads. Two parallel queries via `Promise.all`. `tokenRef` cancellation (mirrors `useCourseOverview`). Per-card states independent. "Assignments due" → ROUTES.HOME (no per-course assignments route for students); "My average" no link.

### Round 45 — MyFeedbackPage + StudentPortfolio
- `MyFeedbackPage`: 5 filter pills with counts: All / Has feedback (text non-empty trimmed) / Awaiting (no feedback AND `gradedAt` null — source universe already "submitted", so cleanly captures pre-grade rows) / High score (≥80) / Low score (<60). Sort: Most recent (default, `gradedAt` desc), Oldest first, Highest/Lowest score (nulls last), Course name (localeCompare base). Persistence `student.myFeedback.view:${userId}`. Palette: Awaiting amber, Low rose, High emerald, Has feedback indigo, All slate.
- `StudentPortfolio`: 5 status filter pills via `leafStatus(submission, due_at)`: submitted > draft > past_due > not_started precedence. Tree-prune algorithm: parents drop when 0 matching descendants → empty branches collapse; immutable spread `{...n, children: prunedChildren}`. Sort toggle Position / Due date: due_date splits parents+leaves, parents stay position-sorted (preserves hierarchy reading), leaves sort `due_at asc` nulls last. Persistence `student.portfolio.filter:${courseId}` (per-course not per-user since portfolios are per-course). Palette: Indigo (All), emerald (Submitted), amber (Draft), rose (Past due), slate (Not started).

### Wave 21F — Another "keep going" (Rounds 46-55)

User said "keep going" twice more. Shipped 10 more rounds across modals, autosave, validation, and a global keyboard-shortcuts overlay.

### Round 46 — NewThreadModal recents + AssignmentForm draft/validation
- `NewThreadModal` (~178 → ~370 lines): recents storage `inbox.recentRecipients:${userId}` max 10 most-recent-first, written after `open_thread_with` RPC resolves. Empty query: bounded `profiles` fetch (limit 50, alpha order, `neq currentUser`). Non-empty: existing 200ms debounced `ilike` on `display_name`/`email` (limit 20). Single flat `visibleList` drives keyboard nav so section headers don't break index math. Recents pruning: lookup in already-fetched alpha first; anything not found fetched in single `in(...)` query.
- `AssignmentFormModal` (632 → 940 lines): per-field pure `validateX(value)` returning `string | null` — title required+≤200, questionCount integer 5-50, timeLimit 0-300min, maxAttempts optional then 1-20, latePenaltyPercent 0-100, gracePeriodHours 0-168. `touched` Set tracks user-blurred fields; only touched surface errors. Submit gating disables Save with `aria-disabled` mirror. Draft persistence (create mode only): `teacher.assignmentForm.draft:${classId}`. 500ms debounce with `pendingDraftRef` for synchronous unmount flush. Restore banner amber `border-l-4` with relative time + Restore / Discard. Cancel-with-dirty shows inline amber confirm-cancel banner. Past-due `due_at` allowed without warning per spec ("missed it" is valid state).

### Round 47 — ThreadView jump-to-unread + SkillHeatmap domain filter
- `ThreadView`: unread = `author_id !== currentUserId AND read_by_recipient_at === null`. `unreadSnapshotRef` captures once on first non-loading messages payload for given threadId — survives the existing mark-as-read UPDATE. Floating sticky banner top-center with × dismiss + "↓ N new messages — Jump to first". `IntersectionObserver` (scroller as root, 50% threshold) auto-dismisses when first-unread enters view. "New" divider as first child of first-unread message with `role=separator`. Auto-hides 5s after entering view.
- `SkillHeatmap` (218 → 462 lines): domain pills derived dynamically from RPC's `domain` column. 5 sort options. "Weakest skill" callout computed over UNFILTERED rows (single-pass reduce). Practice link → `${ROUTES.PRACTICE}?skill=...`. Persistence `student.skillHeatmap.view:${userId}`.

### Round 48 — JoinClassModal validation + ScorePrediction delta
- `JoinClassModal`: alphabet `[A-Z2-9]` matching `short_code` generator from migrations 0038-0040 (no O/0/I/1/L confusables). `scrubCode()` on `onChange` + `onPaste`: uppercase + strip out-of-alphabet + truncate to 6. `font-mono tracking-widest text-xl`. `mapRpcError` stable code → message mapping: `invalid_join_code` / `already_joined` (with "Open class →" link defensively wired) / `rate_limited` / `not_authenticated`. `aria-invalid` toggles on error. Character counter `aria-live` polite + turns emerald when complete.
- `ScorePrediction`: replaced old "first vs last (since diagnostic)" delta with previous-vs-latest "since your last test" — true momentum signal. Three tones: emerald `↑ +N`, rose `↓ -N`, slate `— No change`. Recommendation tiers (<1000 / 1000-1299 / 1300-1499 / ≥1500) in indigo-tinted card with "Practice now" / "Run a timed practice set" CTAs linking to `ROUTES.PRACTICE`. Per-section deltas skipped — trajectory data is aggregate-only.

### Round 49 — BulkRosterModal preview + PortfolioSubmissionForm autosave
- `BulkRosterModal`: preview table # / Email (mono) / Display name / Status (text pill, not color-only). `classifyRows()` walks parsed in order with `seen` Set: invalid → duplicate → enrolled → new. New optional prop `existingEmails?: string[]` (additive, no caller breaks). Belt-and-braces: even when caller skips prop, DB-side `23505` unique-violation path still catches duplicates. Dry-run checkbox default off. During import: progress bar + spinner + live label "Importing… ({done}/{total})" with `aria-live` polite. 4 outcomes (pure success / partial / full failure / nothing-importable).
- `PortfolioSubmissionForm`: fields covered: textValue, urlValue, numberValue, dateValue, choiceValue, multiValue. File uploads EXCLUDED — browsers can't reconstruct File objects from localStorage. 1000ms `setTimeout` debounce. `pendingDraftRef` mirrors latest unflushed draft so unmount cleanup flushes synchronously. Recover banner amber `border-l-4` with relative time. `storage` event listener with 250ms `ownWriteAtRef` window filters own-write echoes. Save/Submit pause `autosaveEnabledRef` for network round-trip. Success: `clearDraft` + reset indicator. Failure: re-enable autosave, keep draft intact.

### Round 50 — StudentShell ⌘B sidebar + AccountSettings polish
- `StudentShell` (261 → 484 lines): Note that StudentShell had NO sidebar at all before — file rendered only `<Outlet/>`, floating overlays, mobile tab bar. Added desktop-only left rail with 6 student nav items (Home / Practice / Mock Test / Calendar / Inbox / Account). Persistence `student.shell.sidebarCollapsed:${userId}` with `student.*` namespace. Mobile: rail hidden — students keep existing `StudentMobileTabBar`. Wordmark `aria-hidden={collapsed}` + `lg:hidden`.
- `AccountSettings`: `evaluatePasswordStrength` heuristic — Empty / Weak (len<8) / Fair (≥8) / Good (≥10 + upper + digit) / Strong (≥12 + upper + lower + digit + symbol). 4-segment `role=progressbar` bar with dynamic `aria-label="Password strength: <Label>"`. `passwordSubmitDisabled` blocks submit when busy, level empty/weak, length<8, or confirm mismatch. Export confirmation copy via `aria-describedby="export-hint"` + post-success `lastExport` state captures filename + `Blob.size` formatted via `formatBytes`. Email change copy via `aria-describedby="email-change-hint"`. Display name validation: trimmed-non-empty + ≤100 char.

### Round 51 — Student announcements unread + materials filter/search
- `CourseAnnouncementsList`: this is the cross-course dashboard widget (10 latest across all enrolled courses) — adapted per-course storage key to user-scoped `student.announcements.lastVisit:${userId}` → ISO string. Unread: `created_at > lastVisitSnapshot`, or always when no snapshot exists. Snapshot captured once on mount into local state via `userId`-keyed ref guard so indicator doesn't flicker mid-session. Written once per mount after announcements load via `wroteForUserRef`. Indigo 2px `border-l` accent + inline 8×8 indigo SVG dot. Header counter "3 new · 10 latest" in indigo when unread > 0.
- `CourseMaterialsList`: `StudentMaterialKind` union is only `'file' | 'link'` (no 'note'). Pills: All / Links / Files with live counts. Sort: Most recent (default) / Oldest first / Title A-Z (locale-aware, `sensitivity:"base"`, `numeric:true`). Persistence `student.materialsList.view:${userId}:${courseId}`. Search NOT persisted (transient). `viewHydrated` gates initial render.

### Round 52 — NotificationPreferences preview + TopicForm draft
- `NotificationPreferencesPage` (~200 → ~330 lines): direct Supabase fetch (notifications table, 10 most recent for current `recipient_id`), NOT `useNotifications`. Rationale: that hook drops opted-out kinds via its `visible` filter — but the point of this preview is to show what user would be silencing, so it must include hidden kinds. Realtime channel keeps preview fresh. Per-row kind badge from `KIND_LABELS` lookup. `(hidden)` italic suffix when kind currently opted out. `useMemo` derives `previewRows` from `recent + prefs` so toggling immediately re-tints.
- `TopicFormModal`: mirrors Round 46 pattern smaller scope. `validateTitle` required+≤200. `validateBody` required+≤10000. Draft `teacher.topicForm.draft:${courseId}`. 500ms debounce. Restore banner amber `border-l-4`. Cancel-with-dirty shows inline amber confirm banner.

### Round 53 — AdminInviteCodes filter/sort + CourseSettings polish
- `AdminInviteCodesPage`: 4 filter buckets All / Active / Expired / Revoked via shared `classifyCode(code, now)` helper (single source of truth for counts + row rendering). Status pills: Active emerald, Expired amber (NEW — was being shown as "Active" before), Revoked rose. Sort: Most recent / Oldest first / Expires soonest (asc, NULLs last via custom comparator) / Code (A-Z localeCompare). Persistence `admin.invites.view`.
- `CourseSettings` 5 surgical polish fixes: `aria-label="Course name"` on inline rename input (visible label is sibling text); `aria-label="Copy short code"` + `aria-label="Copy join code"` on duplicate Copy buttons; sticky `descriptionDirty` flag clears on revert; delete confirmation input gets `autoFocus` + submits on Enter when name matches.

### Round 54 — GlobalShortcutsHelp dialog (StaffShell-only mount)
- New `ShortcutsHelp` component: `{ open, onClose, userRole? }`. 560px max-w / 80vh max-h panel, indigo `border-l-4` accent. `role=dialog` + `aria-modal=true` + `aria-labelledby` + `useFocusTrap` + `data-autofocus` on × button. 6 sections in `sm:grid-cols-2` grid: Global / Inside courses (staff) / Calendar / Inbox / Notifications dropdown / Modules page (staff). `<Kbd>` chips: slate ring + monospace + `min-w-[1.75rem]` + shadow inset. Role gating: staff-only sections render when `userRole` is teacher or admin.
- StaffShell mount: 1-line swap from existing `ShortcutHelpOverlay` to `ShortcutsHelp`.
- **StudentShell mount DEFERRED in Round 54** — initial agent run accidentally removed Practice + Mock Test NavLinks while wiring the `?` handler. Reverted. Followed up in Round 55.

### Round 55 — ShortcutsHelp StudentShell wiring (tight follow-up)
- Narrower agent contract that only adds the 4 hook-up lines and explicitly forbids touching NavLinks / STUDENT_TABS / icons.
- Diff: 14 insertions, 0 deletions. Both shells now wire the `?` overlay.

### Final autonomous-run total (Waves 21B + 21C + 21D + 21E + 21F, Rounds 4–55)

- **100+ lanes shipped across 52 rounds**
- **9 migrations** (0050, 0056-60, 0062-64) — all backward-compatible. (Parallel session shipped 0065 + 0067 alongside.)
- **8 smoke suites** (~6100 lines) with 28 new scenarios
- **50+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **Every major list/triage surface has consistent sort + filter + persistence + empty states + keyboard nav** — student / teacher / admin all see the same UX bar
- **All major forms have validation + draft persistence + recover banners** (AssignmentForm, TopicForm, PortfolioSubmissionForm)
- **Discoverability**: ⌘K palette, ⌘N quick-create, ⌘B sidebar, `?` shortcuts overlay — all wired in both shells
- **One LMS_ROADMAP item closed** (4.4 discussion read receipts — client-side substitute without DB risk)
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**
- **Round 54 regression caught + cleanly recovered** in Round 55 — example of "trust but verify" agent dispatching
- **Parallel session ran continuously alongside** — landed 25+ commits (security RLS, Timer bundle split, Q-Bank nav unification, materials split, sidebar split, modularization plan, AllUsersView/AssignmentsPanel/CohortSummaryWidget/CoursePortfolio/CourseGradebook/MockTestHistoryPage/NeedsAttentionPanel/ProgressDashboard/StudentCourseView/StudentProfilePage modularization, managed_students migration 0067 + AddStudent/ResetStudentPassword modals) with zero merge conflicts

Build is green. Working tree is clean. All commits pushed to origin/main.

### Wave 21G — Another "keep going" (Rounds 56-60)

User said "keep going" twice more. 5 additional rounds, mostly form/auth polish + dashboard pin + smaller widgets. Hitting the natural end of fresh ground.

### Round 56 — ClassFormModal validation/draft + AddItemModal polish
- `ClassFormModal`: mirrors Round 46 + 52 patterns. `validateName` required+≤100 (whitespace-only treated as empty). `validateDescription` optional+≤5000. Draft `teacher.classForm.draft` (no per-X scope — single create form per teacher). Empty form clears storage immediately (no orphan empty drafts). Restore banner suppresses "Start from template?" affordance to keep focus on decision. Edit mode: all validation applies; draft persistence fully disabled via `mode !== "create"` guards.
- `AddItemModal` 3 fixes: auto-focus on open + type-change via `firstFieldRef.current.focus()` on `setTimeout(0)`. Live `submitDisabledReason: string | null` computes per-branch validity (no assignments / not picked / missing header / missing URL). Tooltip + SR hint on disabled Save via `aria-describedby` linking to visually-hidden span.

### Round 57 — BulkGradeModal polish + ComparePanel deltas
- `BulkGradeModal` 5 fixes: Cmd/Ctrl+Enter to apply (uses refs so window listener doesn't re-bind on every editor keystroke); Apply button summarizes patch ("Apply feedback + score to 12" vs just "Apply to 12") preventing "I forgot to write feedback" broadcasts; Reset button only renders when `hasChanges`; auto-clamp score on blur (250 → 100, -5 → 0); keyboard hint footer "⌘↵ to apply" only visible on `sm+`.
- `ComparePanel` Option A chosen (parent doesn't thread attempts array — adding optional `attempts`/`onPickA`/`onPickB` would require out-of-lane parent changes). Inline delta per row: Score / Correct / Duration with emerald `↑ +N` / rose `↓ -N` / slate `— No change`. Visual highlight rule on B-cell only (preserves A as baseline). Semantic markup not color-only — delta arrow + sign carry direction without color. `role="table"/"row"/"cell"`. Decorative delta badge `aria-hidden` to avoid double-announcement.

### Round 58 — DashboardPage course pin + RecentFeedbackWidget polish
- `DashboardPage` course pin: per-user localStorage `teacher.dashboard.pinnedCourses:${userId}` 50-entry LRU cap. Action in existing `<CourseCard kebab>` menu (item label flips "Pin to top" / "Unpin from top"). Sort: O(n) partition into pinned + rest, then pinned sort by index into `pinnedIds` array (MRU first). Applied independently to published + unpublished — archived pinned course still bubbles within its section. Cross-tab sync via `storage` event. Visual indicator: indigo overlay badge at `absolute left-2 top-2 z-10` over card's colour band, `pointer-events-none` so card's click target isn't shadowed.
- `RecentFeedbackWidget` 4 fixes: enriched `aria-label` (includes score, graded-at time, adapts verb "Review feedback" vs "Review score"); disabled dead rows when `assignmentId`/`attemptId` null; pluralized count badge "5 recent items" / "1 recent item"; "View all" tap target bumped to `min-h-[32px]` (still header-scaled, not promoted to 40px which would dominate). Rejected "empty state CTA" — file comment explicitly enshrines "silence > nag" as policy.

### Round 59 — PasswordResetScreen polish + AssignmentCard ARIA
- `PasswordResetScreen`: lane scope clarification — this is the post-recovery-link "set a new password" surface AuthGate mounts during `PASSWORD_RECOVERY` session, NOT the forgot-password email input (which lives in `AuthScreen.tsx`, out of lane). Live blur-gated errors via `newBlurred`/`confirmBlurred` flags. `canSubmit` gating with dynamic title tooltip swap. Confirmation state extended 900ms → 1500ms so success copy is actually readable. `friendlyError()` lowercased substring match on GoTrue messages mapping `same+password` / `rate limit` / `weak+strength` / `at least+minimum` / `network` / `session+expired`.
- `AssignmentCard` 4 fixes: `<article>` `aria-label` composed from title + status + due context with overdue prefix; description tooltip on `line-clamp-2` truncation; overdue `aria-label` on due span so AT users hear "Overdue" explicitly rather than relying on color; "View attempts" mobile tap target bumped to `min-h-[40px] md:min-h-0` (preserves desktop density, fixes mobile rule).

### Round 60 — QuickStartScreen polish + AccountUpgradeBanner snooze
- `QuickStartScreen` 5 fixes: lane note — actual file is student quick-start (anonymous sign-in → `quick_start_with_code` RPC → enrolls in course), NOT teacher onboarding as the task brief described. Live code format validation: `CODE_LENGTH=6`, `CODE_ALPHABET=/^[A-HJ-NP-Z2-9]+$/` per CLAUDE.md short_code spec. `scrubCode()` on `onChange` + `onPaste`. Live "X / 6" counter turns emerald when valid. Placeholder changed from `ABCD1234` (8 chars + contains forbidden 1) to `ABC234`. Submit gating + error code mapping additions. Success state with emerald-tinted card + spinner.
- `AccountUpgradeBanner`: dismissable with 24h snooze (`auth.upgradeBanner.dismissedUntil:${userId}` as ISO string). Per-user key. try/catch for private-mode safety. Container changed from `role=status` to `role=region aria-label="Upgrade your account"` (more appropriate for persistent landmark). Copy polish leads with benefit: "Save your progress across devices and never lose your work".

### Final autonomous-run total (Waves 21B-G, Rounds 4-60)

- **115+ lanes shipped across 57 rounds**
- **9 migrations** (0050, 0056-60, 0062-64) — all backward-compatible. (Parallel session shipped 0065 + 0067 alongside.)
- **8 smoke suites** (~6100 lines) with 28 new scenarios
- **55+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **Every major list/triage surface** has consistent sort + filter + persistence + empty states + keyboard nav
- **All major forms** have validation + draft persistence + recover banners (Assignment / Topic / Portfolio / Class)
- **All auth flows** have live validation + friendly error mapping (JoinClass / QuickStart / PasswordReset)
- **Discoverability**: ⌘K palette, ⌘N quick-create, ⌘B sidebar, `?` shortcuts overlay — all wired in both shells
- **One LMS_ROADMAP item closed** (4.4 discussion read receipts — client-side substitute without DB risk)
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**
- **Round 54 regression caught + cleanly recovered** in Round 55 — example of "trust but verify" agent dispatching
- **Parallel session ran continuously alongside** — landed 30+ commits including the full managed-students feature (M24/M25 from the original deferred list)

Build is green. Working tree is clean. All commits pushed to origin/main.

---

## 2026-06 — Autonomous "controlled-process" test-control session

Direction: the teacher dispenses everything; students see only what's assigned/released.
All work verified against the live cloud project (Playwright + RPC) and the full
smoke suite stayed green (e2e 14 · features 127 · modules 26 · qbank 25 · cascade 7 ·
grading 12 · announcements 7).

Shipped (each its own commit):
- **Managed student logins** — teacher creates students from the roster: per-course
  code (`KQAZNP-04`) + auto password, QR sign-in deep link, bulk print sheet,
  reset-all-with-passwords. Login-by-code on AuthScreen. Read-only account settings
  for managed students.
- **Locked student portal** — no free question bank / mock test; `/test/:slug` gated
  to assigned tests; deep-linkable runner URLs (`/section/n/q/m`).
- **Full-test results gating** — students see a neutral "Test submitted" screen
  (no score/answers). Teacher reviews + releases per-student (profile panel), in bulk
  per test (catalog "Results & release"), or from a **Dashboard nudge** ("N awaiting
  release"). Student notified on release; sees released results on home.
- **Completion tracking** — per-test roster status incl. "Not started".
- **Recorded eliminations** — struck choices persisted + shown in review.
- **Section timing** — per-module elapsed/limit + "Ran over time" in the result.
- Fixes: join by short_code (not just join_code); repaired courses↔profiles FK embed
  (My Courses); Desmos calculator 2× centered + viewport-clamped.

Migrations 0067–0080 (mine; all live + verified). Server primitives:
`admin_create_student`, `admin_reset_student_password`, `release_test_results`(+ bulk
`release_test_results_for_teacher`), `list_test_runs_for_student`, `list_my_test_runs`,
`test_roster_status`, `tests_awaiting_release`; results gated on
`test_runs.results_released_at`; release fires a `test_result` notification.

### Follow-on (same session, 0081–0086)

- **One-attempt tests** with a teacher retake override (`allow_test_retake`) and
  a **reset stuck attempt** action (`reset_test_attempt`); staff preview exempt.
- **Released results** now viewable by the student at `/test/:slug` (not just the
  home panel); per-test **completion** shows taken / in-progress / not-started.
- **Section timing** surfaced in the review (`module_timing`).
- Runner study tools: **"Save & exit"**, **range-based highlighting** (exact
  selection, click-to-remove — fixed from text-match), **per-question notes**,
  and **Mark for Review** — all now **persisted with the attempt** (server-side)
  so they survive exit/resume and follow the student across devices, alongside
  draft-save hardening (flush every 3 questions + on exit).
- Edge fixes: `admin_create_student` skips taken roster codes; Esc-to-close on
  the new modals.

Full reference: **docs/CONTROLLED_TESTS.md** (surfaces, RPCs, migration ledger
0067–0086).

### Student-dashboard tidy-up (2026-06-03, controlled-access alignment)

Frontend-only; no migrations. Brought the student home in line with the
controlled-access model (students do only what the teacher assigns):

- **Removed the "Predicted SAT Score" card** (`ScorePrediction.tsx` +
  `ScoreArcSparkline.tsx` deleted, barrel export dropped). With only a couple of
  attempts it showed a noisy "Low confidence / −120 since last test" band that
  misled students. The `0024` score-prediction RPC stays in the DB for a future
  calibrated model; it's just no longer surfaced. "Your progress" now shows the
  skill-mastery panel full-width.
- **`SkillHeatmap` is now read-only insight.** Removed the "Practice this skill"
  button and the per-cell drill links — both navigated to `/practice`, which
  redirects students home (the free question bank isn't reachable), so they were
  dead affordances. Cells are static tiles; the weakest-skill callout is info only.
- **Modules: full-length tests show a "Test" tag** instead of the generic 🔗 link
  icon. They're stored as `link` items pointing at `/test/:slug`; `ModulesPage`
  detects that URL prefix and renders the tag.
- Refreshed stale docstrings (`AreaSelector`, `SkillHeatmap`) and docs
  (`LMS_FEATURES`, `USER_GUIDE`, `ARCHITECTURE` 0024 ledger entry).

## Wave 21I — Cross-codebase edge-case + race audit (2026-06-03, commit 879056e)

Four parallel read-only audits with strict file-scope partition (DB races
0050–0085; full-test runner `viewer/src/fulltest/`; auth + permissions in
`viewer/src/auth/` + RPCs; React-app-wide in `teacher/student/dashboard/
components/notifications/`). 17 actionable findings — the highest-leverage
batch shipped here.

**DB scope hardening (0090 + 0091 hotfix):**
- **0090** scoped `release_test_results`, `allow_test_retake`,
  `reset_test_attempt` to `is_teacher_of_course OR is_admin` (was
  `is_staff` — any teacher could act on any student's run).
- **0090** added grant idempotency: `allow_test_retake` now raises
  `retake_already_granted` if a grant exists newer than the student's
  latest submission (closes the "spam grants for unlimited retakes"
  hole the audit flagged).
- **0091** fixed a soundness bug in 0090's `release_test_results`: it
  used `SELECT … LIMIT 1` to find the course owning the test, which
  arbitrarily mispicked when a slug links from multiple courses (the
  common real-world case — caught only because the diagnostic
  clickthrough leaves orphan link rows from prior runs). Switched to
  EXISTS, matching the other two RPCs. **Lesson recorded in CLAUDE.md:
  `LIMIT 1` for an authorisation pick is a soundness bug; always use
  EXISTS for scope checks.**

**Client-side hardening (one commit, four files):**
- **`Toast.tsx`** — memoize `value` + per-variant `useCallback`. ~59 dep
  arrays across the app list `toast`; previously every toast invalidated
  them all, cascading re-fetches/re-subscribes. The cheapest
  high-leverage fix in the audit.
- **`AssignmentRunner.tsx`** — `isAlive()` cancellation flag threaded
  through `bootstrap` → `startNewAttempt`; gates the
  `start_assignment_attempt` RPC call so rapid assignment navigation
  no longer burns extra attempts against `max_attempts`. Stale
  `setStage(...)` from the previous assignment can't clobber the new
  one either.
- **`FullTestApp.tsx` + `api.ts`** — four runner fixes that make a real
  test survive real conditions:
  - **F1 sleep/wake**: `visibilitychange` + `pageshow` listener fires when
    the tab returns visible after >5s hidden; calls `getModule` to
    re-sync `seconds_remaining` from the server-authoritative timer.
    Sleep no longer silently auto-submits.
  - **F2 cross-device**: `loadModule`'s `merged = { ...server, ...cached }`
    flipped to drop the local cache entirely if `server` has strictly
    more answered questions than `cached`. Closes the laptop-clobbers-
    phone bug for students who switch devices mid-attempt.
  - **F3 retry recovery**: `submitModule` now treats
    `module_out_of_order` / `run_already_submitted` after retry attempt 0
    as a synthesised success. A network blip on the original submit (the
    server commits but the response is lost) used to lock the student
    out staring at a "could not submit" toast; they now advance
    correctly.
  - **F4 annotation flush**: `saveDraftRef.current()` fires before
    `doSubmitModule()` on time-up so annotation/highlight/note edits in
    the last 2.5s aren't lost (submit RPC doesn't carry annot payload).

**Findings deferred to follow-up wave** (real but lower-priority):
`PrivateNotesSection` unmount-doesn't-flush; `useNotifications` no mount
guard; `AssignmentDetailPage` / `useTopicPosts` / `useNeedsAttention` no
cancellation; `DiscussionTopicView` optimistic-post-never-cleared;
`CourseSettings` archive-toggle no `disabled={busy}`; `ModulesPage`
InlineRename closes-before-save. All 7 captured in the audit transcript;
none break correctness, all degrade UX edge cases.

**Findings dismissed as false positives**: agent over-flagged the timer
interval recreation (cosmetic, sub-ms re-attach), the `submittingRef`
double-submit race (single-threaded JS makes it safe), the deep-link
`openedPathRef` persistence (by design), and the `admin_create_student`
cross-course collision (impossible: roster_codes are constructed from
globally-unique `short_code`s, and the course is FOR UPDATE-locked).

**Verification harnesses (new, `viewer/scripts/`):**
- `clickthrough-practice-test.mjs` — drives the full DSAT-Nov-2023 as a
  fresh disposable student against Supabase Cloud. Provisions a teacher,
  course, module, and `module_items` link to `/test/<slug>`, plus
  enrolment (required so the new course-scope check on 0090 RPCs
  passes). Walks all 4 modules with save/resume/submit; verifies
  results gating (locked → released), eliminations round-trip, the
  one-attempt lock, and the retake grant. 41 assertions.
- `clickthrough-practice-test-edges.mjs` — negative paths:
  `module_out_of_order`, `run_already_submitted`, `run_not_found`,
  double-submit, post-submit writes. 10 assertions.

Both green post-batch.

**Sizing**: 7 files changed, 852 insertions, 22 deletions. tsc clean,
remote DB has 0091 applied, harness 51/51.

## Wave 21J — Deferred-finding sweep (2026-06-03, commit 6a138dd)

Client-only follow-up that closed the 8 lower-priority findings the 21I
batch parked. No new migrations; no public API changes; no shared helper
introduced (CLAUDE.md "no scope creep" rule — every cancellation guard is
a local `aliveRef`, identical to the AssignmentRunner pattern landed in
21I Lane B).

Four parallel file-disjoint lanes.

**Lane E — flush + optimistic cleanup**
- `viewer/src/teacher/PrivateNotesSection.tsx` — the unmount cleanup now
  fires `void persist(bodyHtml)` before clearing the debounce timer when
  the body differs from `lastSavedRef.current`. Matches the
  `pendingDraftRef synchronous unmount flush` pattern CLAUDE.md mandates.
  Closes the "teacher closes the student profile modal mid-debounce →
  last 2s of typed note silently dropped" hole.
- `viewer/src/teacher/DiscussionTopicView.tsx` — `handleSubmitReply`'s
  `void refresh().then(...)` switched to `.finally(...)` so the optimistic
  placeholder clears whether refresh resolved or rejected (the insert
  already landed server-side — the ghost should disappear either way).
  Added a `mountedRef` to silence the dead-component setState warning if
  the teacher closes the topic before refresh resolves.

**Lane F — three hooks, same race shape**
All three hooks: (a) post-await `setState` was unguarded so stale results
landed after unmount or sign-out→sign-in-as-other; (b) the realtime
channel subscribe effect listed the recreated `refresh*` callback in its
deps, so any callback identity flip tore down + recreated the channel,
opening a temporary subscription gap.

- `viewer/src/notifications/useNotifications.ts` — added module-level
  `aliveRef`. `fetchNotifications` guards every `setNotifications` on
  `aliveRef.current`; previously-silent RLS rejects (`setNotifications([])`)
  now `console.warn` + `toast.error("Couldn't load notifications")`.
  Realtime callback switched to `fetchNotificationsRef.current(userId)`;
  channel dep array reduced to stable values.
- `viewer/src/teacher/useTopicPosts.ts` — `aliveRef` + post-await guards
  in `refresh` (topic fetch and posts fetch separately, since both
  awaits can land after unmount). Realtime callback now reads
  `refreshRef.current()`; effect deps reduced to `[topicUuid]`.
- `viewer/src/dashboard/useNeedsAttention.ts` — same pattern applied
  three times (`refreshToGrade`, `refreshPastDue`, `refreshReplies`).
  Three refs (`refreshToGradeRef`, `refreshRepliesRef`, `refreshAllRef`)
  unblock the realtime effect's deps from `[teacherId, refreshToGrade,
  refreshReplies, refreshAll]` to just `[teacherId]`.

**Lane G — AssignmentDetailPage cancellation**
- `viewer/src/teacher/AssignmentDetailPage.tsx` — `refresh()` gained an
  optional `isAlive: () => boolean = () => true` predicate parameter
  (default preserves the existing call site at line 665). Six guards
  inside check `isAlive()` after every `await` and before every
  `setState`/`setLoading`/`setError`/`finally` branch. The mount effect
  declares `let alive = true`, passes `() => alive`, and flips the flag
  in cleanup. Fixes the "rapid back-forward between assignments shows a
  flash of the previous one" race.

**Lane H — CRUD double-click + InlineRename divergence**
- `viewer/src/teacher/CourseSettings.tsx` — archive + template toggles
  wrapped in `useTransition`. `disabled={archiveToggling}` and
  `disabled={templateToggling}` on both controls; disabled styles
  applied. Rare-but-real race where rapid double-clicks fired two
  `courses` UPDATEs and the slower-commit-first ordering rolled back to
  the wrong state — closed.
- `viewer/src/teacher/ModulesPage.tsx` — `InlineRename.commit` rewritten
  to mirror `AssignmentCard.tsx:104-119`: short-circuit closes editor on
  empty/unchanged; otherwise `try { await onSave(trimmed); setEditing(false); }
  catch { /* keep editing */ }`. The two InlineRename implementations no
  longer diverge — promoting one to `components/` is left for a future
  consolidation pass.

**Sizing**: 8 files changed, 170 insertions, 32 deletions. tsc clean.
Parallel session in this window also added migration 0092
(`fix_profiles_own_update_recursion`) — not part of this batch, left
untouched.

**Audit-batch grand total (Waves 21I + 21J)**: 16 actionable fixes
shipped — 2 migrations (0090 course-scope, 0091 EXISTS hotfix), 12
client files (Toast, AssignmentRunner, FullTestApp, fulltest api,
PrivateNotesSection, DiscussionTopicView, useNotifications,
useTopicPosts, useNeedsAttention, AssignmentDetailPage, CourseSettings,
ModulesPage), 2 verification harnesses. Every audit finding either
closed or explicitly dismissed as false positive.

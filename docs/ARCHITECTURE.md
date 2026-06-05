# ARCHITECTURE

Canonical design specification for the CB Educator Question Bank LMS. This document is the rubric an auditor will use to judge whether any new file, migration, or component conforms to the codebase's established conventions. Every claim below is **observable** — it can be checked by reading a specific file, running `grep`, or inspecting a migration.

---

## 1. Overview

A small SAT-style LMS layered on an existing question-bank viewer. Stack: **React 19 + Vite 8 + TypeScript ~6.0 + Tailwind 3.4 + Supabase Cloud** (PostgreSQL 15+). No API server — the client talks directly to Supabase, with access enforced by RLS and `SECURITY DEFINER` helpers; multi-row or privileged writes go through RPCs. Two scheduled edge functions run via `pg_cron` (see §4). Two-operator ops scale today, but the schema and module layout are designed so multi-tenant can land without a rewrite. Dependencies are deliberately thin: `@supabase/supabase-js`, `qrcode.react`, React, and `react-router-dom` v7. No global state library, no UI library.

---

## 2. Module boundaries

Top-level folders under `viewer/src/` and what they own:

| Folder | Owns |
|---|---|
| `auth/` | Auth flows (`session.ts`), the role-aware orchestrator (`AuthGate.tsx`), sign-in / sign-up / quick-start / password-reset screens, `AccountSettings` + `AccountRoutes` (replaces the old `settings/`), staff/student shells, upgrade modal/banner, `StudentBadge` overlay. |
| `lib/` | Pure singletons + helpers: `supabase.ts` (sole Supabase client), `routes.ts` (path constants + builders), `profile.ts` (`useProfile`), `attemptReview.ts`, `designTokens.ts` / `designSystem.ts`, legacy question-bank utilities. |
| `dashboard/` | Staff Dashboard (`/dashboard`) — course-cards grid fronting the staff shell. Replaces the old "console as a single screen" surface. |
| `calendar/` | `/calendar` route with Month and List views over assignments + announcements. |
| `inbox/` | DM threads: list, thread view, new-thread modal, `useThreads` / `useThreadMessages`. |
| `notifications/` | Bell icon, `useNotifications`, realtime subscription to the per-user notification stream. |
| `teacher/` | Staff UI inside a course: course shell (`ClassLayout` — name kept for import stability), Overview, Roster, Settings, Modules, Assignments, Gradebook, Announcements, Materials, Portfolio, Discussions (+ topic view), colocated hooks and form modals (assignment, module, announcement, material, portfolio item, topic, bulk-roster, duplicate-course, generic confirm). |
| `student/` | Student UI: join-class modal, my-classes, assignments panel, assignment runner, attempt review, course-scoped announcements/materials lists, portfolio + submission form, score prediction, skill heatmap, colocated hooks. |
| `admin/` | Admin pages: `AdminUsersPage`, `AdminInvitesPage` (+ older `AdminInviteCodesPage`), `AdminAuditPage`, `AdminStatsPage`, `AllClassesView`, `AllUsersView`, `SystemStats`, `AdminClassDetail`. The legacy `AdminShell` tab strip is gone — pages route individually under `/account/admin/*`. |
| `mocktest/` | Timed runner (`MockTestApp`), unified `TestQuestion` type, pluggable sources, rendering subcomponents. Used by both free practice and assignment mode. |
| `components/`, `hooks/` | **Legacy** — predate the LMS work. Do not extend. New cross-cutting code goes in `lib/`. |

### No-cross-imports rule

Dependency direction is one-way: role folders depend on infrastructure, never on each other. `auth/AuthGate.tsx` is the single point that wires role surfaces together.

| Folder | May import from | Notes |
|---|---|---|
| `lib/` | React, `@supabase/supabase-js` | imports nothing else |
| `auth/` | every other LMS folder | the only orchestrator |
| `dashboard/` | `lib/`, `teacher/` (course-card primitives) | staff-only |
| `calendar/` | `lib/`, `teacher/`, `student/` (read-only hooks) | both roles |
| `inbox/`, `notifications/` | `lib/` only | leaf modules |
| `teacher/` | `lib/`, `mocktest/` (attempt review) | must not import sibling role folders |
| `student/` | `lib/`, `mocktest/` | must not import sibling role folders |
| `admin/` | `lib/` | must not import other role folders or `mocktest/` |
| `mocktest/` | `lib/` | must not import role folders or `auth/` |
| `components/`, `hooks/` | legacy — read-mostly; do not extend | — |

**Rule of thumb**: role folders never import each other; cross-cutting goes through `lib/`; `auth/` is the single integrator that wires them all together.

**Known violation, intentionally tolerated**: `student/useStudentAssignments.ts` imports `Assignment*` types from `teacher/useAssignments.ts`. The audit should flag this as a candidate for promotion to `lib/`, not treat it as canonical.

---

## 3. The Supabase layer

### 3a. Migrations

Live in `supabase/migrations/`, named `000N_snake_case_description.sql`, applied via `supabase db push` against the linked cloud project. Every file:

- Opens with a `-- =====` header block (`Migration:`, `Description:`, `Platform:`).
- Uses `-- === SECTION N: NAME ===` banners.
- Is **idempotent**: `CREATE TABLE/INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` before every `CREATE POLICY`.
- **ENUMs are deliberately NOT `IF NOT EXISTS`** — duplicate creation must fail loudly to signal collision.
- **Every policy carries a `-- Why:` comment** in plain English.
- Pure SQL — no client commands, no external-state assumptions.

### 3b. RLS pattern

- **All `public.*` tables enable RLS**.
- **Access logic centralised in `SECURITY DEFINER` helper functions** (STABLE, `SET search_path = public, auth`). Canonical: `is_admin`, `is_staff` (0009), `is_teacher_of_class`, `is_student_in_class` / `is_student_in_course` (0028 alias).
- **Policies call helpers** rather than inlining `EXISTS` against `profiles`. Inline `EXISTS` against per-row tables (e.g. `course_memberships`) is fine where the pair varies — see `0004_assignments.sql` lines 144–149 for the documented case. **Inlining against `profiles` is forbidden** (Rule 2).
- **`auth.uid()` is always wrapped as `(SELECT auth.uid())`** per Supabase performance guidance.
- **No policy reads `current_setting('request.jwt.claims', ...)`**. Identity is `auth.uid()` + helpers; roles come from `public.profiles`, never JWT metadata.

### 3c. RPCs

- **Every multi-row write or privileged action goes through an RPC**, never a direct client `INSERT`/`UPDATE`. Examples: `join_class_by_code`, `quick_start_with_code`, `redeem_teacher_invite`, `mint_teacher_invite`, `revoke_teacher_invite`, `open_thread_with`, `claim_student_seat`, `decide_seat_claim_request`, score-prediction, GDPR delete.
- **`SECURITY DEFINER`, `LANGUAGE plpgsql`, `SET search_path = public, auth`**.
- **Gating inside the function body**: check `auth.uid() IS NOT NULL` first, then re-check role / ownership (`is_admin(v_uid)`, etc.).
- **Stable string error codes** via `RAISE EXCEPTION '<code>' USING …`. Catalogue includes `not_authenticated`, `invalid_join_code`, `invalid_invite_code`, `already_elevated`, `profile_not_found`, `not_admin`, `code_already_exists`, `admin_already_exists`, plus the `*_format` / `*_length` validation set. Clients switch on these strings (`mapRedeemError` in `session.ts`, `friendlyError` in `JoinClassModal.tsx`).
- **Returns the affected row or a small `RETURNS TABLE(...)`** — never `void`.
- **Grants are explicit and minimal**: `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;`. Exception: `bootstrap_first_admin` — service_role only.

### 3d. Direct table operations

Simple selects, and inserts that fit cleanly within RLS, go directly via `supabase.from('table').select(...)` / `.insert(...)`. Rule: if RLS alone enforces the invariant, no RPC is needed. See `ClassFormModal.tsx` — course create/update uses direct `from('courses')` with a join-code retry loop on PG error `23505`. Enrollment goes through the RPC because join-code validation isn't expressible in RLS alone.

### 3e. Migration ledger

Currently `0001` → `0064`. Numbers are strictly sequential; gaps are forbidden.

**Foundation (0001–0010)** — schema, RLS, helpers, cross-staff parity.
- `0001_init` — identity, classes, memberships, RLS, foundational helpers (`is_admin`, `is_teacher_of_class`, `is_student_in_class`), `handle_new_auth_user` trigger.
- `0002_join_class_rpc` — `join_class_by_code` + tightened class-insert policy.
- `0003_quick_start_rpc` — `quick_start_with_code` powering the anonymous onboarding screen.
- `0004_assignments` — `assignments`, `assignment_attempts`, `source_id IN ('cb','sat','mixed')` CHECK matching the TS `TestSourceId` union.
- `0005_teacher_invites` — invite codes + redemption ledger + `bootstrap_first_admin` (service_role only).
- `0006_admin_rpcs` — admin-only RPCs powering the admin surface.
- `0007_teacher_workflows` — `regenerate_class_join_code`.
- `0008_fix_classes_insert_recursion` — smoke-caught: `profiles` INSERT policy recursing through itself (see Rule 2).
- `0009_is_staff` — single `is_staff(uid)` helper collapsing admin/teacher gating.
- `0010_cross_staff_writes` — cross-staff write parity.

**Features (0011–0017)** — content surfaces.
- `0011_modules` — Canvas-style Modules + `module_items`.
- `0012_rename_courses` — `classes` → `courses`, `class_memberships` → `course_memberships`.
- `0013_refix_courses_insert_recursion` — rename regression on the INSERT policy from 0008.
- `0014_attempt_snapshot` — attempts snapshot the exact question set (closes the teacher-trust gap).
- `0015_announcements` — `course_announcements`.
- `0016_materials` — `course_materials` (uploads + link pastes).
- `0017_portfolio` — `portfolio_items` + `portfolio_submissions` (UNIQUE per `(item_id, student_id)`).

**Hardening (0018–0023)** — clone/templates, hotfixes, multi-attempts, rate limit, audit, GDPR/mastery.
- `0018_course_clone` — `is_template` flag + duplication RPC.
- `0019_smoke_fixes` — smoke bundle; includes the Wave-1D trigger-body regression (Rule 4).
- `0020_multi_attempts` — N-attempt support on assignments.
- `0021_rate_limit` — per-user rate-limit ledger + helper for high-traffic RPCs.
- `0022_audit_log` — `audit_events` (role changes, invite mints, course deletes, etc.).
- `0023_gdpr_dedup` — GDPR hard-delete RPC + `reminder_log` dedup table.

**Communication (0024–0029)** — analytics, discussions, inbox, audit gaps, helper cleanup, notifications.
- `0024_mastery_predictions` — per-skill mastery rollups (`my_skill_mastery`, feeds the read-only student `SkillHeatmap`) + SAT score-prediction RPC. The score-prediction RPC is **no longer surfaced** in the UI (the `ScorePrediction` card was removed 2026-06-03; low-data band misled students) — RPC retained for a future calibrated model.
- `0025_discussions` — `course_topics` + `course_topic_posts`.
- `0026_inbox` — `message_threads`, `messages`, `open_thread_with` RPC, thread-bump trigger.
- `0027_audit_more` — additional audit events surfaced by Wave 6.
- `0028_helper_cleanup` — `is_student_in_course` forward alias; `SECURITY DEFINER` fix on audit_course_delete trigger.
- `0029_notifications` — per-user notification stream powering `notifications/`.

**Operations (0030–0032)** — trigger fixes, pg_cron, anonymous trigger fix.
- `0030_fix_thread_bump` — `bump_thread_last_message` switched to `SECURITY DEFINER` so the cross-table UPDATE survives caller-role RLS (Rule 1).
- `0031_cron_schedules` — `pg_cron` + `pg_net` schedules for the two edge functions.
- `0032_anon_profile_trigger` — `handle_new_auth_user` now handles anonymous users (NULL `auth.users.email`); see Rule 5.

**Trees + scoring + short codes (0033–0041)** — adaptive scoring, tree DnD, short-code URLs.
- `0033_modules_v2` — module-item enhancements (lock-until, header type).
- `0034_modules_tree` — module → module nesting + `prevent_module_cycle` trigger.
- `0035_portfolio_tree` — portfolio nesting + cycle prevention.
- `0036_tree_clone_fixes` — clone respects tree structure.
- `0037_sat_scoring_v2` — adaptive Module 2 routing + scaled-score table per section.
- `0038_course_short_codes` — 6-char `short_code` on courses + unique constraint + trigger.
- `0039_assignment_short_codes` — same for assignments.
- `0040_discussion_short_codes` — same for discussion topics.
- `0041_short_code_alphabet_check` — CHECK constraint locking the confusable-free alphabet (A-Z, 2-9).

**Test attempts + QBank assignments (0042–0047)** — test-runner persistence + question-bank assignment kind + idempotency.
- `0042_test_attempts` — `test_attempts` table for free-mode mock test persistence (note: FK references `auth.users`; project norm is `profiles` — flagged in 0050).
- `0043_test_answer_timing` — per-question time tracking.
- `0044_highlights_notes` — student highlights + sticky notes inside the runner.
- `0045_qbank_assignments` — `assignments.kind IN ('mocktest','qbank_set')` discriminator + cross-column CHECK + `qbank_set_uid` / `qbank_set_label` columns.
- `0046_qbank_resilience` — staged-submission table + `submit_qbank_attempt` RPC with `client_attempt_id` idempotency.
- `0047_qbank_log_autonomous` — split logging off the failure path into `log_qbank_failure` RPC so a rolled-back transaction doesn't lose the audit row.

**Full tests + seed + security audit (0048–0050)** — full-length tests, real CB seed, May-2026 security fixes.
- `0048_full_tests` — full-length test bundle support.
- `0049_seed_dsat_nov_2023` — official DSAT Nov-2023 seed data.
- `0050_security_audit_cascade` — **B1 fix**: `admin_delete_user` gated on `is_admin` (was `is_staff` — privilege escalation). **B2 fix**: `BEFORE DELETE` audit trigger on `profiles` snapshots dependent-row counts (8 tables) into `audit_events` before any cascade fires — observational, doesn't block. **M32 fix**: 3 audit triggers from 0027 re-declared with `SET search_path = public, auth`. **M33 fix**: `test_attempts.client_attempt_id` + partial unique index for idempotency (FK swap deferred, documented in-file).

**Wave-21 follow-ups (0051–0059)** — hardening + grading + broadcast + grading-surface roundup.
- `0051_full_test_hardening` — proctored full-test fortification: per-module elapsed-seconds + timed-out flag stamped to `test_runs.module_timing`; new `save_test_progress()` RPC persists in-progress drafts server-side so resume rehydrates on any device.
- `0052_fix_m3q16_typo` / `0053_fix_m1q13_choice` — content data fixes.
- `0054_announcement_publish_at` — M2 fix: `course_announcements.publish_at` nullable + composite index `(course_id, publish_at)`. AnnouncementFormModal now accepts `targetCourseIds: string[]` for broadcast and a `SmartDatePicker` for scheduled publish. Student-side reads filter via `.or('publish_at.is.null,publish_at.lte.<now>')`; teachers see a "Scheduled · {relative}" badge on their own queued rows. Fan-out at publish-time landed separately in 0058.
- `0055_grid_numeric_grading` — grid layout numeric-grading prep work.
- `0056_grading_persistence` — M6 fix (NOT 0053 as some Wave-20 notes had it; see header for the correction): adds `feedback_text` / `score_override` / `graded_at` / `grader_id` columns to `assignment_attempts`; new teacher-UPDATE RLS policy mirroring the existing teacher-read EXISTS-join; `audit_assignment_grade` AFTER-UPDATE trigger; `assignment_attempts_effective` view exposing `COALESCE(score_override, score_percent) AS effective_score`.
- `0057_best_attempts_by_effective_score` — M127 follow-up: the `assignment_best_attempts` view (from 0020) now orders by `COALESCE(score_override, score_percent) DESC NULLS LAST` so a teacher's override actually wins the "best" pick. Also exposes a new `effective_score` column so callers (CourseGradebook) can drop their second round-trip.
- `0058_scheduled_announcement_fanout` — closes the M2 publish-time notification gap. Adds `course_announcements.notifications_fanout_at` + `fanout_due_announcements()` plpgsql + `pg_cron` schedule (`* * * * *`). The existing immediate-publish trigger from 0029 gets a `WHEN publish_at IS NULL` guard so scheduled rows don't double-notify at INSERT time. `FOR UPDATE SKIP LOCKED` + partial index keeps the worker cheap.
- `0059_grade_complete_notification` — closes the M6 student-pull loop: `trg_notify_on_grade` AFTER UPDATE on `assignment_attempts` fires a `kind='assignment_grade'` notification when graded_at flips null → non-null, feedback_text flips null → non-null, OR score_override changes. Anti-spam: the null-guards mean autosave thrash doesn't fire repeatedly; only a meaningful state transition counts.
- `0060_test_attempts_fk_profiles` — M33 follow-up: `test_attempts.user_id` FK swapped from `auth.users(id)` to `public.profiles(id)` to match project convention. Uses the live-table-safe DROP + ADD NOT VALID + VALIDATE pattern so the lock window is minimal. The 0001/0032 `handle_new_auth_user` trigger guarantees every auth user has a profile row, so VALIDATE succeeds on existing rows. ON DELETE CASCADE preserved; the 0050 B2 audit trigger on profiles still fires before any cascade.

**Wave-21C autonomous run (0062–0064)** — teacher private notes + portfolio template import.
- `0061_start_test_answered_count` — content / scoring delta (not from this autonomous run).
- `0062_teacher_student_notes` — `teacher_student_notes(id, teacher_id, student_id, course_id, body, created_at, updated_at)` with unique `(teacher_id, student_id, course_id)`. RLS scoped to author (admins audit-only via `is_admin`). `set_updated_at` trigger reuse + new `audit_teacher_student_note_change` AFTER UPDATE OR DELETE trigger (logs op + ids; body intentionally excluded for privacy even from admin readers of `audit_events`).
- `0063_portfolio_import` — `import_portfolio_items(p_source_template_id uuid, p_target_template_id uuid, p_item_ids uuid[])` RPC. Recursive CTE deep-clones items + descendants. Two-pass clone: pass 1 inserts each row with `parent_item_id = NULL` (or target_parent in 0064); pass 2 rewrites parent_id via the in-flight `(old_id → new_id)` map. Auth: caller must teach both source AND target courses. Stable error codes: `not_authenticated`, `not_authorized`, `same_template`, `source_not_found`, `target_not_found`. Audit logs op + counts + ids but NOT item bodies.
- `0064_portfolio_import_anchor` — extends 0063 with optional 4th arg `p_target_parent_id uuid DEFAULT NULL`. When non-NULL, validates anchor belongs to target template (`parent_not_in_target_template`); cloned roots get `parent_item_id = p_target_parent_id`. Position math uses `max(position) WHERE parent_item_id IS NOT DISTINCT FROM anchor`. Audit payload conditionally includes `target_parent_id`. Old 3-arg overload dropped to avoid PostgREST signature ambiguity; backward compat preserved via the new arg's DEFAULT NULL.

> **0065–0094 are tracked in the authoritative ledger `docs/MIGRATIONS.md`** (this §3e narrative was not backfilled for that range). The seat-claim + code-usage work below is summarized here because it adds tables/RPCs the auth + roster sections reference.

**Seat claiming + code usage (0095–0097)** — student-owned login + redemption tracking.
- `0095_claim_student_seat` / `0096_fix_claim_seat_status_ambiguity` — `profiles.claimed_at` + `seat_claim_requests` table + `claim_student_seat(p_code, p_email, p_password)` (first claim takes over a managed seat: swaps the synthetic `<code>@students.local` email → the student's real email, sets the chosen password via pgcrypto, keeps `display_name` + all work; an already-claimed seat files an approval request) + `decide_seat_claim_request(p_request_id, p_approve)` (teacher-of-course/admin; approve = credential recovery on the same seat, deny = drop). Both SECURITY DEFINER, `search_path = public, auth, extensions`. Stable codes: `not_authenticated`, `seat_not_found`, `weak_password`, `invalid_email`, `email_in_use`, `not_authorized`, `not_found`, `already_decided`. 0096 fixed an OUT-column-vs-table `status` ambiguity (qualified the column in a table-qualified UPDATE-then-INSERT, race-safe via `unique_violation` fallback).
- `0097_code_redemptions_log` — append-only `code_redemptions` (`student_id ON DELETE SET NULL` + `name`/`email` snapshots so the tally survives student removal; RLS course-staff read). `join_course_by_code` + `quick_start_with_code` (0070 bodies verbatim) append a row on first join, FOUND-gated past `ON CONFLICT DO NOTHING` so idempotent re-calls don't inflate (`method` = `'join'` | `'quick_start'`). Per-seat personal-code usage stays tracked by `profiles.claimed_at`, not here.

---

## 4. Edge functions + scheduled operations

The project ships **two** Supabase Edge Functions, both deployed and live:

| Function | Endpoint | Trigger | Purpose |
|---|---|---|---|
| `assignment-due-reminders` | `/functions/v1/assignment-due-reminders` | hourly pg_cron | Iterates assignments due in the next 24h, sends a Resend email to each enrolled-but-not-attempted student. Dedups via `reminder_log` (0023). Reads `CRON_TOKEN` from secrets. |
| `cleanup-anon-users` | `/functions/v1/cleanup-anon-users` | daily 03:00 UTC pg_cron | Deletes `is_anonymous = true` auth users older than `CLEANUP_DAYS` (default 14). Reads `CLEANUP_TOKEN`. |

**Four `pg_cron` jobs** are installed by `0031_cron_schedules.sql`: `assignment-due-reminders-hourly`, `cleanup-anon-users-daily`, `prune-reminder-log-weekly`, `prune-rate-limits-weekly` (the last two prune their respective ledgers from 0023 / 0021).

**Hard requirements (conformance gates):**
- `pg_cron` and `pg_net` must be enabled (Dashboard → Database → Extensions) before `0031` is pushed; otherwise the migration fails loudly.
- `CRON_TOKEN` and `CLEANUP_TOKEN` must be set as Supabase secrets matching the functions' `serve(...)` checks.
- **Resend SMTP** is wired as the project's mail transport.
- **Anonymous auth is ENABLED**. Any change to the `handle_new_auth_user` trigger must keep the anonymous path working (Rule 3 + Rule 5).

When adding a new scheduled task: write the function under `supabase/functions/<name>/`, deploy it, then add a sibling `cron.schedule` block in a new sequential migration. Do not edit `0031` after the fact.

---

## 5. The client layer

### 5a. Singletons

`viewer/src/lib/supabase.ts` is the **only** module that calls `createClient()` (verifiable: `grep -rn 'createClient' viewer/src` returns exactly one hit). Every other file imports `{ supabase }` from `../lib/supabase`. The module throws at import time when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing — fail fast.

### 5b. Hook conventions

- **File name**: `useFooBar.ts` exporting a single same-named hook.
- **Colocation**: feature-specific hooks in the feature folder; cross-cutting in `lib/`. Never in legacy `hooks/`.
- **Standard return shape**: `{ data, loading, error, refresh }` — `data` is `T[]` or `T | null` (never `undefined`), `error: string | null`, `refresh: () => Promise<void>`. A matching `interface UseFooBar` is exported.
- **`error` is `string | null`**, not `Error | null`. Sole exception: `components/ErrorBoundary.tsx` (React class component).
- **Realtime where it pays off**. `useTeacherClasses` subscribes to `postgres_changes` on `public.courses` (channel still named `teacher-classes:<teacherId>` for backward compat); `useNotifications`, `useThreads`, `useThreadMessages` follow the same pattern. Always clean up via `supabase.removeChannel(channel)`.

### 5c. Component conventions

- **Function components only**. No `React.FC`.
- **Props as a named `interface FooProps`** above the component. Nested helpers follow the same rule.
- **JSDoc header on every file**: 4–12 lines describing role and non-obvious choices. Canonical: `TeacherConsole`, `MyClassesPanel`, `useTeacherClasses`, `session.ts`, `MockTestApp`.
- **Tailwind class strings inline**. No CSS modules, styled-components, or `clsx`.
- **Design tokens** (verifiable across all LMS files):
  - **Indigo** — primary action, brand, focus rings. **Violet** — secondary, used in indigo→violet gradients on welcome cards.
  - **Emerald** — success / teacher accent. **Rose** — destructive, errors.
  - **Slate** — neutral text/surfaces; dark mode pairs `slate-100`↔`slate-900`, `slate-200`↔`slate-700/800`.
  - **Landing gradients**: `from-slate-50 via-indigo-50 to-sky-100` (light) / `from-slate-950 via-slate-900 to-indigo-950` (dark).
- **Modals follow `ClassFormModal.tsx`** — `role="dialog" aria-modal="true"`, the standard overlay/card classes, backdrop-click + Escape close, initial focus via `setTimeout(…, 0)` to an input ref. `JoinClassModal`, `ConfirmLeaveDialog`, `AssignmentFormModal`, `AnnouncementFormModal`, `AddMaterialModal`, `AddModuleModal`/`EditModuleModal`, `TopicFormModal`, `PortfolioItemFormModal`, `BulkRosterModal`, `DuplicateCourseModal`, and `ConfirmDialog` all match the same skeleton.
- **Icons**: inline `<svg>` or unicode glyphs (`→`, `·`). No icon library — verifiable in `package.json`.
- **No emojis in UI text**.

### 5d. State management

- **Persistent state** lives in Supabase or `localStorage`. Cross-tab sync via the `storage` event where needed.
- **Ephemeral state** is `useState` / `useReducer`. **No global store** (Redux, Zustand, Jotai). React Context is used narrowly, not as a store.
- **`localStorage` keys are namespaced** as `<area>.<purpose>:<userId>`: `student.area:<userId>` (chosen study area), `mocktest.session:<userId>` (free-practice snapshot). New keys must be documented here when added.

### 5e. Routing

- **`react-router-dom` v7** is the only routing dep. `<BrowserRouter>` wraps the app in `main.tsx`; `AuthGate.tsx` owns the route table and gates by role.
- **Single source of truth for paths is `viewer/src/lib/routes.ts`**. The `ROUTES` constant holds every template; `buildPath(template, params)` materializes URLs (e.g. `coursePath(courseId)`, `inboxThreadPath(threadId)`). Never string-template a URL at a callsite. The pre-rename `class*` helpers are kept as aliases of the `course*` builders until the migration completes.
- **Top-level route table** (declared inside `AuthGate.tsx`):
  - Unauthenticated: `/signin`, `/quick-start`; everything else redirects to `/signin` (or `/quick-start` if the URL carried a `?code=`). The Supabase `PASSWORD_RECOVERY` event renders `PasswordResetScreen` and wins over every other route.
  - Authenticated student: `/` → `AreaSelector`; `/practice`, `/mock-test`, `/assignment/:id/take`, `/assignment/:id/review/:attemptId`, `/calendar`, `/inbox[/:threadId]`, `/account/*` (alias `/settings/*` → `AccountRoutes`).
  - Authenticated staff: `/` → `/dashboard` (alias `/console`); `/dashboard` (course-cards grid), `/courses` (alias `/classes`), `/calendar`, `/inbox[/...]`, `/account/admin/{users,invites,audit,stats}`, all rendered inside `StaffShell`. `/courses/:courseId/*` → `ClassLayout` with nested tabs (overview, modules, assignments, people, announcements, materials, grades, portfolio, discussions, settings). `/account/*` → `AccountRoutes`.
- **Per-role gating happens inside `AuthGate`**: it picks `StudentRoutes` vs `StaffRoutes` after profile load. Unauthorized URLs collapse to the role's catch-all redirect.
- **In-app navigation uses `useNavigate()` / `<Link>` / `<NavLink>`** — never `window.location` or hash mutations. The legacy `#account` hash listener is gone.
- **Local UI state** (modals, form values) stays in `useState` — only navigation moved to the URL. Nested routes (e.g. `AccountRoutes`) live in the page component.
- **Deeplinks** use URL `?code=` and `#code=` params, read by `getPrefillCode()` in `AuthGate`. After session lands, the param is stripped via `window.history.replaceState`.
- **Production deploys** must serve `index.html` for unknown paths (SPA fallback). Vite dev does this; Vercel/Cloudflare/Netlify need their own rewrite config.

### 5f. Error handling

- **All `catch` blocks declare `error: unknown`** and narrow with `instanceof Error`. Per-file `getErrorMessage(error: unknown): string` returns `error.message` for `Error`, the string for strings, and a per-context fallback otherwise.
- **Supabase / RPC errors are mapped to friendly copy at the UI boundary**. Raw error codes never reach the user (`friendlyError` in `JoinClassModal`, `mapRedeemError` in `session.ts`).
- **Loading**: short inline placeholder, no spinner library. **Errors**: inline rose block with `role="alert"`, scoped to the failing section. Retry is a button, not an automatic reload.

---

## 6. Auth + identity

- **Single source of truth for session**: `supabase.auth.getSession()` + `onAuthStateChange()`, wrapped in `useStudentSession()` (`auth/session.ts`). No other module subscribes to auth state directly.
- **Profile is canonical for role**: `useProfile()` reads `public.profiles`. Downstream code reads `profile.role`, **never** `user.user_metadata.role`. The `handle_new_auth_user` trigger copies metadata at signup; thereafter the profile is the truth.
- **Anonymous quick-start is a real `auth.users` row** with `is_anonymous = true`. Client calls `signInAnonymously()` then `quick_start_with_code(...)`. Anonymous auth is enabled at the project level; the `0032` trigger fix is required for it to work.
- **Role gating is two-layered**: client `signUp()` always passes `role: 'student'` — teacher elevation is a separate `redeem_teacher_invite` RPC. Server-side, the `profiles` UPDATE policy pins `role` to its prior value; the only paths to `role='teacher'` are `redeem_teacher_invite` and `bootstrap_first_admin`.
- **Admin bootstrap** is one-shot: `bootstrap_first_admin(p_user_id)` refuses to run once any admin exists, and is service_role only.
- **Email confirmation is OFF by design** (`mailer_autoconfirm = true` on the project; `config.toml` mirrors `enable_confirmations = false` + `enable_anonymous_sign_ins = true`). Enrollment is teacher-controlled, so no student needs a confirmation email — see `docs/SMTP_SETUP.md` for the rationale and when to re-enable.
- **Two student entry paths surfaced on `AuthScreen`**: (1) a **per-student login code/QR** — `<code>@students.local` minted by `admin_create_student`, signed in with a password; a `?login=<code>&key=<pw>` QR auto-prefills the form (no auto-submit). (2) a **class-code Quick Start** — the prominent "Join with a class code" card → `QuickStartScreen` (`signInAnonymously()` + `quick_start_with_code`), no password; a `?code=<XYZ>` QR deep-links straight to it via `AuthGate`. Both are code-first; email self-signup is the fallback, not the headline.
- **Claiming a per-student seat (0095).** `QuickStartScreen` detects a *seat* code (`<COURSE>-NN`, vs a 6-char course code) and routes to `claim_student_seat` instead of creating a new profile: the student sets their own email + password, which **become their login** (the synthetic `<code>@students.local` is swapped out, so the code/QR/code-based sign-in stop resolving for that seat — teacher surfaces are claim-aware, see roster Print/Reset). The teacher-owned `display_name` is untouched (the name field is hidden for seat codes). A claim against an already-claimed seat doesn't duplicate — it files a `seat_claim_requests` row the teacher approves (credential recovery) or denies. **Known accepted risk:** first-claim is open and `check_rate_limit('claim_seat', …)` is defeated by a fresh anonymous session per attempt, so a known course code allows enumerating + claiming *unclaimed* seats; accepted for this low-stakes, teacher-distributed context.

---

## 7. The mock-test runner

- `MockTestApp.tsx` is a phase machine: `setup → loading → running → submitted` (plus a SAT-format `BreakScreen` intermission).
- **Two run modes**: **free practice** (no `assignment` prop) mirrors session JSON to `localStorage` (`mocktest.session:<userId>`) for resume on reload; **assignment mode** (`assignment` prop is a `MockTestAssignmentContext`) skips setup, uses the supplied `TestConfig`, and treats `assignment_attempts` as source of truth — no `localStorage`. Attempt snapshots (0014) persist the exact question set so the teacher review screen sees what the student saw.
- **Question sources are pluggable**: `mocktest/sources/index.ts` exports `loadSource(config): Promise<TestQuestion[]>` and dispatches per `source_id`. New source = new file + dispatcher branch. The dispatcher provides difficulty fallback so a too-narrow filter never silently truncates a test.
- **Unified `TestQuestion` shape** (`mocktest/types.ts`): `{ id, source, domain, skill?, difficulty, passage?, stem, choices: Record<'A'|'B'|'C'|'D', string>, correctAnswer, correctRationale?, wrongRationales?, isHtml }`. Anything else is filtered at the adapter layer.
- **Assignment `source_id` mirrors `TestSourceId`**: CHECK in `0004_assignments.sql` enforces `source_id IN ('cb','sat','mixed')` to match the TS union exactly.

### 7x Proctoring & test-security telemetry (full-test runner, 0108–0109)

Scoped to the `/test/:slug` full-test runner (`viewer/src/fulltest/`), not the legacy `MockTestApp`. See `docs/PROCTORING.md` for the full stack + the SEB Phase-3 plan.

- **Tiered model** — `tests.proctoring_level` is a CHECK-constrained enum `('off'|'soft'|'strict')`, default `'soft'`, set via the audited `set_test_proctoring_level(slug, level)` RPC (teacher-of-test/admin). **soft** = telemetry only, all devices incl. iPhone. **strict** = soft + enforced fullscreen + copy/cut/paste/contextmenu blocking; it **fails open on iPhone** (no element fullscreen → enforcement skipped, telemetry still records, student sees an honest notice). A 4th **lockdown**/SEB tier is design-only — the CHECK does *not* yet allow `'lockdown'` (PROCTORING.md §3).
- **Forgery-proof event log** — `test_run_events` has owner-READ RLS and **no INSERT/UPDATE/DELETE policy**; every write goes through the SECURITY DEFINER logger `test_log_proctor_event(run, type, [duration], [module], [question])` (the same write-only pattern as `test_run_answers`). A tampered client can neither forge nor erase its trail, and the logger's `p_type` allowlist means only known signal types land.
- **Best-effort contract** — the logger ends in `EXCEPTION WHEN OTHERS THEN RETURN` so it **never throws**, and the client telemetry calls are fire-and-forget. Proctoring can never break a student's test.
- **Duration, not just counts** — the client tracks tab-away *duration* via `visibilitychange` (stamp on hidden, log `away` with elapsed seconds on return) and second-monitor focus loss via window `blur`/`focus`, de-duped against `away`. Each event records the module + question the student was on.
- **Server-authoritative flags** — `test_live_progress` derives `flagged` + `flag_reasons` (`away_60s`, `away_3x`, `fs_exit`, `paste`, `focus_3x`) in the view, not the client. The teacher live monitor and post-test review render `ProctorTimeline` from `get_test_run_timeline(run)` (owner OR teacher-of-test via the `is_teacher_of_test` helper).

> **0109 lesson (CREATE-OR-REPLACE rebuild gotcha):** 0108 rebuilt `start_test` by diffing against the **0082** body, which pre-dated 0083's `results_released` key — so 0108 silently dropped it and broke the score-release gate (caught by `clickthrough-practice-test.mjs`). A CREATE-OR-REPLACE rebuild must diff against the **latest** prior definition, not an arbitrary earlier one. (`start_test` had been touched by 0048, 0061, 0066, 0081, 0082, 0083 before 0108.)

---

## 8. Naming + file conventions

- `PascalCase.tsx` — React components. `useCamelCase.ts` — hooks. `camelCase.ts` — utility / shared-type modules.
- `UPPER_SNAKE_CASE.md` is allowed for prominent root docs; lowercase/snake-case for sub-docs.
- **Barrel** `index.ts` per LMS folder re-exports the folder's public surface (and `type` exports). Cross-folder imports prefer the barrel (`from "../student"`). The legacy `components/` barrel uses `export *`; new code does not extend that pattern.
- **Migrations**: `000N_snake_case_description.sql`. Strictly sequential, currently at `0032`.
- **Naming after the 0012 rename**:
  - **DB canonical names**: `courses`, `course_memberships` (post-rename).
  - **DB helper aliases**: `is_student_in_class(uid, p_course_id)` is the historic name; `is_student_in_course(uid, p_course_id)` is the `0028` forward alias. New SQL should call the alias; both must keep working until a future migration removes the old one.
  - **`teacher/` filenames retain the `Class*` prefix** (`ClassLayout`, `ClassRoster`, `ClassOverview`, `ClassSettings`, `ClassFormModal`, `ClassAssignmentsTab`, `classLayoutContext`) for backward-compat with existing imports. **This is deliberate, not drift.** New surfaces use `Course*` (`CoursePortfolio`, `CourseAnnouncements`, `CourseMaterials`, `CourseGradebook`, `CourseDiscussions`, `DuplicateCourseModal`, `useCourseModules`, `useCourseTemplates`).

---

## 9. The audit rubric

**Every TS/TSX file**
- [ ] 4–12 line JSDoc header.
- [ ] Component is a `function`, not `React.FC`; props are a named `interface FooProps` above the component.
- [ ] No `any`. `unknown` in catch blocks, narrowed with `instanceof Error`.
- [ ] Imports `{ supabase }` from `../lib/supabase`; does not call `createClient()`.
- [ ] No emojis in user-visible strings; no icon library (SVG or unicode only).
- [ ] Cross-folder imports respect §2.

**Hooks**
- [ ] `useFooBar.ts` with single same-named export.
- [ ] Return shape `{ data, loading, error, refresh }`; `error: string | null`.
- [ ] Realtime subscriptions clean up via `supabase.removeChannel(channel)`.
- [ ] Feature-specific → feature folder; cross-cutting → `lib/`. Never `hooks/`.

**Components / modals**
- [ ] Tailwind palette stays within indigo / violet / emerald / rose / slate.
- [ ] Modals match the `ClassFormModal` skeleton.
- [ ] Errors mapped to friendly copy. Loading = inline placeholder; errors = inline rose block with `role="alert"`.

**Migrations**
- [ ] Next sequential `000N_…` number, idempotent, every policy has a `-- Why:`, section banners present.
- [ ] Uses helper functions; `(SELECT auth.uid())` wrapping present. No client commands.

**RPCs**
- [ ] `SECURITY DEFINER`, `LANGUAGE plpgsql`, `SET search_path = public, auth`.
- [ ] Checks `auth.uid() IS NOT NULL`; re-checks role / ownership in body.
- [ ] Raises stable string error codes via `RAISE EXCEPTION '<code>'`.
- [ ] Returns row(s) or `RETURNS TABLE`. Never `void`.
- [ ] `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated;` (or stricter for bootstrap).

**Canonical rules (recurring smoke-caught bugs — non-negotiable)**

1. **Trigger functions that INSERT/UPDATE/DELETE another table MUST be `SECURITY DEFINER` with `SET search_path = public, auth`.** Plain `LANGUAGE plpgsql` triggers run in the caller's role and silently fail RLS on the cross-table write. Recurring bug: `audit_course_delete` (fixed in 0028), `bump_thread_last_message` (fixed in 0030). Audit: `grep` `CREATE OR REPLACE FUNCTION` bodies that touch a table other than the triggering one — they must carry `SECURITY DEFINER`.
2. **RLS policies that need to read `profiles` from an INSERT/UPDATE `WITH CHECK` MUST go through a `SECURITY DEFINER` helper** (`is_admin`, `is_staff`, `is_teacher_of_class`, `is_student_in_class` / `is_student_in_course`). Inline `EXISTS (SELECT 1 FROM profiles …)` inside `WITH CHECK` causes infinite recursion — fixed twice (`0008`, `0013`). Inline `EXISTS` against `course_memberships` is fine; against `profiles` it is not.
3. **Anything that touches the user-identity layer (anonymous flow, role gating, profile trigger) must be paired with a smoke step** before the migration lands. `0008` and `0032` were both first observed in smoke, not code review.
4. **DB rename migrations MUST update trigger function bodies, not just tables.** The `0012` rename shipped without re-templating `module_items_validate_assignment_ref` (still referenced `class_id`); fixed in `0019`. Audit: after any rename, `grep` the migrations directory for the old name inside function bodies.
5. **PostgREST batch inserts pass NULL for omitted keys.** `NOT NULL` with `DEFAULT` does **not** save you — PostgREST sends explicit `NULL`, overriding the default. Make the column nullable, or always supply the value. Root cause of `0032` (`profiles.email NOT NULL` + anon NULL `auth.users.email`).

---

## 10. Open questions / patterns not yet picked

Things the auditor should **not** try to enforce yet:

- **Form handling**: each modal does its own `useState` + ad hoc validation. No react-hook-form, Formik, or Zod.
- **Toast / notification UX**: no global toast; errors inline within the failing section. (The `notifications/` bell is the data-side notification stream, not a UI toast.)
- **i18n**: English-only. No `t()` calls. **Animation**: only Tailwind transitions. **Date formatting**: ad hoc per component.
- **Cross-domain type sharing**: `student/useStudentAssignments.ts` imports `Assignment*` types from `teacher/useAssignments.ts` — candidate for promotion to `lib/`.
- **Teacher → admin overlap**: per recent product direction, teachers should gain some admin capabilities; not yet in code. RLS still strictly distinguishes the two roles.
- **Test coverage**: Playwright configured (`test:e2e` script, `VITE_E2E_BYPASS_AUTH=1` honoured by `AuthGate`). No unit framework; absence is not a conformance failure.

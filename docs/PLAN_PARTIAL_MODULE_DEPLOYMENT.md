# Teacher-Controlled Partial / Scheduled Module Deployment of Full SAT Tests

**Design doc — `feat/test-access-policy` branch · migrations 0143–0146**
**Status: Phase 1 (backend) SHIPPED + verified on cloud.** Migrations 0143
(schema + window helper + student RPCs), 0144 (teacher admin RPCs), 0145/0146
(start_test hotfixes) are applied to Remote. Verified: `smoke-test-windows`
18/18, `smoke-test-access` 9/9, `clickthrough-practice-test` 42/0,
`clickthrough-practice-test-edges` 10/10, `tsc -b` clean. All blocker/high
adversarial findings resolved (§7).

**Phase 3 (student runner LOCKED-module UI) is now IMPLEMENTED.**
- A new `locked` phase in `FullTestApp.tsx` renders "this section opens
  &lt;when&gt;" instead of the generic error screen — the open time is read from
  the `module_not_yet_open` error DETAIL (on fetch) and from submit's
  `next_module_opens_at` (after a module submits).
- `api.ts` gained friendly codes for `module_not_yet_open` /
  `module_not_deployed` and now threads `error.details` through so the locked
  screen can surface the ISO open time.
- `types.ts` gained `opens_at` (per-module), `deployed`, and
  `next_module_opens_at` fields.
- Teacher **module selection** was added to the Modules-page inline
  "Add Full-Test" flow: a teacher picks which modules to deploy (e.g. R&amp;W
  only), which writes `set_test_module_windows`.

Verified: `tsc -b` clean, `smoke-locked-module` green. Phase 2 (full teacher
schedule UI — AssignTestModal step + ModuleScheduleCard + roster levers) is the
remaining work.

> **Scope change from the original draft:** v1 ships **permanent module subsets**
> (e.g. RW-only = positions 1–2 as a complete 2-module test) in addition to
> staggering, per the product owner's decision. This is carried by a `deployed`
> flag on `test_module_windows` + a per-run deployed-range snapshot; a subset run
> finalizes at its own last deployed position and its `section_scores` naturally
> contains only the answered section(s). `satScore.ts` already returns
> `total = null` when a section is absent, so a RW-only test surfaces a 200–800
> **section** score rather than a 400–1600 composite — no new scoring code. The
> deployed positions must be a **contiguous range** (enforced by
> `set_test_module_windows`), since the run walks first→last sequentially.

---

## 1. Problem & Goals

A full Digital SAT test (DSAT) is four ordered modules: **RW Module 1, RW Module 2, Math Module 1, Math Module 2** (positions 1–4). Today a teacher assigns the whole test at once — the student sits all four in one session. The husband-wife teaching team wants to **meter the test out over days**: "students take RW Module 1 today as an assignment, RW Module 2 tomorrow," and so on.

**Goals**

1. **Teacher UX** to configure *which modules open* and *when* at assign time, with one-tap "stagger daily."
2. **Data integrity**: a student is **never** treated as taking the same test twice — no duplicate runs, no double-counted answers, exactly one score, one clean gradebook/roster/results-release record per (student, test).
3. **Student UX**: a clear "this module opens Friday" affordance, seamless resume into the *same* run across days, honest partial-progress visibility.
4. **Zero regression** for existing one-click full-test assignment.

**The "no same test twice" guarantee** is the non-negotiable acceptance criterion. It must be *structural* (enforced by the database), not reconstructed on every read.

---

## 2. Chosen Approach — Window-gate on the single run (Approach A + two borrowings)

We keep **exactly one `test_runs` row per (user, test)** for the entire metered period. The run stays `in_progress` across days and finalizes (`status='submitted'`) only when the last permitted module is submitted. A new per-(course, test, module-position) schedule table (`test_module_windows`) says when each position opens. `get_test_module` **and** `submit_test_module` consult the window server-side; the existing `test_runs_one_active` partial unique index (verified `(user_id, test_id) WHERE status='in_progress'`, 0048:108–110) is preserved verbatim, so a second run of the same test is **structurally impossible**.

**Why this approach.** The user's priority is integrity-first with the smallest blast radius. ~76 query sites across the migration set assume the one-run-per-(user,test) model; Approach A keeps that invariant byte-for-byte and needs only *additive* display columns on read surfaces. Integrity is inherited, not rebuilt.

**Two borrowings (to close A's only real weaknesses):**

- **Borrow 1 — "Finalize now" escape hatch** (from Approach C's "every run always finalizes"): a teacher RPC `finalize_metered_run(run_id)` finalizes a run at its highest answered position, so a never-opened remaining module can't strand a run forever outside the release queue. Surfaced on the roster next to "Open module now."
- **Borrow 2 — partial-progress visibility** (read-side only): extend `list_my_test_runs` and the roster RPCs to surface in-progress metered runs with `modules_done / modules_total / next_module_opens_at`, so students/teachers see "2 of 4 modules · M3 opens Fri" instead of an invisible run. No new run rows.

**Rejected alternatives.**

- **B — Segment sub-runs** (one run per module slice + position-ownership table + GiST exclusion constraint + rollup view). Deliberately *breaks* the one-run invariant and rebuilds single-record semantics across ~76 sites — the largest integrity blast radius for a priority demanding the smallest. Effort is realistically XL, not L. Rejected.
- **C — Split into 4 child tests + `test_groups` parent.** Heavyweight per-test content split (re-point every `test_questions.module_id`, re-author the OCR pipeline to emit children), loses a single canonical score (lives only in a read-side rollup), and fragments section scoring. Its two good ideas are borrowed above without the structural cost. Rejected.

**Scope decision (UPDATED — permanent subsets are IN v1):** the original draft
deferred permanent subsets; the product owner chose to include them. A schedule
therefore carries, per position, a `deployed` flag (excluded positions are
`deployed=false`) plus the `opens_at`. The deployed positions must form a
**contiguous range** (`set_test_module_windows` raises `non_contiguous_deployment`
otherwise) because the single run advances first→last with no gaps. A subset run
snapshots its `scheduled_first_position`/`scheduled_last_position` at creation and
finalizes at the last deployed module. The integrity hazards the original draft
worried about are handled rather than avoided: the missing-`section_scores`-key
case is a non-issue because every consumer reads section scores through
`scaledFromSectionScores` (returns `total=null` when a section is absent); the
one-attempt and release semantics are unchanged because a subset run is still a
single run that finalizes exactly once. The `module_not_deployed` error guards any
attempt to fetch/submit an undeployed position.

---

## 3. Data Model (forward-only DDL)

All new objects use `IF NOT EXISTS` / additive `ADD COLUMN`. No existing column dropped or renamed. Next free migration number is **0143** (`0142_peek_join_code.sql` already exists on this branch — confirm `supabase migration list` shows Local==Remote before pushing, per the 0086 collision lesson).

### 3a. New table: `public.test_module_windows` (0143)

```sql
CREATE TABLE IF NOT EXISTS public.test_module_windows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  test_id         uuid NOT NULL REFERENCES public.tests(id)   ON DELETE CASCADE,
  module_position integer NOT NULL,           -- 1..max(test_modules.position)
  deployed        boolean NOT NULL DEFAULT true,  -- false = excluded from this course's deployment (permanent subset)
  opens_at        timestamptz,                -- NULL = open immediately
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, test_id, module_position)
);

CREATE INDEX IF NOT EXISTS test_module_windows_lookup
  ON public.test_module_windows (course_id, test_id, module_position);

ALTER TABLE public.test_module_windows ENABLE ROW LEVEL SECURITY;
-- NO student/teacher SELECT/INSERT/UPDATE policy. All access via SECURITY
-- DEFINER RPCs (matches the test_questions / test_runs posture). Service-role
-- bypasses RLS for smoke seeding only. A student CANNOT read the raw schedule
-- via PostgREST (resolves the schedule-disclosure finding in security-rls).
```

**Semantics.** `opens_at IS NULL` or absent row ⇒ open immediately. The schedule is per-**course** (the same test can be metered differently in two courses). A test assigned the old one-click way has **zero** window rows ⇒ all positions open ⇒ behaviour byte-identical to pre-0143 (back-compat keystone).

### 3b. Columns on `test_runs` (0143) — additive

```sql
ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS active_seconds          integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS course_id               uuid        REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_last_position integer;    -- snapshot at start; NULL ⇒ full test
```

- **`active_seconds`** — accumulated *real* exam time, capped per module (§8), so finalized `duration_seconds` reflects exam time, not the multi-day wall-clock between `started_at` and finalize.
- **`course_id`** — the course the run is being taken *through*, stamped at `start_test` time (§7, `double-attempt-scoring [high]` + `security-rls [high]`). This makes the window lookup course-specific and closes the cross-course bypass. `ON DELETE SET NULL` because run history must survive course deletion.
- **`scheduled_last_position`** — snapshot of "how many modules this run will finalize at," captured at run creation (§7, `resume-timezone-schedule [high]`). Finalization keys off this snapshot, **never** a live schedule lookup, so a teacher editing the schedule mid-flight cannot move an in-flight student's finalization boundary. In v1 this is always `max(test_modules.position)` (=4).

No DDL change to `test_run_answers`, `test_modules`, `test_questions`. The `test_runs_one_active` index is **untouched**.

### 3c. Integrity event attribution (0143) — additive

```sql
ALTER TABLE public.test_integrity_events            -- table from 0103
  ADD COLUMN IF NOT EXISTS module_position integer; -- which metered module/day the flag belongs to
```

Purely additive; lets the proctor UI attribute a tab-blur/focus-loss flag to the specific metered module across the multi-day release period (§8).

---

## 4. RPC Contracts

All functions: `SECURITY DEFINER`, `SET search_path = public, auth`, stable string error codes the client switches on, `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated` (internal helpers get **no** grant). No inlined `EXISTS (SELECT 1 FROM profiles ...)` — use existing SECURITY DEFINER helpers `is_staff` / `is_teacher_of_course` / `is_admin`. New error codes are additive; none renamed.

### 4a. Internal helper — `_effective_module_opens_at` (0143, not granted)

```
public._effective_module_opens_at(p_uid uuid, p_course_id uuid, p_test_id uuid, p_position int)
  RETURNS timestamptz
```

Returns the `opens_at` for **exactly one course** — the `p_course_id` stamped on the run — not a min/max across all enrolments. This is the decisive fix for the cross-course leak (§7). Logic:

- If `is_staff(p_uid)` ⇒ return NULL (staff preview is ungated).
- `SELECT opens_at FROM test_module_windows WHERE course_id=p_course_id AND test_id=p_test_id AND module_position=p_position`. No row ⇒ return NULL (open).

Because the run carries its own `course_id`, a second enrolment in another course that links the same test **cannot** loosen (or tighten) this course's meter.

### 4b. Internal helper — `_accumulate_active_seconds` (0143, not granted)

Adds the current module's capped elapsed time to `active_seconds`:

```
active_seconds := active_seconds
  + LEAST( EXTRACT(epoch FROM (now() - current_module_started_at))::int,
           v_mod.time_limit_seconds );
```

`LEAST(..., time_limit_seconds)` bounds a per-module multi-day smear (student opens module N, leaves for a day) to the real limit (§8, resolves `adaptive-section-proctor [medium]`).

### 4c. CHANGED — `start_test(p_slug text)` (CREATE OR REPLACE, return type stable jsonb)

**Auth / gates (0141 logic preserved byte-identically):**

1. `not_authenticated` if no `auth.uid()`.
2. **Enrollment gate** (0141:52–65, verbatim): non-staff must be enrolled in a course whose `module_items` has `item_type='link'` and `url ILIKE '%/test/<slug>%'`, else `not_enrolled`.
3. **Resume branch first** (0141:64): if an `in_progress` run exists, return it **before** any window evaluation. *Resuming an already-started run is never window-blocked* — the gate is on fetching a not-yet-reached module, not on resuming.
4. One-attempt gate (0141:75) unchanged. Cannot mis-fire on a partial run because a partial run is never `submitted` (§7).

**New behaviour:**

- **Stamp `course_id`** on run creation: resolve the single enrolled course linking this slug. If the student is enrolled in **>1** course linking this test with **differing** schedules, raise `ambiguous_course_enrollment` (HINT names the courses) — the teacher must disambiguate. If multiple courses link it but schedules are identical (or all NULL), pick deterministically (lowest `course_id`). (Resolves `double-attempt-scoring [high]`, `security-rls [high]`.)
- **Snapshot `scheduled_last_position = max(test_modules.position)`** at creation (always 4 in v1).
- Augment each `modules[]` element with `opens_at` (ISO or null) via `_effective_module_opens_at(uid, run.course_id, test_id, position)` so the intro screen can render lock badges. Optional field; staff get all-null. (Future-date disclosure to the student is accepted in v1 — see Open Question Q4.)

Return payload (jsonb) unchanged in shape + the new `opens_at` per module. Race safety: the `EXCEPTION WHEN unique_violation → re-SELECT` wrapper (0066, carried through 0141:96) is preserved — concurrent taps converge to the same run id.

### 4d. CHANGED — `get_test_module(p_run_id uuid, p_position int)` (CREATE OR REPLACE)

Existing guards kept: `run_not_found`, `not_authorized` (ownership), `run_already_submitted`, and `module_out_of_order` (`p_position > current_module`). **New second guard, placed AFTER `module_out_of_order`:**

```
-- Only gate a NOT-yet-reached module. The module the student is actively on
-- (p_position == current_module) is past the gate by definition — this prevents
-- a mid-exam student being kicked to 'locked' if a teacher pushes opens_at into
-- the future (resolves resume-timezone-schedule [low]).
IF p_position > v_run.current_module - 1 AND p_position >= v_run.current_module THEN
  v_opens := public._effective_module_opens_at(
               v_run.user_id, v_run.course_id, v_run.test_id, p_position);
  IF v_opens IS NOT NULL AND v_opens > now() THEN
    RAISE EXCEPTION 'module_not_yet_open' USING DETAIL = v_opens::text;
  END IF;
END IF;
```

**Timer re-anchor (resolves `resume-timezone-schedule [blocker]`):** when stamping `current_module_started_at` for a module that has **zero** `test_run_answers` rows for this run+position, set it to `now()` on this call. This guarantees a student who taps "Begin", closes the tab, and resumes hours later (within the open window) gets a **full** `seconds_remaining`, not 0 → auto-submit. If answers already exist for the position, keep the existing stamp (true mid-module resume).

`DETAIL` carries the ISO `opens_at` so the runner renders the unlock time. **New error code: `module_not_yet_open`.**

### 4e. CHANGED — `submit_test_module(p_run_id uuid, p_position int, p_answers jsonb)` (CREATE OR REPLACE)

Grading + `test_run_answers` upsert (`ON CONFLICT (run_id, question_id)`) unchanged.

**New defense-in-depth gate (resolves `security-rls [medium]`):** before grading, re-run the `_effective_module_opens_at` check and raise `module_not_yet_open` if the position isn't open. A student must not be able to *submit* answers to a not-yet-open module even if they obtained the questions out-of-band. Two independent gates (fetch + submit) ⇒ the window cannot be bypassed by any single-RPC path.

**Finalization boundary (the core change):** replace `IF p_position >= v_max_position` with the **snapshot**:

```
IF p_position >= v_run.scheduled_last_position THEN   -- = 4 in v1
  -- FINALIZE: status='submitted', score/total/section_scores as today,
  -- duration_seconds := v_run.active_seconds + this module's capped elapsed
ELSE
  -- ADVANCE: _accumulate_active_seconds(); current_module := p_position + 1;
  -- (UNCHANGED: advance is allowed even if the next window is still closed —
  --  the GATE lives in get_test_module / submit_test_module, not on the pointer)
END IF;
```

Keying finalization to the **snapshot** (not a live schedule lookup) means a teacher editing the schedule mid-flight can never move an in-flight student's boundary, and a never-finalize-early guarantee under one-attempt (§7).

**Proctor-pause guard (resolves `adaptive-section-proctor [medium]`):** if `v_run.paused_at IS NOT NULL`, raise `run_paused` (a paused run must be resumed via `proctor_set_pause` before submit). On advance, `current_module_started_at` is already cleared to NULL (0048:407), so the 0102 pause-shift math is a no-op between modules — verified and smoke-asserted.

Return payload gains `next_module_opens_at` (ISO or null) so the runner shows the locked screen directly after submit without an extra round-trip.

### 4f. NEW — `set_test_module_windows(p_course_id uuid, p_slug text, p_windows jsonb)` (0144)

`p_windows = [{"position":1,"opens_at":"2026-06-10T13:00:00Z"}, {"position":2,"opens_at":null}, ...]`.

- **Auth:** `is_teacher_of_course(uid, p_course_id) OR is_admin(uid)` else `not_authorized`; `not_authenticated`; `test_not_found`.
- **Requires the test assigned first** (EXISTS the `module_items` link in the course) else `not_assigned`.
- **v1 completeness check:** `p_windows` must cover **all** positions `1..max(test_modules.position)`, else `schedule_incomplete`. (Forbids the short-deployment hazard class.)
- **Monotonic-shrink guard (resolves `double-attempt-scoring [high]`):** refuse to delete or push-future a window for a position any enrolled student has **already passed** (`EXISTS` a run in this course with `current_module > position`), else `position_already_passed`. Teachers cannot retroactively re-lock a module a student already completed.
- UPSERT `ON CONFLICT (course_id, test_id, module_position)`. Audit `test.windows_set` (slug, course, positions+opens_at; no answer data).
- Returns the full current schedule array for optimistic reconciliation.

### 4g. NEW — `get_test_module_windows(p_course_id uuid, p_slug text)` (0144)

Staff/teacher-of-course/admin read; re-checks `is_teacher_of_course OR is_admin` server-side (never trusts the client). Returns `[{position, label, section, opens_at}]` joined to `test_modules` for labels. Errors: `not_authenticated` / `not_authorized` / `test_not_found`.

### 4h. NEW — `finalize_metered_run(p_run_id uuid)` (0144) — escape hatch (Borrow 1)

- **Auth:** teacher-of-the-run's-course OR admin (reuse the 0091 `test_runs→tests→module_items→course_modules→courses` EXISTS scope), else `not_authorized`. `run_not_found`; `run_already_submitted` if already finalized.
- Finalizes the run at its **highest answered position** (`max(module_position)` from `test_run_answers`), computing score/total/section_scores over the answered modules and `duration_seconds := active_seconds`. Sets `status='submitted'`.
- This is the **only** path that may finalize at < `scheduled_last_position`, and it is a deliberate teacher action (audited `test.run_force_finalized`). Because it's teacher-gated and audited, the resulting partial `section_scores` is an accepted teacher decision, not a silent system state — but it can produce a missing `section_scores` key, so consumers must be defensively audited before this ships (see §7 + §9 smoke).

### 4i. CHANGED reads (0144) — `test_roster_status`, `test_live_progress`, `list_my_test_runs` (APPEND-only columns, per the 0057 lesson)

- **`test_roster_status`** — change the LATERAL to *also* pick up the `in_progress` run (not only `submitted`), and APPEND: `modules_done` (`SELECT max(module_position) FROM test_run_answers WHERE run_id=...`), `modules_total` (`count(*) FROM test_modules`), `next_module_opens_at` (via the window helper for `current_module`). A mid-meter student now shows `modules_done=2, modules_total=4, next_module_opens_at=<date>` instead of falling into the misleading "not started" bucket. **This is part of 0144, not optional** — the gate without it is a teacher-facing regression (§7, `release-gradebook [high]`).
- **`test_live_progress`** — APPEND the same three columns so the live monitor distinguishes "waiting for next window" (`next_module_opens_at` in the future) from "actively mid-module" (null/past).
- **`list_my_test_runs`** — APPEND `current_module`, `modules_done`, `modules_total`, `next_module_opens_at`, and include `in_progress` metered runs so the student home panel can show "RW M1 submitted · RW M2 opens Tue" (Borrow 2).

### 4j. NEW — `release_test_results_for_teacher` gains optional `p_course_id` (0144)

Scope release to a course's enrolled students (resolves `release-gradebook [medium]` duplicate-release fan-out). When `p_course_id` is provided, filter the released run set to students enrolled in **that** course. When omitted, behaviour is unchanged (back-compat). The roster surfaces a warning chip when a student belongs to >1 course linking the test.

**Release / `tests_awaiting_release` need no other change.** A partial run is never `submitted`, so it never enters the release queue (you cannot release half a test). A companion read `tests_awaiting_attention()` (0144) surfaces *stuck* meters: in-progress runs whose `next_module_opens_at` is in the past (window opened, student hasn't continued) — wiring the dashboard nudge to the "Finalize now" control.

**Full new error-code set (all additive):** `module_not_yet_open`, `ambiguous_course_enrollment`, `not_assigned`, `schedule_incomplete`, `position_already_passed`, `run_paused`, `test_not_found`.

---

## 5. Teacher UX — assign + schedule flow

Reuses the existing `AssignTestModal.tsx` shell (focus trap, Esc, course list, toast, skeleton) from both call sites (`FullTestCatalog.tsx`, `TestOverviewPage.tsx` header + empty-state CTA).

**Screen 1 — course pick (unchanged fast path).** The course list with a one-click **Assign**. After `assign_test_to_course` succeeds, the row **expands inline** into a schedule step rather than just flipping to "Assigned." A **"Deploy all modules now"** default keeps zero-friction: if the teacher clicks away, no window rows are written ⇒ all modules open ⇒ today's behaviour.

**Screen 2 — module schedule (inline expand).** Driven by `get_test_module_windows` (returns labels + section + current `opens_at`). Each row is a **LockUntilPicker-style popover wrapping `SmartDatePicker`** (cloned from `teacher/modules-page/editors.tsx`) labelled "Opens at." **Custom hour-granular presets** ("Now", "Tomorrow 8am", "Mon 8am", "+1 day", "+2 days") live *outside* `SmartDatePicker` (its built-in presets snap to end-of-day, wrong for an exam start time — follows the documented `AnnouncementFormModal` precedent). A **"Stagger daily"** button sets M1=Now then +1 calendar day each (calendar add at a fixed hour, DST-safe — §8), producing the requested one-module-per-day cadence in one click.

- **Optimistic:** rows update locally on Save, call `set_test_module_windows`, reconcile against the returned schedule; on failure → `useToast().error` + rollback.
- **Skeleton** rows while `get_test_module_windows` loads. **EmptyState** only if the course list is empty.

**Manage after assigning — `TestOverviewPage` (`/educator/tests/:slug`).** A full-width **"Module schedule" card** (new `test-overview/ModuleScheduleCard.tsx`, barrel-exported) below the Structure+Distribution grid: one inline-editable row per module (pencil-on-hover → SmartDatePicker → `set_test_module_windows`, optimistic + toast, Esc cancels), a status pill (Open / Opens Fri 8am / All submitted), and a per-module "12/20 submitted" count. Mirrors the existing inline retake-policy + proctoring radiogroups (admin/teacher-only). A **"Next opens"** StatCard joins the cohort stat row.

**Roster (`RosterRow.tsx`).** The in-progress row gains a progress chip — **"2 / 4 modules · M3 opens Wed 8am"** — driven by the new `modules_done / modules_total / next_module_opens_at`. Two inline teacher levers: **"Open M3 now"** (calls `set_test_module_windows` with that position = now, scoped to this course) and **"Finalize now"** (calls `finalize_metered_run` for a stranded student). Submitted / not-started rows unchanged.

### ASCII wireframe — schedule editor (Screen 2 / Overview card)

```
┌─ Assign “DSAT Nov 2023” → Period 3 Algebra ──────────────────────────┐
│  ✓ Assigned.   Schedule module release:        [ Stagger daily ▸ ]   │
│                                                                      │
│   ●  RW Module 1      Opens:  Now              ▾   (27 Q · 32 min)    │
│   ○  RW Module 2      Opens:  Tomorrow 8:00 AM ▾   (27 Q · 32 min)    │
│   ○  Math Module 1    Opens:  Wed 8:00 AM      ▾   (22 Q · 35 min)    │
│   ○  Math Module 2    Opens:  Thu 8:00 AM      ▾   (22 Q · 35 min)    │
│                                                                      │
│   ⓘ All four modules will be released. Students take one run; each    │
│      module unlocks on its date. Leave a date as “Now” to open it.   │
│                                                                      │
│                       [ Deploy all now ]   [ Save schedule ]         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Student UX — metered test

**Discovery (before a module opens).**

- **`StudentCourseView` / `ModuleItemRowView`** — the single "Test" pill gains a sub-line of per-module status pills from `start_test`'s new `modules[].opens_at`: `RW M1 open · RW M2 opens Tue · Math M1 opens Wed`. Reuses `formatDue()` and the `isLocked()` pattern. The pill stays one click; the runner routes to whichever module is currently open.
- **`StudentTestResultsPanel`** (home) — via the extended `list_my_test_runs`, an in-progress metered run shows **"RW M1 submitted · RW M2 opens Tue 8am"** instead of being invisible until the whole test finalizes (Borrow 2). Pre-submission confirmation the student currently lacks.

**In the runner (`FullTestApp.tsx`).** Add a new Phase value **`locked`** (the Phase union currently has no such state — verified `loading | intro | module | break | submitting | result | error`).

- **Bootstrap / `loadModule` catch:** on `module_not_yet_open` (DETAIL = ISO `opens_at`), set `phase='locked'` and render the unlock time — **never** the generic error screen. The locked screen reuses the proctor-paused `CenterCard` template (clock icon, message, "Back to course" button, no action CTA).
- **Intro screen:** the `start.modules.map` list renders a lock badge + "Opens Tue 8am" for any module with a future `opens_at`. The primary button reads "Begin test" / "Resume — Module N" targeting `current_module`; if that module's window is closed it routes to `locked`.
- **After submitting a module** (`doSubmitModule`): if `res.next_module_opens_at` is present and in the future, set `phase='locked'` (not `break`) — "Module 2 opens Tuesday at 8:00 AM — your Module 1 answers are saved. Come back then."
- **Resume:** re-entry after the window opens → `start_test` → same in-progress run, `current_module=2`, window now open → "Resume — Module 2" → student continues in the **same run**. Timer is re-anchored server-side (§4d) so the multi-day gap doesn't bleed into exam time.
- **api.ts:** `FRIENDLY` map gains `module_not_yet_open → "That section isn't open yet."`. **Critically, `module_not_yet_open` is NOT added to the retry-after-success synthesis allowlist** (verified that allowlist is exactly `module_out_of_order || run_already_submitted` at api.ts:88) — a locked module must never silently "succeed."
- **types.ts:** `ModuleMeta` gains `opens_at?: string | null`; `SubmitModuleResult` gains `next_module_opens_at?: string | null` — both optional/nullable so staff preview + replay surfaces are unaffected.

**Results timing.** A metered run's results appear only after full finalization + teacher release (per-run `results_released_at`, unchanged). Mid-meter, the home panel shows the partial-progress row; `get_test_result` continues to raise `run_not_submitted` for the in-progress run (verified guard, 0072:45) — **no partial answer-key leak**.

### ASCII wireframe — student "test, metered"

```
┌─ DSAT Nov 2023 ────────────────────────────────── full-screen runner ─┐
│                                                                        │
│   ✓  Reading & Writing — Module 1     Completed                        │
│                                                                        │
│   ⏳  Reading & Writing — Module 2                                      │
│        Opens Tuesday, June 11 at 8:00 AM  (in 18 hours)                │
│        Your Module 1 answers are saved.                                │
│                                                                        │
│   🔒  Math — Module 1     Opens Wed, June 12 · 8:00 AM                  │
│   🔒  Math — Module 2     Opens Thu, June 13 · 8:00 AM                  │
│                                                                        │
│                        [ Back to my course ]                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Data-Integrity Proof

**Claim:** a student can never be "taking the same test twice," partial progress is never double-counted or mis-released, and no adversarial path defeats the metering.

**Structural core (unchanged from the existing model):**

1. **At most one run, enforced by the DB.** `test_runs_one_active ON (user_id, test_id) WHERE status='in_progress'` (verified 0048:108–110) is preserved verbatim. A metered run stays `in_progress` for the whole period rather than spawning per-module runs ⇒ structurally one live row per (user, test). `start_test`'s `EXCEPTION WHEN unique_violation → re-SELECT` converges concurrent taps to the same run id.
2. **Resume returns the same run.** `start_test`'s resume branch selects the existing in-progress run before any INSERT or window check ⇒ day-2 returns the day-1 run id, same answers table, same `current_module`.
3. **One finalize, one score.** `score/total/section_scores/duration_seconds` are written in a single UPDATE only when `p_position >= scheduled_last_position`. `test_run_answers` upserts `ON CONFLICT (run_id, question_id)` ⇒ resubmitting a module overwrites in place, never accumulates duplicate question rows. Exactly one finalize event ⇒ exactly one gradebook score.
4. **Window gate is read-only w.r.t. run identity.** `_effective_module_opens_at` only RAISES; it never creates, resets, or branches runs. Scheduling cannot, by construction, introduce a duplicate run.
5. **Roster / release coherence.** A mid-meter run is `in_progress`, so it never enters `tests_awaiting_release` / `list_test_completion` — you cannot release half a test. Teachers see in-flight state through additive display columns that cannot create a scored record.

**Adversarial findings — explicit resolutions:**

- **`double-attempt-scoring [high]` — cross-course schedule collision.** *Resolved* by stamping `test_runs.course_id` at creation and keying `_effective_module_opens_at` on that single course (§4a/§4c). A second enrolment in another course linking the same test can no longer loosen the meter. Dual-enrolment with *conflicting* schedules raises `ambiguous_course_enrollment`, forcing teacher disambiguation rather than silent bypass.
- **`double-attempt-scoring [high]` / `resume-timezone-schedule [high]` — schedule edit moves the finalization boundary.** *Resolved* by snapshotting `scheduled_last_position` onto the run at creation (§3b). Finalization keys off the snapshot, never a live lookup; mid-flight schedule edits affect only new runs. `set_test_module_windows` additionally refuses to re-lock a position a student already passed (`position_already_passed`).
- **`double-attempt-scoring [medium]` — retake mid-schedule.** *Resolved* by documenting and enforcing: retake/reset semantics are defined only for **finalized** runs. `allow_test_retake` early-raises `run_in_progress_use_reset` when an in-progress run exists; mid-meter the teacher uses `reset_test_attempt` (abandon → fresh start). Smoke-asserted.
- **`release-gradebook [high]` — per-module early answer-key leak / short deployment.** *Resolved* by the v1 scope decision: schedules must cover all positions (`schedule_incomplete` otherwise), so `scheduled_last_position` is always max and a run never finalizes before the whole test is done. `get_test_result` stays gated on `status='submitted'` (verified 0072:45) ⇒ no partial-key leak. The one path that can finalize early — `finalize_metered_run` — is teacher-gated, audited, and out of the default student flow.
- **`release-gradebook [medium]` — duplicate / cross-course release fan-out.** *Resolved* by the optional `p_course_id` scope on `release_test_results_for_teacher` (§4j) + a roster warning when a student is in >1 linking course.
- **`release-gradebook [high]` — roster lies during the window.** *Resolved* by making the `test_roster_status` LATERAL pick up in-progress runs + the three additive columns **part of 0144** (same migration as the gate), not a later nicety.
- **`release-gradebook [medium]` — stuck meter invisible.** *Resolved* by `tests_awaiting_attention()` + the "Finalize now" escape hatch (Borrow 1).
- **`resume-timezone-schedule [blocker]` — timer anchor.** *Resolved* by re-anchoring `current_module_started_at = now()` on `get_test_module` when the position has zero answers (§4d). A mid-day resume gets a full `seconds_remaining`, not 0 → auto-submit.
- **`security-rls [medium]` — submit has no window gate.** *Resolved* by adding the `_effective_module_opens_at` guard to `submit_test_module` (§4e). Two independent gates.
- **`security-rls [high]` — most-permissive tie-break leak.** *Resolved* — same fix as the cross-course finding (course-scoped resolution, not min-across-enrolments).
- **`security-rls [low]` — schedule disclosure.** `test_module_windows` has RLS enabled with **no student SELECT policy**; students see only their own course's `opens_at` echoed through `start_test`. `get_test_module_windows` re-checks teacher/admin server-side.
- **`adaptive-section-proctor [low]` — adaptive break.** *Dropped from the risk register* — confirmed there is no adaptive M2 variant in the schema (0049 seeds exactly one M2 per section); metering cannot break adaptivity that doesn't exist. A one-line note in the migration header records this for future readers.
- **`adaptive-section-proctor [medium]` — duration lie / per-module cap.** *Resolved* by `LEAST(elapsed, time_limit_seconds)` accumulation (§4b).
- **`adaptive-section-proctor [medium]` — proctor pause × locked.** *Resolved* by the `run_paused` guard in `submit_test_module` and the verified fact that `current_module_started_at` is NULL between modules (pause-shift is a no-op there). Smoke-asserted.
- **`adaptive-section-proctor [low]` — integrity event attribution.** *Resolved* by the additive `test_integrity_events.module_position` column (§3c).
- **`adaptive-section-proctor [medium]` / `release-gradebook` — missing `section_scores['math']` key.** *Mitigated* — v1 forbids intentionally-short deployments, so the default path always produces both keys. The only sub-4 finalize is the teacher-driven `finalize_metered_run`. Verified no JS reads `section_scores['math']` directly today; §9 adds a hard smoke gate that finalizes a 2-module run and asserts every consumer (`get_test_result`, `student_test_report` 0088, domain rollups 0121–0123, `ScoreArcSparkline`) renders without a missing-key error before `finalize_metered_run` ships.

**Net:** the no-duplicate property is inherited unchanged; every new failure mode is closed by a course-scoped window resolution, a finalization snapshot, a two-point gate, a timer re-anchor, and a per-module time cap.

---

## 8. Edge Cases & Decisions

- **Timezone.** All `opens_at` stored `timestamptz` (UTC) via SmartDatePicker's `new Date(v).toISOString()`; the server gate compares `opens_at > now()` (DB UTC). Display converts to browser locale. **Stagger presets use a calendar add at a fixed hour** (set hour=8 on date+N days) rather than `now() + N*86400s`, so a `+1 day` preset crossing a DST boundary still lands at 8:00 local wall-clock. Student locked screens show both relative ("opens Fri") and absolute local time.
- **Schedule edits mid-flight.** Finalization keys off the per-run `scheduled_last_position` snapshot, so edits never shift an in-flight student's boundary. `set_test_module_windows` refuses to re-lock a passed position. New opens-at values apply to the next time a student attempts a not-yet-reached module.
- **Adaptive / section-scoring fidelity.** No adaptive routing exists in the schema; metering does not degrade it. Combined score is a raw correct-count + section split (unchanged from today). No user-facing warning needed; documented as out of scope.
- **Proctoring per module.** Proctoring level is per-test (one continuous level across all four metered modules). An integrity flag is attributed to its module via the new `module_position` column. A paused run cannot be submitted (`run_paused`); the pause-shift math is a no-op between modules.
- **Retake interaction.** Defined for finalized runs only. Mid-meter ⇒ `reset_test_attempt` (abandon → fresh). `allow_test_retake` raises `run_in_progress_use_reset` if an in-progress run exists.
- **Per-module active-time cap.** Each module's accumulated elapsed is capped at `time_limit_seconds`, bounding a multi-day abandon-and-return smear.

---

## 9. Migration + Rollout Plan

**Forward-only. Two migrations.** Verify `supabase migration list` shows Local==Remote first (0142 collision lesson). Update `docs/MIGRATIONS.md` in the same commit as each.

**`0143_test_module_windows.sql`**
1. `CREATE TABLE test_module_windows` + unique + lookup index + RLS enable (no policies).
2. `ALTER TABLE test_runs ADD COLUMN active_seconds / course_id / scheduled_last_position` (additive).
3. `ALTER TABLE test_integrity_events ADD COLUMN module_position`.
4. Helpers `_effective_module_opens_at`, `_accumulate_active_seconds` (not granted).
5. `CREATE OR REPLACE get_test_module` (window gate + timer re-anchor).
6. `CREATE OR REPLACE submit_test_module` (submit-side gate + snapshot finalization + active_seconds + `next_module_opens_at` + `run_paused` guard).
7. `CREATE OR REPLACE start_test` (stamp `course_id`/`scheduled_last_position`, `ambiguous_course_enrollment`, `modules[].opens_at`; keep enrollment + one-attempt + resume logic byte-identical to 0141).
8. Grants. Ledger row.

**`0144_test_window_admin_and_roster.sql`**
1. `set_test_module_windows` (schedule_incomplete + position_already_passed + audit), `get_test_module_windows`.
2. `finalize_metered_run` (escape hatch, audit).
3. `release_test_results_for_teacher` optional `p_course_id`; `tests_awaiting_attention`.
4. `allow_test_retake` `run_in_progress_use_reset` branch.
5. `CREATE OR REPLACE test_roster_status / test_live_progress / list_my_test_runs` — **APPEND** `modules_done / modules_total / next_module_opens_at` (append-only column discipline per the 0057 lesson).
6. Grants. Ledger row.

**Back-compat proof (keystone).** A test with zero window rows ⇒ `_effective_module_opens_at` returns NULL for every position; `scheduled_last_position` = max(test_modules.position). Behaviour is byte-identical to pre-0143. Run the existing `clickthrough-practice-test.mjs` (41 checks) against an **un-scheduled** test to prove zero regression.

**Smoke additions** (new `viewer/scripts/smoke-test-windows.mjs`, added to `smoke-all.mjs`):
- (a) Seed 4-module test + course link + enrolled disposable student; M2 `opens_at=+1h`; submit M1 → assert `get_test_module(run,2)` raises `module_not_yet_open`, run still `in_progress`, `start_test` re-call returns the **same** run id (no duplicate).
- (b) **Mid-meter one-attempt resume** (mandatory): prove a mid-meter run is NOT treated as submitted — resumes, not blocked.
- (c) Set M2 `opens_at=past`; submit M2/M3/M4 → single finalize, `status='submitted'`, `section_scores` has both keys, exactly one `list_test_completion` row.
- (d) **Timer re-anchor**: backdate `current_module_started_at` 3h on an unanswered module, resume → `seconds_remaining` is full, not 0.
- (e) **Submit-side gate**: forge a `submit_test_module` on a not-yet-open position → `module_not_yet_open` (no answers graded).
- (f) **Cross-course**: student in metered Course A + one-click Course B → assert M2 stays locked in A's run (course-scoped resolution).
- (g) **Schedule-shrink guard**: schedule 4, submit M1-M2, attempt to re-lock M2 → `position_already_passed`; run does NOT finalize early.
- (h) **Pause × locked**: pause → advance window → resume → `seconds_remaining` = full module limit.
- (i) **Section-key gate** (before `finalize_metered_run` ships): finalize a 2-module run, assert `get_test_result` / 0088 / 0121–0123 / ScoreArcSparkline render without a missing-`math`-key error.
- (j) **Duration cap**: >24h gap mid-module → `duration_seconds <= sum(time_limit_seconds)`.

Extend `clickthrough-practice-test-edges.mjs` with `module_not_yet_open` and `ambiguous_course_enrollment` negative cases. Extend `smoke-cascade.mjs` to assert deleting a course cascades `test_module_windows` and nulls `test_runs.course_id`. Run full `smoke-all.mjs` + `npx tsc -b` before declaring done.

**Phased ship plan.**
- **Phase 1 (backend):** 0143 + 0144, smoke suite green, back-compat clickthrough green. No UI yet — `set_test_module_windows` callable but unused.
- **Phase 2 (teacher UI):** AssignTestModal schedule step + ModuleScheduleCard + roster chips/levers. Feature behind the existing test-overview surface; un-scheduled tests behave as today.
- **Phase 3 (student UI):** `locked` phase + per-module status pills + partial-progress home panel.
- **Phase 4:** dogfood with one real course (stagger a real DSAT over a week), then enable broadly.

---

## 10. Open Questions for the Product Owner

1. **Permanent partial deployment.** v1 always releases all four modules (stagger only). Do you ever want to assign *only* RW (2 modules) as a standalone, permanently-2-module test? If yes, that's a follow-up that re-opens the `section_scores` missing-key audit and a per-course release-scope review — quotable as a separate effort.
2. **Dual-enrolment conflict.** When a student is in two courses that both link the same test with *different* schedules, v1 raises `ambiguous_course_enrollment` and asks the teacher to disambiguate. Acceptable, or should one course "win" by a rule (e.g. most recently enrolled)?
3. **"Open module now" granularity.** Should the roster "Open M3 now" lever open that module for the **whole course** (edits the window) or just **one student** (per-student override — not modeled in v1; would need a `student_id`-scoped window row)?
4. **Future-date disclosure.** v1 shows the student all four modules' open dates on day 1 (needed for the locked UI). For adaptive day-by-day teaching, do you want a "hide future dates" toggle so only the next module's date is visible?
5. **Stuck-run auto-finalize.** Should a run with all windows past but the student inactive for N days auto-finalize (cron), or stay manual-only via "Finalize now"? v1 is manual-only.

---

**Files a senior engineer will touch:** `supabase/migrations/0143_test_module_windows.sql`, `0144_test_window_admin_and_roster.sql`; `viewer/src/fulltest/{FullTestApp.tsx,api.ts,types.ts,AssignTestModal.tsx,TestOverviewPage.tsx,FullTestCatalog.tsx}`; `viewer/src/fulltest/test-overview/{ModuleScheduleCard.tsx (new),RosterRow.tsx,helpers.ts,index.ts}`; `viewer/src/student/{StudentCourseView.tsx,ModuleItemRowView.tsx,StudentTestResultsPanel.tsx,studentCourseHelpers.ts}`; `viewer/scripts/{smoke-test-windows.mjs (new),smoke-all.mjs,clickthrough-practice-test-edges.mjs,smoke-cascade.mjs}`.
